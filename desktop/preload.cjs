'use strict';
const {contextBridge, ipcRenderer} = require('electron');
// Flags set by the main process when it creates the window (additionalArguments).
const flag = name => (process.argv.find(arg => arg.startsWith('--counter-advisor-'+name+'=')) || '').split('=')[1] || '';
const hotkey = flag('hotkey');
contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  edition: flag('edition') === 'overwolf' ? 'overwolf' : 'standard',
  hotkey: hotkey && hotkey !== 'none' ? hotkey : '',
  getPrivacyStatus: () => ipcRenderer.invoke('privacy:status'),
  openPrivacySettings: tab => ipcRenderer.invoke('privacy:open', String(tab ?? '')),
  openLegal: which => ipcRenderer.invoke('legal:open', which === 'terms' ? 'terms' : 'privacy'),
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: listener => {if(typeof listener==='function')ipcRenderer.on('updates:state',(_event,value)=>listener(value));},
  getCachedCatalog: () => ipcRenderer.invoke('catalog:get'),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  // A newer catalog from the background sync (a day old, or a game update seen live).
  onCatalogUpdated: listener => {if(typeof listener==='function')ipcRenderer.on('catalog:updated',(_event,value)=>listener(value));},
  importReplay: () => ipcRenderer.invoke('replay:import'),
  loadMatch: (matchId, ownAccountId) => ipcRenderer.invoke('debrief:load', String(matchId ?? ''), String(ownAccountId ?? '')),
  getBuildData: (heroId, laneIds) => ipcRenderer.invoke('builddata:get', Number(heroId), Array.isArray(laneIds) ? laneIds.map(Number) : []),
  liveStatus: () => ipcRenderer.invoke('live:status'),
  setGameDetection: enabled => ipcRenderer.invoke('live:monitor', enabled===true),
  chooseEventFeed: () => ipcRenderer.invoke('live:feed:select'),
  stopEventFeed: () => ipcRenderer.invoke('live:feed:stop'),
  onLiveStatus: listener => {if(typeof listener==='function')ipcRenderer.on('live:status',(_event,value)=>listener(value));},
  onLiveMatch: listener => {if(typeof listener==='function')ipcRenderer.on('live:match',(_event,value)=>listener(value));},
  getDisplays: () => ipcRenderer.invoke('desktop:getDisplays'),
  moveToNextDisplay: () => ipcRenderer.invoke('desktop:nextDisplay'),
  onDisplaysChanged: (listener) => {
    if (typeof listener !== 'function') return;
    ipcRenderer.on('desktop:displays', (_event, info) => listener(info));
  }
}));
