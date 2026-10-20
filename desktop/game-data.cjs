'use strict';
/** Keeps the item/hero catalog (deadlock.io) and the hero list (deadlock-api's
 * asset lists) current without a click, in the main process: one background
 * sync at launch when either cache is more than a day old, and one when a live
 * match shows a hero ID or shop item neither cache knows (a game update). Only
 * the two services' fixed asset routes are used, never a match endpoint, and
 * nothing from the match (player names, account IDs) is sent or stored. A
 * failed sync (offline, say) keeps the saved copies. */
const dataService=require('./data-service.cjs');
const matchService=require('./match-service.cjs');
const MAX_AGE_MS=24*60*60*1000;   // launch sync when a cache is older than this
const UNKNOWN_GAP_MS=10*60*1000;  // syncs for unknown content at least this far apart
const RETRY_MS=60*60*1000;        // content a completed sync couldn't resolve waits this long
// Missing, older than a day, or a hero list saved before investment tables were kept.
function isStale(catalog,assets,now=Date.now()){
  const synced=Date.parse(catalog?.syncedAt||'');
  return !catalog||!(now-synced<=MAX_AGE_MS)||!assets||!(now-Number(assets.fetchedAt)<=MAX_AGE_MS)||!('investment' in assets);
}
function knownContent(catalog,assets){
  return {heroes:new Set([...(catalog?.heroes||[]).map(h=>String(h.id)),...Object.keys(assets?.heroes||{})]),items:new Set((catalog?.items||[]).map(i=>i.id))};
}
// Hero IDs and shop item class names in a live snapshot that neither cache knows.
function unknownContent(snapshot,known){
  const players=[...(Array.isArray(snapshot?.enemies)?snapshot.enemies:[]),...(Array.isArray(snapshot?.allies)?snapshot.allies:[])];
  const heroIds=[snapshot?.ownHeroId,...players.map(p=>p?.heroId)].filter(id=>Number.isInteger(id)&&id>0&&!known.heroes.has(String(id)));
  const items=[snapshot?.ownItemIds,...players.map(p=>p?.itemIds)].flatMap(ids=>Array.isArray(ids)?ids:[]).filter(id=>typeof id==='string'&&/^upgrade_\w{1,80}$/.test(id)&&!known.items.has(id));
  return [...new Set([...heroIds.map(id=>'hero:'+id),...items.map(id=>'item:'+id)])];
}
function createGameData({userData,onCatalog=()=>{},log=()=>{},now=Date.now,catalog=dataService,assets=matchService}={}){
  let known=null,running=null,lastRun=-Infinity;
  const waiting=new Map(); // unknown content -> when a completed sync last failed to resolve it
  const load=()=>{const c=catalog.readCache(userData),a=assets.readAssets(userData);known=knownContent(c,a);return {c,a};};
  // The cached catalog plus the hero list's names for heroes it lacks.
  const current=()=>catalog.addFallbackHeroNames(catalog.readCache(userData),assets.readAssets(userData));
  // What the window shows; a sync that only moves the sync time changes nothing.
  const contentOf=s=>s?JSON.stringify({...s,syncedAt:''}):'';
  // One sync at a time; a request while one runs gets that one's result.
  function sync(reason){
    if(running)return running;
    lastRun=now();
    running=(async()=>{
      let before='';try{before=contentOf(current());}catch(_){}
      const [items,heroes]=await Promise.allSettled([catalog.refresh(userData),assets.refreshAssets(userData)]);
      const error=items.status==='rejected'?items.reason:heroes.status==='rejected'?heroes.reason:null;
      let snapshot=null;
      // Pushed to the window only when what it shows changed.
      try{load();snapshot=current();if(snapshot&&contentOf(snapshot)!==before)onCatalog(snapshot);}catch(_){}
      log(error?`Game data (${reason}): ${items.status==='fulfilled'?'catalog':heroes.status==='fulfilled'?'hero list':'nothing'} updated; ${String(error?.message||error).slice(0,160)}. Keeping the saved copy.`:`Game data (${reason}): catalog ${snapshot?.build||'?'} and hero list updated.`);
      return {snapshot,ok:!error,catalogError:items.status==='rejected'?items.reason:null};
    })().finally(()=>{running=null;});
    return running;
  }
  function start(){const {c,a}=load();return isStale(c,a,now())?sync('launch'):null;}
  // Per live snapshot: content neither cache knows starts one background sync.
  function check(snapshot){
    if(!known)load();
    const t=now(),found=unknownContent(snapshot,known).filter(k=>!(t-(waiting.get(k)??-Infinity)<RETRY_MS));
    if(!found.length||running||t-lastRun<UNKNOWN_GAP_MS)return null;
    return sync('new '+found.slice(0,3).join(', ')).then(result=>{
      if(result.ok)for(const k of unknownContent(snapshot,known))if(found.includes(k))waiting.set(k,now());
      return result;
    });
  }
  // Settings "Sync items & heroes": fails when the catalog could not be fetched.
  async function syncNow(){const result=await sync('manual');if(result.catalogError)throw result.catalogError;return result.snapshot;}
  return {start,check,sync,syncNow,current,busy:()=>!!running};
}
module.exports={createGameData,isStale,knownContent,unknownContent,MAX_AGE_MS,UNKNOWN_GAP_MS,RETRY_MS};
