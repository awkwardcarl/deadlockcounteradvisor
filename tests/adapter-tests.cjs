'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {OverwolfGepAdapter, DEADLOCK_GEP_ID, removeUnapprovedInventory}=require('../live/overwolf-gep-adapter.cjs');
class MockGep extends EventEmitter {
  constructor(){super();this.features=["game_info","match_info"];this.registered=[];this.enabled=false;}
  async getFeatures(){return this.features;}
  async setRequiredFeatures(id,features){this.registered=[id,features];}
  async getInfo(){return {};}
}
// Fail instead of exiting 0 if the async checks stop before the end.
let finished=false;
process.on('exit',code=>{if(!finished&&code===0){console.error('Tests stopped before finishing.');process.exitCode=1;}});
(async()=>{
  let checks=0;
  const test=(f)=>{f();checks++;};
  const fake=new MockGep(); let matches=[];
  const adapter=new OverwolfGepAdapter({gep:fake,onMatch:x=>matches.push(x)});
  test(()=>assert.throws(()=>adapter.start(),/until Overwolf whitelisting/));
  test(()=>assert.equal(fake.listenerCount('game-detected'),0));
  const A=new OverwolfGepAdapter({gep:fake,approval:{overwolfWhitelist:true,gameComplianceConfirmed:true},onMatch:x=>matches.push(x)});
  A.start();
  test(()=>assert.equal(fake.listenerCount('game-detected'),1));
  await A.detected({enable(){fake.enabled=true;}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.deepEqual(fake.registered,[DEADLOCK_GEP_ID,['game_info','match_info']]));
  test(()=>assert.equal(fake.enabled,true));
  const update=(key,data)=>fake.emit('new-info-update',{},DEADLOCK_GEP_ID,{feature:'match_info',key,data:JSON.stringify(data)});
  update('roster_0',{player_name:'Me',hero_name:'Kelvin',team_name:'Amber',is_local:true,souls:1800});
  update('roster_1',{player_name:'Them',hero_name:'Lash',team_name:'Sapphire'});
  update('items_1',{player_name:'Them',items:[{name:'Headshot Booster'}]});
  test(()=>assert.equal(matches.at(-1).enemies.length,1));
  test(()=>assert.equal(matches.at(-1).enemies[0].items,''));
  test(()=>assert.equal(matches.at(-1).observedInventories,0));
  A.stop();
  test(()=>assert.equal(fake.listenerCount('new-info-update'),0));
  const B=new OverwolfGepAdapter({gep:fake,approval:{overwolfWhitelist:true,gameComplianceConfirmed:true,enemyInventoryForLiveAdvice:true},onMatch:x=>matches.push(x)});
  B.start();await B.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  update('roster_0',{player_name:'Me',hero_name:'Kelvin',team_name:'Amber',is_local:true});
  update('roster_1',{player_name:'Them',hero_name:'Lash',team_name:'Sapphire'});
  update('items_1',{player_name:'Them',items:[{name:'Headshot Booster'}]});
  test(()=>assert.equal(matches.at(-1).enemies[0].items,'Headshot Booster'));
  B.stop();
  // enable() must run inside the game-detected handler, before any await.
  const order=[];
  const slow=new MockGep();
  slow.setRequiredFeatures=async()=>{order.push('setRequiredFeatures');};
  const C=new OverwolfGepAdapter({gep:slow,approval:{overwolfWhitelist:true,gameComplianceConfirmed:true}});
  C.start();
  const pending=C.detected({enable(){order.push('enable');}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.deepEqual(order,['enable','setRequiredFeatures'],'enable() runs synchronously, then features are registered, as in the Overwolf sample'));
  await pending;C.stop();
  const ok={overwolfWhitelist:true,gameComplianceConfirmed:true};
  const roster0={feature:'match_info',key:'roster_0',data:JSON.stringify({player_name:'Me',hero_name:'Kelvin',team_name:'Amber',is_local:true})};
  // Seen in a real match: the feature list lacked match_info right after detection. Register anyway.
  const bare=new MockGep();bare.features=['game_info'];const seen=[],said=[];
  const D=new OverwolfGepAdapter({gep:bare,approval:ok,onMatch:x=>seen.push(x),onStatus:(m,st)=>said.push(st)});
  D.start();await D.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  bare.emit('new-info-update',{},DEADLOCK_GEP_ID,roster0);
  test(()=>assert.ok(said.at(-1)==='connected'&&bare.registered[1].join()==='game_info,match_info'&&seen.at(-1).ownHero==='Kelvin','incomplete feature list: still registers and consumes'));
  D.stop();
  // Registration that fails at first is retried.
  const flaky=new MockGep();let calls=0;const flakySaid=[];
  flaky.setRequiredFeatures=async()=>{if(++calls<3)throw new Error('not ready');};
  const E=new OverwolfGepAdapter({gep:flaky,approval:ok,retryMs:1,attempts:5,onStatus:(m,st)=>flakySaid.push(st)});
  E.start();await E.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.ok(calls===3&&flakySaid.join()==='waiting,connected','retries until registration succeeds'));
  E.stop();
  // Gives up after the last attempt and names the features Overwolf reported.
  const dead=new MockGep();let tries=0;const deadSaid=[];
  dead.setRequiredFeatures=async()=>{tries++;throw new Error('not ready');};
  const F=new OverwolfGepAdapter({gep:dead,approval:ok,retryMs:1,attempts:3,onStatus:(m,st)=>deadSaid.push([st,m])});
  F.start();await F.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.ok(tries===3&&deadSaid.at(-1)[0]==='error'&&/not ready/.test(deadSaid.at(-1)[1])&&/game_info, match_info/.test(deadSaid.at(-1)[1]),'after the last try: error with the reason and feature list'));
  F.stop();
  // Closing the game stops the retries.
  const quit=new MockGep();let quitTries=0;
  quit.setRequiredFeatures=async()=>{quitTries++;quit.emit('game-exit',{},DEADLOCK_GEP_ID);throw new Error('not ready');};
  const G=new OverwolfGepAdapter({gep:quit,approval:ok,retryMs:1,attempts:5});
  G.start();await G.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.equal(quitTries,1,'game exit ends the retry loop'));
  G.stop();
  // Catch-up info for a match in progress, in each plausible result shape.
  for(const wrap of [m=>({info:m}),m=>({res:m}),m=>m]){
    const g=new MockGep();const got=[];
    g.getInfo=async()=>wrap({match_info:{roster_0:roster0.data}});
    const H=new OverwolfGepAdapter({gep:g,approval:ok,onMatch:x=>got.push(x)});
    H.start();await H.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
    test(()=>assert.equal(got.at(-1)?.ownHero,'Kelvin','getInfo catch-up: '+JSON.stringify(wrap({})).slice(0,10)));
    H.stop();
  }
  test(()=>assert.equal(removeUnapprovedInventory({feature:'match_info',key:'items_1',data:{}},false),null));
  test(()=>assert.ok(removeUnapprovedInventory({feature:'match_info',key:'items_1',data:{}},true)));
  finished=true;
  console.log(`${checks} Overwolf adapter tests passed (simulated API only)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
