(function(root){
'use strict';
/** The buy plan: what to buy next and in what order, picked from the engine's
 * plan pool (ranked by score, never by the souls you hold this second) and
 * kept steady. A pick changes only when it is bought, stops qualifying, or a
 * clearly better item appears (MARGIN times its score). While laning the plan
 * is an ordered lane plan; afterwards it is counters to their team plus your
 * team's gaps. A priority alert (you keep dying; see the engine) takes over
 * the next buy until you buy its item, dismiss it, or the deaths age out.
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
  if(!p||!p.pool?.length)return null;
  const same=prev&&prev.stage===p.stage?prev:null;
  const has=new Set((owned||[]).map(n=>String(n).trim().toLowerCase()));
  const answered=prev?.priority&&has.has(prev.priority.item.name.toLowerCase())?prev.priority.key:prev?.answered||'';
  // The alert's item stays put while it still qualifies, like any pick.
  const raised=out.alert&&out.alert.options?.length&&![dismissed,answered].includes(alertKey(out.alert))?out.alert:null;
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
  if(!next)return null;
  const shown=[next,...steps,...counters,...gaps];
  const before=same?new Set(names([same.next,...same.steps,...same.counters,...same.gaps])):null;
  const added=before?[...new Set(names(shown))].filter(n=>!before.has(n)):[];
  return {stage:p.stage,next,steps,counters,gaps,gapsAreBuilds,priority,answered,opponents:p.opponents||[],
    done:p.stage==='lane'?(owned||[]).slice(-2):[],added,changed:added.length>0};
}
// Glance view's strip: the lane plan's steps, or the next few buys after the next one.
function thenList(plan){
  if(!plan)return [];
  if(plan.stage==='lane')return plan.priority?plan.steps.slice(0,2):plan.steps.slice(1,3);
  return [...plan.counters,...plan.gaps].filter((r,i,a)=>r!==plan.next&&a.indexOf(r)===i).slice(0,3);
}
root.DeadlockPlan={MARGIN,steady,makePlan,thenList,alertKey};
})(typeof window!=='undefined'?window:globalThis);
