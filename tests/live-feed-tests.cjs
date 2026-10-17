'use strict';
// Local JSONL feed reading and how feed snapshots merge with manual edits.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {LocalFeed}=require('../live/local-feed.cjs');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','live-merge.js'),'utf8'),ctx);
const {mergeFeedSnapshot}=ctx.DeadlockLiveMerge;
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

const roster=(i,data)=>JSON.stringify({feature:'match_info',key:'roster_'+i,data:JSON.stringify(data)})+'\n';
const items=(i,name,list)=>JSON.stringify({feature:'match_info',key:'items_'+i,data:JSON.stringify({player_name:name,items:list.map(n=>({name:n}))})})+'\n';
const filler=chars=>JSON.stringify({key:'filler',value:'a'.repeat(chars)})+'\n'; // ignored by EventState
const FILLER_OVERHEAD=Buffer.byteLength(filler(0));
const header=roster(0,{player_name:'Me',hero_name:'KELVIN',team_name:'Amber',is_local:true,souls:2400})
  +roster(1,{player_name:'EnemyA',hero_name:'HAZE',team_name:'Sapphire'});
function padTo(bytes){let out='';while(bytes>0){const n=Math.min(16000,bytes-FILLER_OVERHEAD);out+=filler(n);bytes-=n+FILLER_OVERHEAD;}return out;}
function feedRun(content){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dca-feed-'));
  const file=path.join(dir,'feed.jsonl');
  fs.writeFileSync(file,content);
  const states=[],errors=[];
  const feed=new LocalFeed({onState:s=>states.push(s),onError:e=>errors.push(e)});
  try{feed.start(file);}catch(e){errors.push(e.message);}
  return {feed,file,states,errors,done:()=>{feed.stop();fs.rmSync(dir,{recursive:true,force:true});}};
}

// Files larger than one read load fully, and publish a single update.
for(const size of [300*1024,4.9*1024*1024]){
  const run=feedRun(header+padTo(size)+items(1,'EnemyA',['Rapid Rounds']));
  test(!run.errors.length,`${Math.round(size/1024)} KB feed loads: ${run.errors.join('')}`);
  test(run.states.length===1,`${Math.round(size/1024)} KB feed publishes one update, not one per line`);
  test(run.states[0]?.enemies[0]?.items==='Rapid Rounds','events after the large prefix are applied');
  run.done();
}
let run=feedRun(header.repeat(1)+padTo(5*1024*1024+1));
test(run.errors.some(e=>e.includes('5 MB')),'files over 5 MB are still rejected at selection');
run.done();

// Appends: one update per poll, none when nothing new arrived.
run=feedRun(header);
fs.appendFileSync(run.file,items(1,'EnemyA',['Burst Fire'])+items(1,'EnemyA',['Burst Fire','Rapid Rounds']));
run.feed.poll();
test(run.states.length===2&&run.states[1].enemies[0].items==='Burst Fire, Rapid Rounds','appended lines publish one combined update');
run.feed.poll();
test(run.states.length===2,'idle poll publishes nothing');
// A broken line still publishes the valid lines before it, then stops.
fs.appendFileSync(run.file,items(1,'EnemyA',['Toxic Bullets'])+'{BROKEN JSON}\n');
run.feed.poll();
test(run.states.length===3&&run.states[2].enemies[0].items==='Toxic Bullets'&&run.errors.length===1&&run.feed.file===null,'valid lines before a broken line are kept, then the feed stops');
run.done();

// A multi-byte character split across two reads must not be garbled.
const enemyName='Ñandú 🦆 Ω';
const enemyLine=roster(2,{player_name:enemyName,hero_name:'LASH',team_name:'Sapphire'});
const emojiAt=Buffer.byteLength(enemyLine.slice(0,enemyLine.indexOf('🦆')));
const lead=header+padTo(64*1024-2-emojiAt-Buffer.byteLength(header));
test(Buffer.byteLength(lead)+emojiAt===64*1024-2,'test places the 4-byte emoji across the 64 KB read boundary');
run=feedRun(lead+enemyLine);
test(run.states[0]?.enemies.some(e=>e.name===enemyName),'player name decoded intact across reads');
run.done();

// A line that never ends is rejected rather than buffered without limit.
run=feedRun(header+'{"key":"filler","value":"'+'a'.repeat(20000));
test(run.errors.some(e=>e.includes('line exceeded')),'unterminated oversized line stops the feed');
run.done();

// Merging snapshots into editable state.
const snap=(extra={})=>({matchId:'M1',phase:'in-progress',ownHero:'KELVIN',souls:2400,players:3,observedInventories:2,
  enemies:[{name:'EnemyA',hero:'HAZE',items:'Rapid Rounds'},{name:'EnemyB',hero:'LASH',items:'Mystic Burst'}],warning:'',...extra});
const resolve=name=>name.charAt(0)+name.slice(1).toLowerCase();
const state={hero:'Abrams',souls:0,owned:'',enemies:[]};
let prev=null;
const merge=next=>{const r=mergeFeedSnapshot(state,prev,next,resolve);prev=next;return r;};

let r=merge(snap());
test(r.changed&&state.enemies.length===2&&state.enemies[0].hero==='Haze'&&state.enemies[0].feedName==='EnemyA','first snapshot fills the lineup');
test(state.hero==='Kelvin'&&state.souls===2400,'first snapshot sets your hero and souls');

state.enemies[0].items='Rapid Rounds, Headshot Booster';state.souls=3000;state.hero='Abrams';
r=merge(snap({clock:'12:01'}));
test(!r.changed&&state.enemies[0].items==='Rapid Rounds, Headshot Booster'&&state.souls===3000&&state.hero==='Abrams','unchanged feed values do not overwrite manual edits');

r=merge(snap({enemies:[{name:'EnemyA',hero:'HAZE',items:'Rapid Rounds'},{name:'EnemyB',hero:'LASH',items:'Mystic Burst, Tankbuster'}]}));
test(r.changed&&state.enemies[1].items==='Mystic Burst, Tankbuster','feed change for one enemy is applied');
test(state.enemies[0].items==='Rapid Rounds, Headshot Booster'&&state.souls===3000,'other manual edits survive that update');

r=merge(snap({souls:3500,enemies:prev.enemies}));
test(r.changed&&state.souls===3500,'new feed souls value replaces the manual one');

state.enemies.splice(0,1);
r=merge(snap({souls:3500,enemies:[{name:'EnemyA',hero:'HAZE',items:'Burst Fire'},prev.enemies[1]]}));
test(!r.changed&&state.enemies.length===1&&state.enemies[0].feedName==='EnemyB','a row the user removed is not re-added for a same-roster update');

state.enemies.push({hero:'Seven',items:''});
r=merge(snap({souls:3500,enemies:[...prev.enemies,{name:'EnemyC',hero:'SEVEN',items:''}]}));
test(r.changed&&state.enemies.length===3&&state.enemies.every(e=>e.feedName),'roster change rebuilds the lineup from the feed');

r=merge(snap({matchId:'M2',enemies:[{name:'EnemyZ',hero:'BEBOP',items:''}]}));
test(r.changed&&state.enemies.length===1&&state.enemies[0].hero==='Bebop','new match id replaces the lineup');

r=merge(snap({phase:'ended',enemies:[]}));
test(r.changed&&r.ended&&state.enemies.length===0,'match end clears the lineup');
state.enemies.push({hero:'Haze',items:''});
r=merge(snap({phase:'ended',enemies:[],clock:'0:01'}));
test(!r.changed&&state.enemies.length===1,'repeated end-of-match updates do not wipe entries made afterwards');

r=merge(snap({enemies:[],warning:'Local player not identified; enemy data withheld.'}));
test(!r.changed&&r.warning&&state.enemies.length===1,'warning snapshot leaves the lineup alone');
r=merge(snap());
test(r.changed&&state.enemies.length===2,'first usable snapshot after a warning fills the lineup');
console.log(`PASS: ${total} local feed reading and manual-edit merge checks`);
