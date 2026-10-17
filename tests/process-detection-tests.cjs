'use strict';
// Game detection asks Windows only about the game's executable names.
const assert=require('node:assert/strict');
const {checkGame,ALLOWED_NAMES}=require('../live/process-detection.cjs');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const NONE='INFO: No tasks are running which match the specified criteria.\r\n';
// Stand-in for execFile: answers as tasklist would if `running` were open.
function fakeTasklist(running,calls,fail=false){
  return (file,args,options,callback)=>{
    calls.push({file,args});
    if(fail)return callback(new Error('access denied'),'');
    const name=args[args.indexOf('/FI')+1].replace(/^IMAGENAME eq /,'');
    callback(null,running.includes(name)?`"${name}","4711","Console","1","125,000 K"\r\n`:NONE);
  };
}
(async()=>{
  let calls=[];
  let result=await checkGame(fakeTasklist([],calls),'win32');
  test(result.supported&&!result.running&&!result.error,'not running when neither name is found');
  test(calls.length===ALLOWED_NAMES.size&&calls.every(c=>c.file==='tasklist.exe'&&c.args.includes('/FI')),'every query is filtered by image name');
  test(calls.map(c=>c.args.at(-1)).join()==='IMAGENAME eq deadlock.exe,IMAGENAME eq project8.exe','only the game executable names are asked about');

  calls=[];
  result=await checkGame(fakeTasklist(['deadlock.exe'],calls),'win32');
  test(result.running&&calls.length===1,'stops after finding deadlock.exe');
  calls=[];
  result=await checkGame(fakeTasklist(['project8.exe'],calls),'win32');
  test(result.running&&calls.length===2,'legacy project8.exe still detected');

  result=await checkGame(fakeTasklist([],[],true),'win32');
  test(!result.running&&result.error,'a tasklist failure is reported, not treated as running');
  calls=[];
  result=await checkGame(fakeTasklist(['deadlock.exe'],calls),'linux');
  test(!result.supported&&calls.length===0,'no process queries outside Windows');
  console.log(`PASS: ${total} filtered game-detection checks`);
})().catch(e=>{console.error(e);process.exit(1);});
