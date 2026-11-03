'use strict';
// Build import: a community build by its in-game build ID (pasted, or picked
// from the popular builds for your hero) becomes your saved build. The main
// process fetches and compacts it; js/build-context.js turns it into core and
// optional items; the UI checks the hero and asks before replacing a build.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const bd=require('../desktop/build-data.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});

const ctx=vm.createContext({});
for(const f of ['js/catalog.js','js/build-context.js','js/engine.js'])vm.runInContext(read(f),ctx);
const B=ctx.DeadlockBuildContext,E=ctx.DeadlockEngine;
const catalog=E.createCatalog(ctx.DeadlockCatalog,require('./fixtures/catalog-snapshot.json'));
const idOf=name=>catalog.items.find(i=>i.name===name).id;

(async()=>{
  // 1. Routes: one build by a numeric ID, nothing else.
  test(bd.buildRoute(34235)==='/v1/builds?build_id=34235&only_latest=true'&&bd.routeAllowed(bd.buildRoute(34235)),'the build-by-ID route is allow-listed');
  test(['/v1/builds?build_id=1x&only_latest=true','/v1/builds?build_id=1&only_latest=true&author_id=5','/v1/builds?build_id=&only_latest=true','/v1/builds?build_id=12345678901&only_latest=true'].every(r=>!bd.routeAllowed(r)),'other build lookups are refused');

  // 2. Compacting one build: categories in order, item class names, optional flag, clean name.
  const items={'1':{c:'upgrade_a'},'2':{c:'upgrade_b'},'3':{c:'upgrade_c'},'4':{c:'not an upgrade'}};
  const name='My'+String.fromCharCode(0x202e)+'build'+String.fromCharCode(7)+'  x';
  const raw=[{hero_build:{hero_build_id:42,version:3,hero_id:7,author_account_id:99,name,description:'secret',details:{mod_categories:[
    {name:'Lane',mods:[{ability_id:1},{ability_id:2},{ability_id:1},{ability_id:99},{ability_id:4}]},
    {name:'Situational',optional:true,mods:[{ability_id:3}]},
    {name:'Empty',mods:[]}]}}}];
  const c=bd.compactBuild(raw,items);
  test(c&&c.buildId===42&&c.version===3&&c.heroId===7&&c.name==='My build x','build ID, version, hero and a cleaned name');
  test(JSON.stringify(c.categories)===JSON.stringify([{name:'Lane',optional:false,items:['upgrade_a','upgrade_b']},{name:'Situational',optional:true,items:['upgrade_c']}]),'categories keep order, drop unknown and duplicate items, and drop empty sections');
  test(!JSON.stringify(c).includes('secret')&&!('author_account_id' in c),'the description and author are not kept');
  test(bd.compactBuild([],items)===null&&bd.compactBuild([{hero_build:{hero_build_id:42,hero_id:7,details:{mod_categories:[{name:'x',mods:[{ability_id:99}]}]}}}],items)===null,'no build, or no known items: nothing');
  test(JSON.stringify(bd.compactBuilds(raw,items).list)==='[{"id":42,"version":3,"name":"My build x"}]','popular builds keep a short pick list (ID, version, name)');

  // 3. importBuild: only the build ID goes out; errors are answers, not throws.
  const asked=[];
  const svc=bd.createBuildData({userData:path.join(root,'tests'),readAssets:()=>({items}),refreshAssets:async()=>({items}),fetchJSON:async route=>{asked.push(route);return raw;}});
  const got=await svc.importBuild(42);
  test(got.buildId===42&&asked.length===1&&asked[0]===bd.buildRoute(42),'importBuild asks for that one build');
  test((await svc.importBuild(-1)).error&&(await svc.importBuild(1.5)).error&&asked.length===1,'a bad ID is refused without a request');
  const down=bd.createBuildData({userData:path.join(root,'tests'),readAssets:()=>({items}),refreshAssets:async()=>({items}),fetchJSON:async()=>{throw new Error('Could not reach the build data service');}});
  test(/Could not reach/.test((await down.importBuild(42)).error),'service down: an error message');
  const none=bd.createBuildData({userData:path.join(root,'tests'),readAssets:()=>({items}),refreshAssets:async()=>({items}),fetchJSON:async()=>[]});
  test(/No build found with ID 42/.test((await none.importBuild(42)).error),'unknown build: says so');

  // 4. Pasted codes.
  const P=B.parseBuildCode;
  test(P('34235')===34235&&P(' #34235 ')===34235&&P(34235)===34235,'a bare build ID');
  test(P('https://example.com/builds/34235')===34235&&P('https://example.com/b?build_id=34235&v=8')===34235&&P('Build: 34235 (version 8)')===34235&&P('build 34235')===34235,'a link or text that labels the build ID');
  test(P('https://example.com/hero/7/guide-34235')===34235,'a link with one long number');
  test(P('')===null&&P('hello')===null&&P('12 vs 345678 and 99999')===null&&P('0')===null&&P(null)===null,'ambiguous or empty input: null');

  // 5. Converting to a saved build.
  const build={buildId:42,version:3,heroId:7,name:'Gun',categories:[
    {name:'Laning',optional:false,items:[idOf('Headshot Booster'),idOf('Rapid Rounds')]},
    {name:'Mid game',optional:false,items:[idOf('Swift Striker'),idOf('Rapid Rounds'),'upgrade_from_the_future']},
    {name:'Situational',optional:false,items:[idOf('Healbane')]},
    {name:'Late',optional:true,items:[idOf('Toxic Bullets')]}]};
  const r=B.fromCommunity(build,catalog,'Haze',{playstyle:'weapon'});
  test(JSON.stringify(r.context.core)===JSON.stringify(['Headshot Booster','Rapid Rounds','Swift Striker','upgrade_from_the_future']),'path sections become core, in order, by catalog name (unknown IDs kept)');
  test(JSON.stringify(r.context.optional)===JSON.stringify(['Healbane','Toxic Bullets']),'sections marked optional or named situational become optional');
  test(r.context.hero==='Haze'&&r.context.name==='Gun'&&r.context.playstyle==='weapon'&&r.context.source.buildId===42&&r.context.source.version===3,'hero, name, kept playstyle and the source build');
  const long={...build,categories:[{name:'All',items:catalog.items.slice(0,60).map(i=>i.id)}]};
  const big=B.fromCommunity(long,catalog,'Haze');
  test(big.context.core.length===B.MAX_CORE&&big.context.optional.length===B.MAX_OPTIONAL&&big.moved===28&&big.dropped===4,'too many items: core is capped, the rest moves to optional, overflow is counted');
  test(B.fromCommunity(null,catalog,'Haze')===null&&B.fromCommunity({categories:'x'},catalog,'Haze')===null,'not a build: null');
  const resolved=B.resolve(r.context,catalog,['Headshot Booster'],'Haze');
  test(resolved.unknown.join()==='upgrade_from_the_future'&&resolved.completed.join()==='Headshot Booster','an imported build resolves like a hand-made one');
  test(JSON.stringify(B.normalize({...r.context,source:{buildId:'x'}},'Haze').source)==='null'&&B.normalize({...r.context},'Haze').source.buildId===42,'the source survives saving, and a bad one is dropped');

  // 5b. Early items you sold stay behind you: your place is the furthest core item you own.
  const path4={hero:'Haze',core:['Extra Regen','Sprint Boots','Rapid Rounds','Swift Striker','Headhunter']};
  const sold=B.resolve(path4,catalog,['Rapid Rounds'],'Haze');
  test(sold.core.map(i=>i.name).join()==='Swift Striker,Headhunter'&&sold.passed.join()==='Extra Regen,Sprint Boots'&&sold.completed.includes('Extra Regen'),'early core items you no longer own are passed, not suggested again');
  const fresh=B.resolve(path4,catalog,[],'Haze');
  test(fresh.core.length===5&&fresh.passed.length===0,'nothing owned: the whole path is ahead');
  const out=E.recommend({hero:'Haze',souls:3000,owned:'Rapid Rounds',enemies:[]},catalog,{clock:'15:00',buildContext:path4});
  test(out.plan.buildContext.core[0].name==='Swift Striker','the engine picks up after the furthest owned core item');

  // 6. Wiring: the app window only, the hero is checked, nothing replaced without asking.
  const main=read('desktop/main.cjs'),preload=read('desktop/preload.cjs'),ui=read('js/ui.js'),html=read('index.html');
  test(/ipcMain\.handle\('builddata:import', \(event, buildId\) => \{\n    if\(!trusted\(event\)\)throw/.test(main)&&preload.includes("importBuild: buildId => ipcRenderer.invoke('builddata:import', Number(buildId))"),'import only answers the app window');
  test(html.includes('id="buildImportCode"')&&html.includes('id="buildImportGo"')&&html.includes('id="buildPopular"')&&/aria-label="Import a build/.test(html)&&/aria-label="Popular community builds/.test(html),'import controls are present and labelled');
  test(/r\.heroId!==mine/.test(ui)&&/Pick that hero first/.test(ui),'a build for another hero is refused, naming the hero');
  test(/window\.confirm\(`Replace your \$\{buildHero\} build/.test(ui),'replacing an existing build asks first');
  test(/heroId===mine\?list:\[\]/.test(ui),'popular builds only show for the hero they were fetched for');
  test(/<strong>Build import<\/strong>/.test(read('docs/privacy.html'))&&read('docs/privacy.html').includes('Only the build ID is sent'),'the Privacy Policy describes build import');

  finished=true;
  console.log(`PASS: ${total} build import checks`);
})().catch(e=>{console.error(e);process.exitCode=1;});
