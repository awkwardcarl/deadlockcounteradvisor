(function(root){
'use strict';
/** The player's chosen build, per hero: an ordered core path plus optional
 * situational items (never an automatic purchase queue). Saved locally in its
 * own storage key; no match state lives here. Pure and DOM-free: the caller
 * passes the storage object (localStorage or a stand-in) and the catalog.
 * Schema: {version:1, hero, name, playstyle, core:string[], optional:string[]}. */
const VERSION=1;
const STORAGE_KEY='deadlock-counter-advisor-build-context-v1';
const PLAYSTYLES=Object.freeze(['balanced','weapon','spirit','support']);
const MAX_CORE=12,MAX_OPTIONAL=12,MAX_ITEM_LEN=60,MAX_NAME_LEN=60,MAX_HERO_LEN=40,MAX_HEROES=100;
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
const empty=hero=>({version:VERSION,hero,name:'',playstyle:'balanced',core:[],optional:[]});
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
  const core=pick(context.core),optional=pick(context.optional);
  return {context,core,optional,unknown,completed};
}
root.DeadlockBuildContext={VERSION,STORAGE_KEY,PLAYSTYLES,MAX_CORE,MAX_OPTIONAL,normalize,load,save,resolve,norm};
})(typeof window!=='undefined'?window:globalThis);
