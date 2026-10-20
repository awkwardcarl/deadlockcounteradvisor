'use strict';
/** Public, user-triggered catalog sync. Never contacts Deadlock, Steam, or a local process. */
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const {compactSnapshot} = require('../js/snapshot.cjs');
const ORIGIN = 'https://deadlock.io';
const ROUTES = Object.freeze(['/api/v1/items.json', '/api/v1/heroes.json']);
function getJSON(route) {
  if (!ROUTES.includes(route)) return Promise.reject(new Error('Endpoint not allowlisted'));
  return new Promise((resolve,reject) => {
    let completed = false;
    const finish = (err, result) => { if(completed) return;completed=true;err?reject(err):resolve(result); };
    const req=https.get(ORIGIN+route,{timeout:24000,headers:{'Accept':'application/json','User-Agent':'DeadlockCounterAdvisor/0.4 (manual catalog sync)'}},res=>{
      if (res.statusCode !== 200) { res.resume();return finish(new Error(`Catalog source returned HTTP ${res.statusCode}`)); }
      if (!String(res.headers['content-type']||'').includes('json')) {res.resume();return finish(new Error('Unexpected catalog response type'));}
      let length=0;const chunks=[];
      res.on('data',b=>{ length+=b.length; if(length>20*1024*1024){req.destroy(new Error('Catalog exceeds size limit'));return;} chunks.push(b); });
      res.on('error',finish);
      res.on('end',()=>{ try { finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch(e) {finish(new Error('Could not decode catalog JSON'));} });
    });
    req.on('timeout',()=>req.destroy(new Error('Catalog request timed out')));
    req.on('error',finish);
  });
}
function catalogFile(userData){return path.join(userData,'item-catalog-v0.4.json');}
function readCache(userData){try {const v=JSON.parse(fs.readFileSync(catalogFile(userData),'utf8'));return v?.version===1 && Array.isArray(v.items) && Array.isArray(v.heroes)?v:null;}catch(_){return null;}}
async function refresh(userData){
  const [items, heroes]=await Promise.all([getJSON(ROUTES[0]),getJSON(ROUTES[1])]);
  const snapshot=compactSnapshot(items,heroes);
  const filename=catalogFile(userData),tmp=filename+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(snapshot),{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,filename);
  return snapshot;
}
// Attach the match service's hero names for IDs the public roster doesn't list
// yet, so live data can name brand-new heroes (resolved in js/engine.js).
function addFallbackHeroNames(snapshot,assets){
  if(!snapshot||!Array.isArray(snapshot.heroes))return snapshot;
  const known=new Set(snapshot.heroes.map(h=>String(h.id)));
  const names=assets&&typeof assets.heroes==='object'&&assets.heroes?assets.heroes:{};
  const extraHeroNames=Object.fromEntries(Object.entries(names).filter(([id,name])=>/^\d{1,5}$/.test(id)&&!known.has(id)&&typeof name==='string'&&name.trim()&&name.length<=40).map(([id,name])=>[id,name.trim()]));
  // Investment bonus tables from the game's hero data (see match-normalizer).
  const investment=assets&&assets.investment&&assets.investment.default?assets.investment:null;
  return {...snapshot,extraHeroNames,investment};
}
module.exports={getJSON,refresh,readCache,addFallbackHeroNames,ROUTES};
