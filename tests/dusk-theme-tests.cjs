'use strict';
// Dusk theme (design kit): tokens, bundled fonts and their licenses, the new
// icon, the live-status dot, and matchup states that always pair a color with
// a symbol and a word.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
let total=0;
function test(check,msg){assert.ok(check,msg);total++;}

// Tokens: the kit's values, loaded before the app's stylesheets.
const dusk=read('dusk.css'),html=read('index.html'),css=read('desktop.css'),base=read('base.css');
const kit={'--dca-bg':'#15141C','--dca-surface':'#1E1D28','--dca-surface-2':'#282735','--dca-line':'#34334A','--dca-avatar-line':'#45445E','--dca-text':'#F0EFF8','--dca-muted':'#B0AEC6','--dca-accent':'#B9A6FF','--dca-gold':'#F2C879','--dca-live':'#F2C879','--dca-favorable':'#66C7F4','--dca-even':'#A3A1BA','--dca-unfavorable':'#FF8A5C'};
test(Object.entries(kit).every(([k,v])=>new RegExp(`${k}:\\s*${v};`).test(dusk)),'dusk.css carries the kit\'s colors');
test(/--dca-font-heading:\s*"Outfit"/.test(dusk)&&/--dca-font-body:\s*"Atkinson Hyperlegible"/.test(dusk),'headings in Outfit, body text in Atkinson Hyperlegible');
const links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);
test(links.join()==='dusk.css,base.css,desktop.css','dusk.css loads first, so the app\'s rules build on its tokens');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(',');
test([['bg','--dca-bg'],['accent','--dca-accent'],['gold','--dca-gold'],['unfav','--dca-unfavorable'],['fav','--dca-favorable'],['even','--dca-even'],['text','--dca-text']].every(([k,t])=>css.includes(`--dca-${k}-rgb: ${rgb(kit[t])};`)),'the transparency channels match the kit\'s colors');

// No stray colors: only the game-category tiles and the damage chart keep their own.
const allowed=new Set(['#49342a','#6f5134','#513e2d','#89633d','#234837','#36674f','#274c3b','#4e906f','#3c3357','#665487','#3d3459','#7865aa','#d88a4e','#8d78d6','#4fb3a3','#8b98a5']);
const stray=s=>(s.replace(/:root\s*\{[^}]*\}/g,'').match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d[^)]*\)/g)||[]).filter(c=>!allowed.has(c.toLowerCase()));
test(stray(css).length===0&&stray(base).length===0,'every other color comes from a Dusk token: '+[...stray(css),...stray(base)].join(' '));
test(!/Segoe UI/.test(css+base),'no leftover system font stacks');
test(html.includes('<meta name="theme-color" content="#15141C">'),'window theme color is the Dusk background');

// Fonts: bundled, valid woff2, with their SIL Open Font License texts.
const fonts=['outfit-600','outfit-700','atkinson-hyperlegible-400','atkinson-hyperlegible-700'];
test(fonts.every(f=>{const b=fs.readFileSync(path.join(root,'assets/fonts',f+'.woff2'));return b.subarray(0,4).toString('latin1')==='wOF2'&&b.length>5000&&b.length<200000;}),'four woff2 font files, as the kit names them');
test(fonts.every(f=>dusk.includes(`url("assets/fonts/${f}.woff2") format("woff2")`))&&!/https?:/.test(dusk),'fonts load from the app, never the network');
test(['OFL-Outfit.txt','OFL-AtkinsonHyperlegible.txt'].every(f=>/SIL OPEN FONT LICENSE Version 1\.1/i.test(read('assets/fonts/'+f)))&&/Outfit Project Authors/.test(read('assets/fonts/OFL-Outfit.txt'))&&/Braille Institute/.test(read('assets/fonts/OFL-AtkinsonHyperlegible.txt')),'each font ships with its license and copyright line');
const pkg=JSON.parse(read('package.json'));
test(pkg.build.files.includes('dusk.css')&&pkg.build.files.includes('assets/**/*'),'the installer packages dusk.css and the fonts');
test(/default-src 'self'/.test(html)&&!/font-src/.test(html),'the page policy allows the app\'s own fonts and nothing else');

// Icon: the open tome, in the window, the installer and the header.
const ico=fs.readFileSync(path.join(root,'assets/icon.ico'));
const sizes=[...Array(ico.readUInt16LE(4))].map((_,i)=>ico[6+i*16]||256);
test(sizes.join()==='16,24,32,48,64,128,256','app icon: the kit\'s .ico with sizes 16 to 256');
test(/open tome/.test(read('assets/icon.svg'))&&html.includes('<img class="logoMark" src="assets/icon.svg" alt="" width="44" height="44">')&&!html.includes('◆</span>'),'header shows the tome icon instead of the diamond');
test(pkg.build.win.icon==='assets/icon.ico','installer and window use the new icon');

// Live status: a gold dot while live, gray otherwise; the text no longer erases the dot.
const ui=read('js/ui.js');
test(html.includes('<span class="statusBadge" id="topLiveBadge"><i aria-hidden="true"></i><span id="topLiveStatus">Live source: disconnected</span></span>')&&ui.includes("$('topLiveBadge').classList.toggle('isLive',!!liveOn);"),'status badge: the dot sits outside the text and turns live with the feed');
test(css.includes('.statusBadge.isLive i{width:10px;height:10px;border-radius:5px;background:var(--dca-live);box-shadow:0 0 0 3px var(--dca-live-glow)}')&&css.includes('.liveBadge i{width:10px;height:10px;border-radius:5px;background:var(--dca-live);box-shadow:0 0 0 3px var(--dca-live-glow)}'),'live dots use the kit\'s gold dot');
test(css.includes('.liveStrip.liveStale .liveBadge i{background:var(--dca-even);box-shadow:none}'),'stale data: the dot turns gray');

// Matchup states: symbol, word and color together.
test(css.includes('.state-favorable{color:var(--dca-favorable)}')&&css.includes('.state-even{color:var(--dca-even)}')&&css.includes('.state-unfavorable{color:var(--dca-unfavorable)}'),'state colors come from the kit');
test(css.includes('.threat.level-high b{color:var(--dca-unfavorable)}')&&css.includes('.threat.level-medium b{color:var(--dca-even)}')&&css.includes('.threat.level-low b{color:var(--dca-favorable);font-weight:700}'),'threat levels: high orange, medium gray, low blue');
const chipCtx=vm.createContext({escapeHTML:x=>String(x)});
vm.runInContext(ui.slice(ui.indexOf('const LEVEL_LABELS='),ui.indexOf('const itemArt='))+';this.threatChip=threatChip;',chipCtx);
const chip=level=>chipCtx.threatChip({level,label:'Spirit pressure',value:2.4,coverage:2});
test(chip('high').includes('<b><span aria-hidden="true">▼</span> High</b>')&&chip('medium').includes('●</span> Medium')&&chip('low').includes('▲</span> Low'),'threat chips: ▼ High, ● Medium, ▲ Low');
test(chip('high').includes('title="High threat (unfavorable for you)')&&chip('low').includes('Low threat (favorable for you)'),'the tooltip names the state');
const wsCtx=vm.createContext({fmt:new Intl.NumberFormat('en-US'),Math});
vm.runInContext(ui.slice(ui.indexOf('function winState(b){'),ui.indexOf('function backingText(r){'))+';this.winState=winState;this.stateTag=stateTag;this.winTip=winTip;',wsCtx);
const ws=(wr,base,matches)=>wsCtx.winState({wr,base,matches})?.key;
test(ws(.52,.46,5000)==='favorable'&&ws(.40,.46,5000)==='unfavorable'&&ws(.47,.46,5000)==='even','win rate vs the tier average: 6 points up is favorable, 6 down unfavorable, 1 point even');
test(ws(.52,.46,200)==='even'&&ws(.60,.46,200)==='favorable','small samples need a bigger gap (1.96 standard errors) before they count');
test(wsCtx.winState({wr:.5,base:null,matches:500})===null&&wsCtx.winState({wr:.5,base:.4,matches:20})===null&&wsCtx.winState(null)===null,'no average or under 40 matches: no state');
test(wsCtx.stateTag(wsCtx.winState({wr:.6,base:.46,matches:5000}))===' <span class="state state-favorable"><span aria-hidden="true">▲</span> Favorable</span>'&&wsCtx.stateTag(wsCtx.winState({wr:.3,base:.46,matches:5000})).includes('▼</span> Unfavorable'),'the card shows ▲ Favorable / ● Even / ▼ Unfavorable');
test(wsCtx.winTip({wr:.49,base:.46,matches:12340})==='Players on your hero win 49% after buying it, against 46% for other items of its tier (12,340 matches)','the tooltip explains the comparison');
test(ui.includes('<p class="quickData" title="${escapeHTML(winTip(r.backing))}">${escapeHTML(backingText(r))}${stateTag(winState(r.backing))}</p>'),'pick cards show the state after the win rate');
test(read('js/debrief-ui.js').includes("${t.level==='high'?'▼ High':'● Medium'}"),'debrief threat lines carry the same symbols');

// Kit notes.
test(html.includes('not affiliated with or endorsed by Valve'),'the app says it is not affiliated with or endorsed by Valve');
test(css.includes('input[type=checkbox]{flex:none;width:18px;height:18px;min-height:0;margin:0;padding:0}')&&css.includes('.toggleRow{flex-direction:row;'),'checkboxes are normal size, beside their label');

console.log(`PASS: ${total} Dusk theme checks`);
