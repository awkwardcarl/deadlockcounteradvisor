'use strict';
// Hero art for heroes deadlock.io's catalog doesn't list yet (it lags game
// patches: Baba, Violet and Nurse Harrow were missing): card art from
// deadlock-api's image server, kept with the hero list and used only where a
// hero has no portrait of its own.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

const BUCKET='https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/';
const heroesRaw=[
  {id:19,name:'Shiv',images:{icon_hero_card:BUCKET+'shiv_card.png'}},
  {id:88,name:'Baba',images:{icon_hero_card:BUCKET+'baba_card.png',icon_hero_card_webp:BUCKET+'baba_card.webp'}},
  {id:87,name:'Nurse Harrow',images:{icon_image_small:BUCKET+'nurse_sm.png'}},
  {id:90,name:'Elsewhere',images:{icon_hero_card:'https://evil.example/assets-api-res/images/heroes/x.png'}},
  {id:91,name:'Wrong Folder',images:{icon_hero_card:'https://assets-bucket.deadlock-api.com/assets-api-res/images/items/x.png'}},
  {id:92,name:'Query',images:{icon_hero_card:BUCKET+'q.png?track=1'}},
  {id:93,name:'No Art'}
];

// The hero list keeps card art (small art when there is no card), only from that folder.
const {compactAssets,heroArtURL}=require('../desktop/match-normalizer.cjs');
const assets=compactAssets([],heroesRaw);
test(assets.heroArt[88]===BUCKET+'baba_card.png'&&assets.heroArt[87]===BUCKET+'nurse_sm.png'&&assets.heroArt[19]===BUCKET+'shiv_card.png','card art is kept by hero ID (small art when there is no card)');
test(!assets.heroArt[90]&&!assets.heroArt[91]&&!assets.heroArt[92]&&!assets.heroArt[93],'other hosts, other folders, query strings and missing art are dropped');
test(heroArtURL(BUCKET+'a.png')&&!heroArtURL(BUCKET+'a.webp')&&!heroArtURL('http://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/a.png')&&!heroArtURL(BUCKET+'../x.png'),'png over https in the heroes folder only');
test('heroArt' in compactAssets([],[])&&Object.keys(compactAssets([],[]).heroArt).length===0,'the key is always there, so a saved list from before is recognizable');

// Hand-off to the catalog, keyed by name.
const {addFallbackHeroNames}=require('../desktop/data-service.cjs');
const snapshot=require('./fixtures/catalog-snapshot.json');
const handed=addFallbackHeroNames(snapshot,assets);
test(handed.heroArt['Baba']===BUCKET+'baba_card.png'&&handed.heroArt['Nurse Harrow']===BUCKET+'nurse_sm.png'&&!('Elsewhere' in handed.heroArt),'the catalog gets art by hero name');
test(JSON.stringify(addFallbackHeroNames(snapshot,null).heroArt)==='{}'&&JSON.stringify(addFallbackHeroNames(snapshot,{heroes:{88:'Baba'},heroArt:{88:'javascript:alert(1)'}}).heroArt)==='{}','no list or bad art: nothing passed on');
const gd=read('desktop/game-data.cjs');
test(gd.includes("||!('investment' in assets)||!('heroArt' in assets);"),'a hero list saved before this version refreshes once');

// Engine catalog: deadlock.io portraits win; the art fills the gaps.
const ctx=vm.createContext({});
for(const file of ['js/catalog.js','js/engine.js'])vm.runInContext(read(file),ctx);
const E=ctx.DeadlockEngine;
const catalog=E.createCatalog(ctx.DeadlockCatalog,handed);
const hero=name=>catalog.heroes.find(h=>h.name===name);
test(!snapshot.heroes.some(h=>h.name==='Baba')&&hero('Baba')?.portrait===BUCKET+'baba_card.png','Baba (not in deadlock.io\'s catalog) gets deadlock-api\'s card art');
test(hero('Nurse Harrow')?.portrait===BUCKET+'nurse_sm.png','Nurse Harrow too');
test(hero('Shiv').portrait.startsWith('https://deadlock.io/assets/game/panorama/images/'),'a hero deadlock.io has keeps deadlock.io\'s portrait');
test(catalog.heroArt[E.norm('Nurse Harrow')]===BUCKET+'nurse_sm.png','the catalog keeps the art by normalized name for any other hero');
const bad=E.createCatalog(ctx.DeadlockCatalog,{...snapshot,heroArt:{Baba:'https://evil.example/x.png'}});
test(!bad.heroes.find(h=>h.name==='Baba').portrait&&Object.keys(bad.heroArt).length===0,'art from anywhere else is ignored');
const ui=read('js/ui.js');
test(ui.includes('function portrait(name){return catalog.heroes.find(h=>h.name===name)?.portrait||catalog.heroArt?.[engine.norm(name)]||\'\';}'),'portraits fall back to the art for any hero name');

// The page and the network lock allow that one folder, images only.
const security=require('../desktop/security.cjs');
test(security.permittedImageURL(BUCKET+'baba_card.png')&&security.permittedImageURL('https://deadlock.io/assets/game/panorama/images/heroes/kelvin.png'),'hero art and deadlock.io art may load');
test(['https://assets-bucket.deadlock-api.com/assets-api-res/images/items/x.png','https://assets-bucket.deadlock-api.com/other/x.png',BUCKET+'x.png?a=1',BUCKET+'x.webp','http://assets-bucket.deadlock-api.com/assets-api-res/images/heroes/x.png','https://api.deadlock-api.com/v1/assets/heroes'].every(u=>!security.permittedImageURL(u)),'nothing else from deadlock-api loads in the page');
const html=read('index.html');
test(html.includes("img-src 'self' data: https://deadlock.io https://assets-bucket.deadlock-api.com;")&&html.includes("connect-src 'none'"),'the page policy allows the art host for images only; still no page requests');

// Privacy Policy names the new image source.
const privacy=read('docs/privacy.html');
test(privacy.includes('plus hero artwork from its image server for heroes deadlock.io doesn’t list yet')&&privacy.includes('Effective October 21, 2026'),'the Privacy Policy names the hero art source, with a new date');

console.log(`PASS: ${total} hero art checks`);
