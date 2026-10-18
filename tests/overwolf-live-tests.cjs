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

// Fail instead of exiting 0 if the async checks stop before the end.
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});
(async()=>{
  // EventState: enemy items withheld on request; own items reported; shop items only.
  const held=new EventState({withholdEnemyItems:true});for(const u of roster)held.apply(u);
  let snap=held.snapshot();
  test(snap.enemyItemsWithheld&&snap.enemies[0].items===''&&!snap.enemies[0].inventoryKnown&&snap.observedInventories===0,'enemy items withheld');
  test(snap.ownItems==='Extra Spirit'&&snap.ownHero==='Kelvin'&&snap.souls===2400,'own hero, souls and shop items reported (ability entries dropped)');
  const open=new EventState();for(const u of roster)open.apply(u);
  test(open.snapshot().enemies[0].items==='Rapid Rounds'&&open.snapshot().enemyItemsWithheld===false,'default (local file feed) keeps enemy items');
  test(new EventState().snapshot().ownItems===null,'own items unknown until reported');

  // Adapter with the real approval file: enemy items on (confirmed 2026-10-18), own items on, structured status.
  test(APPROVAL.enemyInventoryForLiveAdvice===true&&APPROVAL.overwolfWhitelist&&APPROVAL.gameComplianceConfirmed&&Object.isFrozen(APPROVAL),'approval: whitelisted, enemy items on');
  const gep=new FakeGep(),matches=[],statuses=[];
  const a=new OverwolfGepAdapter({gep,approval:APPROVAL,onMatch:m=>matches.push(m),onStatus:(msg,state)=>statuses.push([state,msg])});
  a.start();
  await a.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  test(statuses.some(([s])=>s==='connected')&&gep.required[0]===DEADLOCK_GEP_ID&&gep.required[1].join()==='game_info,match_info','connects and registers game_info + match_info');
  for(const u of roster)gep.emit('new-info-update',{},DEADLOCK_GEP_ID,u);
  snap=matches.at(-1);
  test(snap.enemies[0].hero==='Haze'&&snap.enemies[0].items==='Rapid Rounds'&&snap.enemies[0].inventoryKnown&&snap.observedInventories===1&&!snap.enemyItemsWithheld&&snap.ownItems==='Extra Spirit','live: enemy heroes and items, your items');
  test(snap.enemies[0].itemIds.join()==='upgrade_rapid_rounds'&&snap.ownItemIds.join()==='upgrade_improved_spirit','class names travel with the item names');
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
  test(states.at(-1).state==='waiting'&&states.at(-1).enemyItems===true,'waits for packages; reports enemy items on');
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
  const keep={hero:'',souls:0,owned:'Typed',liveMatchId:'M',enemies:[]};merge(keep,null,base({ownItems:null}));
  test(keep.owned==='Typed','same match: unreported items (null) leave your list alone');
  // A new game clears last game's items, even before the feed reports a purchase.
  const next={hero:'',souls:0,owned:'Last game item',liveMatchId:'OLD',enemies:[]};merge(next,null,base({ownItems:null}));
  test(next.owned===''&&next.liveMatchId==='M','new match ID: last game\'s items cleared');
  const nextKnown={hero:'',souls:0,owned:'Last game item',liveMatchId:'OLD',enemies:[]};merge(nextKnown,null,base());
  test(nextKnown.owned==='Extra Spirit','new match ID with items reported: the new list replaces the old one');
  const noId={hero:'',souls:0,owned:'Last game item',enemies:[]};
  merge(noId,base({matchId:'',phase:'ended'}),base({matchId:'',ownItems:null}));
  test(noId.owned==='','no match ID: play resuming after a match ended also clears items');
  // App started after a match (post-game): last game's items go with the lineup.
  const post={hero:'Ivy',souls:3146,owned:'Extended Magazine',liveMatchId:'M',enemies:[{hero:'Haze',items:''}]};
  let pr=merge(post,null,base({phase:'postgame',enemies:[]}));
  test(pr.ended&&post.owned===''&&post.souls===0&&post.enemies.length===0,'match end clears the lineup, souls and your items');
  post.owned='Planned item';pr=merge(post,base({phase:'postgame',enemies:[]}),base({phase:'postgame',enemies:[],clock:'0:02'}));
  test(!pr.changed&&post.owned==='Planned item','items typed between matches stick');

  // Hero names: Overwolf sent "VIPER" for Vyper in a real match. Resolve by name, game ID, then known renames.
  const ids=new EventState({withholdEnemyItems:true});
  ids.apply(info('roster_0',{player_name:'Me',hero_name:'Kelvin',hero_id:12,team_name:'Amber',is_local:true}));
  ids.apply(info('roster_1',{player_name:'EnemyA',hero_name:'VIPER',hero_id:58,team_name:'Sapphire'}));
  test(ids.snapshot().enemies[0].heroId===58&&ids.snapshot().ownHeroId===12,'hero IDs pass through from the roster');
  ids.apply(info('roster_1',{player_name:'EnemyA',hero_name:'VIPER',hero_id:'abc',team_name:'Sapphire'}));
  test(ids.snapshot().enemies[0].heroId===null,'invalid hero IDs are dropped');
  const ectx=vm.createContext({});for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ectx);
  const E=ectx.DeadlockEngine;
  const synced=E.createCatalog(ectx.DeadlockCatalog,require('./fixtures/catalog-snapshot.json')),starter=E.createCatalog(ectx.DeadlockCatalog,null);
  test(E.resolveHeroName(synced,'VIPER',58)==='Vyper'&&E.resolveHeroName(synced,'HAZE',13)==='Haze','synced catalog: case-insensitive name, then game ID');
  test(E.resolveHeroName(starter,'VIPER')==='Vyper'&&E.resolveHeroName(synced,'VIPER')==='Vyper'&&E.resolveHeroName(starter,'viper',58)==='Vyper','known rename works without an ID (starter catalog)');
  test(E.resolveHeroName(synced,'Haze',58)==='Haze','a matching name wins over the ID');
  test(E.resolveHeroName(synced,'Nobody',99999)==='Nobody'&&E.resolveHeroName(starter,'Nobody',58)==='Nobody'&&E.resolveHeroName(synced,'',null)==='','unknown heroes keep the name as sent');
  const heroSt={hero:'',souls:0,owned:'',enemies:[]};
  merge(heroSt,null,base({ownHero:'VIPER',ownHeroId:58,enemies:[{name:'EnemyA',hero:'VIPER',heroId:58,items:''}]}),(n,id)=>E.resolveHeroName(synced,n,id));
  test(heroSt.hero==='Vyper'&&heroSt.enemies[0].hero==='Vyper','live merge shows Vyper, not VIPER');
  // Overwolf sent "UNKNOWN" for Deadman Danny (78) and Rat King (84) in a real match.
  test(E.resolveHeroName(synced,'UNKNOWN',78)==='Deadman Danny'&&E.resolveHeroName(synced,'UNKNOWN','84')==='Rat King','UNKNOWN placeholder: named by game ID');
  test(E.resolveHeroName(synced,'UNKNOWN',null)===''&&E.resolveHeroName(starter,'UNKNOWN',78)===''&&E.resolveHeroName(synced,'Unknown',99999)==='','UNKNOWN without a usable ID: blank slot to pick, not the placeholder');
  const late={hero:'',souls:0,owned:'',liveMatchId:'M',enemies:[]},resolveSynced=(n,id)=>E.resolveHeroName(synced,n,id);
  const before=base({enemies:[{name:'EnemyA',hero:'UNKNOWN',heroId:null,items:''}]});
  merge(late,null,before,resolveSynced);
  test(late.enemies[0].hero==='','placeholder with no ID yet: blank');
  merge(late,before,base({enemies:[{name:'EnemyA',hero:'UNKNOWN',heroId:78,items:''}]}),resolveSynced);
  test(late.enemies[0].hero==='Deadman Danny','the ID arriving later (same name) fills the hero in');

  // Enemy items: joined to the right player, and matched to the catalog by class name.
  const join=new EventState();
  join.apply(info('roster_0',{player_name:'Me',hero_name:'Kelvin',team_name:'Amber',is_local:true}));
  join.apply(info('roster_1',{player_name:'EnemyA',hero_name:'Haze',team_name:'Sapphire'}));
  join.apply(info('items_7',{player_name:'EnemyA',items:[{name:'Rapid, Rounds',class_name:'upgrade_rapid_rounds'},{name:'Odd',class_name:'upgrade_bad name!'}]}));
  let js=join.snapshot().enemies[0];
  test(js.items==='Rapid Rounds, Odd'&&js.itemIds.join('|')==='upgrade_rapid_rounds|','items slot differs from roster slot: joined by unique name; commas and bad class names dropped');
  join.apply(info('items_8',{player_name:'EnemyA',items:[{name:'Healbane',class_name:'upgrade_healbane'}]}));
  js=join.snapshot().enemies[0];
  test(js.items===''&&!js.inventoryKnown,'two inventories with the same name: no guess');
  test(E.resolveFeedItems(synced,'Old Name, rapid rounds',['upgrade_magic_burst',''])==='Mystic Burst, Rapid Rounds','synced catalog: class name first, then a recognized name');
  test(E.resolveFeedItems(synced,'Mystery Item',['upgrade_not_in_catalog'])==='Mystery Item'&&E.resolveFeedItems(synced,'rapid rounds, healbane',['upgrade_magic_burst'])==='Rapid Rounds, Healbane','unknown items keep their name; misaligned class names are ignored');
  test(E.resolveFeedItems(starter,'mystic burst',['upgrade_magic_burst'])==='Mystic Burst'&&E.resolveFeedItems(synced,'',[])==='','starter catalog falls back to names');
  const itemSt={hero:'',souls:0,owned:'',enemies:[]};
  merge(itemSt,null,base({ownItems:'Old Name',ownItemIds:['upgrade_improved_spirit'],enemies:[{name:'EnemyA',hero:'Haze',items:'Old Name',itemIds:['upgrade_rapid_rounds']}]}),x=>x,(n,ids)=>E.resolveFeedItems(synced,n,ids));
  test(itemSt.owned==='Extra Spirit'&&itemSt.enemies[0].items==='Rapid Rounds','live merge resolves your items and enemy items by class name');
  const live2=E.recommend({hero:'Kelvin',souls:3000,owned:'',enemies:[{hero:'Haze',items:itemSt.enemies[0].items}]},synced),bare2=E.recommend({hero:'Kelvin',souls:3000,owned:'',enemies:[{hero:'Haze',items:''}]},synced);
  test(JSON.stringify(live2.threats)!==JSON.stringify(bare2.threats),'live enemy items change the threat read');

  // Replay of a real match log (2026-10-18): your roster entry arrives before any
  // enemy, heroes start as UNKNOWN with no ID, IDs arrive later (Deadman Danny
  // stays UNKNOWN=78), and leaving sends match_end, then menu phases.
  const rs=new EventState(),rst={hero:'Ivy',souls:3146,owned:'Extended Magazine',liveMatchId:'119591229',enemies:[]};
  let rprev=null;const step=u=>{const snapNow=rs.apply(u);merge(rst,rprev,snapNow,resolveSynced,(n,ids)=>E.resolveFeedItems(synced,n,ids));rprev=snapNow;};
  const phase=value=>step({feature:'game_info',category:'game_info',key:'phase',value});
  step({event:'match_start'});phase('Init');phase('MatchIntro');step(info('match_id','119595351'));
  step(info('roster_0',{player_name:'Me',hero_name:'SHIV',hero_id:19,team_name:'Amber',is_local:true,souls:0}));
  step(info('roster_6',{player_name:'E1',hero_name:'UNKNOWN',team_name:'Sapphire'}));
  step(info('roster_7',{player_name:'E2',hero_name:'UNKNOWN',team_name:'Sapphire'}));
  test(rst.hero==='Shiv','new match: your hero switches even though your entry arrived before any enemy');
  test(rst.owned===''&&rst.souls===0&&rst.liveMatchId==='119595351','new match: items and souls from the last match are gone');
  test(rst.enemies.length===2&&rst.enemies.every(e=>e.hero===''),'heroes still loading (UNKNOWN, no ID): blank slots');
  phase('WaitForMapToLoad');phase('PreGameWait');
  step(info('roster_6',{player_name:'E1',hero_name:'VINDICTA',hero_id:3,team_name:'Sapphire'}));
  step(info('roster_7',{player_name:'E2',hero_name:'UNKNOWN',hero_id:78,team_name:'Sapphire'}));
  test(rst.enemies.map(e=>e.hero).join()==='Vindicta,Deadman Danny','heroes fill in as IDs arrive; UNKNOWN=78 is Deadman Danny');
  phase('GameInProgress');
  step(info('roster_0',{player_name:'Me',hero_name:'SHIV',hero_id:19,team_name:'Amber',is_local:true,souls:1200}));
  step(info('items_0',{player_name:'Me',items:[{name:'Extra Spirit',class_name:'upgrade_improved_spirit'}]}));
  step(info('items_7',{player_name:'E2',items:[{name:'Rapid Rounds',class_name:'upgrade_rapid_rounds'}]}));
  test(rst.souls===1200&&rst.owned==='Extra Spirit'&&rst.enemies[1].items==='Rapid Rounds','souls, your purchases and enemy purchases flow during the match');
  step({event:'match_end'});
  test(rst.enemies.length===0&&rst.owned===''&&rst.souls===0,'leaving (match_end): lineup, items and souls cleared');
  phase('Init');phase('HeroSelection');phase('GameInProgress');
  test(rst.enemies.length===0&&rst.owned===''&&rst.souls===0,'menu phases after leaving change nothing');

  // Match boundaries: the terminal log shows boundary signals and first-seen keys,
  // never player data; closing Deadlock counts as a match end.
  const bg=new FakeGep(),bm=[],dbg=[];
  const bnd=new OverwolfGepAdapter({gep:bg,approval:APPROVAL,onMatch:m=>bm.push(m),onDebug:m=>dbg.push(m)});
  bnd.start();await bnd.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  const ev=key=>bg.emit('new-game-event',{},DEADLOCK_GEP_ID,{feature:'match_info',key,value:null});
  const up=u=>bg.emit('new-info-update',{},DEADLOCK_GEP_ID,u);
  ev('match_start');up(info('match_id','123'));
  up({feature:'game_info',category:'game_info',key:'phase',value:'GameInProgress'});up({feature:'game_info',category:'game_info',key:'phase',value:'GameInProgress'});
  for(const u of roster)up(u);
  ev('player_left');ev('player_left');ev('kill');
  up(info('team_score',{amber:'1',sapphire:'0'}));up(info('team_score',{amber:'2',sapphire:'0'}));
  test(dbg.join('|')==='match_start|match_id: 123|phase: GameInProgress|first event player_left|first info key match_info.team_score','boundary log: start, id, phase changes, and each unhandled key once');
  test(!dbg.some(m=>/EnemyA|Kelvin|Haze|Extra Spirit|amber/.test(m)),'boundary log carries no player data or values of other keys');
  const lastLive=bm.at(-1);
  test(lastLive.enemies.length===1&&lastLive.ownItems==='Extra Spirit','match data flows before the game closes');
  bg.emit('game-exit',{},DEADLOCK_GEP_ID,'Deadlock');
  test(bm.at(-1).phase==='ended'&&dbg.at(-1)==='Deadlock closed','closing Deadlock reports a match end');
  const exitSt={hero:'Ivy',souls:3000,owned:'Extended Magazine',liveMatchId:'123',enemies:[{hero:'Haze',items:''}]};
  merge(exitSt,lastLive,bm.at(-1));
  test(exitSt.owned===''&&exitSt.enemies.length===0,'closing Deadlock clears the lineup and your items');
  bnd.stop();

  // Network lock-down applies to the app's own window, not Overwolf's internal pages.
  const security=require('../desktop/security.cjs');
  let intercept;const fakeSession={setPermissionRequestHandler(){},webRequest:{onBeforeRequest:cb=>{intercept=cb;}}};
  security.registerOfflineRestrictions(fakeSession,details=>details.webContentsId===7);
  const decide=(url,id,type='xhr')=>{let r;intercept({url,webContentsId:id,resourceType:type},x=>{r=x;});return r.cancel;};
  test(decide('https://example.org/x',7)===true&&decide('https://deadlock.io/assets/game/panorama/images/heroes/x.png',7,'image')===false,'app window: network blocked except allowlisted images');
  test(decide('https://content.overwolf.com/monsdk/electron/latest/cmp/x.html',3,'mainFrame')===false&&decide('https://api.overwolf.com/verify',undefined)===false,'Overwolf runtime pages and main-process requests are not blocked');
  security.registerOfflineRestrictions(fakeSession);
  test(decide('https://content.overwolf.com/x',3)===true,'without a window check, everything stays locked (previous behavior)');

  // Wiring and packaging.
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  test(pkg.scripts['start:overwolf']==='ow-electron .'&&pkg.overwolf?.packages?.includes('gep')&&/^\d+\.\d+\.\d+$/.test(pkg.devDependencies['@overwolf/ow-electron']),'start:overwolf script, gep package declared, runtime pinned');
  test(pkg.devDependencies.electron&&pkg.scripts.start==='electron .'&&pkg.scripts['release:win'].startsWith('electron-builder'),'standard build and release pipeline unchanged');
  const main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8'),preload=fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8'),ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
  test(main.includes("source:'overwolf'")&&main.includes("source:'file'")&&main.includes('overwolf:overwolfStatus'),'live snapshots tagged by source; status exposed');
  test(!/gep|overwolf\.packages/.test(preload),'the renderer never gets the GEP API');
  test(main.includes('details.webContentsId === mainWindow.webContents.id'),'main process scopes the lock-down to the app window');
  const heroLog=main.slice(main.indexOf('function logOverwolfHeroes'),main.indexOf('const overwolfLive'));
  test(main.includes("onDebug:message=>console.log('[Counter Advisor] Overwolf event:',message)")&&fs.readFileSync(path.join(root,'desktop/overwolf-live.cjs'),'utf8').includes('approval,onMatch,onDebug,'),'boundary log reaches the terminal');
  test(main.includes('logOverwolfHeroes(snapshot)')&&heroLog.includes('e.heroId')&&!/\.name\b|player/.test(heroLog),'terminal hero log shows hero names and IDs, never player names');
  test(ui.includes('({feedName,...row})=>row'),'in-game player names are not saved to local storage');
  const loadFn=ui.slice(ui.indexOf('function loadState'),ui.indexOf('const state=loadState()'));
  test(!/saved\.(?:hero|souls|owned|liveMatchId)/.test(loadFn)&&/saved\.enemies/.test(loadFn)&&ui.includes("const defaultState=()=>({hero:'Kelvin',souls:0,owned:''"),'each launch starts your hero, souls and items fresh; the enemy lineup is restored');
  test(ui.includes('JSON.stringify({enemies:state.enemies.map(({feedName,...row})=>row)})'),'only the enemy lineup is saved');
  test(ui.includes('engine.resolveHeroName(catalog,name,id)')&&ui.includes('resolveHeroName(e.hero,e.heroId)'),'the UI resolves feed heroes with their game IDs');
  test(ui.includes('mergeFeedSnapshot(state,prev,match,resolveHeroName,resolveFeedItems)')&&ui.includes('resolveFeedItems(e.items,e.itemIds)'),'the UI resolves feed items with their class names');
  finished=true;
  console.log(`PASS: ${total} Overwolf live-mode checks (simulated API)`);
})().catch(e=>{console.error(e);process.exit(1);});
