'use strict';
// Saves a real match for the debrief tests: node tests/update-match-fixture.cjs <matchId>
// Account IDs are replaced with fake ones (100 + player slot) and unused
// fields are dropped, so no real player identifiers are committed.
const fs=require('node:fs');
const path=require('node:path');
const {getJSON}=require('../desktop/match-service.cjs');
const {compactAssets}=require('../desktop/match-normalizer.cjs');
const id=String(process.argv[2]||'');
if(!/^\d{1,12}$/.test(id)){console.error('Usage: node tests/update-match-fixture.cjs <matchId>');process.exit(1);}
const pickStats=s=>({time_stamp_s:s.time_stamp_s,net_worth:s.net_worth,kills:s.kills,deaths:s.deaths,assists:s.assists,player_damage:s.player_damage,
  player_damage_taken:s.player_damage_taken,player_healing:s.player_healing,self_healing:s.self_healing,gold_death_loss:s.gold_death_loss,damage_mitigated:s.damage_mitigated,creep_kills:s.creep_kills});
(async()=>{
  const [raw,items,heroes]=await Promise.all([getJSON(`/v1/matches/${id}/metadata`),getJSON('/v1/assets/items'),getJSON('/v1/assets/heroes')]);
  const info=raw.match_info;
  const trimmed={match_info:{match_id:info.match_id,duration_s:info.duration_s,winning_team:info.winning_team,start_time:info.start_time,
    players:info.players.map(p=>({account_id:100+Number(p.player_slot),player_slot:p.player_slot,team:p.team,hero_id:p.hero_id,assigned_lane:p.assigned_lane,
      kills:p.kills,deaths:p.deaths,assists:p.assists,net_worth:p.net_worth,last_hits:p.last_hits,denies:p.denies,level:p.level,
      items:(p.items||[]).map(i=>({game_time_s:i.game_time_s,item_id:i.item_id,sold_time_s:i.sold_time_s,flags:i.flags})),
      stats:(p.stats||[]).map(pickStats),
      death_details:(p.death_details||[]).map(d=>({game_time_s:d.game_time_s,killer_player_slot:d.killer_player_slot,time_to_kill_s:d.time_to_kill_s}))})),
    damage_matrix:info.damage_matrix}};
  const assets=compactAssets(items,heroes);
  const used=new Set(info.players.flatMap(p=>(p.items||[]).map(i=>String(i.item_id))));
  const fixtureAssets={version:1,fetchedAt:0,items:Object.fromEntries(Object.entries(assets.items).filter(([k])=>used.has(k))),heroes:assets.heroes};
  const dir=path.join(__dirname,'fixtures');
  fs.writeFileSync(path.join(dir,'match-sample.json'),JSON.stringify(trimmed)+'\n');
  fs.writeFileSync(path.join(dir,'match-assets.json'),JSON.stringify(fixtureAssets,null,1)+'\n');
  console.log(`Saved match ${id} (${info.players.length} players, ${info.duration_s}s) with ${Object.keys(fixtureAssets.items).length} items`);
})().catch(e=>{console.error('Fixture update failed:',e.message);process.exit(1);});
