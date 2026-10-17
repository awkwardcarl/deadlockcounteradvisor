'use strict';
const assert = require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {responsiveBounds,transferredBounds,inArea,LAYOUT_REVISION}=require('../desktop/window-layout.cjs');
let count=0;const check=(yes,msg)=>{assert.ok(yes,msg);count++};
const monitors=[
 {label:'1080p',area:{x:0,y:0,width:1920,height:1040}},
 {label:'ultrawide',area:{x:1920,y:0,width:3440,height:1400}},
 {label:'super ultrawide',area:{x:-5120,y:0,width:5120,height:1370}},
 {label:'scaled 4K in DIPs',area:{x:0,y:0,width:2560,height:1400}},
 {label:'1366x768',area:{x:0,y:0,width:1366,height:728}},
 {label:'small 800x600',area:{x:0,y:0,width:800,height:560}},
];
for(const {label,area} of monitors){
 const b=responsiveBounds(area);
 check(inArea(b,area),label+' fit work area');
 check(b.width>=680&&b.height>=480,label+' minimum usable dimensions');
 check(b.width>=area.width*.86,label+' fluid width on first launch');
 const prior={x:area.x+50,y:area.y+30,width:1000,height:780,layoutRevision:1};
 const migrated=responsiveBounds(area,prior);
 check(migrated.width===b.width&&migrated.height===b.height,label+' upgrades legacy fixed size');
 const intentional=responsiveBounds(area,{...prior,layoutRevision:LAYOUT_REVISION});
 check(inArea(intentional,area),label+' clamp saved user size');
}
for(const first of monitors)for(const second of monitors){
 const transferred=transferredBounds(first.area,second.area,responsiveBounds(first.area));
 check(inArea(transferred,second.area),first.label+' to '+second.label+' fully visible');
}
const main=fs.readFileSync(path.join(__dirname,'..','desktop/main.cjs'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','desktop.css'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','js/ui.js'),'utf8');
check(!css.includes('max-width: 1660px'),'fixed max width removed');
check(css.includes('@container (max-width: 760px)'),'quick buys based on available panel width');
check(css.includes('@media (min-width: 2350px)'),'ultrawide layout exists');
check(css.includes('body.focusInputs .rightPanel {max-width:none'),'focus mode fills available width');
check(main.includes("screen.on('display-metrics-changed', handleDisplayChange)"), "automatic display metrics changes handled");
check(main.includes('getNormalBounds()'),'restore window across maximize');
check(main.includes('transferredBounds('),'move to another monitor scales window');
check(ui.includes('resolution.width')&&ui.includes('scalePercent'),'actual display resolution surfaced in toolbar');
// Match-first order: what you edit and read mid-match comes first.
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const at=marker=>{const i=html.indexOf(marker);assert.ok(i>=0,'missing '+marker);return i;};
check(at('class="card enemyBlock"')<at('class="card heroCard"')&&at('class="card heroCard"')<at('id="setupPanel"'),'enemy lineup first, then build, then setup');
const setup=html.slice(at('id="setupPanel"'),html.indexOf('</details>',at('id="setupPanel"')));
check(setup.includes('class="card liveCard"')&&setup.includes('class="card syncCard"'),'game detection and catalog cards are in the collapsible setup section');
check(at('id="quickBuys"')<at('id="threats"')&&at('id="threats"')<at('id="patternInsight"')&&at('id="patternInsight"')<at('id="abilityTips"'),'quick-buy picks come before threats, pairs and tips');
check(!/id="abilityTips"[^>]*\bopen\b/.test(html),'ability tips start collapsed');
check(at('id="strategyMode"')<at('id="sortMode"')&&at('id="sortMode"')<at('id="quickBuys"'),'priority sits with the other controls above the picks');
console.log('PASS: '+count+' responsive geometry and display-layout tests');
