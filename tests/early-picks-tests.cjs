'use strict';
// Early-game picks follow how players buy while laning: two or three
// 800-soul items first, save targets within reach, an item you can buy now on
// the first card, and hard counters to your lane as the exception.
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
const E=ctx.DeadlockEngine,snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(ctx.DeadlockCatalog,snapshot);
const desc=r=>`${r.name} ${r.effectiveCost}${r.affordable?'':' (save)'}${r.hardCounter?' [hard]':''}`;

// Tuning.
test(E.OPENING_SPENT===2400&&E.OPENING_TIER[1]>1&&E.OPENING_TIER[2]<1&&E.OPENING_TIER[3]<.5&&E.OPENING_TIER[4]<E.OPENING_TIER[3],'opening buys: 800-soul items lead, bigger ones wait');
test(E.PHASE_TUNING.laning.tier[3]<.5&&E.PHASE_TUNING.laning.tier[4]<.2&&E.PHASE_TUNING.mid.tier[3]>=1,'3,200+ items are rare while laning (under 2% of purchases before 10:00) and normal later');
test(E.LANING_SAVE_CAP===1600&&E.OPENING_SAVE_CAP===800&&E.HARD_COUNTER.cost===1600,'save targets while laning: 1,600 at most (800 during the opening buys)');

// A sweep of early states: six heroes, 2:30 to 9:00, zero to three 800-soul items.
const lineup=[{hero:'Haze',lane:1},{hero:'Abrams',lane:1},{hero:'Seven',lane:4},{hero:'Infernus',lane:4},{hero:'Vindicta',lane:6},{hero:'McGinnis',lane:6}].map(e=>({...e,items:''}));
const opening={Haze:['Headshot Booster','Rapid Rounds','Extended Magazine'],Seven:['Extra Spirit','Mystic Burst','Extra Charge'],Abrams:['Extra Health','Melee Lifesteal','Extra Regen'],Kelvin:['Extra Spirit','Extra Health','Mystic Burst'],Wraith:['Headshot Booster','Rapid Rounds','High-Velocity Rounds'],'Lady Geist':['Extra Spirit','Extra Health','Mystic Regeneration']};
const states=[['2:30',600,0],['4:00',1100,0],['5:30',900,1],['7:00',1400,2],['9:00',1900,3]];
const sweep=[];
for(const [hero,ownLane] of [['Haze',1],['Seven',4],['Abrams',6],['Kelvin',1],['Wraith',4],['Lady Geist',6]])for(const [clock,souls,k] of states)
 sweep.push({hero,clock,souls,k,out:E.recommend({hero,souls,owned:opening[hero].slice(0,k).join(', '),ownLane,enemies:lineup},catalog,{clock})});
test(sweep.every(s=>s.out.phase.key==='laning'&&s.out.phase.opening===(s.k<3)),'the opening lasts until 2,400 souls are in items');
test(sweep.every(s=>s.out.quickBuys.length===3&&s.out.quickBuys.every(r=>r.effectiveCost<3200)),'no 3,200+ picks while laning: '+sweep.flatMap(s=>s.out.quickBuys.filter(r=>r.effectiveCost>=3200).map(desc)).join());
test(sweep.filter(s=>s.k<3).every(s=>s.out.quickBuys.every(r=>r.affordable||r.hardCounter||r.effectiveCost<=800)),'during the opening, nothing to save for beyond an 800-soul item (hard counters aside)');
test(sweep.every(s=>{const q=s.out.quickBuys;return !q.some(r=>r.affordable)||q[0].affordable||q[0].hardCounter;}),'the first card is something you can buy now whenever there is one');
const share=sweep.flatMap(s=>s.out.quickBuys).filter(r=>r.effectiveCost<=800).length/(sweep.length*3);
test(share>=.65,`most early picks cost 800 now, as most early purchases do (${Math.round(share*100)}%)`);
test(sweep.every(s=>!s.out.quickBuys.some(r=>r.hardCounter)),'hero archetypes alone (no purchases yet) never make a hard counter');

// Past the opening, still laning: a save target appears again, within reach.
const late=E.recommend({hero:'Haze',souls:900,owned:opening.Haze.join(', '),ownLane:1,enemies:lineup},catalog,{clock:'8:30'});
test(!late.phase.opening&&late.quickBuys.some(r=>!r.affordable)&&late.quickBuys.every(r=>r.affordable||r.effectiveCost<=1600),'after three 800-soul items: one save target, 1,600 at most');
// Mid game: bigger items come back.
const midGame=E.recommend({hero:'Haze',souls:2500,owned:opening.Haze.join(', ')+', Active Reload, Swift Striker',enemies:lineup.map((e,i)=>({...e,items:i%2?'Bullet Lifesteal, Extra Health':'Headshot Booster, Mystic Burst'}))},catalog,{clock:'16:00'});
test(!midGame.phase.opening&&midGame.quickBuys.some(r=>r.effectiveCost>=3200)&&midGame.quickBuys.every(r=>!r.hardCounter),'mid game: 3,200-soul picks are back; no hard-counter flags');

// Hard counters: a strong answer to what your lane opponent has bought into.
const vs=(lane,extra={})=>E.recommend({hero:'Kelvin',souls:1000,owned:'',ownLane:4,enemies:[...lane,{hero:'Vindicta',items:'',lane:1},{hero:'Abrams',items:'',lane:1}],...extra},catalog,{clock:'4:00'});
const sustain=vs([{hero:'Abrams',items:'Bullet Lifesteal',lane:4},{hero:'Paige',items:'',lane:4}]);
const heal=sustain.quickBuys[0];
test(heal.name==='Healbane'&&heal.hardCounter&&!heal.affordable&&heal.effectiveCost===1600,'Abrams in your lane buys lifesteal: Healbane leads even during the opening, worth saving for');
test(sustain.quickBuys.slice(1).every(r=>r.affordable&&!r.hardCounter)&&sustain.results.filter(r=>r.hardCounter).length===1,'only one hard counter; the other cards are buy-now items');
test(!vs([{hero:'Abrams',items:'',lane:4},{hero:'Paige',items:'',lane:4}]).quickBuys.some(r=>r.hardCounter),'the same lane before any purchase: no hard counter');
const oneSpirit=vs([{hero:'Infernus',items:'Extra Spirit',lane:4},{hero:'Paige',items:'',lane:4}]);
test(!oneSpirit.quickBuys.some(r=>r.hardCounter)&&oneSpirit.quickBuys.every(r=>r.affordable),'one spirit purchase is not a stacked lane: damage resist waits');
const threeSpirit=vs([{hero:'Infernus',items:'Extra Spirit, Mystic Burst, Spirit Strike',lane:4},{hero:'Paige',items:'',lane:4}]);
const twoBuyers=vs([{hero:'Infernus',items:'Extra Spirit',lane:4},{hero:'Seven',items:'Mystic Burst',lane:4}]);
test([threeSpirit,twoBuyers].every(o=>o.quickBuys[0].hardCounter&&o.quickBuys[0].tags[0]==='spirit'&&o.quickBuys[0].effectiveCost<=1600),'a stacked spirit lane (three purchases, or two buyers): a spirit resist item becomes the hard counter');
const otherLane=vs([{hero:'Paige',items:'',lane:4},{hero:'Ivy',items:'',lane:4}]).quickBuys;
test(!otherLane.some(r=>r.hardCounter),'purchases in other lanes never make a hard counter while laning');
// Without lanes (manual entry): purchases by two or more enemies.
const noLanes=(lineup2)=>E.recommend({hero:'Kelvin',souls:1000,owned:'',enemies:lineup2},catalog,{clock:'4:00'});
test(noLanes([{hero:'Abrams',items:'Bullet Lifesteal'},{hero:'McGinnis',items:'Healing Booster, Bullet Lifesteal'},{hero:'Haze',items:''}]).quickBuys.some(r=>r.name==='Healbane'&&r.hardCounter),'no lanes: two enemies buying sustain make anti-heal a hard counter');
test(!noLanes([{hero:'Abrams',items:'Bullet Lifesteal'},{hero:'Haze',items:''},{hero:'Seven',items:''}]).quickBuys.some(r=>r.hardCounter),'no lanes: one buyer is not enough');

// While laning, counters on the cards answer someone in your lane.
const laneEnemies=[{hero:'Infernus',items:'Extra Spirit, Mystic Burst',lane:4},{hero:'Haze',items:'Headshot Booster, Rapid Rounds',lane:1},{hero:'Vindicta',items:'Headshot Booster, Rapid Rounds, Burst Fire',lane:1},{hero:'Grey Talon',items:'Rapid Rounds',lane:6}];
const mid=E.recommend({hero:'Shiv',souls:1400,owned:'',enemies:laneEnemies,ownLane:4},catalog,{clock:'05:00'});
test(mid.quickBuys.filter(r=>r.kind!=='build').every(r=>r.counters.includes('Infernus'))&&!mid.quickBuys.some(r=>r.name==='Rusted Barrel'),'laning against Infernus: no counter picks aimed at the other lanes');
test(mid.results[0].counters.includes('Infernus'),'the full counter list still ranks your lane opponent first');

// Upgrades cost only the difference while laning.
const seven=sweep.find(s=>s.hero==='Seven'&&s.k===1).out;
const up=seven.quickBuys.find(r=>r.upgradeFrom);
test(!up||(up.effectiveCost<=800&&up.cost>800),'an upgrade counts as what you pay now during the opening');

// Card tag.
const ui=read('js/ui.js'),css=read('desktop.css');
test(ui.includes(`\${r.hardCounter?'<span class="kindTag kind-hard" title="A strong answer to what your lane opponent is built around: worth buying early">Hard counter</span>':''}`)&&css.includes('.kindTag.kind-hard{'),'the hard counter is labeled on its card');
test(read('js/engine.js').includes('phase:{key:phase.key,label:PHASE_LABELS[phase.key],source:phase.source,minutes:phase.minutes,opening}'),'the output says when the opening buys apply');

console.log(`PASS: ${total} early-game pick checks`);
