(function(){
'use strict';
const $=id=>document.getElementById(id);
const base=window.DeadlockCatalog,engine=window.DeadlockEngine,liveMerge=window.DeadlockLiveMerge;
const STORE='deadlock-counter-advisor-desktop-v0.2';
const STORE_UI_SIZE='deadlock-counter-advisor-ui-size';
const STORE_SETUP_OPEN='deadlock-counter-advisor-setup-open';
const STORE_GLANCE='deadlock-counter-advisor-glance';
const STORE_NOTICE='deadlock-counter-advisor-notice-dismissed';
const STORE_INTRO='deadlock-counter-advisor-intro-seen';
const STORE_BUILD_DATA='deadlock-counter-advisor-build-data';
const VALID_UI_SIZES=new Set(['auto','standard','comfortable','large']);
function applyUISize(size){
 const chosen=VALID_UI_SIZES.has(size)?size:'auto';
 document.documentElement.dataset.uiSize=chosen;
 $('uiScale').value=chosen;
 try{localStorage.setItem(STORE_UI_SIZE,chosen);}catch(_){}
}

const fmt=new Intl.NumberFormat('en-US');
const escapeHTML=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=engine.createCatalog(base,null);
// Your hero, souls and items describe one match, so every launch starts them
// fresh (the live feed fills them in once a match starts). Only the enemy
// lineup is saved; live mode clears it at match end. Allies come only from
// the live roster and are never saved.
const defaultState=()=>({hero:'Kelvin',souls:0,owned:'',liveMatchId:'',enemies:[],allies:[]});
// "Load example match" (a fresh copy each time, so edits never change the example).
const demoMatch=()=>({hero:'Kelvin',souls:3200,owned:'Extra Spirit, Extra Stamina',allies:[],enemies:[
 {hero:'Lash',items:'Mystic Burst, Improved Spirit'},
 {hero:'Bebop',items:'Tankbuster'},
 {hero:'Haze',items:'Rapid Rounds, Burst Fire'},
 {hero:'Infernus',items:'Healing Booster'}
]});
function loadState(){
 const fresh=defaultState();
 try{
  const raw=localStorage.getItem(STORE);
  if(!raw||raw.length>12000)return fresh;
  const saved=JSON.parse(raw);
  fresh.enemies=Array.isArray(saved.enemies)?saved.enemies.slice(0,6).map(e=>({hero:String(e?.hero||'').slice(0,100),items:String(e?.items||'').slice(0,1000)})):[];
 }catch(_){}
 return fresh;
}
const state=loadState();
let sortMode='smart',category='all',onlyAffordable=false,strategyMode='balanced',showAllResults=false;
let currentLiveStatus=null,lastFeedSnapshot=null;
const heroes=()=>catalog.heroes.map(h=>h.name).sort((a,b)=>a.localeCompare(b));
// Live feeds tag enemy rows with in-game player names (feedName); those are
// for matching only and are not saved.
function persist(){try{localStorage.setItem(STORE,JSON.stringify({enemies:state.enemies.map(({feedName,...row})=>row)}));}catch(_){}}
// Map a typed or feed-supplied hero name ("HAZE", "VIPER") to the catalog's spelling.
function resolveHeroName(name,id){return engine.resolveHeroName(catalog,name,id);}
// Feed item lists to catalog names, by the game's class names where reported.
function resolveFeedItems(names,ids){return engine.resolveFeedItems(catalog,names,ids);}
// Heroes known only from the hero list (a game update newer than the
// catalog): "<Name> · new hero", with a tooltip.
const newHero=name=>engine.isNewHero(catalog,name);
const newHeroTag=name=>newHero(name)?`<span class="newHero" title="${escapeHTML(engine.NEW_HERO.tip)}">${escapeHTML(engine.NEW_HERO.label)}</span>`:'';
const newHeroTitle=name=>newHero(name)?` title="${escapeHTML(engine.NEW_HERO.tip)}"`:'';
function heroOptions(selected,blank){
 let names=heroes();
 // Only a name outside the catalog's list can be a new hero.
 const fresh=!!selected&&!names.includes(selected)&&newHero(selected);
 if(selected&&!names.includes(selected))names=[selected,...names];
 return (blank?['',...names]:names).map(h=>`<option value="${escapeHTML(h)}" ${h===selected?'selected':''}>${escapeHTML(h?h+(fresh&&h===selected?engine.NEW_HERO.label:''):'Select enemy hero')}</option>`).join('');
}
function portrait(name){return catalog.heroes.find(h=>h.name===name)?.portrait||catalog.heroArt?.[engine.norm(name)]||'';}
function updatePortrait(){
 $('hero').title=newHero(state.hero)?engine.NEW_HERO.tip:'';
 const img=$('heroPortrait'),src=portrait(state.hero);
 img.hidden=!src;
 if(src)img.src=src;else img.removeAttribute('src');
}
function updateSetupStatus(){
 const catalogLabel=catalog.complete?`${catalog.heroes.length} heroes · ${catalog.items.length} items`:'Starter catalog · sync recommended';
 $('setupStatus').textContent=`${catalogLabel} · ${$('topLiveStatus').textContent.trim()}`;
}
function applySetupDefault(){
 let pref=null;try{pref=localStorage.getItem(STORE_SETUP_OPEN);}catch(_){}
 // Until the user chooses, keep setup open only while the catalog needs a sync.
 $('setupPanel').open=pref===null?!catalog.complete:pref==='1';
}
function updateCatalogUI(){
 // A new catalog can reshuffle the picks; that is not a live change to highlight.
 lastPickNames=[];resetPlan();
 $('hero').innerHTML=heroOptions(state.hero,false);$('hero').value=state.hero;
 $('catalogCounts').textContent=catalog.complete?`${catalog.heroes.length} heroes · ${catalog.items.length} items`:'Starter catalog';
 refreshItemIndex();
 $('itemNames').innerHTML=engine.itemSuggestions(catalog).map(name=>`<option value="${escapeHTML(name)}"></option>`).join('');
 updateSetupStatus();applySetupDefault();
 $('syncStatus').textContent=syncStatusText();
 updatePortrait();renderOwned();renderEnemies();renderAdvice();
}
// Settings → Privacy "Update game data automatically". The main process keeps
// the setting (its launch check runs before this page asks); Sync always works.
let autoSync=true;
function syncStatusText(){
 const auto=autoSync?"Refreshes on its own once a day, and when a match shows a hero or item it doesn't know.":'Automatic updates are off (Settings → Privacy): click Sync items & heroes after a game update.';
 if(catalog.complete)return `Cached ${catalog.build||'game data'} · ${catalog.generatedAt.slice(0,10)}. ${catalog.items.length} shop items with game-data prices and icons. ${auto}`;
 return autoSync?'Offline starter list. The app fetches current public game data on its own when online, or click Sync items & heroes.':'Offline starter list. Automatic updates are off: click Sync items & heroes to retrieve current public game data.';
}
function setupAutoSync(){
 const box=$('autoCatalogSync'),api=window.desktopAPI;
 if(!api?.getAutoCatalogSync){box.disabled=true;return;}
 const show=on=>{autoSync=on!==false;box.checked=autoSync;$('syncStatus').textContent=syncStatusText();};
 api.getAutoCatalogSync().then(show).catch(()=>{});
 box.addEventListener('change',()=>api.setAutoCatalogSync(box.checked).then(show).catch(()=>show(!box.checked)));
}
function setSouls(value){
 state.souls=Math.max(0,Math.min(999999,Math.round(Number(value)||0)));
 $('souls').value=state.souls;
 renderAdvice();persist();
}
function setInputs(){ $('hero').value=state.hero;$('souls').value=state.souls;renderOwned();updatePortrait();renderEnemies();renderAdvice(); }

// HTML builders. Pieces are joined with '' so the markup has no stray whitespace.
function enemyRow(e,i){
 const src=portrait(e.hero);
 return [
  `<div class="enemy" data-row="${i}"><div class="enemyTop">`,
  `<img class="enemyPortrait" src="${escapeHTML(src)}" alt="" ${src?'':'hidden'}>`,
  `<select class="enemyHero" data-index="${i}" aria-label="Enemy ${i+1} hero"${newHeroTitle(e.hero)}>${heroOptions(e.hero,true)}</select>`,
  `<button class="pickHero" type="button" data-target="enemy:${i}" aria-label="Choose enemy ${i+1} from portraits" title="Choose from portraits">⊞</button>`,
  `<button class="remove" data-index="${i}" type="button" aria-label="Remove enemy ${i+1}">×</button></div>`,
  `<div class="chipBox">${chipList(e.items,`enemy:${i}`)}`,
  `<input class="chipInput enemyItems" data-index="${i}" data-target="enemy:${i}" type="text" maxlength="100" list="itemNames" placeholder="Add a visible item…" aria-label="Add an item for enemy ${i+1}"></div></div>`
 ].join('');
}
// Item chips. The value is still a comma-separated string in state, so the
// engine, live feed and saved matches are unchanged.
let itemIndex={known:new Set(),icons:new Map()};
function refreshItemIndex(){
 itemIndex={known:new Set(engine.itemSuggestions(catalog).map(engine.norm)),icons:new Map(catalog.items.filter(i=>i.icon).map(i=>[engine.norm(i.name),i.icon]))};
}
function chipList(value,target){
 return engine.cleanList(value).map(name=>{
  const key=engine.norm(name),known=itemIndex.known.has(key),icon=itemIndex.icons.get(key);
  return [
   `<span class="chip${known?'':' unknownChip'}"${known?'':' title="Not recognized, so it does not affect the picks"'}>`,
   icon?`<img src="${escapeHTML(icon)}" alt="">`:'',
   escapeHTML(name),
   `<button type="button" class="chipRemove" data-target="${target}" data-item="${escapeHTML(name)}" aria-label="Remove ${escapeHTML(name)}">×</button></span>`
  ].join('');
 }).join('');
}
function getItems(target){return target==='owned'?state.owned:state.enemies[Number(target.split(':')[1])]?.items||'';}
function setItems(target,list){
 const text=list.join(', ');
 if(target==='owned'){state.owned=text;return;}
 const enemy=state.enemies[Number(target.split(':')[1])];
 if(enemy)enemy.items=text;
}
function addItems(target,raw){
 const list=engine.cleanList(getItems(target)),seen=new Set(list.map(engine.norm));
 for(const piece of String(raw).split(',')){
  const name=engine.resolveItemName(catalog,piece);
  if(name&&!seen.has(engine.norm(name))){list.push(name);seen.add(engine.norm(name));}
 }
 setItems(target,list);
}
function removeItem(target,name){setItems(target,engine.cleanList(getItems(target)).filter(n=>engine.norm(n)!==engine.norm(name)));}
function itemsChanged(target){
 if(target==='owned')renderOwned();else renderEnemies();
 renderAdvice();persist();
 document.querySelector(`.chipInput[data-target="${target}"]`)?.focus();
}
function renderOwned(){
 $('ownedChips').innerHTML=chipList(state.owned,'owned')+'<input class="chipInput" id="owned" data-target="owned" type="text" maxlength="100" list="itemNames" placeholder="Add an item you own…" aria-label="Add an owned item">';
}
// Glance mode: only a summary bar and the three picks, in large type.
// Glance view keeps the enemy team's purchases in sight: portrait, name and
// item icons, with new purchases ringed as on the main page.
function renderGlanceTeam(){
 const el=$('glanceTeam');if(!el)return;
 const now=Date.now();
 el.innerHTML=state.enemies.filter(e=>e.hero||e.items).map((e,i)=>{
  const src=portrait(e.hero),fresh=recentBuys.get(e.feedName||String(i)),isNew=fresh&&fresh.until>now?fresh.items:new Set();
  const items=engine.cleanList(e.items).map(name=>{
   const key=engine.norm(name),icon=itemIndex.icons.get(key),cls=isNew.has(key)?' gNew':'';
   return icon?`<img class="gItem${cls}" src="${escapeHTML(icon)}" alt="${escapeHTML(name)}" title="${escapeHTML(name)}">`:`<span class="gChip${cls}">${escapeHTML(name)}</span>`;
  }).join('');
  return `<div class="glanceRow${isNew.size?' gRowNew':''}">${src?`<img class="gPortrait" src="${escapeHTML(src)}" alt="">`:''}<span class="gName">${escapeHTML(e.hero||'Unknown')}${newHeroTag(e.hero)}${state.ownLane&&e.lane===state.ownLane?'<span class="laneTag">Your lane</span>':''}</span><div class="glanceItems">${items||'<span class="emptyText">No items yet</span>'}</div></div>`;
 }).join('');
 el.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
}
function setGlance(on){
 document.body.classList.toggle('glanceMode',on);
 renderGlanceTeam();
 $('glance').textContent=on?'Exit glance':'Glance mode';
 $('glance').setAttribute('aria-pressed',String(on));
 try{localStorage.setItem(STORE_GLANCE,on?'1':'0');}catch(_){}
}
function setupNotice(){
 let dismissed=false;try{dismissed=localStorage.getItem(STORE_NOTICE)==='1'||localStorage.getItem(STORE_INTRO)==='1';}catch(_){}
 $('topNotice').hidden=dismissed;
 $('dismissNotice').addEventListener('click',()=>{$('topNotice').hidden=true;try{localStorage.setItem(STORE_NOTICE,'1');}catch(_){}});
}
// Edition: the Overwolf edition hides developer-only controls (local event
// feed, replay import, process detection); Overwolf supplies live data there.
function setupEdition(){
 const overwolf=window.desktopAPI?.edition==='overwolf';
 document.body.classList.toggle('owEdition',overwolf);
 if(overwolf)$('liveInfo').textContent='Live match data comes from Overwolf once a Deadlock match starts.';
}
// Privacy Policy and Terms links (any [data-legal] button), and Overwolf's
// privacy settings in the Overwolf edition.
function setupPrivacy(){
 const api=window.desktopAPI;
 document.addEventListener('click',e=>{
  const link=e.target.closest?.('[data-legal]');
  if(!link)return;
  e.preventDefault();
  api?.openLegal?.(link.dataset.legal).catch(()=>{});
 });
 const manage=tab=>api?.openPrivacySettings?.(tab).catch(()=>{});
 $('managePrivacy').addEventListener('click',()=>manage('purposes'));
 $('introManagePrivacy').addEventListener('click',()=>manage('purposes'));
 $('introVendors').addEventListener('click',()=>manage('vendors'));
}
// Show/hide hotkey reminder, in Settings and the intro.
function setupShortcuts(){
 const api=window.desktopAPI,key=api?.hotkey||'';
 $('hotkeyLabel').textContent=key||'Off';
 $('hotkeyHelp').textContent=key?'Press it in game to bring this window up or put it away.':api?'Another app is using Ctrl+Shift+F12, so the hotkey is off for now.':'Available in the desktop app.';
 $('introHotkey').textContent=key?`Press ${key} in game to show or hide this window.`:'Switch to this window from the taskbar.';
 $('showIntro').addEventListener('click',()=>void openIntro());
}
// First-run intro. In the Overwolf edition it also offers Overwolf's consent
// choices when Overwolf says they are required: with our own installer, the
// app has to show them on first launch.
async function openIntro(){
 const api=window.desktopAPI;
 let consent=false;
 if(api?.edition==='overwolf'&&api.getPrivacyStatus){try{consent=(await api.getPrivacyStatus())?.required===true;}catch(_){}}
 $('introPrivacy').hidden=!consent;
 if(!$('introDialog').open)$('introDialog').showModal();
}
function setupIntro(){
 const remember=()=>{$('topNotice').hidden=true;try{localStorage.setItem(STORE_INTRO,'1');}catch(_){}};
 const close=()=>{$('introDialog').close();remember();};
 $('introDone').addEventListener('click',close);
 $('introClose').addEventListener('click',close);
 $('introDialog').addEventListener('cancel',remember);
 let seen=false;try{seen=localStorage.getItem(STORE_INTRO)==='1';}catch(_){}
 if(!seen)void openIntro();
}
// Offline: everything local keeps working; say which features need internet.
const isOffline=()=>navigator.onLine===false;
function setupOffline(){
 const update=()=>{$('offlineNotice').hidden=!isOffline();};
 window.addEventListener('online',update);
 window.addEventListener('offline',update);
 update();
}
function setupGlance(){
 let saved=false;try{saved=localStorage.getItem(STORE_GLANCE)==='1';}catch(_){}
 setGlance(saved);
 $('glance').addEventListener('click',()=>setGlance(!document.body.classList.contains('glanceMode')));
 // G toggles and Esc exits, except while typing or with the hero picker open.
 document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.altKey||e.metaKey||$('heroDialog').open||$('introDialog').open||document.body.classList.contains('debriefMode')||e.target.closest?.('input,select,textarea'))return;
  if(e.key==='g'||e.key==='G'){e.preventDefault();setGlance(!document.body.classList.contains('glanceMode'));}
  else if(e.key==='Escape'&&document.body.classList.contains('glanceMode'))setGlance(false);
 });
}
// Hero portrait picker: a searchable grid for your hero or one enemy slot.
let pickerTarget=null;
const initials=name=>name.split(/[\s&]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function currentHeroFor(target){return target==='own'?state.hero:state.enemies[Number(target.split(':')[1])]?.hero;}
function renderHeroGrid(filter=''){
 const key=engine.norm(filter),current=currentHeroFor(pickerTarget);
 const list=catalog.heroes.slice().sort((a,b)=>a.name.localeCompare(b.name)).filter(h=>!key||engine.norm(h.name).includes(key));
 $('heroGrid').innerHTML=list.length?list.map(h=>[
  `<button type="button" class="heroTile${h.name===current?' current':''}" data-hero="${escapeHTML(h.name)}">`,
  h.portrait?`<img src="${escapeHTML(h.portrait)}" alt="" loading="lazy">`:`<span class="heroInitials">${escapeHTML(initials(h.name))}</span>`,
  `<span class="heroTileName">${escapeHTML(h.name)}</span></button>`
 ].join('')).join(''):'<p class="emptyText">No hero matches that name.</p>';
}
function openHeroPicker(target){
 pickerTarget=target;
 $('heroDialogTitle').textContent=target==='own'?'Choose your hero':`Choose enemy ${Number(target.split(':')[1])+1}`;
 $('heroSearch').value='';renderHeroGrid();
 $('heroDialog').showModal();$('heroSearch').focus();
}
function chooseHero(name){
 if(pickerTarget==='own'){state.hero=name;$('hero').value=name;updatePortrait();}
 else{const enemy=state.enemies[Number(pickerTarget.split(':')[1])];if(enemy)enemy.hero=name;renderEnemies();}
 renderAdvice();persist();
 $('heroDialog').close();
}
function setupHeroPicker(){
 const dialog=$('heroDialog');
 document.addEventListener('click',e=>{const trigger=e.target.closest?.('.pickHero');if(trigger)openHeroPicker(trigger.dataset.target);});
 $('heroGrid').addEventListener('click',e=>{const tile=e.target.closest('.heroTile');if(tile)chooseHero(tile.dataset.hero);});
 // A portrait that fails to load falls back to initials.
 $('heroGrid').addEventListener('error',e=>{if(e.target.tagName==='IMG'){const name=e.target.closest('.heroTile')?.dataset.hero||'';e.target.outerHTML=`<span class="heroInitials">${escapeHTML(initials(name))}</span>`;}},true);
 $('heroSearch').addEventListener('input',e=>renderHeroGrid(e.target.value));
 $('heroSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('heroGrid').querySelector('.heroTile')?.click();}});
 $('heroDialogClose').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();}); // backdrop
 dialog.addEventListener('close',()=>{document.querySelector(`.pickHero[data-target="${pickerTarget}"]`)?.focus();});
}
function setupItemChips(){
 const panel=$('inputPanel');
 panel.addEventListener('keydown',e=>{
  const input=e.target.closest('.chipInput');if(!input)return;
  if((e.key==='Enter'||e.key===',')&&input.value.trim()){e.preventDefault();addItems(input.dataset.target,input.value);itemsChanged(input.dataset.target);}
  else if(e.key==='Backspace'&&!input.value){const list=engine.cleanList(getItems(input.dataset.target));if(list.length){removeItem(input.dataset.target,list.at(-1));itemsChanged(input.dataset.target);}}
 });
 panel.addEventListener('input',e=>{
  const input=e.target.closest('.chipInput');if(!input)return;
  // A picked suggestion, or pasted text containing commas, becomes chips at once.
  if(e.inputType==='insertReplacementText'||input.value.includes(',')){addItems(input.dataset.target,input.value);itemsChanged(input.dataset.target);}
 });
 panel.addEventListener('click',e=>{
  const remove=e.target.closest('.chipRemove');
  if(remove){e.preventDefault();removeItem(remove.dataset.target,remove.dataset.item);itemsChanged(remove.dataset.target);}
 });
}
const LEVEL_LABELS={high:'High',medium:'Medium',low:'Low'};
// Threat levels use the matchup states, always with symbol and word: high
// pressure is unfavorable for you (orange ▼), medium even (gray ●), low
// favorable (blue ▲). The raw score stays available as a tooltip.
const LEVEL_MARKS={high:'▼',medium:'●',low:'▲'};
const LEVEL_STATES={high:'unfavorable for you',medium:'even',low:'favorable for you'};
const threatChip=t=>`<span class="threat level-${escapeHTML(t.level)}" title="${LEVEL_LABELS[t.level]||''} threat (${LEVEL_STATES[t.level]||''}) · score ${escapeHTML(t.value)} across ${t.coverage} ${t.coverage===1?'enemy':'enemies'}">${escapeHTML(t.label)} <b><span aria-hidden="true">${LEVEL_MARKS[t.level]||''}</span> ${LEVEL_LABELS[t.level]||''}</b></span>`;
const itemArt=r=>r.icon?`<img loading="lazy" src="${escapeHTML(r.icon)}" alt="">`:'◆';
const shortReasons=r=>escapeHTML(r.reasons.slice(0,2).join(' · ')||'General utility');
const basedOn=r=>r.evidence?.length?`Based on: ${escapeHTML(r.evidence.join(' · '))}`:'';
// Portraits of the enemies a pick answers (up to four, then +N).
function counterFaces(r){
 const all=r.counters||[],names=all.slice(0,4);
 if(!names.length)return '';
 const faces=names.map(n=>{const src=portrait(n);return src?`<img src="${escapeHTML(src)}" alt="" title="${escapeHTML(n)}">`:`<span class="face" title="${escapeHTML(n)}">${escapeHTML(n.slice(0,2))}</span>`;}).join('');
 return `<div class="quickCounters" aria-label="Counters ${escapeHTML(all.join(', '))}">${faces}${all.length>names.length?`<span class="faceMore">+${all.length-names.length}</span>`:''}</div>`;
}
// Picks that just changed during a live match stay highlighted for a few seconds.
const PICK_HIGHLIGHT_MS=6000;
const KIND_LABELS={counter:'Counter',build:'Build',both:'Counter + build'};
// What your team (live roster) changed about a pick: the first note, under
// the reason (so the card grows by one line), all of them in the tooltip.
// Lowered picks are marked as such.
function teamLine(r){
 const notes=r.team||[];
 if(!notes.length)return '';
 const first=notes[0];
 return `<span class="quickTeam${first.up?'':' teamDown'}" title="${escapeHTML(notes.map(n=>n.text).join(' · '))}"><span class="teamTag">Team</span>${escapeHTML(first.text)}</span>`;
}
// "Your team" panel under the threats: allies, then the signals in play.
function teamPanel(team){
 if(!team?.allies?.length)return '';
 const chips=team.signals.map(x=>`<span class="teamChip${x.up?'':' teamDown'}">${escapeHTML(x.label)}</span>`).join('');
 const mix=team.weaponShare===null?'':` · ${Math.round(team.weaponShare*100)}% weapon damage`;
 return `<strong>YOUR TEAM · ${escapeHTML(team.allies.join(', '))}${mix}</strong>${chips?`<div class="teamChips">${chips}</div>`:''}<small>From the live roster: allies' heroes and the items the game reports. ${chips?'They weigh less while laning; each pick they change says why.':'Nothing about your team changes the picks right now.'}</small>`;
}
// "Build: 68% weapon · 32% vitality" from the engine's build profile.
function buildSplit(build){
 if(!build?.shares)return 'No items yet';
 return 'Build: '+Object.entries(build.shares).filter(([,v])=>v>=.05).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${Math.round(v*100)}% ${k}`).join(' · ');
}
// "Spirit +75 power · Vitality +42% health · Weapon +18% damage", most
// invested first, from the engine's investment summary.
const INVEST_SHORT={weapon:'% damage',vitality:'% health',spirit:' power'};
function investmentText(inv){
 if(!inv)return '';
 const cats=['weapon','vitality','spirit'].filter(c=>inv[c]?.spent>0).sort((a,b)=>inv[b].spent-inv[a].spent);
 if(!cats.length)return 'No investment yet';
 return cats.map(c=>`${c[0].toUpperCase()+c.slice(1)} +${inv[c].bonus}${INVEST_SHORT[c]}`).join(' · ');
}
// Tooltip: souls spent per category and the next step.
function investmentTip(inv){
 if(!inv)return '';
 return ['weapon','vitality','spirit'].map(c=>{const x=inv[c];if(!x)return '';const next=x.next?`; next +${x.next.bonus}${x.unit} at ${fmt.format(x.next.at)} (${fmt.format(x.next.at-x.spent)} more)`:'; maximum reached';return `${c[0].toUpperCase()+c.slice(1)}: ${fmt.format(x.spent)} souls → +${x.bonus}${x.unit}${next}`;}).filter(Boolean).join('\n')+(inv.source==='built-in'?'\n(Built-in bonus table: sync the catalog for the game\'s current values.)':'');
}
let lastAdvice=null;
// "In 13 of 20 popular builds · wins 46% vs Infernus" from the engine's backing.
// An item's win rate against the average for items of its tier: favorable
// (▲), even (●) or unfavorable (▼). Even unless the gap clears both 2 points
// and the sample's noise (1.96 standard errors).
function winState(b){
 if(!b||b.wr===null||b.wr===undefined||!b.base||!(b.matches>=40))return null;
 const gap=b.wr-b.base,margin=Math.max(.02,1.96*Math.sqrt(.25/b.matches));
 return gap>=margin?{key:'favorable',mark:'▲',word:'Favorable'}:gap<=-margin?{key:'unfavorable',mark:'▼',word:'Unfavorable'}:{key:'even',mark:'●',word:'Even'};
}
const stateTag=s=>s?` <span class="state state-${s.key}"><span aria-hidden="true">${s.mark}</span> ${s.word}</span>`:'';
const winTip=b=>winState(b)?`Players on your hero win ${Math.round(b.wr*100)}% after buying it, against ${Math.round(b.base*100)}% for other items of its tier (${fmt.format(b.matches)} matches)`:'';
function backingText(r){
 const b=r.backing;if(!b)return '';
 const parts=[];
 if(b.builds>=3&&b.share>0)parts.push(`${Math.round(b.share*b.builds)} of ${b.builds} builds`);
 // The win rate is shown next to the average for items of the same tier in
 // the same situation, so a tough matchup doesn't make every item look bad.
 if(b.wr!==null&&b.wr!==undefined&&b.matches>=40)parts.push(`wins ${Math.round(b.wr*100)}%${b.vs?.length?' vs '+b.vs.join(' and '):''}${b.base?` (avg ${Math.round(b.base*100)}%)`:''}`);
 return parts.join(' · ');
}
// Build data: popular builds and match stats for your hero, and your lane
// opponents while laning. Fetched by the main process; can be switched off.
let buildData=null,buildDataKey='',buildDataTimer=null;
function buildDataEnabled(){try{return localStorage.getItem(STORE_BUILD_DATA)!=='0';}catch(_){return true;}}
// A new hero's ID comes from the hero list, so its builds load too.
function heroIdOf(name){return engine.heroGameId(catalog,name);}
function requestBuildData(){
 clearTimeout(buildDataTimer);
 buildDataTimer=setTimeout(async()=>{
  const api=window.desktopAPI,heroId=heroIdOf(state.hero);
  if(!api?.getBuildData||!buildDataEnabled()||!heroId){
   if(buildData){buildData=null;buildDataKey='';renderAdvice();}
   showBuildDataStatus(api?.getBuildData&&!buildDataEnabled()?'Community builds and match stats are off (Settings → Privacy).':heroId||!api?.getBuildData?'':'Build data needs a synced catalog and a hero.');
   return;
  }
  const laneIds=state.ownLane?state.enemies.filter(e=>e.lane===state.ownLane).map(e=>heroIdOf(e.hero)).filter(Boolean).sort((a,b)=>a-b):[];
  const key=heroId+'|'+laneIds.join(',');
  if(key===buildDataKey)return;
  buildDataKey=key;
  showBuildDataStatus(`Fetching builds and match stats for ${state.hero}…`);
  try{
   const data=await api.getBuildData(heroId,laneIds);
   if(buildDataKey!==key)return;
   buildData=data&&(data.builds||data.stats)?data:null;
   showBuildDataStatus(buildData?`Build data for ${state.hero}: ${buildData.builds?.count||0} popular builds and match stats (all ranks, last 30 days)${buildData.matchup?', plus your lane matchup':''}${buildData.stale?'. Offline: showing saved data':''}.`:data?.error?`Build data unavailable: ${data.error}.`:'');
   renderAdvice();
  }catch(_){if(buildDataKey===key){buildDataKey='';showBuildDataStatus('Build data unavailable right now.');}}
 },600);
}
function showBuildDataStatus(text){const el=$('buildDataStatus');if(el)el.textContent=text;}
const pickHighlights=new Map();
let lastPickNames=[];
function quickCard(r,i,eyebrow){
 const counters=r.reasons.length?`Counters ${r.reasons.slice(0,2).join(' and ').toLowerCase()}`:'General utility';
 const reason=r.kind==='build'?r.reasons[0]:counters;
 const changed=(pickHighlights.get(r.name)||0)>Date.now();
 return [
  `<article class="quickItem ${r.affordable?'quickReady':'quickSaving'}${changed?' quickChanged':''}" data-pick="${escapeHTML(r.name)}">`,
  `<div class="quickTop"><span class="quickArt ${escapeHTML(r.category)}">${itemArt(r)}</span>`,
  `<div class="quickIdentity"><span class="quickEyebrow">${eyebrow?escapeHTML(eyebrow):`PICK ${i+1} · ${escapeHTML(r.category||'utility')}`}</span><strong>${escapeHTML(r.name)}</strong></div>`,
  `<span class="quickCost">${fmt.format(r.effectiveCost)}<small> souls</small></span></div>`,
  `<p class="quickReason">${escapeHTML(reason)}${teamLine(r)}</p>`,
  backingText(r)?`<p class="quickData" title="${escapeHTML(winTip(r.backing))}">${escapeHTML(backingText(r))}${stateTag(winState(r.backing))}</p>`:'',
  `<p class="quickVs"><span class="kindTag kind-${r.kind||'counter'}">${KIND_LABELS[r.kind]||KIND_LABELS.counter}</span>${r.hardCounter?'<span class="kindTag kind-hard" title="A strong answer to what your lane opponent is built around: worth buying early">Hard counter</span>':''}${r.vsItems?.length?` vs ${escapeHTML(r.vsItems.join(', '))}`:''}</p>`,
  counterFaces(r),
  `<div class="quickFoot"><span class="${r.affordable?'buyNow':'saveUp'}">${r.affordable?'✓ Buy now':`Save ${fmt.format(r.missing)} more`}</span>${r.upgradeFrom?`<span class="quickUpgrade">uses your ${escapeHTML(r.upgradeFrom)}</span>`:''}${r.investment?.notable?`<span class="quickSpike" title="Investment bonus from this purchase">${r.investment.at?fmt.format(r.investment.at)+': ':''}+${r.investment.gain}${INVEST_SHORT[r.investment.category]}</span>`:''}</div>`,
  `</article>`
 ].join('');
}
// The buy plan (see js/plan.js): the next buy, then a lane plan while laning
// or a game plan afterwards, plus glance view's strip. The previous plan keeps
// picks steady; planEvent names what last happened in the match (an enemy or
// you bought something), shown when the plan changes.
const PLAN=window.DeadlockPlan;
let lastPlan=null,planEvent='',planChange=null;
function resetPlan(){lastPlan=null;planChange=null;planEvent='';}
const itemByName=name=>catalog.items.find(i=>engine.norm(i.name)===engine.norm(name));
const stepArt=(icon,category)=>`<span class="stepArt ${escapeHTML(category||'')}">${icon?`<img src="${escapeHTML(icon)}" alt="">`:''}</span>`;
function stepWhy(r,kind){
 if(kind==='gap')return (r.team||[]).find(n=>n.up)?.text||(r.gap?'Fills a durability gap':r.reasons[0]||'');
 if(r.kind==='build')return r.reasons[0]||'';
 return `Counters ${(r.reasons[0]||'their threats').toLowerCase()}${r.vsItems?.length?` · vs ${r.vsItems.slice(0,2).join(', ')}`:''}`;
}
function planStep(r,n,role,kind){
 const status=role==='now'?(r.affordable?'✓ Buy now':`Save ${fmt.format(r.missing)} more`):role==='next'?(r.affordable?'Next · ready':`Next · ${fmt.format(r.missing)} more`):r.affordable?'Affordable':role==='later'?'Later':'Then';
 const changed=(pickHighlights.get(r.name)||0)>Date.now();
 return `<li class="planStep step-${role}${changed?' quickChanged':''}" data-pick="${escapeHTML(r.name)}"><span class="stepNum">${n}</span>${stepArt(r.icon,r.category)}<div class="stepBody"><div class="stepName">${escapeHTML(r.name)}${r.hardCounter?' <span class="kindTag kind-hard">Hard counter</span>':''}</div><div class="stepWhy">${escapeHTML(stepWhy(r,kind))}${stateTag(winState(r.backing))}</div></div><div class="stepSide"><div class="stepCost">${fmt.format(r.effectiveCost)}</div><div class="stepStatus ${role==='now'?(r.affordable?'now':'save'):r.affordable?'now':'save'}">${status}</div></div></li>`;
}
function doneStep(name){
 const item=itemByName(name);
 return `<li class="planStep step-done"><span class="stepNum">✓</span>${stepArt(item?.icon,item?.category)}<div class="stepBody"><div class="stepName">${escapeHTML(item?.name||name)}</div><div class="stepWhy">Bought</div></div><div class="stepSide"><div class="stepCost">${item?fmt.format(item.cost):''}</div><div class="stepStatus owned">Owned</div></div></li>`;
}
function planFoot(source,rule){
 const change=planChange&&document.body.classList.contains('liveMatch')?`last change${planChange.clock?' '+escapeHTML(planChange.clock):''}: <b>${escapeHTML(planChange.why)}</b>`:'';
 return `<div class="planFoot"><span>${escapeHTML(source)}</span><span class="planChanged">${[rule?escapeHTML(rule):'',change].filter(Boolean).join(' · ')}</span></div>`;
}
function lanePlanCard(plan,out){
 const opp=plan.opponents;
 const faces=opp.map(n=>{const src=portrait(n);return `${src?`<img src="${escapeHTML(src)}" alt="">`:''}${escapeHTML(n)}`;}).join(' + ');
 const threat=out.threats.slice(0,2).map(t=>t.label.toLowerCase()).join(', ');
 const sub=opp.length?`${escapeHTML(state.hero||'You')} vs ${faces}${threat?` · ${escapeHTML(threat)}`:''}`:`Your first buys${threat?` against ${escapeHTML(threat)}`:''}`;
 const steps=plan.steps.map((r,i)=>planStep(r,plan.done.length+i+1,i===0?'now':i===1?'next':'later','lane')).join('');
 const source=opp.length?(out.buildData?.matchup?'From your lane opponents\' heroes and buys, and win rates in this lane matchup.':'From your lane opponents\' heroes and buys.'):'From the enemy heroes and buys you entered.';
 return `<section class="planCard lanePlan"><div class="planHead"><div><div class="overline">LANE PLAN · FIRST 10 MINUTES</div><h3>${opp.length?'Win your lane':'Opening buys'}</h3><div class="planSub">${sub}</div></div><span class="planChip">Buy in this order</span></div><ol class="planSteps">${plan.done.map(doneStep).join('')}${steps}</ol>${planFoot(source,'Changes only when their buys shift')}</section>`;
}
function planTeaser(out){
 const top=out.threats[0],signal=out.team?.signals?.[0];
 const text=[top?`So far their biggest threat is ${top.label.toLowerCase()} (${(LEVEL_LABELS[top.level]||'').toLowerCase()})`:'',signal?signal.label:''].filter(Boolean).join('; ');
 return `<div class="planTeaser"><div><strong>Game plan</strong><span>${out.phase?.source==='clock'?'Starts at 10:00.':'Starts after laning.'}${text?' '+escapeHTML(text)+'.':''}</span></div><span class="planChip">After laning</span></div>`;
}
function gamePlanCard(plan,out){
 const top=out.threats[0];
 const chip=top?`<span class="planChip">Biggest threat: ${escapeHTML(top.label)} <b class="level-${escapeHTML(top.level)}">${LEVEL_MARKS[top.level]||''} ${LEVEL_LABELS[top.level]||''}</b></span>`:'';
 const col=(title,list,kind)=>`<div><h4 class="planColHead">${escapeHTML(title)}</h4>${list.length?`<ol class="planSteps">${list.map((r,i)=>planStep(r,i+1,r===plan.next?'now':'then',kind)).join('')}</ol>`:'<p class="emptyText">Nothing stands out yet.</p>'}</div>`;
 return `<section class="planCard gamePlan"><div class="planHead"><div><div class="overline">GAME PLAN</div><h3>Counter their team, cover your team's gaps</h3></div>${chip}</div><div class="planCols">${col('Counter their team',plan.counters,'counter')}${col(plan.gapsAreBuilds?'Build on your items':'Cover your team\'s gaps',plan.gaps,plan.gapsAreBuilds?'build':'gap')}</div>${planFoot('Ranked by their biggest threats and what your allies already have.','')}</section>`;
}
// Glance view: the plan as one strip under the next buy.
function glanceThen(plan){
 const lane=plan.stage==='lane';
 const tiles=lane?[...plan.done.slice(-1).map(name=>({done:true,name})),...plan.steps.slice(1)]:PLAN.thenList(plan);
 if(!tiles.length)return '';
 const tile=t=>{
  if(t.done){const item=itemByName(t.name);return `<div class="thenStep step-done">${stepArt(item?.icon,item?.category)}<div><div class="stepName">${escapeHTML(item?.name||t.name)}</div><div class="stepStatus owned">✓ Owned</div></div></div>`;}
  const tag=lane?'':stepWhy(t,plan.gaps.includes(t)&&!plan.gapsAreBuilds?'gap':'counter');
  return `<div class="thenStep">${stepArt(t.icon,t.category)}<div><div class="stepName">${escapeHTML(t.name)}</div>${tag?`<span class="thenWhy">${escapeHTML(tag)}</span>`:''}<div class="stepStatus ${t.affordable?'now':'save'}">${t.affordable?'Affordable':`${fmt.format(t.missing)} more`} · ${fmt.format(t.effectiveCost)}</div></div></div>`;
 };
 return `<div class="glanceThen"><div class="overline">${lane?'LANE PLAN · NEXT':'THEN'}</div><div class="thenSteps">${tiles.map(tile).join('')}</div></div>`;
}
function renderPlan(out){
 const live=document.body.classList.contains('liveMatch');
 const plan=PLAN.makePlan(out,lastPlan,engine.cleanList(state.owned));
 if(!plan){lastPlan=null;lastPickNames=[];$('quickBuys').innerHTML='<div class="quickEmpty">Add your opponents to see your buy plan. This is not automated gameplay.</div>';return;}
 if(live&&lastPickNames.length&&plan.changed){
  for(const name of plan.added)pickHighlights.set(name,Date.now()+PICK_HIGHLIGHT_MS);
  planChange={clock:lastFeedSnapshot?.clock||'',why:planEvent||'match updated'};
 }
 lastPickNames=[...new Set([plan.next,...plan.steps,...plan.counters,...plan.gaps].map(r=>r.name))];
 lastPlan=plan;
 const lane=plan.stage==='lane';
 $('quickBuys').innerHTML=[`<div class="nextBuy">${quickCard(plan.next,0,lane?`NEXT BUY · STEP ${plan.done.length+1} OF YOUR LANE PLAN`:'NEXT BUY')}</div>`,lane?lanePlanCard(plan,out)+planTeaser(out):gamePlanCard(plan,out),glanceThen(plan)].join('');
 $('quickBuys').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
}
const SCORING_NOTE='The scoring model caps repeated threat evidence per enemy and considers opponent coverage, item pairs on the same enemy, archetype fit, public catalog prices and component discounts. It does not simulate combat, abilities or item-slot availability.';
function resultCard(r,i){
 return [
  `<article class="result ${i===0?'top':''}"><div class="resultHeader"><div class="itemHeading">`,
  `<div class="itemIcon ${escapeHTML(r.category)}">${itemArt(r)}</div>`,
  `<div><span class="resultName">${i+1}. ${escapeHTML(r.name)}</span><div class="itemMeta">${escapeHTML(r.category)} · Heuristic rank ${fmt.format(r.score)} · ${escapeHTML(r.confidence)}</div></div></div>`,
  `<span class="cost">${fmt.format(r.effectiveCost)} souls</span></div>`,
  `<p>${escapeHTML(r.why)}</p>`,
  r.heroNotes?.length?`<p class="heroNote">${r.heroNotes.map(escapeHTML).join(' · ')}</p>`:'',
  r.team?.length?`<p class="teamNote">Your team: ${r.team.map(n=>escapeHTML(n.text)).join(' · ')}</p>`:'',
  `<div class="tags">${r.reasons.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>`,
  basedOn(r)?`<p class="evidenceLine">${basedOn(r)}</p>`:'',
  `<p class="sourceLine">${escapeHTML(r.ownFit)} · ${escapeHTML(r.coverage)} opponents · ${escapeHTML(r.sources.join(' · ')||'Selected enemy profiles')}</p>`,
  r.upgradeFrom?`<p class="upgradeNote">Component credit: ${escapeHTML(r.upgradeFrom)} · Full price ${fmt.format(r.cost)}</p>`:'',
  `<div class="availability ${r.affordable?'':'wait'}">${r.affordable?'✓ Affordable now':`Save ${fmt.format(r.missing)} more souls`}</div>`,
  `<details><summary>Reasoning and limitations</summary><p class="note">${escapeHTML(r.caution)}</p><p class="note">${SCORING_NOTE}</p></details></article>`
 ].join('');
}
function pairPanel(patterns){
 if(!patterns.length)return '';
 const chips=patterns.slice(0,4).map(x=>`<span class="patternChip"><b>${escapeHTML(x.hero)}</b> · ${escapeHTML(x.description)} <span>(${escapeHTML(x.items.join(' + '))})</span> — ${escapeHTML(x.advice)}</span>`).join('');
 return `<strong>ENEMY ITEM PAIRS · ${patterns.length}</strong><div class="patternChips">${chips}</div><small>Only pairs entered for the same opponent count, and they add a small amount of threat on top of the items themselves.</small>`;
}
function tipPanel(tips){
 if(!tips.length)return '';
 const items=tips.map(t=>`<li><b>${escapeHTML(t.hero)} · ${escapeHTML(t.ability)}</b> — ${escapeHTML(t.note)}</li>`).join('');
 return `<summary>HERO ABILITY TIPS · ${tips.length}</summary><ul>${items}</ul><small>Reminders of what these heroes can do, not signs an ability was used or is ready. Tips do not change the rankings.</small>`;
}

// Live match view: when a live source is connected and reports an enemy team,
// lead with a status strip and the picks; the editors fold behind "Edit".
const NEW_BUY_MS=20000;
const recentBuys=new Map();
let liveSnapshotAt=0;
function updateMatchView(){
 const live=liveWasOn&&state.enemies.length>0;
 // Entering the live view starts a fresh comparison: nothing to highlight yet.
 if(live&&!document.body.classList.contains('liveMatch'))resetPlan();
 if(live&&!document.body.classList.contains('liveMatch'))lastPickNames=[];
 document.body.classList.toggle('liveMatch',live);
 $('liveTeamCard').hidden=!live;
 $('liveStrip').hidden=!live;
 if(live){renderLiveTeam();renderLiveStrip();}
}
function renderLiveTeam(){
 const now=Date.now();
 $('liveTeam').innerHTML=state.enemies.map((e,i)=>{
  const src=portrait(e.hero),fresh=recentBuys.get(e.feedName||String(i));
  const isNew=fresh&&fresh.until>now?fresh.items:new Set();
  const items=engine.cleanList(e.items).map(name=>{
   const key=engine.norm(name),icon=itemIndex.icons.get(key);
   return `<span class="liveItem${icon?' hasIcon':''}${isNew.has(key)?' liveItemNew':''}" title="${escapeHTML(name)}">${icon?`<img src="${escapeHTML(icon)}" alt="${escapeHTML(name)}">`:''}<span class="liveItemName">${isNew.has(key)?'+ ':''}${escapeHTML(name)}</span></span>`;
  }).join('');
  return [
   `<div class="liveRow${isNew.size?' liveRowNew':''}">`,
   src?`<img class="livePortrait" src="${escapeHTML(src)}" alt="">`:'<span class="livePortrait"></span>',
   `<div class="liveRowBody"><strong>${escapeHTML(e.hero||'Hero not reported yet')}${newHeroTag(e.hero)}${state.ownLane&&e.lane===state.ownLane?' <span class="laneTag">Your lane</span>':''}</strong>`,
   `<div class="liveItems">${items||'<span class="emptyText">No items yet</span>'}</div></div></div>`
  ].join('');
 }).join('');
 $('liveTeam').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
}
function renderLiveStrip(){
 const m=lastFeedSnapshot||{};
 $('liveClock').textContent=m.clock?`Live ${m.clock}`:'Live';
 $('liveHeroName').textContent=(state.hero||'Your hero')+(newHero(state.hero)?engine.NEW_HERO.label:'');
 $('liveHeroName').title=newHero(state.hero)?engine.NEW_HERO.tip:'';
 const src=portrait(state.hero),img=$('liveHeroPortrait');
 img.hidden=!src;if(src&&img.getAttribute('src')!==src)img.src=src;
 $('liveSouls').textContent=fmt.format(state.souls);
 $('liveNetWorth').textContent=Number.isFinite(m.netWorth)?`${fmt.format(m.netWorth)} net worth`:'';
 const owned=engine.cleanList(state.owned).length;
 $('liveOwned').textContent=`${owned} ${owned===1?'item':'items'}`;
 const lane=lastAdvice?.lane;
 $('livePhase').textContent=lane?.focus&&lane.opponents.length?`Laning vs ${lane.opponents.join(' and ')}`:lastAdvice?.phase?.label||'';
 $('liveBuild').textContent=lastAdvice?.investment?investmentText(lastAdvice.investment):lastAdvice?.build?buildSplit(lastAdvice.build):'';
 $('liveBuild').classList.toggle('liveGap',!!lastAdvice?.build?.durabilityGap);
 $('liveBuild').title=[investmentTip(lastAdvice?.investment),lastAdvice?.build?.durabilityGap?'Little vitality against a damage-heavy team: one pick covers durability.':''].filter(Boolean).join('\n');
 renderFreshness();
}
// "Updated 3s ago"; turns amber when live data stops arriving.
function renderFreshness(){
 const m=lastFeedSnapshot;
 if(!m||!liveSnapshotAt){$('liveFresh').textContent='';return;}
 const secs=Math.max(0,Math.round((Date.now()-liveSnapshotAt)/1000));
 const inventory=m.enemyItemsWithheld?'Enemy items off':`Enemy items ${m.observedInventories}/${m.enemies.length}`;
 $('liveFresh').textContent=`${inventory} · ${secs<3?'updated just now':`updated ${secs}s ago`}`;
 $('liveStrip').classList.toggle('liveStale',secs>=30);
}
// Items an enemy didn't have in the previous snapshot glow for a while.
function noteNewPurchases(before){
 const now=Date.now();
 state.enemies.forEach((e,i)=>{
  const key=e.feedName||String(i),old=before.get(key);
  if(!old)return;
  const added=engine.cleanList(e.items).map(engine.norm).filter(n=>!old.has(n));
  if(!added.length)return;
  const lastName=engine.cleanList(e.items).find(x=>engine.norm(x)===added[added.length-1]);
  if(lastName)planEvent=`${e.hero||'An enemy'} bought ${lastName}`;
  const current=recentBuys.get(key),items=new Set(current&&current.until>now?current.items:[]);
  added.forEach(n=>items.add(n));
  recentBuys.set(key,{items,until:now+NEW_BUY_MS});
 });
}
function setupMatchView(){
 $('editLineup').addEventListener('click',()=>{
  const on=document.body.classList.toggle('editLineup');
  $('editLineup').textContent=on?'Done':'Edit';
  $('editLineup').setAttribute('aria-pressed',String(on));
 });
 // Freshness ticks, and expired highlights fade out.
 setInterval(()=>{
  if(!document.body.classList.contains('liveMatch'))return;
  renderFreshness();
  const now=Date.now();
  let expired=false;
  for(const [key,value] of recentBuys)if(value.until<=now){recentBuys.delete(key);expired=true;}
  if(expired){renderLiveTeam();renderGlanceTeam();}
  document.querySelectorAll('#quickBuys .quickChanged').forEach(el=>{if((pickHighlights.get(el.dataset.pick)||0)<=now)el.classList.remove('quickChanged');});
 },5000);
}
function renderEnemies(){
 $('enemies').innerHTML=state.enemies.map(enemyRow).join('');
 renderGlanceTeam();
 if(document.body.classList.contains('liveMatch'))renderLiveTeam();
 document.querySelectorAll('.enemyPortrait').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
 document.querySelectorAll('.enemyHero').forEach(el=>el.addEventListener('change',()=>{state.enemies[Number(el.dataset.index)].hero=el.value;renderEnemies();renderAdvice();persist();}));
 document.querySelectorAll('.remove').forEach(el=>el.addEventListener('click',()=>{state.enemies.splice(Number(el.dataset.index),1);renderEnemies();renderAdvice();persist();}));
}
function renderAdvice(){
 // The live clock sets the match phase; without one the engine estimates it from your souls.
 const out=engine.recommend(state,catalog,{sort:sortMode,category,affordableOnly:onlyAffordable,strategy:strategyMode,clock:liveWasOn?lastFeedSnapshot?.clock||'':'',buildData:buildDataEnabled()?buildData:null});
 lastAdvice=out;
 $('phaseSummary').textContent=out.phase?`${out.phase.label}${out.phase.source==='souls'?' (estimated)':''} · ${out.investment?investmentText(out.investment):buildSplit(out.build)} · `:'';
 $('phaseSummary').title=investmentTip(out.investment);
 $('matchLabel').textContent=out.count?`${out.count}/6 enemies`:'No lineup';
 const opponents=state.enemies.map(e=>e.hero).filter(Boolean);
 $('glanceSummary').textContent=`${state.hero||'No hero'}${opponents.length?' vs '+opponents.join(', '):' · no enemies entered'}`;
 $('glanceSoulsValue').textContent=fmt.format(state.souls);
 $('evidenceQuality').textContent=out.listedItems?`${out.knownItems}/${out.listedItems} enemy items recognized`:out.quality;
 $('evidenceQuality').title=`Evidence: ${out.quality}`;
 $('threats').innerHTML=out.threats.length?out.threats.slice(0,7).map(threatChip).join(''):'<span class="emptyText">Select opponents to calculate team pressure</span>';
 $('patternInsight').hidden=!out.patterns.length;
 $('patternInsight').innerHTML=pairPanel(out.patterns);
 $('teamInsight').hidden=!out.team?.allies?.length;
 $('teamInsight').innerHTML=teamPanel(out.team);
 // Only children are replaced, so the open/closed state of the <details> sticks.
 $('abilityTips').hidden=!out.abilityTips.length;
 $('abilityTips').innerHTML=tipPanel(out.abilityTips);
 renderPlan(out);
 if(document.body.classList.contains('liveMatch'))renderLiveStrip();
 requestBuildData();
 const visible=showAllResults?out.results:out.results.slice(0,4);
 $('showAllResults').textContent=showAllResults?'Show fewer':'Show all suggestions';
 $('showAllResults').hidden=out.results.length<=4;
 const emptyMessage=out.count?(onlyAffordable?'No affordable counters with these filters.':'No reviewed counters with these filters. Sync the catalog or select another priority.'):'Add an opponent on the left to get item guidance.';
 $('results').innerHTML=visible.length?visible.map(resultCard).join(''):`<div class="empty">${emptyMessage}</div>`;
 document.querySelectorAll('.itemIcon img, .quickArt img').forEach(img=>img.addEventListener('error',()=>{img.replaceWith(document.createTextNode('◆'));}));
 $('shopSummary').textContent=catalog.complete?`${catalog.items.length} public shop items; ${out.totalCandidates||0} reviewed counter candidates; ${out.knownItems||0} recognized entered enemy purchases. No win-rate predictions.`:'Starter counter list only — sync the catalog to show current items and component upgrade prices.';
 const unknown=$('unknown');unknown.hidden=out.unknown.length===0;
 unknown.innerHTML=out.unknown.slice(0,6).map(t=>t.endsWith(engine.NEW_HERO.label)?`<span title="${escapeHTML(engine.NEW_HERO.tip)}">${escapeHTML(t)}</span>`:escapeHTML(t)).join(' • ');
}
const OVERWOLF_LABELS={connected:'Overwolf: connected',ready:'Overwolf: waiting for a match',waiting:'Overwolf: loading',error:'Overwolf: needs attention',stopped:'Overwolf: stopped'};
let liveWasOn=false,lastOverwolfMessage='';
function onLiveStatus(status){
 currentLiveStatus=status||{};
 const run=!!status?.monitorActive,game=!!status?.gameStatus?.running,feed=!!status?.feedStatus?.active;
 const ow=status?.overwolf||{},owConnected=ow.state==='connected';
 // When a live source stops, the next one starts from a full lineup. (Status
 // also updates often while a source runs; that must not reset the merge.)
 const liveOn=feed||owConnected;
 if(liveWasOn&&!liveOn)lastFeedSnapshot=null;
 liveWasOn=liveOn;
 updateMatchView();
 $('toggleGameDetection').textContent=run?'Stop game detection':'Enable game detection';
 $('gameProcess').textContent=!run?'Not monitoring':status.gameStatus?.error||(!status.gameStatus?.supported?'Not supported':game?'Deadlock running':'Game not found');
 $('matchTelemetry').textContent=feed?'Watching '+String(status.feedStatus.name||'local file'):OVERWOLF_LABELS[ow.state]||'No live game source';
 $('liveMode').textContent=feed?'Event feed selected':owConnected?'Live (Overwolf)':game?'Game detected':run?'Monitoring':'Disconnected';
 $('stopEventFeed').disabled=!feed;
 $('topLiveBadge').classList.toggle('isLive',!!liveOn);
 $('topLiveStatus').textContent=feed?'Local feed: active':owConnected?'Live: Overwolf connected':OVERWOLF_LABELS[ow.state]&&ow.state!=='stopped'?OVERWOLF_LABELS[ow.state]:game?'Game running · match unknown':'Live source: disconnected';
 if(status?.feedStatus?.error)$('liveInfo').textContent=status.feedStatus.error;
 else if(ow.message&&ow.state!=='unavailable'&&ow.message!==lastOverwolfMessage){
   lastOverwolfMessage=ow.message;
   $('liveInfo').textContent=ow.message+(ow.enemyItems?'':' Enemy item purchases stay off until live use is confirmed; heroes, your souls and your items update live.');
 }
 updateSetupStatus();
}
// An item's catalog price, by class name when the feed gives one.
function itemCost(name,id){const item=(id&&catalog.items.find(i=>i.id===id))||catalog.items.find(i=>engine.norm(i.name)===engine.norm(name));return Number(item?.cost)||0;}
function onLiveMatch(match){
 if(!match||!Array.isArray(match.enemies))return;
 // The feed's souls are net worth; picks need what you can spend now.
 match=liveMerge.withSpendableSouls(match,itemCost);
 // Only compare with the previous snapshot from the same source.
 const prev=lastFeedSnapshot&&lastFeedSnapshot.source===match.source?lastFeedSnapshot:null;lastFeedSnapshot=match;
 liveSnapshotAt=Date.now();
 // A source's first snapshot replaces the lineup; that is not a change to highlight.
 if(!prev)lastPickNames=[];
 if(!prev||prev.matchId!==match.matchId)resetPlan();
 const ownedBefore=new Set(engine.cleanList(state.owned).map(engine.norm));
 const before=new Map(state.enemies.map((e,i)=>[e.feedName||String(i),new Set(engine.cleanList(e.items).map(engine.norm))]));
 const result=liveMerge.mergeFeedSnapshot(state,prev,match,resolveHeroName,resolveFeedItems);
 // Not on the first snapshot: every item would look new.
 if(result.changed&&prev&&!result.ended)noteNewPurchases(before);
 if(result.changed&&prev&&!result.ended){const bought=engine.cleanList(state.owned).filter(x=>!ownedBefore.has(engine.norm(x))).pop();if(bought)planEvent='You bought '+bought;}
 // Skip the redraw when nothing changed, so typing in a field is not interrupted.
 if(result.changed){
   $('hero').innerHTML=heroOptions(state.hero,false);
   $('hero').value=state.hero;
   $('souls').value=state.souls;
   updatePortrait();renderOwned();renderEnemies();renderAdvice();persist();
 }
 updateMatchView();
 const overwolf=match.source==='overwolf';
 if(result.ended)$('liveInfo').textContent=`${overwolf?'Match':'Feed reports match'} ended. Enemy lineup, souls and your items cleared for the next match.`;
 else if(result.warning)$('liveInfo').textContent=result.warning;
 else if(!(match.phase==='ended'||match.phase==='postgame'))$('liveInfo').textContent=overwolf
   ?`Live from Overwolf: ${match.enemies.length} opponents${match.clock?' · '+match.clock:''} · ${match.ownItems===null?'your items not reported yet':'your items synced'} · enemy items ${match.enemyItemsWithheld?'off (awaiting confirmation)':`${match.observedInventories}/${match.enemies.length} observed`}. Your manual edits are kept until the game reports a change.`
   :`Local feed: ${match.players} players · ${match.enemies.length} opponents · ${match.observedInventories}/${match.enemies.length} item inventories observed${match.clock?' · '+match.clock:''}. Your manual edits are kept until the feed reports a change. This is not a direct game connection.`;
}
function onUpdateStatus(update){
 const status=$('updateStatus'),button=$('updateAction');
 if(!status||!button)return;
 const phase=update?.phase||'unavailable';
 let label='Updates: unavailable',action='Check updates',visible=false,disabled=false;
 if(phase==='idle'){label='Updates: ready';visible=true;}
 else if(phase==='checking'){label='Checking updates…';visible=true;disabled=true;}
 else if(phase==='current'){label='Up to date';visible=true;}
 else if(phase==='available'){label='New version '+String(update.availableVersion||'available');action='Download update';visible=true;}
 else if(phase==='downloading'){label='Downloading '+String(update.percent??0)+'%';visible=true;disabled=true;}
 else if(phase==='ready'){label='Update '+String(update.availableVersion||'')+' ready';action='Install & restart';visible=true;}
 else if(phase==='error'){label='Update check failed';visible=true;}
 status.textContent=label;
 status.hidden=phase==='unavailable';
 status.title=String(update?.message||label).slice(0,220);
 button.hidden=!visible;button.disabled=disabled;button.textContent=action;
 button.dataset.phase=phase;
}
function configureUpdates(){
 if(!window.desktopAPI?.getUpdateStatus)return;
 const button=$('updateAction');
 window.desktopAPI.onUpdateStatus(onUpdateStatus);
 window.desktopAPI.getUpdateStatus().then(onUpdateStatus).catch(()=>{});
 button.addEventListener('click',async()=>{
   const phase=button.dataset.phase;
   button.disabled=true;
   try{
     if(phase==='available')onUpdateStatus(await window.desktopAPI.downloadUpdate());
     else if(phase==='ready'){
       if(window.confirm('Install the downloaded update and restart Counter Advisor now? Do this after your match.'))await window.desktopAPI.installUpdate();
     }
     else onUpdateStatus(await window.desktopAPI.checkUpdates());
   }catch(e){$('updateStatus').textContent='Update operation failed';$('updateStatus').title=String(e?.message||e).slice(0,200);}
   finally{button.disabled=false;}
 });
}
function setupLiveControls(){
 if(!window.desktopAPI?.liveStatus){
   $('toggleGameDetection').disabled=true;$('selectEventFeed').disabled=true;
   $('gameProcess').textContent='Windows application only';
   return;
 }
 window.desktopAPI.onLiveStatus(onLiveStatus);
 window.desktopAPI.onLiveMatch(onLiveMatch);
 window.desktopAPI.liveStatus().then(onLiveStatus).catch(()=>{});
 $('toggleGameDetection').addEventListener('click',async()=>{
   $('toggleGameDetection').disabled=true;
   try{onLiveStatus(await window.desktopAPI.setGameDetection(!currentLiveStatus?.monitorActive));}
   catch(e){$('liveInfo').textContent='Monitor failed: '+String(e.message).slice(0,150);}
   finally{$('toggleGameDetection').disabled=false;}
 });
 $('selectEventFeed').addEventListener('click',async()=>{
   try{onLiveStatus(await window.desktopAPI.chooseEventFeed());}
   catch(e){$('liveInfo').textContent='Feed open failed: '+String(e.message).slice(0,150);}
 });
 $('stopEventFeed').addEventListener('click',async()=>{
   try{onLiveStatus(await window.desktopAPI.stopEventFeed());$('liveInfo').textContent='Feed stopped. Manual editing remains available.';}
   catch(e){$('liveInfo').textContent='Could not stop feed: '+String(e.message).slice(0,150);}
 });
}
function showDisplays(info){
 const count=Number(info?.count)||1,cur=Number(info?.current)||1;
 const resolution=info?.resolution;
 const size=resolution?` · ${resolution.width}×${resolution.height}`:'';
 const scale=info?.scalePercent?` @${info.scalePercent}%`:'';
 $('displayInfo').textContent=count>1?`Screen ${cur}/${count}`:'';
 $('displayInfo').title=`Display ${cur}/${count}${size}${scale}`;
 $('nextDisplay').disabled=count<=1;
}
function setupDesktopWindow(){
 const api=window.desktopAPI;
 if(!api){$('displayInfo').textContent='Browser preview';$('nextDisplay').disabled=true;return;}
 api.getDisplays().then(showDisplays).catch(()=>{$('displayInfo').textContent='Display controls unavailable';});
 api.onDisplaysChanged(showDisplays);
 $('nextDisplay').addEventListener('click',()=>api.moveToNextDisplay().then(showDisplays).catch(()=>{}));
 api.getCachedCatalog().then(applyCatalog).catch(()=>{});
 // The main process syncs in the background (a day old, or a game update seen live).
 api.onCatalogUpdated?.(applyCatalog);
}
// A newer catalog: heroes and items the live feed reported are resolved again
// (a new hero gets its name, a new item its price); manual edits stay.
function applyCatalog(snapshot){
 if(!snapshot)return;
 const before=catalog;
 catalog=engine.createCatalog(base,snapshot);
 const old={hero:(n,id)=>engine.resolveHeroName(before,n,id),items:(n,ids)=>engine.resolveFeedItems(before,n,ids)};
 if(lastFeedSnapshot&&liveMerge.reresolveFeed(state,lastFeedSnapshot,old,{hero:resolveHeroName,items:resolveFeedItems}))persist();
 updateCatalogUI();
}
// Overwolf ad box (Overwolf edition): one 400x300 <owadview> at the bottom of
// the left column, or in glance view under the enemy rows when the window has
// room for it (one box at a time). Overwolf's rules: the box is always fully
// visible, never moves while an ad plays, and is closed and reopened rather
// than hidden. So an ad view exists only while its box is fully on screen with
// no dialog open: hidden inputs, the debrief, narrow layouts and dialogs close
// it, and it reopens when the box is back. The left column stays put beside
// the picks (pinned below the top bar) and its cards scroll above the box.
const AD_CID='dca_400x300_main_lb',AD_GLANCE_CID='dca_400x300_glance',AD_W=400,AD_H=300;
// On windows under 900px tall the left column's box is Overwolf's 400x60
// banner instead, so the enemy team still fits above it.
const AD_TALL_MIN=900,AD_BANNER_H=60,AD_BANNER_CID='dca_400x60_main_lb';
// Glance box: 12px above it, and the card and page padding below.
const AD_GLANCE_ROOM=AD_H+12+40;
function setupAds(){
 const api=window.desktopAPI;
 const slots=[{el:$('adSlot'),card:$('adCard'),cid:AD_CID,h:AD_H,sizes:true},{el:$('adSlotGlance'),card:$('adCardGlance'),cid:AD_GLANCE_CID,h:AD_H,glance:true}].filter(s=>s.el&&s.card);
 if(!slots.some(s=>!s.glance)||api?.edition!=='overwolf'||api?.ads!==true)return null;
 document.body.classList.add('adsOn');
 for(const s of slots)if(!s.glance)s.card.hidden=false;
 let pinned='';
 const pin=()=>{const ws=document.querySelector('.workspace');if(!ws)return;const top=Math.round(ws.getBoundingClientRect().top+window.scrollY+parseFloat(getComputedStyle(ws).paddingTop)||0)+'px';if(top!==pinned){pinned=top;document.documentElement.style.setProperty('--left-top',top);}};
 const fullyVisible=(el,h)=>{const r=el.getBoundingClientRect();return r.width>=AD_W&&r.height>=h&&r.top>=0&&r.left>=0&&r.bottom<=window.innerHeight&&r.right<=window.innerWidth&&!document.querySelector('dialog[open]');};
 // Changing size closes the ad view; the box reopens at its new size.
 const size=s=>{
  const banner=window.innerHeight<AD_TALL_MIN;
  if(s.banner===banner)return;
  if(s.view){s.view.remove();s.view=null;}
  s.banner=banner;s.h=banner?AD_BANNER_H:AD_H;s.cid=banner?AD_BANNER_CID:AD_CID;
  s.el.classList.toggle('adBanner',banner);
 };
 // Glance view shows the box only when it fits below the rows without scrolling.
 const glanceRoom=()=>{
  if(!document.body.classList.contains('glanceMode'))return false;
  const team=$('glanceTeam'),rows=team&&team.getBoundingClientRect().height?team:$('quickBuys');
  return !!rows&&window.innerHeight-rows.getBoundingClientRect().bottom>=AD_GLANCE_ROOM;
 };
 const update=()=>{
  pin();
  for(const s of slots){
   if(s.glance)s.card.hidden=!glanceRoom();
   if(s.sizes)size(s);
   if(fullyVisible(s.el,s.h)){if(!s.view){s.view=document.createElement('owadview');s.view.setAttribute('cid',s.cid);s.el.append(s.view);}}
   else if(s.view){s.view.remove();s.view=null;}
  }
 };
 let queued=false;
 const schedule=()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;update();},30);};
 for(const s of slots)new IntersectionObserver(schedule,{threshold:[0,1]}).observe(s.el);
 new ResizeObserver(schedule).observe(document.body);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.querySelectorAll('dialog').forEach(d=>new MutationObserver(schedule).observe(d,{attributes:true,attributeFilter:['open']}));
 window.addEventListener('resize',schedule);
 window.addEventListener('scroll',schedule,{passive:true});
 schedule();
 return {isOpen:()=>slots.some(s=>s.view),update};
}
async function syncCatalogNow(){applyCatalog(await window.desktopAPI.syncCatalog());}
function setup(){
 configureUpdates();
 let rememberedUISize='auto';try{rememberedUISize=localStorage.getItem(STORE_UI_SIZE)||'auto';}catch(_){}
 applyUISize(rememberedUISize);
 $('uiScale').addEventListener('change',e=>applyUISize(e.target.value));
 // Remember only user toggles (the details "toggle" event also fires for code).
 $('setupPanel').querySelector('summary').addEventListener('click',()=>setTimeout(()=>{try{localStorage.setItem(STORE_SETUP_OPEN,$('setupPanel').open?'1':'0');}catch(_){}},0));
 $('hero').addEventListener('change',e=>{state.hero=e.target.value;updatePortrait();renderAdvice();persist();});
 $('souls').addEventListener('input',e=>{state.souls=Math.max(0,Math.min(999999,Number(e.target.value)||0));renderAdvice();persist();});
 // Delegated, so the glance bar's buttons work too.
 document.addEventListener('click',e=>{const step=e.target.closest?.('.soulsStep');if(step)setSouls(state.souls+Number(step.dataset.step));});
 setupItemChips();
 setupHeroPicker();
 setupGlance();
 setupNotice();
 setupEdition();
 setupPrivacy();
 setupShortcuts();
 setupOffline();
 setupMatchView();
 setupAds();
 $('useBuildData').checked=buildDataEnabled();
 $('useBuildData').addEventListener('change',e=>{try{localStorage.setItem(STORE_BUILD_DATA,e.target.checked?'1':'0');}catch(_){}buildDataKey='';requestBuildData();renderAdvice();});
 setupAutoSync();
 $('addEnemy').addEventListener('click',()=>{
   if(state.enemies.length>=6)return;
   state.enemies.push({hero:'',items:''});
   renderEnemies();renderAdvice();persist();
   document.querySelectorAll('.enemyHero')[state.enemies.length-1]?.focus();
 });
 $('demo').addEventListener('click',()=>{Object.assign(state,demoMatch());updateCatalogUI();setInputs();persist();});
 $('clear').addEventListener('click',()=>{Object.assign(state,defaultState());updateCatalogUI();setInputs();persist();});
 $('focus').addEventListener('click',()=>{const hidden=document.body.classList.toggle('focusInputs');$('focus').textContent=hidden?'Show inputs':'Hide inputs';});
 $('sortMode').addEventListener('change',e=>{sortMode=e.target.value;renderAdvice();});
 $('strategyMode').addEventListener('change',e=>{strategyMode=e.target.value;renderAdvice();});
 $('showAllResults').addEventListener('click',()=>{showAllResults=!showAllResults;renderAdvice();});
 $('filterCategory').addEventListener('change',e=>{category=e.target.value;renderAdvice();});
 $('affordableOnly').addEventListener('change',e=>{onlyAffordable=e.target.checked;renderAdvice();});
 $('heroPortrait').addEventListener('error',()=>{$('heroPortrait').hidden=true;});
 $('sync').addEventListener('click',async()=>{
  if(!window.desktopAPI?.syncCatalog){$('syncStatus').textContent='Catalog sync requires the Windows desktop executable.';return;}
  if(isOffline()){$('syncStatus').textContent="You're offline. Check your internet connection, then sync again.";return;}
  $('sync').disabled=true;$('syncStatus').textContent='Fetching public items and released heroes…';
  try{await syncCatalogNow();}
  catch(e){$('syncStatus').textContent='Sync failed: '+String(e?.message||e).slice(0,180)+'. Keeping prior catalog.';}
  finally{$('sync').disabled=false;}
 });
 $('importReplay').addEventListener('click',async()=>{
  if(!window.desktopAPI?.importReplay){$('syncStatus').textContent='Replay import requires desktop app.';return;}
  try{
   const match=await window.desktopAPI.importReplay();
   if(!match)return;
   if(!match.enemies.length){$('syncStatus').textContent=match.warning;return;}
   state.enemies=match.enemies.map(e=>({hero:resolveHeroName(e.hero,e.heroId),items:resolveFeedItems(e.items,e.itemIds)}));
   renderEnemies();renderAdvice();persist();$('syncStatus').textContent=match.warning;
  }catch(e){$('syncStatus').textContent='Replay import failed: '+String(e?.message||e).slice(0,140);}
 });
 setupLiveControls();
 setupDesktopWindow();
 window.DeadlockDebriefUI?.setup({$,getCatalog:()=>catalog,ensureCatalog:async()=>{if(!catalog.complete)await syncCatalogNow();},engine,debrief:window.DeadlockDebrief,base,escapeHTML,fmt});
 updateCatalogUI();setInputs();
 setupIntro();
}
setup();
})();
