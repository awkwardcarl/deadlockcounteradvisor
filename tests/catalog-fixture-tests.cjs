'use strict';
// Checks curated rules against a REAL compacted catalog snapshot rather than
// synthetic items. If a patch renames or removes an item, refresh the fixture
// (`npm run fixture:update`) and these checks name every rule that went stale.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(app,file),'utf8'),ctx);
const E=ctx.DeadlockEngine,base=ctx.DeadlockCatalog;
const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','catalog-snapshot.json'),'utf8'));
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const missingFrom=(list,set)=>list.filter(x=>!set.has(x));

const itemIds=new Set(snapshot.items.map(i=>i.id));
const itemNames=new Set(snapshot.items.map(i=>E.norm(i.name)));
const heroNames=new Set(snapshot.heroes.map(h=>h.name));
const byName=new Map(snapshot.items.map(i=>[E.norm(i.name),i]));
test(snapshot.items.length>=100&&snapshot.heroes.length>=20,'fixture is a complete catalog snapshot');

// Every curated id and name must exist in the real game data.
let stale=missingFrom(Object.keys(E.COUNTERS),itemIds);
test(!stale.length,'COUNTERS ids missing from catalog: '+stale.join(', '));
stale=missingFrom(Object.keys(E.OWN_AFFINITY),itemIds);
test(!stale.length,'OWN_AFFINITY ids missing from catalog: '+stale.join(', '));
stale=missingFrom([...new Set(Object.values(E.MATCHUPS).flatMap(m=>Object.keys(m.items)))],itemIds);
test(!stale.length,'MATCHUPS item ids missing from catalog: '+stale.join(', '));
stale=missingFrom(Object.keys(E.MATCHUPS),heroNames);
test(!stale.length,'MATCHUPS heroes missing from roster: '+stale.join(', '));
stale=Object.keys(base.enemyItems).filter(n=>!itemNames.has(E.norm(n)));
test(!stale.length,'curated enemyItems missing from catalog: '+stale.join(', '));
stale=missingFrom([...new Set(snapshot.items.map(i=>i.group))],new Set(Object.keys(E.ENEMY_GROUPS).concat([''])));
test(!stale.length,'shop groups with no ENEMY_GROUPS entry: '+stale.join(', '));
stale=snapshot.heroes.map(h=>h.name).filter(n=>!Object.prototype.hasOwnProperty.call(base.heroes,n));
test(!stale.length,'released heroes with no curated profile: '+stale.join(', '));
// Starter counters must survive a sync: same item, with a reviewed rule.
for(const starter of base.counterItems){
  const real=byName.get(E.norm(starter.name));
  test(real&&E.COUNTERS[real.id],`starter "${starter.name}" has a COUNTERS rule after sync`);
}

const catalog=E.createCatalog(base,snapshot);
const recommend=(enemies,extra={},options={})=>E.recommend({hero:'Kelvin',souls:3200,owned:'',enemies,...extra},catalog,options);
const threatNames=out=>out.threats.map(t=>t.name);

// The in-app demo match should be fully recognized against real data.
const demo=recommend([{hero:'Lash',items:'Mystic Burst, Improved Spirit'},{hero:'Bebop',items:'Tankbuster'},{hero:'Haze',items:'Rapid Rounds, Burst Fire'},{hero:'Infernus',items:'Healing Booster'}],{owned:'Extra Spirit, Extra Stamina'});
test(demo.unknown.length===0,'demo match fully recognized: '+demo.unknown.join('; '));
test(demo.knownItems===demo.listedItems&&demo.quality==='Hero + recognized item evidence','demo evidence quality');
test(demo.quickBuys.length===3&&demo.results.length>=6,'demo produces quick buys and ranked results');
test(demo.results.every(r=>itemIds.has(r.id)&&byName.get(E.norm(r.name))?.id===r.id),'every result is a real item with its real name');
test(!demo.results.some(r=>r.name==='Extra Stamina'),'owned items excluded with real names');

// Curated enemy tags override misleading shop groups.
let out=recommend([{hero:'Haze',items:'Silencer'}]);
test(threatNames(out).includes('control')&&!threatNames(out).includes('range'),'Silencer reads as a disable, not weapon range');
out=recommend([{hero:'Yamato',items:'Phantom Strike'}]);
test(threatNames(out).includes('control'),'Phantom Strike adds disable pressure despite its defensive shop group');
out=recommend([{hero:'Haze',items:'Glass Cannon'}]);
test(!threatNames(out).includes('slow'),'Glass Cannon is not treated as a slow');

// Recommendations land on the intended real items.
out=recommend([{hero:'Dynamo',items:'Knockdown, Cursed Relic'},{hero:'Lash',items:'Silence Wave'}],{souls:1600});
test(out.results.some(r=>r.name==='Reactive Barrier'),'Reactive Barrier recommended against disables after sync');
test(out.quickBuys.some(r=>['Reactive Barrier','Debuff Reducer'].includes(r.name)),'affordable anti-disable item in quick buys');
out=recommend([{hero:'Haze',items:'Rapid Rounds'}]);
const haze=out.results.find(r=>r.name==='Weapon Shielding');
test(haze&&haze.heroNotes.some(n=>n.startsWith('Haze:')),'Haze matchup points at Weapon Shielding');
out=recommend([{hero:'Seven',items:'Boundless Spirit'}],{souls:6400});
test(out.results.some(r=>r.name==='Spirit Resilience')&&!out.results.some(r=>r.name==='Spirit Resilience'&&r.tags.includes('control')),'Spirit Resilience counters spirit, not disables');
console.log(`PASS: ${total} real catalog snapshot (build ${snapshot.build}) checks`);
