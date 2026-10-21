'use strict';
/** Read-only parser for documented Overwolf GEP event shapes.
 * This module does not connect to Overwolf, Steam, Deadlock, or any process.
 * The only usable data source in a stock Electron build is a user-selected
 * local JSON Lines file. Match and enemy affiliations always fail closed. */
function decode(value){
  if(typeof value==='string') {try{return JSON.parse(value);}catch(_){return value;}}
  return value;
}
function clean(value,max=90){return typeof value==='string'?value.trim().slice(0,max):'';}
// Scoreboard numbers (kills, souls, damage): whole, non-negative, bounded.
function stat(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.min(1e7,Math.floor(n)):0;}
function clockSeconds(clock){const m=/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(String(clock||'').trim());return m?Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3]):null;}
// One death reported by both the scoreboard (your deaths going up) and the
// death event arrives within a few seconds; closer than this is the same death.
const SAME_DEATH_S=10;
// Overwolf's incoming_damage (only while the in-game damage panel is open):
// damage you took over time_filter seconds (-1: this life), by source. The
// sources list may come as {name,value|int} entries, [name,value] pairs or a
// name->value map. Hero sources are named damageby_hero_<hero>.
const DAMAGE_WINDOWS=new Set([-1,30,60,180,300,600]);
function readDamage(data,clock){
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  const raw=data.damages;
  const pairs=Array.isArray(raw)?raw.map(x=>Array.isArray(x)?x:[x?.name,x?.value??x?.int??x?.damage??x?.amount]):raw&&typeof raw==='object'?Object.entries(raw):[];
  const sources=[];let neutrals=0;
  for(const [name,value] of pairs.slice(0,40)){
    const amount=stat(value),key=String(name||'').trim().toLowerCase();
    if(!amount)continue;
    if(key==='damageby_neutrals'){neutrals+=amount;continue;}
    const m=/^damageby_hero_([a-z0-9_ .'-]{1,40})$/.exec(key);
    if(m)sources.push({source:m[1],amount});
  }
  if(!sources.length&&!neutrals)return null;
  const window=Number(data.time_filter);
  return {window:DAMAGE_WINDOWS.has(window)?window:null,total:Math.max(stat(data.total_damage),neutrals+sources.reduce((sum,x)=>sum+x.amount,0)),neutrals,sources:sources.slice(0,12),clock:clean(String(clock||''),12)};
}
function team(player){
  // Require the same identity scheme on both sides; avoid comparing dissimilar ids and names.
  if(clean(player?.team_name))return 'name:'+clean(player.team_name).toLowerCase();
  if(Number.isSafeInteger(Number(player?.team_id))&&player?.team_id!==undefined&&player?.team_id!==null)return 'id:'+String(player.team_id);
  return '';
}
class EventState {
  // withholdEnemyItems: keep the roster and your own items, but report no enemy
  // purchases (used when live enemy-item use isn't approved).
  constructor({withholdEnemyItems=false}={}){this.withholdEnemyItems=withholdEnemyItems===true;this.clear();}
  clear(){this.roster=new Map();this.items=new Map();this.matchId='';this.phase='unknown';this.clock='';this.count=0;this.deaths=[];this.ownDeaths=null;this.damage=null;}
  // Your deaths, with the match clock at each: from your scoreboard deaths
  // going up and from the death event, merged when both report the same one.
  // Deaths from before the app joined the match have no time and aren't listed.
  noteDeath(source){
    const t=clockSeconds(this.clock),other=source==='event'?'roster':'event';
    const twin=this.deaths.find(d=>d[other]&&!d[source]&&(t===null||d.t===null||Math.abs(d.t-t)<=SAME_DEATH_S));
    if(twin){twin[source]=true;return;}
    this.deaths.push({t,[source]:true});
    if(this.deaths.length>40)this.deaths.shift();
  }
  apply(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return this.snapshot();
    if(raw.event==='match_start'||raw.key==='match_start'){this.clear();this.phase='in-progress';return this.snapshot();}
    if(raw.event==='match_end'||raw.key==='match_end'){this.clear();this.phase='ended';return this.snapshot();}
    if(raw.event==='death'){this.noteDeath('event');this.count++;return this.snapshot();}
    // Different GEP subscriptions produce individual updates or info maps.
    const updates=[];
    if(typeof raw.key==='string')updates.push({feature:raw.feature||raw.category||'match_info',key:raw.key,data:raw.data??raw.value});
    const nested=raw.info&&typeof raw.info==='object'?raw.info:null;
    if(nested)for(const [feature,group] of Object.entries(nested)){
      if(!['game_info','match_info'].includes(feature)||!group||typeof group!=='object')continue;
      for(const [key,data] of Object.entries(group))updates.push({feature,key,data});
    }
    for(const u of updates){
      if(u.feature!=='match_info'&&u.feature!=='game_info')continue;
      const data=decode(u.data);const key=u.key;
      if(key==='phase'){this.phase=clean(data,40).toLowerCase(); if(this.phase==='postgame'){this.roster.clear();this.items.clear();} continue;}
      if(key==='match_id'){
        const id=clean(String(data??''),50);
        if(id&&id!==this.matchId){this.roster.clear();this.items.clear();this.deaths=[];this.ownDeaths=null;this.damage=null;this.matchId=id;this.phase='in-progress';}
        continue;
      }
      if(key==='match_clock'){this.clock=clean(String(data??''),12);continue;}
      if(key==='incoming_damage'){const damage=readDamage(data,this.clock);if(damage)this.damage=damage;continue;}
      const r=/^roster_(\d{1,2})$/.exec(key),i=/^items_(\d{1,2})$/.exec(key);
      if((r||i)&&Number((r||i)[1])<=11&&data&&typeof data==='object'&&!Array.isArray(data)){
        const index=Number((r||i)[1]);
        const name=clean(data.player_name,120);
        if(!name)continue;
        if(r){
          const hero=clean(data.hero_name,80);
          // The game's hero ID: a fallback when the feed's hero name is an old or internal one.
          const id=Number(data.hero_id),heroId=Number.isInteger(id)&&id>0&&id<10000?id:null;
          // Assigned lane (Overwolf: 1 left, 4 middle, 6 right): who you face while laning.
          const laneNo=Number(data.assigned_lane),lane=Number.isInteger(laneNo)&&laneNo>0&&laneNo<=12?laneNo:null;
          // Scoreboard numbers: kills, deaths, assists, hero damage and level.
          // A field missing from an update keeps the player's last value.
          const before=this.roster.get(index)?.name===name?this.roster.get(index).stats:null;
          const has=k=>data[k]!==undefined&&data[k]!==null&&data[k]!=='';
          const num=(key,field)=>has(key)?stat(data[key]):before?.[field]||0;
          const stats={kills:num('kills','kills'),deaths:num('deaths','deaths'),assists:num(has('assist')?'assist':'assists','assists'),heroDamage:num('hero_damage','heroDamage'),level:num('level','level')};
          if(data.is_local===true&&has('deaths')){
            if(this.ownDeaths!==null&&stats.deaths>this.ownDeaths)for(let k=Math.min(5,stats.deaths-this.ownDeaths);k>0;k--)this.noteDeath('roster');
            this.ownDeaths=stats.deaths;
          }
          this.roster.set(index,{index,name,hero,heroId,lane,team:team(data),isLocal:data.is_local===true,souls:Number(data.souls)||0,stats});
        }else if(Array.isArray(data.items)){
          // Empty array means inventory empty; new updates replace earlier state.
          // Overwolf entries carry class_name; keep shop items (upgrade_*) only.
          const shop=data.items.slice(0,40).filter(x=>!x?.class_name||/^upgrade_/.test(String(x.class_name)));
          // Keep the class name (the synced catalog's item ID) beside the display
          // name, which can be stale. Commas separate the list, so drop them from names.
          const entries=shop.slice(0,32).map(x=>({name:clean(x?.name,100).replace(/,/g,' ').replace(/\s+/g,' ').trim(),id:/^upgrade_\w{1,80}$/.test(String(x?.class_name||''))?String(x.class_name):''})).filter(x=>x.name);
          this.items.set(index,{index,name,items:entries.map(x=>x.name),ids:entries.map(x=>x.id)});
        }
      }
    }
    this.count++;
    return this.snapshot();
  }
  snapshot(){
    const participants=[...this.roster.values()],local=participants.filter(p=>p.isLocal===true);
    const own=local.length===1?local[0]:null;
    // No local-player evidence or no team? Do not guess opponents.
    // Require exact name agreement before joining inventory to player.
    // Slot numbers normally line up; otherwise fall back to a unique exact name.
    // Scoreboard line: kills, deaths, assists, hero damage, level and souls (net worth).
    const statsOf=p=>({...p.stats,souls:Math.max(0,Math.floor(p.souls))});
    const inventoryOf=p=>{
      const indexed=this.items.get(p.index);if(indexed&&indexed.name===p.name)return indexed;
      const named=[...this.items.values()].filter(x=>x.name===p.name);return named.length===1?named[0]:null;
    };
    const enemies=own&&own.team?participants.filter(p=>p.team&&p.team!==own.team&&p.hero).slice(0,6).map(p=>{
      const matched=this.withholdEnemyItems?null:inventoryOf(p);
      return {hero:p.hero,heroId:p.heroId??null,lane:p.lane??null,name:p.name,items:matched?matched.items.join(', '):'',itemIds:matched?matched.ids:[],inventoryKnown:!!matched,stats:statsOf(p)};
    }):[];
    // Your teammates: hero, lane and items only, never their player names. Their
    // purchases follow the same switch as enemy purchases.
    const allies=own&&own.team?participants.filter(p=>p!==own&&p.team===own.team&&p.hero).slice(0,5).map(p=>{
      const matched=this.withholdEnemyItems?null:inventoryOf(p);
      return {hero:p.hero,heroId:p.heroId??null,lane:p.lane??null,items:matched?matched.items.join(', '):'',itemIds:matched?matched.ids:[],inventoryKnown:!!matched,stats:statsOf(p)};
    }):[];
    const ownInventory=own?inventoryOf(own):null;
    return {matchId:this.matchId,phase:this.phase,clock:this.clock,ownHero:own?.hero||'',ownHeroId:own?.heroId??null,ownLane:own?.lane??null,souls:own?Math.max(0,Math.floor(own.souls)):null,
      ownItems:ownInventory?ownInventory.items.join(', '):null,ownItemIds:ownInventory?ownInventory.ids:[],enemyItemsWithheld:this.withholdEnemyItems,
      // Your scoreboard line, when each of your deaths happened (match seconds),
      // and the damage panel's last reading (null until it is opened).
      ownStats:own?statsOf(own):null,deathTimes:own?this.deaths.map(d=>d.t).filter(t=>t!==null):[],damage:own?this.damage:null,
      enemies,allies,observedInventories:enemies.filter(x=>x.inventoryKnown).length,players:participants.length,updates:this.count,warning:!own?'Local player not identified; enemy data withheld.':!own.team?'Local team unknown; enemy data withheld.':!enemies.length?'No confirmed enemy players in feed.':''};
  }
}
module.exports={EventState,decode,team,readDamage,clockSeconds};
