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
// Live feeds can use old or internal hero names (Overwolf sends "VIPER" for
// Vyper). Match the name first, then the game's hero ID (synced catalog only),
// then a known rename; otherwise keep the name as sent. Overwolf sends
// "UNKNOWN" for heroes its own table lacks (Deadman Danny and Rat King in a
// 2026-10-18 match): only the ID can name those, else the slot is left blank
// for the player to pick.
const HERO_ALIASES={viper:'Vyper'};
const HERO_PLACEHOLDERS=new Set(['','unknown','none']);
// Heroes newer than the synced catalog (Violet, ID 86, in October 2026) are
// named from the match service's hero list (catalog.extraHeroNames, by ID).
// A name still unmatched and in capitals ("VIOLET") is shown as "Violet".
const titleCase=n=>/[A-Z]/.test(n)&&n===n.toUpperCase()?n.toLowerCase().replace(/(^|[\s'&.-])([a-z])/g,(m,p,c)=>p+c.toUpperCase()):n;
function resolveHeroName(catalog,name,id){
 const byName=n=>n?catalog.heroes.find(h=>norm(h.name)===norm(n))?.name:undefined;
 const gameId=Number(id),validId=id!=null&&Number.isInteger(gameId)&&gameId>0;
 const byId=validId?catalog.heroes.find(h=>h.id===gameId)?.name:undefined;
 const fallback=validId?catalog.extraHeroNames?.[String(gameId)]:undefined;
 const byFallback=fallback?byName(fallback)||fallback:undefined;
 if(HERO_PLACEHOLDERS.has(norm(name)))return byId||byFallback||'';
 return byName(name)||byId||byFallback||byName(HERO_ALIASES[norm(name)])||titleCase(String(name||''));
}
// A hero named only by the hero list (a game update newer than the catalog and
// the curated profiles) is shown as "<Name> · new hero"; its threat comes
// from its purchases alone.
const NEW_HERO={label:' · new hero',tip:'No reviewed profile yet; counters use their purchases'};
const listedHeroes=catalog=>Object.entries(catalog.extraHeroNames||{});
function isNewHero(catalog,name){
 const key=norm(name);
 return !!key&&!catalog.heroes.some(h=>norm(h.name)===key)&&listedHeroes(catalog).some(([,n])=>norm(n)===key);
}
// The game's hero ID for a name (build data is fetched by ID), new heroes included.
function heroGameId(catalog,name){
 const key=norm(name),id=catalog.heroes.find(h=>norm(h.name)===key)?.id;
 if(Number.isInteger(id))return id;
 const listed=key?listedHeroes(catalog).find(([,n])=>norm(n)===key):null;
 return listed?Number(listed[0]):null;
}
function createCatalog(base,snapshot){
 if(!snapshot||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.heroes)){
  return {heroes:Object.keys(base.heroes).map(name=>({name,id:name,tags:base.heroes[name],portrait:'',unverified:base.unverifiedHeroes.includes(name)})),
   items:base.counterItems.map((x,i)=>({id:'starter:'+i,name:x.name,cost:x.cost,category:'vitality',icon:'',weights:x.weights,why:x.why,caution:x.caution,synergy:x.synergy})),
   enemyItems:base.enemyItems,complete:false,build:'starter',generatedAt:base.rosterDate};
 }
 const synced=new Set(snapshot.heroes.map(h=>norm(h.name)));
 // Curated heroes the public roster doesn't list yet (new or ballot heroes).
 const curatedOnly=Object.keys(base.heroes).filter(name=>!synced.has(norm(name))).map(name=>({name,id:name,tags:base.heroes[name],portrait:'',unverified:base.unverifiedHeroes.includes(name)||!base.heroes[name].length}));
 const extraHeroNames=Object.fromEntries(Object.entries(snapshot.extraHeroNames||{}).filter(([id,n])=>/^\d{1,5}$/.test(id)&&typeof n==='string'&&n.trim()&&n.length<=40).map(([id,n])=>[id,n.trim()]));
 const investment=validTable(snapshot.investment?.default)?{default:snapshot.investment.default,heroes:Object.fromEntries(Object.entries(snapshot.investment.heroes||{}).filter(([id,t])=>/^\d{1,5}$/.test(id)&&validTable(t)))}:null;
 return {investment,heroes:[...snapshot.heroes.map(h=>({...h,portrait:iconPath(h.portrait),tags:base.heroes[h.name]||[],unverified:!Object.prototype.hasOwnProperty.call(base.heroes,h.name)})),...curatedOnly],extraHeroNames,
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
// Feed item lists: Overwolf sends display names (which can be stale) plus the
// game's class names, which are the synced catalog's item IDs. Prefer the ID,
// then a recognized name; otherwise keep the name as sent.
function resolveFeedItems(catalog,names,ids){
 const list=cleanList(names);
 const aligned=Array.isArray(ids)&&ids.length===list.length;
 const byId=new Map(catalog.items.map(i=>[i.id,i.name]));
 return list.map((name,i)=>(aligned&&byId.get(ids[i]))||resolveItemName(catalog,name)).join(', ');
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
// Investment bonuses: total souls in a category's items unlock a bonus at
// each step (weapon: % weapon damage, vitality: % health, spirit: spirit
// power). The live table comes from the game's hero data via the match
// service (catalog.investment); this built-in copy (October 2026) is the
// fallback. Selling an item loses its investment.
const DEFAULT_INVESTMENT={
 weapon:[[800,9],[1600,12],[2400,15],[3200,18],[4800,46],[6400,54],[8000,62],[11200,74],[16000,86],[22400,100],[28800,115]],
 vitality:[[800,9],[1600,12],[2400,15],[3200,20],[4800,38],[6400,42],[8000,46],[11200,50],[16000,54],[22400,60],[28800,66]],
 spirit:[[800,7],[1600,11],[2400,15],[3200,19],[4800,38],[6400,45],[8000,52],[11200,59],[16000,66],[22400,75],[28800,100]]
};
const INVESTMENT_UNITS={weapon:'% weapon damage',vitality:'% health',spirit:' spirit power'};
const bonusAt=(table,spent)=>{let bonus=0;for(const [at,b] of table||[])if(spent>=at)bonus=b;return bonus;};
const validTable=t=>t&&['weapon','vitality','spirit'].every(c=>Array.isArray(t[c])&&t[c].length&&t[c].every(x=>Array.isArray(x)&&x.length===2&&x.every(n=>Number.isFinite(n)&&n>=0)));
// Match phase: from the live clock ("mm:ss" or seconds) when there is one,
// otherwise estimated from your net worth (souls spent on items plus unspent).
const PHASE_LABELS={laning:'Laning',mid:'Mid game',late:'Late game'};
function clockMinutes(clock){
 if(typeof clock==='number')return Number.isFinite(clock)&&clock>=0?clock/60:null;
 const m=/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(String(clock||'').trim());
 return m?(Number(m[1]||0)*60+Number(m[2])+Number(m[3])/60):null;
}
function matchPhase(clock,netWorth){
 const minutes=clockMinutes(clock);
 if(minutes!==null)return {key:minutes<10?'laning':minutes<25?'mid':'late',source:'clock',minutes:Math.floor(minutes)};
 return {key:netWorth<9000?'laning':netWorth<28000?'mid':'late',source:'souls',minutes:null};
}
// What each phase favors: item tiers (800 / 1,600 / 3,200 / 6,400), which
// threats matter more, and how counters and build picks are balanced.
const PHASE_TUNING={
 laning:{tier:{1:1.1,2:1.05,3:.45,4:.15},threat:{range:1.2,sustain:1.15,slow:1.05,burst:.9,area:.85,control:.9},counter:.85,build:1.15},
 mid:{tier:{1:.7,2:1,3:1.05,4:.75},threat:{},counter:1,build:.95},
 late:{tier:{1:.35,2:.65,3:1,4:1.15},threat:{burst:1.15,control:1.2,area:1.15,range:.9,sustain:1.05},counter:1.1,build:.8}
};
// The opening buys: most players buy two or three 800-soul items before their
// first 1,600 (deadlock-api purchase data, all ranks: about 70% of purchases
// before 10:00 cost 800 and under 2% cost 3,200 or more). Until 2,400 souls
// are in items, 800-soul items lead and bigger ones wait.
const OPENING_SPENT=2400;
const OPENING_TIER={1:1.3,2:.7,3:.25,4:.1};
// While laning, a save target stays within reach: at most 1,600 (800 during
// the opening buys) beyond what you can pay now.
const LANING_SAVE_CAP=1600,OPENING_SAVE_CAP=800;
// A hard counter: a strong, specific answer (weight 2.5+ on its main threat)
// to what your lane opponent has bought into (a purchase plus their hero's
// archetype, or two purchases; without lanes, purchases by two or more
// enemies), costing 1,600 or less. Hero archetypes alone never qualify, and
// damage resist needs a stacked lane (two lane opponents buying into it, or
// one with three such purchases): nearly every laner buys some damage. It
// skips the opening penalty and may lead the picks while laning.
const HARD_COUNTER={weight:2.5,cost:1600,
 specific:{lane:.8,team:1.6,buyers:2},
 damage:{lane:1.8,team:3,buyers:3},damageTags:new Set(['bullet','spirit','burst'])};
const tierOf=item=>[1,2,3,4].includes(Number(item.tier))?Number(item.tier):(Number(item.cost)||0)<=800?1:(Number(item.cost)||0)<=1600?2:(Number(item.cost)||0)<=3200?3:4;
// Shop groups that make an item a build (power) pick, and how central each is.
// Only items with a known group qualify, so no effect is invented for others.
const BUILD_GROUPS={
 ERateOfFire:1,EMagazines:1,EHeadshotEnthusiasts:1,ESpiritSlinger:.9,EBulletVelocity:.85,EWeaponRange:.8,ETankingBullets:.8,EMisc:.75,ESlowingBullets:.7,
 EMoreSpirit:1,EBurstDamage:1,ECooldown:.95,EDuration:.85,ECharges:.85,ESpiritRange:.8,EMagicVulnerability:.8,EMiscSpirit:.75,ESlowingMagic:.7,ECrownControl:.7,EMeleeSpirit:.7,
 EMoreHealth:1,ELifesteal:.9,EBulletProtection:.85,ESpiritProtection:.85,ERevitalization:.85,EAdditionalProtection:.8,EHealing:.8,
 EMovementAndAgility:.75,EMelee:.7,EActives:.6,EDebuffs:.6,EAntiGun:.6,EAntiHealing:.6
};
// While laning you mostly face your lane opponents; other lanes matter when they roam.
const LANE_WEIGHT={lane:1.8,other:.2};
const DURABILITY_GROUPS=new Set(['EMoreHealth','ELifesteal','EBulletProtection','ESpiritProtection','ERevitalization','EAdditionalProtection','EHealing']);
// Your build: souls spent per category, plus your hero's damage type.
function buildProfile(owned,itemMap,ownHero){
 const spent={weapon:0,spirit:0,vitality:0};
 for(const name of owned){const item=itemMap.get(norm(name));if(item&&item.category in spent)spent[item.category]+=Math.max(0,Number(item.cost)||0);}
 const total=spent.weapon+spent.spirit+spent.vitality;
 const shares=total?{weapon:spent.weapon/total,spirit:spent.spirit/total,vitality:spent.vitality/total}:null;
 const tags=ownHero?.tags||[];
 return {spent,total,shares,heroType:tags.includes('spirit')?'spirit':tags.includes('bullet')?'weapon':null};
}
// Your team (allies from the live roster): what they already bring changes
// what you should add. Curated, explainable rules, not a team-composition or
// win-rate model:
//  - anti-heal: enemies sustain and nobody on your team has healing reduction
//    (or someone already does, so another source matters less);
//  - damage mix: your team leans on one damage type and several enemies bought
//    protection against it, so resist shred and the other type get through;
//  - durability: no ally has a durable (sustain) profile or a vitality-heavy
//    build, so durable build items (not counters, which already answer threats) rise.
// They count for more as the match goes on; while laning your lane matters most.
const TEAM_PHASE={laning:.5,mid:1,late:1.2};
// Healing reduction: the sustain answers in COUNTERS (shop names noted).
const ANTI_HEAL={upgrade_healbane:'Healbane',upgrade_toxic_bullets:'Toxic Bullets',upgrade_spirit_burn:'Spirit Burn',upgrade_rupture:'Decay',upgrade_inhibitor:'Inhibitor'};
// Per damage type: items that protect against it, and items that cut through
// that protection. Rusted Barrel and Disarming Hex weaken the shooter instead,
// so they don't count as protection.
const RESIST={
 weapon:{label:'bullet resist',other:'spirit',
  protect:{upgrade_regenerating_bullet_shield:'Battle Vest',upgrade_return_fire:'Return Fire',upgrade_improved_bullet_armor:'Bullet Resilience',upgrade_deflecting_armor:'Plated Armor',upgrade_metal_skin:'Metal Skin',upgrade_weapon_shielding:'Weapon Shielding'},
  shred:{upgrade_bullet_resist_shredder:'Bullet Resist Shredder',upgrade_aprounds:'Armor Piercer',upgrade_banshee_slugs:'Crippling Headshot'}},
 spirit:{label:'spirit resist',other:'weapon',
  protect:{upgrade_magic_shield:"Enchanter's Emblem",upgrade_tech_purge:'Spirit Resilience',upgrade_spirit_bubble:'Spirit Shielding',upgrade_spellbreaker:'Spellbreaker',upgrade_absorbing_armor:'Witchmail'},
  shred:{upgrade_magic_vulnerability:'Mystic Vulnerability',upgrade_escalating_exposure:'Escalating Exposure',upgrade_tech_defense_shredders:'Spirit Shredder',upgrade_banshee_slugs:'Crippling Headshot'}}
};
const TEAM_LEAN=.75;     // share of the team's damage from one type
const TEAM_DEFENDERS=2;  // enemies with protection against that type
// Matches an item by the game's ID, or by shop name (starter catalog, typed text).
const matcher=map=>{const names=new Set(Object.values(map).map(norm));return (item,raw)=>!!(item&&map[item.id])||names.has(norm(item?.name||raw));};
// allies and you: {name,tags,items,known}, plus you:true on yours.
function teamSignals({allies,you,enemies,itemMap,byTag,damageThreat,phaseKey}){
 if(!allies.length)return {signals:[],weaponShare:null,lean:null,isAntiHeal:()=>false,adjust:()=>null};
 const scale=f=>1+(f-1)*TEAM_PHASE[phaseKey];
 const itemOf=raw=>itemMap.get(norm(raw));
 const spend=m=>{
  const by={weapon:0,spirit:0,vitality:0};
  for(const raw of m.items){const it=itemOf(raw);if(it&&it.category in by)by[it.category]+=Math.max(0,Number(it.cost)||0);}
  return by;
 };
 const members=[...allies,you];
 // Each member's weapon share of damage: from purchases once there are
 // enough, otherwise from the hero's curated tags (untagged heroes don't count).
 const leans=members.map(m=>{
  const s=spend(m);
  if(s.weapon+s.spirit>=3000)return s.weapon/(s.weapon+s.spirit);
  const b=m.tags.includes('bullet'),sp=m.tags.includes('spirit');
  return b&&sp?.5:b?1:sp?0:null;
 }).filter(x=>x!==null);
 const weaponShare=leans.length>=3?leans.reduce((a,b)=>a+b,0)/leans.length:null;
 const lean=weaponShare===null?null:weaponShare>=TEAM_LEAN?'weapon':weaponShare<=1-TEAM_LEAN?'spirit':null;
 const signals=[];
 // Anti-heal: needs every ally's inventory before claiming nobody has it.
 const isAntiHeal=matcher(ANTI_HEAL);
 const holder=members.find(m=>m.items.some(raw=>isAntiHeal(itemOf(raw),raw)));
 const sustain=byTag.get('sustain')?.score||0;
 let antiHeal=null;
 if(sustain>=1.2&&holder)antiHeal={up:false,factor:scale(.8),note:holder.you?'You already have anti-heal':`${holder.name} already has anti-heal`};
 else if(sustain>=1.2&&allies.every(a=>a.known))antiHeal={up:true,factor:scale(sustain>=2.5?1.5:1.35),note:'Your team has no anti-heal'};
 if(antiHeal)signals.push({key:'antiheal',label:antiHeal.note,up:antiHeal.up});
 // Damage mix: your team's main damage type against enemies protected from it.
 let mix=null;
 if(lean){
  const r=RESIST[lean],protects=matcher(r.protect);
  const defenders=enemies.filter(e=>cleanList(e.items).some(raw=>protects(itemOf(raw),raw))).length;
  if(defenders>=TEAM_DEFENDERS){
   mix={...r,shreds:matcher(r.shred),defenders,note:`${r.other==='spirit'?'Spirit':'Weapon'} for your ${lean}-heavy team`};
   signals.push({key:'mix',label:`${lean==='weapon'?'Weapon':'Spirit'}-heavy team; ${defenders} enemies bought ${r.label}`,up:true});
  }
 }
 // Durability: a roster of at least three allies, none of them durable.
 const durable=allies.filter(a=>{const s=spend(a),total=s.weapon+s.spirit+s.vitality;return a.tags.includes('sustain')||total>=3000&&s.vitality/total>=.4;});
 const frail=allies.length>=3&&!durable.length&&damageThreat>=1.2;
 if(frail)signals.push({key:'durability',label:'Your team is short on durability',up:true});
 // antiHealPick: one healing-reduction item covers the team, so "no anti-heal"
 // lifts only that one (the best for you). build: the item is a build pick.
 return {signals,weaponShare,lean,isAntiHeal,adjust(item,{antiHealPick,build=false}={}){
  let factor=1;const notes=[];
  const add=(f,text)=>{factor*=f;notes.push({text,up:f>1});};
  if(antiHeal&&isAntiHeal(item)&&(!antiHeal.up||item.id===antiHealPick))add(antiHeal.factor,antiHeal.note);
  // More enemies stacking the resist make shred worth more.
  if(mix&&mix.shreds(item))add(scale(Math.min(1.8,1.4+.1*mix.defenders)),`Shreds ${mix.label} (${mix.defenders} enemies)`);
  // The other damage type: build (power) picks only; defensive counters deal none.
  else if(mix&&build&&item.category===mix.other)add(scale(1.15),mix.note);
  if(frail&&build&&item.category==='vitality'&&DURABILITY_GROUPS.has(item.group))add(scale(you.tags.includes('sustain')?1.35:1.25),'Your team is short on durability');
  return notes.length?{factor,notes}:null;
 }};
}
function recommend(state,catalog,options={}){
 const enemies=(Array.isArray(state.enemies)?state.enemies:[]).filter(e=>e&&String(e.hero||'').trim()).slice(0,6);
 if(!enemies.length)return {results:[],quickBuys:[],threats:[],patterns:[],abilityTips:[],team:{allies:[],weaponShare:null,lean:null,signals:[]},unknown:[],newHeroes:[],count:0,knownItems:0,totalCandidates:0,observedInventories:0,quality:'No matchup data'};
 const heroMap=new Map(catalog.heroes.map(h=>[norm(h.name),h]));
 const itemMap=new Map(catalog.items.map(i=>[norm(i.name),i]));
 const idMap=new Map(catalog.items.map(i=>[String(i.id),i]));
 const fallbackItemMap=new Map(Object.entries(catalog.enemyItems||{}).map(([key,tags])=>[norm(key),tags]));
 const unknown=[],byTag=new Map(),matchedHeroes=[],patterns=[],abilityTips=[],tippedHeroes=new Set(),newHeroes=[];
 let knownItems=0,listedItems=0,profiledHeroes=0,observedInventories=0;
 const buildsFrom=(a,b)=>(a?.components||[]).includes(String(b?.id));
 const soulCount=Math.max(0,Math.min(1000000,Number(state.souls)||0));
 const owned=new Set(cleanList(state.owned).map(norm));
 const ownHero=heroMap.get(norm(state.hero));
 const ownTags=ownHero?.tags||[];
 const profile=buildProfile(cleanList(state.owned),itemMap,ownHero);
 const phase=matchPhase(options.clock,profile.total+soulCount);
 const tune=PHASE_TUNING[phase.key];
 const opening=phase.key==='laning'&&profile.total<OPENING_SPENT;
 // While laning, what you pay now sets the tier (an upgrade costs only the
 // difference); later, the item's own tier does.
 const tierWeight=(item,effectiveCost,hard)=>phase.key!=='laning'?tune.tier[tierOf(item)]:(opening&&!hard?OPENING_TIER:tune.tier)[tierOf({cost:effectiveCost})];
 const investTable=(Number.isInteger(ownHero?.id)&&catalog.investment?.heroes?.[ownHero.id])||catalog.investment?.default||DEFAULT_INVESTMENT;
 const investment=Object.fromEntries(['weapon','vitality','spirit'].map(c=>{
  const spent=profile.spent[c]||0,table=investTable[c],next=table.find(([at])=>at>spent);
  return [c,{spent,bonus:bonusAt(table,spent),unit:INVESTMENT_UNITS[c],next:next?{at:next[0],bonus:next[1]}:null}];
 }));
 // What buying an item adds to its category's bonus. An upgrade replaces its
 // component's value, so only the difference counts. Most steps are small and
 // every purchase crosses one, so only a spike (one step worth 15% or more of
 // the category's maximum, like the 4,800 step) raises the score, up to +25%.
 const investmentGain=(item,component)=>{
  const c=item.category,table=investTable[c];if(!table)return null;
  const spent=profile.spent[c]||0;
  const value=spent-(component&&component.category===c?Math.max(0,Number(component.cost)||0):0)+Math.max(0,Number(item.cost)||0);
  const gain=bonusAt(table,value)-bonusAt(table,spent);
  if(gain<=0)return null;
  const top=table[table.length-1][1]||1;
  let prev=0,spike=0,spikeAt=null,at=null;
  for(const [t,b] of table){if(t>spent&&t<=value){at=t;if(b-prev>=.15*top){spike+=b-prev;spikeAt=t;}}prev=b;}
  return {category:c,gain,at:spikeAt||at,unit:INVESTMENT_UNITS[c],factor:1+Math.min(.25,.75*spike/top),notable:spike>0};
 };
 // While laning, the enemies in your lane matter most: their pressure counts
 // more and the rest of the team's less (needs lanes from the live roster).
 const ownLane=Number(state.ownLane)||null;
 const laneFocus=phase.key==='laning'&&!!ownLane&&enemies.some(e=>Number(e.lane)===ownLane);
 const laneOpponents=laneFocus?enemies.filter(e=>Number(e.lane)===ownLane).map(e=>String(e.hero)):[];
 const laneTags=new Map(),matchupWeight=new Map();
 // Per threat: lane opponents, and enemies overall, whose purchases show it.
 const laneBuyers=new Map(),teamBuyers=new Map();
 for(const [idx,enemy] of enemies.entries()){
  const inLane=laneFocus&&Number(enemy.lane)===ownLane;
  // Applied after the per-enemy cap, so your lane opponent can clearly lead.
  const laneWeight=laneFocus?(inLane?LANE_WEIGHT.lane:LANE_WEIGHT.other):1;
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
   if(MATCHUPS[hero.name]){matchedHeroes.push(hero.name);matchupWeight.set(hero.name,laneWeight);}
  }else if(isNewHero(catalog,heroName)){newHeroes.push(heroName);unknown.push(heroName+NEW_HERO.label);}
  else unknown.push(`Unknown enemy hero: ${heroName}`);
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
   if(!byTag.has(tag))byTag.set(tag,{score:0,pick:0,sources:[],enemies:new Set()});
   // score: shown as the threat level. pick: drives item scores; the lane
   // weight is squared because item scores take a square root of it.
   const acc=byTag.get(tag);acc.score+=bounded*laneWeight;acc.pick+=bounded*laneWeight*laneWeight;acc.sources.push(...x.sources);acc.enemies.add(idx);
   if(inLane)laneTags.set(tag,(laneTags.get(tag)||0)+bounded);
   if(x.items>0||x.pairs>0){teamBuyers.set(tag,(teamBuyers.get(tag)||0)+1);if(inLane)laneBuyers.set(tag,(laneBuyers.get(tag)||0)+1);}
  }
 }
 const strategy=STRATEGY[options.strategy]||STRATEGY.balanced;
 // How well an item's category fits your build. Concentrated investment pays
 // off in Deadlock, so a category you've bought into scores higher; before
 // your first item, your hero's damage type decides. Past laning, everyone
 // needs some vitality.
 const alignment=category=>{
  let fit=profile.shares?.35+.9*(profile.shares[category]||0):profile.heroType?(category===profile.heroType?.95:category==='vitality'?.6:.4):.6;
  if(category==='vitality'&&phase.key!=='laning')fit=Math.max(fit,.5);
  return fit;
 };
 const damageThreat=Math.max(...['bullet','spirit','burst'].map(tag=>byTag.get(tag)?.score||0));
 // Build data (optional, from the main process): the share of popular builds
 // for your hero that include an item in this phase's stage, and how often
 // players on your hero win after buying it in this phase (against your lane
 // opponents while laning, when that sample is big enough).
 const bd=options.buildData&&typeof options.buildData==='object'?options.buildData:null;
 const buildCount=Number(bd?.builds?.count)||0;
 const stageShares=buildCount>=3&&bd.builds.stages?.[phase.key]||{};
 const useMatchup=laneFocus&&!!bd?.matchup&&Object.keys(bd.matchup).length>=10;
 const statSource=(useMatchup?bd.matchup:bd?.stats?.[phase.key])||{};
 // Win rates are compared within a tier: later, pricier items show higher raw
 // win rates because only longer games reach them.
 const tierBase={};
 for(const [cls,st] of Object.entries(statSource)){
  const it=idMap.get(cls);if(!it||!(st?.m>0))continue;
  const t=tierOf(it);tierBase[t]=tierBase[t]||{w:0,m:0};tierBase[t].w+=st.w;tierBase[t].m+=st.m;
 }
 const backingOf=item=>{
  const share=Number(stageShares[item.id])||0,st=statSource[item.id],base=tierBase[tierOf(item)];
  const wr=st?.m>0?st.w/st.m:null,lift=wr!==null&&base?.m?wr-base.w/base.m:0;
  return {share,builds:buildCount,wr:wr===null?null:Math.round(wr*1000)/1000,base:base?.m?Math.round(base.w/base.m*1000)/1000:null,matches:st?.m||0,vs:useMatchup?laneOpponents:[],
   boost:(1+.5*share)*(1+Math.max(-.15,Math.min(.25,lift*3)))};
 };
 const durabilityGap=phase.key!=='laning'&&(profile.shares?.vitality||0)<.15&&damageThreat>=1.2;
 // Your allies (live roster only; manual entry has none).
 const allies=(Array.isArray(state.allies)?state.allies:[]).filter(a=>a&&String(a.hero||'').trim()).slice(0,5).map(a=>{
  const hero=heroMap.get(norm(a.hero)),items=cleanList(a.items).slice(0,20);
  return {name:hero?.name||String(a.hero).slice(0,80),tags:hero&&!hero.unverified?hero.tags||[]:[],items,known:a.inventoryKnown===true||items.length>0};
 });
 const team=teamSignals({allies,you:{name:ownHero?.name||'',tags:ownTags,items:cleanList(state.owned),known:true,you:true},enemies,itemMap,byTag,damageThreat,phaseKey:phase.key});
 // Applied after an item's own score; the notes show on its pick card.
 const withTeam=(r,context)=>{
  const t=team.adjust(idMap.get(String(r.id))||r,context);
  if(t){r.score=Math.round(r.score*t.factor*100)/100;r.team=t.notes;r.evidence=[...r.evidence,'Your team'];}
  return r;
 };
 const all=catalog.items.filter(i=>!owned.has(norm(i.name))).map(item=>{
  const weights=item.weights||COUNTERS[item.id];
  if(!weights)return null; // never manufacture effects for unreviewed shop items
  const contributes=Object.entries(weights).filter(([tag,weight])=>byTag.has(tag)&&Number(weight)>0).map(([tag,weight])=>{
   // tagFactors: optional per-threat weighting (the debrief uses it to lean
   // toward the damage a player actually took).
   const t=byTag.get(tag),factor=(strategy[tag]||1)*(Number(options.tagFactors?.[tag])||1)*(tune.threat[tag]||1);
   return {tag,raw:Math.sqrt(t.pick)*Number(weight)*factor,source:t.sources,enemies:t.enemies};
  }).sort((a,b)=>b.raw-a.raw);
  if(!contributes.length)return null;
  const coveredEnemies=new Set(contributes.flatMap(x=>[...x.enemies]));
  const cost=Math.max(0,Number(item.cost)||0);
  const validComponents=(item.components||[]).map(c=>idMap.get(String(c))).filter(c=>c&&owned.has(norm(c.name)));
  const credit=Math.min(cost,validComponents.reduce((best,c)=>Math.max(best,Number(c.cost)||0),0));
  const upgradeFrom=validComponents.sort((a,b)=>b.cost-a.cost)[0]?.name||'';
  const effectiveCost=Math.max(0,cost-credit);
  const invest=investmentGain(item,validComponents[0]||null);
  const fitTags=OWN_AFFINITY[item.id]||[];
  const ownMatch=fitTags.some(t=>ownTags.includes(t));
  const fit=item.synergy?(ownTags.includes(item.synergy)?1.12:0.78):(fitTags.length?(ownMatch?1.08:0.92):1);
  const lead=contributes[0];
  const need=HARD_COUNTER.damageTags.has(lead.tag)?HARD_COUNTER.damage:HARD_COUNTER.specific;
  const bought=laneFocus?(laneBuyers.get(lead.tag)||0)>=1&&(laneTags.get(lead.tag)||0)>=need.lane:(teamBuyers.get(lead.tag)||0)>=need.buyers&&(byTag.get(lead.tag)?.score||0)>=need.team;
  const hard=phase.key==='laning'&&effectiveCost<=HARD_COUNTER.cost&&Number(weights[lead.tag])>=HARD_COUNTER.weight&&bought;
  const tierFit=tierWeight(item,effectiveCost,hard)*(upgradeFrom&&phase.key!=='laning'?1.1:1);
  const align=alignment(item.category||'vitality');
  const matchupBonus=matchedHeroes.reduce((sum,h)=>sum+(MATCHUPS[h]?.items[item.id]||0)*(matchupWeight.get(h)??1),0);
  // Covering more enemies helps; while laning, covering your lane opponents counts most.
  const coverage=[...coveredEnemies].reduce((sum,i)=>sum+(laneFocus?(Number(enemies[i].lane)===ownLane?LANE_WEIGHT.lane:LANE_WEIGHT.other):1),0);
  const backing=backingOf(item);
  const score=(contributes.reduce((sum,x)=>sum+x.raw,0)*fit*tierFit*(.9+.2*align)*tune.counter + Math.min(1.0,coverage*.12)+matchupBonus)*backing.boost*(invest?.factor||1);
  const leads=contributes.slice(0,3);
  const reasons=leads.map(x=>TAG_LABELS[x.tag]);
  const sources=Array.from(new Set(leads.flatMap(x=>x.source.map(y=>y.name)))).slice(0,5);
  const heroNotes=matchedHeroes.filter(name=>MATCHUPS[name].items[item.id]).slice(0,2).map(name=>`${name}: ${MATCHUPS[name].note}`);
  // Name only the evidence that actually drove this item's top reasons.
  const kinds=new Set(leads.flatMap(x=>x.source.map(s=>s.kind)));
  const evidence=[kinds.has('item')&&'Enemy purchases',kinds.has('pair')&&'Item pair',kinds.has('hero')&&'Hero profiles',heroNotes.length&&'Matchup note'].filter(Boolean);
  // The enemy purchases behind this pick's top reasons ("vs Burst Fire, Rapid Rounds").
  // While laning, cite your lane opponents' items first.
  const itemSources=leads.flatMap(x=>x.source.filter(y=>y.kind==='item'));
  const laneSources=laneFocus?itemSources.filter(y=>Number(enemies[y.enemy]?.lane)===ownLane):[];
  const vsItems=[...new Set((laneSources.length?laneSources:itemSources).map(y=>String(y.name).split(' · ').pop()))].slice(0,3);
  const affordable=soulCount>=effectiveCost;
  return {id:item.id,name:item.name,cost,effectiveCost,upgradeFrom,category:item.category||'vitality',icon:item.icon||'',
   score:Math.round(score*100)/100,affordable,missing:Math.max(0,effectiveCost-soulCount),
   tags:leads.map(x=>x.tag),reasons,sources,vsItems,backing,investment:invest,hardCounter:hard,coverage:coveredEnemies.size,kind:profile.shares&&align>=.75?'both':'counter',
   // The heroes this item answers, in lineup order (shown as portraits on the pick cards).
   counters:[...coveredEnemies].sort((x,y)=>x-y).map(i=>String(enemies[i].hero)),
   why:item.why||`Can help against ${reasons.join(', ').toLowerCase()}. Verify its current in-game tooltip and activation conditions.`,
   caution:item.caution||'A reviewable category heuristic, not a verified ability-by-ability counter. Item slots, cooldowns, positioning and patch-specific effects are not modeled.',
   confidence:item.id.startsWith('starter:')?'starter':heroNotes.length?'matchup + category':'category rule',heroNotes,evidence,
   ownFit:fitTags.length?(ownMatch?'Supports your hero archetype':'General utility; weaker build alignment'):'Broad defensive / utility fit'};
 }).filter(Boolean);
 const antiHealPick=all.filter(r=>team.isAntiHeal(idMap.get(String(r.id))||r)).sort((a,b)=>b.score-a.score)[0]?.id;
 for(const r of all)withTeam(r,{antiHealPick});
 // Rankings are relative suggestions, not precise utility probabilities.
 all.sort((a,b)=>b.score-a.score||a.effectiveCost-b.effectiveCost||a.name.localeCompare(b.name));
 const affordable=all.filter(x=>x.affordable);
 const saving=all.filter(x=>!x.affordable);
 // Build picks: power for your build from the full shop (by category and shop
 // group), excluding items already ranked as counters.
 const counterIds=new Set(all.map(r=>r.id));
 const build=catalog.items.filter(i=>!owned.has(norm(i.name))&&!counterIds.has(i.id)&&(BUILD_GROUPS[i.group]||(Number(stageShares[i.id])||0)>=.35)).map(item=>{
  const category=item.category||'vitality';
  const cost=Math.max(0,Number(item.cost)||0);
  const validComponents=(item.components||[]).map(c=>idMap.get(String(c))).filter(c=>c&&owned.has(norm(c.name)));
  const credit=Math.min(cost,validComponents.reduce((best,c)=>Math.max(best,Number(c.cost)||0),0));
  const upgradeFrom=validComponents.sort((a,b)=>b.cost-a.cost)[0]?.name||'';
  const effectiveCost=Math.max(0,cost-credit);
  const invest=investmentGain(item,validComponents[0]||null);
  const gap=durabilityGap&&category==='vitality'&&DURABILITY_GROUPS.has(item.group);
  const laneHelp=laneFocus&&(item.group==='EBulletProtection'&&(laneTags.get('bullet')||0)>=1||item.group==='ESpiritProtection'&&(laneTags.get('spirit')||0)>=1||['ERevitalization','EHealing','ELifesteal'].includes(item.group)&&[...laneTags.values()].reduce((a,b)=>a+b,0)>=2.5);
  const align=alignment(category);
  const backing=backingOf(item);
  // With a real sample of popular builds (5+), what they take at this stage
  // outweighs the categories you have bought into so far.
  const pathFit=buildCount>=5?.5*align+.9*backing.share:align;
  const score=(invest?.factor||1)*backing.boost*(1+.5*backing.share)*2*pathFit*(BUILD_GROUPS[item.group]||.85)*tierWeight(item,effectiveCost,false)*(category===profile.heroType?1.1:1)*(gap?1.4:1)*(laneHelp?1.35:1)*(upgradeFrom?1.15:1)*tune.build;
  const reason=gap?'Fills a durability gap':laneHelp?`Helps your lane vs ${laneOpponents.join(' and ')}`:profile.shares&&(profile.shares[category]||0)>=.4?`Builds on your ${category} investment`:!profile.shares&&category===profile.heroType?`Fits ${ownHero.name}'s ${category} damage`:upgradeFrom?`Upgrades your ${upgradeFrom}`:backing.share>=.35?`Popular in ${ownHero?.name||'your hero'}'s builds`:'Rounds out your build';
  const affordable=soulCount>=effectiveCost;
  return {id:item.id,name:item.name,cost,effectiveCost,upgradeFrom,category,icon:item.icon||'',
   score:Math.round(score*100)/100,affordable,missing:Math.max(0,effectiveCost-soulCount),
   tags:[],reasons:[reason],sources:[],vsItems:[],backing,investment:invest,hardCounter:false,coverage:0,kind:'build',counters:[],gap,
   why:`${reason}. ${item.groupLabel?item.groupLabel+' item':'Shop item'} for the ${PHASE_LABELS[phase.key].toLowerCase()} stage.`,
   caution:'A build-fit heuristic from the item\'s shop category and group, your purchases, the match phase and the investment bonus steps. It does not model exact stat values.',
   confidence:'build fit',heroNotes:[],evidence:['Your build'],ownFit:reason};
 }).map(r=>withTeam(r,{build:true})).sort((a,b)=>b.score-a.score||a.effectiveCost-b.effectiveCost||a.name.localeCompare(b.name));
 // Three picks: the strongest counter and the strongest build item (even if
 // you must save for them), a durability pick when there is a gap, then at
 // least one item you can buy now and one worth saving for, taken from the
 // side the phase leans to (build while laning, counters later).
 // While laning: only the strongest hard counter keeps its flag; save targets
 // stay within reach; counters must answer someone in your lane; during the
 // opening buys there is no separate save card (a hard counter is the
 // exception); and an item you can buy now comes first.
 if(phase.key==='laning'){const best=all.find(r=>r.hardCounter);for(const r of all)if(r!==best)r.hardCounter=false;}
 const saveCap=opening?OPENING_SAVE_CAP:LANING_SAVE_CAP;
 const reachable=r=>phase.key!=='laning'||(r.affordable||r.hardCounter||r.effectiveCost<=saveCap)&&(!laneFocus||r.kind==='build'||r.counters.some(h=>laneOpponents.includes(h)));
 const quickBuys=[],taken=new Set();
 const take=r=>{if(r&&!taken.has(r.name)&&quickBuys.length<3){quickBuys.push(r);taken.add(r.name);}};
 const top=list=>list.find(r=>!taken.has(r.name)&&reachable(r));
 take(top(all));
 take(top(build));
 if(durabilityGap&&!quickBuys.some(r=>r.gap))take(top(build.filter(r=>r.gap)));
 const lean=phase.key==='laning'?[build,all]:[all,build];
 const firstOf=test=>{for(const list of lean){const r=list.find(x=>!taken.has(x.name)&&reachable(x)&&test(x));if(r)return r;}};
 if(!quickBuys.some(r=>r.affordable))take(firstOf(r=>r.affordable));
 if(!opening&&!quickBuys.some(r=>!r.affordable))take(firstOf(r=>!r.affordable));
 for(const list of lean)while(quickBuys.length<3&&top(list))take(top(list));
 if(phase.key==='laning'){const rank=r=>r.hardCounter?0:r.affordable?1:2;quickBuys.sort((a,b)=>rank(a)-rank(b));}
 const sort=options.sort||'smart';
 if(sort==='affordable')all.sort((a,b)=>Number(b.affordable)-Number(a.affordable)||b.score-a.score);
 else if(sort==='cost')all.sort((a,b)=>a.effectiveCost-b.effectiveCost||b.score-a.score);
 const filtered=all.filter(r=>(!options.category||options.category==='all'||r.category===options.category)&&(!options.affordableOnly||r.affordable));
 const quality=!catalog.complete?'Starter catalog':profiledHeroes===0?'Limited profiles':listedItems>0&&knownItems<listedItems?'Partial item recognition':listedItems===0?'Hero profiles only':'Hero + recognized item evidence';
 return {results:filtered.slice(0,12),quickBuys,threats:[...byTag].map(([name,value])=>({name,label:TAG_LABELS[name],value:Math.round(value.score*100)/100,level:threatLevel(value.score),coverage:value.enemies.size})).sort((a,b)=>b.value-a.value),
 patterns:patterns.slice(0,8),abilityTips:abilityTips.slice(0,12),
 buildPicks:build.slice(0,6),
 phase:{key:phase.key,label:PHASE_LABELS[phase.key],source:phase.source,minutes:phase.minutes,opening},
 build:{shares:profile.shares,spent:profile.total,heroType:profile.heroType,durabilityGap},
 lane:{focus:laneFocus,opponents:laneOpponents},
 investment:{...investment,source:catalog.investment?'game data':'built-in'},
 team:{allies:allies.map(a=>a.name),weaponShare:team.weaponShare===null?null:Math.round(team.weaponShare*100)/100,lean:team.lean,signals:team.signals},
 buildData:{builds:buildCount,stats:Object.keys(statSource).length,matchup:useMatchup},
 unknown,newHeroes,knownItems,listedItems,count:enemies.length,totalCandidates:all.length,observedInventories,quality};
}
root.DeadlockEngine={createCatalog,resolveHeroName,NEW_HERO,isNewHero,heroGameId,resolveFeedItems,recommend,DEFAULT_INVESTMENT,OPENING_SPENT,OPENING_TIER,LANING_SAVE_CAP,OPENING_SAVE_CAP,HARD_COUNTER,matchPhase,clockMinutes,PHASE_TUNING,BUILD_GROUPS,LANE_WEIGHT,itemSuggestions,resolveItemName,threatLevel,cleanList,norm,TAG_LABELS,COUNTERS,ENEMY_GROUPS,MATCHUPS,OWN_AFFINITY,STRATEGY,ABILITY_CUES,PURCHASE_PATTERNS,TEAM_PHASE,ANTI_HEAL,RESIST};
})(typeof window!=='undefined'?window:globalThis);
