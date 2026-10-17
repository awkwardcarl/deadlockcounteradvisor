'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(fs.readFileSync(path.join(app,file),'utf8'),ctx);
const E=ctx.DeadlockEngine;
const catalog=E.createCatalog(ctx.DeadlockCatalog,null);
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}
const baseState={hero:'Kelvin',souls:1600,owned:'',enemies:[{hero:'Haze',items:'Rapid Rounds, Burst Fire'},{hero:'Lash',items:'Mystic Burst'}]};
let out=E.recommend(baseState,catalog);
test(out.quickBuys.length>0,'top quick purchases returned');
test(out.quickBuys.every(x=>x.name&&x.effectiveCost>=0),'all quick picks have explainable cost');
test(out.quickBuys.some(x=>x.affordable),'shop-now appears for affordable items');
test(out.quickBuys.some(x=>!x.affordable),'save-for appears if better longer-term option exists');
test(out.quality==='Starter catalog','honest incomplete catalog notice');
test(out.threats.every(x=>x.coverage<=2),'pressure coverage never exceeds enemy count');
test(out.results.every(x=>x.missing===Math.max(0,x.effectiveCost-1600)),'remaining souls based on payable price');
const crowd=E.recommend({...baseState,enemies:[{hero:'Lash',items:'Mystic Burst'}]},catalog);
const spam=E.recommend({...baseState,enemies:[{hero:'Lash',items:'Mystic Burst, Mystic Burst, Mystic Burst, Mystic Burst, Mystic Burst'}]},catalog);
const threat=name=>arr=>arr.threats.find(x=>x.name===name)?.value||0;
test(threat('spirit')(spam)<threat('spirit')(crowd)*2,'repeat item evidence saturates');
test(E.recommend(baseState,catalog,{strategy:'antiheal'}).results.every(x=>Number.isFinite(x.score)),'strategy never gives invalid scores');
test(E.recommend(baseState,catalog,{strategy:'escape'}).results.length>0,'control escape setting works');
test(!E.recommend({...baseState,owned:'Reactive Barrier'},catalog).results.some(x=>x.name==='Reactive Barrier'),'owned exclusions preserved');
const cat2={...catalog,complete:true,items:[
  {id:'upgrade_bullet_armor',name:'Bullet Armor',cost:1600,category:'vitality',components:[]},
  {id:'upgrade_improved_bullet_armor',name:'Improved Bullet Armor',cost:3200,category:'vitality',components:['upgrade_bullet_armor']},
  {id:'upgrade_healbane',name:'Healbane',cost:1600,category:'spirit',components:[]}
]};
let upgrade=E.recommend({...baseState,owned:'Bullet Armor',souls:1700},cat2).results.find(x=>x.name==='Improved Bullet Armor');
test(!!upgrade,'component upgrade eligible');
test(upgrade.upgradeFrom==='Bullet Armor' && upgrade.effectiveCost===1600,'owned component credited');
test(upgrade.affordable===true,'discount affects affordability');
upgrade=E.recommend({...baseState,owned:'',souls:1700},cat2).results.find(x=>x.name==='Improved Bullet Armor');
test(upgrade.effectiveCost===3200&&!upgrade.affordable,'no fictitious upgrade credit');
const badCatalog={...cat2,items:[{id:'unreviewed',name:'Unreviewed Item',cost:800,category:'spirit'}]};
test(E.recommend(baseState,badCatalog).results.length===0,'no invented counter data for arbitrary items');
test(E.recommend({...baseState,enemies:[{hero:'Nurse Harrow'}]},catalog).unknown.some(x=>x.includes('No reviewed combat profile')),'new unreleased kit remains unverified');
for(const key of ['strategyMode','quickBuys','evidenceQuality','showAllResults'])test(fs.readFileSync(path.join(app,'index.html'),'utf8').includes(`id="${key}"`),`UI contains ${key}`);
const main=fs.readFileSync(path.join(app,'desktop/main.cjs'),'utf8');
test(!main.includes('overwolf-gep-adapter')&&!main.includes('overwolf.games.events'),'approval-gated adapter not wired to production');
test(!fs.readFileSync(path.join(app,'desktop/preload.cjs'),'utf8').includes('OverwolfGepAdapter'),'renderer cannot activate Overwolf adapter');
console.log(`PASS: ${total} v0.6 ranking / UX / safety regression checks`);
