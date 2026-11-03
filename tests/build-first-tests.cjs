'use strict';
// Build-first: with a selected build the next buy is the next core item,
// unless observed evidence (enemy purchases, the damage panel) shows a threat
// you do not answer yet; then ONE temporary detour, with its extra cost in
// souls, and back to the core path. Without a build nothing changes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

const load=files=>{const ctx=vm.createContext({});for(const file of files)vm.runInContext(read(file),ctx);return ctx;};
const hasContext=fs.existsSync(path.join(root,'js/build-context.js'));
const ctx=load(['js/catalog.js',...(hasContext?['js/build-context.js']:[]),'js/engine.js','js/plan.js']);
const E=ctx.DeadlockEngine,P=ctx.DeadlockPlan,snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(ctx.DeadlockCatalog,snapshot);
const names=list=>(list||[]).map(r=>r.name).join();

// Haze, a weapon build: Headshot Booster -> Rapid Rounds -> Swift Striker (from
// Rapid Rounds) -> Headhunter (from Headshot Booster) -> Burst Fire -> Toxic Bullets.
const gun={version:1,hero:'Haze',name:'Gun',playstyle:'weapon',core:['Headshot Booster','Rapid Rounds','Swift Striker','Headhunter','Burst Fire','Toxic Bullets'],optional:['Healbane']};
const quiet=['Seven','Infernus','Pocket','Abrams','Paige','Kelvin'].map(hero=>({hero,items:''}));
// Three spirit casters who bought into spirit damage.
const casters=[{hero:'Seven',items:'Extra Spirit, Mystic Burst, Improved Spirit'},{hero:'Infernus',items:'Extra Spirit, Mystic Burst, Spirit Strike'},{hero:'Pocket',items:'Mystic Burst, Extra Spirit'},{hero:'Abrams',items:''},{hero:'Paige',items:''},{hero:'Kelvin',items:''}];
const rec=(state,opts={})=>E.recommend({hero:'Haze',souls:2000,owned:'',enemies:quiet,...state},catalog,{clock:'15:00',...opts});
const withBuild=(state,opts={})=>rec(state,{buildContext:gun,...opts});
const plan=(out,prev=null,owned='',opts)=>P.makePlan(out,prev,E.cleanList(owned),opts);

// 1. No build selected: unchanged.
{
  const owned='Headshot Booster, Rapid Rounds';
  const a=rec({owned,enemies:casters}),b=rec({owned,enemies:casters},{buildContext:{hero:'Haze',core:[]}});
  test(a.plan.buildContext===null&&b.plan.buildContext===null,'no build (or an empty core): no build context');
  const strip=o=>JSON.stringify({...o,plan:{...o.plan,buildContext:undefined}});
  test(strip(a)===strip(b),'an empty build changes nothing in the engine output');
  const pa=plan(a,null,owned);
  test(pa.decision.kind==='unplanned'&&pa.decision.core===null&&pa.decision.extraCost===0&&pa.decision.warnings.length===0,'no build: the decision is unplanned');
  test(pa.next===pa.counters.concat(pa.gaps).sort((x,y)=>y.score-x.score)[0]&&P.thenList(pa).length===3,'no build: the next buy and strip follow the existing game plan');
  test(E.recommend({hero:'Haze',souls:500,owned:'',enemies:[]},catalog,{}).plan===undefined&&P.makePlan(E.recommend({hero:'Haze',souls:500,owned:'',enemies:[]},catalog,{}),null,[])===null,'no build and no enemies: no plan, as before');
}

// 2. A build works without enemies.
{
  const out=withBuild({enemies:[]});
  const bc=out.plan.buildContext,pl=plan(out);
  test(out.quality==='No matchup data'&&bc&&names(bc.core)===gun.core.join(),'no enemies: the build context still resolves, in chosen order');
  test(pl&&pl.decision.kind==='continue'&&pl.next.name==='Headshot Booster'&&pl.decision.core===pl.next&&pl.decision.step.index===1&&pl.decision.step.total===6,'no enemies: the next buy is the first core item (step 1 of 6)');
  test(bc.evidence.missing.some(m=>/No enemies entered/.test(m))&&pl.decision.warnings.some(m=>/No enemies entered/.test(m)),'missing evidence is disclosed');
  test(names(P.thenList(pl))==='Rapid Rounds,Swift Striker,Headhunter','the strip shows the next core items');
}

// 3. Continue the build; core items stay eligible past the early save caps.
{
  const owned='Headshot Booster, Rapid Rounds';
  const pl=plan(withBuild({owned}),null,owned);
  test(pl.decision.kind==='continue'&&pl.next.name==='Swift Striker'&&pl.next.effectiveCost===800,'owning two core items: Swift Striker next, credited for Rapid Rounds');
  test(pl.decision.step.index===3&&pl.decision.extraCost===0&&pl.decision.resume===null&&pl.decision.detour===null,'continue: step 3, no detour, no extra cost');
  test(names(P.thenList(pl))==='Headhunter,Burst Fire,Toxic Bullets','then the rest of the core path');
  // A 3,200-soul first core item during the opening buys (save cap 800).
  const big={...gun,core:['Headhunter','Swift Striker']};
  const lane=E.recommend({hero:'Haze',souls:400,owned:'',ownLane:1,enemies:quiet.map((e,i)=>({...e,lane:i<2?1:4}))},catalog,{clock:'3:00',buildContext:big});
  test(lane.phase.opening&&!lane.plan.pool.some(r=>r.name==='Headhunter')&&lane.plan.buildContext.core[0].name==='Headhunter','the early save cap keeps Headhunter out of the pool, but not out of the build');
  const pLane=plan(lane);
  test(pLane.stage==='lane'&&pLane.next.name==='Headhunter'&&pLane.decision.kind==='continue','while laning, the build still decides the next buy');
  // A core item outside every ranked list (no shop group) still gets a ranked pick object.
  const odd=E.recommend({hero:'Haze',souls:1000,owned:'',enemies:quiet},catalog,{clock:'15:00',buildContext:{hero:'Haze',core:['Radiant Regeneration']}});
  const rr=odd.plan.buildContext.core[0];
  test(rr&&rr.name==='Radiant Regeneration'&&Number.isFinite(rr.score)&&rr.effectiveCost===3200&&rr.buildStep===1,'a core item with no shop group is still a full pick');
}

// 4. A justified detour, then back to core.
const owned2='Headshot Booster, Rapid Rounds';
const spiritOut=withBuild({owned:owned2,enemies:casters});
const pDetour=plan(spiritOut,null,owned2);
const det=pDetour.decision.detour;
{
  const ev=spiritOut.plan.buildContext.evidence;
  test(ev.threats[0].tag==='spirit'&&ev.threats[0].buyers===3&&ev.threats[0].purchases.includes('Mystic Burst'),'evidence: three enemies bought into spirit damage');
  test(ev.candidates.length>0&&ev.candidates.every(c=>c.detour.tag==='spirit'&&c.detour.resume==='Swift Striker'&&c.detour.basis.length),'detour candidates answer the observed threat and name the core item to resume');
  test(pDetour.decision.kind==='adapt'&&pDetour.next===det&&det.detour.tag==='spirit','spirit casters invested: adapt with a spirit answer first');
  test(pDetour.decision.core.name==='Swift Striker'&&pDetour.decision.resume.name==='Swift Striker','the decision names the core item to return to');
  test(/before Swift Striker/.test(pDetour.decision.reason)&&/3 enemies bought into spirit pressure/.test(pDetour.decision.reason),'the reason cites the observed purchases');
  test(pDetour.decision.extraCost===det.effectiveCost&&pDetour.decision.extraCost===E.detourExtraCost(catalog,owned2,det.name,'Swift Striker'),'extra cost: the detour price (it shares no components with Swift Striker)');
  test(names(P.thenList(pDetour))==='Swift Striker,Headhunter,Burst Fire','after the detour the strip follows the core path');
}
const afterDetour=`${owned2}, ${det.name}`;
const pBack=plan(withBuild({owned:afterDetour,enemies:casters}),pDetour,afterDetour);
{
  test(pBack.decision.kind==='continue'&&pBack.next.name==='Swift Striker','detour bought: back to Swift Striker');
  test(pBack.decision.detoured.includes(det.name),'the detour is remembered for this core step');
  const fresh=plan(withBuild({owned:afterDetour,enemies:casters}),null,afterDetour);
  test(fresh.decision.kind==='continue'&&fresh.next.name==='Swift Striker','also without the previous plan (the purchase itself shows the detour)');
  test(withBuild({owned:afterDetour,enemies:casters}).plan.buildContext.evidence.coverage.spirit.includes(det.name),'the detour now covers spirit damage');
}

// 5. No chained counters.
{
  // The same casters, plus two sustain enemies: a second, different threat.
  const sustain=[...casters.slice(0,3),{hero:'Abrams',items:'Healing Booster, Bullet Lifesteal, Extra Regen'},{hero:'Paige',items:'Healing Rite, Healing Booster, Spirit Lifesteal'},{hero:'Kelvin',items:''}];
  const p1=plan(withBuild({owned:owned2,enemies:sustain}),null,owned2);
  test(p1.decision.kind==='adapt','two threats: one detour');
  const o2=`${owned2}, ${p1.next.name}`;
  const out2=withBuild({owned:o2,enemies:sustain});
  const p2=plan(out2,p1,o2);
  test(!out2.plan.buildContext.evidence.candidates.some(c=>c.detour.tag===p1.decision.detour.detour.tag),'the answered threat offers no second, similar counter');
  test(out2.plan.buildContext.evidence.candidates.length>0&&p2.decision.kind==='continue'&&p2.next.name==='Swift Striker','another threat remains, but the plan returns to core first');
  test(p2.decision.warnings.some(w=>/already adapted/.test(w)),'and says why');
  // Buying more souls never re-opens the detour on this step.
  let prev=p2;
  for(const souls of [3000,6000,12000]){const pl=plan(withBuild({owned:o2,souls,enemies:sustain}),prev,o2);test(pl.next.name==='Swift Striker'&&pl.decision.kind==='continue',`returning to core holds at ${souls} souls`);prev=pl;}
  // With the core item bought, a new step may adapt once more to the remaining threat.
  const o3=`${o2}, Swift Striker`;
  const p3=plan(withBuild({owned:o3,enemies:sustain}),prev,o3);
  test(p3.decision.core.name==='Headhunter'&&(p3.decision.kind==='continue'||p3.decision.detour.detour.tag!==p1.decision.detour.detour.tag),'the next core step never repeats the same kind of counter');
}

// 6. Completion.
{
  const all='Headhunter, Burst Fire, Swift Striker, Toxic Bullets';
  const out=withBuild({owned:all,enemies:casters});
  const bc=out.plan.buildContext,pl=plan(out,null,all);
  test(bc.core.length===0&&bc.completed.length===6&&bc.completed.includes('Headshot Booster'),'owning the upgrades completes the whole core path (components included)');
  test(pl.decision.kind==='complete'&&pl.decision.core===null&&pl.decision.extraCost===0&&pl.next.name==='Healbane'&&pl.next.optional,'complete: the optional item is suggested, marked optional');
  test(/optional/.test(pl.decision.reason)&&!P.thenList(pl).some(r=>gun.core.includes(r.name)),'complete: the reason says nothing is required; no core items remain');
  const bare=E.recommend({hero:'Haze',souls:2000,owned:all,enemies:[]},catalog,{clock:'15:00',buildContext:{...gun,optional:[]}});
  const pb=plan(bare,null,all);
  test(pb&&pb.decision.kind==='complete'&&/optional/.test(pb.decision.reason)&&[pb.next,...P.thenList(pb)].every(r=>r.kind==='build'),'complete, no optional items, no enemies: only optional build suggestions, never counters');
  const none=P.decide({core:[],optional:[],completed:['Headhunter'],unknown:[],evidence:{missing:[]}},null,[],undefined,null);
  test(none.next===null&&none.decision.kind==='complete'&&none.decision.reason==='Your build is complete.','complete with nothing at all to suggest: no next buy');
}

// 7. Stable as souls rise.
{
  const runs=[400,1200,2600,5000,9000].map(souls=>withBuild({owned:owned2,souls,enemies:casters}));
  let prev=null;const seen=[];
  for(const out of runs){const pl=plan(out,prev,owned2);seen.push(`${pl.decision.kind}:${pl.next.name}:${pl.decision.extraCost}`);prev=pl;}
  test(new Set(seen).size===1,'detour, next buy and extra cost do not change as souls rise: '+seen[0]);
  test(runs.every(o=>names(o.plan.buildContext.evidence.candidates)===names(runs[0].plan.buildContext.evidence.candidates)),'detour candidates do not depend on souls');
  const cont=[400,3000,9000].map(souls=>plan(withBuild({owned:owned2,souls}),null,owned2).next.name);
  test(cont.every(n=>n==='Swift Striker'),'continue holds at any soul count');
}

// 8. Extra cost respects component credit.
{
  test(E.detourExtraCost(catalog,'','Debuff Reducer','Spellbreaker')===0,'a detour into a component of the core item costs nothing extra (1,600 + 4,800 vs 6,400)');
  test(E.detourExtraCost(catalog,'Grit','Spirit Shielding','Weapon Shielding')===1600,'a detour that consumes the core item\'s component costs its price plus the lost credit');
  test(E.detourExtraCost(catalog,'Rapid Rounds','Spirit Resilience','Swift Striker')===3200,'an unrelated detour costs its own price');
  test(E.detourExtraCost(catalog,'Extra Spirit','Spirit Shielding','Improved Spirit')===1600,'credit you hold toward the core item is unaffected by an unrelated detour');
  // End to end: Grit held, Weapon Shielding next in the build, spirit casters invested.
  const shield={hero:'Haze',core:['Weapon Shielding','Headhunter']};
  const out=E.recommend({hero:'Haze',souls:2000,owned:'Grit',enemies:casters},catalog,{clock:'15:00',buildContext:shield});
  const ev=out.plan.buildContext.evidence,pl=plan(out,null,'Grit');
  const ss=ev.candidates.find(c=>c.name==='Spirit Shielding');
  test(ss&&ss.detour.extraCost===1600&&ev.extraCosts['Spirit Shielding']===1600,'Spirit Shielding before Weapon Shielding (both from Grit) costs 1,600 extra');
  test(pl.decision.kind==='adapt'&&pl.decision.extraCost===ev.extraCosts[pl.next.name]&&pl.decision.extraCost===E.detourExtraCost(catalog,'Grit',pl.next.name,'Weapon Shielding'),'the decision reports the engine\'s extra cost');
}

// 9. Priority alerts: deaths alone never justify a defensive buy.
{
  const deaths={deathTimes:[700,800,880]};
  const legacy=plan(rec({owned:owned2},{scoreboard:deaths}),null,owned2);
  test(legacy.priority&&legacy.next===legacy.priority.item,'without a build the alert still takes over (unchanged)');
  const out=withBuild({owned:owned2},{scoreboard:deaths});
  const pl=plan(out,null,owned2);
  test(out.alert&&out.plan.buildContext.evidence.alert.justified===false&&pl.priority===null,'with a build, three deaths and no observed purchases or damage reading: no priority');
  test(pl.decision.kind==='continue'&&pl.next.name==='Swift Striker'&&pl.decision.warnings.some(w=>/nothing observed/.test(w)),'the build continues and the deaths are acknowledged');
  const panel={...deaths,damage:{clock:'14:50',total:1000,sources:[{source:'hero_seven',amount:700},{source:'hero_infernus',amount:200}]}};
  const out2=withBuild({owned:owned2},{scoreboard:panel});
  const p2=plan(out2,null,owned2);
  test(out2.plan.buildContext.evidence.damage.lead==='spirit'&&out2.plan.buildContext.evidence.alert.justified,'a damage panel reading showing spirit damage justifies the alert');
  test(p2.priority&&p2.decision.kind==='adapt'&&p2.next===p2.priority.item&&p2.decision.resume.name==='Swift Striker','the justified alert is the detour, then back to core');
  const covered=`${owned2}, Spirit Shielding`;
  const out3=withBuild({owned:covered},{scoreboard:panel});
  const p3=plan(out3,null,covered);
  test(out3.plan.buildContext.evidence.alert.justified===false&&p3.decision.kind==='continue'&&p3.decision.warnings.some(w=>/already answers/.test(w)),'already holding an answer: no second defensive buy');
}

// 10. Another hero's build, unknown items, missing module.
{
  const other=rec({owned:owned2},{buildContext:{...gun,hero:'Seven'}});
  const pl=plan(other,null,owned2);
  test(other.plan.buildContext===null&&/Seven/.test(other.plan.buildContextIgnored)&&pl.decision.kind==='unplanned'&&pl.decision.warnings.length===1,'another hero\'s build is not applied, and says so');
  const typo=withBuild({},{buildContext:{...gun,core:['Headshot Booster','Not An Item','Rapid Rounds']}});
  test(typo.plan.buildContext.unknown.join()==='Not An Item'&&names(typo.plan.buildContext.core)==='Headshot Booster,Rapid Rounds','unknown selections are kept aside, the rest stays in order');
  test(plan(typo).decision.warnings.some(w=>/Not An Item/.test(w)),'unknown selections are disclosed');
  const bare=load(['js/catalog.js','js/engine.js','js/plan.js']);
  const bareCat=bare.DeadlockEngine.createCatalog(bare.DeadlockCatalog,snapshot);
  const fb=bare.DeadlockEngine.recommend({hero:'Haze',souls:2000,owned:owned2,enemies:quiet},bareCat,{clock:'15:00',buildContext:gun});
  test(names(fb.plan.buildContext.core)==='Swift Striker,Headhunter,Burst Fire,Toxic Bullets'&&fb.plan.buildContext.completed.join()==='Headshot Booster,Rapid Rounds','without build-context.js the engine resolves the build itself');
}

// 11. Integration regressions.
{
  // Core items the shop list doesn't know remain ahead: never "complete".
  const owned='Headshot Booster';
  const part=plan(withBuild({owned},{buildContext:{...gun,core:['Headshot Booster','Not An Item']}}),null,owned);
  test(part.decision.kind==='unplanned'&&/not in the shop list/.test(part.decision.reason),'unrecognized core items left: unplanned, not complete');
  // Manual entry has no damage panel, so don't warn about it.
  const manual=withBuild({enemies:casters});
  test(!manual.plan.buildContext.evidence.missing.some(m=>/damage panel/.test(m)),'manual entry: no damage panel warning');
  const live=withBuild({enemies:casters},{scoreboard:{deaths:[]}});
  test(live.plan.buildContext.evidence.missing.some(m=>/damage panel/.test(m)),'live feed without a reading: the damage panel warning shows');
  // The optional plan cards never repeat build items.
  const pl=plan(withBuild({enemies:casters}));
  const inBuild=new Set([pl.next,...pl.decision.path,...pl.decision.optional].map(r=>r.name));
  test([...pl.steps,...pl.counters,...pl.gaps].every(r=>!inBuild.has(r.name)),'optional plan cards exclude build items');
}

console.log(`PASS: ${total} build-first checks${hasContext?'':' (build-context.js absent: engine fallback)'}`);
