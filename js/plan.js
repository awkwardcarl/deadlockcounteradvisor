(function(root){
'use strict';
/** The buy plan: what to buy next and in what order, picked from the engine's
 * plan pool (ranked by score, never by the souls you hold this second) and
 * kept steady. A pick changes only when it is bought, stops qualifying, or a
 * clearly better item appears (MARGIN times its score). While laning the plan
 * is an ordered lane plan; afterwards it is counters to their team plus your
 * team's gaps. A priority alert (you keep dying; see the engine) takes over
 * the next buy until you buy its item, dismiss it, or the deaths age out.
 * Build-first: with a selected build (out.plan.buildContext) the next buy is
 * the next core item, unless observed evidence justifies ONE temporary detour
 * (plan.decision); after it, back to core. A priority alert then counts only
 * when the engine found observed evidence for it (evidence.alert.justified).
 * Pure: the caller keeps the previous plan. */
const MARGIN=1.2;
// Keep the previous picks that still qualify, in their order; fill the rest
// from the ranking; then let a clearly better newcomer replace the weakest
// kept pick. A hard counter at the top of the ranking always gets in, first.
function steady(prevNames,ranked,n,exclude=new Set(),margin=MARGIN){
  const pool=(ranked||[]).filter(r=>r&&!exclude.has(r.name));
  const byName=new Map(pool.map(r=>[r.name,r]));
  const picks=[...new Set(prevNames||[])].map(name=>byName.get(name)).filter(Boolean).slice(0,n);
  for(const r of pool){if(picks.length>=n)break;if(!picks.includes(r))picks.push(r);}
  for(const r of pool){
    if(picks.includes(r))continue;
    let weak=-1;picks.forEach((p,i)=>{if(weak<0||p.score<picks[weak].score)weak=i;});
    if(weak<0||r.score<margin*picks[weak].score)break;
    picks[weak]=r;
  }
  const hard=pool[0]?.hardCounter?pool[0]:null;
  if(hard&&n>0){
    if(!picks.includes(hard)){if(picks.length>=n)picks.pop();picks.push(hard);}
    picks.splice(picks.indexOf(hard),1);picks.unshift(hard);
  }
  return picks;
}
const names=list=>(list||[]).map(r=>r.name);
// An alert is keyed to your latest death: dismissing it, or buying its item,
// quiets it until you die again.
const alertKey=alert=>alert&&Number.isFinite(alert.last)?String(alert.last):'';
// out: the engine's recommend() result; prev: the plan last shown (or null);
// owned: your item names in inventory order; dismissed: the alertKey of an
// alert the player dismissed.
function makePlan(out,prev,owned=[],{dismissed=''}={}){
  const p=out?.plan;
  const bc=p?.buildContext||null;
  if(!p||!p.pool?.length&&!bc)return null;
  const same=prev&&prev.stage===p.stage?prev:null;
  const has=new Set((owned||[]).map(n=>String(n).trim().toLowerCase()));
  const answered=prev?.priority&&has.has(prev.priority.item.name.toLowerCase())?prev.priority.key:prev?.answered||'';
  // The alert's item stays put while it still qualifies, like any pick.
  // With a build, deaths alone never take over: only an alert the engine
  // backed with observed evidence does (and only while a core item remains).
  const raised=out.alert&&out.alert.options?.length&&![dismissed,answered].includes(alertKey(out.alert))&&(!bc||bc.evidence?.alert?.justified)?out.alert:null;
  const pick=raised?steady(prev?.priority?[prev.priority.item.name]:[],raised.options,1)[0]:null;
  const priority=pick?{...raised,item:pick,key:alertKey(raised)}:null;
  const skip=new Set(priority?[priority.item.name]:[]);
  let next,steps=[],counters=[],gaps=[],gapsAreBuilds=false;
  if(p.stage==='lane'){
    // The next buy is the first step; bought steps drop out and the rest move up.
    // With an alert, its item comes first and the lane plan waits behind it.
    steps=steady(names(same?.steps),p.pool,3,skip);
    next=priority?priority.item:steps[0];
  }else{
    counters=steady(names(same?.counters),p.counters,2,skip);
    const taken=new Set([...skip,...names(counters)]);
    gaps=steady(names(same?.gaps),p.gaps,2,taken);
    // No gaps to cover (no allies reported, no durability gap): build on your items.
    if(!gaps.length){gaps=steady(names(same?.gaps),p.builds,2,taken);gapsAreBuilds=gaps.length>0;}
    const both=[...counters,...gaps].sort((a,b)=>b.score-a.score);
    next=priority?priority.item:steady(same?.next&&!same.priority?[same.next.name]:[],both.length?both:p.pool,1)[0];
  }
  let decision;
  if(bc){
    ({next,decision}=decide(bc,prev,owned,next,priority));
    // The plan cards below the build are optional extras: never repeat a build item there.
    if(decision.kind!=='unplanned'){
      const inBuild=new Set(names([next,...decision.path,...decision.optional].filter(Boolean)));
      const extra=list=>list.filter(r=>!inBuild.has(r.name));
      steps=extra(steps);counters=extra(counters);gaps=extra(gaps);
    }
  }
  else{
    if(!next)return null;
    decision=unplanned(p.buildContextIgnored?'Saved build not applied':'No build selected',p.buildContextIgnored?[p.buildContextIgnored]:[]);
  }
  const shown=[next,...steps,...counters,...gaps].filter(Boolean);
  const before=same?new Set(names([same.next,...same.steps,...same.counters,...same.gaps].filter(Boolean))):null;
  const added=before?[...new Set(names(shown))].filter(n=>!before.has(n)):[];
  return {stage:p.stage,next:next||null,steps,counters,gaps,gapsAreBuilds,priority,answered,opponents:p.opponents||[],
    done:p.stage==='lane'?(owned||[]).slice(-2):[],added,changed:added.length>0,decision};
}
const unplanned=(reason,warnings=[])=>({kind:'unplanned',reason,core:null,resume:null,extraCost:0,warnings,detour:null,path:[],optional:[],step:null,basis:[],detoured:[]});
// The build-first decision. bc: the engine's plan.buildContext; fallback: the
// plan's own next buy (shown only as an optional suggestion once the build is
// complete); priority: an evidence-backed alert, if any.
function decide(bc,prev,owned,fallback,priority){
  const ev=bc.evidence||{};
  const has=new Set((owned||[]).map(n=>String(n).trim().toLowerCase()));
  const path=bc.core||[],optional=bc.optional||[],core=path[0]||null;
  const warnings=[...(ev.missing||[])];
  if(bc.unknown?.length)warnings.push(`Not in the shop list: ${bc.unknown.join(', ')}`);
  const base={core,resume:null,extraCost:0,warnings,detour:null,path,optional,basis:[],detoured:[],
    step:core?{index:core.buildStep||(bc.completed||[]).length+1,total:(bc.completed||[]).length+path.length}:null};
  if(!core){
    // Unrecognized core items may still be ahead: never call that complete.
    if(!(bc.completed||[]).length||bc.unknown?.length)return {next:fallback,decision:{...unplanned((bc.completed||[]).length?'The rest of your build is not in the shop list':'None of your build\'s core items are in the shop list',warnings)}};
    // Done: optional items first, then the regular plan; nothing here is required.
    const next=optional[0]||fallback||null;
    return {next,decision:{...base,kind:'complete',reason:next?'Your build is complete. Anything shown now is optional.':'Your build is complete.'}};
  }
  // One detour per core step: remember detours bought while this core item was next.
  const step=prev?.decision?.core?.name===core.name?prev.decision:null;
  const detoured=[...new Set([...(step?.detoured||[]),...(step?.detour&&has.has(step.detour.name.toLowerCase())?[step.detour.name]:[]),...(ev.recentDetours||[])])];
  base.detoured=detoured;
  const extra=r=>Math.max(0,Math.round(Number(ev.extraCosts?.[r.name]??r.detour?.extraCost??r.effectiveCost)||0));
  let detour=null,basis=[];
  if(priority){detour=priority.item;basis=ev.alert?.basis||[];}
  else if(!detoured.length&&ev.candidates?.length){
    detour=steady(step?.detour?[step.detour.name]:[],ev.candidates,1)[0]||null;
    basis=detour?.detour?.basis||[];
  }
  if(ev.alert&&!ev.alert.justified)warnings.push(ev.alert.reason);
  if(detour){
    return {next:detour,decision:{...base,kind:'adapt',detour,resume:core,basis,extraCost:extra(detour),
      reason:`${detour.name} before ${core.name}: ${basis[0]||'observed threat you do not answer yet'}. Then back to your build.`}};
  }
  if(detoured.length&&ev.candidates?.length)warnings.push(`You already adapted (${detoured.join(', ')}): back to your build before another counter`);
  return {next:core,decision:{...base,kind:'continue',reason:`Next in your build: ${core.name} (step ${base.step.index} of ${base.step.total})`}};
}
// Glance view's strip: the lane plan's steps, or the next few buys after the next one.
function thenList(plan){
  if(!plan)return [];
  const d=plan.decision;
  // After a detour the core path resumes; otherwise it continues past the next buy.
  if(d?.kind==='adapt')return d.path.slice(0,3);
  if(d?.kind==='continue')return d.path.filter(r=>r.name!==plan.next?.name).slice(0,3);
  if(d?.kind==='complete'){
    const legacy=plan.stage==='lane'?plan.steps:[...plan.counters,...plan.gaps];
    return [...d.optional,...legacy].filter((r,i,a)=>r.name!==plan.next?.name&&a.findIndex(x=>x.name===r.name)===i).slice(0,3);
  }
  if(plan.stage==='lane')return plan.priority?plan.steps.slice(0,2):plan.steps.slice(1,3);
  return [...plan.counters,...plan.gaps].filter((r,i,a)=>r!==plan.next&&a.indexOf(r)===i).slice(0,3);
}
root.DeadlockPlan={MARGIN,steady,makePlan,thenList,alertKey,decide};
})(typeof window!=='undefined'?window:globalThis);
