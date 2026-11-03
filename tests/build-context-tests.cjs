'use strict';
// The player's chosen build per hero: sanitized, saved locally per hero,
// resolved against the catalog (names or IDs, case-insensitive), with owned
// upgrades covering their components and unknown picks kept for later syncs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/build-context.js','js/engine.js'])vm.runInContext(read(file),ctx);
const B=ctx.DeadlockBuildContext,E=ctx.DeadlockEngine,snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(ctx.DeadlockCatalog,snapshot);
const names=list=>list.map(r=>r.name).join();
const json=x=>JSON.stringify(x);

// Module shape.
test(B&&typeof B.normalize==='function'&&typeof B.load==='function'&&typeof B.save==='function'&&typeof B.resolve==='function','exports normalize, load, save, resolve');
test(json(B.PLAYSTYLES)==='["balanced","weapon","spirit","support"]'&&Object.isFrozen(B.PLAYSTYLES),'playstyles: balanced, weapon, spirit, support (frozen)');
test(typeof B.STORAGE_KEY==='string'&&B.STORAGE_KEY!=='deadlock-counter-advisor-desktop-v0.2','its own storage key, separate from the match state');
test(!/\b(document|localStorage|window)\./.test(read('js/build-context.js')),'pure: no DOM or direct localStorage use');

// normalize.
const n0=B.normalize(null,'Shiv');
test(json(n0)===json({version:1,hero:'Shiv',name:'',playstyle:'balanced',core:[],optional:[],source:null}),'nothing saved: an empty balanced plan for the hero');
test(json(B.normalize('junk','Shiv'))===json(n0)&&json(B.normalize([1,2],'Shiv'))===json(n0)&&json(B.normalize(42,'Shiv'))===json(n0),'non-object input is an empty plan');
const n1=B.normalize({hero:'shiv',name:'  My   build  ',playstyle:'WEAPON',core:['Rapid Rounds',' rapid rounds ',7,null,{},'','Headshot Booster'],optional:['Headshot booster','Extra Health',false]},'Shiv');
test(n1.hero==='Shiv'&&n1.name==='My build'&&n1.playstyle==='weapon','hero spelling from the request, tidy name, playstyle case-insensitive');
test(json(n1.core)==='["Rapid Rounds","Headshot Booster"]','core: strings only, trimmed, deduped case-insensitively, order kept');
test(json(n1.optional)==='["Extra Health"]','optional drops non-strings and anything already in the core path');
test(B.normalize({playstyle:'tank'},'Shiv').playstyle==='balanced'&&B.normalize({playstyle:3},'Shiv').playstyle==='balanced','unknown playstyle falls back to balanced');
const many=Array.from({length:40},(_,i)=>'Item '+i);
const n2=B.normalize({core:many,optional:many.slice().reverse(),name:'x'.repeat(500)},'Shiv');
test(B.MAX_CORE===32&&B.MAX_OPTIONAL===24&&n2.core.length===32&&n2.optional.length===8&&n2.core[0]==='Item 0'&&B.normalize({optional:many},'Shiv').optional.length===24,'core and optional are capped (32 and 24)');
test(n2.optional.every(x=>!n2.core.includes(x))&&n2.name.length<=60,'optional never repeats core; name is bounded');
test(B.normalize({core:['y'.repeat(300)]},'Shiv').core[0].length<=60,'item text is bounded');
test(json(B.normalize({core:'Rapid Rounds, Headshot Booster'},'Shiv').core)==='["Rapid Rounds","Headshot Booster"]','a comma string is accepted as a list');
test(json(B.normalize({hero:'Haze',core:['Rapid Rounds']},'Shiv'))===json(n0),'a context for another hero is not applied: empty plan for the requested hero');
test(B.normalize({hero:'Haze',core:['Rapid Rounds']}).hero==='Haze','no requested hero: the context keeps its own');
const frozenIn={hero:'Shiv',core:['A']};B.normalize(frozenIn,'Shiv').core.push('B');
test(json(frozenIn.core)==='["A"]','normalize never mutates its input');

// load / save.
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};}
const s=memory();
const saved=B.save(s,'Shiv',{name:'Lane',playstyle:'spirit',core:['Extra Spirit','extra spirit'],optional:['Extra Health']});
test(saved.hero==='Shiv'&&json(saved.core)==='["Extra Spirit"]'&&saved.playstyle==='spirit','save returns the normalized context');
B.save(s,'Haze',{core:['Rapid Rounds']});
test(json(B.load(s,'Shiv'))===json(saved)&&json(B.load(s,'shiv'))===json({...saved,hero:'shiv'}),'load returns the saved context, hero case-insensitive');
test(json(B.load(s,'Haze').core)==='["Rapid Rounds"]'&&B.load(s,'Abrams').core.length===0,'per hero: other heroes are kept; an unsaved hero is empty');
test([...s.map.keys()].join()===B.STORAGE_KEY,'everything lives under the one storage key');
const stored=JSON.parse(s.map.get(B.STORAGE_KEY));
test(!('enemies' in stored)&&Object.values(stored.heroes).every(c=>Object.keys(c).sort().join()==='core,hero,name,optional,playstyle,source,version'),'only build preferences are stored (no match state)');
test(B.save(s,'Shiv',{hero:'Haze',core:['Rapid Rounds']}).core.length===0,'saving another hero\'s context for this hero stores an empty plan');
const throwing={getItem(){throw new Error('denied');},setItem(){throw new Error('full');}};
test(B.load(throwing,'Shiv').core.length===0&&B.load(null,'Shiv').core.length===0&&B.load(undefined,'Shiv').hero==='Shiv'&&B.load({},'Shiv').core.length===0,'load tolerates a throwing, missing or odd storage');
test(json(B.save(throwing,'Shiv',{core:['Extra Spirit']}).core)==='["Extra Spirit"]'&&B.save(null,'Shiv',{core:['A']}).core[0]==='A','save tolerates storage failure and still returns the context');
const bad=memory();bad.setItem(B.STORAGE_KEY,'{not json');
test(B.load(bad,'Shiv').core.length===0,'corrupt saved data loads as an empty plan');
B.save(bad,'Shiv',{core:['A']});
test(json(B.load(bad,'Shiv').core)==='["A"]','saving over corrupt data recovers');
bad.setItem(B.STORAGE_KEY,JSON.stringify({heroes:{shiv:{hero:'Haze',core:['X']}}}));
test(B.load(bad,'Shiv').core.length===0,'a stored context naming another hero is not applied');
bad.setItem(B.STORAGE_KEY,JSON.stringify({heroes:{shiv:{core:Array.from({length:50},(_,i)=>'I'+i),playstyle:'nope'}}}));
test(B.load(bad,'Shiv').core.length===B.MAX_CORE&&B.load(bad,'Shiv').playstyle==='balanced','loaded data is re-normalized (bounds, playstyle)');
test(B.load(s,'').hero===''&&B.save(memory(),'',{core:['A']}).hero==='','no hero: nothing is stored or loaded');

// resolve against the real catalog.
const byId=new Map(snapshot.items.map(i=>[i.id,i]));
const byName=new Map(snapshot.items.map(i=>[i.name,i]));
// A two-level chain from the fixture: Boundless Spirit <- Improved Spirit <- Extra Spirit.
const top=byName.get('Boundless Spirit'),mid=byId.get(top.components[0]),base=byId.get(mid.components[0]);
test(mid.name==='Improved Spirit'&&base.name==='Extra Spirit','fixture chain: Boundless Spirit <- Improved Spirit <- Extra Spirit');
const plan={hero:'Shiv',core:['extra spirit',mid.id,'Boundless Spirit','Not A Real Item'],optional:['HEADSHOT BOOSTER','Mystery Thing']};
const r0=B.resolve(plan,catalog,[],'Shiv');
test(names(r0.core)==='Extra Spirit,Improved Spirit,Boundless Spirit','core: catalog items in chosen order, matched by name (any case) or ID');
test(r0.core.every(i=>byId.has(i.id)&&typeof i.cost==='number'),'core entries are the catalog item objects');
test(names(r0.optional)==='Headshot Booster','optional resolves the same way');
test(json(r0.unknown)==='["Not A Real Item","Mystery Thing"]'&&r0.completed.length===0,'unknown selections are kept by name');
test(json(r0.context.core)===json(plan.core),'the context keeps the raw selections, so a later catalog sync can recover unknowns');
const r1=B.resolve(plan,catalog,['Boundless Spirit'],'Shiv');
test(names(r1.core)===''&&json(r1.completed)==='["Extra Spirit","Improved Spirit","Boundless Spirit"]','owning an upgrade completes its components, transitively');
const r2=B.resolve(plan,catalog,'improved spirit, Headshot Booster','Shiv');
test(names(r2.core)==='Boundless Spirit'&&names(r2.optional)===''&&json(r2.completed)==='["Extra Spirit","Improved Spirit","Headshot Booster"]','owned as a comma string; owning a component does not complete the upgrade');
test(names(B.resolve(plan,catalog,[top.id],'Shiv').core)==='','owned items match by ID too');
test(B.resolve(plan,catalog,['Not A Real Item'],'Shiv').completed.includes('Not A Real Item')&&!B.resolve(plan,catalog,['Not A Real Item'],'Shiv').unknown.includes('Not A Real Item'),'an unknown selection you own by name counts as completed');
const dup=B.resolve({core:['Extra Spirit',base.id]},catalog,[],'Shiv');
test(names(dup.core)==='Extra Spirit','a name and its ID pick the same item once');
const rh=B.resolve({hero:'Haze',core:['Extra Spirit']},catalog,[],'Shiv');
test(rh.context.hero==='Shiv'&&rh.core.length===0&&rh.unknown.length===0&&rh.completed.length===0,'another hero\'s plan resolves empty for the current hero');
test(names(B.resolve({hero:'Shiv',core:['Extra Spirit']},catalog,[]).core)==='Extra Spirit','without a current hero the context hero is used');
const rn=B.resolve(plan,null,null,'Shiv');
test(rn.core.length===0&&json(rn.unknown)==='["extra spirit","'+mid.id+'","Boundless Spirit","Not A Real Item","HEADSHOT BOOSTER","Mystery Thing"]','no catalog: everything is unknown, nothing lost');
test(B.resolve(null,catalog,undefined).core.length===0,'nothing selected: an empty result');
// Starter catalog (offline): names only, synthetic IDs, no components.
const starter=E.createCatalog(ctx.DeadlockCatalog,null);
const first=starter.items[0].name;
test(names(B.resolve({core:[first.toUpperCase(),'Boundless Spirit']},starter,[],'Shiv').core)===first,'the offline starter catalog resolves by name');

// Cycle protection.
const cyc={items:[{id:'a',name:'Alpha',cost:1,components:['b']},{id:'b',name:'Beta',cost:1,components:['c']},{id:'c',name:'Gamma',cost:1,components:['a','missing']},{id:'d',name:'Delta',cost:1,components:['d']}]};
const rc=B.resolve({core:['Alpha','Beta','Gamma','Delta']},cyc,['Beta']);
test(names(rc.core)==='Delta'&&json(rc.completed)==='["Alpha","Beta","Gamma"]','component cycles terminate (each item visited once)');
test(B.resolve({core:['Delta']},cyc,['Delta']).completed.join()==='Delta','a self-referencing item terminates');
test(names(B.resolve({core:['b','GAMMA']},cyc,[]).core)==='Beta,Gamma','IDs and names both match in a hand-made catalog');

console.log(`build context tests: ${total} passed`);
