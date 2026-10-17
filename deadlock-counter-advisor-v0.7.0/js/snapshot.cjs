'use strict';
// Compatible with deadlock.io /api/v1/{items,heroes}.json as of 2026-10-15.
// Only retain verified, public shop items and released selectable heroes.
const safeName=value=>String(value?.english||value||'').trim().slice(0,90);
function imagePath(value){const v=value?.publicPath;return typeof v==='string' && /^\/assets\/game\/panorama\/images\/[\w\/.\-]+\.png$/.test(v)?v:'';}
function compactSnapshot(itemsRaw,heroesRaw){
  if(!Array.isArray(itemsRaw?.items)||!Array.isArray(heroesRaw?.heroes)) throw new Error('Catalog schema changed: missing arrays');
  const items=itemsRaw.items.filter(x=>x?.shop?.isPublicShopItem===true && ['weapon','vitality','spirit'].includes(x.shop.category))
    .map(x=>({id:String(x.id||''),name:safeName(x.displayName),cost:Number(x.shop.cost),tier:Number(x.shop.tier),category:x.shop.category,group:String(x.shop.groupId||''),groupLabel:String(x.shop.groupLabel||''),icon:imagePath(x.assets?.shopIcon)||imagePath(x.assets?.icon),active:!!x.activation?.isActive,components:Array.isArray(x.shop.componentIds)?x.shop.componentIds.slice(0,10).map(String):[],upgrades:Array.isArray(x.shop.upgradeIds)?x.shop.upgradeIds.slice(0,10).map(String):[]}))
    .filter(x=>/^upgrade_[a-z0-9_]+$/.test(x.id) && x.name && Number.isFinite(x.cost)&&x.cost>0&&x.cost<200000&&x.tier>=1&&x.tier<=6);
  const heroes=heroesRaw.heroes.filter(x=>x?.status==='released' && x?.playerSelectable===true && x?.disabled!==true)
    .map(x=>({id:Number(x.heroId),name:safeName(x.displayName),slug:String(x.slug||''),portrait:imagePath(x.assets?.card)||imagePath(x.assets?.portrait),tags:Array.isArray(x.tags)?x.tags.map(safeName).filter(Boolean).slice(0,8):[],style:safeName(x.playstyle?.name)||safeName(x.gunArchetype)}))
    .filter(x=>x.name&&Number.isFinite(x.id));
  const unique = list => Array.from(new Map(list.map(x=>[x.id,x])).values());
  if(items.length<100||heroes.length<20) throw new Error(`Incomplete catalog (${items.length} items, ${heroes.length} heroes); existing data retained`);
  const idate=itemsRaw.source?.generatedAt||new Date().toISOString();
  return {version:1,source:'deadlock.io game-tracking',generatedAt:String(idate).slice(0,40),syncedAt:new Date().toISOString(),build:String(itemsRaw.source?.buildId||''),items:unique(items),heroes:unique(heroes)};
}
module.exports={compactSnapshot,imagePath};
