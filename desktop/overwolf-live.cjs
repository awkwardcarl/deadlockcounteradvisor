'use strict';
/** Connects Overwolf's game events package (GEP) to the advisor, in the main
 * process only. GEP exists only under the Overwolf Electron runtime
 * (`npm run start:overwolf` with OW_DEV_KEY set for local testing, or a build
 * signed through Overwolf for distribution). In the standard Electron build
 * `app.overwolf` is absent and live mode reports itself unavailable.
 * The renderer only ever receives EventState snapshots, never the GEP API. */
const {OverwolfGepAdapter}=require('../live/overwolf-gep-adapter.cjs');
const APPROVAL=require('./live-approval.cjs');

function createOverwolfLive({app,onMatch=()=>{},onStatus=()=>{},approval=APPROVAL,Adapter=OverwolfGepAdapter}={}){
  const packages=app?.overwolf?.packages;
  let adapter=null;
  const report=(state,message)=>onStatus({state,message:String(message||'').slice(0,200),at:Date.now(),enemyItems:approval.enemyInventoryForLiveAdvice===true});
  if(!packages||typeof packages.on!=='function'){
    report('unavailable','Live game data needs the Overwolf version of the app.');
    return {stop(){},active:()=>false};
  }
  report('waiting','Waiting for Overwolf game events to load…');
  // 'ready' can fire again after Overwolf's packages restart; rebuild cleanly.
  packages.on('ready',(_e,name,version)=>{
    if(name!=='gep')return;
    adapter?.stop();adapter=null;
    try{
      adapter=new Adapter({gep:packages.gep,approval,onMatch,onStatus:(message,state='info')=>report(state,message)});
      adapter.start();
      report('ready',`Overwolf game events ready${version?` (v${version})`:''}. Start a Deadlock match to connect.`);
    }catch(e){adapter=null;report('error',e.message);}
  });
  packages.on('failed-to-initialize',(_e,name)=>{
    if(name==='gep')report('error','Overwolf game events failed to load. For local testing, set OW_DEV_KEY before starting; release builds must be signed through Overwolf.');
  });
  packages.on('crashed',()=>report('waiting','Overwolf game events restarted; reconnecting…'));
  return {stop(){adapter?.stop();adapter=null;},active:()=>!!adapter};
}
module.exports={createOverwolfLive};
