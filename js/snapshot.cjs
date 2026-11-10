'use strict';
// Compacts deadlock-api's /v1/assets/items and /v1/assets/heroes lists (as of
// 2026-11-10) into the app's catalog. Only buyable shop items and released,
// selectable heroes are kept. (Until 2026-11 the catalog came from deadlock.io,
// which now redirects to SteamDB.)
const crypto=require('node:crypto');
// deadlock-api has no shop group IDs (the engine's threat and build tables are
// keyed by them), so they ship here, taken from the last reviewed deadlock.io
// data. A new item has no group until it is added (the daily review lists it).
const SHOP_GROUPS=require('./shop-groups.json');
const SOURCE='deadlock-api assets';
const IMAGE=/^https:\/\/assets-bucket\.deadlock-api\.com\/assets-api-res\/images\/[\w\/.\-]+\.png$/;
const safeName=value=>String(value||'').trim().slice(0,90);
const imageURL=value=>typeof value==='string'&&IMAGE.test(value)?value:'';
const CATEGORIES=['weapon','vitality','spirit'];
// Legendary items are listed as shopable at 9999 souls but can't be bought.
const UNBUYABLE=9999;
function compactSnapshot(itemsRaw,heroesRaw){
  if(!Array.isArray(itemsRaw)||!Array.isArray(heroesRaw)) throw new Error('Catalog schema changed: missing arrays');
  const shop=itemsRaw.filter(x=>x?.type==='upgrade'&&x.shopable===true&&x.disabled!==true&&CATEGORIES.includes(x.item_slot_type)&&Number(x.cost)<UNBUYABLE);
  const ids=x=>Array.isArray(x)?x.filter(id=>typeof id==='string'):[];
  // Upgrades: the items that list this one as a component.
  const upgradesOf=new Map();
  for(const x of shop)for(const c of ids(x.component_items))upgradesOf.set(c,[...(upgradesOf.get(c)||[]),String(x.class_name)]);
  const items=shop.map(x=>{
    const id=String(x.class_name||''),[group,groupLabel]=Array.isArray(SHOP_GROUPS[id])?SHOP_GROUPS[id]:['',''];
    return {id,name:safeName(x.name),cost:Number(x.cost),tier:Number(x.item_tier),category:x.item_slot_type,group,groupLabel,icon:imageURL(x.shop_image)||imageURL(x.image),
      active:x.is_active_item===true,components:ids(x.component_items).slice(0,10),upgrades:(upgradesOf.get(id)||[]).slice(0,10)};
  }).filter(x=>/^upgrade_[a-z0-9_]+$/.test(x.id)&&x.name&&Number.isFinite(x.cost)&&x.cost>0&&x.cost<200000&&x.tier>=1&&x.tier<=6);
  // Ability names by class name, for each hero's four signature abilities.
  const abilityName=new Map(itemsRaw.filter(x=>x?.type==='ability'&&typeof x.class_name==='string').map(x=>[x.class_name,safeName(x.name)]));
  const heroes=heroesRaw.filter(x=>x?.player_selectable===true&&x.disabled!==true&&x.in_development!==true)
    .map(x=>({id:Number(x.id),name:safeName(x.name),slug:safeName(x.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
      portrait:imageURL(x.images?.icon_hero_card)||imageURL(x.images?.icon_image_small),tags:Array.isArray(x.tags)?x.tags.map(safeName).filter(Boolean).slice(0,8):[],style:safeName(x.gun_tag),
      // Current ability names, so hero tips can be checked against the live kit.
      abilities:[1,2,3,4].map(n=>abilityName.get(x.items?.['signature'+n])).filter(Boolean)}))
    .filter(x=>x.name&&Number.isInteger(x.id)&&x.id>0);
  const unique=list=>Array.from(new Map(list.map(x=>[x.id,x])).values());
  if(items.length<100||heroes.length<20) throw new Error(`Incomplete catalog (${items.length} items, ${heroes.length} heroes); existing data retained`);
  const out={items:unique(items),heroes:unique(heroes)};
  // No game build number in these lists: a short fingerprint of the shop and
  // roster stands in, so a game update shows up as a new "build".
  const build='data-'+crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0,8);
  const now=new Date().toISOString();
  return {version:1,source:SOURCE,generatedAt:now,syncedAt:now,build,...out};
}
module.exports={compactSnapshot,imageURL,SOURCE};
