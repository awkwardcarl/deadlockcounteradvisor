'use strict';
// Enemy item pairs, hero ability tips and per-item evidence labels.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const E=ctx.DeadlockEngine,starter=E.createCatalog(ctx.DeadlockCatalog,null);
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const rec=(enemies,catalog=starter,extra={})=>E.recommend({hero:'Kelvin',souls:3200,owned:'',enemies,...extra},catalog);
const threat=(out,tag)=>out.threats.find(t=>t.name===tag)?.value||0;

// Item pairs
let out=rec([{hero:'Haze',items:'Glass Cannon, Burst Fire'}]);
test(out.patterns.length===1&&out.patterns[0].hero==='Haze'&&out.patterns[0].description==='High-pressure weapon investment','same-enemy pair detected and attributed');
test(rec([{hero:'Haze',items:'Glass Cannon'},{hero:'Lash',items:'Burst Fire'}]).patterns.length===0,'items on different enemies never form a pair');
const dupes=rec([{hero:'Haze',items:'Glass Cannon, Glass Cannon, Burst Fire, Burst Fire'}]);
test(dupes.patterns.length===1&&threat(dupes,'bullet')===threat(out,'bullet'),'duplicate names neither repeat the pair nor inflate threat');
const savedPatterns=E.PURCHASE_PATTERNS.splice(0);
const noPairs=rec([{hero:'Haze',items:'Glass Cannon, Burst Fire'}]);
E.PURCHASE_PATTERNS.push(...savedPatterns);
const added=threat(out,'burst')-threat(noPairs,'burst');
test(noPairs.patterns.length===0&&added>0&&added<=.65,'pair adds a small, capped amount of threat');
test(rec([{hero:'Haze',items:'Slowing Bullets, Slowing Hex'}]).patterns.length===1,'pair recognized in the offline starter catalog');
test(rec([{hero:'Haze',items:'Glass Kannon, Burst Fire'}]).patterns.length===0,'misspelled item cannot complete a pair');
// A pair whose items are in one build path would re-count a single purchase.
const chain={...starter,complete:true,items:[
 {id:'upgrade_burst_fire',name:'Burst Fire',cost:3200,category:'weapon',group:'ERateOfFire',components:[]},
 {id:'upgrade_glass_cannon',name:'Glass Cannon',cost:6400,category:'weapon',group:'ESlowingBullets',components:['upgrade_burst_fire']}]};
test(rec([{hero:'Haze',items:'Glass Cannon, Burst Fire'}],chain).patterns.length===0,'pair skipped when one item builds from the other');
const multi=rec([{hero:'Lash',items:'Improved Spirit, Mystic Burst'},{hero:'Haze',items:'Glass Cannon, Burst Fire'},{hero:'Abrams',items:'Healing Booster, Leech'}]);
test(multi.patterns.length===3&&multi.patterns.every(p=>p.advice),'three distinct pairs with advice');

// Hero ability tips
out=rec([{hero:'Haze',items:''},{hero:'Haze',items:''},{hero:'Nurse Harrow',items:''}]);
test(out.abilityTips.filter(t=>t.hero==='Haze').map(t=>t.ability).join()==='Sleep Dagger,Bullet Dance','tips listed once per hero');
test(!out.abilityTips.some(t=>t.hero==='Nurse Harrow'),'unverified heroes get no invented tips');
test(rec([{hero:'Violet',items:'Improved Spirit, Mystic Burst'}]).abilityTips.length===0,'no tips for a hero with an unconfirmed kit');
// Tips are display only: removing them must not change any ranking.
const lineup=[{hero:'Haze',items:'Rapid Rounds'},{hero:'Bebop',items:'Tankbuster'},{hero:'Seven',items:''}];
const withTips=rec(lineup).results.map(r=>`${r.name}:${r.score}`).join();
const saved={...E.ABILITY_CUES};for(const k of Object.keys(E.ABILITY_CUES))delete E.ABILITY_CUES[k];
const withoutTips=rec(lineup);
Object.assign(E.ABILITY_CUES,saved);
test(withoutTips.abilityTips.length===0&&withoutTips.results.map(r=>`${r.name}:${r.score}`).join()===withTips,'tips do not change rankings');
// After a sync, tips are checked against the hero's current kit.
const synced=(abilities)=>({...starter,complete:true,heroes:[{name:'Haze',tags:['bullet','sustained'],unverified:false,abilities}],items:starter.items});
test(rec([{hero:'Haze',items:''}],synced(['Sleep Dagger','Smoke Bomb','Fixation','Bullet Dance'])).abilityTips.length===2,'tips shown when the kit matches');
test(rec([{hero:'Haze',items:''}],synced(['Smoke Bomb','Fixation','Bullet Dance','Renamed Dagger'])).abilityTips.map(t=>t.ability).join()==='Bullet Dance','tip hidden when its ability left the kit');
test(rec([{hero:'Haze',items:''}],synced(undefined)).abilityTips.length===2,'older cached catalogs without kits still show tips');

// Evidence labels name only what drove each item.
out=rec([{hero:'Haze',items:''}]);
test(out.results.length&&out.results.every(r=>r.evidence.includes('Hero profiles')&&!r.evidence.includes('Enemy purchases')&&!r.evidence.includes('Item pair')),'hero-only lineup is labeled as hero profiles only');
out=rec([{hero:'Haze',items:'Glass Cannon, Burst Fire'},{hero:'Dynamo',items:''}]);
test(out.results.every(r=>r.evidence.includes('Matchup note')===(r.heroNotes.length>0)),'"Matchup note" appears exactly when a matchup note applies');
test(out.results.some(r=>r.evidence.includes('Enemy purchases')&&r.evidence.includes('Item pair')),'entered items and pairs are credited');
test(rec([]).patterns.length===0&&rec([]).abilityTips.length===0,'empty lineup returns empty pairs and tips');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
test(html.includes('id="patternInsight"')&&html.includes('id="abilityTips"'),'pair and tip areas present');
test(ui.includes('escapeHTML(x.hero)')&&ui.includes('escapeHTML(t.note)')&&ui.includes('escapeHTML(r.evidence.join'),'pairs, tips and evidence are escaped');
console.log(`PASS: ${total} item pair, ability tip and evidence label checks`);
