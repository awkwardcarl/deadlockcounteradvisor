(function(root){
'use strict';
// Applies an event-feed snapshot to the editable match state. The feed only
// overwrites a field when the feed's own value for it changed since the
// previous snapshot, so a manual correction survives until the feed actually
// reports something new. A new match or roster replaces the lineup outright.
const ended=phase=>phase==='ended'||phase==='postgame';
const rosterKey=snap=>`${snap.matchId||''}\n`+snap.enemies.map(e=>e.name).join('\n');
function mergeFeedSnapshot(state,prev,match,resolveHero=x=>x){
 if(ended(match.phase)){
  if(prev&&ended(prev.phase))return {changed:false};
  state.enemies=[];
  return {changed:true,ended:true};
 }
 if(match.warning)return {changed:false,warning:match.warning};
 let changed=false;
 if(!prev||ended(prev.phase)||prev.warning||rosterKey(prev)!==rosterKey(match)){
  state.enemies=match.enemies.map(e=>({hero:resolveHero(e.hero),items:e.items||'',feedName:e.name}));
  changed=true;
 }else{
  const before=new Map(prev.enemies.map(e=>[e.name,e]));
  for(const e of match.enemies){
   const row=state.enemies.find(r=>r.feedName===e.name),old=before.get(e.name);
   if(!row||!old)continue; // row removed by the user
   if(e.hero!==old.hero){row.hero=resolveHero(e.hero);changed=true;}
   if((e.items||'')!==(old.items||'')){row.items=e.items||'';changed=true;}
  }
 }
 if(match.ownHero&&(!prev||prev.ownHero!==match.ownHero)){state.hero=resolveHero(match.ownHero);changed=true;}
 if(Number.isFinite(match.souls)&&(!prev||prev.souls!==match.souls)){state.souls=match.souls;changed=true;}
 // Your own purchases (Overwolf feed): same rule, a manual edit sticks until they change.
 if(typeof match.ownItems==='string'&&(!prev||prev.ownItems!==match.ownItems)){state.owned=match.ownItems;changed=true;}
 return {changed};
}
root.DeadlockLiveMerge={mergeFeedSnapshot};
})(typeof window!=='undefined'?window:globalThis);
