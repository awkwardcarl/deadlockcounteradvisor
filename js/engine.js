(function(root){
'use strict';
// Item counter rules are conservative, curated mappings to categories of enemy
// pressure; they are NOT derived from win-rate analysis or ability simulations.
// Keys are the game's internal item ids, which are often legacy names that do
// not match the shop name (upgrade_tech_purge is Spirit Resilience, not a
// cleanse). The shop name is noted on each line; reviewed against build
// client-6785. tests/catalog-fixture-tests.cjs fails if an id stops existing.
const COUNTERS={
 // Disables and slows
 upgrade_vex_barrier:{control:3.2,burst:1.0},                 // Reactive Barrier
 upgrade_debuff_reducer:{control:3.2,slow:1.5,burst:.2},      // Debuff Reducer
 upgrade_reduce_debuff_duration:{control:3.4,slow:2.5,spirit:.4}, // Dispel Magic
 upgrade_unstoppable:{control:3.3,slow:1.1},                  // Unstoppable
 upgrade_auto_cleanse:{control:3.4,burst:1.0},                // Indomitable
 upgrade_divine_barrier:{slow:2.0,control:1.4,burst:1.4},     // Divine Barrier
 upgrade_counterspell:{spirit:1.8,control:1.8},               // Counterspell
 upgrade_cardio_calibrator:{slow:2.6},                        // Enduring Speed
 upgrade_juggernaut:{slow:2.4,bullet:1.4,sustained:1.0},      // Juggernaut
 upgrade_fleetfoot_boots:{slow:1.6,mobility:.8},              // Fleetfoot
 // Spirit damage
 upgrade_tech_purge:{spirit:3.4,burst:.3},                    // Spirit Resilience
 upgrade_magic_shield:{spirit:2.4,burst:.4},                  // Enchanter's Emblem
 upgrade_spirit_bubble:{spirit:2.8,burst:.8},                 // Spirit Shielding
 upgrade_spellbreaker:{spirit:3.0,burst:1.5},                 // Spellbreaker
 // Weapon damage
 upgrade_weapon_shielding:{bullet:2.8,burst:.8},              // Weapon Shielding
 upgrade_regenerating_bullet_shield:{bullet:3.0,sustained:.9}, // Battle Vest
 upgrade_improved_bullet_armor:{bullet:3.6,sustained:1.2},    // Bullet Resilience
 upgrade_deflecting_armor:{bullet:4.0,sustained:1},           // Plated Armor
 upgrade_return_fire:{bullet:2.7,sustained:1.1},              // Return Fire
 upgrade_metal_skin:{bullet:4.1,burst:.9},                    // Metal Skin
 upgrade_withering_whip:{bullet:3.0,sustained:2.0},           // Rusted Barrel
 upgrade_greater_withering_whip:{bullet:3.3,sustained:2.1},   // Disarming Hex
 upgrade_inhibitor:{bullet:2.3,sustained:2.1,sustain:1.4},    // Inhibitor
 // Burst / lethal focus
 upgrade_self_bubble:{burst:3.0,control:1.6},                 // Ethereal Shift
 upgrade_cheat_death:{burst:3.1},                             // Cheat Death
 upgrade_veil_walker:{burst:1.7,range:1.8},                   // Veil Walker
 // Healing and durable targets
 upgrade_healbane:{sustain:4.0},                              // Healbane
 upgrade_toxic_bullets:{sustain:2.6},                         // Toxic Bullets
 upgrade_spirit_burn:{sustain:1.6},                           // Spirit Burn
 upgrade_rupture:{sustain:2.0},                               // Decay
 // Mobile and long-range enemies
 upgrade_phantom_strike:{range:2.8,mobility:2.0},             // Phantom Strike
 upgrade_improved_stamina:{mobility:1.7,control:1.0,slow:1.0}, // Extra Stamina
 upgrade_superior_stamina:{mobility:2.1,control:1.1,slow:1.0}, // Stamina Mastery
 upgrade_sprint_booster:{range:1.1,mobility:1.8},             // Sprint Boots
 upgrade_magic_slow:{mobility:2.5},                           // Mystic Slow
 upgrade_containment:{mobility:2.9,control:1.0},              // Slowing Hex
 upgrade_aoe_root:{mobility:2.5},                             // Vortex Web
 upgrade_tech_damage_pulse:{mobility:1.1,bullet:.7},          // Torment Pulse
 // Spirit casters
 upgrade_targeted_silence:{spirit:2.4,control:1.7},           // Silence Wave
 upgrade_spirit_sap:{spirit:2.2,burst:.4}                     // Spirit Sap
};
// Explicit, reviewable matchup nudges for established heroes; these are not
// automatically claimed to be accurate for patch-new characters.
const MATCHUPS={
 'Haze':{note:'Heavy sustained gunfire; consider weapon defense or fire-rate disruption.',items:{upgrade_weapon_shielding:1,upgrade_metal_skin:1.1,upgrade_withering_whip:1.4}},
 'Bebop':{note:'Pick potential followed by burst; plan a survival response to disables.',items:{upgrade_debuff_reducer:1.2,upgrade_vex_barrier:1.1,upgrade_spellbreaker:.7}},
 'Lash':{note:'Mobile close-range engagements and displacement; positioning and anti-control matter.',items:{upgrade_debuff_reducer:.9,upgrade_improved_stamina:.7,upgrade_unstoppable:1.2}},
 'Seven':{note:'Large area spirit pressure; respect damage mitigation and positioning.',items:{upgrade_tech_purge:1.4,upgrade_spellbreaker:1}},
 'Infernus':{note:'Repeated spirit pressure and damage over time; consider defensive durability.',items:{upgrade_tech_purge:1.2,upgrade_reduce_debuff_duration:.6}},
 'Abrams':{note:'Can be hard to bring down when allowed to sustain at close range.',items:{upgrade_healbane:1.3,upgrade_improved_stamina:.6}},
 'Dynamo':{note:'Teamfight setup and disables can be high priority.',items:{upgrade_unstoppable:1.4,upgrade_debuff_reducer:1}},
 'Vindicta':{note:'Long-range weapon pressure; closing distance or bullet resistance may help.',items:{upgrade_phantom_strike:1.2,upgrade_weapon_shielding:.8}},
 'McGinnis':{note:'Extended fights and area pressure; prioritize sustained-damage survival.',items:{upgrade_improved_bullet_armor:1,upgrade_healbane:.6}},
 'Pocket':{note:'Mobile ability-based burst; anticipate evasive entries and exits.',items:{upgrade_spellbreaker:1.1,upgrade_tech_purge:.9}},
 'Wraith':{note:'Weapon follow-up and control can combine for focused damage.',items:{upgrade_weapon_shielding:1,upgrade_debuff_reducer:1.1}},
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
 upgrade_metal_skin:['bullet'],upgrade_tech_damage_pulse:['spirit'],
 upgrade_toxic_bullets:['bullet'],upgrade_spirit_burn:['spirit']
};
// Hero ability tips. Display only: they do not change scores, because the hero
// profile in catalog.js already counts that hero's threat. They are reminders
// of what the hero CAN do, not evidence an ability was used or is available.
// After a sync, a tip is hidden if its ability is no longer in the hero's kit.
const ABILITY_CUES={
 'Haze':[{name:'Sleep Dagger',note:'Sleep can set up weapon follow-up; Reactive Barrier triggers on sleep.'},{name:'Bullet Dance',note:'Prioritize gunfire survival if her sustained damage is the problem.'}],
 'Bebop':[{name:'Grapple Arm',note:'Grapple can pull you into a pick; shorter disables do not guarantee an escape.'},{name:'Sticky Bomb',note:'Bomb timing can make burst protection valuable.'}],
 'Lash':[{name:'Death Slam',note:'Can displace a group; position before the fight starts.'}],
 'Dynamo':[{name:'Singularity',note:'Group control is especially dangerous with allied follow-up.'}],
 'Seven':[{name:'Storm Cloud',note:'Area spirit damage punishes staying exposed; reposition as well as resisting it.'}],
 'Infernus':[{name:'Afterburn',note:'Damage over time rewards extended spirit defense.'}],
 'Vindicta':[{name:'Flight',note:'Sightlines and range matter; a gap-closer is not a substitute for positioning.'}],
 'McGinnis':[{name:'Mini Turret',note:'Deployed turrets add extended-fight pressure.'}],
 'Abrams':[{name:'Shoulder Charge',note:'Close-range stun and engage pressure.'},{name:'Infernal Resilience',note:'Healing reduction value depends on how reliably you can apply it.'}],
 'Kelvin':[{name:'Arctic Beam',note:'Slowing pressure can complicate disengages.'}],
 'Mo & Krill':[{name:'Combo',note:'Single-target lockdown is dangerous with follow-up.'}],
 'Warden':[{name:'Binding Word',note:'Escape timing and positioning matter around immobilization.'}],
 'Pocket':[{name:'Affliction',note:'Repeated ability damage changes defensive priorities.'}],
 'Paradox':[{name:'Paradoxical Swap',note:'Displacement can leave you exposed; not every cleanse prevents it.'}],
 'Yamato':[{name:'Shadow Transformation',note:'A survivability window; pick targets patiently.'}],
 'Shiv':[{name:'Bloodletting',note:'Delayed damage helps him outlast fights; healing reduction can help.'}],
 'Holliday':[{name:'Bounce Pad',note:'Vertical repositioning can frustrate static defenses.'}]
};
// Item pairs that signal heavier investment when BOTH are entered for the SAME
// enemy. Neither item may be built from the other (that would re-count one
// purchase path); tests/catalog-fixture-tests.cjs checks this against real data.
const PURCHASE_PATTERNS=[
 {items:['Glass Cannon','Burst Fire'],tags:{bullet:.28,burst:.21},description:'High-pressure weapon investment',advice:'Avoid prolonged exposed trades.'},
 {items:['Improved Spirit','Mystic Burst'],tags:{spirit:.22,burst:.19},description:'Spirit power + burst investment',advice:'Review burst resistance before the next fight.'},
 {items:['Improved Spirit','Tankbuster'],tags:{spirit:.24,burst:.22},description:'Heavy spirit burst investment',advice:'Survive the damage window rather than stacking only offensive items.'},
 {items:['Leech','Healing Booster'],tags:{sustain:.32},description:'Layered sustain investment',advice:'Consider reliable healing reduction.'},
 {items:['Slowing Bullets','Slowing Hex'],tags:{slow:.22,control:.16},description:'Stacked slow and control investment',advice:'Consider mobility and eligible debuff responses.'}
];
// Shop group ids from the synced catalog. Defensive groups map to no pressure.
// "ECrownControl" is the game's own spelling. Curated enemyItems entries in
// catalog.js take precedence over these group guesses.
const ENEMY_GROUPS={
 EHealing:['sustain'],ERevitalization:['sustain'],ELifesteal:['sustain'],EAntiHealing:[],
 ERateOfFire:['bullet','sustained'],EHeadshotEnthusiasts:['bullet','burst'],EWeaponRange:['bullet','range'],
 ESlowingBullets:['bullet','slow'],ETankingBullets:['bullet'],EMagazines:['bullet','sustained'],
 EBulletVelocity:['bullet'],EMisc:['bullet'],
 ESpiritSlinger:['bullet','spirit'],EBurstDamage:['spirit','burst'],ESpiritRange:['spirit','range'],
 EMagicVulnerability:['spirit'],ESlowingMagic:['spirit','slow'],ECrownControl:['control'],
 EAntiGun:['control'],ECooldown:['spirit'],EMoreSpirit:['spirit'],EMovementAndAgility:['mobility'],
 EMiscSpirit:['spirit'],EMeleeSpirit:['spirit'],EDuration:['spirit'],
 EMelee:['sustain'],EAdditionalProtection:[],ECharges:['spirit'],EActives:[],
 EMoreHealth:[],EBulletProtection:[],ESpiritProtection:[],EDebuffs:[]
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
// Player-facing threat level for a team pressure score. One profiled hero adds
// 0.9 to its tags and each enemy is capped at 2.3 per tag, so roughly: Low is a
// single hint, Medium is one committed enemy, High is several enemies or one
// heavily invested enemy.
const threatLevel=score=>score>=2.5?'high':score>=1.2?'medium':'low';
// Map typed text to the catalog's spelling of a recognized item ("mystic burst"
// -> "Mystic Burst"); unrecognized text is returned trimmed, unchanged.
function resolveItemName(catalog,raw){
 const text=String(raw||'').trim();
 return itemSuggestions(catalog).find(name=>norm(name)===norm(text))||text;
}
// Names for the item-entry suggestions: every item the app recognizes. The
// offline starter catalog's items are only the counter picks, so the curated
// enemy-item names are added too.
function itemSuggestions(catalog){
 const names=new Map();
 for(const name of [...catalog.items.map(i=>i.name),...Object.keys(catalog.enemyItems||{})])if(!names.has(norm(name)))names.set(norm(name),name);
 return [...names.values()].sort((a,b)=>a.localeCompare(b));
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
 if(!enemies.length)return {results:[],quickBuys:[],threats:[],patterns:[],abilityTips:[],unknown:[],count:0,knownItems:0,totalCandidates:0,observedInventories:0,quality:'No matchup data'};
 const heroMap=new Map(catalog.heroes.map(h=>[norm(h.name),h]));
 const itemMap=new Map(catalog.items.map(i=>[norm(i.name),i]));
 const idMap=new Map(catalog.items.map(i=>[String(i.id),i]));
 const fallbackItemMap=new Map(Object.entries(catalog.enemyItems||{}).map(([key,tags])=>[norm(key),tags]));
 const unknown=[],byTag=new Map(),matchedHeroes=[],patterns=[],abilityTips=[],tippedHeroes=new Set();
 let knownItems=0,listedItems=0,profiledHeroes=0,observedInventories=0;
 const buildsFrom=(a,b)=>(a?.components||[]).includes(String(b?.id));
 for(const [idx,enemy] of enemies.entries()){
  const hero=heroMap.get(norm(enemy.hero));
  const heroName=hero?.name||String(enemy.hero).slice(0,80);
  const perTag=new Map();
  function pressure(tag,amount,label,kind){
   if(!TAG_LABELS[tag]||!Number.isFinite(amount)||amount<=0)return;
   const record=perTag.get(tag)||{hero:0,items:0,pairs:0,sources:[]};
   if(kind==='hero')record.hero+=amount;else if(kind==='pair')record.pairs+=amount;else record.items+=amount;
   record.sources.push({name:label,kind,enemy:idx});perTag.set(tag,record);
  }
  if(hero&&!hero.unverified&&!tippedHeroes.has(hero.name)){
   tippedHeroes.add(hero.name);
   const kit=Array.isArray(hero.abilities)&&hero.abilities.length?hero.abilities:null;
   for(const cue of ABILITY_CUES[hero.name]||[])if(!kit||kit.includes(cue.name))abilityTips.push({hero:hero.name,ability:cue.name,note:cue.note});
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
  const recognized=new Set();
  for(const raw of uniqueEnemyItems){
   listedItems++;
   const item=itemMap.get(norm(raw));
   const curated=fallbackItemMap.get(norm(raw));
   let tags=[];
   // Reviewed per-item tags beat shop-group guesses (Silencer's group is
   // EWeaponRange, but its threat is the silence).
   if(curated){tags=curated;knownItems++;}
   else if(item){
    tags=ENEMY_GROUPS[item.group]||[];
    if(!tags.length&&item.category==='spirit')tags=['spirit'];
    if(!tags.length&&item.category==='weapon')tags=['bullet'];
    knownItems++;
   }else{unknown.push('Unrecognized item: '+raw);continue;}
   recognized.add(norm(raw));
   // Named, observed purchases contribute more than unverified hero archetypes.
   for(const tag of tags)pressure(tag,item?.tier>=3?0.85:0.65,`${heroName} · ${item?.name||raw}`,'item');
  }
  // Pairs only count when both are recognized purchases of this same enemy.
  for(const pattern of PURCHASE_PATTERNS){
   const keys=pattern.items.map(norm);
   if(!keys.every(k=>recognized.has(k)))continue;
   const [a,b]=keys.map(k=>itemMap.get(k));
   if(buildsFrom(a,b)||buildsFrom(b,a))continue;
   patterns.push({hero:heroName,items:pattern.items.slice(),description:pattern.description,advice:pattern.advice});
   for(const [tag,weight] of Object.entries(pattern.tags))pressure(tag,weight,`${heroName} · ${pattern.items.join(' + ')}`,'pair');
  }
  for(const [tag,x] of perTag){
   // Diminishing returns for multiple effects of the same kind on one player.
   const bounded=Math.min(2.3,x.hero+1.25*(1-Math.exp(-x.items/1.25))+Math.min(.65,x.pairs));
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
  // Name only the evidence that actually drove this item's top reasons.
  const kinds=new Set(leads.flatMap(x=>x.source.map(s=>s.kind)));
  const evidence=[kinds.has('item')&&'Enemy purchases',kinds.has('pair')&&'Item pair',kinds.has('hero')&&'Hero profiles',heroNotes.length&&'Matchup note'].filter(Boolean);
  const affordable=soulCount>=effectiveCost;
  return {id:item.id,name:item.name,cost,effectiveCost,upgradeFrom,category:item.category||'vitality',icon:item.icon||'',
   score:Math.round(score*100)/100,affordable,missing:Math.max(0,effectiveCost-soulCount),
   tags:leads.map(x=>x.tag),reasons,sources,coverage:coveredEnemies.size,
   why:item.why||`Can help against ${reasons.join(', ').toLowerCase()}. Verify its current in-game tooltip and activation conditions.`,
   caution:item.caution||'A reviewable category heuristic, not a verified ability-by-ability counter. Item slots, cooldowns, positioning and patch-specific effects are not modeled.',
   confidence:item.id.startsWith('starter:')?'starter':heroNotes.length?'matchup + category':'category rule',heroNotes,evidence,
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
 return {results:filtered.slice(0,12),quickBuys,threats:[...byTag].map(([name,value])=>({name,label:TAG_LABELS[name],value:Math.round(value.score*100)/100,level:threatLevel(value.score),coverage:value.enemies.size})).sort((a,b)=>b.value-a.value),
 patterns:patterns.slice(0,8),abilityTips:abilityTips.slice(0,12),
 unknown,knownItems,listedItems,count:enemies.length,totalCandidates:all.length,observedInventories,quality};
}
root.DeadlockEngine={createCatalog,recommend,itemSuggestions,resolveItemName,threatLevel,cleanList,norm,TAG_LABELS,COUNTERS,ENEMY_GROUPS,MATCHUPS,OWN_AFFINITY,STRATEGY,ABILITY_CUES,PURCHASE_PATTERNS};
})(typeof window!=='undefined'?window:globalThis);
