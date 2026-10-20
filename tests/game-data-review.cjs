'use strict';
// Daily game-data review (.github/workflows/game-data-review.yml). Fetches the
// deadlock.io hero and item lists the app syncs (plus deadlock-api's hero
// list, which names released heroes deadlock.io doesn't list yet: it can lag a
// patch by days; no match endpoints), diffs them against the
// curated tables (hero profiles in js/catalog.js; COUNTERS, MATCHUPS,
// ABILITY_CUES and friends in js/engine.js) and the reviewed snapshot
// (tests/fixtures/catalog-snapshot.json), and opens or updates one issue,
// "Game data needs review". With no differences it does nothing.
// Local run: node tests/game-data-review.cjs --dry-run (prints the issue).
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {getJSON,ROUTES}=require('../desktop/data-service.cjs');
const matchService=require('../desktop/match-service.cjs');
const {compactSnapshot}=require('../js/snapshot.cjs');
const TITLE='Game data needs review';
const root=path.resolve(__dirname,'..');
const md=x=>String(x).replace(/[\\`*_[\]<>|]/g,'\\$&');
function loadCurated(){
  const ctx=vm.createContext({});
  for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
  return {base:ctx.DeadlockCatalog,E:ctx.DeadlockEngine};
}
// Playable, enabled heroes from deadlock-api's hero list (it also lists
// unreleased and internal ones).
async function listedHeroes(fetchJSON){
  const list=await fetchJSON('/v1/assets/heroes');
  return (Array.isArray(list)?list:[]).filter(h=>h&&h.player_selectable===true&&h.disabled!==true&&Number.isInteger(h.id)&&typeof h.name==='string'&&h.name.trim()).map(h=>({id:h.id,name:h.name.trim().slice(0,60)}));
}
// live and reviewed are compacted snapshots (js/snapshot.cjs); listed is
// deadlock-api's playable heroes.
function reviewGameData(live,reviewed,{base,E},listed=[]){
  const norm=E.norm,ids=new Set(live.items.map(i=>i.id)),names=new Set(live.items.map(i=>norm(i.name)));
  const roster=new Set(live.heroes.map(h=>h.name)),kits=new Map(live.heroes.map(h=>[h.name,h.abilities||[]]));
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  // Released heroes with no reviewed profile (archetype tags).
  const onSite=new Set(live.heroes.map(h=>norm(h.name))),siteIds=new Set(live.heroes.map(h=>h.id));
  const extra=listed.filter(h=>!onSite.has(norm(h.name))&&!siteIds.has(h.id)).map(h=>({...h,source:'deadlock-api'}));
  const heroes=[...live.heroes,...extra].filter(h=>!(base.heroes[h.name]||[]).length).map(h=>({name:h.name,id:h.id,why:has(base.heroes,h.name)?'no archetype tags':'not in the hero profiles',source:h.source||'deadlock.io'}));
  const released=new Set([...roster,...extra.map(h=>h.name)]);
  // Curated references: item IDs and shop names.
  const idTables={COUNTERS:Object.keys(E.COUNTERS),OWN_AFFINITY:Object.keys(E.OWN_AFFINITY),'MATCHUPS items':[...new Set(Object.values(E.MATCHUPS).flatMap(m=>Object.keys(m.items)))],
    ANTI_HEAL:Object.keys(E.ANTI_HEAL),RESIST:[...new Set(Object.values(E.RESIST).flatMap(r=>[...Object.keys(r.protect),...Object.keys(r.shred)]))]};
  const nameTables={enemyItems:Object.keys(base.enemyItems),PURCHASE_PATTERNS:[...new Set(E.PURCHASE_PATTERNS.flatMap(p=>p.items))],counterItems:base.counterItems.map(x=>x.name)};
  const curatedIds=new Set(Object.values(idTables).flat()),curatedNames=new Set(Object.values(nameTables).flat().map(norm));
  // Shop items the reviewed snapshot doesn't have and no curated table covers.
  const seen=new Set(reviewed.items.map(i=>i.id));
  const items=live.items.filter(i=>!seen.has(i.id)&&!curatedIds.has(i.id)&&!curatedNames.has(norm(i.name))).map(i=>({name:i.name,id:i.id,category:i.category,tier:i.tier,group:i.group}));
  // Curated entries the game no longer matches (removed or renamed).
  const stale=[
    ...Object.entries(idTables).flatMap(([table,list])=>list.filter(id=>!ids.has(id)).map(id=>`\`${table}\`: \`${id}\` is not in the shop`)),
    ...Object.entries(nameTables).flatMap(([table,list])=>list.filter(n=>!names.has(norm(n))).map(n=>`\`${table}\`: "${md(n)}" is not in the shop`)),
    ...[...new Set([...Object.keys(E.MATCHUPS),...Object.keys(E.ABILITY_CUES)])].filter(n=>!released.has(n)).map(n=>`\`MATCHUPS\`/\`ABILITY_CUES\`: ${md(n)} is not a released hero`),
    ...Object.entries(E.ABILITY_CUES).filter(([hero])=>roster.has(hero)).flatMap(([hero,cues])=>cues.filter(c=>!kits.get(hero).includes(c.name)).map(c=>`\`ABILITY_CUES\`: ${md(hero)} has no ability "${md(c.name)}"`))
  ];
  // Shop groups the engine has no threat mapping for.
  const counts=new Map();
  for(const i of live.items)if(i.group&&!has(E.ENEMY_GROUPS,i.group))counts.set(i.group,(counts.get(i.group)||0)+1);
  const groups=[...counts].map(([group,count])=>({group,count}));
  return {heroes,items,stale,groups};
}
const hasDiff=d=>!!(d.heroes.length||d.items.length||d.stale.length||d.groups.length);
// Same data, same text: the issue is only edited when the findings change.
function issueBody(diff,live,reviewed){
  const section=(title,list)=>list.length?[`### ${title} (${list.length})`,...list.map(x=>'- '+x),'']:[];
  return [
    '<!-- game-data-review -->',
    `The daily check found game data the curated tables don't cover yet. Live: deadlock.io build ${md(live.build||'unknown')} (generated ${md(String(live.generatedAt).slice(0,10))}). Reviewed snapshot: build ${md(reviewed.build||'unknown')}.`,
    '',
    'The app already picks these up on its own (names, prices and icons, with counters based on what players buy). Reviewed profiles and rules ship with a release.',
    '',
    ...section('Heroes without a reviewed profile',diff.heroes.map(h=>`**${md(h.name)}** (ID ${h.id}): ${h.why} in \`js/catalog.js\`${h.source==='deadlock-api'?' (not on deadlock.io yet; named by deadlock-api)':''}`)),
    ...section('Shop items new since the reviewed snapshot',diff.items.map(i=>`**${md(i.name)}** (\`${i.id}\`): ${i.category}, tier ${i.tier}${i.group?`, group \`${i.group}\``:''}`)),
    ...section('Curated entries that no longer match the game',diff.stale),
    ...section('Shop groups without a threat mapping',diff.groups.map(g=>`\`${g.group}\` (${g.count} ${g.count===1?'item':'items'}): add it to \`ENEMY_GROUPS\` in \`js/engine.js\``)),
    'When done: update the curated tables, run `npm run fixture:update` so the snapshot marks this build as reviewed, then `npm test`. This issue is updated while differences remain; close it once the release ships.'
  ].join('\n');
}
// One open issue with this title: opened, updated when its text changes, or left alone.
async function upsertIssue(body,{token,repo,fetchImpl=globalThis.fetch,api='https://api.github.com'}){
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'deadlockcounteradvisor-game-data-review'};
  const call=async(method,route,data)=>{
    const res=await fetchImpl(api+route,{method,headers:data?{...headers,'Content-Type':'application/json'}:headers,body:data?JSON.stringify(data):undefined});
    if(!res.ok)throw new Error(`GitHub ${method} ${route.split('?')[0]} returned HTTP ${res.status}`);
    return res.json();
  };
  const open=await call('GET',`/repos/${repo}/issues?state=open&per_page=100`);
  const existing=(Array.isArray(open)?open:[]).find(i=>i.title===TITLE&&!i.pull_request);
  const same=x=>String(x||'').replace(/\r\n/g,'\n').trim()===body.trim();
  if(existing&&same(existing.body))return {action:'unchanged',number:existing.number};
  if(existing){await call('PATCH',`/repos/${repo}/issues/${existing.number}`,{body});return {action:'updated',number:existing.number};}
  const made=await call('POST',`/repos/${repo}/issues`,{title:TITLE,body});
  return {action:'opened',number:made.number};
}
async function main({argv=process.argv.slice(2),env=process.env,fetchJSON=getJSON,fetchAssets=matchService.getJSON,fetchImpl=globalThis.fetch,log=console.log}={}){
  const [items,heroes]=await Promise.all(ROUTES.map(route=>fetchJSON(route)));
  const live=compactSnapshot(items,heroes);
  let listed=[];
  try{listed=await listedHeroes(fetchAssets);}catch(e){log(`deadlock-api hero list unavailable (${e.message}); checking deadlock.io only.`);}
  const reviewed=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','catalog-snapshot.json'),'utf8'));
  const diff=reviewGameData(live,reviewed,loadCurated(),listed);
  if(!hasDiff(diff)){log(`Game data (build ${live.build||'unknown'}) matches the curated tables; nothing to do.`);return {action:'none'};}
  const body=issueBody(diff,live,reviewed);
  if(argv.includes('--dry-run')){log(body);return {action:'dry-run',body};}
  if(!env.GITHUB_TOKEN||!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY||''))throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required (or pass --dry-run)');
  const result=await upsertIssue(body,{token:env.GITHUB_TOKEN,repo:env.GITHUB_REPOSITORY,fetchImpl});
  log(`Issue #${result.number} ${result.action}: ${diff.heroes.length} heroes, ${diff.items.length} items, ${diff.stale.length} stale entries, ${diff.groups.length} groups.`);
  return result;
}
if(require.main===module)main().catch(e=>{console.error('Game data review failed:',e.message);process.exit(1);});
module.exports={reviewGameData,listedHeroes,hasDiff,issueBody,upsertIssue,loadCurated,main,TITLE};
