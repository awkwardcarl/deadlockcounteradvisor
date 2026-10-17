'use strict';
// Only the Electron main process can access the update provider. The renderer
// can request a check/download/install, but cannot choose a URL or executable.
// No update check or download occurs inside a development or unpacked build.
function updateEnabled({isPackaged,platform}) {
  return Boolean(isPackaged && platform === 'win32');
}
function cleanMessage(error) {
  const msg=String(error?.message || error || 'Unknown update error');
  return msg.replace(/(?:https?:\/\/)[^\s]+/g, '[release server]')
    .replace(/(?:[A-Z]:\\|\/Users\/|\/home\/)[^\s]+/gi, '[local path]')
    .slice(0, 220);
}
function createUpdateManager({isPackaged,platform,currentVersion,send,loadUpdater}) {
  const enabled=updateEnabled({isPackaged,platform});
  let phase=enabled?'idle':'unavailable';
  let info={phase,version:currentVersion,availableVersion:null,percent:null,message:enabled?'Updates ready to check':'Updates work only in the installed Windows app.'};
  let updater=null, checking=false, downloading=false;
  const emit=patch=>{info={...info,...patch};send({...info});return {...info};};
  function start() {
    if(!enabled)return {...info};
    try{
      updater=loadUpdater();
      updater.autoDownload=false;
      updater.autoInstallOnAppQuit=false;
      updater.allowPrerelease=false;
      updater.on('checking-for-update',()=>emit({phase:'checking',message:'Checking GitHub Releases for updates…'}));
      updater.on('update-available',release=>emit({phase:'available',availableVersion:String(release?.version||''),message:'A newer version is available. Download only when you choose.'}));
      updater.on('update-not-available',()=>emit({phase:'current',availableVersion:null,percent:null,message:'You are using the latest published version.'}));
      updater.on('download-progress',progress=>emit({phase:'downloading',percent:Math.max(0,Math.min(100,Math.round(progress?.percent||0))),message:'Downloading update from GitHub Releases…'}));
      updater.on('update-downloaded',release=>emit({phase:'ready',availableVersion:String(release?.version||info.availableVersion||''),percent:100,message:'Ready to install. Restart only when you are finished playing.'}));
      updater.on('error',error=>emit({phase:'error',percent:null,message:'Update check or download failed: '+cleanMessage(error)}));
    }catch(error){
      updater=null;
      emit({phase:'error',message:'Updater could not initialize: '+cleanMessage(error)});
    }
    return {...info};
  }
  async function check() {
    if(!updater)return {...info};
    if(checking||downloading||info.phase==='ready')return {...info};
    checking=true;
    try{emit({phase:'checking',percent:null,message:'Checking GitHub Releases for updates…'});await updater.checkForUpdates();}
    catch(error){emit({phase:'error',message:'Could not check updates: '+cleanMessage(error)});}
    finally{checking=false;}
    return {...info};
  }
  async function download() {
    if(!updater||downloading||info.phase!=='available')return {...info};
    downloading=true;
    try{emit({phase:'downloading',percent:0,message:'Downloading update…'});await updater.downloadUpdate();}
    catch(error){emit({phase:'error',percent:null,message:'Could not download update: '+cleanMessage(error)});}
    finally{downloading=false;}
    return {...info};
  }
  function install() {
    if(!updater||info.phase!=='ready')return false;
    // User-requested action only; never restart during a game automatically.
    updater.quitAndInstall(false,true);
    return true;
  }
  return {start,check,download,install,getState:()=>({...info})};
}
module.exports={updateEnabled,cleanMessage,createUpdateManager};
