'use strict';
// Team-aware picks: allies from the live roster (no player names), carried into
// the match state but never saved, and the team signals that nudge the picks
// (anti-heal, damage mix against enemy resist, durability).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

// Live roster: allies are your team minus you, with hero, ID, lane and items only.
const {EventState}=require('../live/event-state.cjs');
const info=(key,data)=>({feature:'match_info',key,value:JSON.stringify(data)});
const feed=[
 info('roster_0',{player_name:'Me',hero_name:'KELVIN',hero_id:12,team_name:'Amber',is_local:true,assigned_lane:4,souls:3000}),
 info('roster_1',{player_name:'FriendOne',hero_name:'ABRAMS',hero_id:6,team_name:'Amber',assigned_lane:4}),
 info('roster_2',{player_name:'FriendTwo',hero_name:'HAZE',hero_id:13,team_name:'Amber',assigned_lane:1}),
 info('roster_3',{player_name:'FriendThree',hero_name:'',hero_id:7,team_name:'Amber'}),
 info('roster_6',{player_name:'EnemyOne',hero_name:'SHIV',hero_id:19,team_name:'Sapphire',assigned_lane:4}),
 info('items_1',{player_name:'FriendOne',items:[{name:'Healbane',class_name:'upgrade_healbane'},{name:'Shoulder Charge',class_name:'ability_charge'}]}),
 info('items_2',{player_name:'FriendTwo',items:[]})
];
const open=new EventState();for(const u of feed)open.apply(u);
const snap=open.snapshot();
test(snap.allies.length===2&&snap.allies.map(a=>a.hero).join()==='ABRAMS,HAZE'&&snap.allies[0].heroId===6&&snap.allies[0].lane===4&&snap.allies[1].lane===1,'allies: same team, not you, heroes with IDs and lanes (no hero yet: left out)');
test(snap.allies[0].items==='Healbane'&&snap.allies[0].itemIds.join()==='upgrade_healbane'&&snap.allies[0].inventoryKnown&&snap.allies[1].inventoryKnown&&snap.allies[1].items==='','allied shop items and class names; an empty inventory is known');
test(snap.allies.every(a=>!('name' in a))&&!/Friend/.test(JSON.stringify(snap.allies)),'allies never carry player names');
test(snap.enemies.length===1&&snap.enemies[0].hero==='SHIV','enemies unchanged');
const held=new EventState({withholdEnemyItems:true});for(const u of feed)held.apply(u);
test(held.snapshot().allies.every(a=>a.items===''&&!a.inventoryKnown&&!a.itemIds.length)&&held.snapshot().allies.length===2,'allied purchases follow the enemy-items switch');
const noLocal=new EventState();for(const u of feed.slice(1))noLocal.apply(u);
test(noLocal.snapshot().allies.length===0,'no local player: no allies');
const many=new EventState();
many.apply(info('roster_0',{player_name:'Me',hero_name:'Kelvin',team_name:'Amber',is_local:true}));
for(let i=1;i<=7;i++)many.apply(info('roster_'+i,{player_name:'P'+i,hero_name:'Haze',team_name:'Amber'}));
test(many.snapshot().allies.length===5,'at most five allies');

// Live merge: allies land in state.allies, resolved, and are replaced as they change.
const mctx=vm.createContext({});vm.runInContext(read('js/live-merge.js'),mctx);
const merge=mctx.DeadlockLiveMerge.mergeFeedSnapshot;
const live={...snap,phase:'in-progress'};
const st={hero:'',souls:0,owned:'',enemies:[]};
merge(st,null,live,(n)=>n.charAt(0)+n.slice(1).toLowerCase(),x=>x);
test(st.allies.length===2&&st.allies[0].hero==='Abrams'&&st.allies[0].items==='Healbane'&&st.allies[0].lane===4&&st.allies[0].inventoryKnown===true,'allies merged into state (hero names resolved)');
test(st.allies.every(a=>Object.keys(a).sort().join()==='hero,inventoryKnown,items,lane'),'state allies: hero, items, lane, inventoryKnown only');
const bought={...live,allies:live.allies.map((a,i)=>i===1?{...a,items:'Rapid Rounds',itemIds:['upgrade_rapid_rounds']}:a)};
let r=merge(st,live,bought,x=>x,x=>x);
test(r.changed&&st.allies[1].items==='Rapid Rounds','an ally purchase updates the allies');
r=merge(st,bought,{...bought,clock:'5:00'},x=>x,x=>x);
test(st.allies[1].items==='Rapid Rounds','unchanged allies stay');
st.allies=[];merge(st,bought,{...bought,clock:'5:01'},x=>x,x=>x);
test(st.allies.length===2,'allies come back after Reset match (they are not edited by hand)');
r=merge(st,bought,{...bought,phase:'ended',enemies:[],allies:[]});
test(r.ended&&st.allies.length===0,'match end clears the allies');
const older={hero:'',souls:0,owned:'',enemies:[],allies:[{hero:'Stale'}]};
merge(older,null,{matchId:'M',phase:'in-progress',ownHero:'Kelvin',souls:0,enemies:[{name:'E',hero:'Haze',items:''}],ownItems:null});
test(older.allies.length===0,'a source without allies (replay import, older feed) leaves none');

// Never saved: persist() keeps the enemy lineup only; each launch starts without allies.
const ui=read('js/ui.js');
test(/function persist\(\)\{try\{localStorage\.setItem\(STORE,JSON\.stringify\(\{enemies:state\.enemies\.map\(\(\{feedName,\.\.\.row\}\)=>row\)\}\)\);\}catch\(_\)\{\}\}/.test(ui),'persist() saves only the enemy lineup');
test(ui.includes("const defaultState=()=>({hero:'Kelvin',souls:0,owned:'',liveMatchId:'',enemies:[],allies:[]});")&&!/saved\.allies/.test(ui)&&ui.includes("owned:'Extra Spirit, Extra Stamina',allies:[]"),'fresh state and the example match start with no allies; saved data is never read for allies');

// Engine.
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine,snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(ctx.DeadlockCatalog,snapshot),byId=new Map(snapshot.items.map(i=>[i.id,i]));
test(Object.entries(E.ANTI_HEAL).every(([id,name])=>byId.get(id)?.name===name&&E.COUNTERS[id]?.sustain>=1.4),'anti-heal items exist in the shop and are curated sustain answers');
test(['weapon','spirit'].every(k=>Object.entries({...E.RESIST[k].protect,...E.RESIST[k].shred}).every(([id,name])=>byId.get(id)?.name===name)),'resist protection and shred item IDs match their shop names');
test(Object.keys(E.RESIST.weapon.protect).every(id=>byId.get(id).category==='vitality')&&!E.RESIST.weapon.protect.upgrade_withering_whip,'bullet protection: vitality items, not shooter debuffs');

const sustainEnemies=[{hero:'Abrams',items:'Bullet Lifesteal, Metal Skin'},{hero:'Shiv',items:'Leech, Bullet Resilience'},{hero:'Seven',items:'Mystic Burst'},{hero:'Haze',items:'Rapid Rounds'}];
const weaponAllies=[{hero:'Vindicta',items:'Headshot Booster, Long Range',inventoryKnown:true},{hero:'Mirage',items:'Rapid Rounds',inventoryKnown:true},{hero:'Grey Talon',items:'',inventoryKnown:true},{hero:'Holliday',items:'',inventoryKnown:true},{hero:'Ivy',items:'',inventoryKnown:true}];
const kelvin={hero:'Kelvin',souls:3500,owned:'Extra Spirit, Mystic Burst',enemies:sustainEnemies};
const pick=(out,name)=>out.quickBuys.find(x=>x.name===name);
const any=(out,name)=>[...out.results,...out.buildPicks].find(x=>x.name===name);

// No allies (manual entry): nothing changes.
const solo=E.recommend(kelvin,catalog,{clock:'18:00'}),soloEmpty=E.recommend({...kelvin,allies:[]},catalog,{clock:'18:00'});
test(solo.team.allies.length===0&&!solo.team.signals.length&&JSON.stringify(solo.quickBuys)===JSON.stringify(soloEmpty.quickBuys)&&solo.quickBuys.every(x=>!x.team),'without allies the picks are exactly as before');
test(Array.isArray(E.recommend({hero:'Kelvin',enemies:[],allies:weaponAllies},catalog).team.signals),'empty lineup still reports a team shape');

// Anti-heal: nobody on the team has it, enemies sustain.
const team=E.recommend({...kelvin,allies:weaponAllies},catalog,{clock:'18:00'});
test(team.team.allies.join()==='Vindicta,Mirage,Grey Talon,Holliday,Ivy'&&team.team.signals.some(x=>x.key==='antiheal'&&x.label==='Your team has no anti-heal'&&x.up),'signal: your team has no anti-heal');
test(pick(team,'Healbane').team[0].text==='Your team has no anti-heal'&&pick(team,'Healbane').score>pick(solo,'Healbane').score*1.3&&pick(team,'Healbane').evidence.includes('Your team'),'the best anti-heal item for you rises and says why');
test([...team.results].filter(x=>x.team?.some(n=>/anti-heal/.test(n.text))).length===1,'only one anti-heal item is lifted: one covers the team');
const unknownInv=E.recommend({...kelvin,allies:weaponAllies.map(a=>({hero:a.hero,items:'',inventoryKnown:false}))},catalog,{clock:'18:00'});
test(!unknownInv.team.signals.some(x=>x.key==='antiheal')&&!any(unknownInv,'Healbane').team,'allied inventories unknown: no claim about anti-heal');
// An ally already has it: your anti-heal matters less.
const wraith={hero:'Wraith',souls:3500,owned:'Rapid Rounds, Extended Magazine, Headshot Booster, Extra Health',enemies:sustainEnemies};
const wraithSolo=E.recommend(wraith,catalog,{clock:'18:00'});
const covered=E.recommend({...wraith,allies:[{hero:'McGinnis',items:'Healbane, Extra Health',inventoryKnown:true},...weaponAllies.slice(1)]},catalog,{clock:'18:00'});
test(pick(wraithSolo,'Healbane')&&!pick(covered,'Healbane')&&covered.team.signals.some(x=>x.label==='McGinnis already has anti-heal'&&!x.up),'before: Healbane is a pick; after an ally buys it: dropped');
const lowered=any(covered,'Healbane');
test(lowered.team[0].text==='McGinnis already has anti-heal'&&!lowered.team[0].up&&lowered.score<pick(wraithSolo,'Healbane').score,'a lowered pick says so');
test(!E.recommend({...wraith,enemies:[{hero:'Haze',items:'Rapid Rounds'},{hero:'Wraith',items:''}],allies:weaponAllies},catalog,{clock:'18:00'}).team.signals.some(x=>x.key==='antiheal'),'no anti-heal signal without enemy sustain');

// Damage mix: spirit-heavy team against spirit resist -> resist shred and weapon damage.
const spiritEnemies=[{hero:'Abrams',items:"Spirit Resilience, Enchanter's Emblem"},{hero:'Warden',items:'Spirit Shielding'},{hero:'Haze',items:'Rapid Rounds'},{hero:'Vindicta',items:'Headshot Booster'}];
const spiritAllies=[{hero:'Seven',items:'Mystic Burst, Improved Spirit',inventoryKnown:true},{hero:'Infernus',items:'Extra Spirit',inventoryKnown:true},{hero:'Dynamo',items:'',inventoryKnown:true},{hero:'Lady Geist',items:'',inventoryKnown:true},{hero:'Pocket',items:'',inventoryKnown:true}];
const bebop={hero:'Bebop',souls:3000,owned:'Extra Spirit, Spirit Strike',enemies:spiritEnemies};
const bebopSolo=E.recommend(bebop,catalog,{clock:'16:00'}),bebopTeam=E.recommend({...bebop,allies:spiritAllies},catalog,{clock:'16:00'});
test(bebopTeam.team.lean==='spirit'&&bebopTeam.team.weaponShare===0&&bebopTeam.team.signals.some(x=>x.key==='mix'&&x.label==='Spirit-heavy team; 2 enemies bought spirit resist'),'signal: spirit-heavy team, two enemies with spirit resist');
test(!pick(bebopSolo,'Mystic Vulnerability')&&pick(bebopTeam,'Mystic Vulnerability')?.team[0].text==='Shreds spirit resist (2 enemies)','before: no shred pick; after: Mystic Vulnerability is a pick');
test(bebopTeam.buildPicks.filter(x=>x.category==='weapon').every(x=>x.team?.[0].text==='Weapon for your spirit-heavy team'),'weapon items carry the damage-mix note');
const oneDefender=E.recommend({...bebop,enemies:[spiritEnemies[1],...spiritEnemies.slice(2)],allies:spiritAllies},catalog,{clock:'16:00'});
test(!oneDefender.team.signals.some(x=>x.key==='mix'),'one enemy with spirit resist is not "stacking"');
const mixedAllies=[spiritAllies[0],weaponAllies[0],spiritAllies[1],weaponAllies[1],spiritAllies[2]];
test(E.recommend({...bebop,allies:mixedAllies},catalog,{clock:'16:00'}).team.lean===null,'a mixed team has no damage lean');
// Weapon-heavy team against bullet resist: a spirit hero's spirit items and Bullet Resist Shredder rise.
test(team.team.lean==='weapon'&&any(team,'Bullet Resist Shredder')?.team[0].text==='Shreds bullet resist (2 enemies)'&&pick(team,'Surge of Power').team[0].text==='Spirit for your weapon-heavy team'&&pick(team,'Surge of Power').score>pick(solo,'Surge of Power').score,'weapon-heavy team vs bullet resist: shred and spirit damage rise');
// Purchases outweigh hero tags once someone has spent enough.
const tagWeapon=[{hero:'Grey Talon',items:'Mystic Burst, Improved Spirit, Extra Spirit',inventoryKnown:true},{hero:'Wraith',items:'',inventoryKnown:true},{hero:'Mirage',items:'',inventoryKnown:true}];
test(Math.abs(E.recommend({...bebop,owned:'',allies:tagWeapon},catalog,{clock:'16:00'}).team.weaponShare-.5)<.01,'an ally\'s own spending sets their damage type (spirit Grey Talon)');

// Durability: no durable ally -> durable build items rise (counters do not).
test(team.team.signals.some(x=>x.key==='durability')&&pick(team,'Fortitude')?.team[0].text==='Your team is short on durability'&&pick(team,'Fortitude').score>pick(solo,'Fortitude').score,'signal: short on durability; durable build items rise');
test(team.results.every(x=>!x.team?.some(n=>/durability|-heavy team$/.test(n.text))),'durability and damage-mix notes skip counters, which already answer threats');
test(!covered.team.signals.some(x=>x.key==='durability'),'a durable ally (McGinnis) means no durability signal');
test(!E.recommend({...kelvin,allies:weaponAllies.slice(0,2)},catalog,{clock:'18:00'}).team.signals.some(x=>x.key==='durability'),'needs at least three allies before calling the team fragile');

// Team signals weigh more as the match goes on.
// (Measured on the anti-heal item that gets lifted: Inhibitor late, as tier 4 fits then.)
const lift=clock=>{const a=E.recommend({...kelvin,allies:weaponAllies},catalog,{clock}),b=E.recommend(kelvin,catalog,{clock});const r=a.results.find(x=>x.team?.some(n=>n.text==='Your team has no anti-heal'));return r.score/b.results.find(x=>x.id===r.id).score;};
const [early,mid,late]=['05:00','18:00','30:00'].map(lift);
test(early>1&&early<mid&&mid<late&&E.TEAM_PHASE.laning<E.TEAM_PHASE.mid&&E.TEAM_PHASE.mid<E.TEAM_PHASE.late,'team signals count less while laning and more late');

// UI: a team line on pick cards (one line), team notes on result cards, a team panel under the threats.
const html=read('index.html'),css=read('desktop.css');
const quick=ui.slice(ui.indexOf('function quickCard'),ui.indexOf('const SCORING_NOTE'));
test(quick.includes('`<p class="quickReason">${escapeHTML(reason)}${teamLine(r)}</p>`')&&ui.includes('<span class="teamTag">Team</span>')&&ui.includes("first.up?'':' teamDown'"),'pick cards show the team reason under the main reason, marked when it lowered the pick');
test(/\.quickTeam\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/.test(css),'the team line stays on one line, so card heights barely change');
test(ui.includes('`<p class="teamNote">Your team: ${r.team.map(n=>escapeHTML(n.text)).join(\' · \')}</p>`'),'result cards list every team note');
const why=html.slice(html.indexOf('class="whySection"'),html.indexOf('class="allHeading"'));
test(/id="teamInsight"[^>]*hidden/.test(why)&&why.indexOf('id="threats"')<why.indexOf('id="teamInsight"'),'team panel sits under the threats, hidden without allies');
test(ui.includes("$('teamInsight').hidden=!out.team?.allies?.length;")&&ui.includes('YOUR TEAM · '),'team panel lists the allies and active signals');
const strip=html.slice(html.indexOf('id="liveStrip"'),html.indexOf('</div>',html.indexOf('id="liveStrip"')));
test(!/team|all(y|ies)/i.test(strip),'live status strip unchanged');
// No new network request: team signals use the roster only.
test(!fs.readdirSync(path.join(root,'desktop')).some(f=>/hero-synergy/.test(read('desktop/'+f)))&&!/hero-synergy/.test(read('js/engine.js')+read('js/ui.js')),'no hero-synergy request (pair win rates do not inform item picks)');
test(read('docs/privacy.html').includes('Teammates’ heroes and items are not saved.'),'privacy policy covers teammate data');

console.log(`PASS: ${total} team-aware pick checks`);
