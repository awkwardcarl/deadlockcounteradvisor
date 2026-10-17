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
function checkGame(launch=execFile){
  if(process.platform!=='win32')return Promise.resolve({supported:false,running:false,message:'Process detection requires Windows.'});
  return new Promise(resolve=>{
    launch('tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:2*1024*1024},(error,stdout)=>{
      if(error)return resolve({supported:true,running:false,error:'Windows process list unavailable; monitor has not confirmed Deadlock.'});
      resolve({supported:true,running:hasDeadlock(stdout)});
    });
  });
}
module.exports={ALLOWED_NAMES,runningProcesses,hasDeadlock,checkGame};
