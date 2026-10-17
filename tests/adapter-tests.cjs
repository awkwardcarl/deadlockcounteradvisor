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
  slow.getFeatures=async()=>{order.push('getFeatures');return slow.features;};
  const C=new OverwolfGepAdapter({gep:slow,approval:{overwolfWhitelist:true,gameComplianceConfirmed:true}});
  C.start();
  const pending=C.detected({enable(){order.push('enable');}},DEADLOCK_GEP_ID,'Deadlock');
  test(()=>assert.deepEqual(order,['enable','getFeatures'],'enable() is called synchronously, first'));
  await pending;C.stop();
  // A game without match_info detaches instead of accepting events.
  const bare=new MockGep();bare.features=['game_info'];const seen=[];
  const D=new OverwolfGepAdapter({gep:bare,approval:{overwolfWhitelist:true,gameComplianceConfirmed:true},onMatch:x=>seen.push(x)});
  D.start();await D.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  bare.emit('new-info-update',{},DEADLOCK_GEP_ID,{feature:'match_info',key:'roster_0',data:'{}'});
  test(()=>assert.ok(D.gameId===null&&seen.length===0&&bare.registered.length===0,'no match_info: detached, nothing registered or consumed'));
  D.stop();
  test(()=>assert.equal(removeUnapprovedInventory({feature:'match_info',key:'items_1',data:{}},false),null));
  test(()=>assert.ok(removeUnapprovedInventory({feature:'match_info',key:'items_1',data:{}},true)));
  console.log(`${checks} Overwolf adapter tests passed (simulated API only)`);
})().catch(e=>{console.error(e);process.exitCode=1;});
