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
const FALLBACK='<div class="adFallback" aria-hidden="true"><img src="assets/icon.svg" alt=""><strong>Counter Advisor is free</strong><span>Ads from Overwolf help keep it that way.</span></div>';
test(new RegExp('<section class="card adCard" id="adCard" hidden aria-label="Advertisement">\\s*<div class="adSlot" id="adSlot"><\\/div>\\s*'+FALLBACK.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'\\s*<\\/section>\\s*$').test(leftPanel),'the ad box is the last thing in the left column and starts hidden; its slot is empty (only the ad view goes in it), with the message beside it');
const css=read('desktop.css'),ui0=read('js/ui.js');
test(html.includes('<div id="glanceTeam" class="glanceTeam" aria-label="Enemy purchases"></div>\n          <section class="card adCard glanceAd" id="adCardGlance" hidden aria-label="Advertisement"><div class="adSlot" id="adSlotGlance"></div>'+FALLBACK+'</section>'),'glance view\'s box sits right under the enemy rows and starts hidden, with the same message');
test(css.includes('body:not(.glanceMode) .glanceAd{display:none!important}')&&css.includes('.glanceAd{width:fit-content;margin-top:12px}'),'the glance box never shows outside glance view');
test(css.includes('.adSlot{width:400px;height:300px;min-width:400px;min-height:300px;background:transparent}')&&!/\.adSlot[^{]*\{[^}]*url\(/.test(css),'the slot is exactly 400x300 and transparent (no tome of its own)');
// The message sits behind the ad view, low in the box: small ads sit above it,
// a full-size ad covers it, and it is never clickable.
test(css.includes('.adCard>.adSlot,.adCard>.adFallback{grid-area:1/1}')&&css.includes('.adSlot{position:relative;z-index:1}')&&css.includes('.adFallback{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;width:400px;height:300px;padding-bottom:26px;box-sizing:border-box;text-align:center;pointer-events:none}'),'the message shares the slot\'s cell, underneath the ad view, anchored low and not clickable');
test(!/click|tap/i.test(FALLBACK),'the message never asks anyone to click an ad');
test(css.includes('.adSlot.adBanner+.adFallback{flex-direction:row;justify-content:center;height:60px;padding:0}')&&css.includes('.adSlot.adBanner+.adFallback span{display:none}'),'in the 400x60 banner the message is one line');
test(css.includes('body.adsOn:not(.focusInputs) .leftPanel{display:flex;flex-direction:column;position:sticky;top:var(--left-top,83px);height:calc(100vh - var(--left-top,83px) - 14px);overflow-y:auto;')&&css.includes('body.adsOn .leftPanel>.adCard{margin-top:auto;position:sticky;bottom:0;z-index:1}'),'the left column stays in place and the box is pinned to its bottom (never moves)');
test(css.includes('body.adsOn:not(.glanceMode):not(.focusInputs) .workspace{grid-template-columns:minmax(412px,.6fr) minmax(0,1.4fr)}')&&!css.includes('body.adsOn.liveMatch:not(.glanceMode):not(.focusInputs) .workspace'),'with the box on, the left column narrows to fit it in every view (live and manual), except glance view and with inputs hidden');
// Glance view and Hide inputs are one full-width column: no rule may give the
// workspace two columns while the left column is hidden.
const twoCol=[...css.matchAll(/([^{}]*\.workspace)\s*\{[^}]*grid-template-columns:\s*minmax\(412px/g)].map(m=>m[1]);
test(twoCol.length===1&&twoCol.every(sel=>sel.includes(':not(.glanceMode)')&&sel.includes(':not(.focusInputs)')),'the ad layout never applies in glance view or with inputs hidden');
test(css.includes('body.focusInputs .leftPanel{display:none!important}'),'Hide inputs hides the left column (and the box) in every view');
test(css.includes('.adSlot.adBanner{height:60px;min-height:60px}')&&ui0.includes('const AD_TALL_MIN=900,AD_BANNER_H=60,AD_BANNER_CID=\'dca_400x60_main_lb\';'),'under 900px tall the left box is a 400x60 banner');
test(css.includes('body.adsOn .liveRowBody{display:flex;align-items:center;gap:8px}')&&css.includes('body.adsOn .liveItem.hasIcon .liveItemName{display:none}')&&css.includes('body.adsOn .liveItemNew.hasIcon{outline:2px solid var(--dca-gold);outline-offset:1px}'),'with the ad box on, enemy rows are one line of item icons, new purchases still ringed');
test(ui0.includes('<span class=\"liveItem${icon?\' hasIcon\':\'\'}${isNew.has(key)?\' liveItemNew\':\'\'}\" title=\"${escapeHTML(name)}\">')&&ui0.includes('<span class=\"liveItemName\">'),'item names stay on hover and for items without an icon');
test(JSON.parse(read('package.json')).scripts['start:overwolf:test-ads']==='ow-electron . --test-ad','a script previews ads with Overwolf\'s --test-ad flag');

// The real lifecycle code, run against a simulated page.
const ui=read('js/ui.js');
const code=ui.slice(ui.indexOf("const AD_CID='dca_400x300_main_lb'"),ui.indexOf('async function syncCatalogNow(){'));
const NONE={left:0,top:0,right:0,bottom:0,width:0,height:0};
function page({edition='overwolf',ads=true,glance=false}={}){
  const state={rect:{left:15,top:365,right:415,bottom:665,width:400,height:300},grect:NONE,teamBottom:639,innerH:1040,dialog:false,timers:[],listeners:{},vars:{}};
  const children=[],gChildren=[];
  const slotClasses=new Set();
  const slot={getBoundingClientRect:()=>state.rect,append:el=>{el.list=children;children.push(el);},classList:{toggle:(c,on)=>on?slotClasses.add(c):slotClasses.delete(c),contains:c=>slotClasses.has(c)}};
  const card={hidden:true},gCard={hidden:true};
  const gSlot={getBoundingClientRect:()=>gCard.hidden?NONE:state.grect,append:el=>{el.list=gChildren;gChildren.push(el);}};
  const team={getBoundingClientRect:()=>({height:110,bottom:state.teamBottom})};
  const bodyClasses=new Set();
  const make=tag=>{const el={tag,attrs:{},setAttribute(k,v){this.attrs[k]=v;},remove(){const list=el.list||children,i=list.indexOf(el);if(i>=0)list.splice(i,1);}};return el;};
  const Observer=class{constructor(){}observe(){}};
  const ctx=vm.createContext({
    $:id=>({adSlot:slot,adCard:card,glanceTeam:team,quickBuys:team,...(glance?{adSlotGlance:gSlot,adCardGlance:gCard}:{})})[id]||null,
    window:{desktopAPI:{edition,ads},innerWidth:1920,get innerHeight(){return state.innerH;},scrollY:0,addEventListener:(name,fn)=>{state.listeners[name]=fn;}},
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
  return {api,state,children,card,gChildren,gCard,bodyClasses,slotClasses,poke};
}
const p=page();
test(p.api&&!p.card.hidden&&p.bodyClasses.has('adsOn'),'Overwolf edition with ads on: the box shows');
test(p.children.length===1&&p.children[0].tag==='owadview'&&p.children[0].attrs.cid==='dca_400x300_main_lb','fully on screen: one ad view with the container ID');
test(p.state.vars['--left-top']==='83px','the left column is pinned where it starts (below the top bar)');
const firstView=p.children[0];
p.state.rect={left:15,top:800,right:415,bottom:1100,width:400,height:300};p.poke();
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
// Windows under 900px tall: the left box is Overwolf's 400x60 banner instead.
const b=page();
const tallView=b.children[0];
b.state.innerH=824;b.state.rect={left:15,top:748,right:415,bottom:810,width:400,height:62};b.poke();
test(b.slotClasses.has('adBanner')&&b.children.length===1&&b.children[0].attrs.cid==='dca_400x60_main_lb'&&b.children[0]!==tallView,'a short window (1536x824): the box becomes a 400x60 banner, closed and reopened at the new size');
b.state.innerH=1040;b.state.rect={left:15,top:724,right:415,bottom:1024,width:400,height:300};b.poke();
test(!b.slotClasses.has('adBanner')&&b.children.length===1&&b.children[0].attrs.cid==='dca_400x300_main_lb','a tall window again: back to 400x300');
const sameView=b.children[0];b.poke();
test(b.children[0]===sameView,'no size change, no reload: the ad view keeps playing');
// Glance view: the left box closes; a box under the enemy rows opens only when it fits.
const g=page({glance:true});
g.state.innerH=1040;g.poke();
test(g.children.length===1&&g.gCard.hidden&&g.gChildren.length===0,'outside glance view: only the left column\'s box');
g.bodyClasses.add('glanceMode');g.state.rect=NONE;g.state.grect={left:36,top:651,right:436,bottom:951,width:400,height:300};g.poke();
test(g.children.length===0&&!g.gCard.hidden&&g.gChildren.length===1&&g.gChildren[0].attrs.cid==='dca_400x300_glance','glance view on a tall window: the left box closes and one opens under the enemy rows');
g.state.innerH=680;g.state.teamBottom=627;g.poke();
test(g.gCard.hidden&&g.gChildren.length===0&&g.children.length===0,'glance view on a short window (1366x680): no room, so no box and no scrolling');
g.state.innerH=1040;g.state.teamBottom=639;g.poke();
test(!g.gCard.hidden&&g.gChildren.length===1,'taller again: the glance box comes back');
g.bodyClasses.delete('glanceMode');g.state.rect={left:15,top:365,right:415,bottom:665,width:400,height:300};g.poke();
test(g.gCard.hidden&&g.gChildren.length===0&&g.children.length===1,'leaving glance view: back to the left column\'s box, one at a time');
for(const opts of [{edition:'standard',ads:true},{edition:'overwolf',ads:false},{edition:'standard',ads:false}]){
  const q=page(opts);
  test(q.api===null&&q.card.hidden&&!q.bodyClasses.has('adsOn')&&q.children.length===0,`no box: ${opts.edition} edition, ads ${opts.ads?'on':'off'}`);
}

// Policies say what the box does.
const privacy=read('docs/privacy.html'),license=read('installer/license.txt');
test(privacy.includes('<h2>Ads (Overwolf edition)</h2>')&&privacy.includes('reserves one ad space: at the bottom of the left panel (400 × 300')&&privacy.includes('or a 400 × 60 banner on shorter windows')&&privacy.includes('in glance view under the enemy team (400 × 300) when the window is tall enough. Only one shows at a time.')&&privacy.includes('stays empty until Overwolf turns on ads')&&privacy.includes('including personalized ads'),'Privacy Policy: one ad space in the Overwolf edition, empty until Overwolf turns ads on, consent under Manage');
test(privacy.includes('The standard edition shows no ads.')&&!privacy.includes('no advertising'),'Privacy Policy: no ads in the standard edition, and no leftover "no advertising" claim');
test(license.includes("The Overwolf edition\n  shows ads from Overwolf's ad platform in one ad space")&&!license.includes('no advertising'),'installer summary matches');
test(read('QA-NOTES.md').includes('### Ad box')&&read('QA-NOTES.md').includes('npm run start:overwolf:test-ads'),'QA notes describe the box and how to preview it');

console.log(`PASS: ${total} Overwolf ad box checks`);
