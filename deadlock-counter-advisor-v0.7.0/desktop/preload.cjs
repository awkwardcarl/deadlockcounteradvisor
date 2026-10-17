'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  getUpdateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: listener => {if(typeof listener==='function')ipcRenderer.on('updates:state',(_event,value)=>listener(value));},
  getCachedCatalog: () => ipcRenderer.invoke('catalog:get'),
  syncCatalog: () => ipcRenderer.invoke('catalog:sync'),
  importReplay: () => ipcRenderer.invoke('replay:import'),
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
