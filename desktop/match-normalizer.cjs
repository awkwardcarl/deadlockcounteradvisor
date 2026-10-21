'use strict';
/** Turns raw Deadlock match metadata (api.deadlock-api.com) into the compact
 * shape the debrief needs. Pure: no network or file access. Account IDs are
 * used only to find the requesting player's slot and are never copied into
 * the result, so other players' IDs never reach the renderer or disk. */

// Valve's CMsgMatchPlayerDamageMatrix.EStatType values.
const STAT_DAMAGE=0;
const clean=(value,max=80)=>String(value??'').trim().slice(0,max);
const num=value=>Number.isFinite(Number(value))?Number(value):0;

// Damage source names -> a player-facing category. The generic names are
// aggregates that overlap the specific weapon/ability/item sources (counting
// both roughly doubles the total), so they are skipped; the specific sources
// add up to within a few percent of the player's own damage-taken stat.
const AGGREGATE_SOURCES=new Set(['Bullet','Ability','Melee','UnknownAbility']);
function damageCategory(source){
  const name=String(source||'');
  if(AGGREGATE_SOURCES.has(name))return null;
  if(/^citadel_weapon_/.test(name))return 'weapon';
  if(/^(ability|citadel_ability)_melee/.test(name))return 'melee';
  if(/^upgrade_/.test(name))return 'items';
  return 'abilities';
}

// Compact asset indexes from /v1/assets/items and /v1/assets/heroes.
// A hero's investment bonuses (cost_bonuses): for each category, the souls
// spent in it and the total bonus from that point on, e.g. weapon 4,800 -> 46.
function compactInvestment(raw){
  const out={};
  for(const cat of ['weapon','vitality','spirit']){
    const steps=(Array.isArray(raw?.[cat])?raw[cat]:[]).slice(0,24).map(s=>[num(s?.gold_threshold),num(s?.bonus)]).filter(([t,b])=>t>0&&t<=100000&&b>=0&&b<=1000).sort((a,b)=>a[0]-b[0]);
    if(steps.length)out[cat]=steps;
  }
  return Object.keys(out).length===3?out:null;
}
// Hero card art from deadlock-api's image server, for heroes deadlock.io's
// catalog doesn't list yet (it lags game patches). Only that folder, .png only.
const HERO_ART=/^https:\/\/assets-bucket\.deadlock-api\.com\/assets-api-res\/images\/heroes\/[\w.-]+\.png$/;
const heroArtURL=url=>typeof url==='string'&&HERO_ART.test(url)?url:'';
function compactAssets(itemsRaw,heroesRaw){
  const items={},heroes={},tables={},heroArt={};
  for(const item of Array.isArray(itemsRaw)?itemsRaw:[]){
    if(!Number.isFinite(Number(item?.id))||item.type!=='upgrade')continue;
    items[String(item.id)]={c:clean(item.class_name,80),n:clean(item.name,80),cost:num(item.cost),tier:num(item.item_tier),slot:clean(item.item_slot_type,20)};
  }
  for(const hero of Array.isArray(heroesRaw)?heroesRaw:[]){
    if(Number.isFinite(Number(hero?.id))&&hero.name)heroes[String(hero.id)]=clean(hero.name,60);
    const art=heroArtURL(hero?.images?.icon_hero_card)||heroArtURL(hero?.images?.icon_image_small);
    if(art&&Number.isFinite(Number(hero?.id)))heroArt[String(hero.id)]=art;
    const table=compactInvestment(hero?.cost_bonuses);
    if(table&&Number.isFinite(Number(hero?.id)))tables[String(hero.id)]=table;
  }
  // Most heroes share one table; keep it once, plus any hero that differs.
  const counts={};
  for(const t of Object.values(tables)){const k=JSON.stringify(t);counts[k]=(counts[k]||0)+1;}
  const common=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const investment=common?{default:JSON.parse(common),heroes:Object.fromEntries(Object.entries(tables).filter(([,t])=>JSON.stringify(t)!==common))}:null;
  return {items,heroes,investment,heroArt};
}

function normalizeMatch(raw,assets,ownAccountId=''){
  const info=raw?.match_info;
  if(!info||!Array.isArray(info.players)||!info.players.length)throw new Error('Match data is missing players');
  const items=assets?.items||{},heroes=assets?.heroes||{};
  const own=String(ownAccountId||'');
  let youSlot=null;
  const players=info.players.map(p=>{
    const slot=num(p.player_slot);
    if(own&&String(p.account_id)===own)youSlot=slot;
    const purchases=(Array.isArray(p.items)?p.items:[]).map(i=>{
      const a=items[String(i.item_id)];
      if(!a)return null; // abilities and ability upgrades share this list
      return {t:num(i.game_time_s),sold:num(i.sold_time_s),upgraded:(num(i.flags)&1)===1,className:a.c,name:a.n,cost:a.cost,tier:a.tier,slot:a.slot};
    }).filter(Boolean).sort((a,b)=>a.t-b.t);
    const timeline=(Array.isArray(p.stats)?p.stats:[]).map(s=>({
      t:num(s.time_stamp_s),netWorth:num(s.net_worth),kills:num(s.kills),deaths:num(s.deaths),assists:num(s.assists),
      heroDamage:num(s.player_damage),damageTaken:num(s.player_damage_taken),healing:num(s.player_healing)+num(s.self_healing),
      soulsLostOnDeath:num(s.gold_death_loss),damageMitigated:num(s.damage_mitigated),lastHits:num(s.creep_kills)
    })).sort((a,b)=>a.t-b.t);
    const deaths=(Array.isArray(p.death_details)?p.death_details:[]).map(d=>({t:num(d.game_time_s),killerSlot:num(d.killer_player_slot),timeToKill:Math.round(num(d.time_to_kill_s)*10)/10})).sort((a,b)=>a.t-b.t);
    return {slot,team:num(p.team),heroId:num(p.hero_id),hero:heroes[String(p.hero_id)]||`Hero ${num(p.hero_id)}`,lane:num(p.assigned_lane),
      kills:num(p.kills),deaths:num(p.deaths),assists:num(p.assists),netWorth:num(p.net_worth),lastHits:num(p.last_hits),denies:num(p.denies),level:num(p.level),
      purchases,timeline,deathDetails:deaths};
  }).sort((a,b)=>a.team-b.team||a.slot-b.slot);

  // Damage each player took, per dealer and category (stat type Damage only).
  const damageTaken={};
  const matrix=info.damage_matrix||{},details=matrix.source_details||{};
  const types=Array.isArray(details.stat_type)?details.stat_type:[],names=Array.isArray(details.source_name)?details.source_name:[];
  for(const dealer of Array.isArray(matrix.damage_dealers)?matrix.damage_dealers:[]){
    const from=num(dealer.dealer_player_slot);
    for(const source of Array.isArray(dealer.damage_sources)?dealer.damage_sources:[]){
      const index=num(source.source_details_index);
      if(num(types[index])!==STAT_DAMAGE)continue;
      const category=damageCategory(names[index]);
      if(!category)continue;
      for(const hit of Array.isArray(source.damage_to_players)?source.damage_to_players:[]){
        const to=num(hit.target_player_slot);
        if(to===from)continue;
        // Values are cumulative samples, so the last one is the match total.
        const total=num(Array.isArray(hit.damage)?hit.damage.at(-1):0);
        if(!total)continue;
        const rows=damageTaken[to]||(damageTaken[to]={});
        const row=rows[from]||(rows[from]={dealerSlot:from,weapon:0,melee:0,abilities:0,items:0,total:0});
        row[category]+=total;row.total+=total;
      }
    }
  }
  const damage={};
  for(const [to,rows] of Object.entries(damageTaken))damage[to]=Object.values(rows).sort((a,b)=>b.total-a.total);

  return {version:1,matchId:String(info.match_id??''),durationS:num(info.duration_s),winningTeam:num(info.winning_team),startTime:num(info.start_time),
    youSlot,players,damageTaken:damage};
}

module.exports={normalizeMatch,compactAssets,compactInvestment,damageCategory,heroArtURL};
