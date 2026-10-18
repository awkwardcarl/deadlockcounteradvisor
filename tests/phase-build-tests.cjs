'use strict';
// Recommendations that account for the match phase, your build and enemy
// purchases; plus naming heroes newer than the synced catalog (Violet).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine,base=ctx.DeadlockCatalog;
const snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(base,snapshot),starter=E.createCatalog(base,null);
const itemByName=new Map(catalog.items.map(i=>[i.name,i]));
const enemies=[{hero:'Vindicta',items:'Headshot Booster, Rapid Rounds, Burst Fire'},{hero:'Yamato',items:'Extra Spirit, Spirit Strike, Kinetic Dash'},{hero:'Abrams',items:'Bullet Lifesteal, Enduring Speed'},{hero:'Viscous',items:'Mystic Burst, Improved Spirit, Mystic Vulnerability'},{hero:'Paige',items:'Healbane, Slowing Hex'}];
const rec=(state,opts={})=>E.recommend({hero:'Shiv',souls:4000,owned:'',enemies,...state},catalog,opts);

// Match phase.
test(Math.abs(E.clockMinutes('03:10')-3.1667)<.01&&Math.abs(E.clockMinutes('1:02:03')-62.05)<.01&&E.clockMinutes(600)===10&&E.clockMinutes('soon')===null&&E.clockMinutes('')===null,'clock parses mm:ss, h:mm:ss and seconds; anything else is unknown');
test(['09:59','10:00','24:59','25:00'].map(c=>E.matchPhase(c,0).key).join()==='laning,mid,mid,late','clock phases: laning to 10:00, mid game to 25:00, late game after');
test([8999,9000,27999,28000].map(n=>E.matchPhase('',n).key).join()==='laning,mid,mid,late'&&E.matchPhase('',5000).source==='souls'&&E.matchPhase('12:00',0).source==='clock','without a clock the phase comes from your net worth');
const avgCost=out=>out.quickBuys.reduce((s,r)=>s+r.cost,0)/out.quickBuys.length;
const early=rec({},{clock:'04:00'}),late=rec({souls:20000},{clock:'34:00'});
test(early.phase.label==='Laning'&&late.phase.label==='Late game'&&avgCost(early)<avgCost(late),'laning favors cheaper items, late game the expensive tiers');
test(E.PHASE_TUNING.late.threat.control>E.PHASE_TUNING.laning.threat.control&&E.PHASE_TUNING.laning.threat.range>E.PHASE_TUNING.late.threat.range,'disables weigh more late; poke weighs more while laning');

// Your build.
const weaponBuild=rec({owned:'Extended Magazine, Headshot Booster, Rapid Rounds, Burst Fire'},{clock:'14:00'});
test(Math.round(weaponBuild.build.shares.weapon*100)===100&&weaponBuild.quickBuys.some(r=>r.kind==='build'&&r.category==='weapon'&&r.reasons[0]==='Builds on your weapon investment'),'weapon spending makes weapon items the build pick');
const spiritBuild=rec({hero:'Seven',owned:'Extra Spirit, Mystic Burst, Improved Spirit, Spirit Strike'},{clock:'14:00'});
test(spiritBuild.quickBuys.some(r=>r.kind==='build'&&r.category==='spirit'&&/spirit investment/.test(r.reasons[0])),'spirit spending makes spirit items the build pick');
const fresh=E.recommend({hero:'Infernus',souls:1200,owned:'',enemies},catalog,{clock:'02:00'});
test(fresh.build.shares===null&&fresh.build.heroType==='spirit'&&fresh.buildPicks[0].category==='spirit','before your first item, your hero\'s damage type decides the build');
test(weaponBuild.build.durabilityGap&&weaponBuild.quickBuys.some(r=>r.gap&&r.category==='vitality'&&r.reasons[0]==='Fills a durability gap'),'no vitality past laning against a damage-heavy team: one pick covers durability');
test(!rec({owned:'Extended Magazine, Headshot Booster'},{clock:'05:00'}).build.durabilityGap,'no durability gap while laning');

// Mixed picks, labeled; counters cite enemy purchases.
test(weaponBuild.quickBuys.length===3&&weaponBuild.quickBuys.some(r=>r.kind==='counter'||r.kind==='both')&&weaponBuild.quickBuys.some(r=>r.kind==='build'),'quick picks mix a counter and a build item');
const allEnemyItems=new Set(enemies.flatMap(e=>E.cleanList(e.items)));
test(weaponBuild.quickBuys.filter(r=>r.kind!=='build').every(r=>r.vsItems.length>0&&r.vsItems.every(n=>allEnemyItems.has(n))),'counter picks name the enemy purchases they answer');
test(weaponBuild.results.every(r=>r.kind==='counter'||r.kind==='both')&&weaponBuild.buildPicks.every(r=>r.kind==='build'&&!weaponBuild.results.some(c=>c.id===r.id)),'counter list and build list stay separate');
test(weaponBuild.buildPicks.every(r=>E.BUILD_GROUPS[itemByName.get(r.name)?.group]),'build picks only come from items with a known shop group');
const starterOut=E.recommend({hero:'Kelvin',souls:1600,owned:'',enemies},starter);
test(starterOut.buildPicks.length===0&&starterOut.quickBuys.every(r=>r.kind==='counter'),'starter catalog (no shop groups): counters only, as before');
test(rec({owned:'Healbane'},{clock:'12:00'}).quickBuys.every(r=>r.name!=='Healbane')&&rec({owned:'Extended Magazine'},{clock:'12:00'}).buildPicks.every(r=>r.name!=='Extended Magazine'),'items you own are never suggested');

// Debrief and UI wiring.
const debrief=read('js/debrief.js'),ui=read('js/ui.js'),html=read('index.html');
test(debrief.includes('{affordableOnly:true,clock:buy.t}'),'debrief timeline picks use the phase at each purchase');
test(ui.includes("clock:liveWasOn?lastFeedSnapshot?.clock||'':''")&&ui.includes("$('livePhase').textContent=lastAdvice?.phase?.label||'';")&&ui.includes("$('liveBuild').classList.toggle('liveGap',!!lastAdvice?.build?.durabilityGap);"),'live clock drives the phase; the strip shows phase, build split and a durability gap');
test(html.includes('id="livePhase"')&&html.includes('id="liveBuild"')&&html.includes('id="phaseSummary"')&&ui.includes("out.phase.source==='souls'?' (estimated)':''"),'manual mode shows the estimated phase and build split under the picks heading');
test(ui.includes("const KIND_LABELS={counter:'Counter',build:'Build',both:'Counter + build'};")&&ui.includes('<span class="kindTag kind-${r.kind||\'counter\'}">')&&ui.includes('` vs ${escapeHTML(r.vsItems.join(\', \'))}`'),'pick cards say Counter, Build or both, and cite enemy items');

// Heroes newer than the synced catalog (Violet).
const {addFallbackHeroNames}=require('../desktop/data-service.cjs');
const named=addFallbackHeroNames(snapshot,{heroes:{86:'Violet',3:'Vindicta',x:'Bad',87:'<'.repeat(60),88:'  Rem2  '}});
test(JSON.stringify(named.extraHeroNames)==='{"86":"Violet","88":"Rem2"}','fallback names: only unknown numeric IDs, trimmed and length-checked');
test(addFallbackHeroNames(null,{heroes:{86:'Violet'}})===null&&JSON.stringify(addFallbackHeroNames(snapshot,null).extraHeroNames)==='{}','no catalog or no hero list: nothing added');
const withNames=E.createCatalog(base,named);
test(E.resolveHeroName(withNames,'UNKNOWN',86)==='Violet'&&E.resolveHeroName(withNames,'VIOLET',null)==='Violet'&&E.resolveHeroName(withNames,'MYSTERY MAN',999)==='Mystery Man','Violet is named from her ID or her capitalized name; other unknown capitals are tidied');
test(withNames.heroes.some(h=>h.name==='Violet'&&h.unverified)&&withNames.heroes.length===snapshot.heroes.length+Object.keys(base.heroes).filter(n=>!snapshot.heroes.some(h=>h.name===n)).length,'curated heroes missing from the synced roster stay pickable, marked unverified');
const violetOut=E.recommend({hero:'Shiv',souls:3000,owned:'',enemies:[{hero:'Violet',items:'Rapid Rounds'}]},withNames,{clock:'08:00'});
test(violetOut.unknown.includes('No reviewed combat profile for Violet')&&violetOut.quickBuys.length>0,'an unprofiled new hero still counts through her items');
const main=read('desktop/main.cjs');
test(main.includes("dataService.addFallbackHeroNames(snapshot, matchService.readAssets(app.getPath('userData')))")&&main.includes("try { await matchService.refreshAssets(app.getPath('userData')); } catch (_) {}")&&main.includes('return withHeroNames(snapshot);'),'catalog carries fallback hero names; Sync refreshes the hero list too');

console.log(`PASS: ${total} phase, build, enemy-item and new-hero checks`);
