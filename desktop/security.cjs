'use strict';
// Electron onBeforeRequest MUST invoke callback. All API calls are user-clicked
// and occur in the main process against a single fixed public metadata source.
// Image paths are restricted to the provider's game artwork directory.
function permittedImageURL(url){
 try{const u=new URL(url);return u.origin==='https://deadlock.io' && /^\/assets\/game\/panorama\/images\/[\w\/.\-]+\.png$/.test(u.pathname)&&!u.search&&!u.hash;}catch(_){return false;}
}
// isAppRequest(details) decides which requests get locked down. main.cjs
// passes "comes from the app's own window", so the Overwolf runtime's internal
// pages (consent window, package verification) can reach Overwolf in the same
// session. Without it, every request is treated as the app's.
function registerOfflineRestrictions(electronSession,isAppRequest=()=>true){
 electronSession.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
 electronSession.webRequest.onBeforeRequest((details,done)=>{
   const network=/^(?:https?|wss?):/i.test(details.url);
   const locked=network&&isAppRequest(details)!==false;
   done({cancel:locked && !(details.resourceType==='image'&&permittedImageURL(details.url))});
 });
}
module.exports={registerOfflineRestrictions,permittedImageURL};
