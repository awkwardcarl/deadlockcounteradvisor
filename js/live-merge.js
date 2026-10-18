(function(root){
'use strict';
// Applies an event-feed snapshot to the editable match state. The feed only
// overwrites a field when the feed's own value for it changed since the
// previous snapshot, so a manual correction survives until the feed actually
// reports something new. A new match or roster replaces the lineup outright.
const ended=phase=>phase==='ended'||phase==='postgame';
const rosterKey=snap=>`${snap.matchId||''}\n`+snap.enemies.map(e=>e.name).join('\n');
function mergeFeedSnapshot(state,prev,match,resolveHero=x=>x,resolveItems=x=>x){
 if(ended(match.phase)){
  // Once per match end (also when the app starts after a match, and when you
  // leave early: Overwolf sends match_end then too): the lineup, souls and your
  // items belong to the finished game. Edits made between matches stick.
  if(prev&&ended(prev.phase))return {changed:false};
  state.enemies=[];
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
  state.enemies=match.enemies.map(e=>({hero:resolveHero(e.hero,e.heroId),items:resolveItems(e.items||'',e.itemIds),feedName:e.name}));
  changed=true;
 }else{
  const before=new Map(last.enemies.map(e=>[e.name,e]));
  for(const e of match.enemies){
   const row=state.enemies.find(r=>r.feedName===e.name),old=before.get(e.name);
   if(!row||!old)continue; // row removed by the user
   // The ID can arrive after the name (Overwolf's "UNKNOWN" placeholder), so check both.
   if(e.hero!==old.hero||(e.heroId??null)!==(old.heroId??null)){row.hero=resolveHero(e.hero,e.heroId);changed=true;}
   if((e.items||'')!==(old.items||'')){row.items=resolveItems(e.items||'',e.itemIds);changed=true;}
  }
 }
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
root.DeadlockLiveMerge={mergeFeedSnapshot};
})(typeof window!=='undefined'?window:globalThis);
