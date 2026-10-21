'use strict';
// Scoreboard signals from Overwolf's live data: each player's kills, deaths,
// assists and souls (fed enemies weigh more in the game plan), your deaths
// (the death event and your scoreboard deaths) and the damage panel's reading,
// which raise the priority alert when you keep dying.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {EventState,readDamage}=require('../live/event-state.cjs');
const {OverwolfGepAdapter,DEADLOCK_GEP_ID,validUpdate}=require('../live/overwolf-gep-adapter.cjs');
const APPROVAL=require('../desktop/live-approval.cjs');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const info=(key,data)=>({feature:'match_info',category:'match_info',key,value:JSON.stringify(data)});
const clock=c=>({feature:'match_info',key:'match_clock',value:c});
const me=extra=>info('roster_0',{player_name:'Me',hero_name:'SHIV',hero_id:19,team_name:'Amber',is_local:true,souls:9000,...extra});
const foe=(i,name,hero,extra)=>info('roster_'+i,{player_name:name,hero_name:hero,team_name:'Sapphire',souls:12000,...extra});

// ── Parser: scoreboard lines ──
const s=new EventState();
s.apply(clock('12:00'));
s.apply(me({kills:1,deaths:2,assist:3,hero_damage:4500,level:12}));
s.apply(foe(6,'E1','HAZE',{kills:9,deaths:1,assist:2,hero_damage:30000,level:20,souls:31000}));
s.apply(info('roster_7',{player_name:'Ally',hero_name:'KELVIN',team_name:'Amber',kills:2,deaths:3,assist:9,souls:15000}));
let snap=s.snapshot();
test(JSON.stringify(snap.enemies[0].stats)==='{"kills":9,"deaths":1,"assists":2,"heroDamage":30000,"level":20,"souls":31000}','each enemy carries their scoreboard line (assist is Overwolf\'s name for assists)');
test(snap.allies[0].stats.assists===9&&!('name' in snap.allies[0])&&snap.ownStats.kills===1&&snap.ownStats.souls===9000,'allies (still without player names) and you have one too');
s.apply(foe(6,'E1','HAZE',{kills:10,souls:32000}));
test(s.snapshot().enemies[0].stats.kills===10&&s.snapshot().enemies[0].stats.deaths===1&&s.snapshot().enemies[0].stats.assists===2,'a field missing from an update keeps its last value');
s.apply(foe(8,'E2','LASH',{kills:-4,deaths:'x',assist:1e12}));
const bad=s.snapshot().enemies.find(e=>e.hero==='LASH').stats;
test(bad.kills===0&&bad.deaths===0&&bad.assists===1e7,'negative, garbled and huge numbers are bounded');

// ── Parser: your deaths ──
test(snap.deathTimes.length===0,'deaths from before the app joined have no time and are not listed');
s.apply(clock('14:10'));s.apply({event:'death'});
s.apply(clock('14:13'));s.apply(me({deaths:3}));
test(JSON.stringify(s.snapshot().deathTimes)==='[850]','the death event and the scoreboard count the same death once (14:10)');
s.apply(clock('16:00'));s.apply(me({deaths:4}));
s.apply(clock('16:30'));s.apply({event:'death'});
test(JSON.stringify(s.snapshot().deathTimes)==='[850,960,990]','a scoreboard death and an event 30 seconds later are two deaths');
s.apply(clock('16:34'));s.apply(me({deaths:5}));
test(s.snapshot().deathTimes.length===3,'...and the scoreboard catching up on the second one adds nothing');
s.apply(me({kills:2}));
test(s.snapshot().deathTimes.length===3,'an update without deaths changes nothing');
s.apply(clock('18:00'));s.apply(me({deaths:7}));
test(JSON.stringify(s.snapshot().deathTimes)==='[850,960,990,1080,1080]','two deaths at once (a missed update) both count');
s.apply(info('match_id','999'));
test(s.snapshot().deathTimes.length===0&&s.snapshot().damage===null,'a new match starts with no deaths and no damage reading');
const ended=new EventState();ended.apply(me({deaths:1}));ended.apply(clock('3:00'));ended.apply({event:'death'});ended.apply({event:'match_start'});
test(ended.snapshot().deathTimes.length===0,'match start clears them too');

// ── Parser: the damage panel ──
const d1=readDamage({time_filter:-1,total_damage:5000,damages:[{name:'damageby_hero_haze',value:2500},{name:'damageby_hero_hornet',int:1100},{name:'damageby_neutrals',value:300},{name:'other_thing',value:9}]},'21:55');
test(JSON.stringify(d1)==='{"window":-1,"total":5000,"neutrals":300,"sources":[{"source":"haze","amount":2500},{"source":"hornet","amount":1100}],"clock":"21:55"}','damage by enemy hero ({name,value} or {name,int}), neutrals apart, unknown names dropped');
const d2=readDamage({time_filter:300,damages:[['damageby_hero_Lady Geist',400],['damageby_hero_seven','200']]},'');
test(d2.window===300&&d2.total===600&&d2.sources[0].source==='lady geist'&&d2.sources[1].amount===200,'[name,value] pairs; total from the parts when missing');
const d3=readDamage({time_filter:7,damages:{damageby_hero_haze:100,'damageby_hero_<b>':5}},'');
test(d3.window===null&&d3.sources.length===1,'a name->value map; odd windows and odd names are dropped');
test(readDamage({damages:[]},'')===null&&readDamage('x','')===null&&readDamage({damages:[{name:'damageby_hero_haze',value:-5}]},'')===null,'nothing usable: no reading');
const dm=new EventState();dm.apply(me({}));dm.apply(foe(6,'E1','HAZE'));dm.apply(clock('9:00'));
dm.apply(info('incoming_damage',{time_filter:-1,total_damage:900,damages:[{name:'damageby_hero_haze',value:800}]}));
test(dm.snapshot().damage.clock==='9:00'&&dm.snapshot().damage.sources[0].amount===800,'the latest reading is kept with the clock it arrived at');
dm.apply(info('incoming_damage',{time_filter:-1,damages:[]}));
test(dm.snapshot().damage.total===900,'an empty reading keeps the last one');

// ── Adapter: the death event and the damage panel reach the parser ──
class FakeGep extends EventEmitter{
  constructor(){super();this.features=['gep_internal','game_info','match_info'];}
  async getFeatures(){return this.features;}
  async setRequiredFeatures(){}
  async getInfo(){return {};}
}
test(validUpdate(info('incoming_damage',{damages:[]}))?.key==='incoming_damage'&&validUpdate({feature:'match_info',key:'team_score',value:'{}'})===null,'incoming_damage is accepted; other new keys still are not');
(async()=>{
  const gep=new FakeGep(),seen=[],dbg=[];
  const ad=new OverwolfGepAdapter({gep,approval:APPROVAL,onMatch:m=>seen.push(m),onDebug:m=>dbg.push(m)});
  ad.start();await ad.detected({enable(){}},DEADLOCK_GEP_ID,'Deadlock');
  const up=u=>gep.emit('new-info-update',{},DEADLOCK_GEP_ID,u);
  const ev=(key,value=null)=>gep.emit('new-game-event',{},DEADLOCK_GEP_ID,{feature:'match_info',key,value});
  up(me({deaths:0}));up(foe(6,'E1','HAZE'));ev('match_clock','5:00');
  ev('death');
  up(info('incoming_damage',{time_filter:-1,total_damage:700,damages:[{name:'damageby_hero_haze',value:650}]}));
  const last=seen.at(-1);
  test(JSON.stringify(last.deathTimes)==='[300]'&&last.damage.sources[0].source==='haze','the death event and damage readings flow from Overwolf');
  test(!dbg.some(m=>/death|incoming_damage/.test(m)),'neither is logged as an unknown key');
  ad.stop();
  rest();
})().catch(e=>{console.error(e);process.exitCode=1;});

function rest(){
// ── Merge: scoreboard lines on the rows, feed-only ──
const mctx=vm.createContext({});vm.runInContext(read('js/live-merge.js'),mctx);
const {mergeFeedSnapshot:merge,statsKey}=mctx.DeadlockLiveMerge;
const st=(k,d,a,souls)=>({kills:k,deaths:d,assists:a,souls,heroDamage:0,level:0});
const base={matchId:'M',phase:'in-progress',clock:'20:00',ownHero:'Shiv',souls:4000,ownItems:'',enemies:[{name:'E1',hero:'Haze',items:'',stats:st(5,1,2,20000)}],allies:[{hero:'Kelvin',items:'',stats:st(1,2,8,15000)}],deathTimes:[],damage:null};
const state={hero:'',souls:0,owned:'',enemies:[]};
merge(state,null,base,x=>x,x=>x);
test(JSON.stringify(state.enemies[0].stats)==='{"kills":5,"deaths":1,"assists":2,"souls":20000}'&&state.allies[0].stats.souls===15000,'rows get kills, deaths, assists and souls');
let r=merge(state,base,{...base,enemies:[{...base.enemies[0],stats:st(5,1,2,20800)}]},x=>x,x=>x);
test(!r.changed&&state.enemies[0].stats.souls===20000,'a few hundred souls more redo nothing');
const next={...base,enemies:[{...base.enemies[0],stats:st(6,1,2,21200)}]};
r=merge(state,base,next,x=>x,x=>x);
test(r.changed&&state.enemies[0].stats.kills===6,'a kill (or another 1,000 souls) updates the row');
test(statsKey(st(1,2,3,1999))===statsKey(st(1,2,3,1000))&&statsKey(st(1,2,3,2000))!==statsKey(st(1,2,3,1999)),'souls count in steps of 1,000');
r=merge(state,next,{...next,deathTimes:[1190]},x=>x,x=>x);
test(r.changed,'a death redoes the advice');
r=merge(state,{...next,deathTimes:[1190]},{...next,deathTimes:[1190],damage:{total:500,clock:'20:05',sources:[]}},x=>x,x=>x);
test(r.changed,'so does a new damage reading');
const ui=read('js/ui.js');
test(ui.includes('state.enemies.map(({feedName,stats,...row})=>row)'),'scoreboard lines are never saved');

// ── Engine: fed enemies ──
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js','js/plan.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine,P=ctx.DeadlockPlan,catalog=E.createCatalog(ctx.DeadlockCatalog,require('./fixtures/catalog-snapshot.json'));
const enemies=[{hero:'Haze',items:'Rapid Rounds, Extra Health',stats:st(9,1,2,31000)},{hero:'Vindicta',items:'Headshot Booster',stats:st(4,3,5,20000)},{hero:'Abrams',items:'',stats:st(2,4,6,18000)},{hero:'Seven',items:'Extra Spirit',stats:st(3,3,4,19000)},{hero:'Infernus',items:'',stats:st(1,5,3,16000)},{hero:'Paige',items:'',stats:st(0,4,9,15000)}];
const allies=[{hero:'Wraith',items:'',stats:st(3,3,3,19000)},{hero:'Kelvin',items:'',stats:st(1,4,8,17000)}];
const strip=list=>list.map(({stats,...x})=>x);
const mid={hero:'Shiv',souls:3000,owned:'Extra Health, Headshot Booster',enemies,allies};
const plain=E.recommend({...mid,enemies:strip(enemies),allies:strip(allies)},catalog,{clock:'22:10'});
const fedOut=E.recommend(mid,catalog,{clock:'22:10'});
test(fedOut.fed.length===1&&fedOut.fed[0].hero==='Haze'&&fedOut.fed[0].kills===9&&fedOut.fed[0].souls===31000&&fedOut.fed[0].weight===E.FED.max,'Haze (31k souls, 9/1) is fed; nobody else is');
const threat=(o,n)=>o.threats.find(t=>t.name===n)?.value||0;
test(threat(fedOut,'bullet')>threat(plain,'bullet')&&threat(fedOut,'spirit')===threat(plain,'spirit'),'a fed enemy\'s threats count for more; others\' are unchanged');
test(fedOut.plan.counters.slice(0,3).every(r=>r.fed.includes('Haze'))&&fedOut.plan.counters[0].score>plain.plan.counters.find(r=>r.name===fedOut.plan.counters[0].name).score,'the game plan\'s counters lean toward answering the fed enemy');
test(plain.fed.length===0&&JSON.stringify(plain.results.map(r=>r.name))===JSON.stringify(E.recommend({...mid,enemies:strip(enemies),allies:strip(allies)},catalog,{clock:'22:10'}).results.map(r=>r.name)),'manual lineups (no scoreboard) work as before');
const even=enemies.map(e=>({...e,stats:st(3,3,3,18000)}));
test(E.recommend({...mid,enemies:even},catalog,{clock:'22:10'}).fed.length===0,'an even game has nobody fed');
test(E.recommend(mid,catalog,{clock:'7:00'}).fed.length===0,'nobody counts as fed while laning (lane opponents already lead)');
test(E.fedWeights([{stats:st(9,1,0,30000)}],[{stats:st(0,0,0,10000)}],'mid').join()==='1','too few players on the scoreboard to compare: nobody is fed');
test(E.fedWeights([{stats:st(3,2,0,30000)},{stats:st(1,1,0,15000)},{stats:st(1,1,0,15000)},{stats:st(1,1,0,15000)}],[],'mid')[0]===1,'far ahead in souls but not two kills up: not fed');
test(E.fedWeights([{stats:st(5,1,0,5500)},{stats:st(0,1,0,2000)},{stats:st(0,1,0,2000)},{stats:st(0,1,0,2000)}],[],'mid')[0]===1,'under 6,000 souls: too early to call');

// ── Engine: the priority alert ──
const sb=(deathTimes,damage)=>({deathTimes,damage});
const deaths3=[16*60,19*60,21*60+50];
const dmg={total:5000,neutrals:0,sources:[{source:'haze',amount:2500},{source:'hornet',amount:1100},{source:'inferno',amount:300}],clock:'21:55'};
const a=E.recommend(mid,catalog,{clock:'22:10',scoreboard:sb(deaths3,dmg)}).alert;
test(a&&a.deaths===3&&a.since==='16:00'&&a.last===deaths3[2],'three deaths within 8 minutes raise the alert');
test(a.source==='damage'&&a.share===.72&&a.enemies.map(e=>e.hero+':'+e.share).join()==='Haze:0.5,Vindicta:0.22','the damage panel names who hurt you (internal names like hornet match Vindicta); 6% Infernus is left out');
test(a.tag==='bullet'&&a.label==='weapon damage'&&a.item.name==='Bullet Resilience'&&a.options.every(r=>(E.COUNTERS[r.id]?.bullet||0)>=E.ALERT.weight),'weapon damage: protection against it first');
test(!a.options.some(r=>['Extra Health','Headshot Booster'].includes(r.name)),'never something you own');
test(E.recommend(mid,catalog,{clock:'22:10',scoreboard:sb(deaths3.slice(1),dmg)}).alert===null,'two deaths: no alert');
test(E.recommend(mid,catalog,{clock:'27:00',scoreboard:sb(deaths3,dmg)}).alert===null,'deaths older than 8 minutes age out');
test(E.recommend(mid,catalog,{clock:'',scoreboard:sb(deaths3,dmg)}).alert===null&&E.recommend(mid,catalog,{clock:'22:10'}).alert===null,'no clock or no scoreboard (manual mode): no alert');
const oldDmg=E.recommend(mid,catalog,{clock:'22:10',scoreboard:sb(deaths3,{...dmg,clock:'12:00'})}).alert;
test(oldDmg.source==='fed'&&oldDmg.enemies.map(e=>e.hero).join()==='Haze'&&oldDmg.share===null,'a damage reading from before these deaths is ignored: the fed enemy is named instead');
const spiritDmg={...dmg,sources:[{source:'gigawatt',amount:3000},{source:'haze',amount:500}]};
const sp=E.recommend(mid,catalog,{clock:'22:10',scoreboard:sb(deaths3,spiritDmg)}).alert;
test(sp.enemies[0].hero==='Seven'&&sp.tag==='spirit'&&['Spirit Resilience','Spirit Shielding',"Enchanter's Emblem",'Spellbreaker','Witchmail'].includes(sp.item.name),'Seven (gigawatt) dealing most of it: spirit protection');
const teamAlert=E.recommend({...mid,enemies:even},catalog,{clock:'22:10',scoreboard:sb(deaths3,null)}).alert;
test(teamAlert.source==='team'&&teamAlert.enemies.length===0,'nobody fed, no damage reading: their team\'s damage type decides');
const laneState={hero:'Shiv',souls:500,owned:'',ownLane:1,enemies:[{hero:'Lash',items:'Extra Spirit',lane:1},{hero:'Seven',items:'',lane:1},{hero:'Haze',items:'',lane:4}]};
const la=E.recommend(laneState,catalog,{clock:'7:30',scoreboard:sb([200,330,440],null)}).alert;
test(la.source==='lane'&&la.enemies.map(e=>e.hero).join()==='Lash,Seven'&&la.tag==='spirit'&&la.item.effectiveCost<=E.LANING_SAVE_CAP,'while laning: your lane opponents, and protection you can save for (1,600 or less)');
const owned=E.recommend({...mid,owned:mid.owned+', Bullet Resilience'},catalog,{clock:'22:10',scoreboard:sb(deaths3,dmg)}).alert;
test(owned.item.name!=='Bullet Resilience'&&owned.tag==='bullet','already own it: the next protection');

// ── Plan: the alert takes over the next buy ──
const withAlert=E.recommend(mid,catalog,{clock:'22:10',scoreboard:sb(deaths3,dmg)});
const pA=P.makePlan(withAlert,null,[]);
test(pA.priority&&pA.next===pA.priority.item&&pA.next.name==='Bullet Resilience','the alert\'s item is the next buy');
test(![...pA.counters,...pA.gaps].some(r=>r.name===pA.next.name),'and shows only once');
const pNo=P.makePlan(fedOut,null,[]);
test(!pNo.priority&&pNo.next.name!==undefined,'no alert: the plan as before');
const pChanged=P.makePlan(withAlert,pNo,[]);
test(pChanged.changed&&pChanged.added.includes('Bullet Resilience'),'an alert counts as a plan change (highlighted, with "what changed")');
const pDismissed=P.makePlan(withAlert,pA,[],{dismissed:pA.priority.key});
test(!pDismissed.priority,'Dismiss hides it');
const fourth=E.recommend(mid,catalog,{clock:'22:40',scoreboard:sb([...deaths3,22*60+35],dmg)});
test(P.makePlan(fourth,pDismissed,[],{dismissed:pA.priority.key}).priority?.item.name==='Bullet Resilience','...until your next death');
// Held steady: a close rival doesn't swap the alert's item.
const rivals={...withAlert,alert:{...withAlert.alert,options:[{...withAlert.alert.options[1],score:withAlert.alert.item.score*1.1},withAlert.alert.item]}};
test(P.makePlan(rivals,pA,[]).priority.item.name==='Bullet Resilience','the alert\'s item holds steady against a close rival');
// Buying it answers the alert until your next death (no nagging for the next protection item).
const boughtOut=E.recommend({...mid,owned:mid.owned+', Bullet Resilience'},catalog,{clock:'22:20',scoreboard:sb(deaths3,dmg)});
const pBought=P.makePlan(boughtOut,pA,['Extra Health','Headshot Booster','Bullet Resilience']);
test(boughtOut.alert&&!pBought.priority&&pBought.answered===pA.priority.key,'buying the alert\'s item answers it, though the same deaths still count');
const pStill=P.makePlan(boughtOut,pBought,['Extra Health','Headshot Booster','Bullet Resilience']);
test(!pStill.priority,'...and it stays answered');
const again=E.recommend({...mid,owned:mid.owned+', Bullet Resilience'},catalog,{clock:'23:00',scoreboard:sb([...deaths3,22*60+50],dmg)});
test(P.makePlan(again,pStill,['Extra Health','Headshot Booster','Bullet Resilience']).priority?.item.name===again.alert.item.name&&again.alert.item.name!=='Bullet Resilience','another death: the next protection');
const pAfter=P.makePlan(fedOut,pA,[]);
test(!pAfter.priority&&pAfter.next.name,'once the deaths age out, the plan returns');
const laneOut=E.recommend(laneState,catalog,{clock:'7:30',scoreboard:sb([200,330,440],null)});
const pLane=P.makePlan(laneOut,null,[]);
test(pLane.stage==='lane'&&pLane.next===pLane.priority.item&&pLane.steps.length===3&&!pLane.steps.includes(pLane.next),'lane plan: the alert first, then the lane plan\'s steps');
test(P.thenList(pLane).join()===pLane.steps.slice(0,2).join(),'glance view\'s strip shows the lane steps after the alert\'s item');
test(P.alertKey(withAlert.alert)===String(withAlert.alert.last)&&P.alertKey(null)==='','an alert is keyed to your last death');

// ── Page wiring ──
const css=read('desktop.css'),html=read('index.html'),privacy=read('docs/privacy.html');
test(ui.includes("scoreboard:liveWasOn&&lastFeedSnapshot?{deathTimes:lastFeedSnapshot.deathTimes,damage:lastFeedSnapshot.damage}:null"),'live advice gets your deaths and the damage reading; manual mode gets neither');
test(ui.includes("plan.priority?alertCard(plan.priority):''")&&ui.includes("const eyebrow=plan.priority?'PRIORITY · NEXT BUY'"),'the alert card sits above the next buy, tagged Priority');
test(ui.includes('alertDismissed=e.currentTarget.dataset.alert;')&&ui.includes("alertDismissed='';lastFedNames='';}"),'Dismiss remembers this alert; a new match or source forgets it');
test(ui.includes("You've died ${a.deaths} times since ${a.since}.")&&ui.includes('% of the damage you took came from ${who}, mostly ${a.label}.')&&ui.includes('Open the in-game damage panel after a death to show who hurt you most.'),'the alert says how often you died, who hurt you and their damage type, and how to get a better reading');
test(ui.includes('planEvent=`You died ${plan.priority.deaths} times since ${plan.priority.since}`')&&ui.includes('planEvent=`${out.fed[0].hero} is fed`'),'the plan\'s "last change" names the deaths or the newly fed enemy');
test(ui.includes('const chip=fed?fedChip(out.fed):top?')&&ui.includes('Fed: <b>${escapeHTML(f.hero)}</b> · ${f.kills} kills · ${shortSouls(f.souls)} souls'),'the game plan shows "Fed: Haze · 9 kills · 31k souls" in place of the biggest threat');
test(ui.includes('${fedTag(e.hero)}${kdaLine(e.stats)}</strong>')&&ui.includes("${isFed(e.hero)?' isFed':''}")&&ui.includes("${s.kills}/${s.deaths}/${s.assists} · ${shortSouls(s.souls)}"),'live enemy rows show K/D/A and souls; fed enemies are tagged and outlined');
test(ui.includes('if(fedNow!==shownFed){shownFed=fedNow;renderGlanceTeam();if(document.body.classList.contains(\'liveMatch\'))renderLiveTeam();}'),'rows are redrawn when who is fed changes');
test(['.priorityAlert{','.alertDismiss{','.nextBuy.isPriority .quickItem{','.fedTag{','.liveRow.isFed,.glanceRow.isFed{','.liveKda{','body.glanceMode .priorityAlert{'].every(rule=>css.includes(rule)),'styles for the alert, the Fed tag and the scoreboard line, glance view included');
test(!/priorityAlert[^{]*\{[^}]*display:none/.test(css),'glance view keeps the alert');
test(privacy.includes('souls, kills, deaths and assists')&&privacy.includes('while you have the game’s damage panel open, how much damage you took from each enemy hero')&&privacy.includes('Neither are scoreboard numbers.'),'the Privacy Policy lists the scoreboard and damage data, and that it isn\'t saved');
test(html.includes('<script src="js/plan.js"></script>'),'the plan script is loaded');

console.log(`PASS: ${total} scoreboard and priority alert checks`);
}
