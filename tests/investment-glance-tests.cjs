'use strict';
// Investment bonuses: the game's tables (hero data cost_bonuses) kept with the
// hero list, the bonuses shown in the status strip, picks that know the bonus
// steps (the 4,800 spike), and enemy purchases in glance view.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

// The game's table as deadlock-api sends it.
const TABLE={
 weapon:[[800,9],[1600,12],[2400,15],[3200,18],[4800,46],[6400,54],[8000,62],[11200,74],[16000,86],[22400,100],[28800,115]],
 vitality:[[800,9],[1600,12],[2400,15],[3200,20],[4800,38],[6400,42],[8000,46],[11200,50],[16000,54],[22400,60],[28800,66]],
 spirit:[[800,7],[1600,11],[2400,15],[3200,19],[4800,38],[6400,45],[8000,52],[11200,59],[16000,66],[22400,75],[28800,100]]
};
const raw=t=>Object.fromEntries(Object.entries(t).map(([c,steps])=>[c,steps.map(([at,b])=>({gold_threshold:at,bonus:b,percent_on_graph:at/288}))]));

// Compaction: numbers only, sorted, all three categories or nothing.
const {compactAssets,compactInvestment}=require('../desktop/match-normalizer.cjs');
test(JSON.stringify(compactInvestment(raw(TABLE)))===JSON.stringify(TABLE),'cost_bonuses compact to [souls, bonus] steps per category');
const messy=raw(TABLE);messy.weapon=[...messy.weapon].reverse().concat([{gold_threshold:-5,bonus:3},{gold_threshold:'x',bonus:1},{gold_threshold:900000,bonus:2},{gold_threshold:500,bonus:5000},null]);
test(JSON.stringify(compactInvestment(messy).weapon)===JSON.stringify(TABLE.weapon),'steps are sorted; negative, non-numeric and out-of-range steps are dropped');
test(compactInvestment({weapon:raw(TABLE).weapon,spirit:raw(TABLE).spirit})===null&&compactInvestment(null)===null&&compactInvestment({weapon:'x',vitality:[],spirit:{}})===null,'a missing category: no table');
const odd=JSON.parse(JSON.stringify(TABLE));odd.spirit[4][1]=40;
const heroesRaw=[{id:1,name:'Infernus',cost_bonuses:raw(TABLE)},{id:2,name:'Seven',cost_bonuses:raw(TABLE)},{id:3,name:'Vindicta',cost_bonuses:raw(odd)},{id:4,name:'Haze'},{name:'No ID',cost_bonuses:raw(odd)}];
const assets=compactAssets([],heroesRaw);
test(JSON.stringify(assets.investment.default)===JSON.stringify(TABLE)&&Object.keys(assets.investment.heroes).join()==='3'&&assets.investment.heroes[3].spirit[4][1]===40,'the shared table is kept once; a hero whose table differs is kept separately');
test(!JSON.stringify(assets.investment).includes('percent_on_graph')&&!JSON.stringify(assets.investment).includes('Vindicta'),'only souls and bonuses are kept');
const none=compactAssets([],[{id:1,name:'Infernus'}]);
test('investment' in none&&none.investment===null,'no tables in the hero list: investment is null (the key marks a list saved by this version)');

// Hand-off to the catalog.
const {addFallbackHeroNames}=require('../desktop/data-service.cjs');
const snapshot=require('./fixtures/catalog-snapshot.json');
test(addFallbackHeroNames(snapshot,assets).investment===assets.investment&&addFallbackHeroNames(snapshot,none).investment===null&&addFallbackHeroNames(snapshot,null).investment===null,'the catalog carries the tables when the hero list has them');
const main=read('desktop/main.cjs');
const {isStale}=require('../desktop/game-data.cjs');
const fresh={syncedAt:new Date().toISOString()},{investment:_,...oldList}={...assets,fetchedAt:Date.now()};
test(isStale(fresh,oldList)&&!isStale(fresh,{...assets,fetchedAt:Date.now()})&&main.includes('setTimeout(()=>void gameData.start(),3000);'),'a hero list saved before this version is refreshed by the launch sync, in the background');
test(/catalog:get[^]{0,300}return gameData\.current\(\);/.test(main)&&!/catalog:get[^]{0,300}await/.test(main),'catalog loading never waits on the network');

// Engine.
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine;
test(JSON.stringify(E.DEFAULT_INVESTMENT)===JSON.stringify(TABLE),'built-in table matches the game data (October 2026)');
const builtIn=E.createCatalog(ctx.DeadlockCatalog,snapshot);
const synced=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,investment:assets.investment});
test(builtIn.investment===null&&JSON.stringify(synced.investment.default)===JSON.stringify(TABLE)&&synced.investment.heroes[3],'a synced catalog keeps the game\'s tables');
const bad=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,investment:{default:{weapon:[[800,'x']],vitality:[],spirit:[]},heroes:{}}});
const badHero=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,investment:{default:TABLE,heroes:{'3':{weapon:[]},'../x':TABLE}}});
test(bad.investment===null&&Object.keys(badHero.investment.heroes).length===0,'malformed tables are ignored');

const enemies=[{hero:'Abrams',items:'Extra Health'},{hero:'Haze',items:'Rapid Rounds'}];
const weapon3200='Headshot Booster, Rapid Rounds, Extended Magazine, High-Velocity Rounds';
const out=E.recommend({hero:'Haze',souls:4000,owned:weapon3200,enemies},builtIn,{clock:'12:00'});
test(out.investment.weapon.spent===3200&&out.investment.weapon.bonus===18&&out.investment.weapon.next.at===4800&&out.investment.weapon.next.bonus===46,'weapon 3,200 souls: +18% weapon damage; next +46% at 4,800');
test(out.investment.vitality.spent===0&&out.investment.vitality.bonus===0&&out.investment.vitality.next.at===800&&out.investment.spirit.unit===' spirit power'&&out.investment.vitality.unit==='% health','an empty category: no bonus, next step at 800');
test(out.investment.source==='built-in'&&E.recommend({hero:'Haze',souls:4000,owned:weapon3200,enemies},synced,{clock:'12:00'}).investment.source==='game data','the summary says where the table came from');
const capped=E.recommend({hero:'Haze',souls:0,owned:'',enemies},builtIn,{clock:'12:00'});
test(['weapon','vitality','spirit'].every(c=>capped.investment[c].spent===0&&capped.investment[c].bonus===0),'nothing bought: no bonuses');
// A per-hero table wins over the shared one.
const vindictaSpirit='Extra Spirit, Mystic Burst, Improved Spirit, Spirit Strike';
const heroTable=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,investment:{default:TABLE,heroes:{[String(snapshot.heroes.find(h=>h.name==='Vindicta').id)]:odd}}});
const bonusAt=(steps,spent)=>steps.filter(([at])=>spent>=at).pop()?.[1]||0;
const vOut=E.recommend({hero:'Vindicta',souls:9000,owned:vindictaSpirit,enemies},heroTable,{clock:'12:00'});
const vSpirit=[...vOut.results,...vOut.buildPicks].filter(r=>r.investment?.category==='spirit');
const valueAfter=(r,spent)=>{const c=snapshot.items.find(i=>i.name===r.upgradeFrom);return spent-(c?.category==='spirit'?c.cost:0)+r.cost;};
test(vOut.investment.spirit.spent===4000&&vOut.investment.spirit.next.bonus===40&&vSpirit.some(r=>r.investment.at===4800)&&vSpirit.every(r=>r.investment.gain===bonusAt(odd.spirit,valueAfter(r,4000))-19),'a hero with its own table uses it (Vindicta: spirit +40 at 4,800)');

// What a purchase adds: only spike steps count toward the score.
const pickOf=(o,name)=>[...o.results,...o.buildPicks].find(r=>r.name===name);
const spikeItems=[...out.results,...out.buildPicks].filter(r=>r.category==='weapon'&&r.investment?.notable);
test(spikeItems.length>0&&spikeItems.every(r=>r.investment.at===4800&&r.investment.gain>=28&&Math.abs(r.investment.factor-(1+.75*28/115))<.001),'weapon 3,200 + a 1,600+ weapon item: crosses the 4,800 spike (+28% damage), score x1.18');
const small=E.recommend({hero:'Haze',souls:4000,owned:'Headshot Booster',enemies},builtIn,{clock:'12:00'});
test([...small.results,...small.buildPicks].filter(r=>r.category==='weapon'&&r.cost===800&&r.investment).every(r=>!r.investment.notable&&r.investment.factor===1&&r.investment.gain===3),'small steps (800 -> 1,600: +3%) are reported but do not change the score');
// An upgrade counts only the difference: its component's souls were already spent.
const comp=E.recommend({hero:'Haze',souls:4000,owned:'Headshot Booster, Rapid Rounds, Extended Magazine, High-Velocity Rounds, Monster Rounds',enemies},builtIn,{clock:'12:00'});
test(comp.investment.weapon.spent===4000,'five 800 weapon items: 4,000 souls in weapon');
const upgrades=[...comp.results,...comp.buildPicks].filter(r=>r.category==='weapon'&&r.upgradeFrom&&r.investment);
const flatTable=JSON.parse(JSON.stringify(TABLE));flatTable.weapon=TABLE.weapon.map(([at],i)=>[at,(i+1)*5]);flatTable.vitality=TABLE.vitality.map(([at],i)=>[at,(i+1)*5]);flatTable.spirit=TABLE.spirit.map(([at],i)=>[at,(i+1)*5]);
test(upgrades.every(r=>{const cost=r.cost;const comp=snapshot.items.find(i=>i.name===r.upgradeFrom);const value=4000-(comp?.category==='weapon'?comp.cost:0)+cost;return r.investment.gain===bonusAt(TABLE.weapon,value)-18;})&&upgrades.length>0,'upgrades: the gain uses souls spent minus the component plus the upgrade');
// Same match, a table without a spike: the spike item scores lower by its factor.
const noSpike=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,investment:{default:flatTable,heroes:{}}});
const flat=E.recommend({hero:'Haze',souls:4000,owned:weapon3200,enemies},noSpike,{clock:'12:00'});
const sample=spikeItems.find(r=>pickOf(flat,r.name));
test(sample&&!pickOf(flat,sample.name).investment?.notable&&Math.abs(sample.score/pickOf(flat,sample.name).score-sample.investment.factor)<.01,'the spike raises the item\'s score by its factor, nothing else changes');
test([...flat.results,...flat.buildPicks].every(r=>!r.investment||r.investment.factor===1),'evenly spaced steps (no spike): no score changes');
const quick=E.recommend({hero:'Haze',souls:4000,owned:weapon3200,enemies},builtIn,{clock:'12:00'}).quickBuys;
test(quick.every(r=>'investment' in r),'pick cards carry the investment step');
test(!read('js/engine.js').includes('does not model exact stat values or investment thresholds'),'the build-pick caution no longer says thresholds are ignored');

// UI: the strip's text and tooltip.
const ui=read('js/ui.js');
const block=ui.slice(ui.indexOf('const INVEST_SHORT='),ui.indexOf('let lastAdvice=null;'));
const uiCtx=vm.createContext({fmt:new Intl.NumberFormat('en-US')});
vm.runInContext(block+';this.investmentText=investmentText;this.investmentTip=investmentTip;this.INVEST_SHORT=INVEST_SHORT;',uiCtx);
const inv={weapon:{spent:3200,bonus:18,unit:'% weapon damage',next:{at:4800,bonus:46}},vitality:{spent:800,bonus:9,unit:'% health',next:{at:1600,bonus:12}},spirit:{spent:28800,bonus:100,unit:' spirit power',next:null},source:'game data'};
test(uiCtx.investmentText(inv)==='Spirit +100 power · Weapon +18% damage · Vitality +9% health','strip: bonuses, most invested first');
test(uiCtx.investmentText({weapon:{spent:0,bonus:0},vitality:{spent:0,bonus:0},spirit:{spent:0,bonus:0}})==='No investment yet'&&uiCtx.investmentText(null)==='','strip: nothing bought yet');
const tip=uiCtx.investmentTip(inv);
test(tip.includes('Weapon: 3,200 souls → +18% weapon damage; next +46% weapon damage at 4,800 (1,600 more)')&&tip.includes('Spirit: 28,800 souls → +100 spirit power; maximum reached')&&!tip.includes('Built-in'),'tooltip: souls per category and the next step');
test(uiCtx.investmentTip({...inv,source:'built-in'}).includes('Built-in bonus table'),'tooltip: says when the built-in table is in use');
test(ui.includes("$('liveBuild').textContent=lastAdvice?.investment?investmentText(lastAdvice.investment):")&&ui.includes("$('liveBuild').title=[investmentTip(lastAdvice?.investment),")&&ui.includes("$('liveBuild').classList.toggle('liveGap',!!lastAdvice?.build?.durabilityGap);"),'live strip shows the bonuses; the durability warning stays');
test(ui.includes("${out.investment?investmentText(out.investment):buildSplit(out.build)} · ")&&ui.includes("$('phaseSummary').title=investmentTip(out.investment);"),'manual mode summary shows the bonuses too');
test(ui.includes('${r.investment?.notable?`<span class="quickSpike"')&&ui.includes("${r.investment.at?fmt.format(r.investment.at)+': ':''}+${r.investment.gain}${INVEST_SHORT[r.investment.category]}"),'pick cards show a spike step, e.g. "4,800: +28% damage"');

// Glance view: enemy purchases under the picks.
const html=read('index.html'),css=read('desktop.css');
test(/<div id="quickBuys"[^>]*><\/div>\s*<div id="glanceTeam" class="glanceTeam" aria-label="Enemy purchases"><\/div>/.test(html),'glance team sits right after the picks');
test(css.includes('.glanceTeam{display:none}')&&css.includes('body.glanceMode .glanceTeam{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));')&&css.includes('.glanceTeam:empty{display:none!important}'),'shown only in glance view, hidden when empty');
test(/function setGlance\(on\)\{\n document\.body\.classList\.toggle\('glanceMode',on\);\n renderGlanceTeam\(\);/.test(ui)&&/function renderEnemies\(\)\{\n \$\('enemies'\)\.innerHTML=state\.enemies\.map\(enemyRow\)\.join\(''\);\n renderGlanceTeam\(\);/.test(ui)&&ui.includes('if(expired){renderLiveTeam();renderGlanceTeam();}'),'redrawn on glance toggle, lineup changes and when highlights expire');
const fn=ui.slice(ui.indexOf('function renderGlanceTeam(){'),ui.indexOf('function setGlance(on){'));
const el={innerHTML:'',querySelectorAll:()=>[]};
const gCtx=vm.createContext({
 $:id=>id==='glanceTeam'?el:null,Date,Set,newHeroTag:()=>'',isFed:()=>false,fedTag:()=>'',
 state:{ownLane:4,enemies:[{hero:'Haze',lane:4,feedName:'p1',items:'Rapid Rounds, Mystery Mod'},{hero:'Abrams',lane:1,items:''},{hero:'',items:''},{hero:'<b>X</b>',items:''}]},
 portrait:name=>name==='Haze'?'heroes/haze.png':'',
 recentBuys:new Map([['p1',{items:new Set([E.norm('Rapid Rounds')]),until:Date.now()+20000}],['1',{items:new Set(['x']),until:Date.now()-1}]]),
 engine:E,itemIndex:{icons:new Map([[E.norm('Rapid Rounds'),'items/rapid.png']])},
 escapeHTML:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
});
vm.runInContext(fn,gCtx);gCtx.renderGlanceTeam();
const rows=el.innerHTML.split('<div class="glanceRow').slice(1);
test(rows.length===3,'one row per reported enemy; empty slots are skipped');
test(rows[0].startsWith(' gRowNew')&&rows[0].includes('<img class="gItem gNew" src="items/rapid.png" alt="Rapid Rounds" title="Rapid Rounds">')&&rows[0].includes('<span class="gChip">Mystery Mod</span>')&&rows[0].includes('<img class="gPortrait" src="heroes/haze.png"'),'new purchases are ringed; items without an icon show their name');
test(rows[0].includes('<span class="laneTag">Your lane</span>')&&!rows[1].includes('laneTag'),'your lane opponent is marked');
test(rows[1].startsWith('"')&&rows[1].includes('No items yet')&&!rows[1].includes('gNew'),'expired highlights and empty inventories');
test(rows[2].includes('&lt;b&gt;X&lt;/b&gt;')&&!rows[2].includes('<b>'),'names are escaped');

console.log(`PASS: ${total} investment bonus and glance view checks`);
