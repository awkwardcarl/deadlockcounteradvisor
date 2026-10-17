'use strict';
/** OFFLINE REPLAY ONLY. A parser for example, user-supplied exported event JSON.
 * No game subscription or live data source exists in this build. Avoids guessing
 * enemy membership if the local player's roster/side cannot be established. */
function parseValue(input){if(typeof input==='string'){try{return JSON.parse(input);}catch(_){return null;}}return input&&typeof input==='object'?input:null;}
function replay(raw){
 const updates=Array.isArray(raw)?raw:Array.isArray(raw?.events)?raw.events:Array.isArray(raw?.updates)?raw.updates:[];
 if(updates.length>300)throw new Error('Too many replay events');
 const players=new Map(),inventory=new Map();let localTeam='';
 for(const event of updates){
  if(event?.feature!=='match_info')continue;
  const key=String(event.key||'');const data=parseValue(event.data??event.value);
  if(!data||typeof data!=='object')continue;
  if(/^roster_\d{1,2}$/.test(key)){
   const name=String(data.player_name||'').slice(0,120);
   if(name){players.set(name,{hero:String(data.hero_name||'').slice(0,80),team:String(data.team_name||data.team_id||'').slice(0,40)});
     if(data.is_local===true)localTeam=String(data.team_name||data.team_id||'').slice(0,40);
   }
  }else if(/^items_\d{1,2}$/.test(key)){
   const name=String(data.player_name||'').slice(0,120);
   if(name&&Array.isArray(data.items))inventory.set(name,data.items.slice(0,30).map(i=>String(i?.name||'').slice(0,100)).filter(Boolean));
  }
 }
 if(!localTeam)return {enemies:[],warning:'Could not identify your team in replay; no opponents imported.',players:players.size};
 const enemies=Array.from(players,([name,p])=>({name,hero:p.hero,items:(inventory.get(name)||[]).join(', ')})).filter((p)=>players.get(p.name).team && players.get(p.name).team!==localTeam && p.hero).slice(0,6);
 return {enemies,warning:'Imported from an offline replay. Not a live connection. Confirm items were visible in normal gameplay.',players:players.size};
}
module.exports={replay};
