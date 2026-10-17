'use strict';
// Electron onBeforeRequest MUST invoke callback. All API calls are user-clicked
// and occur in the main process against a single fixed public metadata source.
// Image paths are restricted to the provider's game artwork directory.
function permittedImageURL(url){
 try{const u=new URL(url);return u.origin==='https://deadlock.io' && /^\/assets\/game\/panorama\/images\/[\w\/.\-]+\.png$/.test(u.pathname)&&!u.search&&!u.hash;}catch(_){return false;}
}
function registerOfflineRestrictions(electronSession){
 electronSession.setPermissionRequestHandler((_contents,_permission,done)=>done(false));
 electronSession.webRequest.onBeforeRequest((details,done)=>{
   const network=/^(?:https?|wss?):/i.test(details.url);
   done({cancel:network && !(details.resourceType==='image'&&permittedImageURL(details.url))});
 });
}
module.exports={registerOfflineRestrictions,permittedImageURL};
