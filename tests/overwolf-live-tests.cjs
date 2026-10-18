'use strict';
// Overwolf live mode: package lifecycle, approval gating, own items, and wiring.
// Uses fakes shaped like @overwolf/ow-electron-packages-types; not proof of SDK behavior.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {EventState}=require('../live/event-state.cjs');
const {OverwolfGepAdapter,DEADLOCK_GEP_ID}=require('../live/overwolf-gep-adapter.cjs');
const {createOverwolfLive}=require('../desktop/overwolf-live.cjs');
const APPROVAL=require('../desktop/live-approval.cjs');
const root=path.resolve(__dirname,'..');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const info=(key,data)=>({feature:'match_info',category:'match_info',key,value:JSON.stringify(data)});
class FakeGep extends EventEmitter{
  constructor(){super();this.features=['gep_internal','game_info','match_info'];this.required=null;}
  async getFeatures(){return this.features;}
  async setRequiredFeatures(id,f){this.required=[id,f];}
  async getInfo(){return {};}
}
const roster=[
  info('roster_0',{player_name:'Me',hero_name:'Kelvin',team_name:'Amber',team_id:2,is_local:true,souls:2400}),
  info('roster_1',{player_name:'EnemyA',hero_name:'Haze',team_name:'Sapphire',team_id:3,is_local:false}),
  info('items_0',{player_name:'Me',items:[{name:'Extra Spirit',class_name:'upgrade_improved_spirit'},{name:'Frost Grenade',class_name:'ability_ice_grenade'}]}),
  info('items_1',{player_name:'EnemyA',items:[{name:'Rapid Rounds',class_name:'upgrade_rapid_rounds'}]})
];

(async()=>{
  // EventState: enemy items withheld on request; own items reported; shop items only.
  const held=new EventState({withholdEnemyItems:true});for(const u of roster)held.apply(u);
  let snap=held.snapshot();
  test(snap.enemyItemsWithheld&&snap.enemies[0].items===''&&!snap.enemies[0].inventoryKnown&&snap.observedInventories===0,'enemy items withheld');
  test(snap.ownItems==='Extra Spirit'&&snap.ownHero==='Kelvin'&&snap.souls===2400,'own hero, souls and shop items reported (ability entries dropped)');
  const open=new EventState();for(const u of roster)open.apply(u);
  test(open.snapshot().enemies[0].items==='Rapid Rounds'&&open.snapshot().enemyItemsWithheld===false,'default (local file feed) keeps enemy items');
  test(new EventState().snapshot().ownItems===null,'own items unknown until reported');

  // Adapter with the real approval file: enemy items off, own items on, structured status.
  test(APPROVAL.enemyInventoryForLiveAdvice===false&&APPROVAL.overwolfWhitelist&&APPROVAL.gameComplianceConfirmed&&Object.isFrozen(APPROVAL),'approval: whitelisted, enemy items off by default');
  const gep=new FakeGep(),matches=[],statuses=[];
  const a=new OverwolfGepAdapter({gep,approval:APPROVAL,onMatch:m=>matches.push(m),onStatus:(msg,state)=>statuses.push([state,msg])});
  a.start();
  await a.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  test(statuses.some(([s])=>s==='connected')&&gep.required[0]===DEADLOCK_GEP_ID&&gep.required[1].join()==='game_info,match_info','connects and registers game_info + match_info');
  for(const u of roster)gep.emit('new-info-update',{},DEADLOCK_GEP_ID,u);
  snap=matches.at(-1);
  test(snap.enemies[0].hero==='Haze'&&snap.enemies[0].items===''&&snap.ownItems==='Extra Spirit','live: enemy heroes yes, enemy items no, your items yes');
  gep.emit('new-game-event',{},DEADLOCK_GEP_ID,{feature:'match_info',key:'match_clock',value:'07:30'});
  test(matches.at(-1).clock==='07:30','match clock events update the snapshot');
  gep.emit('elevated-privileges-required',{},DEADLOCK_GEP_ID,'Deadlock',1234);
  test(statuses.at(-1)[0]==='error'&&/administrator/.test(statuses.at(-1)[1]),'administrator-mode game is reported');
  gep.emit('new-info-update',{},999,info('roster_2',{player_name:'X',hero_name:'Lash',team_name:'Sapphire'}));
  test(matches.at(-1).enemies.length===1,'events from other games are ignored');
  a.stop();
  test(gep.listenerCount('new-info-update')===0&&statuses.at(-1)[0]==='stopped','stop removes listeners');

  // createOverwolfLive: standard build vs Overwolf runtime lifecycle.
  const seen=[];
  createOverwolfLive({app:{},onStatus:s=>seen.push(s)});
  test(seen.at(-1).state==='unavailable','standard Electron build reports live data unavailable');
  const packages=new EventEmitter();packages.gep=new FakeGep();
  const states=[],live=[];
  const ctl=createOverwolfLive({app:{overwolf:{packages}},onStatus:s=>states.push(s),onMatch:m=>live.push(m)});
  test(states.at(-1).state==='waiting'&&states.at(-1).enemyItems===false,'waits for packages; reports enemy items off');
  packages.emit('ready',{},'overlay','1.0');
  test(!ctl.active(),'other packages are ignored');
  packages.emit('ready',{},'gep','300.1');
  test(ctl.active()&&states.at(-1).state==='ready'&&/300\.1/.test(states.at(-1).message),'gep ready starts the adapter');
  const listeners=packages.gep.listenerCount('new-info-update');
  packages.emit('ready',{},'gep','300.2');
  test(packages.gep.listenerCount('new-info-update')===listeners,'a second ready rebuilds without duplicate listeners');
  packages.emit('failed-to-initialize',{},'gep');
  test(states.at(-1).state==='error'&&/OW_DEV_KEY/.test(states.at(-1).message),'failed package load explains the dev key / signing requirement');
  packages.emit('crashed',{},true);
  test(states.at(-1).state==='waiting','package crash reports reconnecting');
  ctl.stop();
  test(!ctl.active()&&packages.gep.listenerCount('new-info-update')===0,'stop detaches from GEP');
  test(createOverwolfLive({app:{overwolf:{packages:new EventEmitter()}},approval:{},onStatus:s=>states.push(s)})&&true,'missing approval does not throw at setup');
  const unapproved=new EventEmitter();unapproved.gep=new FakeGep();const errs=[];
  createOverwolfLive({app:{overwolf:{packages:unapproved}},approval:{overwolfWhitelist:false},onStatus:s=>errs.push(s)});
  unapproved.emit('ready',{},'gep','1');
  test(errs.at(-1).state==='error'&&unapproved.gep.listenerCount('game-detected')===0,'without approval the adapter refuses to start');

  // Live merge: your items follow the same keep-your-edits rule.
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'js/live-merge.js'),'utf8'),ctx);
  const merge=ctx.DeadlockLiveMerge.mergeFeedSnapshot;
  const base=(extra={})=>({matchId:'M',phase:'in-progress',ownHero:'Kelvin',souls:100,enemies:[{name:'EnemyA',hero:'Haze',items:''}],ownItems:'Extra Spirit',...extra});
  const st={hero:'',souls:0,owned:'',enemies:[]};let prev=null;
  merge(st,prev,base());prev=base();
  test(st.owned==='Extra Spirit','your items fill in from the feed');
  st.owned='Extra Spirit, Healbane';merge(st,prev,base({clock:'1:00'}));prev=base({clock:'1:00'});
  test(st.owned==='Extra Spirit, Healbane','manual owned edit kept while the feed is unchanged');
  merge(st,prev,base({ownItems:'Extra Spirit, Mystic Burst'}));
  test(st.owned==='Extra Spirit, Mystic Burst','a new purchase replaces it');
  const keep={hero:'',souls:0,owned:'Typed',enemies:[]};merge(keep,null,base({ownItems:null}));
  test(keep.owned==='Typed','unreported items (null) leave your list alone');

  // Wiring and packaging.
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  test(pkg.scripts['start:overwolf']==='ow-electron .'&&pkg.overwolf?.packages?.includes('gep')&&/^\d+\.\d+\.\d+$/.test(pkg.devDependencies['@overwolf/ow-electron']),'start:overwolf script, gep package declared, runtime pinned');
  test(pkg.devDependencies.electron&&pkg.scripts.start==='electron .'&&pkg.scripts['release:win'].startsWith('electron-builder'),'standard build and release pipeline unchanged');
  const main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8'),preload=fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8'),ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
  test(main.includes("source:'overwolf'")&&main.includes("source:'file'")&&main.includes('overwolf:overwolfStatus'),'live snapshots tagged by source; status exposed');
  test(!/gep|overwolf\.packages/.test(preload),'the renderer never gets the GEP API');
  test(ui.includes('({feedName,...row})=>row'),'in-game player names are not saved to local storage');
  console.log(`PASS: ${total} Overwolf live-mode checks (simulated API)`);
})().catch(e=>{console.error(e);process.exit(1);});
