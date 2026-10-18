'use strict';
// Pre-QA companion features: Overwolf privacy settings (CMP), legal links, the
// show/hide hotkey, the first-run intro, offline messages and edition wording.
// Uses fakes shaped like Electron / ow-electron; not proof of runtime behavior.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createPrivacy,LEGAL_URLS}=require('../desktop/privacy.cjs');
const {SHOW_HIDE_ACCELERATOR,SHOW_HIDE_LABEL,toggleWindow,registerShowHideHotkey}=require('../desktop/hotkey.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
// Fail instead of exiting 0 if the async checks stop before the end.
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});

(async()=>{
  // Privacy (CMP): unavailable in the standard build.
  const standard=createPrivacy({app:{}});
  test(!standard.available&&JSON.stringify(await standard.status())==='{"available":false,"required":false}'&&await standard.openSettings('vendors')===false,'standard build: no Overwolf privacy settings');

  // Overwolf edition: consent requirement and the settings window.
  const calls=[];
  const win={isDestroyed:()=>false};
  const fakeOw=required=>({
    isCMPRequired:async()=>{if(required instanceof Error)throw required;return required;},
    openAdPrivacySettingsWindow(options){calls.push(['new',options,this]);return Promise.resolve();},
    openCMPWindow(options){calls.push(['old',options]);return Promise.resolve();}
  });
  const ow=fakeOw(false);
  const priv=createPrivacy({app:{overwolf:ow},getWindow:()=>win});
  test(priv.available&&(await priv.status()).required===false,'consent not required where Overwolf says so');
  test((await createPrivacy({app:{overwolf:fakeOw(true)}}).status()).required===true,'consent required where Overwolf says so');
  test((await createPrivacy({app:{overwolf:fakeOw(new Error('offline'))}}).status()).required===true,'if Overwolf cannot tell, consent counts as required (its documented default)');
  await priv.openSettings('vendors');
  let [kind,options,self]=calls.at(-1);
  test(kind==='new'&&options.tab==='vendors'&&options.parent===win&&options.modal===true&&self===ow,'opens Overwolf\'s ad privacy settings window, modal over the app, on the requested tab');
  await priv.openSettings('<script>');
  test(!('tab' in calls.at(-1)[1]),'unknown tabs are ignored');
  const legacy={isCMPRequired:async()=>true,openCMPWindow(options){calls.push(['old',options]);return Promise.resolve();}};
  await createPrivacy({app:{overwolf:legacy},getWindow:()=>null}).openSettings();
  test(calls.at(-1)[0]==='old'&&!('parent' in calls.at(-1)[1]),'older runtimes fall back to openCMPWindow; no parent when the window is gone');
  test(Object.keys(LEGAL_URLS).join()==='privacy,terms'&&Object.values(LEGAL_URLS).every(u=>/^https:\/\/awkwardcarl\.github\.io\/deadlockcounteradvisor\/(privacy|terms)\.html$/.test(u))&&Object.isFrozen(LEGAL_URLS),'exactly two fixed policy URLs');

  // Hotkey: shows without taking focus (a fullscreen game could minimize), hides by minimizing.
  const log=[];
  const fakeWin=(visible,minimized)=>({isDestroyed:()=>false,isVisible:()=>visible,isMinimized:()=>minimized,minimize:()=>log.push('minimize'),showInactive:()=>log.push('showInactive'),moveTop:()=>log.push('moveTop'),focus:()=>log.push('focus'),show:()=>log.push('show'),restore:()=>log.push('restore')});
  test(toggleWindow(fakeWin(true,false))==='hidden'&&log.join()==='minimize','visible window: the hotkey minimizes it');
  log.length=0;
  test(toggleWindow(fakeWin(true,true))==='shown'&&log.join()==='showInactive,moveTop','minimized window: shown on top without taking focus');
  log.length=0;
  test(toggleWindow(fakeWin(false,false))==='shown'&&!log.includes('focus')&&!log.includes('show'),'hidden window: never focused or activated');
  test(toggleWindow(null)==='none'&&toggleWindow({isDestroyed:()=>true})==='none','no window: nothing happens');
  let registered=null;
  test(registerShowHideHotkey({register:(acc,cb)=>{registered=[acc,cb];return true;}},()=>fakeWin(true,false))===true&&registered[0]===SHOW_HIDE_ACCELERATOR,'hotkey registers its accelerator');
  log.length=0;registered[1]();
  test(log.join()==='minimize','the registered hotkey toggles the window');
  test(registerShowHideHotkey({register:()=>false},()=>null)===false&&registerShowHideHotkey({register:()=>{throw new Error('taken');}},()=>null)===false,'a hotkey already taken reports false instead of throwing');
  test(SHOW_HIDE_ACCELERATOR==='CommandOrControl+Shift+F12'&&!/Space|\+[A-Z]$|Alt/.test(SHOW_HIDE_ACCELERATOR),'hotkey avoids movement keys, letters and Ctrl+Alt (AltGr) combinations');

  // Main process and preload wiring.
  const main=read('desktop/main.cjs').replace(/\r\n/g,'\n'),preload=read('desktop/preload.cjs');
  for(const channel of ['privacy:status','privacy:open','legal:open'])test(new RegExp(`ipcMain\\.handle\\('${channel}'[^\\n]*\\n?[^\\n]*trusted\\(event\\)`).test(main),`${channel} only answers the app window`);
  test(main.includes('Object.prototype.hasOwnProperty.call(LEGAL_URLS,which)')&&main.includes('shell.openExternal(LEGAL_URLS[which])'),'legal:open opens only the two fixed URLs');
  test(main.indexOf('registerShowHideHotkey(globalShortcut')<main.indexOf('  createWindow();\n  updates.start();')&&main.includes("app.on('will-quit', () => globalShortcut.unregisterAll());"),'hotkey registered before the window is created, released on quit');
  test(main.includes("'--counter-advisor-edition='+(app.overwolf?'overwolf':'standard')")&&main.includes("'--counter-advisor-hotkey='+(hotkeyLabel||'none')"),'main tells the preload the edition and hotkey');
  test(['edition:','hotkey:','getPrivacyStatus:','openPrivacySettings:','openLegal:'].every(k=>preload.includes(k))&&preload.includes("which === 'terms' ? 'terms' : 'privacy'"),'preload exposes edition, hotkey, privacy and legal calls (legal limited to two values)');

  // Page: privacy section, shortcuts, intro, offline notice, editions.
  const html=read('index.html'),ui=read('js/ui.js'),debriefUI=read('js/debrief-ui.js'),css=read('desktop.css');
  const card=id=>html.slice(html.indexOf(`id="${id}"`),html.indexOf('</section>',html.indexOf(`id="${id}"`)));
  test(card('privacyCard').includes('<h2>Privacy</h2>')&&card('privacyCard').includes('id="managePrivacy" class="addButton owOnly"')&&card('privacyCard').includes('data-legal="privacy"')&&card('privacyCard').includes('data-legal="terms"'),'Settings has a Privacy section with Manage (Overwolf edition) and both policy links');
  test(card('shortcutsCard').includes(`<kbd id="hotkeyLabel">${SHOW_HIDE_LABEL}</kbd>`)&&card('shortcutsCard').includes('id="showIntro"'),'Settings shows the hotkey reminder and can reopen the intro');
  const intro=html.slice(html.indexOf('id="introDialog"'),html.indexOf('</dialog>',html.indexOf('id="introDialog"')));
  test(['id="introPrivacy"','id="introManagePrivacy"','id="introVendors"','id="introDone"','id="introHotkey"','data-legal="terms"','data-legal="privacy"'].every(s=>intro.includes(s))&&intro.includes('class="owOnly"')&&intro.includes('class="standardOnly"'),'intro covers picks, live data or manual entry, debrief, hotkey, consent and policies');
  test(html.includes('id="offlineNotice"')&&/offlineNotice[^>]*hidden/.test(html),'offline notice present, hidden until offline');
  test(['<div class="actionRow devOnly"><button id="toggleGameDetection"','<button id="importReplay" class="muted devOnly"','<div class="devOnly"><span>WINDOWS GAME PROCESS</span>','<p class="supportText tiny devOnly">'].every(s=>html.includes(s))&&html.indexOf('id="selectEventFeed"')>html.indexOf('<div class="actionRow devOnly">')&&html.indexOf('id="selectEventFeed"')<html.indexOf('</div>',html.indexOf('<div class="actionRow devOnly">')),'developer-only controls (process detection, local feed, replay import) are marked devOnly');
  test(css.includes('body:not(.owEdition) .owOnly{display:none!important}')&&css.includes('body.owEdition .standardOnly,body.owEdition .devOnly{display:none!important}'),'edition rules hide the other edition\'s content');
  test(!/development-only|Never assume|authorized game-data provider|explicitly approved external feed|still requires an authorized/.test(html),'no outdated "development-only" or "authorization pending" wording');
  test(html.includes(`<footer>v${JSON.parse(read('package.json')).version} `)&&/<footer>[^]*data-legal="privacy"[^]*data-legal="terms"[^]*<\/footer>/.test(html),'footer keeps the version first and links both policies');
  test(ui.includes("document.body.classList.toggle('owEdition',overwolf)")&&ui.includes("const STORE_INTRO='deadlock-counter-advisor-intro-seen';")&&/if\(!seen\)void openIntro\(\)/.test(ui),'edition class set at startup; intro opens once, on first launch');
  test(/consent=\(await api\.getPrivacyStatus\(\)\)\?\.required===true/.test(ui)&&ui.includes("api?.edition==='overwolf'&&api.getPrivacyStatus")&&ui.includes("$('introPrivacy').hidden=!consent"),'intro shows the consent step only in the Overwolf edition when Overwolf requires it');
  test(ui.includes("$('introDialog').open||")&&ui.includes('const isOffline=()=>navigator.onLine===false;')&&ui.includes("You're offline. Check your internet connection, then sync again.")&&debriefUI.includes("You're offline. Check your internet connection and try again"),'glance key ignores the intro; sync and debrief explain when offline');

  // Legal documents and installer acceptance.
  const pkg=JSON.parse(read('package.json')),privacy=read('docs/privacy.html'),terms=read('docs/terms.html'),license=read(pkg.build.nsis.license);
  test(pkg.author==='Deadlock Counter Advisor'&&pkg.productName==='Deadlock Counter Advisor','package author and product name set (Overwolf checks they stay the same across versions)');
  test(pkg.build.nsis.license==='installer/license.txt'&&license.includes(LEGAL_URLS.terms)&&license.includes(LEGAL_URLS.privacy)&&license.includes('I Agree'),'installer asks users to accept the Terms of Use and Privacy Policy');
  test(require('../electron-builder.overwolf.cjs').nsis.license==='installer/license.txt','the Overwolf edition installer shows the same acceptance page');
  test(['no accounts, no advertising and no analytics of its own','never sent anywhere','does not use or store Steam IDs','deadlock.io','deadlock-api.com','GitHub Releases','https://legal.overwolf.com/docs/overwolf/platform/platform-privacy-policy/','Settings → Privacy → Manage','Effective October 18, 2026','/issues'].every(s=>privacy.includes(s)),'Privacy Policy covers local data, live data, each connection, Overwolf, choices and contact');
  test(['not affiliated with, endorsed by or sponsored by Valve Corporation or Overwolf','“as is”','privacy.html','Effective October 18, 2026','never reads the game’s memory'].every(s=>terms.includes(s)),'Terms of Use cover affiliation, fair play, no warranty and the privacy link');
  test(['index.html','privacy.html','terms.html','style.css'].every(f=>fs.existsSync(path.join(root,'docs',f)))&&!/<script/i.test(privacy+terms),'policy pages are static files for GitHub Pages (no scripts, no login)');
  finished=true;
  console.log(`PASS: ${total} privacy, hotkey, intro, offline and legal checks`);
})().catch(e=>{console.error(e);process.exit(1);});
