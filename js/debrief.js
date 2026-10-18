(function(root){
'use strict';
// Post-match debrief. Replays a finished match through the advisor engine:
// at each of your purchases it rebuilds every enemy's inventory at that
// moment (no hindsight) and compares your buy with the advisor's top picks
// for the same budget. Pure: takes a normalized match (desktop/match-normalizer.cjs).
const COUNTER_WEIGHT=2.0; // a COUNTERS weight this strong counts as "a counter for that threat"
const LEVEL_RANK={low:0,medium:1,high:2};
const mmss=s=>{const v=Math.max(0,Math.round(Number(s)||0));return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};
const inventoryAt=(player,t)=>player.purchases.filter(p=>p.t<=t&&(!p.sold||p.sold>t));
// What you held just before buying at t (a component upgraded at t still counts).
const ownedBefore=(player,t)=>player.purchases.filter(p=>p.t<t&&(!p.sold||p.sold>=t));
function valueAt(timeline,t,key){
  if(!timeline.length)return 0;
  let prev={t:0,[key]:0};
  for(const s of timeline){
    if(s.t>=t){const span=s.t-prev.t||1;return Math.round(prev[key]+(s[key]-prev[key])*(t-prev.t)/span);}
    prev=s;
  }
  return timeline.at(-1)[key];
}
const average=list=>list.length?Math.round(list.reduce((a,b)=>a+b,0)/list.length):0;

function analyzeMatch(match,youSlot,catalog,engine,base){
  const E=engine;
  const you=match.players.find(p=>p.slot===youSlot);
  if(!you)throw new Error('Pick which player you were.');
  const enemies=match.players.filter(p=>p.team!==you.team),allies=match.players.filter(p=>p.team===you.team);
  const bySlot=new Map(match.players.map(p=>[p.slot,p]));
  // Ballot heroes may be missing from the synced roster; fall back to curated profiles.
  const known=new Set(catalog.heroes.map(h=>E.norm(h.name)));
  const extra=match.players.map(p=>p.hero).filter((n,i,a)=>a.indexOf(n)===i&&!known.has(E.norm(n))).map(name=>{
    const key=Object.keys(base?.heroes||{}).find(k=>E.norm(k)===E.norm(name));
    return {name,id:name,tags:key?base.heroes[key]:[],portrait:'',unverified:!key||(base.unverifiedHeroes||[]).includes(key)};
  });
  const cat=extra.length?{...catalog,heroes:[...catalog.heroes,...extra]}:catalog;
  const items=new Map(cat.items.map(i=>[String(i.id),i]));
  const nameOf=p=>items.get(p.className)?.name||p.name;
  const enemyState=t=>enemies.map(e=>({hero:e.hero,items:inventoryAt(e,t).map(nameOf).join(', ')}));
  const threatsAt=t=>E.recommend({hero:you.hero,souls:0,owned:'',enemies:enemyState(t)},cat).threats;
  const counterTags=new Set(Object.values(E.COUNTERS).flatMap(rule=>Object.entries(rule).filter(([,w])=>w>=COUNTER_WEIGHT).map(([tag])=>tag)));
  const strongFor=(className,tag)=>(E.COUNTERS[className]?.[tag]||0)>=COUNTER_WEIGHT;

  // 1. Purchase timeline: your buy vs the advisor's top picks for the same budget.
  const timeline=you.purchases.map(buy=>{
    const item=items.get(buy.className);
    const budget=Math.max(item?.cost||0,buy.cost||0);
    const out=E.recommend({hero:you.hero,souls:budget,owned:ownedBefore(you,buy.t).map(nameOf).join(', '),enemies:enemyState(buy.t)},cat,{affordableOnly:true,clock:buy.t});
    const picks=out.results.slice(0,3);
    const pressing=out.threats.filter(t=>t.level!=='low');
    const verdict=picks.some(r=>r.id===buy.className)?'top':pressing.some(t=>strongFor(buy.className,t.name))?'counter':'build';
    return {t:buy.t,time:mmss(buy.t),item:nameOf(buy),className:buy.className,cost:item?.cost||buy.cost,icon:item?.icon||'',category:item?.category||buy.slot||'',
      verdict,picks:picks.map(r=>({id:r.id,name:r.name,icon:r.icon,reasons:r.reasons.slice(0,2)})),threats:pressing.slice(0,3).map(t=>({label:t.label,level:t.level}))};
  });

  // 2. Counter timing: when each threat first reached High vs your first strong counter.
  const step=120,checkpoints=[];
  for(let t=step;t<match.durationS;t+=step)checkpoints.push(t);
  checkpoints.push(match.durationS);
  const firstAt={};
  for(const t of checkpoints)for(const th of threatsAt(t)){
    if(!counterTags.has(th.name))continue;
    const seen=firstAt[th.name]||(firstAt[th.name]={label:th.label,medium:null,high:null});
    if(seen.medium===null&&LEVEL_RANK[th.level]>=1)seen.medium=t;
    if(seen.high===null&&th.level==='high')seen.high=t;
  }
  const counterTiming=Object.entries(firstAt).filter(([,v])=>v.high!==null).map(([tag,v])=>{
    const counter=you.purchases.find(p=>strongFor(p.className,tag));
    const delay=counter?counter.t-v.high:null;
    return {tag,label:v.label,highAt:v.high,highTime:mmss(v.high),counter:counter?nameOf(counter):'',counterTime:counter?mmss(counter.t):'',
      delayS:delay,status:!counter?'never':delay<=0?'ahead':delay<=180?'on time':'late'};
  }).sort((a,b)=>a.highAt-b.highAt);

  // 3. What hurt you: damage taken from enemies by category and hero; deaths.
  const enemySlots=new Set(enemies.map(e=>e.slot));
  const rows=(match.damageTaken?.[String(you.slot)]||match.damageTaken?.[you.slot]||[]).filter(r=>enemySlots.has(r.dealerSlot));
  const totals={weapon:0,abilities:0,items:0,melee:0};
  for(const r of rows)for(const k of Object.keys(totals))totals[k]+=r[k]||0;
  const totalDamage=Object.values(totals).reduce((a,b)=>a+b,0);
  const share=v=>totalDamage?Math.round(v*100/totalDamage):0;
  const byCategory=Object.entries(totals).map(([key,value])=>({key,value,share:share(value)})).sort((a,b)=>b.value-a.value);
  const byEnemy=rows.map(r=>{
    const main=['weapon','abilities','items','melee'].sort((a,b)=>(r[b]||0)-(r[a]||0))[0];
    return {hero:bySlot.get(r.dealerSlot)?.hero||'Unknown',total:r.total,share:share(r.total),main};
  });
  const deaths=you.deathDetails.map(d=>({t:d.t,time:mmss(d.t),killer:enemySlots.has(d.killerSlot)?bySlot.get(d.killerSlot).hero:'Objective or other',timeToKill:d.timeToKill}));
  const killers={};for(const d of deaths)killers[d.killer]=(killers[d.killer]||0)+1;
  const spiritShare=share(totals.abilities+totals.items),weaponShare=share(totals.weapon);

  // 4. Performance summary (facts, no grades).
  const last=you.timeline.at(-1)||{};
  const laneOpponents=enemies.filter(e=>e.lane===you.lane);
  const rankIn=(list,key)=>1+list.filter(p=>p[key]>you[key]).length;
  const performance={
    won:you.team===match.winningTeam,duration:mmss(match.durationS),hero:you.hero,
    kills:you.kills,deaths:you.deaths,assists:you.assists,netWorth:you.netWorth,lastHits:you.lastHits,denies:you.denies,
    netWorthRankInTeam:rankIn(allies,'netWorth'),teamAvgNetWorth:average(allies.map(p=>p.netWorth)),enemyAvgNetWorth:average(enemies.map(p=>p.netWorth)),
    laneOpponents:laneOpponents.map(e=>e.hero),
    netWorthAt10:valueAt(you.timeline,600,'netWorth'),laneOpponentsAt10:average(laneOpponents.map(e=>valueAt(e.timeline,600,'netWorth'))),
    heroDamage:last.heroDamage||0,damageTaken:last.damageTaken||0,healing:last.healing||0,soulsLostOnDeath:last.soulsLostOnDeath||0
  };

  // 5. Suggested build: counters for the final enemy builds, weighted toward
  // the damage you actually took (this part uses hindsight on purpose).
  const lean=pct=>0.5+1.5*pct/100; // 0% -> 0.5x, 50% -> 1.25x, 100% -> 2x
  const tagFactors=totalDamage?{bullet:lean(weaponShare),spirit:lean(spiritShare)}:{};
  const final=E.recommend({hero:you.hero,souls:1e6,owned:'',enemies:enemyState(match.durationS)},cat,{tagFactors});
  const neededFrom=pick=>{
    const times=pick.tags.map(tag=>firstAt[tag]?.medium).filter(t=>t!==null&&t!==undefined);
    return times.length?Math.min(...times):match.durationS;
  };
  const build=final.results.slice(0,6).map(pick=>{
    const bought=you.purchases.find(p=>p.className===pick.id);
    const evidence=[];
    if(pick.tags.includes('bullet')&&weaponShare>=30)evidence.push(`${weaponShare}% of the damage you took was weapon damage`);
    if(pick.tags.includes('spirit')&&spiritShare>=30)evidence.push(`${spiritShare}% of the damage you took came from abilities and items`);
    const from=neededFrom(pick);
    // "From the start" when the threat was already there by the first checks.
    return {id:pick.id,name:pick.name,icon:pick.icon,cost:pick.cost,category:pick.category,reasons:pick.reasons,evidence,
      neededFrom:from,neededTime:from<=240?'from the start':`from about ${mmss(from)}`,bought:bought?mmss(bought.t):''};
  });

  const counts={top:0,counter:0,build:0};for(const t of timeline)counts[t.verdict]++;
  return {matchId:match.matchId,you:{slot:you.slot,hero:you.hero,team:you.team},performance,timeline,counts,counterTiming,
    damage:{total:totalDamage,byCategory,byEnemy,spiritShare,weaponShare},deaths,killers,build};
}
root.DeadlockDebrief={analyzeMatch,inventoryAt,ownedBefore,valueAt,mmss};
})(typeof window!=='undefined'?window:globalThis);
