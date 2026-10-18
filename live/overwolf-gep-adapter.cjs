'use strict';
/**
 * Deadlock Counter Advisor — Overwolf GEP adapter.
 * Wired to the app only through desktop/overwolf-live.cjs, which passes the
 * approval switches from desktop/live-approval.cjs. Enemy item purchases are
 * withheld unless enemyInventoryForLiveAdvice is approved.
 * No network, process-memory reads, hooks, injection or input automation.
 * The Overwolf GEP runtime itself is an external dependency.
 *
 * Official API: app.overwolf.packages.gep, game-detected -> event.enable(),
 * setRequiredFeatures(gameId, ['game_info','match_info']),
 * new-info-update(event, gameId, data), new-game-event(event, gameId, data).
 */
const {EventState} = require('./event-state.cjs');
const DEADLOCK_GEP_ID = 24482;
const FEATURES = Object.freeze(['game_info', 'match_info']);
// Right after detection GEP may not accept features yet; retry for ~30 s.
const REGISTER_ATTEMPTS = 10;
const REGISTER_RETRY_MS = 3000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Feature names only (no game data), shortened for a one-line status.
const describeFeatures = list => Array.isArray(list) ? (list.map(String).join(', ').slice(0,160) || 'none') : 'unknown (' + typeof list + ')';
function validUpdate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.info && typeof raw.info === 'object') return raw;
  const feature=String(raw.feature || raw.category || '');
  const key=String(raw.key || '');
  if (feature==='game_info' && key==='phase') return {feature,key,data:raw.data ?? raw.value};
  if (feature!=='match_info') return null;
  if (key==='match_id'||key==='match_clock'||/^roster_(?:[0-9]|1[01])$/.test(key)||/^items_(?:[0-9]|1[01])$/.test(key)) {
    return {feature,key,data:raw.data ?? raw.value};
  }
  return null;
}
function removeUnapprovedInventory(update, permitEnemyInventory) {
  if (permitEnemyInventory) return update;
  if (update.key && /^items_\d+$/.test(update.key)) return null;
  if (!update.info) return update;
  const safe = {...update,info:{...update.info}};
  if (safe.info.match_info && typeof safe.info.match_info==='object') {
    safe.info.match_info=Object.fromEntries(Object.entries(safe.info.match_info).filter(([k])=>!/^items_\d+$/.test(k)));
  }
  return safe;
}
class OverwolfGepAdapter {
  constructor({gep, approval, onMatch=()=>{}, onStatus=()=>{}, retryMs=REGISTER_RETRY_MS, attempts=REGISTER_ATTEMPTS}={}) {
    if (!gep || typeof gep.on!=='function' || typeof gep.getFeatures!=='function' || typeof gep.setRequiredFeatures!=='function') {
      throw new TypeError('A supported Overwolf GEP API object is required.');
    }
    this.gep=gep;
    this.approval=approval||{};
    this.onMatch=onMatch;
    this.onStatus=onStatus;
    // Enemy purchases are withheld unless explicitly approved; your own items
    // and the roster still flow (see desktop/live-approval.cjs).
    this.state=new EventState({withholdEnemyItems:this.approval.enemyInventoryForLiveAdvice!==true});
    this.retryMs=retryMs;this.attempts=attempts;
    this.active=false;this.gameId=null;this.handlers=[];this.session=0;
  }
  start() {
    if (!this.approval.overwolfWhitelist || !this.approval.gameComplianceConfirmed) {
      throw new Error('Integration stays disabled until Overwolf whitelisting AND publisher/game compliance are confirmed.');
    }
    if(this.active) return;
    this.active=true;
    const bind=(name,fn)=>{this.gep.on(name,fn);this.handlers.push([name,fn]);};
    bind('game-detected',(e,id,name)=>this.detected(e,id,name));
    bind('game-exit',(_e,id)=>{if(id===DEADLOCK_GEP_ID){this.gameId=null;this.state.clear();this.onMatch(this.state.snapshot());this.onStatus('Deadlock closed. Waiting for the next game.','ready');}});
    bind('elevated-privileges-required',(_e,id)=>{if(id===DEADLOCK_GEP_ID)this.onStatus('Deadlock is running as administrator, so live data needs this app to run as administrator too.','error');});
    bind('new-info-update',(_e,id,data)=>this.consume(id,data));
    bind('new-game-event',(_e,id,data)=>{
      if(id!==DEADLOCK_GEP_ID || !data || typeof data!=='object')return;
      const key=String(data.name||data.key||'');
      if(key==='match_start'||key==='match_end')this.consume(id,{event:key});
      else if(key==='match_clock')this.consume(id,{feature:'match_info',key,value:data.value});
    });
    bind('error',(_e,id,error)=>{if(id===DEADLOCK_GEP_ID)this.onStatus('Game events error: '+String(error).slice(0,160),'error');});
  }
  async detected(event,id,name) {
    if(!this.active || id!==DEADLOCK_GEP_ID)return;
    // Enable synchronously, before any await, as Overwolf's ow-electron sample
    // does: event.enable() belongs inside the game-detected handler itself.
    event.enable();
    this.gameId=id;
    this.state.clear();
    const session=++this.session;
    // A newer detection, game exit or stop() ends this attempt.
    const current=()=>this.active&&this.gameId===id&&this.session===session;
    // Register straight after enable(), as Overwolf's sample does. Do not gate
    // on getFeatures(): its list can be incomplete right after detection.
    let lastError=null;
    for(let attempt=1;attempt<=this.attempts;attempt++){
      try{
        await this.gep.setRequiredFeatures(id,[...FEATURES]);
        if(!current())return;
        this.onStatus('Connected to Deadlock live data.','connected');
        await this.readCurrentInfo(id,current);
        return;
      }catch(e){
        if(!current())return;
        lastError=e;
        if(attempt===1)this.onStatus('Deadlock detected. Connecting to match data...','waiting');
      }
      if(attempt<this.attempts){await wait(this.retryMs);if(!current())return;}
    }
    let features;
    try{features=await this.gep.getFeatures(id);}catch(_){features=null;}
    if(!current())return;
    this.onStatus('Could not register for Deadlock match data: '+String(lastError?.message||lastError).slice(0,120)+'. Overwolf reports these features: '+describeFeatures(features)+'.','error');
  }
  async readCurrentInfo(id,current) {
    // Catch up on a match already in progress. Live updates still flow if this fails.
    if(typeof this.gep.getInfo!=='function')return;
    try{
      const info=await this.gep.getInfo(id);
      // The result's shape isn't documented: accept {info}, {res} or the feature map itself.
      const map=info?.info||info?.res||info;
      if(current()&&map&&typeof map==='object'&&!Array.isArray(map))this.consume(id,{info:map});
    }catch(_){}
  }
  consume(id,raw) {
    if(!this.active||this.gameId!==id) return;
    let update=validUpdate(raw);
    if(raw?.event==='match_start'||raw?.event==='match_end')update=raw;
    if(!update)return;
    const next=this.state.apply(update);
    // EventState fails closed when local team cannot be identified.
    this.onMatch(next);
  }
  stop(){
    if(!this.active)return;
    this.active=false;
    for(const [name,fn] of this.handlers)this.gep.off?.(name,fn);
    this.handlers=[];this.gameId=null;this.state.clear();
    this.onStatus('Live data stopped.','stopped');
  }
}
module.exports={OverwolfGepAdapter,DEADLOCK_GEP_ID,FEATURES,validUpdate,removeUnapprovedInventory,describeFeatures};
