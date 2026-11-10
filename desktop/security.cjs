'use strict';
// Electron onBeforeRequest MUST invoke callback. The page itself makes no network
// requests: catalog sync, the debrief and build data are fetched by the main
// process from fixed, allow-listed public routes.
// Images are restricted to deadlock-api's game artwork folder (item icons and
// hero portraits). deadlock.io, the old source, now redirects to SteamDB.
function permittedImageURL(url){
 try{
  const u=new URL(url);if(u.search||u.hash)return false;
  if(u.origin==='https://assets-bucket.deadlock-api.com')return /^\/assets-api-res\/images\/[\w\/.\-]+\.png$/.test(u.pathname)&&!u.pathname.includes('..');
  return false;
 }catch(_){return false;}
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
