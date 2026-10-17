'use strict';
/** User-triggered post-match lookups against the public community API
 * (api.deadlock-api.com, MIT licensed). Never contacts Deadlock, Steam or a
 * local process. Only three fixed route shapes are allowed. */
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {normalizeMatch,compactAssets}=require('./match-normalizer.cjs');
const ORIGIN='https://api.deadlock-api.com';
const MATCH_ID=/^\d{1,12}$/;
const ASSET_ROUTES=Object.freeze(['/v1/assets/items','/v1/assets/heroes']);
const ASSET_MAX_AGE_MS=24*60*60*1000;
function routeAllowed(route){return ASSET_ROUTES.includes(route)||/^\/v1\/matches\/\d{1,12}\/metadata$/.test(route);}
function friendlyStatus(status,retryAfter){
  if(status===404)return 'Match not found. Very recent matches can take a few minutes to appear; check the ID and try again.';
  if(status===429||status===503)return `The match service is busy. Try again in ${Math.max(5,Number(retryAfter)||30)} seconds.`;
  return `The match service returned HTTP ${status}.`;
}
function getJSON(route,{httpsModule=https,maxBytes=24*1024*1024}={}){
  if(!routeAllowed(route))return Promise.reject(new Error('Endpoint not allowlisted'));
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err,value)=>{if(done)return;done=true;err?reject(err):resolve(value);};
    const req=httpsModule.get(ORIGIN+route,{timeout:30000,headers:{'Accept':'application/json','User-Agent':'DeadlockCounterAdvisor (post-match debrief)'}},res=>{
      if(res.statusCode!==200){res.resume();return finish(new Error(friendlyStatus(res.statusCode,res.headers?.['retry-after'])));}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('Response exceeds size limit'));return;}chunks.push(chunk);});
      res.on('error',finish);
      res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){finish(new Error('Could not decode the match service response'));}});
    });
    req.on('timeout',()=>req.destroy(new Error('The match service did not respond in time')));
    req.on('error',e=>finish(e.message&&/match service|size limit|allowlisted/.test(e.message)?e:new Error('Could not reach the match service. Check your connection.')));
  });
}
function assetsFile(userData){return path.join(userData,'deadlock-api-assets-v1.json');}
function readAssets(userData){
  try{const v=JSON.parse(fs.readFileSync(assetsFile(userData),'utf8'));return v?.version===1&&v.items&&v.heroes?v:null;}catch(_){return null;}
}
async function refreshAssets(userData,fetchJSON=getJSON){
  const [items,heroes]=await Promise.all(ASSET_ROUTES.map(r=>fetchJSON(r)));
  const assets={version:1,fetchedAt:Date.now(),...compactAssets(items,heroes)};
  if(Object.keys(assets.items).length<50||Object.keys(assets.heroes).length<20)throw new Error('Item or hero list from the match service looks incomplete');
  const file=assetsFile(userData),tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(assets),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);
  return assets;
}
// Raw matches stay in main-process memory only (they contain account IDs).
const rawCache=new Map();
async function loadMatch(userData,matchId,ownAccountId='',fetchJSON=getJSON){
  const id=String(matchId||'').trim(),own=String(ownAccountId||'').trim();
  if(!MATCH_ID.test(id))throw new Error('Enter a numeric match ID.');
  if(own&&!MATCH_ID.test(own))throw new Error('Your Steam friend code should be digits only.');
  let raw=rawCache.get(id);
  if(!raw){
    raw=await fetchJSON(`/v1/matches/${id}/metadata`);
    rawCache.set(id,raw);
    while(rawCache.size>5)rawCache.delete(rawCache.keys().next().value);
  }
  let assets=readAssets(userData);
  const stale=!assets||Date.now()-assets.fetchedAt>ASSET_MAX_AGE_MS;
  // A hero missing from the cached list means it is out of date. (Item IDs
  // can't be checked the same way: abilities share the purchase list.)
  const unknown=assets&&(raw.match_info?.players||[]).some(p=>!assets.heroes[String(p.hero_id)]);
  if(stale||unknown){try{assets=await refreshAssets(userData,fetchJSON);}catch(e){if(!assets)throw e;}}
  return normalizeMatch(raw,assets,own);
}
module.exports={getJSON,loadMatch,refreshAssets,readAssets,routeAllowed,friendlyStatus,MATCH_ID};
