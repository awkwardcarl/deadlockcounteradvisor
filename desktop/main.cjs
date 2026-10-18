'use strict';
// Independent desktop window. Optional detection of the game executable name
// and user-selected local event test files. No injection or game memory reads.
const {app, BrowserWindow, screen, session, ipcMain, dialog} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { registerOfflineRestrictions } = require('./security.cjs');
const { createUpdateManager } = require('./updater.cjs');
const dataService = require('./data-service.cjs');
const matchService = require('./match-service.cjs');
const replayService = require('../live/overwolf-normalizer.cjs');
const {checkGame}=require('../live/process-detection.cjs');
const {LocalFeed}=require('../live/local-feed.cjs');
const {createOverwolfLive}=require('./overwolf-live.cjs');
const {LAYOUT_REVISION, responsiveBounds, transferredBounds, inArea}=require('./window-layout.cjs');

let mainWindow;
const updates=createUpdateManager({
  isPackaged:app.isPackaged && fs.existsSync(path.join(process.resourcesPath,'app-update.yml')),platform:process.platform,currentVersion:app.getVersion(),
  send:value=>broadcast('updates:state',value),
  loadUpdater:()=>require('electron-updater').autoUpdater
});
let saveTimer;
let monitorActive=false, monitorTimer=null, monitorBusy=false;
let gameStatus={supported:process.platform==='win32',running:false};
let feedStatus={active:false,name:'',error:''};
let overwolfStatus={state:'unavailable',message:'',at:0,enemyItems:false,lastUpdate:0};
function trusted(event){return event.sender===mainWindow?.webContents;}
function liveStatus(){return {monitorActive,gameStatus,feedStatus,overwolf:overwolfStatus};}
function broadcast(channel,value){if(mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.webContents.isDestroyed())mainWindow.webContents.send(channel,value);}
function publishStatus(){broadcast('live:status',liveStatus());}
const localFeed=new LocalFeed({
  onState:state=>broadcast('live:match',{...state,source:'file'}),
  onError:error=>{feedStatus={active:false,name:'',error};publishStatus();}
});
// Overwolf live data (only active under the Overwolf runtime). Registered at
// startup so the package 'ready' event can't fire before we listen.
// Diagnostics: print each match's hero names and game IDs when they change (no
// player names), to spot heroes Overwolf sends as "UNKNOWN".
let lastHeroLine='';
function logOverwolfHeroes(snapshot){
  if(!snapshot.enemies.length)return;
  const pair=(hero,id)=>(hero||'?')+'='+(id??'?');
  const line='you '+pair(snapshot.ownHero,snapshot.ownHeroId)+' | enemies '+snapshot.enemies.map(e=>pair(e.hero,e.heroId)).join(', ');
  if(line===lastHeroLine)return;
  lastHeroLine=line;
  console.log('[Counter Advisor] Overwolf heroes (match '+(snapshot.matchId||'?')+'):',line);
}
const overwolfLive=createOverwolfLive({
  app,
  onMatch:snapshot=>{overwolfStatus={...overwolfStatus,lastUpdate:Date.now()};logOverwolfHeroes(snapshot);broadcast('live:match',{...snapshot,source:'overwolf'});},
  onDebug:message=>console.log('[Counter Advisor] Overwolf event:',message),
  onStatus:status=>{
    overwolfStatus={...overwolfStatus,...status};publishStatus();
    // Plain dots: the Windows console garbles the "…" character.
    if(status.state!=='unavailable')console.log('[Counter Advisor] Overwolf:',status.state,'-',String(status.message).replace(/…/g,'...'));
  }
});
async function pollGame(){
 if(!monitorActive||monitorBusy)return;
 monitorBusy=true;
 try{gameStatus=await checkGame();}catch(_){gameStatus={supported:process.platform==='win32',running:false,error:'Process check failed.'};}
 finally{monitorBusy=false;publishStatus();}
}
function setMonitor(shouldEnable){
 monitorActive=shouldEnable===true;
 if(monitorTimer)clearInterval(monitorTimer);
 monitorTimer=null;
 gameStatus={supported:process.platform==='win32',running:false};
 if(monitorActive){void pollGame();monitorTimer=setInterval(()=>void pollGame(),5000);}
 publishStatus();return liveStatus();
}

function configPath() { return path.join(app.getPath('userData'), 'window-bounds.json'); }
function safeReadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if ([b.x, b.y, b.width, b.height].every(Number.isFinite)
        && b.width >= 640 && b.height >= 480 && b.width <= 12000 && b.height <= 12000) return b;
  } catch (_) { /* first launch or invalid settings */ }
  return null;
}
function displayForStoredBounds(displays, saved) {
  if (!saved) return null;
  // Display ids can change between Windows boots; fall back to coordinates.
  const center = {x:saved.x + saved.width / 2, y:saved.y + saved.height / 2};
  return displays.find(d => center.x >= d.bounds.x && center.x < d.bounds.x + d.bounds.width &&
    center.y >= d.bounds.y && center.y < d.bounds.y + d.bounds.height) || null;
}
function chooseInitialBounds() {
  const displays = screen.getAllDisplays();
  if (process.argv.includes('--primary-monitor')) {
    return responsiveBounds(screen.getPrimaryDisplay().workArea);
  }
  const stored = safeReadBounds();
  const selected = displayForStoredBounds(displays, stored);
  if (selected) return responsiveBounds(selected.workArea, stored);
  const primary = screen.getPrimaryDisplay();
  const second = displays.find(d => d.id !== primary.id);
  return responsiveBounds((second || primary).workArea);
}
function getDisplayInfo() {
  const displays = screen.getAllDisplays();
  if (!mainWindow || mainWindow.isDestroyed()) return {count: displays.length, current: 1};
  const b = mainWindow.getBounds();
  const nearest = screen.getDisplayNearestPoint({x: Math.round(b.x+b.width/2), y: Math.round(b.y+b.height/2)});
  const scale = nearest.scaleFactor || 1;
  return {
    count: displays.length,
    current: Math.max(1, displays.findIndex(d => d.id === nearest.id) + 1),
    resolution: {width:Math.round(nearest.bounds.width * scale),height:Math.round(nearest.bounds.height * scale)},
    scalePercent: Math.round(scale * 100),
    window: {width:b.width,height:b.height}
  };
}
function sendDisplayInfo() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:displays', getDisplayInfo());
}
function moveToNextDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return getDisplayInfo();
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return getDisplayInfo();
  const wasMaximized = mainWindow.isMaximized();
  const b = wasMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  const c = mainWindow.getBounds();
  const cur = screen.getDisplayNearestPoint({x:Math.round(c.x+c.width/2),y:Math.round(c.y+c.height/2)});
  const index = displays.findIndex(d => d.id === cur.id);
  const target = displays[(index + 1) % displays.length];
  if (wasMaximized) mainWindow.unmaximize();
  mainWindow.setBounds(transferredBounds(cur.workArea, target.workArea, b));
  if (wasMaximized) mainWindow.maximize();
  sendDisplayInfo();
  return getDisplayInfo();
}
function handleDisplayChange() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
    const b = mainWindow.getBounds();
    const d = screen.getDisplayMatching(b);
    if (!inArea(b, d.workArea)) {
      // Screen removed, resolution reduced, or taskbar work area changed.
      mainWindow.setBounds(responsiveBounds(d.workArea, {...b,layoutRevision:LAYOUT_REVISION}));
    }
  }
  sendDisplayInfo();
}
function persistBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  const isMaximized = mainWindow.isMaximized();
  const b = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  try { fs.writeFileSync(configPath(), JSON.stringify({...b, layoutRevision:LAYOUT_REVISION, isMaximized}), {encoding:'utf8', mode:0o600}); }
  catch (err) { console.warn('Window position could not be saved:', err.message); }
}
function createWindow() {
  mainWindow = new BrowserWindow({
    ...chooseInitialBounds(),
    minWidth: 680,
    minHeight: 480,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#0d1522',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  // Do not leave the app invisible forever if Chromium never emits ready-to-show.
  let shown = false;
  const revealWindow = source => {
    if (shown || !mainWindow || mainWindow.isDestroyed()) return;
    shown = true;
    console.log('[Counter Advisor] Displaying window (' + source + ').');
    mainWindow.show();
    if (safeReadBounds()?.isMaximized) mainWindow.maximize();
    mainWindow.focus();
    sendDisplayInfo();
  };
  mainWindow.once('ready-to-show', () => revealWindow('ready-to-show'));
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Counter Advisor] Application page loaded.');
    revealWindow('did-finish-load');
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) {
      console.error('[Counter Advisor] Application page failed to load:', code, description, url);
      revealWindow('load-failure');
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Counter Advisor] Renderer stopped:', details.reason);
    revealWindow('renderer-stopped');
  });
  const showTimeout = setTimeout(() => {
    if (shown) return;
    console.warn('[Counter Advisor] Startup timeout; displaying window for diagnostics.');
    revealWindow('startup-timeout');
  }, 5000);
  mainWindow.on('closed', () => clearTimeout(showTimeout));
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html')).catch(err => {
    console.error('[Counter Advisor] Could not open index.html:', err);
    revealWindow('load-error');
  });
  for (const event of ['moved', 'resized', 'maximize', 'unmaximize']) {
    mainWindow.on(event, () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { persistBounds(); sendDisplayInfo(); }, 250);
    });
  }
  mainWindow.on('close', () => { clearTimeout(saveTimer); persistBounds(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}
// A second copy would race the first over window-bounds.json, the catalog
// cache and update downloads; bring the running window forward instead.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
app.whenReady().then(() => {
  if (!primaryInstance) return;
  // Local assets load, external network requests fail; callbacks must complete.
  // Lock down only the app's own window; the Overwolf runtime's internal pages
  // share this session and must reach Overwolf to verify the app.
  registerOfflineRestrictions(session.defaultSession, details => !!mainWindow && !mainWindow.isDestroyed() && details.webContentsId === mainWindow.webContents.id);
  console.log('[Counter Advisor] Offline security rules installed.');
  ipcMain.handle('catalog:get', event => event.sender===mainWindow?.webContents ? dataService.readCache(app.getPath('userData')) : null);
  ipcMain.handle('catalog:sync', async event => {
    if(event.sender!==mainWindow?.webContents)throw new Error('Untrusted catalog caller');
    return dataService.refresh(app.getPath('userData'));
  });
  // Post-match debrief: a numeric match ID only; the main process strips
  // account IDs before anything is returned.
  ipcMain.handle('debrief:load', async (event, matchId, ownAccountId) => {
    if(!trusted(event))throw new Error('Unauthorized caller');
    return matchService.loadMatch(app.getPath('userData'), String(matchId ?? ''), String(ownAccountId ?? ''));
  });
  ipcMain.handle('replay:import', async event => {
    if(event.sender!==mainWindow?.webContents)throw new Error('Untrusted replay caller');
    const answer=await dialog.showOpenDialog(mainWindow,{title:'Open saved match event replay (not live)',properties:['openFile'],filters:[{name:'JSON event replay',extensions:['json']} ]});
    if(answer.canceled||answer.filePaths.length!==1)return null;
    const stat=fs.statSync(answer.filePaths[0]);
    if(stat.size>1024*1024)throw new Error('Replay JSON is larger than 1 MB');
    return replayService.replay(JSON.parse(fs.readFileSync(answer.filePaths[0],'utf8')));
  });
  ipcMain.handle('live:status', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return liveStatus();});
  ipcMain.handle('live:monitor', (event,enabled)=>{if(!trusted(event))throw new Error('Unauthorized caller');return setMonitor(enabled);});
  ipcMain.handle('live:feed:select', async event=>{
    if(!trusted(event))throw new Error('Unauthorized caller');
    const answer=await dialog.showOpenDialog(mainWindow,{title:'Select locally exported JSON Lines match events (development / approved sources only)',properties:['openFile'],filters:[{name:'JSON Lines match events',extensions:['jsonl','ndjson']} ]});
    if(answer.canceled||answer.filePaths.length!==1)return liveStatus();
    const file=answer.filePaths[0];
    // This does not create an event source. It only tails a file the user selected.
    feedStatus={active:true,name:path.basename(file).slice(0,100),error:''};
    try{localFeed.start(file);}catch(e){feedStatus={active:false,name:'',error:String(e.message).slice(0,170)};}
    publishStatus();return liveStatus();
  });
  ipcMain.handle('live:feed:stop', event=>{
    if(!trusted(event))throw new Error('Unauthorized caller');
    localFeed.stop();feedStatus={active:false,name:'',error:''};publishStatus();return liveStatus();
  });
  // Explicit, narrow update IPC: no user-supplied URLs or remote executable paths.
  ipcMain.handle('updates:status', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return updates.getState();});
  ipcMain.handle('updates:check', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return updates.check();});
  ipcMain.handle('updates:download', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return updates.download();});
  ipcMain.handle('updates:install', event=>{if(!trusted(event))throw new Error('Unauthorized caller');return updates.install();});
  ipcMain.handle('desktop:getDisplays', event => {
    if (event.sender !== mainWindow?.webContents) return null;
    return getDisplayInfo();
  });
  ipcMain.handle('desktop:nextDisplay', event => {
    if (event.sender !== mainWindow?.webContents) return null;
    return moveToNextDisplay();
  });
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
  createWindow();
  updates.start();
  // Check once after startup; do not download or install without a user click.
  if(updates.getState().phase==='idle') setTimeout(()=>void updates.check(),8000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(err => {
  console.error('[Counter Advisor] Startup error:', err);
  app.exit(1);
});
app.on('window-all-closed', () => {setMonitor(false);localFeed.stop();overwolfLive.stop();if (process.platform !== 'darwin') app.quit(); });
