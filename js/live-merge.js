(function(root){
'use strict';
// Applies an event-feed snapshot to the editable match state. The feed only
// overwrites a field when the feed's own value for it changed since the
// previous snapshot, so a manual correction survives until the feed actually
// reports something new. A new match or roster replaces the lineup outright.
const ended=phase=>phase==='ended'||phase==='postgame';
const rosterKey=snap=>`${snap.matchId||''}\n`+snap.enemies.map(e=>e.name).join('\n');
// Scoreboard lines (kills, deaths, assists, souls) are feed-only: never edited
// by hand or saved. Souls count in steps of 1,000 so the advice isn't redone
// for every soul a player earns.
const statsKey=s=>s&&typeof s==='object'?[s.kills,s.deaths,s.assists,Math.floor((Number(s.souls)||0)/1000)].join('/'):'';
const scoreStats=s=>s&&typeof s==='object'?{kills:Number(s.kills)||0,deaths:Number(s.deaths)||0,assists:Number(s.assists)||0,souls:Number(s.souls)||0}:null;
const allyKey=list=>JSON.stringify((list||[]).map(a=>[a.hero,a.heroId??null,a.lane??null,a.items||'',a.inventoryKnown===true,statsKey(a.stats)]));
// Your deaths and the damage panel's last reading (see live/event-state.cjs).
const deathKey=m=>JSON.stringify([m?.deathTimes||[],m?.damage?[m.damage.total,m.damage.clock]:null]);
function mergeFeedSnapshot(state,prev,match,resolveHero=x=>x,resolveItems=x=>x){
 if(ended(match.phase)){
  // Once per match end (also when the app starts after a match, and when you
  // leave early: Overwolf sends match_end then too): the lineup, souls and your
  // items belong to the finished game. Edits made between matches stick.
  if(prev&&ended(prev.phase))return {changed:false};
  state.enemies=[];
  state.allies=[];
  state.owned='';
  state.souls=0;
  return {changed:true,ended:true};
 }
 if(match.warning)return {changed:false,warning:match.warning};
 let changed=false;
 // Compare only with a usable previous snapshot. A warning one (for example your
 // own roster entry arriving before any enemy at match start) was skipped above,
 // so fields it carried still need applying.
 const last=prev&&!ended(prev.phase)&&!prev.warning?prev:null;
 if(!last||rosterKey(last)!==rosterKey(match)){
  state.enemies=match.enemies.map(e=>({hero:resolveHero(e.hero,e.heroId),items:resolveItems(e.items||'',e.itemIds),lane:e.lane??null,feedName:e.name,stats:scoreStats(e.stats)}));
  changed=true;
 }else{
  const before=new Map(last.enemies.map(e=>[e.name,e]));
  for(const e of match.enemies){
   const row=state.enemies.find(r=>r.feedName===e.name),old=before.get(e.name);
   if(!row||!old)continue; // row removed by the user
   // The ID can arrive after the name (Overwolf's "UNKNOWN" placeholder), so check both.
   if(e.hero!==old.hero||(e.heroId??null)!==(old.heroId??null)){row.hero=resolveHero(e.hero,e.heroId);changed=true;}
   if((e.lane??null)!==(old.lane??null)){row.lane=e.lane??null;changed=true;}
   if((e.items||'')!==(old.items||'')){row.items=resolveItems(e.items||'',e.itemIds);changed=true;}
   if(statsKey(e.stats)!==statsKey(row.stats)){row.stats=scoreStats(e.stats);changed=true;}
  }
 }
 // Your teammates (hero, lane, items; no player names) for team-aware picks.
 // They can't be edited by hand: the feed's list replaces them, and returns after Clear.
 const allies=Array.isArray(match.allies)?match.allies.slice(0,5):[];
 if(!last||allyKey(last.allies)!==allyKey(allies)||(allies.length&&!state.allies?.length)){
  state.allies=allies.map(a=>({hero:resolveHero(a.hero,a.heroId),items:resolveItems(a.items||'',a.itemIds),lane:a.lane??null,inventoryKnown:a.inventoryKnown===true,stats:scoreStats(a.stats)}));
  changed=true;
 }
 if((match.ownLane??null)!==(last?.ownLane??null)||(!last&&match.ownLane!=null)){state.ownLane=match.ownLane??null;changed=true;}
 // A death or a new damage reading can raise the priority alert: redo the advice.
 if(last&&deathKey(last)!==deathKey(match))changed=true;
 if(match.ownHero&&(!last||last.ownHero!==match.ownHero)){state.hero=resolveHero(match.ownHero,match.ownHeroId);changed=true;}
 if(Number.isFinite(match.souls)&&(!last||last.souls!==match.souls)){state.souls=match.souls;changed=true;}
 // A new game (new match ID, or play resuming after a match ended) starts with
 // no items, and souls from the feed or else 0: the feed may not report
 // purchases until the first one, and last game's list must not linger. The
 // same match ID keeps them.
 const newGame=match.matchId?state.liveMatchId!==match.matchId:!!(prev&&ended(prev.phase));
 if(newGame){
  if(match.matchId)state.liveMatchId=match.matchId;
  state.owned=typeof match.ownItems==='string'?resolveItems(match.ownItems,match.ownItemIds):'';
  if(!Number.isFinite(match.souls))state.souls=0;
  changed=true;
 }
 // Your own purchases (Overwolf feed): same rule, a manual edit sticks until they change.
 else if(typeof match.ownItems==='string'&&(!last||last.ownItems!==match.ownItems)){state.owned=resolveItems(match.ownItems,match.ownItemIds);changed=true;}
 return {changed};
}
// After a catalog update (a new hero or item from a game update), the last
// snapshot's heroes and items are resolved again with the new catalog. A field
// that no longer reads as the old catalog resolved it was edited by hand and
// stays. before/after: {hero(name,id), items(names,ids)} for each catalog.
function reresolveFeed(state,match,before,after){
 if(!match||ended(match.phase)||match.warning||!Array.isArray(match.enemies))return false;
 let changed=false;
 const redo=(value,kind,...args)=>{const old=before[kind](...args),next=after[kind](...args);if(value!==old||next===old)return value;changed=true;return next;};
 for(const e of match.enemies){
  const row=state.enemies.find(r=>r.feedName===e.name);
  if(!row)continue;
  row.hero=redo(row.hero,'hero',e.hero,e.heroId);
  row.items=redo(row.items,'items',e.items||'',e.itemIds);
 }
 const allies=Array.isArray(match.allies)?match.allies.slice(0,5):[];
 if(state.allies?.length===allies.length)allies.forEach((a,i)=>{state.allies[i].hero=redo(state.allies[i].hero,'hero',a.hero,a.heroId);state.allies[i].items=redo(state.allies[i].items,'items',a.items||'',a.itemIds);});
 if(match.ownHero)state.hero=redo(state.hero,'hero',match.ownHero,match.ownHeroId);
 if(typeof match.ownItems==='string')state.owned=redo(state.owned,'items',match.ownItems,match.ownItemIds);
 return changed;
}
// Overwolf reports each player's souls as net worth: everything earned,
// including what is already spent. What you can spend is that minus the value
// of the items you hold (costOf(name, classId) gives an item's price). Until
// your items are reported there is nothing to subtract, so the value stays.
function withSpendableSouls(match,costOf){
 if(!match||!Number.isFinite(match.souls))return match;
 if(typeof match.ownItems!=='string')return {...match,netWorth:match.souls};
 const names=match.ownItems.split(',').map(n=>n.trim()).filter(Boolean);
 const ids=Array.isArray(match.ownItemIds)&&match.ownItemIds.length===names.length?match.ownItemIds:[];
 const itemValue=names.reduce((sum,name,i)=>sum+Math.max(0,Number(costOf(name,ids[i]))||0),0);
 return {...match,netWorth:match.souls,itemValue,souls:Math.max(0,Math.round(match.souls-itemValue))};
}
root.DeadlockLiveMerge={mergeFeedSnapshot,withSpendableSouls,reresolveFeed,statsKey};
})(typeof window!=='undefined'?window:globalThis);
