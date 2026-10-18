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
  constructor({gep, approval, onMatch=()=>{}, onStatus=()=>{}}={}) {
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
    this.active=false;this.gameId=null;this.handlers=[];
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
    // Check capability before registering; do not silently assume match_info exists.
    try{
      const available=await this.gep.getFeatures(id);
      if(!this.active)return;
      if(!Array.isArray(available)||!available.includes('match_info')) {this.gameId=null;this.onStatus('Deadlock match data (match_info) is not available right now.','error');return;}
      await this.gep.setRequiredFeatures(id,FEATURES.filter(x=>available.includes(x)));
      if(!this.active)return;
      this.onStatus('Connected to Deadlock live data.','connected');
      if(typeof this.gep.getInfo==='function'){
        const info=await this.gep.getInfo(id);
        if(this.active)this.consume(id,info);
      }
    }catch(e){this.gameId=null;this.onStatus('Could not start Deadlock live data: '+String(e.message).slice(0,150),'error');}
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
module.exports={OverwolfGepAdapter,DEADLOCK_GEP_ID,FEATURES,validUpdate,removeUnapprovedInventory};
