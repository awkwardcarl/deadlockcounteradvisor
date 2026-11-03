'use strict';
/** Build data for the advisor from the community API (api.deadlock-api.com,
 * MIT licensed):
 *  - community builds: popular, recently updated in-game builds for your hero,
 *    reduced to which items appear in which stage (laning / mid / late);
 *  - item statistics from recent matches (all ranks): how often players on
 *    your hero buy each item in each phase and how often they win, plus, for
 *    laning, the same against your lane opponents.
 * Requests carry hero IDs only. Descriptions and author IDs are never kept;
 * the names of the top few builds are, so you can pick one to follow.
 * Importing one build by its in-game build ID (importBuild) sends only that ID. Results are cached for 12 hours and used offline when stale.
 * Main process only. */
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');

const ORIGIN='https://api.deadlock-api.com';
const CACHE_MS=12*60*60*1000;
const BUILD_MAX_AGE_DAYS=45;
const BUILD_LIMIT=20;
const MIN_MATCHES=200;      // per item, hero-wide phase stats
const MIN_MATCHUP_MATCHES=40;
// Purchase-time windows that match the advisor's phases (seconds).
const PHASE_WINDOWS=Object.freeze({laning:'&max_bought_at_s=600',mid:'&min_bought_at_s=600&max_bought_at_s=1500',late:'&min_bought_at_s=1500'});
const ROUTES=[
  /^\/v1\/builds\?hero_id=\d{1,4}&only_latest=true&sort_by=favorites&sort_direction=desc&limit=\d{1,3}&build_language=English&min_unix_timestamp=\d{1,12}$/,
  /^\/v1\/builds\?build_id=\d{1,10}&only_latest=true$/,
  /^\/v1\/analytics\/item-stats\?hero_ids=\d{1,4}&min_matches=\d{1,6}(?:&min_bought_at_s=\d{1,5})?(?:&max_bought_at_s=\d{1,5})?(?:&enemy_hero_ids=\d{1,4}(?:,\d{1,4}){0,5}&same_lane_filter=true)?$/
];
const routeAllowed=route=>ROUTES.some(rx=>rx.test(route));
const heroIdOk=id=>Number.isInteger(id)&&id>0&&id<10000;

function buildsRoute(heroId,now=Date.now()){
  const since=Math.floor(now/1000)-BUILD_MAX_AGE_DAYS*86400;
  return `/v1/builds?hero_id=${heroId}&only_latest=true&sort_by=favorites&sort_direction=desc&limit=${BUILD_LIMIT}&build_language=English&min_unix_timestamp=${since}`;
}
const BUILD_PICKS=8;
const buildIdOk=id=>Number.isInteger(id)&&id>0&&id<1e10;
function buildRoute(buildId){return `/v1/builds?build_id=${buildId}&only_latest=true`;}
// A build name for display: no control, zero-width or text-direction
// characters, at most 60 characters.
const HIDDEN=[[0,31],[127,159],[0x200b,0x200f],[0x202a,0x202e],[0x2066,0x2069]];
const hidden=ch=>{const n=ch.codePointAt(0);return HIDDEN.some(([a,b])=>n>=a&&n<=b);};
const cleanName=v=>typeof v==='string'?[...v].map(ch=>hidden(ch)?' ':ch).join('').replace(/\s+/g,' ').trim().slice(0,60):'';
function itemStatsRoute(heroId,phase,enemyIds=[]){
  const vs=enemyIds.length?`&enemy_hero_ids=${enemyIds.join(',')}&same_lane_filter=true`:'';
  return `/v1/analytics/item-stats?hero_ids=${heroId}&min_matches=${enemyIds.length?MIN_MATCHUP_MATCHES:MIN_MATCHES}${PHASE_WINDOWS[phase]}${vs}`;
}

function getJSON(route,{httpsModule=https,maxBytes=6*1024*1024}={}){
  if(!routeAllowed(route))return Promise.reject(new Error('Endpoint not allowlisted'));
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err,value)=>{if(done)return;done=true;err?reject(err):resolve(value);};
    const req=httpsModule.get(ORIGIN+route,{timeout:20000,headers:{'Accept':'application/json','User-Agent':'DeadlockCounterAdvisor (build data)'}},res=>{
      if(res.statusCode!==200){res.resume();return finish(new Error(`Build data service returned HTTP ${res.statusCode}`));}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('Response exceeds size limit'));return;}chunks.push(chunk);});
      res.on('error',finish);
      res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(_){finish(new Error('Could not decode build data'));}});
    });
    req.on('timeout',()=>req.destroy(new Error('Build data service did not respond in time')));
    req.on('error',e=>finish(new Error(/size limit|did not respond/.test(e.message||'')?e.message:'Could not reach the build data service')));
  });
}

// Which advisor phase a build stage belongs to: the game's own stage tags
// (#Citadel_HeroBuilds_Lane / EarlyGame / MidGame / LateGame) or common words,
// else the stage's position in the build.
function stageOf(name,index,count){
  const n=String(name||'').toLowerCase();
  if(/lane|laning|early|start|opening|500/.test(n))return 'laning';
  if(/late|luxury|end ?game|final/.test(n))return 'late';
  if(/mid/.test(n))return 'mid';
  const at=count>1?index/(count-1):0;
  return at<.34?'laning':at<.67?'mid':'late';
}
const className=(itemsById,id)=>{const c=itemsById?.[String(id)]?.c;return typeof c==='string'&&/^upgrade_\w{1,80}$/.test(c)?c:null;};

function compactBuilds(raw,itemsById){
  const list=(Array.isArray(raw)?raw:[]).slice(0,BUILD_LIMIT);
  const stages={laning:{},mid:{},late:{}};
  const picks=[];
  let count=0;
  for(const entry of list){
    const categories=entry?.hero_build?.details?.mod_categories;
    if(!Array.isArray(categories)||!categories.length)continue;
    const hb=entry.hero_build,id=Number(hb.hero_build_id);
    if(picks.length<BUILD_PICKS&&buildIdOk(id)&&!picks.some(p=>p.id===id))picks.push({id,version:Number(hb.version)||0,name:cleanName(hb.name)||`Build ${id}`});
    const seen={laning:new Set(),mid:new Set(),late:new Set()};
    categories.slice(0,12).forEach((cat,i,all)=>{
      const stage=stageOf(cat?.name,i,all.length);
      for(const mod of (Array.isArray(cat?.mods)?cat.mods:[]).slice(0,24)){const c=className(itemsById,mod?.ability_id);if(c)seen[stage].add(c);}
    });
    if(!seen.laning.size&&!seen.mid.size&&!seen.late.size)continue;
    count++;
    for(const stage of Object.keys(seen))for(const c of seen[stage])stages[stage][c]=(stages[stage][c]||0)+1;
  }
  // Share of builds that include each item in each stage.
  for(const stage of Object.keys(stages))for(const c of Object.keys(stages[stage]))stages[stage][c]=Math.round(stages[stage][c]/count*100)/100;
  return {count,stages,list:picks};
}
// One build, ready to follow: its categories in order with item class names
// (upgrade_*), and whether the author marked each category optional.
function compactBuild(raw,itemsById){
  const entry=(Array.isArray(raw)?raw:[]).find(e=>e?.hero_build);
  const hb=entry?.hero_build;
  const id=Number(hb?.hero_build_id),heroId=Number(hb?.hero_id);
  const cats=hb?.details?.mod_categories;
  if(!buildIdOk(id)||!Number.isInteger(heroId)||!Array.isArray(cats))return null;
  const categories=cats.slice(0,16).map(cat=>({
    name:cleanName(cat?.name),optional:cat?.optional===true,
    items:[...new Set((Array.isArray(cat?.mods)?cat.mods:[]).slice(0,24).map(m=>className(itemsById,m?.ability_id)).filter(Boolean))]
  })).filter(c=>c.items.length);
  if(!categories.length)return null;
  return {buildId:id,version:Number(hb.version)||0,heroId,name:cleanName(hb.name)||`Build ${id}`,categories};
}
function compactItemStats(rows,itemsById){
  const out={};
  for(const r of (Array.isArray(rows)?rows:[]).slice(0,400)){
    const c=className(itemsById,r?.item_id),m=Number(r?.matches),w=Number(r?.wins);
    if(c&&Number.isFinite(m)&&Number.isFinite(w)&&m>0&&w>=0&&w<=m)out[c]={m,w};
  }
  return out;
}

function cacheFile(userData){return path.join(userData,'build-data-v1.json');}
function readCache(userData){try{const c=JSON.parse(fs.readFileSync(cacheFile(userData),'utf8'));return c&&c.version===1?c:{version:1,heroes:{},matchups:{}};}catch(_){return {version:1,heroes:{},matchups:{}};}}
function writeCache(userData,cache){
  // Keep the cache small: the 12 most recent heroes and 24 most recent lane matchups.
  const trim=obj=>Object.fromEntries(Object.entries(obj).sort((a,b)=>b[1].fetchedAt-a[1].fetchedAt).slice(0,obj===cache.heroes?12:24));
  const data={version:1,heroes:trim(cache.heroes),matchups:trim(cache.matchups)};
  const file=cacheFile(userData),tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,file);
}

function createBuildData({userData,readAssets,refreshAssets,fetchJSON=getJSON,now=()=>Date.now()}){
  const inFlight=new Map();
  async function itemsById(){
    let assets=readAssets(userData);
    if(!assets?.items){try{assets=await refreshAssets(userData);}catch(_){}}
    return assets?.items||null;
  }
  async function fetchHero(heroId,items){
    const [builds,...phases]=await Promise.allSettled([fetchJSON(buildsRoute(heroId,now())),...Object.keys(PHASE_WINDOWS).map(p=>fetchJSON(itemStatsRoute(heroId,p)))]);
    if(builds.status!=='fulfilled'&&phases.every(p=>p.status!=='fulfilled'))throw new Error('Build data is unavailable right now');
    const stats={};
    Object.keys(PHASE_WINDOWS).forEach((p,i)=>{if(phases[i].status==='fulfilled')stats[p]=compactItemStats(phases[i].value,items);});
    return {fetchedAt:now(),builds:builds.status==='fulfilled'?compactBuilds(builds.value,items):{count:0,stages:{laning:{},mid:{},late:{}}},stats};
  }
  // Returns cached data when fresh; otherwise fetches, falling back to stale
  // cache if the service can't be reached.
  async function get(heroId,laneEnemyIds=[]){
    if(!heroIdOk(heroId))return null;
    const enemies=[...new Set(laneEnemyIds.filter(heroIdOk))].sort((a,b)=>a-b).slice(0,6);
    const key=`${heroId}|${enemies.join(',')}`;
    if(inFlight.has(key))return inFlight.get(key);
    const job=(async()=>{
      const cache=readCache(userData),t=now();
      let hero=cache.heroes[heroId],matchup=enemies.length?cache.matchups[key]:null,error='';
      const items=(!hero||t-hero.fetchedAt>CACHE_MS||(enemies.length&&(!matchup||t-matchup.fetchedAt>CACHE_MS)))?await itemsById():null;
      if(items&&(!hero||t-hero.fetchedAt>CACHE_MS)){
        try{hero=await fetchHero(heroId,items);cache.heroes[heroId]=hero;}catch(e){error=e.message;}
      }
      if(items&&enemies.length&&(!matchup||t-matchup.fetchedAt>CACHE_MS)){
        try{matchup={fetchedAt:now(),laning:compactItemStats(await fetchJSON(itemStatsRoute(heroId,'laning',enemies)),items)};cache.matchups[key]=matchup;}catch(e){error=error||e.message;}
      }
      try{writeCache(userData,cache);}catch(_){}
      if(!hero)return error?{heroId,error}:null;
      return {heroId,laneEnemyIds:enemies,fetchedAt:hero.fetchedAt,builds:hero.builds,stats:hero.stats,matchup:matchup?.laning||null,stale:t-hero.fetchedAt>CACHE_MS,error};
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,job);
    return job;
  }
  // A build by its in-game ID (from the build browser or a pasted link). Not
  // cached: the player asks for it once and saves the result as their build.
  async function importBuild(buildId){
    if(!buildIdOk(buildId))return {error:'That is not a build ID'};
    const items=await itemsById();
    if(!items)return {error:'Item data is unavailable: sync items & heroes first'};
    let raw;
    try{raw=await fetchJSON(buildRoute(buildId));}catch(e){return {error:e.message||'Could not reach the build data service'};}
    const build=compactBuild(raw,items);
    return build||{error:`No build found with ID ${buildId}`};
  }
  return {get,importBuild};
}
module.exports={createBuildData,compactBuilds,compactBuild,buildRoute,compactItemStats,stageOf,buildsRoute,itemStatsRoute,routeAllowed,getJSON,CACHE_MS,PHASE_WINDOWS};
