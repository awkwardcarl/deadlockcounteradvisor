'use strict';
/** OFFLINE REPLAY ONLY. Reads a user-supplied exported event list through the
 * same EventState parser as the local feed, so both apply identical rules:
 * no opponents unless the local player and team are identified, and items
 * are only joined to a player whose name matches exactly. */
const {EventState}=require('./event-state.cjs');
function replay(raw){
 const updates=Array.isArray(raw)?raw:Array.isArray(raw?.events)?raw.events:Array.isArray(raw?.updates)?raw.updates:[];
 if(updates.length>300)throw new Error('Too many replay events');
 const state=new EventState();
 for(const event of updates)state.apply(event);
 const snap=state.snapshot();
 if(!snap.enemies.length)return {enemies:[],warning:snap.warning||'No opponents found in replay.',players:snap.players};
 return {enemies:snap.enemies.map(({name,hero,items})=>({name,hero,items})),warning:'Imported from an offline replay. Not a live connection. Confirm items were visible in normal gameplay.',players:snap.players};
}
module.exports={replay};
