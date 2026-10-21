'use strict';
// Overwolf ad box (Overwolf edition): one 400x300 <owadview> at the bottom of
// the left column, only the ad view may be embedded, the box exists only while
// fully on screen, and the policies say so. The standard edition shows no ads.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

// Settings and the embed guard.
const {ADS,adViewAllowed,lockDownAdView,originOf}=require('../desktop/ads.cjs');
test(ADS.slot===true&&ADS.width===400&&ADS.height===300&&ADS.cid==='dca_400x300_main_lb'&&ADS.cid.length<=20,'one 400x300 box with a container ID within Overwolf\'s 20 characters');
test(adViewAllowed({src:'https://ads.example.com/x'})&&adViewAllowed({src:''})&&adViewAllowed({src:'about:blank'})&&adViewAllowed({}),'the ad view may load over https or start blank');
test(['http://ads.example.com','file:///C:/x.html','data:text/html,x','javascript:alert(1)','https://','chrome://settings'].every(src=>!adViewAllowed({src})),'nothing else may be embedded (http, file, data, javascript, browser pages)');
const prefs=lockDownAdView({nodeIntegration:true,nodeIntegrationInSubFrames:true,contextIsolation:false,webSecurity:false});
test(prefs.nodeIntegration===false&&prefs.nodeIntegrationInSubFrames===false&&prefs.contextIsolation===true&&prefs.webSecurity===true,'the ad view runs isolated, without Node');
test(originOf('https://ads.example.com/a?b=1')==='https://ads.example.com'&&originOf('')==='(blank)','the terminal logs only the ad view\'s origin');

// Main process: Overwolf edition only; every other embedded page is refused.
const main=read('desktop/main.cjs');
test(main.includes("const adsOn=()=>!!app.overwolf&&ADS.slot===true;")&&main.includes('webviewTag: adsOn(),'),'embedding is switched on only in the Overwolf edition with the ad box');
test(main.includes("if(!adsOn()||!adViewAllowed(params)){ event.preventDefault();")&&main.includes('lockDownAdView(webPreferences);'),'will-attach-webview refuses anything but the ad view and locks the ad view down');
test(main.includes("'--counter-advisor-ads='+(adsOn()?'on':'off')")&&read('desktop/preload.cjs').includes("ads: flag('ads') === 'on',"),'the page learns whether to show the box from the main process');
test(main.includes("registerOfflineRestrictions(session.defaultSession, details => !!mainWindow && !mainWindow.isDestroyed() && details.webContentsId === mainWindow.webContents.id);"),'the app page itself stays network-locked; only the ad view\'s own requests pass');
test(main.includes("backgroundColor: '#15141C',"),'window background matches the Dusk theme');

// Page: the box sits last in the left column, hidden until switched on.
const html=read('index.html');
const leftPanel=html.slice(html.indexOf('<aside class="leftPanel"'),html.indexOf('</aside>'));
test(/<section class="card adCard" id="adCard" hidden aria-label="Advertisement">\s*<div class="adSlot" id="adSlot"><\/div>\s*<\/section>\s*$/.test(leftPanel),'the ad box is the last thing in the left column and starts hidden');
const css=read('desktop.css');
test(css.includes('.adSlot{width:400px;height:300px;min-width:400px;min-height:300px;background:transparent url(assets/icon.svg) center/72px no-repeat}'),'the slot is exactly 400x300 with a transparent background over the fallback tome');
test(css.includes('body.adsOn:not(.focusInputs) .leftPanel{display:flex;flex-direction:column;position:sticky;top:var(--left-top,83px);height:calc(100vh - var(--left-top,83px) - 14px);overflow-y:auto;')&&css.includes('body.adsOn .adCard{margin-top:auto;position:sticky;bottom:0;z-index:1}'),'the left column stays in place and the box is pinned to its bottom (never moves)');
test(css.includes('body.adsOn.liveMatch:not(.glanceMode):not(.focusInputs) .workspace{grid-template-columns:minmax(412px,.6fr) minmax(0,1.4fr)}'),'the live view\'s left column is wide enough for the box, except in glance view and with inputs hidden');
// Glance view and Hide inputs are one full-width column: no rule may give the
// workspace two columns while the left column is hidden.
const twoCol=[...css.matchAll(/([^{}]*\.workspace)\s*\{[^}]*grid-template-columns:\s*minmax\(412px/g)].map(m=>m[1]);
test(twoCol.length===1&&twoCol.every(sel=>sel.includes(':not(.glanceMode)')&&sel.includes(':not(.focusInputs)')),'the ad layout never applies in glance view or with inputs hidden');
test(css.includes('body.focusInputs .leftPanel{display:none!important}'),'Hide inputs hides the left column (and the box) in every view');
test(JSON.parse(read('package.json')).scripts['start:overwolf:test-ads']==='ow-electron . --test-ad','a script previews ads with Overwolf\'s --test-ad flag');

// The real lifecycle code, run against a simulated page.
const ui=read('js/ui.js');
const code=ui.slice(ui.indexOf("const AD_CID='dca_400x300_main_lb'"),ui.indexOf('async function syncCatalogNow(){'));
function page({edition='overwolf',ads=true}={}){
  const state={rect:{left:15,top:365,right:415,bottom:665,width:400,height:300},dialog:false,timers:[],listeners:{},vars:{}};
  const children=[];
  const slot={getBoundingClientRect:()=>state.rect,append:el=>children.push(el)};
  const card={hidden:true};
  const bodyClasses=new Set();
  const make=tag=>{const el={tag,attrs:{},setAttribute(k,v){this.attrs[k]=v;},remove(){const i=children.indexOf(el);if(i>=0)children.splice(i,1);}};return el;};
  const Observer=class{constructor(){}observe(){}};
  const ctx=vm.createContext({
    $:id=>id==='adSlot'?slot:id==='adCard'?card:null,
    window:{desktopAPI:{edition,ads},innerWidth:1366,innerHeight:680,scrollY:0,addEventListener:(name,fn)=>{state.listeners[name]=fn;}},
    document:{createElement:make,body:{classList:{add:c=>bodyClasses.add(c),contains:c=>bodyClasses.has(c)}},documentElement:{style:{setProperty:(k,v)=>{state.vars[k]=v;}}},
      querySelector:sel=>sel==='.workspace'?{getBoundingClientRect:()=>({top:69})}:sel==='dialog[open]'?(state.dialog?{}:null):null,querySelectorAll:()=>[]},
    getComputedStyle:()=>({paddingTop:'14px'}),IntersectionObserver:Observer,ResizeObserver:Observer,MutationObserver:Observer,
    setTimeout:fn=>state.timers.push(fn),parseFloat,Math
  });
  vm.runInContext(code+';this.setupAds=setupAds;',ctx);
  const api=ctx.setupAds();
  const flush=()=>{while(state.timers.length)state.timers.shift()();};
  const poke=()=>{state.listeners.resize?.();flush();};
  flush();
  return {api,state,children,card,bodyClasses,poke};
}
const p=page();
test(p.api&&!p.card.hidden&&p.bodyClasses.has('adsOn'),'Overwolf edition with ads on: the box shows');
test(p.children.length===1&&p.children[0].tag==='owadview'&&p.children[0].attrs.cid==='dca_400x300_main_lb','fully on screen: one ad view with the container ID');
test(p.state.vars['--left-top']==='83px','the left column is pinned where it starts (below the top bar)');
const firstView=p.children[0];
p.state.rect={left:15,top:600,right:415,bottom:900,width:400,height:300};p.poke();
test(p.children.length===0,'partly off screen: the ad view closes');
p.state.rect={left:15,top:365,right:415,bottom:665,width:400,height:300};p.poke();
test(p.children.length===1&&p.children[0]!==firstView,'back on screen: a new ad view opens (closed and reopened, never hidden)');
p.state.dialog=true;p.poke();
test(p.children.length===0,'a dialog open: the ad view closes');
p.state.dialog=false;p.poke();
test(p.children.length===1,'dialog closed: it reopens');
p.state.rect={left:0,top:0,right:0,bottom:0,width:0,height:0};p.poke();
test(p.children.length===0,'hidden (glance view, Hide inputs, the debrief): the ad view closes');
p.state.rect={left:15,top:365,right:414,bottom:665,width:399,height:300};p.poke();
test(p.children.length===0,'squeezed below 400 wide: no ad view');
for(const opts of [{edition:'standard',ads:true},{edition:'overwolf',ads:false},{edition:'standard',ads:false}]){
  const q=page(opts);
  test(q.api===null&&q.card.hidden&&!q.bodyClasses.has('adsOn')&&q.children.length===0,`no box: ${opts.edition} edition, ads ${opts.ads?'on':'off'}`);
}

// Policies say what the box does.
const privacy=read('docs/privacy.html'),license=read('installer/license.txt');
test(privacy.includes('<h2>Ads (Overwolf edition)</h2>')&&privacy.includes('reserves one ad space (400 × 300)')&&privacy.includes('stays empty until Overwolf turns on ads')&&privacy.includes('including personalized ads'),'Privacy Policy: one ad space in the Overwolf edition, empty until Overwolf turns ads on, consent under Manage');
test(privacy.includes('The standard edition shows no ads.')&&!privacy.includes('no advertising'),'Privacy Policy: no ads in the standard edition, and no leftover "no advertising" claim');
test(license.includes("The Overwolf edition\n  shows ads from Overwolf's ad platform in one ad space")&&!license.includes('no advertising'),'installer summary matches');
test(read('QA-NOTES.md').includes('### Ad box')&&read('QA-NOTES.md').includes('npm run start:overwolf:test-ads'),'QA notes describe the box and how to preview it');

console.log(`PASS: ${total} Overwolf ad box checks`);
