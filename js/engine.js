(function(root){
'use strict';
// Item counter rules are conservative, curated mappings to categories of enemy
// pressure; they are NOT derived from win-rate analysis or ability simulations.
const COUNTERS={
 upgrade_debuff_reducer:{control:3.2,slow:1.5,burst:.2},
 upgrade_reduce_debuff_duration:{control:3.8,slow:2.5,spirit:.4},
 upgrade_tech_purge:{control:3.4,spirit:1.3,slow:1.3},
 upgrade_spellbreaker:{spirit:3.2,burst:1.1,control:.5},
 upgrade_tech_armor:{spirit:3.8,burst:.5},
 upgrade_magic_shield:{spirit:3.0,burst:.8},
 upgrade_spirit_bubble:{spirit:2.8,burst:.8},
 upgrade_bullet_armor:{bullet:3.8,sustained:1.2},
 upgrade_improved_bullet_armor:{bullet:4.1,sustained:1.4},
 upgrade_regenerating_bullet_shield:{bullet:3.0,sustained:.9},
 upgrade_deflecting_armor:{bullet:4.0,sustained:1},
 upgrade_return_fire:{bullet:2.7,sustained:1.1},
 upgrade_metal_skin:{bullet:4.1,burst:.9},
 upgrade_healbane:{sustain:4.0},
 upgrade_withering_whip:{bullet:3.0,sustained:2.0},
 upgrade_greater_withering_whip:{bullet:3.3,sustained:2.1},
 upgrade_unstoppable:{control:3.3,slow:1.1},
 upgrade_inhibitor:{bullet:2.3,sustained:2.1},
 upgrade_savior:{burst:3.4,control:.7},
 upgrade_cheat_death:{burst:3.1},
 upgrade_phantom_strike:{range:2.8,mobility:2.0},
 upgrade_veil_walker:{burst:1.7,range:1.8},
 upgrade_improved_stamina:{mobility:1.7,control:1.0,slow:1.0},
 upgrade_superior_stamina:{mobility:2.1,control:1.1,slow:1.0},
 upgrade_sprint_booster:{range:1.1,mobility:1.8},
 upgrade_healing_booster:{sustain:.9,burst:.5},
 upgrade_targeted_silence:{spirit:2.4,control:1.7},
 upgrade_magic_slow:{mobility:2.5},
 upgrade_containment:{mobility:2.9,control:1.0},
 upgrade_aoe_root:{mobility:2.5},
 upgrade_spirit_sap:{spirit:2.0,sustain:1.0},
 upgrade_rupture:{sustain:2.0,range:1.2},
 upgrade_tech_damage_pulse:{mobility:1.1,bullet:.7}
};
// Explicit, reviewable matchup nudges for established heroes; these are not
// automatically claimed to be accurate for patch-new characters.
const MATCHUPS={
 'Haze':{note:'Heavy sustained gunfire; consider weapon defense or fire-rate disruption.',items:{upgrade_bullet_armor:1,upgrade_metal_skin:1.1,upgrade_withering_whip:1.4}},
 'Bebop':{note:'Pick potential followed by burst; plan a survival response to disables.',items:{upgrade_debuff_reducer:1.2,upgrade_tech_purge:1.1,upgrade_spellbreaker:.7}},
 'Lash':{note:'Mobile close-range engagements and displacement; positioning and anti-control matter.',items:{upgrade_debuff_reducer:.9,upgrade_improved_stamina:.7,upgrade_unstoppable:1.2}},
 'Seven':{note:'Large area spirit pressure; respect damage mitigation and positioning.',items:{upgrade_tech_armor:1.4,upgrade_spellbreaker:1}},
 'Infernus':{note:'Repeated spirit pressure and damage over time; consider defensive durability.',items:{upgrade_tech_armor:1.2,upgrade_tech_purge:.6}},
 'Abrams':{note:'Can be hard to bring down when allowed to sustain at close range.',items:{upgrade_healbane:1.3,upgrade_improved_stamina:.6}},
 'Dynamo':{note:'Teamfight setup and disables can be high priority.',items:{upgrade_unstoppable:1.4,upgrade_debuff_reducer:1}},
 'Vindicta':{note:'Long-range weapon pressure; closing distance or bullet resistance may help.',items:{upgrade_phantom_strike:1.2,upgrade_bullet_armor:.8}},
 'McGinnis':{note:'Extended fights and area pressure; prioritize sustained-damage survival.',items:{upgrade_improved_bullet_armor:1,upgrade_healbane:.6}},
 'Pocket':{note:'Mobile ability-based burst; anticipate evasive entries and exits.',items:{upgrade_spellbreaker:1.1,upgrade_tech_armor:.9}},
 'Wraith':{note:'Weapon follow-up and control can combine for focused damage.',items:{upgrade_bullet_armor:1,upgrade_debuff_reducer:1.1}},
 'Mo & Krill':{note:'Close-range control and brawling; mitigate disables before extended fights.',items:{upgrade_reduce_debuff_duration:1.1,upgrade_healbane:.8}},
 'Yamato':{note:'Close-range survivability and mobility; prepare for a prolonged fight.',items:{upgrade_healbane:.8,upgrade_containment:.6}},
 'Shiv':{note:'Sustained close-range threat; healing reduction may reduce his ability to outlast you.',items:{upgrade_healbane:1.1}},
 'Kelvin':{note:'Slowing/control-based pressure; repositioning or mitigating status effects may help.',items:{upgrade_reduce_debuff_duration:.8,upgrade_improved_stamina:.5}}
};
const OWN_AFFINITY={
 upgrade_healbane:['spirit'],upgrade_spirit_sap:['spirit'],upgrade_targeted_silence:['spirit'],
 upgrade_phantom_strike:['mobility','burst'],upgrade_improved_stamina:['mobility'],
 upgrade_superior_stamina:['mobility'],upgrade_aoe_root:['control','spirit'],
 upgrade_containment:['control','spirit'],upgrade_return_fire:['sustain'],
 upgrade_metal_skin:['bullet'],upgrade_tech_damage_pulse:['spirit']
};
const ENEMY_GROUPS={
 EHealing:['sustain'],ERevitalization:['sustain'],ELifesteal:['sustain'],EAntiHealing:[],
 ERateOfFire:['bullet','sustained'],EHeadshotEnthusiasts:['bullet','burst'],EWeaponRange:['bullet','range'],
 ESlowingBullets:['bullet','slow'],ETankingBullets:['bullet'],EMagazines:['bullet','sustained'],
 ESpiritSlinger:['bullet','spirit'],EBurstDamage:['spirit','burst'],ESpiritRange:['spirit','range'],
 EMagicVulnerability:['spirit'],ESlowingMagic:['spirit','slow'],ECrownControl:['control'],
 EAntiGun:['control'],ECooldown:['spirit'],EMoreSpirit:['spirit'],EMovementAndAgility:['mobility'],
 EMelee:['sustain'],EAdditionalProtection:[],ECharges:['spirit'],EActives:[]
};
const TAG_LABELS={spirit:'Spirit pressure',bullet:'Weapon damage',burst:'Burst damage',control:'Disables',sustain:'Healing / sustain',slow:'Slows',mobility:'Mobile enemies',sustained:'Extended fights',range:'Long-range poke',area:'Area damage',support:'Team utility'};
const cleanList=x=>Array.isArray(x)?x.map(v=>String(v||'').trim()).filter(Boolean):String(x||'').split(',').map(v=>v.trim()).filter(Boolean);
const norm=x=>String(x||'').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,'');
const iconPath=x=>typeof x==='string'&&/^\/assets\/game\/panorama\/images\/[\w\/.\-]+\.png$/.test(x)?'https://deadlock.io'+x:'';
function createCatalog(base,snapshot){
 if(!snapshot||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.heroes)){
  return {heroes:Object.keys(base.heroes).map(name=>({name,id:name,tags:base.heroes[name],portrait:'',unverified:base.unverifiedHeroes.includes(name)})),
   items:base.counterItems.map((x,i)=>({id:'starter:'+i,name:x.name,cost:x.cost,category:'vitality',icon:'',weights:x.weights,why:x.why,caution:x.caution,synergy:x.synergy})),
   enemyItems:base.enemyItems,complete:false,build:'starter',generatedAt:base.rosterDate};
 }
 return {heroes:snapshot.heroes.map(h=>({...h,portrait:iconPath(h.portrait),tags:base.heroes[h.name]||[],unverified:!Object.prototype.hasOwnProperty.call(base.heroes,h.name)})),
  items:snapshot.items.map(i=>({...i,icon:iconPath(i.icon)})),
  enemyItems:base.enemyItems,complete:true,build:snapshot.build,generatedAt:snapshot.generatedAt};
}
// v0.6 recommendation model: explainable ordinal ranking, NOT a win-rate or
// numerical damage model. Caps repeated pressure from the same enemy so six
// similar purchases cannot inflate a single threat indefinitely.
const STRATEGY={
 balanced:{},survive:{burst:1.35,bullet:1.25,spirit:1.25,sustained:1.2},
 escape:{control:1.65,slow:1.55,mobility:1.3},
 antiheal:{sustain:2.0}
};
function recommend(state,catalog,options={}){
 const enemies=(Array.isArray(state.enemies)?state.enemies:[]).filter(e=>e&&String(e.hero||'').trim()).slice(0,6);
 if(!enemies.length)return {results:[],quickBuys:[],threats:[],unknown:[],count:0,knownItems:0,totalCandidates:0,observedInventories:0,quality:'No matchup data'};
 const heroMap=new Map(catalog.heroes.map(h=>[norm(h.name),h]));
 const itemMap=new Map(catalog.items.map(i=>[norm(i.name),i]));
 const idMap=new Map(catalog.items.map(i=>[String(i.id),i]));
 const fallbackItemMap=new Map(Object.entries(catalog.enemyItems||{}).map(([key,tags])=>[norm(key),tags]));
 const unknown=[],byTag=new Map(),matchedHeroes=[];
 let knownItems=0,listedItems=0,profiledHeroes=0,observedInventories=0;
 for(const [idx,enemy] of enemies.entries()){
  const hero=heroMap.get(norm(enemy.hero));
  const heroName=hero?.name||String(enemy.hero).slice(0,80);
  const perTag=new Map();
  function pressure(tag,amount,label,kind){
   if(!TAG_LABELS[tag]||!Number.isFinite(amount)||amount<=0)return;
   const record=perTag.get(tag)||{hero:0,items:0,sources:[]};
   if(kind==='hero')record.hero+=amount;else record.items+=amount;
   record.sources.push({name:label,kind,enemy:idx});perTag.set(tag,record);
  }
  if(hero){
   if(hero.tags?.length&&!hero.unverified){profiledHeroes++;hero.tags.forEach(tag=>pressure(tag,0.9,heroName,'hero'));}
   else unknown.push(`No reviewed combat profile for ${heroName}`);
   if(MATCHUPS[hero.name])matchedHeroes.push(hero.name);
  }else unknown.push(`Unknown enemy hero: ${heroName}`);
  if(enemy.inventoryKnown===true)observedInventories++;
  // Duplicate names in copied feeds should not create fictitious stacked purchases.
  // Blank inventories do not mean the enemy has none.
  const uniqueEnemyItems=[...new Map(cleanList(enemy.items).slice(0,15).map(x=>[norm(x),x])).values()];
  for(const raw of uniqueEnemyItems){
   listedItems++;
   const item=itemMap.get(norm(raw));
   let tags=[];
   if(item){
    tags=ENEMY_GROUPS[item.group]||[];
    if(!tags.length&&item.category==='spirit')tags=['spirit'];
    if(!tags.length&&item.category==='weapon')tags=['bullet'];
    knownItems++;
   }else if(fallbackItemMap.has(norm(raw))){tags=fallbackItemMap.get(norm(raw));knownItems++;}
   else{unknown.push('Unrecognized item: '+raw);continue;}
   // Named, observed purchases contribute more than unverified hero archetypes.
   for(const tag of tags)pressure(tag,item?.tier>=3?0.85:0.65,`${heroName} · ${item?.name||raw}`,'item');
  }
  for(const [tag,x] of perTag){
   // Diminishing returns for multiple effects of the same kind on one player.
   const bounded=Math.min(2.3,x.hero+1.25*(1-Math.exp(-x.items/1.25)));
   if(!byTag.has(tag))byTag.set(tag,{score:0,sources:[],enemies:new Set()});
   const acc=byTag.get(tag);acc.score+=bounded;acc.sources.push(...x.sources);acc.enemies.add(idx);
  }
 }
 const soulCount=Math.max(0,Math.min(1000000,Number(state.souls)||0));
 const owned=new Set(cleanList(state.owned).map(norm));
 const ownHero=heroMap.get(norm(state.hero));
 const ownTags=ownHero?.tags||[];
 const strategy=STRATEGY[options.strategy]||STRATEGY.balanced;
 const all=catalog.items.filter(i=>!owned.has(norm(i.name))).map(item=>{
  const weights=item.weights||COUNTERS[item.id];
  if(!weights)return null; // never manufacture effects for unreviewed shop items
  const contributes=Object.entries(weights).filter(([tag,weight])=>byTag.has(tag)&&Number(weight)>0).map(([tag,weight])=>{
   const t=byTag.get(tag),factor=strategy[tag]||1;
   return {tag,raw:Math.sqrt(t.score)*Number(weight)*factor,source:t.sources,enemies:t.enemies};
  }).sort((a,b)=>b.raw-a.raw);
  if(!contributes.length)return null;
  const coveredEnemies=new Set(contributes.flatMap(x=>[...x.enemies]));
  const cost=Math.max(0,Number(item.cost)||0);
  const validComponents=(item.components||[]).map(c=>idMap.get(String(c))).filter(c=>c&&owned.has(norm(c.name)));
  const credit=Math.min(cost,validComponents.reduce((best,c)=>Math.max(best,Number(c.cost)||0),0));
  const upgradeFrom=validComponents.sort((a,b)=>b.cost-a.cost)[0]?.name||'';
  const effectiveCost=Math.max(0,cost-credit);
  const fitTags=OWN_AFFINITY[item.id]||[];
  const ownMatch=fitTags.some(t=>ownTags.includes(t));
  const fit=item.synergy?(ownTags.includes(item.synergy)?1.12:0.78):(fitTags.length?(ownMatch?1.08:0.92):1);
  const efficiency=Math.min(1.17,Math.max(.77,Math.sqrt(3200/Math.max(800,effectiveCost||cost||800))));
  const matchupBonus=matchedHeroes.reduce((sum,h)=>sum+(MATCHUPS[h]?.items[item.id]||0),0);
  const score=contributes.reduce((sum,x)=>sum+x.raw,0)*fit*efficiency + Math.min(1.0,coveredEnemies.size*.12)+matchupBonus;
  const leads=contributes.slice(0,3);
  const reasons=leads.map(x=>TAG_LABELS[x.tag]);
  const sources=Array.from(new Set(leads.flatMap(x=>x.source.map(y=>y.name)))).slice(0,5);
  const heroNotes=matchedHeroes.filter(name=>MATCHUPS[name].items[item.id]).slice(0,2).map(name=>`${name}: ${MATCHUPS[name].note}`);
  const affordable=soulCount>=effectiveCost;
  return {id:item.id,name:item.name,cost,effectiveCost,upgradeFrom,category:item.category||'vitality',icon:item.icon||'',
   score:Math.round(score*100)/100,affordable,missing:Math.max(0,effectiveCost-soulCount),
   tags:leads.map(x=>x.tag),reasons,sources,coverage:coveredEnemies.size,
   why:item.why||`Can help against ${reasons.join(', ').toLowerCase()}. Verify its current in-game tooltip and activation conditions.`,
   caution:item.caution||'A reviewable category heuristic, not a verified ability-by-ability counter. Item slots, cooldowns, positioning and patch-specific effects are not modeled.',
   confidence:item.id.startsWith('starter:')?'starter':heroNotes.length?'matchup + category':'category rule',heroNotes,
   ownFit:fitTags.length?(ownMatch?'Supports your hero archetype':'General utility; weaker build alignment'):'Broad defensive / utility fit'};
 }).filter(Boolean);
 // Rankings are relative suggestions, not precise utility probabilities.
 all.sort((a,b)=>b.score-a.score||a.effectiveCost-b.effectiveCost||a.name.localeCompare(b.name));
 const affordable=all.filter(x=>x.affordable);
 const saving=all.filter(x=>!x.affordable);
 const quickBuys=affordable.length?[...affordable.slice(0,2),...saving.slice(0,1),...affordable.slice(2,3)].slice(0,3):all.slice(0,3);
 const sort=options.sort||'smart';
 if(sort==='affordable')all.sort((a,b)=>Number(b.affordable)-Number(a.affordable)||b.score-a.score);
 else if(sort==='cost')all.sort((a,b)=>a.effectiveCost-b.effectiveCost||b.score-a.score);
 const filtered=all.filter(r=>(!options.category||options.category==='all'||r.category===options.category)&&(!options.affordableOnly||r.affordable));
 const quality=!catalog.complete?'Starter catalog':profiledHeroes===0?'Limited profiles':listedItems>0&&knownItems<listedItems?'Partial item recognition':listedItems===0?'Hero profiles only':'Hero + recognized item evidence';
 return {results:filtered.slice(0,12),quickBuys,threats:[...byTag].map(([name,value])=>({name,label:TAG_LABELS[name],value:Math.round(value.score*100)/100,coverage:value.enemies.size})).sort((a,b)=>b.value-a.value),
 unknown,knownItems,listedItems,count:enemies.length,totalCandidates:all.length,observedInventories,quality};
}
root.DeadlockEngine={createCatalog,recommend,cleanList,norm,TAG_LABELS,COUNTERS,ENEMY_GROUPS,MATCHUPS,OWN_AFFINITY,STRATEGY};
})(typeof window!=='undefined'?window:globalThis);
