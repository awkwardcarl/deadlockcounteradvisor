'use strict';
/** Overwolf ads (Overwolf edition only). One 400x300 box at the bottom of the
 * left column hosts Overwolf's <owadview>, which is built on Electron's
 * <webview>. Overwolf serves ads only after it enables them for this app's ID;
 * until then the box shows the app's own background. Set slot to false to
 * remove the box entirely. The standard edition never shows ads. */
const ADS=Object.freeze({slot:true,cid:'dca_400x300_main_lb',width:400,height:300});
// The ad view is the only page the app may embed. It loads over https (or
// starts blank) and runs isolated, without Node.
function adViewAllowed(params){
  const src=String(params?.src||'');
  return src===''||src==='about:blank'||/^https:\/\/[^\s/]+/i.test(src);
}
function lockDownAdView(webPreferences){
  webPreferences.nodeIntegration=false;
  webPreferences.nodeIntegrationInSubFrames=false;
  webPreferences.contextIsolation=true;
  webPreferences.webSecurity=true;
  return webPreferences;
}
const originOf=src=>{try{return new URL(src).origin;}catch(_){return String(src||'(blank)').slice(0,40);}};
module.exports={ADS,adViewAllowed,lockDownAdView,originOf};
