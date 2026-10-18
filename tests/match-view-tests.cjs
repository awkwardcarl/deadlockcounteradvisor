'use strict';
// Live match view: status strip, compact enemy team, pick cards that show the
// heroes they answer, change cues, and less chrome above the picks.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

// Engine: each pick names the heroes it answers, in lineup order.
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine,catalog=E.createCatalog(ctx.DeadlockCatalog,require('./fixtures/catalog-snapshot.json'));
const lineup=[{hero:'Vindicta',items:'Headshot Booster, Rapid Rounds'},{hero:'Abrams',items:'Bullet Lifesteal'},{hero:'Paige',items:'Healbane'}];
const out=E.recommend({hero:'Shiv',souls:4850,owned:'',enemies:lineup},catalog);
const names=lineup.map(e=>e.hero);
test(out.quickBuys.length===3&&out.results.every(r=>Array.isArray(r.counters)&&r.counters.length===r.coverage&&r.counters.every(h=>names.includes(h))),'every pick lists the heroes it counters (count matches coverage)');
test(out.results.every(r=>r.counters.join()===names.filter(h=>r.counters.includes(h)).join()),'countered heroes keep lineup order');
test(out.quickBuys.some(r=>r.counters.length>=2),'picks that answer several enemies show several portraits');

// Page structure.
const html=read('index.html'),ui=read('js/ui.js'),css=read('desktop.css');
const at=id=>html.indexOf(`id="${id}"`);
test(/id="liveStrip"[^>]*hidden/.test(html)&&['liveClock','liveHeroName','liveSouls','liveOwned','liveFresh'].every(id=>at(id)>at('liveStrip')&&at(id)<at('liveStrip')+900),'status strip: clock, hero, souls, items and freshness, hidden until live');
test(at('liveStrip')<at('quickBuys')&&html.slice(at('liveStrip')-200,at('liveStrip')).includes('class="card recommCard"'),'the strip sits at the top of the picks panel');
test(/id="liveTeamCard"[^>]*hidden/.test(html)&&at('liveTeamCard')<html.indexOf('class="card enemyBlock"')&&at('editLineup')>at('liveTeamCard')&&at('liveTeam')>at('editLineup'),'compact enemy team (with Edit) leads the left panel, hidden until live');
const tune=html.slice(at('tunePanel'),html.indexOf('</details>',at('tunePanel')));
test(tune.includes('<summary>Tune picks</summary>')&&['strategyMode','sortMode','filterCategory','affordableOnly'].every(id=>tune.includes(`id="${id}"`))&&!/tunePanel"[^>]*open/.test(html),'the four filters fold behind "Tune picks", closed by default');
const quickHeading=html.slice(html.indexOf('class="quickHeading"'),html.indexOf('id="quickBuys"'));
test(quickHeading.includes('id="evidenceQuality"')&&!quickHeading.includes('verify the shop tooltip'),'evidence note sits under the picks heading, without the repeated disclaimer');

// Pick cards.
const quick=ui.slice(ui.indexOf('function quickCard'),ui.indexOf('const SCORING_NOTE'));
test(quick.includes('`Counters ${r.reasons.slice(0,2).join(\' and \').toLowerCase()}`')&&quick.includes('counterFaces(r)')&&quick.includes("'✓ Buy now'")&&quick.includes('`Save ${fmt.format(r.missing)} more`'),'pick card: short reason, countered heroes, then buy now / save more');
test(!quick.includes('r.why')&&!quick.includes('WHY IT HELPS')&&!quick.includes('basedOn(r)'),'no per-card boilerplate or evidence line on pick cards');
test(ui.includes('const all=r.counters||[],names=all.slice(0,4);')&&ui.includes('`<span class="faceMore">+${all.length-names.length}</span>`'),'up to four portraits, then +N');

// Live view behavior.
test(ui.includes("const live=liveWasOn&&state.enemies.length>0;")&&ui.includes("document.body.classList.toggle('liveMatch',live);")&&ui.includes("$('liveTeamCard').hidden=!live;"),'live view only while a live source is connected and reports an enemy team');
test(/liveWasOn=liveOn;\n updateMatchView\(\);/.test(ui)&&/ updateMatchView\(\);\n const overwolf=match\.source==='overwolf';/.test(ui),'live view follows both status changes and match snapshots');
test(ui.includes('const NEW_BUY_MS=20000;')&&ui.includes('if(result.changed&&prev&&!result.ended)noteNewPurchases(before);'),'new enemy purchases glow for 20 s, never on the first snapshot or at match end');
test(ui.includes('const PICK_HIGHLIGHT_MS=6000;')&&/function updateCatalogUI\(\)\{\n[^\n]*\n lastPickNames=\[\];/.test(ui)&&ui.includes("if(live&&!document.body.classList.contains('liveMatch'))lastPickNames=[];")&&ui.includes(' if(!prev)lastPickNames=[];'),'changed picks highlight for 6 s, but not after a catalog load, entering the live view or a first snapshot');
test(ui.includes("$('liveStrip').classList.toggle('liveStale',secs>=30);")&&ui.includes("`updated ${secs}s ago`"),'strip shows how fresh live data is and turns amber after 30 s without updates');
test(ui.includes("const on=document.body.classList.toggle('editLineup');")&&css.includes('body.liveMatch:not(.editLineup) .enemyBlock,body.liveMatch:not(.editLineup) .heroCard{display:none}'),'Edit shows the full editors; Done folds them away');

// Layout and chrome.
test(css.includes('@media (min-width:1161px){body.liveMatch .workspace{grid-template-columns:minmax(300px,.6fr) minmax(0,1.4fr)}}')&&css.includes('@media (max-width:1160px){body.liveMatch .rightPanel{order:-1}}'),'live view gives the picks most of the width, and puts them first when stacked');
test(css.includes('body.liveMatch.glanceMode .workspace{grid-template-columns:minmax(0,1fr)}')&&css.includes('body.liveMatch .glanceBar,body.glanceMode .tunePanel{display:none}'),'glance mode uses the full width in the live view');
test(css.includes('@media (prefers-reduced-motion:no-preference){.quickChanged,.liveItemNew{animation:'),'change cues only animate when the system allows motion');
test(ui.includes("status.hidden=phase==='unavailable';")&&ui.includes("$('displayInfo').textContent=count>1?`Screen ${cur}/${count}`:'';"),'toolbar drops "Updates: unavailable" and shortens the display label');
test(ui.includes("localStorage.getItem(STORE_NOTICE)==='1'||localStorage.getItem(STORE_INTRO)==='1'")&&ui.includes("const remember=()=>{$('topNotice').hidden=true;"),'the info banner hides once the intro has been seen');

console.log(`PASS: ${total} live match view, pick card and layout checks`);
