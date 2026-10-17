'use strict';
// Post-match debrief: normalizer, analysis and the allowlisted match fetcher,
// against a real (anonymized) match saved by tests/update-match-fixture.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const ctx=vm.createContext({});
for(const f of ['js/catalog.js','js/engine.js','js/debrief.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const E=ctx.DeadlockEngine,D=ctx.DeadlockDebrief,base=ctx.DeadlockCatalog;
const {normalizeMatch,damageCategory}=require('../desktop/match-normalizer.cjs');
const service=require('../desktop/match-service.cjs');
const raw=require('./fixtures/match-sample.json'),assets=require('./fixtures/match-assets.json');
const catalog=E.createCatalog(base,require('./fixtures/catalog-snapshot.json'));
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

(async()=>{
  // Normalizer
  const m=normalizeMatch(raw,assets,'103');
  test(m.youSlot===3&&normalizeMatch(raw,assets,'999').youSlot===null&&normalizeMatch(raw,assets).youSlot===null,'friend code finds your slot, or none');
  test(!JSON.stringify(m).includes('account'),'no account IDs in the normalized match');
  test(m.players.length===12&&m.players.every(p=>p.hero&&!/^Hero \d+$/.test(p.hero)),'all 12 players with hero names (ballot heroes included)');
  test(m.players.every(p=>p.purchases.every((x,i,a)=>/^upgrade_/.test(x.className)&&(!i||a[i-1].t<=x.t))),'purchases are shop items only, in time order');
  const comp=m.players.flatMap(p=>p.purchases).find(x=>x.upgraded);
  test(comp&&comp.sold>=comp.t,'upgraded components carry the upgrade time');
  test(damageCategory('Bullet')===null&&damageCategory('Ability')===null&&damageCategory('citadel_weapon_haze_set_crit')==='weapon'&&damageCategory('ability_melee_haze')==='melee'&&damageCategory('ability_baba_bench_melee')==='abilities'&&damageCategory('upgrade_tech_damage_pulse')==='items','damage source categories; aggregate names skipped');
  const team=new Map(m.players.map(p=>[p.slot,p.team]));
  const ratios=m.players.map(p=>(m.damageTaken[p.slot]||[]).filter(r=>team.has(r.dealerSlot)&&team.get(r.dealerSlot)!==p.team).reduce((s,r)=>s+r.total,0)/p.timeline.at(-1).damageTaken);
  test(ratios.every(r=>r>=0.95&&r<=1.3)&&ratios.filter(r=>Math.abs(r-1)<0.02).length>=6,'damage breakdown matches each player\'s damage-taken stat closely');
  assert.throws(()=>normalizeMatch({match_info:{players:[]}},assets));total++;

  // Analysis for the Infernus on the losing team
  const a=D.analyzeMatch(m,3,catalog,E,base);
  const you=m.players.find(p=>p.slot===3);
  test(a.timeline.length===you.purchases.length&&a.timeline.every(r=>['top','counter','build'].includes(r.verdict)),'one timeline entry per purchase with a verdict');
  test(a.timeline.every(r=>r.picks.length<=3&&r.picks.every(p=>(catalog.items.find(i=>i.id===p.id)?.cost||0)<=r.cost)),'advisor picks stay within the same budget');
  test(a.counts.top+a.counts.counter+a.counts.build===a.timeline.length,'verdict counts add up');
  // No hindsight: removing everything enemies bought later must not change a moment's picks.
  const probe=a.timeline[Math.floor(a.timeline.length/2)];
  const cut=JSON.parse(JSON.stringify(m));
  for(const p of cut.players)if(p.team!==you.team)p.purchases=p.purchases.filter(x=>x.t<=probe.t).map(x=>x.sold>probe.t?{...x,sold:0}:x);
  const again=D.analyzeMatch(cut,3,catalog,E,base).timeline.find(r=>r.t===probe.t&&r.className===probe.className);
  test(JSON.stringify(again.picks)===JSON.stringify(probe.picks),'timeline picks use only what enemies owned at that moment');
  test(a.counterTiming.every(c=>['ahead','on time','late','never'].includes(c.status)&&(c.status==='never')===!c.counter),'counter timing statuses');
  test(Math.abs(a.damage.byCategory.reduce((s,c)=>s+c.share,0)-100)<=2&&a.damage.byEnemy.every(e=>m.players.some(p=>p.hero===e.hero&&p.team!==you.team)),'damage shares add up and only enemies are listed');
  test(a.deaths.length===you.deathDetails.length&&Object.values(a.killers).reduce((s,n)=>s+n,0)===a.deaths.length,'every death listed with its killer');
  test(a.performance.won===false&&a.performance.laneOpponents.length>0&&a.performance.laneOpponents.every(h=>m.players.some(p=>p.hero===h&&p.lane===you.lane&&p.team!==you.team)),'performance: result and lane opponents');
  test(a.build.length>0&&a.build.length<=6&&a.build.some(b=>b.evidence.some(e=>/abilities and items/.test(e))),'suggested build cites the damage actually taken');
  test(a.build.every(b=>!b.bought||/^\d+:\d\d$/.test(b.bought)),'build marks items you did buy');
  const winner=m.players.find(p=>p.team===m.winningTeam&&p.hero==='Baba');
  test(D.analyzeMatch(m,winner.slot,catalog,E,base).performance.won===true,'a ballot hero can be analyzed as you');
  assert.throws(()=>D.analyzeMatch(m,99,catalog,E,base),/Pick which player/);total++;
  test(D.mmss(0)==='0:00'&&D.mmss(605)==='10:05'&&D.valueAt([{t:100,v:10},{t:200,v:30}],150,'v')===20,'time and interpolation helpers');

  // Match service: allowlist, validation, caching, friendly errors
  test(service.routeAllowed('/v1/matches/118673133/metadata')&&service.routeAllowed('/v1/assets/items')&&service.routeAllowed('/v1/assets/heroes'),'allowed routes');
  test(['/v1/matches/abc/metadata','/v1/matches/1/metadata/raw','/v1/players/1/match-history','https://evil.example/v1/assets/items','/v1/assets/items?x=1'].every(r=>!service.routeAllowed(r)),'everything else is refused');
  await assert.rejects(service.getJSON('/v1/players/1/match-history'),/not allowlisted/);total++;
  test(/not found/i.test(service.friendlyStatus(404))&&/busy.*20 seconds/.test(service.friendlyStatus(503,'20')),'friendly status messages');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dca-debrief-'));
  try{
    fs.writeFileSync(path.join(dir,'deadlock-api-assets-v1.json'),JSON.stringify({...assets,fetchedAt:Date.now()}));
    const calls=[];const fake=async route=>{calls.push(route);return raw;};
    await assert.rejects(service.loadMatch(dir,'12ab','',fake),/numeric match ID/);total++;
    await assert.rejects(service.loadMatch(dir,'118673133','abc',fake),/digits only/);total++;
    const first=await service.loadMatch(dir,'118673133','103',fake);
    const second=await service.loadMatch(dir,'118673133','',fake);
    test(first.youSlot===3&&second.youSlot===null&&calls.join()==='/v1/matches/118673133/metadata','loads once, then reuses the in-memory copy; fresh asset cache not refetched');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}

  // Wiring
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),main=fs.readFileSync(path.join(root,'desktop/main.cjs'),'utf8');
  const preload=fs.readFileSync(path.join(root,'desktop/preload.cjs'),'utf8'),ui=fs.readFileSync(path.join(root,'js/debrief-ui.js'),'utf8');
  test(['id="openDebrief"','id="debriefView"','id="matchId"','id="friendCode"','src="js/debrief.js"','src="js/debrief-ui.js"'].every(s=>html.includes(s)),'debrief view and scripts present');
  test(/ipcMain\.handle\('debrief:load'[^]*?if\(!trusted\(event\)\)/.test(main)&&preload.includes("ipcRenderer.invoke('debrief:load'"),'debrief IPC is caller-checked and exposed narrowly');
  test(!/\sstyle=/.test(ui),'no inline style attributes (blocked by the page CSP)');
  console.log(`PASS: ${total} post-match debrief checks`);
})().catch(e=>{console.error(e);process.exit(1);});
