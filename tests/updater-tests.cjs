'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {updateEnabled,cleanMessage,createUpdateManager}=require('../desktop/updater.cjs');
let n=0;const eq=(a,b)=>{assert.deepEqual(a,b);n++;};const ok=x=>{assert.ok(x);n++;};
(async()=>{
 eq(updateEnabled({isPackaged:false,platform:'win32'}),false);
 eq(updateEnabled({isPackaged:true,platform:'linux'}),false);
 eq(updateEnabled({isPackaged:true,platform:'win32'}),true);
 ok(!cleanMessage('https://secret.local/token=123').includes('secret.local'));
 const events=[];
 const dev=createUpdateManager({isPackaged:false,platform:'win32',currentVersion:'0.7.1',send:x=>events.push(x),loadUpdater:()=>{throw Error('must not load');}});
 eq(dev.start().phase,'unavailable');eq((await dev.check()).phase,'unavailable');
 class MockUpdater extends EventEmitter {
   checks=0;downloads=0;restarts=0;
   async checkForUpdates(){this.checks++;this.emit('checking-for-update');this.emit('update-available',{version:'0.7.2'});}
   async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:66.3});this.emit('update-downloaded',{version:'0.7.2'});}
   quitAndInstall(){this.restarts++;}
 }
 const mock=new MockUpdater();
 const app=createUpdateManager({isPackaged:true,platform:'win32',currentVersion:'0.7.1',send:x=>events.push(x),loadUpdater:()=>mock});
 eq(app.start().phase,'idle');eq(mock.autoDownload,false);eq(mock.autoInstallOnAppQuit,false);
 eq(app.install(),false);eq((await app.download()).phase,'idle');
 eq((await app.check()).phase,'available');eq(mock.checks,1);eq(app.getState().availableVersion,'0.7.2');
 eq((await app.download()).phase,'ready');eq(app.getState().percent,100);
 eq(app.install(),true);eq(mock.restarts,1);ok(events.some(x=>x.phase==='downloading'));
 const next=new MockUpdater();
 next.checkForUpdates=async()=>next.emit('update-not-available');
 const stable=createUpdateManager({isPackaged:true,platform:'win32',currentVersion:'0.7.1',send:()=>{},loadUpdater:()=>next});
 stable.start();eq((await stable.check()).phase,'current');
 const fail=new MockUpdater();fail.checkForUpdates=async()=>{throw Error('connection failed')};
 const failed=createUpdateManager({isPackaged:true,platform:'win32',currentVersion:'0.7.1',send:()=>{},loadUpdater:()=>fail});
 failed.start();eq((await failed.check()).phase,'error');
 const bad=createUpdateManager({isPackaged:true,platform:'win32',currentVersion:'0.7.1',send:()=>{},loadUpdater:()=>{throw Error('missing runtime') }});
 eq(bad.start().phase,'error');
 console.log(`PASS: ${n} updater state, user-consent, and offline-development checks`);
})().catch(e=>{console.error(e);process.exitCode=1});
