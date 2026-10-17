'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const basePath=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(basePath,x),'utf8');
const context=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),context);
const E=context.DeadlockEngine;
let tests=0;
const ok=(value,msg)=>{assert.ok(value,msg);tests++;};
function approxEqual(a,b,m){assert.equal(a,b,m);tests++;}
const starter=E.createCatalog(context.DeadlockCatalog,null);
const enemies=[{hero:'Lash',items:'Mystic Burst, Improved Spirit'},{hero:'Haze',items:'Rapid Rounds'}];
let result=E.recommend({hero:'Kelvin',souls:1600,owned:'',enemies},starter);
ok(result.results.length>=2,'starter recommendation candidates');
ok(result.threats.length>0,'starter threats');
let rb=result.results.find(r=>r.name==='Reactive Barrier');
ok(rb&&rb.affordable,'Reactive Barrier affordability');
ok(!E.recommend({hero:'Kelvin',souls:1600,owned:'Reactive Barrier',enemies},starter).results.some(r=>r.name==='Reactive Barrier'),'owned item excluded');
ok(!E.recommend({hero:'Kelvin',souls:1600,enemies:[]},starter).results.length,'no opponent empty');
ok(E.recommend({hero:'Kelvin',souls:1600,enemies:[{hero:'Mystery',items:'No such item'}]},starter).unknown.length>0,'unknowns explicitly warned');
ok(Object.keys(E.COUNTERS).length>=25,'curated counter rules expanded');ok(Object.keys(E.MATCHUPS).length>=12,'specific hero matchup reviews');ok(Object.keys(E.OWN_AFFINITY).length>=8,'player hero archetype purchase fit');
ok(E.norm('Mo & Krill')==='mokrill','normalization stable');
const {compactSnapshot,imagePath}=require('../js/snapshot.cjs');
const validItems=Array.from({length:156},(_,i)=>({id:'upgrade_test_'+i,displayName:{english:'Test Item '+i},shop:{isPublicShopItem:true,category:i%3===0?'weapon':i%3===1?'vitality':'spirit',cost:i%4===0?800:i%4===1?1600:i%4===2?3200:6400,tier:i%4+1,groupId:'EHealing',componentIds:[],upgradeIds:[]},activation:{isActive:false},assets:{shopIcon:{publicPath:'/assets/game/panorama/images/items/vitality/test_psd.png'}}}));
validItems[0]={...validItems[0],id:'upgrade_tech_purge',displayName:{english:'Spirit Resilience'}};
validItems[1]={...validItems[1],id:'upgrade_weapon_shielding',displayName:{english:'Weapon Shielding'}};
validItems[2]={...validItems[2],id:'upgrade_healbane',displayName:{english:'Healbane'}};
const validHeroes=Array.from({length:41},(_,i)=>({heroId:i+1,slug:'hero-'+i,displayName:{english:i===0?'Kelvin':i===1?'Haze':'Hero '+i},status:'released',playerSelectable:true,disabled:false,assets:{card:{publicPath:'/assets/game/panorama/images/heroes/kelvin_card_psd.png'}}}));
const snapshot=compactSnapshot({items:validItems,source:{generatedAt:'2026-10-15T19:15:18Z',buildId:'client-6785'}},{heroes:validHeroes});
approxEqual(snapshot.items.length,156,'complete public item catalog');
approxEqual(snapshot.heroes.length,41,'released selectable roster');
ok(snapshot.heroes[0].portrait.includes('kelvin'),'hero portrait saved');
ok(snapshot.items[1].cost===1600,'shop cost from source');
ok(snapshot.items[2].category==='spirit','shop category from source');
ok(imagePath({publicPath:'https://evil.example/x'})==='', 'asset paths must be relative safe paths');
ok(imagePath({publicPath:'/assets/game/panorama/images/heroes/haze.png'})!=='','valid image path retained');
validHeroes.push({heroId:100,displayName:{english:'Unreleased'},status:'development',playerSelectable:false});
const v2=compactSnapshot({items:validItems},{heroes:validHeroes});
ok(!v2.heroes.find(h=>h.name==='Unreleased'),'development roster excluded');
assert.throws(()=>compactSnapshot({items:[]},{heroes:[]}));tests++;
const live=E.createCatalog(context.DeadlockCatalog,snapshot);
ok(live.complete,'complete flag');
approxEqual(live.items.length,156,'all items available in runtime');
ok(live.heroes.find(h=>h.name==='Haze').portrait.startsWith('https://deadlock.io/'),'image url allowlisted');
result=E.recommend({hero:'Kelvin',souls:1600,owned:'',enemies:[{hero:'Haze',items:'Test Item 9'}]},live);
ok(result.results.some(r=>r.id==='upgrade_weapon_shielding'),'bullet protection candidate available');
ok(result.results.every(r=>Number.isFinite(r.cost)&&r.cost>0),'every recommendation sourced current price');
ok(result.results.every(r=>['category rule','matchup + category'].includes(r.confidence)),'heuristic confidence explicit');
ok(result.results.some(r=>r.sources.some(s=>s.includes('Haze'))),'reason evidence provided');
ok(!E.recommend({hero:'Kelvin',souls:100,enemies:[{hero:'Haze'}]},live,{affordableOnly:true}).results.length,'affordability filter');
ok(E.recommend({hero:'Kelvin',souls:100,enemies:[{hero:'Haze'}]},live,{sort:'affordable'}).results.every(r=>r.missing>=0),'sort preserves data');
const categories=E.recommend({hero:'Kelvin',souls:1000,enemies:[{hero:'Haze'}]},live,{category:'vitality'}).results;
ok(categories.every(r=>r.category==='vitality'),'category filter');
const {replay}=require('../live/overwolf-normalizer.cjs');
const event=(key,data)=>({feature:'match_info',key,data:JSON.stringify(data)});
const replayData=[event('roster_0',{player_name:'Me',hero_name:'KELVIN',team_name:'Amber',is_local:true}),event('roster_1',{player_name:'Them',hero_name:'HAZE',team_name:'Sapphire',is_local:false}),event('items_1',{player_name:'Them',items:[{name:'Rapid Rounds'}]})];
const replayed=replay(replayData);ok(replayed.enemies.length===1,'replay opponent extracted');ok(replayed.enemies[0].items==='Rapid Rounds','replay purchases extracted');ok(!replay(replayData.slice(1)).enemies.length,'fail closed if local team unknown');ok(!replay([event('roster_0',{player_name:'Me',hero_name:'KELVIN',team_name:'Amber',is_local:true})]).enemies.length,'no fabricated opponents');
assert.throws(()=>replay(Array(301).fill({})));tests++;
const security=require('../desktop/security.cjs');
ok(security.permittedImageURL('https://deadlock.io/assets/game/panorama/images/heroes/kelvin.png'),'provider imagery permitted');
for(const url of ['http://deadlock.io/assets/game/panorama/images/heroes/x.png','https://deadlock.io/api/v1/items.json','https://evil.example/assets/game/panorama/images/x.png','http://127.0.0.1:3000/test','https://deadlock.io/assets/game/../../admin.png']) {ok(!security.permittedImageURL(url),'external network not image-approved '+url);}
let interceptor,permission;
security.registerOfflineRestrictions({setPermissionRequestHandler:cb=>{permission=cb;},webRequest:{onBeforeRequest:cb=>{interceptor=cb;}}});
for(const [url,type,blocked] of [
 ['file:///C:/application/index.html','mainFrame',false],
 ['https://example.org/','mainFrame',true],
 ['http://localhost:3030/','xmlhttprequest',true],
 ['https://deadlock.io/api/v1/items.json','xmlhttprequest',true],
 ['https://deadlock.io/assets/game/panorama/images/heroes/x.png','image',false],
 ['https://deadlock.io/assets/game/panorama/images/heroes/x.png','script',true],
 ['wss://example.org/socket','websocket',true]]){
 let called=0,result;interceptor({url,resourceType:type},r=>{called++;result=r;});ok(called===1&&result.cancel===blocked,'network callback '+url+' '+type);
}
let permissionCalls=0;permission(null,'camera',allowed=>{permissionCalls++;ok(allowed===false,'no media permissions');});ok(permissionCalls===1,'permissions callback invoked');
const pkg=JSON.parse(read('package.json'));
ok(pkg.version==='0.7.1','version correct');
ok(pkg.scripts['build:win'].includes('electron-packager'),'working Windows folder builder retained');
ok(fs.existsSync(path.join(basePath,'Build-EXE-Folder.cmd')),'folder builder exists');
ok(read('desktop/main.cjs').includes('sandbox: true')&&read('desktop/main.cjs').includes('contextIsolation: true'),'secure renderer');
ok(!read('desktop/main.cjs').includes('ReadProcessMemory')&&!read('desktop/main.cjs').includes('overwolf.games.events'),'no memory or proprietary game event integration');
ok(!fs.existsSync(path.join(basePath,'manifest.json')),'no injected overlay manifest');
ok(read('index.html').includes("connect-src 'none'"),'no browser data requests');
ok(read('desktop/data-service.cjs').includes('const ROUTES = Object.freeze('),'only fixed public sync routes');
ok(read('desktop/preload.cjs').includes('syncCatalog'),'opt-in sync control wired');
ok(read('index.html').includes('id="sync"')&&read('index.html').includes('id="importReplay"'),'catalog and replay buttons');
ok(read('index.html').includes('id="heroPortrait"')&&read('js/ui.js').includes('class="itemIcon'),'hero portrait item icons');
// PNG and Windows ICO packaging regression.
const icon=fs.readFileSync(path.join(basePath,'assets/icon.ico'));const n=icon.readUInt16LE(4);ok(n>=2,'multires icon');
let has256=false;for(let i=0;i<n;i++){const pos=6+16*i;if((icon[pos]||256)===256&&(icon[pos+1]||256)===256)has256=true;}ok(has256,'256px icon retained');

// v0.5: explicit Windows process-name-only checks; zero game memory access.
const processDetection=require('../live/process-detection.cjs');
const tasklist='"System Idle Process","0","Services","0","8 K"\r\n"deadlock.exe","4711","Console","1","125,000 K"\r\n';
ok(processDetection.hasDeadlock(tasklist),'Deadlock process recognized from tasklist CSV');
ok(processDetection.hasDeadlock('"project8.exe","1000","Console","1","200 K"'),'legacy executable name recognized');
ok(!processDetection.hasDeadlock('"notdeadlock.exe","1000","Console","1","200 K"'),'avoid substring false positive');
ok(!processDetection.hasDeadlock('INFO: No tasks are running which match the specified criteria.'),'tasklist empty response');
ok(!processDetection.hasDeadlock('"steam.exe","421","Console","1","10,000 K"'),'Steam alone not treated as Deadlock');
ok(read('live/process-detection.cjs').includes('tasklist.exe'),'tasklist used for process-name detection');
ok(!read('live/process-detection.cjs').includes('ReadProcessMemory'),'no game process memory access');
// Live event parsing: failure closed if local side unavailable or player names mismatch.
const {EventState}=require('../live/event-state.cjs');
let es=new EventState();
es.apply(event('roster_1',{player_name:'EnemyA',team_name:'Sapphire',hero_name:'HAZE'}));
ok(es.snapshot().enemies.length===0,'no enemy roster if local player not observed');
es.apply(event('roster_0',{player_name:'Me',team_name:'Amber',hero_name:'KELVIN',is_local:true,souls:2400}));
ok(es.snapshot().enemies.length===1,'enemy recognized after local team established');
ok(es.snapshot().souls===2400&&es.snapshot().ownHero==='KELVIN','self hero and souls extracted');
es.apply(event('items_1',{player_name:'EnemyA',items:[{name:'Rapid Rounds'},{name:'Burst Fire'}]}));
ok(es.snapshot().enemies[0].items==='Rapid Rounds, Burst Fire','enemy inventory updates live');
es.apply(event('items_1',{player_name:'OtherPerson',items:[{name:'Mystic Burst'}]}));
ok(es.snapshot().enemies[0].items==='','cross-name inventory never misassigned');
es.apply(event('items_1',{player_name:'EnemyA',items:[]}));
ok(es.snapshot().observedInventories===1&&es.snapshot().enemies[0].items==='','empty observed inventory distinguished from missing inventory');
es.apply({info:{match_info:{roster_2:JSON.stringify({player_name:'EnemyB',team_name:'Sapphire',hero_name:'LASH'})}}});
ok(es.snapshot().enemies.length===2,'nested GEP info object handled');
es.apply({feature:'match_info',key:'match_id',value:'DEMO-2'});
ok(es.snapshot().enemies.length===0,'new match id clears previous inventory');
es.apply({feature:'match_info',key:'match_end',value:null});
ok(es.snapshot().phase==='ended','match end clears prior state');
es.apply(event('roster_0',{player_name:'Me',hero_name:'KELVIN',is_local:true}));
es.apply(event('roster_1',{player_name:'Them',team_name:'Sapphire',hero_name:'LASH'}));
ok(es.snapshot().enemies.length===0,'unknown local team fails closed');
// Local file consumption only: appends should update recommendations without network access.
const os=require('node:os');
const {LocalFeed}=require('../live/local-feed.cjs');
const tmpdir=fs.mkdtempSync(path.join(os.tmpdir(),'dca-live-'));
try{
  const temp=path.join(tmpdir,'feed.jsonl');
  const sample=read('live/EXAMPLE-LIVE-FEED.jsonl');
  fs.writeFileSync(temp,sample);
  const statuses=[],failures=[];
  const lf=new LocalFeed({onState:s=>statuses.push(s),onError:e=>failures.push(e)});
  lf.start(temp);
  ok(statuses.length>=6,'initial live event sample parsed');
  const last=statuses.at(-1);
  ok(last.enemies.length===2&&last.observedInventories===2,'two hero inventories observed in demo');
  ok(last.ownHero==='KELVIN','sample local hero');
  fs.appendFileSync(temp,JSON.stringify(event('items_1',{player_name:'EnemyA',items:[{name:'Rapid Rounds'},{name:'Bullet Resist Shredder'}]}))+'\n');
  lf.poll();
  ok(statuses.at(-1).enemies.find(e=>e.name==='EnemyA').items.includes('Bullet Resist Shredder'),'appended purchases replace prior items');
  fs.appendFileSync(temp,'{BROKEN JSON}\n');lf.poll();
  ok(failures.length===1&&lf.file===null,'invalid live feed stops instead of continuing');
  lf.stop();
}finally{fs.rmSync(tmpdir,{recursive:true,force:true});}
ok(read('desktop/main.cjs').includes('live:feed:select'),'explicit event-file chooser');
ok(read('desktop/main.cjs').includes('live:monitor'),'opt-in process monitoring');
ok(read('desktop/preload.cjs').includes('onLiveMatch'),'renderer receives processed snapshots');
ok(read('index.html').includes('id="toggleGameDetection"')&&read('index.html').includes('id="selectEventFeed"'),'live status buttons are present');
ok(!read('desktop/main.cjs').includes('createServer(')&&!read('desktop/main.cjs').includes('desktopCapturer'),'no event bridge server or screen capture');
console.log('PASS:',tests,'catalog, matchup, live process detection, read-only file events, safety, UI and Windows packaging checks');
