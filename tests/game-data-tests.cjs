'use strict';
// Automatic game data: the background catalog and hero-list sync (at launch,
// and when a live match shows a hero or item the caches don't know), new-hero
// labels, re-resolving the live lineup after a catalog update, and the daily
// review workflow. Every fetch is simulated; nothing touches the network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const dataService=require('../desktop/data-service.cjs');
const matchService=require('../desktop/match-service.cjs');
const gd=require('../desktop/game-data.cjs');
const review=require('./game-data-review.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const fixture=require('./fixtures/catalog-snapshot.json');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});
const HOUR=60*60*1000,MIN=60*1000;
const ASSET_ROUTES=['/v1/assets/items','/v1/assets/heroes'];

// Raw service responses rebuilt from the real snapshot, so the app's own
// compaction (js/snapshot.cjs, match-normalizer.cjs) runs on them.
function siteLists({heroes=[],items=[],drop=[],rename={},abilities={},build='client-6800'}={}){
  const list=[...fixture.items.filter(i=>!drop.includes(i.id)),...items].map(i=>rename[i.id]?{...i,name:rename[i.id]}:i);
  return {
    '/api/v1/items.json':{source:{generatedAt:'2026-10-20T08:00:00Z',buildId:build},items:list.map(i=>({id:i.id,displayName:{english:i.name},
      shop:{isPublicShopItem:true,category:i.category,cost:i.cost,tier:i.tier,groupId:i.group,groupLabel:i.groupLabel||'',componentIds:i.components||[],upgradeIds:i.upgrades||[]},
      assets:{shopIcon:{publicPath:i.icon||''}},activation:{isActive:!!i.active}}))},
    '/api/v1/heroes.json':{heroes:[...fixture.heroes,...heroes].map(h=>({heroId:h.id,displayName:{english:h.name},slug:h.slug||'',status:'released',playerSelectable:true,disabled:false,
      assets:{card:{publicPath:h.portrait||''}},tags:h.tags||[],playstyle:{name:h.style||''},abilities:(abilities[h.name]||h.abilities||[]).map(a=>({displayName:{english:a}}))}))}
  };
}
function apiLists({heroes=[],items=[]}={}){
  return {
    '/v1/assets/items':[...fixture.items,...items].map((i,n)=>({id:1000+n,type:'upgrade',class_name:i.id,name:i.name,cost:i.cost,item_tier:i.tier,item_slot_type:i.category})),
    '/v1/assets/heroes':[...fixture.heroes.map(h=>({id:h.id,name:h.name,player_selectable:true,disabled:false})),...heroes]
  };
}
// The real data and match services, with their fetch swapped for a simulated one.
function network(){
  const calls=[];let site=siteLists(),api=apiLists(),offline=false;
  const respond=(table,route)=>{
    calls.push(route);
    if(offline)return Promise.reject(new Error('Could not reach the service'));
    return route in table?Promise.resolve(JSON.parse(JSON.stringify(table[route]))):Promise.reject(new Error('Endpoint not allowlisted'));
  };
  return {calls,offline:on=>{offline=on;},set:(s,a)=>{if(s)site=s;if(a)api=a;},
    catalog:{...dataService,refresh:dir=>dataService.refresh(dir,route=>respond(site,route))},
    assets:{...matchService,refreshAssets:dir=>matchService.refreshAssets(dir,route=>respond(api,route))}};
}

(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dca-game-data-'));
  try{
    // Staleness: missing, a day old, or a hero list saved before investment tables.
    const now=Date.now(),cat={syncedAt:new Date(now).toISOString()},list={fetchedAt:now,investment:null,heroArt:{}};
    test(!gd.isStale(cat,list,now)&&gd.isStale(null,list,now)&&gd.isStale(cat,null,now),'missing caches are stale; fresh ones are not');
    test(gd.isStale(cat,list,now+25*HOUR)&&gd.isStale({syncedAt:new Date(now-25*HOUR).toISOString()},list,now)&&gd.isStale(cat,{fetchedAt:now-25*HOUR,investment:null},now)&&!gd.isStale(cat,list,now+23*HOUR),'either cache older than 24 hours is stale');
    test(gd.isStale(cat,{fetchedAt:now},now)&&gd.isStale({syncedAt:'soon'},list,now),'a hero list without the investment key, or an unreadable sync time, is stale');
    test(gd.isStale(cat,{fetchedAt:now,investment:null},now),'a hero list saved before hero art is stale, so it refreshes once');

    // Unknown content in a live snapshot: hero IDs and shop class names only.
    const known=gd.knownContent(fixture,{heroes:{86:'Violet'}});
    const snap={ownHeroId:13,ownItemIds:['upgrade_extra_charge','upgrade_mystery'],enemies:[{name:'PlayerOne',heroId:91,itemIds:['','ability_x','upgrade_mystery']},{name:'PlayerTwo',heroId:null,itemIds:null}],allies:[{heroId:86,itemIds:[]},{heroId:92}]};
    test(JSON.stringify(gd.unknownContent(snap,known))==='["hero:91","hero:92","item:upgrade_mystery"]','unknown: enemy and ally hero IDs, and upgrade_ class names, once each');
    test(gd.unknownContent({ownHeroId:86,enemies:[{heroId:13,itemIds:['upgrade_extra_charge']}]},known).length===0&&gd.unknownContent(null,known).length===0&&gd.unknownContent({enemies:'x'},known).length===0,'IDs either list knows, missing IDs and odd shapes are not unknown');

    // Launch: no saved data, so a background sync starts and the window gets the result.
    const net=network(),pushed=[],logs=[];let clock=Date.now();
    const make=()=>gd.createGameData({userData:dir,onCatalog:s=>pushed.push(s),log:m=>logs.push(m),now:()=>clock,catalog:net.catalog,assets:net.assets});
    let game=make();
    const first=game.start();
    test(first&&typeof first.then==='function'&&game.busy()&&pushed.length===0,'first launch: start() returns at once while the sync runs in the background');
    let result=await first;
    test(result.ok&&!game.busy()&&pushed.length===1&&pushed[0].build==='client-6800'&&pushed[0].items.length===fixture.items.length,'when done, the new catalog is pushed to the window');
    test(pushed[0].extraHeroNames&&'investment' in pushed[0],'the pushed catalog carries the hero list (fallback names, investment tables)');
    test(net.calls.length===4&&net.calls.every(r=>dataService.ROUTES.includes(r)||ASSET_ROUTES.includes(r)),'one request per fixed asset route');
    const catalogFile=path.join(dir,'item-catalog-v0.4.json'),assetsFile=path.join(dir,'deadlock-api-assets-v1.json');
    test(fs.existsSync(catalogFile)&&fs.existsSync(assetsFile)&&dataService.readCache(dir).build==='client-6800','both caches are saved');
    test(JSON.stringify(dataService.readCache(dir).items)===JSON.stringify(fixture.items),'the simulated lists compact to the real snapshot');

    // The same lists again: saved, but nothing new to push.
    result=await game.sync('manual');
    test(result.ok&&net.calls.length===8&&pushed.length===1,'a sync that changes nothing pushes nothing, so the window is not redrawn');
    // Next launch, same day: nothing. A day later: stale, but offline.
    clock+=HOUR;game=make();
    test(game.start()===null&&net.calls.length===8,'caches under a day old: no sync at launch');
    clock+=25*HOUR;game=make();net.offline(true);
    const saved=[fs.readFileSync(catalogFile,'utf8'),fs.readFileSync(assetsFile,'utf8')];
    result=await game.start();
    test(result&&!result.ok&&net.calls.length===12&&pushed.length===1,'a day later the launch sync runs; offline it fails quietly and pushes nothing');
    test(fs.readFileSync(catalogFile,'utf8')===saved[0]&&fs.readFileSync(assetsFile,'utf8')===saved[1]&&game.current().items.length===fixture.items.length,'offline: the saved copies are kept');
    test(/Keeping the saved copy/.test(logs.at(-1)),'the failure is logged, not thrown');
    net.offline(false);

    // A live match with only known heroes and items: no sync.
    clock=Date.now();game=make();
    const match={matchId:'7',phase:'in-progress',ownHero:'Haze',ownHeroId:13,ownItemIds:['upgrade_extra_charge'],
      enemies:[{name:'PlayerOne',hero:'Abrams',heroId:6,itemIds:['upgrade_vex_barrier']}],allies:[{hero:'Haze',heroId:13,itemIds:[]}]};
    test(game.check(match)===null&&net.calls.length===12,'known heroes and items: no sync');
    // The patch adds hero 90; the hero list has it, the snapshot names it by ID.
    net.set(null,apiLists({heroes:[{id:90,name:'Newguy',player_selectable:true,disabled:false}]}));
    const withHero={...match,enemies:[...match.enemies,{name:'PlayerTwo',hero:'UNKNOWN',heroId:90,itemIds:[]}]};
    const pending=game.check(withHero);
    test(pending&&game.busy()&&net.calls.length===16,'an unknown enemy hero ID starts one background sync');
    test(game.check(withHero)===null&&net.calls.length===16,'no second sync while one runs');
    result=await pending;
    test(result.ok&&pushed.at(-1).extraHeroNames['90']==='Newguy','after it the hero list names the new hero, and the window gets the catalog');
    clock+=11*MIN;
    test(game.check(withHero)===null&&net.calls.length===16,'once known, the hero starts no more syncs');

    // A shop item no list has yet: one sync, then it waits an hour.
    const withItem={...match,enemies:[{...match.enemies[0],itemIds:['upgrade_brand_new']}]};
    result=await game.check(withItem);
    test(result&&result.ok&&net.calls.length===20,'an unknown shop item class name starts a sync');
    const itemSyncAt=clock;
    clock+=5*MIN;
    const withAlly={...match,allies:[{hero:'UNKNOWN',heroId:93,itemIds:[]}]};
    test(game.check(withAlly)===null&&net.calls.length===20,'syncs for unknown content are at least ten minutes apart');
    clock+=6*MIN;
    test(game.check(withItem)===null&&net.calls.length===20,'content a completed sync could not resolve waits an hour, not ten minutes');
    result=await game.check(withAlly);
    test(result&&net.calls.length===24,'an unknown ally hero ID starts a sync once ten minutes have passed');
    clock=itemSyncAt+61*MIN;
    net.set(siteLists({items:[{...fixture.items[3],id:'upgrade_brand_new',name:'Brand New'}]}),null);
    result=await game.check(withItem);
    test(result&&result.ok&&net.calls.length===28&&game.current().items.some(i=>i.id==='upgrade_brand_new'),'an hour later it tries again, and the catalog now has the item');
    clock+=11*MIN;
    test(game.check(withItem)===null,'then it is known');
    // Offline while in a match: retried after ten minutes.
    net.offline(true);
    const withOwn={...match,ownHeroId:94};
    result=await game.check(withOwn);
    test(result&&!result.ok&&net.calls.length===32,'an unknown own hero ID starts a sync; offline it fails');
    clock+=5*MIN;test(game.check(withOwn)===null,'a failed sync waits ten minutes too');
    clock+=6*MIN;result=await game.check(withOwn);
    test(result&&net.calls.length===36,'a failed sync is retried after ten minutes');
    net.offline(false);

    // Settings "Sync items & heroes" joins a running background sync.
    clock+=11*MIN;
    const background=game.sync('launch'),manual=game.syncNow();
    test(net.calls.length===40,'Sync while a background sync runs: one set of requests');
    test((await manual).items.length===fixture.items.length+1&&(await background).ok,'and it returns the same catalog');
    // A broken catalog response: Sync fails, the saved catalog stays.
    const before=fs.readFileSync(catalogFile,'utf8');
    net.set({'/api/v1/items.json':{items:[]},'/api/v1/heroes.json':{heroes:[]}},null);
    await assert.rejects(game.syncNow(),/Incomplete catalog/);total++;
    test(fs.readFileSync(catalogFile,'utf8')===before,'a failed Sync keeps the saved catalog');

    // Privacy: only fixed asset routes; player names never sent, stored or logged.
    test(net.calls.every(r=>dataService.ROUTES.includes(r)||ASSET_ROUTES.includes(r))&&!net.calls.some(r=>/matches|metadata|account|Player/.test(r)),'only the fixed asset routes, never a match endpoint');
    test(!/PlayerOne|PlayerTwo/.test(fs.readFileSync(catalogFile,'utf8')+fs.readFileSync(assetsFile,'utf8')+logs.join('\n')),'player names are never stored or logged');
    const gdSource=read('desktop/game-data.cjs');
    test(!/require\('node:https?'\)|fetch\(|\/matches\//.test(gdSource),'game-data.cjs makes no requests of its own; it uses the two services\' fixed routes');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}

  // Settings → Privacy "Update game data automatically": kept by the main process.
  const autoDir=fs.mkdtempSync(path.join(os.tmpdir(),'dca-auto-sync-'));
  try{
    const net=network(),pushed=[];let clock=Date.now();
    const make=()=>gd.createGameData({userData:autoDir,onCatalog:s=>pushed.push(s),now:()=>clock,catalog:net.catalog,assets:net.assets});
    const idle=async game=>{while(game.busy())await new Promise(r=>setTimeout(r,5));};
    test(gd.readAutoSync(autoDir)===true&&make().autoSync()===true,'on by default (nothing saved yet)');
    fs.writeFileSync(path.join(autoDir,'game-data-settings.json'),'not json');
    test(gd.readAutoSync(autoDir)===true,'an unreadable setting counts as on');
    let game=make();
    test(game.setAutoSync(false)===false&&JSON.parse(fs.readFileSync(path.join(autoDir,'game-data-settings.json'),'utf8')).autoSync===false,'switching it off is saved in userData');
    game=make();
    test(game.autoSync()===false&&game.start()===null&&net.calls.length===0,'off, next launch: the setting is read before the launch check, and nothing syncs (even with no saved catalog)');
    const unknown={ownHeroId:999,enemies:[{name:'PlayerOne',heroId:998,itemIds:['upgrade_brand_new']}],allies:[{heroId:997}]};
    test(game.check(unknown)===null&&net.calls.length===0,'off: unknown live content starts no sync');
    const manual=await game.syncNow();
    test(manual&&manual.items.length===fixture.items.length&&net.calls.length===4&&pushed.length===1,'off: Sync (which the debrief also uses) still works');
    // Back on, a day later: the launch check it skipped runs once.
    clock+=25*HOUR;
    test(game.setAutoSync(true)===true&&game.busy()&&net.calls.length===8&&gd.readAutoSync(autoDir)===true,'back on: the skipped launch check runs once (caches a day old: one sync)');
    await idle(game);
    test(game.setAutoSync(false)===false&&game.setAutoSync(true)===true&&!game.busy()&&net.calls.length===8,'toggling again starts nothing: no burst of syncs');
    test(game.check(unknown)===null&&net.calls.length===8,'unknown content waits the usual ten minutes after that sync');
    clock+=11*MIN;
    const again=game.check(unknown);
    test(again&&net.calls.length===12&&game.check(unknown)===null,'then it syncs once, as before');
    await again;
    // Switched on before the launch timer fires: just the normal launch check.
    game.setAutoSync(false);clock=Date.now();game=make();game.setAutoSync(true);
    test(!game.busy()&&net.calls.length===12&&game.start()===null&&net.calls.length===12,'switched on before launch: no extra sync; the normal check finds fresh caches');
  }finally{fs.rmSync(autoDir,{recursive:true,force:true});}

  // Engine: a hero only the hero list knows.
  const ctx=vm.createContext({});
  for(const file of ['js/catalog.js','js/engine.js','js/live-merge.js'])vm.runInContext(read(file),ctx);
  const E=ctx.DeadlockEngine,base=ctx.DeadlockCatalog,M=ctx.DeadlockLiveMerge;
  const named=dataService.addFallbackHeroNames(fixture,{heroes:{90:'Newguy',86:'Violet'}});
  const cat=E.createCatalog(base,named),starter=E.createCatalog(base,null);
  test(E.NEW_HERO.label===' · new hero'&&E.NEW_HERO.tip==='No reviewed profile yet; counters use their purchases','label and tooltip text');
  test(E.resolveHeroName(cat,'UNKNOWN',90)==='Newguy'&&E.isNewHero(cat,'Newguy')&&E.isNewHero(cat,'NEWGUY'),'a hero named by its ID from the hero list is a new hero');
  test(!E.isNewHero(cat,'Haze')&&!E.isNewHero(cat,'Violet')&&!E.isNewHero(cat,'Mystery')&&!E.isNewHero(cat,'')&&!E.isNewHero(starter,'Newguy'),'catalog and curated heroes, and names no list knows, are not');
  const out=E.recommend({hero:'Haze',souls:3000,owned:'',enemies:[{hero:'Newguy',items:'Rapid Rounds, Toxic Bullets'},{hero:'Mystery',items:''}]},cat,{clock:'12:00'});
  test(out.unknown.includes('Newguy · new hero')&&!out.unknown.some(t=>t.includes('Unknown enemy hero: Newguy'))&&JSON.stringify(out.newHeroes)==='["Newguy"]','"Newguy · new hero" instead of "Unknown enemy hero"');
  test(out.unknown.includes('Unknown enemy hero: Mystery'),'a hero no list knows is still unknown');
  test(out.threats.some(t=>t.name==='bullet')&&out.quickBuys.length===3,'counters use the new hero\'s purchases');
  test(E.heroGameId(cat,'Newguy')===90&&E.heroGameId(cat,'Haze')===13&&E.heroGameId(cat,'Nobody')===null&&E.heroGameId(starter,'Haze')===null,'game hero IDs (for build data) include new heroes');
  test(JSON.stringify(E.recommend({enemies:[]},cat).newHeroes)==='[]','no enemies: no new heroes');

  // UI: the label, its tooltip, and where they show.
  const ui=read('js/ui.js');
  const uiCtx=vm.createContext({engine:E,catalog:cat,heroes:()=>cat.heroes.map(h=>h.name).sort(),Date,Set,
    escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
  vm.runInContext(ui.slice(ui.indexOf('const newHero='),ui.indexOf('function portrait('))+';this.newHeroTag=newHeroTag;this.heroOptions=heroOptions;this.newHeroTitle=newHeroTitle;',uiCtx);
  test(uiCtx.newHeroTag('Newguy')==='<span class="newHero" title="No reviewed profile yet; counters use their purchases"> · new hero</span>'&&uiCtx.newHeroTag('Haze')===''&&uiCtx.newHeroTag('')==='','new hero tag with its tooltip; nothing for other heroes');
  test(uiCtx.heroOptions('Newguy',true).includes('<option value="Newguy" selected>Newguy · new hero</option>')&&uiCtx.heroOptions('Newguy',true).includes('<option value="Haze" >Haze</option>')&&!uiCtx.heroOptions('Haze',true).includes('new hero'),'hero selects say "Newguy · new hero"');
  test(uiCtx.newHeroTitle('Newguy')===' title="No reviewed profile yet; counters use their purchases"'&&ui.includes('aria-label="Enemy ${i+1} hero"${newHeroTitle(e.hero)}>')&&ui.includes("$('hero').title=newHero(state.hero)?engine.NEW_HERO.tip:'';"),'enemy and own hero selects carry the tooltip');
  const el={innerHTML:'',querySelectorAll:()=>[]};
  Object.assign(uiCtx,{$:id=>id==='glanceTeam'?el:null,state:{ownLane:null,enemies:[{hero:'Newguy',items:''},{hero:'Haze',items:''}]},portrait:()=>'',recentBuys:new Map(),itemIndex:{icons:new Map()}});
  vm.runInContext(ui.slice(ui.indexOf('function renderGlanceTeam(){'),ui.indexOf('function setGlance(on){')),uiCtx);uiCtx.renderGlanceTeam();
  test(el.innerHTML.includes('<span class="gName">Newguy<span class="newHero" title="No reviewed profile yet; counters use their purchases"> · new hero</span></span>')&&el.innerHTML.includes('<span class="gName">Haze</span>'),'glance view labels the new hero');
  test(ui.includes("<strong>${escapeHTML(e.hero||'Hero not reported yet')}${newHeroTag(e.hero)}")&&ui.includes("$('liveHeroName').title=newHero(state.hero)?engine.NEW_HERO.tip:'';"),'live team rows and the status strip label it too');
  test(ui.includes("unknown.innerHTML=out.unknown.slice(0,6).map(t=>t.endsWith(engine.NEW_HERO.label)?`<span title=\"${escapeHTML(engine.NEW_HERO.tip)}\">${escapeHTML(t)}</span>`:escapeHTML(t)).join(' • ');"),'the notes line shows "<Name> · new hero" with the tooltip, escaped');
  test(ui.includes('function heroIdOf(name){return engine.heroGameId(catalog,name);}'),'build data uses the new hero\'s ID');
  test(read('desktop.css').includes('.newHero{color:var(--dca-gold);font-weight:400;cursor:help}'),'the tag is styled from Dusk tokens');

  // Live lineup re-resolved after a catalog update; manual edits stay.
  const oldCat=E.createCatalog(base,dataService.addFallbackHeroNames(fixture,{heroes:{}}));
  const newCat=E.createCatalog(base,dataService.addFallbackHeroNames({...fixture,items:[...fixture.items,{...fixture.items[3],id:'upgrade_shiny_new',name:'Shining Thing'}]},{heroes:{90:'Newguy'}}));
  const by=c=>({hero:(n,id)=>E.resolveHeroName(c,n,id),items:(n,ids)=>E.resolveFeedItems(c,n,ids)});
  const feed={matchId:'7',phase:'in-progress',ownHero:'Haze',ownHeroId:13,ownItems:'Shiny Thing',ownItemIds:['upgrade_shiny_new'],souls:500,
    enemies:[{name:'PlayerOne',hero:'UNKNOWN',heroId:90,lane:1,items:'Shiny Thing',itemIds:['upgrade_shiny_new']},{name:'PlayerTwo',hero:'Abrams',heroId:6,lane:4,items:'',itemIds:[]}],
    allies:[{hero:'UNKNOWN',heroId:90,lane:1,items:'',itemIds:[],inventoryKnown:true}]};
  const st={hero:'',souls:0,owned:'',liveMatchId:'',enemies:[],allies:[]};
  M.mergeFeedSnapshot(st,null,feed,by(oldCat).hero,by(oldCat).items);
  test(st.enemies[0].hero===''&&st.enemies[0].items==='Shiny Thing'&&st.allies[0].hero===''&&st.owned==='Shiny Thing','before: the new hero is blank and the new item keeps the name the feed sent');
  st.enemies[1].hero='Bebop';
  test(M.reresolveFeed(st,feed,by(oldCat),by(newCat))===true,'a catalog update changes the live lineup');
  test(st.enemies[0].hero==='Newguy'&&st.enemies[0].items==='Shining Thing'&&st.allies[0].hero==='Newguy'&&st.owned==='Shining Thing'&&st.hero==='Haze','after: heroes and items are resolved again (enemies, allies, your items)');
  test(st.enemies[1].hero==='Bebop','a manual correction stays');
  test(M.reresolveFeed(st,feed,by(oldCat),by(newCat))===false&&M.reresolveFeed(st,{...feed,phase:'ended'},by(oldCat),by(newCat))===false&&M.reresolveFeed(st,{...feed,warning:'x'},by(oldCat),by(newCat))===false&&M.reresolveFeed(st,null,by(oldCat),by(newCat))===false,'nothing left to change, or an ended or warning snapshot: no change');
  test(ui.includes('if(lastFeedSnapshot&&liveMerge.reresolveFeed(state,lastFeedSnapshot,old,{hero:resolveHeroName,items:resolveFeedItems}))persist();')&&ui.includes('api.onCatalogUpdated?.(applyCatalog);')&&ui.includes('async function syncCatalogNow(){applyCatalog(await window.desktopAPI.syncCatalog());}'),'the window applies pushed and synced catalogs the same way');

  // Main process and preload wiring.
  const main=read('desktop/main.cjs'),preload=read('desktop/preload.cjs');
  test(main.includes("onCatalog:snapshot=>broadcast('catalog:updated',snapshot)")&&preload.includes("onCatalogUpdated: listener => {if(typeof listener==='function')ipcRenderer.on('catalog:updated',(_event,value)=>listener(value));},"),'the main process pushes new catalogs; the preload exposes a listener only');
  test(main.includes("broadcast('live:match',{...snapshot,source:'overwolf'});gameData.check(snapshot);")&&main.includes("broadcast('live:match',{...state,source:'file'});gameData.check(state);"),'every live snapshot (Overwolf or local feed) is checked for unknown content');
  test(main.indexOf('setTimeout(()=>void gameData.start(),3000);')>main.indexOf('  createWindow();\n  updates.start();'),'the launch sync starts after the window, on a timer');
  test(/ipcMain\.handle\('catalog:sync', async event => \{\n    if\(event\.sender!==mainWindow\?\.webContents\)throw new Error\('Untrusted catalog caller'\);\n    return gameData\.syncNow\(\);/.test(main),'Sync goes through the same module, for the app window only');
  test(read('index.html').includes("connect-src 'none'"),'the page still makes no requests of its own');
  const privacy=read('docs/privacy.html');
  test(privacy.includes('at launch when the saved copy is more than a day old, when a live match shows a hero or item the app doesn’t know yet, when you click Sync')&&privacy.includes('Nothing about you or your match is sent. The automatic updates can be turned off under <strong>Settings → Privacy</strong>.'),'the Privacy Policy says when the catalog syncs on its own, and that it can be turned off');
  test(privacy.includes('<li>Every feature that uses the internet is optional except the Overwolf platform connection in the Overwolf edition. Recommendations work offline.</li>')&&privacy.includes('<li>To stop automatic catalog updates, turn off <strong>Update game data automatically</strong> under <strong>Settings → Privacy</strong>. Sync still works when you click it.</li>'),'"every internet feature is optional except the Overwolf connection" is restored');
  // The toggle: Settings → Privacy, saved by the main process through two trusted handlers.
  const html=read('index.html'),privacyCard=html.slice(html.indexOf('id="privacyCard"'),html.indexOf('id="shortcutsCard"'));
  test(privacyCard.includes('<label class="toggleRow"><input type="checkbox" id="autoCatalogSync" checked> Update game data automatically</label>'),'a checkbox in Settings → Privacy, styled like the build data one, on by default');
  test(main.includes("ipcMain.handle('catalog:auto:get', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return gameData.autoSync();});")&&main.includes("ipcMain.handle('catalog:auto:set', (event,enabled)=>{if(!trusted(event))throw new Error('Unauthorized caller');return gameData.setAutoSync(enabled===true);});"),'main: read and set the setting, for the app window only');
  test(preload.includes("getAutoCatalogSync: () => ipcRenderer.invoke('catalog:auto:get'),")&&preload.includes("setAutoCatalogSync: enabled => ipcRenderer.invoke('catalog:auto:set', enabled === true),"),'preload: a getter and a boolean-only setter');
  test(ui.includes(" setupAutoSync();\n")&&ui.includes("if(!api?.getAutoCatalogSync){box.disabled=true;return;}")&&ui.includes("box.addEventListener('change',()=>api.setAutoCatalogSync(box.checked).then(show).catch(()=>show(!box.checked)));")&&ui.includes("'Automatic updates are off (Settings → Privacy): click Sync items & heroes after a game update.'"),'the window shows the saved state, sends changes and says when updates are off');

  // Daily review: the diff.
  const curated=review.loadCurated();
  test(!review.hasDiff(review.reviewGameData(fixture,fixture,curated)),'the reviewed snapshot against itself: no differences');
  const compact=lists=>require('../js/snapshot.cjs').compactSnapshot(lists['/api/v1/items.json'],lists['/api/v1/heroes.json']);
  const patched=siteLists({heroes:[{id:90,name:'Newguy',abilities:['Thing']}],items:[{...fixture.items[3],id:'upgrade_brand_new',name:'Brand New',group:'ENewGroup',upgrades:[]}],
    drop:['upgrade_vex_barrier'],rename:{upgrade_magic_burst:'Mystic Blast'},abilities:{Haze:['Sleep Knife','Smoke Bomb','Fixation','Bullet Dance']}});
  const listed=[{id:86,name:'Violet'},{id:88,name:'Baba'},{id:13,name:'Haze'}];
  const diff=review.reviewGameData(compact(patched),fixture,curated,listed);
  test(JSON.stringify(diff.heroes)==='[{"name":"Newguy","id":90,"why":"not in the hero profiles","source":"deadlock.io"},{"name":"Violet","id":86,"why":"no archetype tags","source":"deadlock-api"}]','heroes without a reviewed profile, also those only deadlock-api lists yet');
  test(diff.items.length===1&&diff.items[0].id==='upgrade_brand_new'&&diff.items[0].group==='ENewGroup','shop items new since the reviewed snapshot');
  test(['`COUNTERS`: `upgrade_vex_barrier` is not in the shop','`enemyItems`: "Mystic Burst" is not in the shop','`PURCHASE_PATTERNS`: "Mystic Burst" is not in the shop','`counterItems`: "Reactive Barrier" is not in the shop','`ABILITY_CUES`: Haze has no ability "Sleep Dagger"'].every(x=>diff.stale.includes(x)),'curated entries a patch removed or renamed');
  test(JSON.stringify(diff.groups)==='[{"group":"ENewGroup","count":1}]','shop groups without a threat mapping');
  const body=review.issueBody(diff,compact(patched),fixture);
  test(body.startsWith('<!-- game-data-review -->')&&body.includes('### Heroes without a reviewed profile (2)')&&body.includes('**Violet** (ID 86): no archetype tags in `js/catalog.js` (not on deadlock.io yet; named by deadlock-api)')&&body.includes('**Brand New** (`upgrade_brand_new`): spirit, tier 1, group `ENewGroup`')&&body.includes('`ENewGroup` (1 item)')&&body.includes('npm run fixture:update'),'the issue lists every finding and how to clear it');
  test(review.issueBody(diff,compact(patched),fixture)===body&&!/20\d\d-\d\d-\d\dT/.test(body),'same findings, same text (no run time), so the issue is only edited when they change');
  const playable=await review.listedHeroes(async route=>{test(route==='/v1/assets/heroes','deadlock-api: only the hero asset route');return [{id:86,name:'Violet',player_selectable:true,disabled:false},{id:83,name:'hero_testhero',player_selectable:false,disabled:true},{id:21,name:'Kali',player_selectable:false,disabled:true},{id:'x',name:'Bad',player_selectable:true}];});
  test(JSON.stringify(playable)==='[{"id":86,"name":"Violet"}]','deadlock-api heroes: playable and enabled only');

  // Daily review: the issue, through a simulated GitHub API.
  function github(issues,status=200){
    const calls=[];
    return {calls,fetch:async(url,opts)=>{
      calls.push({url,method:opts.method,auth:opts.headers.Authorization,data:opts.body?JSON.parse(opts.body):null});
      const json=opts.method==='GET'?issues:opts.method==='POST'?{number:42}:{number:Number(url.split('/').pop())};
      return {ok:status<300,status,json:async()=>json};
    }};
  }
  const repo='awkwardcarl/deadlockcounteradvisor',opts=f=>({token:'test-token',repo,fetchImpl:f.fetch});
  let gh=github([{number:3,title:'Something else',body:''},{number:5,title:review.TITLE,body:'x',pull_request:{}}]);
  let made=await review.upsertIssue(body,opts(gh));
  test(made.action==='opened'&&made.number===42&&gh.calls.length===2&&gh.calls[1].method==='POST'&&gh.calls[1].data.title==='Game data needs review'&&gh.calls[1].data.body===body,'no open issue (pull requests and other titles ignored): one is opened');
  gh=github([{number:7,title:review.TITLE,body:body.replace(/\n/g,'\r\n')}]);
  made=await review.upsertIssue(body,opts(gh));
  test(made.action==='unchanged'&&gh.calls.length===1,'the open issue already says this: left alone');
  gh=github([{number:7,title:review.TITLE,body:'older findings'}]);
  made=await review.upsertIssue(body,opts(gh));
  test(made.action==='updated'&&gh.calls.length===2&&gh.calls[1].method==='PATCH'&&gh.calls[1].url.endsWith('/issues/7')&&JSON.stringify(Object.keys(gh.calls[1].data))==='["body"]','different findings: the one open issue is updated');
  test(gh.calls.every(c=>c.url.startsWith(`https://api.github.com/repos/${repo}/issues`)&&c.auth==='Bearer test-token'),'only this repository\'s issues API, with the workflow token');
  await assert.rejects(review.upsertIssue(body,opts(github([],403))),/HTTP 403/);total++;

  // Daily review: the whole run.
  const env={GITHUB_TOKEN:'test-token',GITHUB_REPOSITORY:repo},quiet=()=>{};
  const fetchSite=lists=>async route=>{test(dataService.ROUTES.includes(route),'deadlock.io: only the fixed routes');return JSON.parse(JSON.stringify(lists[route]));};
  const sameAsReviewed=async()=>apiLists()['/v1/assets/heroes'];
  gh=github([]);
  let run=await review.main({argv:[],env,fetchJSON:fetchSite(siteLists({build:fixture.build})),fetchAssets:sameAsReviewed,fetchImpl:gh.fetch,log:quiet});
  test(run.action==='none'&&gh.calls.length===0,'no differences: no GitHub calls at all');
  gh=github([]);
  run=await review.main({argv:[],env,fetchJSON:fetchSite(patched),fetchAssets:async()=>[{id:86,name:'Violet',player_selectable:true,disabled:false}],fetchImpl:gh.fetch,log:quiet});
  test(run.action==='opened'&&gh.calls.at(-1).data.body.includes('**Newguy** (ID 90)'),'differences: the issue is opened');
  gh=github([]);
  run=await review.main({argv:[],env,fetchJSON:fetchSite(patched),fetchAssets:async()=>{throw new Error('down');},fetchImpl:gh.fetch,log:quiet});
  test(run.action==='opened'&&!gh.calls.at(-1).data.body.includes('Violet'),'deadlock-api unavailable: deadlock.io alone is checked');
  gh=github([]);
  run=await review.main({argv:['--dry-run'],env:{},fetchJSON:fetchSite(patched),fetchAssets:sameAsReviewed,fetchImpl:gh.fetch,log:quiet});
  test(run.action==='dry-run'&&run.body.includes('Brand New')&&gh.calls.length===0,'--dry-run prints the issue and calls nothing');
  await assert.rejects(review.main({argv:[],env:{},fetchJSON:fetchSite(patched),fetchAssets:sameAsReviewed,fetchImpl:gh.fetch,log:quiet}),/GITHUB_TOKEN/);total++;

  // Daily review: the workflow.
  const wf=read('.github/workflows/game-data-review.yml');
  test(/on:\n  schedule:\n    - cron: '\d+ \d+ \* \* \*'\n  workflow_dispatch:/.test(wf),'runs daily and on manual dispatch');
  test(/permissions:\n  contents: read\n  issues: write\n/.test(wf)&&(wf.match(/secrets\.\w+/g)||[]).join()==='secrets.GITHUB_TOKEN','GITHUB_TOKEN only, with issue write access');
  test(wf.includes('- run: node tests/game-data-review.cjs\n')&&!/npm (ci|install)/.test(wf),'runs the review script with Node built-ins only');
  test(JSON.parse(read('package.json')).scripts.test.split('&&').map(s=>s.trim()).includes('node tests/game-data-tests.cjs'),'this suite is part of npm test');

  finished=true;
  console.log(`PASS: ${total} automatic game data checks (simulated services)`);
})().catch(e=>{console.error(e);process.exit(1);});
