'use strict';
/** Privacy for both editions: the Privacy Policy and Terms of Use links, and
 * Overwolf's consent settings (CMP) in the Overwolf edition. Overwolf asks every
 * app for a Privacy section with a Manage button, and apps with their own
 * installer (this one) must offer the consent screen on first launch when
 * Overwolf says it is required. In the standard build app.overwolf is absent
 * and consent reports itself unavailable. Main process only. */
const LEGAL_URLS=Object.freeze({
  privacy:'https://awkwardcarl.github.io/deadlockcounteradvisor/privacy.html',
  terms:'https://awkwardcarl.github.io/deadlockcounteradvisor/terms.html'
});
const TABS=new Set(['purposes','features','vendors']);

function createPrivacy({app,getWindow=()=>null}={}){
  const ow=app?.overwolf;
  // openCMPWindow is the older, deprecated name; use it only on older runtimes.
  const openWindow=ow&&(typeof ow.openAdPrivacySettingsWindow==='function'?ow.openAdPrivacySettingsWindow:typeof ow.openCMPWindow==='function'?ow.openCMPWindow:null);
  return {
    available:!!openWindow,
    async status(){
      if(!openWindow)return {available:false,required:false};
      // Overwolf documents isCMPRequired as never throwing, defaulting to true.
      let required=true;
      try{required=(await ow.isCMPRequired())!==false;}catch(_){}
      return {available:true,required};
    },
    async openSettings(tab){
      if(!openWindow)return false;
      const parent=getWindow();
      const options={center:true,backgroundColor:'#0c1420',preLoaderSpinnerColor:'#7fd8b8'};
      if(parent&&!parent.isDestroyed()){options.parent=parent;options.modal=true;}
      if(TABS.has(tab))options.tab=tab;
      await openWindow.call(ow,options);
      return true;
    }
  };
}
module.exports={createPrivacy,LEGAL_URLS};
