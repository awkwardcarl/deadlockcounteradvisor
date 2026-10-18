'use strict';
// Build data: community builds and match statistics from deadlock-api,
// compacted and cached in the main process, then used by the engine.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const bd=require('../desktop/build-data.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});

(async()=>{
  // Routes: fixed shapes only, numbers only.
  test(bd.routeAllowed(bd.buildsRoute(19,Date.UTC(2026,9,18)))&&bd.routeAllowed(bd.itemStatsRoute(19,'laning'))&&bd.routeAllowed(bd.itemStatsRoute(19,'mid'))&&bd.routeAllowed(bd.itemStatsRoute(19,'late'))&&bd.routeAllowed(bd.itemStatsRoute(19,'laning',[1,13])),'build and item-stat routes are allow-listed');
  test(['/v1/builds?hero_id=19&author_id=5','/v1/analytics/item-stats?hero_ids=19&account_ids=5','/v1/matches/1/metadata','/v1/builds?hero_id=19&only_latest=true&sort_by=favorites&sort_direction=desc&limit=20&build_language=English&min_unix_timestamp=1;rm'].every(r=>!bd.routeAllowed(r)),'anything else (author or account filters included) is refused');
  await assert.rejects(bd.getJSON('/v1/builds?hero_id=19&x=1'),/not allowlisted/);total++;
  const since=Number(/min_unix_timestamp=(\d+)/.exec(bd.buildsRoute(19,Date.UTC(2026,9,18)))[1]);
  test(Date.UTC(2026,9,18)/1000-since===45*86400&&bd.buildsRoute(19).includes('only_latest=true&sort_by=favorites'),'builds: latest versions, most favorited, updated in the last 45 days');
  test(bd.itemStatsRoute(19,'laning').includes('max_bought_at_s=600')&&bd.itemStatsRoute(19,'mid').includes('min_bought_at_s=600&max_bought_at_s=1500')&&bd.itemStatsRoute(19,'late').includes('min_bought_at_s=1500')&&bd.itemStatsRoute(19,'laning',[1]).includes('enemy_hero_ids=1&same_lane_filter=true'),'item stats follow the phases; lane matchups filter to the same lane');

  // Stages and compaction.
  test(['#Citadel_HeroBuilds_Lane','#Citadel_HeroBuilds_EarlyGame','Early Game 500 Souls','#Citadel_HeroBuilds_MidGame','Luxury.','#Citadel_HeroBuilds_LateGame'].map((n,i)=>bd.stageOf(n,i,6)).join()==='laning,laning,laning,mid,late,late','stage names map to phases (game tags and common words)');
  test(['Category 1','Category 2','Category 3'].map((n,i,a)=>bd.stageOf(n,i,a.length)).join()==='laning,mid,late','unnamed stages fall back to their position');
  const items={1:{c:'upgrade_a',n:'A'},2:{c:'upgrade_b',n:'B'},3:{c:'upgrade_c',n:'C'},9:{c:'ability_x',n:'Ability'}};
  const build=(cats,extra={})=>({hero_build:{hero_id:19,author_account_id:123456,name:'Secret Name',description:'long text',details:{mod_categories:cats}},...extra});
  const raw=[
    build([{name:'#Citadel_HeroBuilds_Lane',mods:[{ability_id:1},{ability_id:9}]},{name:'#Citadel_HeroBuilds_LateGame',mods:[{ability_id:3}]}]),
    build([{name:'Early',mods:[{ability_id:1},{ability_id:2}]}]),
    build([]),
    {hero_build:{details:{}}}
  ];
  const compact=bd.compactBuilds(raw,items);
  test(compact.count===2&&compact.stages.laning.upgrade_a===1&&compact.stages.laning.upgrade_b===.5&&compact.stages.late.upgrade_c===.5,'builds compact to the share of builds per stage per item');
  test(!JSON.stringify(compact).includes('ability_x')&&!/Secret Name|123456|long text/.test(JSON.stringify(compact)),'abilities are dropped; build names, descriptions and authors are never kept');
  const stats=bd.compactItemStats([{item_id:1,wins:55,matches:100},{item_id:2,wins:-1,matches:10},{item_id:3,wins:20,matches:10},{item_id:9,wins:5,matches:10},{item_id:404,wins:1,matches:2}],items);
  test(JSON.stringify(stats)==='{"upgrade_a":{"m":100,"w":55}}','item stats keep valid shop-item rows only');

  // Service: caching, offline fallback, matchups, validation.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cca-bd-'));
  try{
    let now=Date.UTC(2026,9,18,12);const calls=[];let failing=false;
    const fetchJSON=async route=>{calls.push(route);if(failing)throw new Error('offline');if(route.startsWith('/v1/builds'))return raw;return [{item_id:1,wins:55,matches:300},{item_id:2,wins:40,matches:300}];};
    const assets={items};
    const svc=bd.createBuildData({userData:dir,readAssets:()=>assets,refreshAssets:async()=>assets,fetchJSON,now:()=>now});
    test(await svc.get(0)===null&&await svc.get(1.5)===null&&await svc.get(99999)===null,'invalid hero IDs make no request');
    const first=await svc.get(19);
    test(first.builds.count===2&&first.stats.laning.upgrade_a.m===300&&calls.length===4&&first.matchup===null,'first request: builds plus laning, mid and late stats');
    now+=60*60*1000;
    const cached=await svc.get(19);
    test(calls.length===4&&cached.builds.count===2&&!cached.stale,'within 12 hours the cache answers');
    await svc.get(19,[13,1]);
    test(calls.length===5&&calls[4].includes('enemy_hero_ids=1,13&same_lane_filter=true'),'lane opponents add one matchup request (IDs sorted)');
    const again=await svc.get(19,[1,13]);
    test(calls.length===5&&again.matchup.upgrade_a.m===300,'the matchup is cached too');
    now+=13*60*60*1000;failing=true;
    const stale=await svc.get(19);
    test(stale.stale&&stale.builds.count===2&&calls.length>5,'when the service is unreachable, saved data is used and marked stale');
    failing=false;
    const [p1,p2]=[svc.get(19),svc.get(19)];
    const before=calls.length;await Promise.all([p1,p2]);
    test(calls.length-before===4,'simultaneous requests for the same hero share one fetch');
    test(fs.statSync(path.join(dir,'build-data-v1.json')).size<100000&&!/Secret Name|123456/.test(fs.readFileSync(path.join(dir,'build-data-v1.json'),'utf8')),'the cache file is small and holds no build names or authors');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}

  // Engine: popular builds and win rates shape the picks.
  const ctx=vm.createContext({});
  for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
  const E=ctx.DeadlockEngine,catalog=E.createCatalog(ctx.DeadlockCatalog,require('./fixtures/catalog-snapshot.json'));
  const enemies=[{hero:'Infernus',items:'Extra Spirit, Mystic Burst',lane:4},{hero:'Haze',items:'Headshot Booster, Rapid Rounds',lane:1}];
  const counterIds=new Set(E.recommend({hero:'Shiv',souls:1400,owned:'',enemies},catalog,{clock:'04:00'}).results.map(r=>r.id));
  const ungrouped=catalog.items.find(i=>!E.BUILD_GROUPS[i.group]&&Number(i.tier)===1&&!counterIds.has(i.id));
  const data={builds:{count:10,stages:{laning:{[ungrouped.id]:.9},mid:{},late:{}}},stats:{laning:{[ungrouped.id]:{m:5000,w:2900}},mid:{},late:{}},matchup:null};
  const plain=E.recommend({hero:'Shiv',souls:1400,owned:'',enemies},catalog,{clock:'04:00'});
  const withData=E.recommend({hero:'Shiv',souls:1400,owned:'',enemies},catalog,{clock:'04:00',buildData:data});
  const pick=withData.buildPicks.find(r=>r.id===ungrouped.id);
  test(!plain.buildPicks.some(r=>r.id===ungrouped.id)&&pick&&pick.reasons[0]==="Popular in Shiv's builds",'an item most builds take at this stage becomes a build pick, even without a known shop group');
  test(pick.backing.share===.9&&pick.backing.builds===10&&pick.backing.wr===.58&&pick.backing.matches===5000,'picks carry their backing: share of builds and win rate');
  test(withData.buildData.builds===10&&withData.buildData.stats>0&&plain.buildData.builds===0,'the result says what build data was used');
  test(JSON.stringify(E.recommend({hero:'Shiv',souls:1400,owned:'',enemies},catalog,{clock:'04:00',buildData:null}).results.map(r=>r.name+r.score))===JSON.stringify(plain.results.map(r=>r.name+r.score)),'without build data the picks are unchanged');
  const matchupData={...data,matchup:Object.fromEntries(catalog.items.slice(0,12).map(i=>[i.id,{m:100,w:60}]))};
  test(E.recommend({hero:'Shiv',souls:1400,owned:'',enemies,ownLane:4},catalog,{clock:'04:00',buildData:matchupData}).buildData.matchup===true&&E.recommend({hero:'Shiv',souls:1400,owned:'',enemies,ownLane:4},catalog,{clock:'14:00',buildData:matchupData}).buildData.matchup===false,'lane matchup stats are used while laning only');
  const tiered={builds:{count:0,stages:{}},stats:{mid:{}}};
  for(const it of catalog.items.filter(i=>Number(i.tier)===3))tiered.stats.mid[it.id]={m:1000,w:500};
  const target=E.recommend({hero:'Shiv',souls:4000,owned:'',enemies},catalog,{clock:'14:00'}).results.find(r=>itemTier(r)===3);
  function itemTier(r){return Number(catalog.items.find(i=>i.id===r.id)?.tier);}
  tiered.stats.mid[target.id]={m:1000,w:600};
  const lifted=E.recommend({hero:'Shiv',souls:4000,owned:'',enemies},catalog,{clock:'14:00',buildData:tiered}).results.find(r=>r.id===target.id);
  test(lifted.score>target.score&&lifted.backing.wr===.6,'a win rate above other items of the same tier raises a pick');

  // Wiring, switch and policy.
  const main=read('desktop/main.cjs'),preload=read('desktop/preload.cjs'),ui=read('js/ui.js'),html=read('index.html');
  test(/ipcMain\.handle\('builddata:get', \(event, heroId, laneIds\) => \{\n    if\(!trusted\(event\)\)throw/.test(main)&&preload.includes("getBuildData: (heroId, laneIds) => ipcRenderer.invoke('builddata:get'"),'build data only answers the app window');
  test(html.includes('id="useBuildData" checked')&&ui.includes("localStorage.getItem(STORE_BUILD_DATA)!=='0'")&&ui.includes("buildData:buildDataEnabled()?buildData:null"),'Settings → Privacy switch (on by default) turns build data off');
  test(ui.includes('`In ${Math.round(b.share*b.builds)} of ${b.builds} popular builds`')&&ui.includes("(avg ${Math.round(b.base*100)}%)")&&html.includes('id="buildDataStatus"'),'cards and Settings show what backs the picks');
  const privacy=read('docs/privacy.html'),terms=read('docs/terms.html'),license=read('installer/license.txt');
  test(privacy.includes('<strong>Build data</strong>')&&privacy.includes('Only hero IDs are sent')&&privacy.includes('Use community builds and match stats')&&privacy.includes('Build names, descriptions and authors are not kept'),'the Privacy Policy describes build data, what is sent and how to turn it off');
  test(terms.includes('community builds and match statistics')&&license.includes('community builds')&&license.includes('hero IDs only'),'the Terms and installer page mention it too');

  finished=true;
  console.log(`PASS: ${total} build data checks (simulated service)`);
})().catch(e=>{console.error(e);process.exit(1);});
