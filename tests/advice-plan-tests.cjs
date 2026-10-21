'use strict';
// The buy plan: one next buy, a lane plan while laning, a game plan after,
// ranked by score (never by the souls you hold this second) and kept steady:
// a pick changes only when bought, no longer fitting, or clearly beaten.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js','js/plan.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine,P=ctx.DeadlockPlan,snapshot=require('./fixtures/catalog-snapshot.json');
const catalog=E.createCatalog(ctx.DeadlockCatalog,snapshot);
const names=list=>list.map(r=>r.name).join();
const enemies=[{hero:'Haze',items:'Rapid Rounds',lane:1},{hero:'Vindicta',items:'Headshot Booster',lane:1},{hero:'Abrams',items:'',lane:4},{hero:'Seven',items:'Extra Spirit',lane:4},{hero:'Infernus',items:'',lane:6},{hero:'Paige',items:'',lane:6}];
const lane=souls=>E.recommend({hero:'Shiv',souls,owned:'Extra Health',ownLane:1,enemies},catalog,{clock:'6:40'});
const late=enemies.map(e=>({...e,items:e.items+', Extra Health, Bullet Lifesteal'}));
const game=(souls,extra={})=>E.recommend({hero:'Shiv',souls,owned:'Extra Health, Headshot Booster, Rapid Rounds, High-Velocity Rounds',enemies:late,...extra},catalog,{clock:'22:10'});

// Engine: the plan pool.
const l400=lane(400),l2600=lane(2600);
test(l400.plan.stage==='lane'&&game(2000).plan.stage==='game','the plan is a lane plan while laning, a game plan after');
test(names(l400.plan.pool)===names(l2600.plan.pool)&&names(game(800).plan.pool)===names(game(5000).plan.pool),'the pool does not depend on the souls you hold');
test(l400.plan.pool.every((r,i,a)=>i===0||a[i-1].hardCounter||a[i-1].score>=r.score),'ranked by score (a hard counter first while laning)');
test(l400.plan.pool.every(r=>r.hardCounter||r.effectiveCost<=E.OPENING_SAVE_CAP),'during the opening buys the pool keeps to 800-soul items (hard counters aside)');
test(l400.plan.pool.filter(r=>r.kind!=='build').every(r=>r.counters.some(h=>h==='Haze'||h==='Vindicta')),'while laning, counters in the plan answer someone in your lane');
const g=game(3000).plan;
test(g.counters.every(r=>r.kind!=='build')&&g.builds.every(r=>r.kind==='build')&&g.gaps.every(r=>r.gap||(r.team||[]).some(n=>n.up)),'game plan lists: counters, builds, and team gaps (durability or a team note)');
test(g.counters.length>0&&g.builds.length>0,'builds keep their own list, so counters never crowd them out');
test(Array.isArray(game(800).quickBuys)&&game(800).quickBuys.length===3,'the three quick picks stay in the engine output (debrief and older callers)');

// Plan module: steady picks.
const r=(name,score,extra={})=>({name,score,...extra});
const ranked=[r('A',10),r('B',9),r('C',8),r('D',7)];
const sorted=list=>list.sort((a,b)=>b.score-a.score);
test(names(P.steady([],ranked,3))==='A,B,C','no previous plan: the top of the ranking');
test(names(P.steady(['C','D'],[r('A',10),r('B',9.5),r('C',9),r('D',8.5)],3))==='C,D,A','previous picks stay, in their order, while nothing clearly beats them');
test(names(P.steady(['A','B','C'],sorted([r('X',9.5),r('A',10),r('B',9),r('C',8)]),3))==='A,B,C','a newcomer under 1.2x the weakest pick (9.5 vs 8) does not get in');
test(names(P.steady(['A','B','C'],sorted([r('X',9.7),r('A',10),r('B',9),r('C',8)]),3))==='A,B,X','a newcomer at 1.2x or more (9.7 vs 8) replaces the weakest pick in place');
test(names(P.steady(['A','B','C'],ranked.filter(x=>x.name!=='A'),3))==='B,C,D','a bought pick drops out and the next one moves up');
test(names(P.steady(['B','C','D'],[r('H',5,{hardCounter:true}),...ranked],3))==='H,B,C','a hard counter always gets in, first');
test(names(P.steady(['A'],ranked,2,new Set(['A'])))==='B,C','excluded items never show twice');

// makePlan: lane plan.
const pLane=P.makePlan(lane(400),null,['Extra Health']);
test(pLane.stage==='lane'&&pLane.steps.length===3&&pLane.next===pLane.steps[0],'lane plan: three steps; the next buy is the first');
test(pLane.done.join()==='Extra Health'&&P.makePlan(lane(400),null,['A','B','C']).done.join()==='B,C','bought items show as done steps (the last two)');
let prev=pLane;
for(const souls of [900,1500,2600]){const pl=P.makePlan(lane(souls),prev,['Extra Health']);test(names(pl.steps)===names(pLane.steps)&&!pl.changed,`earning souls (${souls}) leaves the lane plan alone`);prev=pl;}
// A quiet lane (no purchases yet, so no hard counter): buying the next item moves the plan up a step.
const quiet=enemies.map(e=>({...e,items:''}));
const pQuiet=P.makePlan(E.recommend({hero:'Shiv',souls:400,owned:'Extra Health',ownLane:1,enemies:quiet},catalog,{clock:'6:40'}),null,['Extra Health']);
const boughtNext=E.recommend({hero:'Shiv',souls:900,owned:'Extra Health, '+pQuiet.next.name,ownLane:1,enemies:quiet},catalog,{clock:'7:10'});
const pAfter=P.makePlan(boughtNext,pQuiet,['Extra Health',pQuiet.next.name]);
test(!pQuiet.next.hardCounter&&pAfter.next.name===pQuiet.steps[1].name&&pAfter.steps[1].name===pQuiet.steps[2].name&&!pAfter.steps.some(x=>x.name===pQuiet.next.name),'buying the next item moves the plan to the next step');
test(pAfter.done.includes(pQuiet.next.name),'the bought item shows as done');
// A lane opponent's purchases can raise a hard counter, which always goes first.
const pPush=P.makePlan(E.recommend({hero:'Shiv',souls:900,owned:'Extra Health, Rusted Barrel',ownLane:1,enemies},catalog,{clock:'7:10'}),pLane,['Extra Health','Rusted Barrel']);
test(pPush.next.hardCounter&&pPush.steps[0]===pPush.next,'a new hard counter for your lane takes the next step');

// makePlan: game plan.
const pGame=P.makePlan(game(3000),null,[]);
const shown=[...pGame.counters,...pGame.gaps];
test(pGame.stage==='game'&&pGame.counters.length===2&&pGame.gaps.length===2&&new Set(shown.map(x=>x.name)).size===4,'game plan: two counters and two gaps, never the same item twice');
test(shown.includes(pGame.next)&&shown.every(x=>x.score<=pGame.next.score||x===pGame.next),'the next buy is the strongest of those');
test(pGame.gapsAreBuilds===true,'no allies reported: the second list builds on your items instead');
const allies=[{hero:'Wraith',items:'Extra Spirit, Mystic Burst',inventoryKnown:true},{hero:'Seven',items:'Extra Spirit',inventoryKnown:true},{hero:'Kelvin',items:'',inventoryKnown:true}];
const withAllies=P.makePlan(game(3000,{allies}),null,[]);
test(withAllies.gaps.length===0||withAllies.gaps.every(x=>x.gap||(x.team||[]).some(n=>n.up))||withAllies.gapsAreBuilds,'with allies, the second list covers team gaps (or builds when there are none)');
let gp=pGame;
for(const souls of [800,5000,9000]){const pl=P.makePlan(game(souls),gp,[]);test(pl.next.name===pGame.next.name&&names(pl.counters)===names(pGame.counters)&&!pl.changed,`earning souls (${souls}) leaves the game plan alone`);gp=pl;}
test(P.makePlan(game(3000),pLane,[]).changed===false,'moving from lane plan to game plan is a fresh start, not a "change"');
test(P.makePlan({plan:{stage:'game',pool:[],counters:[],gaps:[],builds:[]}},null,[])===null&&P.makePlan(null,null,[])===null,'no candidates: no plan');
test(P.thenList(pGame).length===3&&!P.thenList(pGame).includes(pGame.next)&&names(P.thenList(pLane))===names(pLane.steps.slice(1,3)),'glance view\'s strip: the next few buys after the next one');

// Page wiring.
const html=read('index.html'),ui=read('js/ui.js'),css=read('desktop.css');
test(html.indexOf('<script src="js/plan.js"></script>')>html.indexOf('<script src="js/engine.js"></script>')&&html.indexOf('<script src="js/plan.js"></script>')<html.indexOf('<script src="js/ui.js"></script>'),'plan.js loads after the engine and before the page script');
test(html.includes('<div class="overline">BUY PLAN</div><h3>What to buy next</h3>')&&html.includes('<div id="quickBuys" class="advicePlan" aria-live="polite"></div>'),'the picks area is now the buy plan');
test(ui.includes('const plan=PLAN.makePlan(out,lastPlan,engine.cleanList(state.owned),{dismissed:alertDismissed});')&&ui.includes(' renderPlan(out);'),'the page keeps the previous plan to hold picks steady');
test(ui.includes("const eyebrow=plan.priority?'PRIORITY · NEXT BUY':lane?`NEXT BUY · STEP ${plan.done.length+1} OF YOUR LANE PLAN`:'NEXT BUY';")&&ui.includes("quickCard(plan.next,0,eyebrow)")&&ui.includes('function quickCard(r,i,eyebrow){'),'the next buy reuses the pick card, labeled as the next buy');
test(ui.includes('lastPickNames=[];resetPlan();')&&ui.includes("if(live&&!document.body.classList.contains('liveMatch'))resetPlan();")&&ui.includes('if(!prev||prev.matchId!==match.matchId)resetPlan();'),'fresh plan after a catalog load, on entering the live view, and for a new source or match');
test(ui.includes("if(lastName)planEvent=`${e.hero||'An enemy'} bought ${lastName}`;")&&ui.includes("if(bought)planEvent='You bought '+bought;"),'what changed the plan is named: an enemy\'s purchase or yours');
test(ui.includes("planChange={clock:lastFeedSnapshot?.clock||'',why:planEvent||'match updated'};")&&ui.includes("planChange&&document.body.classList.contains('liveMatch')"),'the change note shows in the live view');
test(ui.includes("document.querySelectorAll('#quickBuys .quickChanged').forEach(el=>{if((pickHighlights.get(el.dataset.pick)||0)<=now)el.classList.remove('quickChanged');});"),'change highlights fade by item, not card position');
test(css.includes('body.glanceMode .planCard,body.glanceMode .planTeaser{display:none}')&&css.includes('body.glanceMode .glanceThen{display:block}')&&css.includes('.glanceThen{display:none}'),'glance view: the next buy and one strip; plan cards stay on the main page');
test(css.includes('.nextBuy .quickItem{display:grid;grid-template-columns:minmax(0,1fr) auto;'),'the next buy is one wide card');

console.log(`PASS: ${total} buy plan checks`);
