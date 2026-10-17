'use strict';
/** Inspects ordinary Windows process *names*, not game process memory. */
const {execFile}=require('node:child_process');
const ALLOWED_NAMES=new Set(['deadlock.exe','project8.exe']);
function runningProcesses(stdout){
  return String(stdout||'').split(/\r?\n/).map(line=>{
    // tasklist /FO CSV /NH; first quoted CSV field is the image name.
    const m=line.match(/^\s*"([^"]+)"\s*,/);
    return m?m[1].toLowerCase():null;
  }).filter(Boolean);
}
function hasDeadlock(stdout){return runningProcesses(stdout).some(name=>ALLOWED_NAMES.has(name));}
// Ask Windows only about the game's own executable names (tasklist /FI), so the
// app never reads the rest of the user's process list.
function queryName(launch,name){
  return new Promise((resolve,reject)=>{
    launch('tasklist.exe',['/FO','CSV','/NH','/FI',`IMAGENAME eq ${name}`],{encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:64*1024},(error,stdout)=>{
      if(error)return reject(error);
      resolve(hasDeadlock(stdout));
    });
  });
}
async function checkGame(launch=execFile,platform=process.platform){
  if(platform!=='win32')return {supported:false,running:false,message:'Process detection requires Windows.'};
  try{
    for(const name of ALLOWED_NAMES)if(await queryName(launch,name))return {supported:true,running:true};
    return {supported:true,running:false};
  }catch(_){
    return {supported:true,running:false,error:'Windows process list unavailable; monitor has not confirmed Deadlock.'};
  }
}
module.exports={ALLOWED_NAMES,runningProcesses,hasDeadlock,checkGame};
