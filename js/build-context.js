(function(root){
'use strict';
/** The player's chosen build, per hero: an ordered core path plus optional
 * situational items (never an automatic purchase queue). Saved locally in its
 * own storage key; no match state lives here. Pure and DOM-free: the caller
 * passes the storage object (localStorage or a stand-in) and the catalog.
 * Schema: {version:1, hero, name, playstyle, core:string[], optional:string[],
 * source:{buildId,version}|null} (source: the in-game build it was imported from). */
const VERSION=1;
const STORAGE_KEY='deadlock-counter-advisor-build-context-v1';
const PLAYSTYLES=Object.freeze(['balanced','weapon','spirit','support']);
// Community builds run 25-40 items (early items get sold later), so the core
// path holds a whole build.
const MAX_CORE=32,MAX_OPTIONAL=24,MAX_ITEM_LEN=60,MAX_NAME_LEN=60,MAX_HERO_LEN=40,MAX_HEROES=100;
// Same normalization as the engine: case, spacing and punctuation never matter.
const norm=x=>String(x||'').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,'');
const text=(x,max)=>typeof x==='string'?x.replace(/\s+/g,' ').trim().slice(0,max).trim():'';
// A list of item names or IDs: strings only (a comma string is split), trimmed,
// bounded, deduped case-insensitively, first spelling wins.
function itemList(x,max,skip=new Set()){
  const raw=Array.isArray(x)?x:typeof x==='string'?x.split(','):[];
  const out=[],seen=new Set(skip);
  for(const v of raw){
    const name=text(v,MAX_ITEM_LEN),key=norm(name);
    if(!key||seen.has(key))continue;
    seen.add(key);out.push(name);
    if(out.length>=max)break;
  }
  return out;
}
const empty=hero=>({version:VERSION,hero,name:'',playstyle:'balanced',core:[],optional:[],source:null});
const buildIdOk=id=>Number.isInteger(id)&&id>0&&id<1e10;
// A sanitized context for `hero`. A context saved for a different hero is not
// applied: the result is an empty plan for the requested hero. Without a
// requested hero the context keeps its own.
function normalize(raw,hero){
  const want=text(hero,MAX_HERO_LEN);
  const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const own=text(src.hero,MAX_HERO_LEN);
  if(want&&own&&norm(want)!==norm(own))return empty(want);
  const ctx=empty(want||own);
  ctx.name=text(src.name,MAX_NAME_LEN);
  const style=typeof src.playstyle==='string'?src.playstyle.trim().toLowerCase():'';
  ctx.playstyle=PLAYSTYLES.includes(style)?style:'balanced';
  ctx.core=itemList(src.core,MAX_CORE);
  // An item in the core path is not also optional.
  ctx.optional=itemList(src.optional,MAX_OPTIONAL,new Set(ctx.core.map(norm)));
  const id=Number(src.source?.buildId);
  if(buildIdOk(id))ctx.source={buildId:id,version:Math.max(0,Math.floor(Number(src.source.version)||0))};
  return ctx;
}
// The stored map {version, heroes:{normHero: context}}; anything unreadable is empty.
function readAll(storage){
  try{
    const raw=storage&&typeof storage.getItem==='function'?storage.getItem(STORAGE_KEY):null;
    const data=raw?JSON.parse(raw):null;
    if(data&&typeof data==='object'&&data.heroes&&typeof data.heroes==='object'&&!Array.isArray(data.heroes))return data.heroes;
  }catch(_){}
  return {};
}
function load(storage,hero){
  const key=norm(hero);
  if(!key)return normalize(null,hero);
  const all=readAll(storage);
  return normalize(Object.prototype.hasOwnProperty.call(all,key)?all[key]:null,hero);
}
// Saves the normalized context for `hero` (other heroes are kept) and returns it;
// a raw context naming a different hero saves an empty plan for `hero`.
// A storage failure is ignored: the returned context is still valid.
function save(storage,hero,raw){
  const ctx=normalize(raw,hero);
  const key=norm(ctx.hero);
  if(!key)return ctx;
  try{
    const all=readAll(storage),heroes={};
    for(const [k,v] of Object.entries(all))if(k!==key&&norm(k)===k&&v&&typeof v==='object')heroes[k]=v;
    const keys=Object.keys(heroes);
    for(const k of keys.slice(0,Math.max(0,keys.length-(MAX_HEROES-1))))delete heroes[k];
    heroes[key]=ctx;
    if(storage&&typeof storage.setItem==='function')storage.setItem(STORAGE_KEY,JSON.stringify({version:VERSION,heroes}));
  }catch(_){}
  return ctx;
}
// Resolve the context against the catalog and what you own. Returns
// {context, core, optional, unknown, completed}: core/optional are the
// remaining catalog items in chosen order; unknown are selections the catalog
// does not know (kept, so a later catalog sync can recover them); completed
// are selections you own, directly or as a component of an upgrade you own.
// hero (optional): the current hero; a context for another hero resolves empty.
function resolve(raw,catalog,owned,hero){
  const context=normalize(raw,hero);
  const items=Array.isArray(catalog?.items)?catalog.items.filter(i=>i&&typeof i.name==='string'):[];
  const byId=new Map(),byName=new Map();
  for(const i of items){
    if(i.id!=null){const id=String(i.id);if(!byId.has(id))byId.set(id,i);if(!byName.has(norm(id)))byName.set(norm(id),i);}
  }
  // Names win over normalized IDs when both could match.
  for(const i of items)byName.set(norm(i.name),i);
  const find=v=>byId.get(String(v))||byName.get(norm(v))||null;
  const ownedList=Array.isArray(owned)?owned:typeof owned==='string'?owned.split(','):[];
  const have=new Set(),haveText=new Set(),stack=[];
  for(const v of ownedList){
    if(typeof v!=='string'&&typeof v!=='number')continue;
    const key=norm(v);if(!key)continue;
    haveText.add(key);
    const item=find(String(v).trim());if(item)stack.push(item);
  }
  // Owning an upgrade covers its components, transitively; `have` guards cycles.
  while(stack.length){
    const item=stack.pop();
    if(have.has(item))continue;
    have.add(item);
    for(const c of Array.isArray(item.components)?item.components:[]){const comp=find(c);if(comp&&!have.has(comp))stack.push(comp);}
  }
  const unknown=[],completed=[],seen=new Set();
  const pick=list=>{
    const out=[];
    for(const v of list){
      const item=find(v);
      if(!item){(haveText.has(norm(v))?completed:unknown).push(v);continue;}
      if(seen.has(item))continue;
      seen.add(item);
      if(have.has(item))completed.push(item.name);else out.push(item);
    }
    return out;
  };
  // Your place in the build is the furthest core item you own. Earlier core
  // items you don't own are behind you (sold, like early items, or skipped):
  // they count as done and are never suggested again.
  const coreLeft=pick(context.core),passed=[];
  let furthest=-1;
  context.core.forEach((v,i)=>{const item=find(v);if(item?have.has(item):haveText.has(norm(v)))furthest=i;});
  const core=coreLeft.filter(item=>{
    const at=context.core.findIndex(v=>find(v)===item);
    if(at>=0&&at<furthest){passed.push(item.name);completed.push(item.name);return false;}
    return true;
  });
  const optional=pick(context.optional);
  return {context,core,optional,unknown,completed,passed};
}
// A build ID from what the player pasted: the number itself, or a link or
// text with one ("build 12345", "...?build_id=12345", ".../builds/12345").
// Ambiguous text (several numbers, none labelled as the build) gives null.
function parseBuildCode(input){
  const s=typeof input==='string'?input.trim().slice(0,300):Number.isInteger(input)?String(input):'';
  if(!s)return null;
  const pick=v=>{const n=Number(v);return buildIdOk(n)?n:null;};
  if(/^#?\d{1,10}$/.test(s))return pick(s.replace('#',''));
  const labelled=s.match(/build(?:s|_?id)?\s*(?:[#:=/-]\s*|\s+)(\d{1,10})(?!\d)/i);
  if(labelled)return pick(labelled[1]);
  const nums=s.match(/\d{3,10}/g)||[];
  return nums.length===1?pick(nums[0]):null;
}
// Categories whose name marks them as situational rather than the path.
const SITUATIONAL=/situational|optional|flex|counter|altern|options?\b|swap|replace|if needed|depending|vs\.?\s/i;
// A saved build from an in-game build (the main process's compactBuild:
// {buildId,version,heroId,name,categories:[{name,optional,items:[class ids]}]}).
// Path categories become core items in order; categories the author marked
// optional, or named situational, become optional. Core beyond MAX_CORE moves
// to the front of optional; beyond that is dropped and counted. Items are
// stored by catalog name (IDs the catalog doesn't know are kept as IDs).
function fromCommunity(build,catalog,hero,keep={}){
  if(!build||typeof build!=='object'||!Array.isArray(build.categories))return null;
  const byId=new Map((catalog?.items||[]).map(i=>[String(i.id),i.name]));
  const nameOf=id=>byId.get(String(id))||String(id);
  const core=[],optional=[],seen=new Set();
  for(const cat of build.categories){
    const side=cat?.optional===true||SITUATIONAL.test(String(cat?.name||''))?optional:core;
    for(const id of Array.isArray(cat?.items)?cat.items:[]){
      const name=nameOf(id),key=norm(name);
      if(!key||seen.has(key))continue;
      seen.add(key);side.push(name);
    }
  }
  const spill=core.splice(MAX_CORE);
  const extra=[...spill,...optional];
  const ctx=normalize({hero,name:build.name,playstyle:keep.playstyle,core,optional:extra.slice(0,MAX_OPTIONAL),
    source:{buildId:build.buildId,version:build.version}},hero);
  return {context:ctx,dropped:Math.max(0,extra.length-MAX_OPTIONAL),moved:spill.length};
}
root.DeadlockBuildContext={VERSION,STORAGE_KEY,PLAYSTYLES,MAX_CORE,MAX_OPTIONAL,normalize,load,save,resolve,norm,parseBuildCode,fromCommunity};
})(typeof window!=='undefined'?window:globalThis);
