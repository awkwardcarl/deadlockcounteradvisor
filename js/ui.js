(function(){
'use strict';
const $=id=>document.getElementById(id);
const base=window.DeadlockCatalog,engine=window.DeadlockEngine,liveMerge=window.DeadlockLiveMerge;
const STORE='deadlock-counter-advisor-desktop-v0.2';
const STORE_UI_SIZE='deadlock-counter-advisor-ui-size';
const STORE_SETUP_OPEN='deadlock-counter-advisor-setup-open';
const STORE_GLANCE='deadlock-counter-advisor-glance';
const STORE_NOTICE='deadlock-counter-advisor-notice-dismissed';
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
// lineup is saved; live mode clears it at match end.
const defaultState=()=>({hero:'Kelvin',souls:0,owned:'',liveMatchId:'',enemies:[]});
// "Load example match" (a fresh copy each time, so edits never change the example).
const demoMatch=()=>({hero:'Kelvin',souls:3200,owned:'Extra Spirit, Extra Stamina',enemies:[
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
function heroOptions(selected,blank){
 let names=heroes();
 if(selected&&!names.includes(selected))names=[selected,...names];
 return (blank?['',...names]:names).map(h=>`<option value="${escapeHTML(h)}" ${h===selected?'selected':''}>${escapeHTML(h||'Select enemy hero')}</option>`).join('');
}
function portrait(name){return catalog.heroes.find(h=>h.name===name)?.portrait||'';}
function updatePortrait(){
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
 $('hero').innerHTML=heroOptions(state.hero,false);$('hero').value=state.hero;
 $('catalogCounts').textContent=catalog.complete?`${catalog.heroes.length} heroes · ${catalog.items.length} items`:'Starter catalog';
 refreshItemIndex();
 $('itemNames').innerHTML=engine.itemSuggestions(catalog).map(name=>`<option value="${escapeHTML(name)}"></option>`).join('');
 updateSetupStatus();applySetupDefault();
 $('syncStatus').textContent=catalog.complete?`Cached ${catalog.build||'game data'} · ${catalog.generatedAt.slice(0,10)}. Manual mode. ${catalog.items.length} shop items with game-data prices and icons.`:'Offline starter list. Click Sync items & heroes to retrieve current public game data.';
 updatePortrait();renderOwned();renderEnemies();renderAdvice();
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
  `<select class="enemyHero" data-index="${i}" aria-label="Enemy ${i+1} hero">${heroOptions(e.hero,true)}</select>`,
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
function setGlance(on){
 document.body.classList.toggle('glanceMode',on);
 $('glance').textContent=on?'Exit glance':'Glance mode';
 $('glance').setAttribute('aria-pressed',String(on));
 try{localStorage.setItem(STORE_GLANCE,on?'1':'0');}catch(_){}
}
function setupNotice(){
 let dismissed=false;try{dismissed=localStorage.getItem(STORE_NOTICE)==='1';}catch(_){}
 $('topNotice').hidden=dismissed;
 $('dismissNotice').addEventListener('click',()=>{$('topNotice').hidden=true;try{localStorage.setItem(STORE_NOTICE,'1');}catch(_){}});
}
function setupGlance(){
 let saved=false;try{saved=localStorage.getItem(STORE_GLANCE)==='1';}catch(_){}
 setGlance(saved);
 $('glance').addEventListener('click',()=>setGlance(!document.body.classList.contains('glanceMode')));
 // G toggles and Esc exits, except while typing or with the hero picker open.
 document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.altKey||e.metaKey||$('heroDialog').open||document.body.classList.contains('debriefMode')||e.target.closest?.('input,select,textarea'))return;
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
// The raw score stays available as a tooltip; players see a level.
const threatChip=t=>`<span class="threat level-${escapeHTML(t.level)}" title="Score ${escapeHTML(t.value)} across ${t.coverage} ${t.coverage===1?'enemy':'enemies'}">${escapeHTML(t.label)} <b>${LEVEL_LABELS[t.level]||''}</b></span>`;
const itemArt=r=>r.icon?`<img loading="lazy" src="${escapeHTML(r.icon)}" alt="">`:'◆';
const shortReasons=r=>escapeHTML(r.reasons.slice(0,2).join(' · ')||'General utility');
const basedOn=r=>r.evidence?.length?`Based on: ${escapeHTML(r.evidence.join(' · '))}`:'';
function quickCard(r,i){
 return [
  `<article class="quickItem ${r.affordable?'quickReady':'quickSaving'}">`,
  `<div class="quickTop"><span class="quickArt ${escapeHTML(r.category)}">${itemArt(r)}</span>`,
  `<div class="quickIdentity"><span class="quickEyebrow">CHOICE ${i+1} · ${escapeHTML(r.category||'utility')}</span><strong>${escapeHTML(r.name)}</strong></div></div>`,
  `<div class="quickReason"><span class="quickLabel">WHY IT HELPS</span>`,
  `<p>${escapeHTML(String(r.why||'Helps answer the selected threats.').slice(0,180))}</p>`,
  `<div class="quickTargets">${shortReasons(r)} <span aria-hidden="true">·</span> ${r.coverage} ${r.coverage===1?'enemy':'enemies'} covered</div>`,
  basedOn(r)?`<div class="quickEvidence">${basedOn(r)}</div>`:'',
  `</div>`,
  `<div class="quickFoot"><span class="${r.affordable?'buyNow':'saveUp'}">${r.affordable?'✓ BUYABLE NOW':`SAVE ${fmt.format(r.missing)} MORE`}</span><span class="quickCost">${fmt.format(r.effectiveCost)} souls</span></div>`,
  r.upgradeFrom?`<div class="quickUpgrade">Component credit: ${escapeHTML(r.upgradeFrom)}</div>`:'',
  `</article>`
 ].join('');
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

function renderEnemies(){
 $('enemies').innerHTML=state.enemies.map(enemyRow).join('');
 document.querySelectorAll('.enemyPortrait').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
 document.querySelectorAll('.enemyHero').forEach(el=>el.addEventListener('change',()=>{state.enemies[Number(el.dataset.index)].hero=el.value;renderEnemies();renderAdvice();persist();}));
 document.querySelectorAll('.remove').forEach(el=>el.addEventListener('click',()=>{state.enemies.splice(Number(el.dataset.index),1);renderEnemies();renderAdvice();persist();}));
}
function renderAdvice(){
 const out=engine.recommend(state,catalog,{sort:sortMode,category,affordableOnly:onlyAffordable,strategy:strategyMode});
 $('matchLabel').textContent=out.count?`${out.count}/6 enemies`:'No lineup';
 const opponents=state.enemies.map(e=>e.hero).filter(Boolean);
 $('glanceSummary').textContent=`${state.hero||'No hero'}${opponents.length?' vs '+opponents.join(', '):' · no enemies entered'}`;
 $('glanceSoulsValue').textContent=fmt.format(state.souls);
 $('evidenceQuality').textContent=`Evidence: ${out.quality}${out.listedItems?` · ${out.knownItems}/${out.listedItems} items recognized`:''}`;
 $('threats').innerHTML=out.threats.length?out.threats.slice(0,7).map(threatChip).join(''):'<span class="emptyText">Select opponents to calculate team pressure</span>';
 $('patternInsight').hidden=!out.patterns.length;
 $('patternInsight').innerHTML=pairPanel(out.patterns);
 // Only children are replaced, so the open/closed state of the <details> sticks.
 $('abilityTips').hidden=!out.abilityTips.length;
 $('abilityTips').innerHTML=tipPanel(out.abilityTips);
 $('quickBuys').innerHTML=out.quickBuys?.length?out.quickBuys.map(quickCard).join(''):'<div class="quickEmpty">Add your opponents to see three purchase choices. This is not automated gameplay.</div>';
 const visible=showAllResults?out.results:out.results.slice(0,4);
 $('showAllResults').textContent=showAllResults?'Show fewer':'Show all suggestions';
 $('showAllResults').hidden=out.results.length<=4;
 const emptyMessage=out.count?(onlyAffordable?'No affordable counters with these filters.':'No reviewed counters with these filters. Sync the catalog or select another priority.'):'Add an opponent on the left to get item guidance.';
 $('results').innerHTML=visible.length?visible.map(resultCard).join(''):`<div class="empty">${emptyMessage}</div>`;
 document.querySelectorAll('.itemIcon img, .quickArt img').forEach(img=>img.addEventListener('error',()=>{img.replaceWith(document.createTextNode('◆'));}));
 $('shopSummary').textContent=catalog.complete?`${catalog.items.length} public shop items; ${out.totalCandidates||0} reviewed counter candidates; ${out.knownItems||0} recognized entered enemy purchases. No win-rate predictions.`:'Starter counter list only — sync the catalog to show current items and component upgrade prices.';
 const unknown=$('unknown');unknown.hidden=out.unknown.length===0;unknown.textContent=out.unknown.length?out.unknown.slice(0,6).join(' • '):'';
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
 $('toggleGameDetection').textContent=run?'Stop game detection':'Enable game detection';
 $('gameProcess').textContent=!run?'Not monitoring':status.gameStatus?.error||(!status.gameStatus?.supported?'Not supported':game?'Deadlock running':'Game not found');
 $('matchTelemetry').textContent=feed?'Watching '+String(status.feedStatus.name||'local file'):OVERWOLF_LABELS[ow.state]||'No live game source';
 $('liveMode').textContent=feed?'Event feed selected':owConnected?'Live (Overwolf)':game?'Game detected':run?'Monitoring':'Disconnected';
 $('stopEventFeed').disabled=!feed;
 $('topLiveStatus').textContent=feed?'Local feed: active':owConnected?'Live: Overwolf connected':OVERWOLF_LABELS[ow.state]&&ow.state!=='stopped'?OVERWOLF_LABELS[ow.state]:game?'Game running · match unknown':'Live source: disconnected';
 if(status?.feedStatus?.error)$('liveInfo').textContent=status.feedStatus.error;
 else if(ow.message&&ow.state!=='unavailable'&&ow.message!==lastOverwolfMessage){
   lastOverwolfMessage=ow.message;
   $('liveInfo').textContent=ow.message+(ow.enemyItems?'':' Enemy item purchases stay off until live use is confirmed; heroes, your souls and your items update live.');
 }
 updateSetupStatus();
}
function onLiveMatch(match){
 if(!match||!Array.isArray(match.enemies))return;
 // Only compare with the previous snapshot from the same source.
 const prev=lastFeedSnapshot&&lastFeedSnapshot.source===match.source?lastFeedSnapshot:null;lastFeedSnapshot=match;
 const result=liveMerge.mergeFeedSnapshot(state,prev,match,resolveHeroName,resolveFeedItems);
 // Skip the redraw when nothing changed, so typing in a field is not interrupted.
 if(result.changed){
   $('hero').innerHTML=heroOptions(state.hero,false);
   $('hero').value=state.hero;
   $('souls').value=state.souls;
   updatePortrait();renderOwned();renderEnemies();renderAdvice();persist();
 }
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
 $('displayInfo').textContent=`Display ${cur}/${count}${size}${scale}`;
 $('nextDisplay').disabled=count<=1;
}
function setupDesktopWindow(){
 const api=window.desktopAPI;
 if(!api){$('displayInfo').textContent='Browser preview';$('nextDisplay').disabled=true;return;}
 api.getDisplays().then(showDisplays).catch(()=>{$('displayInfo').textContent='Display controls unavailable';});
 api.onDisplaysChanged(showDisplays);
 $('nextDisplay').addEventListener('click',()=>api.moveToNextDisplay().then(showDisplays).catch(()=>{}));
 api.getCachedCatalog().then(snapshot=>{if(snapshot){catalog=engine.createCatalog(base,snapshot);updateCatalogUI();}}).catch(()=>{});
}
async function syncCatalogNow(){
 const snapshot=await window.desktopAPI.syncCatalog();
 catalog=engine.createCatalog(base,snapshot);updateCatalogUI();
}
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
}
setup();
})();
