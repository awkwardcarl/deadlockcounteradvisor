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
  clear(){this.roster=new Map();this.items=new Map();this.matchId='';this.phase='unknown';this.clock='';this.count=0;}
  apply(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return this.snapshot();
    if(raw.event==='match_start'||raw.key==='match_start'){this.clear();this.phase='in-progress';return this.snapshot();}
    if(raw.event==='match_end'||raw.key==='match_end'){this.clear();this.phase='ended';return this.snapshot();}
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
        if(id&&id!==this.matchId){this.roster.clear();this.items.clear();this.matchId=id;this.phase='in-progress';}
        continue;
      }
      if(key==='match_clock'){this.clock=clean(String(data??''),12);continue;}
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
          this.roster.set(index,{index,name,hero,heroId,lane,team:team(data),isLocal:data.is_local===true,souls:Number(data.souls)||0});
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
    const inventoryOf=p=>{
      const indexed=this.items.get(p.index);if(indexed&&indexed.name===p.name)return indexed;
      const named=[...this.items.values()].filter(x=>x.name===p.name);return named.length===1?named[0]:null;
    };
    const enemies=own&&own.team?participants.filter(p=>p.team&&p.team!==own.team&&p.hero).slice(0,6).map(p=>{
      const matched=this.withholdEnemyItems?null:inventoryOf(p);
      return {hero:p.hero,heroId:p.heroId??null,lane:p.lane??null,name:p.name,items:matched?matched.items.join(', '):'',itemIds:matched?matched.ids:[],inventoryKnown:!!matched};
    }):[];
    // Your teammates: hero, lane and items only, never their player names. Their
    // purchases follow the same switch as enemy purchases.
    const allies=own&&own.team?participants.filter(p=>p!==own&&p.team===own.team&&p.hero).slice(0,5).map(p=>{
      const matched=this.withholdEnemyItems?null:inventoryOf(p);
      return {hero:p.hero,heroId:p.heroId??null,lane:p.lane??null,items:matched?matched.items.join(', '):'',itemIds:matched?matched.ids:[],inventoryKnown:!!matched};
    }):[];
    const ownInventory=own?inventoryOf(own):null;
    return {matchId:this.matchId,phase:this.phase,clock:this.clock,ownHero:own?.hero||'',ownHeroId:own?.heroId??null,ownLane:own?.lane??null,souls:own?Math.max(0,Math.floor(own.souls)):null,
      ownItems:ownInventory?ownInventory.items.join(', '):null,ownItemIds:ownInventory?ownInventory.ids:[],enemyItemsWithheld:this.withholdEnemyItems,
      enemies,allies,observedInventories:enemies.filter(x=>x.inventoryKnown).length,players:participants.length,updates:this.count,warning:!own?'Local player not identified; enemy data withheld.':!own.team?'Local team unknown; enemy data withheld.':!enemies.length?'No confirmed enemy players in feed.':''};
  }
}
module.exports={EventState,decode,team};
