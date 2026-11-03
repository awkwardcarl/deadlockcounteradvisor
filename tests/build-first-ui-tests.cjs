'use strict';
// Build-first UI: the per-hero build editor (playstyle, ordered core items,
// optional items), the build context passed to the engine for the current hero
// only, and the next-buy presentation of the plan's decision (continue, detour
// and return, complete; unplanned keeps the counter plan).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const html=read('index.html'),ui=read('js/ui.js'),css=read('desktop.css');

// Script order: the build context module loads before the engine and the plan.
const script=src=>html.indexOf(`<script src="${src}"></script>`);
test(script('js/build-context.js')>0,'build-context.js is loaded');
test(script('js/catalog.js')<script('js/build-context.js')&&script('js/build-context.js')<script('js/engine.js')&&script('js/engine.js')<script('js/plan.js')&&script('js/plan.js')<script('js/ui.js'),'build-context.js loads after the catalog and before engine.js, plan.js and ui.js');

// Editor markup: inside the build context card, before the settings.
const at=marker=>{const i=html.indexOf(marker);assert.ok(i>=0,'missing '+marker);return i;};
const hero=html.slice(at('class="card heroCard"'),at('id="setupPanel"'));
const ids=['buildPlan','buildPlanStatus','buildPlaystyle','buildCoreList','buildCoreAdd','buildOptionalList','buildOptionalAdd','buildPlanHelp','buildClear'];
test(ids.every(id=>hero.includes(`id="${id}"`)),'build editor controls sit in the build context card: '+ids.filter(id=>!hero.includes(`id="${id}"`)).join());
test(!/<details class="buildPlan" id="buildPlan"[^>]*\bopen\b/.test(html),'the build editor starts folded, so the card stays compact');
test(['balanced','weapon','spirit','support'].every(v=>hero.includes(`<option value="${v}">`)),'four playstyles: balanced, weapon, spirit, support');
test(hero.includes('<label class="buildPlaystyle" for="buildPlaystyle">')&&hero.includes('aria-label="Playstyle for your hero\'s build"'),'playstyle select is labeled');
test(hero.includes('aria-labelledby="buildCoreLabel"')&&hero.includes('id="buildCoreLabel"')&&hero.includes('aria-labelledby="buildOptionalLabel"')&&hero.includes('id="buildOptionalLabel"'),'both lists are labeled');
test(hero.includes('<ol id="buildCoreList"')&&hero.includes('<ul id="buildOptionalList"'),'core is an ordered list, optional is not');
test(/id="buildCoreAdd"[^>]*list="itemNames"[^>]*aria-label="Add a core item to your build"/.test(hero)&&/id="buildOptionalAdd"[^>]*list="itemNames"[^>]*aria-label="Add an optional item to your build"/.test(hero),'add boxes reuse the item suggestions and are labeled');
test(!/id="build(Core|Optional)Add"[^>]*chipInput/.test(hero),'add boxes are not item chip inputs (no owned/enemy handlers fire)');
test(/id="buildPlanHelp"[^>]*role="status"/.test(hero),'editor messages are announced');

// Readability: 12px text floor and 24px click targets.
const buildCss=css.slice(css.indexOf('/* Your build (per hero)'));
test(buildCss.length>100,'build editor styles exist');
const sizes=[...buildCss.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
test(sizes.length>0&&sizes.every(n=>n>=12),'no build-first text below 12px: '+sizes.join());
test(/\.buildMove,\.buildRemove\{[^}]*min-width:28px;min-height:28px/.test(buildCss),'move and remove buttons are at least 24px');
test(/\.buildNum\{[^}]*width:24px;height:24px/.test(buildCss)&&/\.buildAdd\{[^}]*min-height:36px/.test(buildCss)&&/\.buildPlan>summary\{[^}]*min-height:40px/.test(buildCss),'summary, number badges and add boxes meet the target size');
test(!/#[0-9a-fA-F]{3,8}\b/.test(buildCss)&&!/rgba?\(\s*\d/.test(buildCss),'build-first colors come from Dusk tokens');

// Engine options: the saved build goes along only for the current hero.
test(ui.includes("const BUILD=window.DeadlockBuildContext;"),'the page uses the shared build context module');
test(ui.includes('buildContext:activeBuildContext()});'),'engine.recommend gets options.buildContext');
const active=ui.slice(ui.indexOf('function activeBuildContext(){'),ui.indexOf('// Reload the editor when your hero changes'));
test(active.includes('sameHero(b.hero,state.hero)')&&active.includes('sameHero(buildHero,state.hero)')&&active.includes('return null'),'another hero\'s build is never applied');
test(ui.includes('BUILD.load(buildStorage(),buildHero)')&&ui.includes('BUILD.save(buildStorage(),buildHero,'),'builds load and save per hero through the module');
test(ui.indexOf(' syncBuildEditor();\n')>ui.indexOf('function renderAdvice(){')&&ui.indexOf(' syncBuildEditor();\n')<ui.indexOf('const out=engine.recommend(state,catalog,'),'a hero change reloads that hero\'s build before the picks are computed');

// Editor behavior, run against the real build context module.
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
const el=()=>({hidden:false,disabled:false,value:'',innerHTML:'',textContent:'',querySelectorAll:()=>[]});
const els=new Map();
const ctx=vm.createContext({window:{localStorage},console});
vm.runInContext(read('js/build-context.js'),ctx);
assert.ok(ctx.window.DeadlockBuildContext,"build context module loaded");
Object.assign(ctx,{
 $:id=>{if(!els.has(id))els.set(id,el());return els.get(id);},
 escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
 engine:{norm:x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,''),cleanList:x=>String(x||'').split(',').map(s=>s.trim()).filter(Boolean),resolveItemName:(c,x)=>{const t=String(x||'').trim();return c.items.find(i=>i.name.toLowerCase()===t.toLowerCase())?.name||t;}},
 catalog:{items:[{name:'Extra Spirit',cost:800},{name:'Mystic Burst',cost:800},{name:'Improved Spirit',cost:1600,components:['Extra Spirit']},{name:'Spirit Armor',cost:1600}]},
 itemIndex:{known:new Set(['extraspirit','mysticburst','improvedspirit','spiritarmor']),icons:new Map()},
 state:{hero:'Kelvin',owned:'',souls:0},
 renderAdvice:()=>{ctx.advised++;},advised:0,renderBuildBar:()=>{ctx.barRenders++;},barRenders:0
});
const editor=ui.slice(ui.indexOf('const BUILD=window.DeadlockBuildContext;'),ui.indexOf('function setupBuildEditor(){'));
vm.runInContext(editor+';this.api={loadBuild,saveBuild,addBuildItem,activeBuildContext,renderBuildEditor,syncBuildEditor,get ctx(){return buildContext;},get hero(){return buildHero;}};',ctx);
const api=ctx.api;
api.syncBuildEditor();
test(api.hero==='Kelvin'&&api.ctx&&api.ctx.core.length===0,'a hero with no saved build gets an empty one');
test(api.activeBuildContext()===null,'an empty build is not sent: picks stay as before');
test(ctx.$('buildPlanStatus').textContent==='Kelvin: no build saved','status names the hero');
api.addBuildItem('core','extra spirit');
api.addBuildItem('core','Improved Spirit, Spirit Armor');
test(api.ctx.core.join()==='Extra Spirit,Improved Spirit,Spirit Armor','core items are added in order with catalog spelling');
api.addBuildItem('optional','Spirit Armor');
test(api.ctx.core.join()==='Extra Spirit,Improved Spirit'&&api.ctx.optional.join()==='Spirit Armor','adding to the other list moves the item');
test(api.activeBuildContext()?.hero==='Kelvin'&&ctx.advised>0,'a saved build is sent for its hero and the picks refresh');
test(ctx.$('buildCoreList').innerHTML.includes('aria-label="Move Extra Spirit later"')&&ctx.$('buildCoreList').innerHTML.includes('aria-label="Move Extra Spirit earlier" disabled')&&ctx.$('buildCoreList').innerHTML.includes('aria-label="Remove Improved Spirit from core items"'),'rows have labeled move and remove buttons; the ends are disabled');
test(!ctx.$('buildOptionalList').innerHTML.includes('buildMove'),'optional items are not ordered');
api.saveBuild({core:['Improved Spirit','Extra Spirit']});
test(api.ctx.core.join()==='Improved Spirit,Extra Spirit','reordering saves');
api.saveBuild({playstyle:'spirit'});
test(ctx.$('buildPlanStatus').textContent==='Kelvin: 2 core · Spirit','status shows the core count and playstyle');
ctx.state.owned='Improved Spirit';
api.syncBuildEditor();
test(ctx.$('buildCoreList').innerHTML.includes('✓ Owned')&&ctx.$('buildPlanStatus').textContent.includes('(0 to go)'),'owned core items (and their components) are ticked off');
ctx.state.hero='Haze';ctx.state.owned='';
test(api.activeBuildContext()===null,'switching hero stops sending the old hero\'s build at once');
api.syncBuildEditor();
test(api.hero==='Haze'&&api.ctx.core.length===0&&api.activeBuildContext()===null,'switching hero loads that hero\'s (empty) build');
ctx.state.hero='Kelvin';api.syncBuildEditor();
test(api.ctx.core.join()==='Improved Spirit,Extra Spirit'&&api.ctx.playstyle==='spirit','builds persist per hero');
api.addBuildItem('core','Brand New Item');
test(api.ctx.core.includes('Brand New Item')&&ctx.$('buildCoreList').innerHTML.includes('Not in catalog'),'unknown items are kept and marked');

// Decision rendering, run on the real plan module's thenList.
const planCtx=vm.createContext({});
vm.runInContext(read('js/plan.js'),planCtx);
const dctx=vm.createContext({
 PLAN:planCtx.DeadlockPlan,fmt:new Intl.NumberFormat('en-US'),Math,Number,Array,Set,
 escapeHTML:ctx.escapeHTML,engine:ctx.engine,state:{souls:1000},
 buildContext:{hero:'Kelvin',core:['Extra Spirit','Improved Spirit','Spirit Armor']},
 stepArt:()=>'',stepWhy:()=>'counter reason',itemByName:()=>null
});
const decisionSrc=ui.slice(ui.indexOf('// Build-first decision'),ui.indexOf('function renderPlan(out){'));
vm.runInContext(decisionSrc+';this.d={buildDecision,decisionCard,decisionNext,asPick,optionalNote,glanceThen,DECISION_EYEBROWS,THEN_HEADS};',dctx);
const D=dctx.d;
const rec=(name,cost=800)=>({name,cost,effectiveCost:cost,affordable:cost<=1000,missing:Math.max(0,cost-1000),reasons:['Counters spirit burst'],category:'spirit',score:1});
const core=rec('Improved Spirit',1600),armor=rec('Spirit Armor',1600),detour=rec('Debuff Remover',1600);
const plan=(decision,next=core)=>({stage:'mid',next,steps:[],counters:[next,armor],gaps:[],gapsAreBuilds:false,done:[],decision});
test(D.buildDecision({})===null&&D.buildDecision(plan({kind:'unplanned'}))===null&&D.buildDecision(plan(undefined))===null,'no decision, or unplanned, keeps today\'s plan');
// Shapes as js/plan.js builds them: path is the remaining core path, optional the optional items.
const cont=plan({kind:'continue',reason:'Next in your build: Improved Spirit (step 2 of 3)',core,resume:null,extraCost:0,warnings:[],path:[core,armor],optional:[],step:{index:2,total:3}});
const contCard=D.decisionCard(cont,cont.decision);
test(contCard.includes('Next core item: <b>Improved Spirit</b>')&&contCard.includes('Step 2 of 3')&&contCard.includes('Then: Spirit Armor')&&!contCard.includes('decisionWarnings'),'continue: next core item, its step and the core path after it');
test(!contCard.includes('decisionReason'),'continue: a reason that only repeats the item is not shown twice');
const contWhy=D.decisionCard(cont,{...cont.decision,reason:'Stable: no observed threat you leave unanswered.'});
test(contWhy.includes('<p class="decisionReason">Stable: no observed threat you leave unanswered.</p>'),'continue: any other reason is shown');
test(D.asPick(core,cont.decision).kind==='build'&&D.asPick(core,cont.decision).reasons[0]==='Next item in your core build','continue: the next buy card reads as a build step');
test(D.DECISION_EYEBROWS.continue==='NEXT BUY · YOUR BUILD','continue eyebrow');
const adapt=plan({kind:'adapt',reason:'Lash has Mystic Burst and Improved Spirit.',core,resume:core,extraCost:1250,warnings:['No damage reading yet: based on their purchases only.'],path:[core,armor],optional:[],detour},detour);
const adaptCard=D.decisionCard(adapt,adapt.decision);
test(D.decisionNext(adapt,adapt.decision)===detour,'adapt: the next purchase is the detour');
test(adaptCard.includes('Detour: <b>Debuff Remover</b> — then back to <b>Improved Spirit</b>'),'adapt: "Detour: X — then back to <resume>"');
test(adaptCard.includes('+1,250 souls')&&adaptCard.includes('Lash has Mystic Burst and Improved Spirit.'),'adapt: extra cost in souls and the reason');
test(adaptCard.includes('<ul class="decisionWarnings"')&&adaptCard.includes('<li>No damage reading yet: based on their purchases only.</li>'),'adapt: missing-evidence warnings are disclosed');
const free=plan({kind:'adapt',reason:'r',core,resume:core,extraCost:0,warnings:[],path:[core],optional:[],detour},detour);
test(!D.decisionCard(free,free.decision).includes('souls</span>'),'adapt: no cost tag when the detour costs nothing extra');
test(D.asPick(detour,adapt.decision).kind===undefined&&D.asPick(detour,adapt.decision).reasons[0]==='Counters spirit burst','adapt: the detour card keeps its counter reasons');
const extra=rec('Ethereal Shift',3200);
const done=plan({kind:'complete',reason:'Your build is complete. Anything shown now is optional.',core:null,resume:null,extraCost:0,warnings:[],path:[],optional:[extra]},extra);
const doneCard=D.decisionCard(done,done.decision);
test(doneCard.includes('Your build is complete.')&&doneCard.includes('Anything suggested below is optional.')&&!doneCard.includes('Then:'),'complete: says so and labels further suggestions optional');
test(D.asPick(extra,done.decision).reasons[0]==='Optional item from your build','complete: an optional item from your build says so');
test(D.DECISION_EYEBROWS.complete==='OPTIONAL · BUILD COMPLETE'&&D.optionalNote(done.decision).includes('Optional: your build is complete'),'complete: the next card and the plan cards are labeled optional');
test(D.optionalNote(cont.decision).includes('Optional: counter options beside your build'),'counter plans beside a build are labeled optional');
test(D.glanceThen(adapt).includes('THEN BACK TO YOUR BUILD')&&D.glanceThen(adapt).includes('Improved Spirit'),'glance strip follows PLAN.thenList back to the core path');
test(D.glanceThen(done).includes('OPTIONAL · YOUR BUILD IS COMPLETE'),'glance strip is optional once the build is complete');
test(D.decisionCard(adapt,{...adapt.decision,reason:'<img src=x>',warnings:['<b>x</b>']}).includes('&lt;img src=x&gt;')&&!D.decisionCard(adapt,{...adapt.decision,warnings:['<b>x</b>']}).includes('<b>x</b>'),'decision text is escaped');

// renderPlan wiring: unplanned keeps the exact old markup path.
const render=ui.slice(ui.indexOf('function renderPlan(out){'),ui.indexOf('const SCORING_NOTE'));
test(render.includes('if(!plan||!plan.next&&!buildDecision(plan)){')&&render.includes('.filter(Boolean).map(r=>r.name)'),'a finished build with nothing left to buy does not break the page');
test(render.includes('const decision=buildDecision(plan);')&&render.includes('decisionCard(plan,decision)')&&render.includes('optionalNote(decision)'),'renderPlan shows the decision card and optional note');
test(render.includes("}else $('quickBuys').innerHTML=[plan.priority?alertCard(plan.priority):'',`<div class=\"nextBuy${plan.priority?' isPriority':''}\">${quickCard(plan.next,0,eyebrow)}</div>`"),'without a decision the buy plan is unchanged');

console.log(`PASS: ${total} build-first UI checks`);
