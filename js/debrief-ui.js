(function(root){
'use strict';
// Post-match debrief view. Loads a match through the desktop main process
// (which strips account IDs), lets you pick your hero, and renders the
// analysis from js/debrief.js. Set up by ui.js with its helpers.
const STORE_FRIEND='deadlock-counter-advisor-friend-code';
const STORE_MATCH='deadlock-counter-advisor-last-match';
const VERDICTS={top:['✓ Top counter pick','top'],counter:['Counter, not the top pick','counter'],build:['Build item','build']};
const TIMING={ahead:'bought before it peaked',['on time']:'on time',late:'late',never:'never countered'};
const CATEGORY_LABELS={weapon:'Weapon',abilities:'Abilities',items:'Items',melee:'Melee'};
function setup({$,getCatalog,ensureCatalog,engine,debrief,base,escapeHTML,fmt}){
  const api=root.desktopAPI;
  let match=null;
  const read=key=>{try{return localStorage.getItem(key)||'';}catch(_){return '';}};
  const write=(key,value)=>{try{localStorage.setItem(key,value);}catch(_){}};
  const status=text=>{$('debriefStatus').textContent=text;};
  const portrait=name=>getCatalog().heroes.find(h=>engine.norm(h.name)===engine.norm(name))?.portrait||'';
  const art=(icon,cls='')=>icon?`<img class="${cls}" src="${escapeHTML(icon)}" alt="">`:'';

  function open(on){
    document.body.classList.toggle('debriefMode',on);
    $('debriefView').hidden=!on;
    if(on)$('matchId').focus();else $('openDebrief').focus();
  }
  $('openDebrief').addEventListener('click',()=>open(true));
  $('closeDebrief').addEventListener('click',()=>open(false));
  $('matchId').value=read(STORE_MATCH);
  $('friendCode').value=read(STORE_FRIEND);
  $('debriefForm').addEventListener('submit',e=>{e.preventDefault();load();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('debriefMode')&&!$('heroDialog').open&&!e.target.closest?.('input'))open(false);});
  $('debriefPlayers').addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(b)select(Number(b.dataset.slot));});

  async function load(){
    const id=$('matchId').value.trim(),code=$('friendCode').value.trim();
    if(!/^\d{1,12}$/.test(id)){status('Enter a numeric match ID.');$('matchId').focus();return;}
    if(code&&!/^\d{1,12}$/.test(code)){status('Your Steam friend code should be digits only (or leave it blank).');$('friendCode').focus();return;}
    if(!api?.loadMatch){status('The debrief needs the Windows desktop app: it loads match data through the app, not the browser.');return;}
    write(STORE_MATCH,id);write(STORE_FRIEND,code);
    $('loadMatch').disabled=true;$('debriefResults').hidden=true;$('debriefPlayers').hidden=true;
    try{
      if(!getCatalog().complete){status('Syncing items & heroes first, so item names and prices are current…');await ensureCatalog();}
      status('Loading match…');
      match=await api.loadMatch(id,code);
      renderPlayers();
      if(match.youSlot!==null&&match.youSlot!==undefined)select(match.youSlot);
      else status(code?'Your friend code wasn\'t in this match. Pick which hero you were.':'Pick which hero you were.');
    }catch(e){status(String(e?.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,'').slice(0,220));}
    finally{$('loadMatch').disabled=false;}
  }

  function renderPlayers(selected=null){
    const teams=[0,1].map(team=>match.players.filter(p=>p.team===team));
    $('debriefPlayers').innerHTML=teams.map((list,i)=>`<div class="debriefTeam"><span class="miniTitle">TEAM ${i+1} · ${list[0]?.team===match.winningTeam?'WON':'LOST'}</span><div class="debriefTeamRow">${list.map(p=>[
      `<button type="button" class="debriefPlayer${p.slot===selected?' current':''}" data-slot="${p.slot}" aria-pressed="${p.slot===selected}">`,
      portrait(p.hero)?`<img src="${escapeHTML(portrait(p.hero))}" alt="">`:'',
      `<span><b>${escapeHTML(p.hero)}</b><small>${p.kills}/${p.deaths}/${p.assists} · ${fmt.format(p.netWorth)} souls</small></span></button>`
    ].join('')).join('')}</div></div>`).join('');
    $('debriefPlayers').hidden=false;
  }

  function select(slot){
    try{
      const a=debrief.analyzeMatch(match,slot,getCatalog(),engine,base);
      renderPlayers(slot);
      $('debriefResults').innerHTML=[summary(a),hurt(a),timing(a),timeline(a),build(a),
        '<p class="supportText debriefNote">Advisor picks are heuristics. The purchase timeline uses only what enemies owned at each moment; the suggested build also weighs the damage you actually took.</p>'].join('');
      // The page's CSP blocks inline style attributes, so widths are set here.
      for(const el of $('debriefResults').querySelectorAll('[data-width]'))el.style.width=`${Math.max(0,Math.min(100,Number(el.dataset.width)||0))}%`;
      $('debriefResults').hidden=false;
      status(`Match ${match.matchId} · you were ${a.you.hero}.`);
    }catch(e){status(String(e?.message||e).slice(0,200));}
  }

  const tile=(label,value,sub='')=>`<div class="debriefTile"><span>${escapeHTML(label)}</span><b>${escapeHTML(value)}</b>${sub?`<small>${escapeHTML(sub)}</small>`:''}</div>`;
  function summary(a){
    const p=a.performance,lane=p.laneOpponents.length?`lane: ${p.laneOpponents.join(', ')} ${fmt.format(p.laneOpponentsAt10)}`:'';
    return `<section class="debriefSection"><h3>Summary</h3><div class="debriefTiles">${[
      tile('Result',p.won?'Win':'Loss',p.duration),
      tile('K / D / A',`${p.kills} / ${p.deaths} / ${p.assists}`),
      tile('Net worth',fmt.format(p.netWorth),`#${p.netWorthRankInTeam} on your team · team avg ${fmt.format(p.teamAvgNetWorth)}`),
      tile('Souls at 10:00',fmt.format(p.netWorthAt10),lane),
      tile('Hero damage',fmt.format(p.heroDamage)),
      tile('Damage taken',fmt.format(p.damageTaken)),
      tile('Healing',fmt.format(p.healing)),
      tile('Souls lost to deaths',fmt.format(p.soulsLostOnDeath)),
      tile('Last hits / denies',`${fmt.format(p.lastHits)} / ${p.denies}`)
    ].join('')}</div></section>`;
  }
  function hurt(a){
    const d=a.damage;
    if(!d.total)return '<section class="debriefSection"><h3>What hurt you</h3><p class="emptyText">No damage breakdown in this match\'s data.</p></section>';
    const bar=d.byCategory.filter(c=>c.share>0).map(c=>`<span class="dmg-${c.key}" data-width="${c.share}" title="${CATEGORY_LABELS[c.key]} ${c.share}%"></span>`).join('');
    const legend=d.byCategory.filter(c=>c.share>0).map(c=>`<span><i class="dmg-${c.key}"></i>${CATEGORY_LABELS[c.key]} ${c.share}%</span>`).join('');
    const enemies=d.byEnemy.map(e=>`<li><b>${escapeHTML(e.hero)}</b><span class="debriefMeter"><span class="dmg-${e.main}" data-width="${e.share}"></span></span><span>${e.share}% · mostly ${CATEGORY_LABELS[e.main].toLowerCase()}</span></li>`).join('');
    const deaths=a.deaths.length?a.deaths.map(x=>`<li><span class="tlTime">${x.time}</span>${escapeHTML(x.killer)}<small> · ${x.timeToKill}s to kill</small></li>`).join(''):'<li class="emptyText">No deaths. Nice.</li>';
    return `<section class="debriefSection"><h3>What hurt you</h3><div class="debriefSplit"><div><div class="dmgBar" role="img" aria-label="${escapeHTML(d.byCategory.map(c=>CATEGORY_LABELS[c.key]+' '+c.share+'%').join(', '))}">${bar}</div><div class="dmgLegend">${legend}</div><ul class="debriefList">${enemies}</ul></div>`+
      `<div><span class="miniTitle">DEATHS · ${a.deaths.length}</span><ul class="debriefList">${deaths}</ul></div></div></section>`;
  }
  function timing(a){
    if(!a.counterTiming.length)return '';
    const rows=a.counterTiming.map(c=>`<li class="timing-${c.status.replace(' ','-')}"><b>${escapeHTML(c.label)}</b> reached High at ${c.highTime}${c.counter?` · first counter: ${escapeHTML(c.counter)} at ${c.counterTime}`:''} <span class="timingBadge">${TIMING[c.status]}</span></li>`).join('');
    return `<section class="debriefSection"><h3>Counter timing</h3><ul class="debriefList">${rows}</ul></section>`;
  }
  function timeline(a){
    // Advisor picks and threats repeat across consecutive buys; show them only when they change.
    let lastPicks='',lastThreats='';
    const rows=a.timeline.map(r=>{
      const [label,cls]=VERDICTS[r.verdict];
      const pickText=r.picks.map(p=>p.name).join(' · ')||'no counter needed';
      const threatText=r.threats.map(t=>`${t.label} ${t.level==='high'?'High':'Medium'}`).join(' · ');
      const picks=r.verdict==='top'||pickText===lastPicks?'':`<span class="tlPicks">Advisor at this budget: ${escapeHTML(pickText)}</span>`;
      const threats=threatText&&threatText!==lastThreats?`<span class="tlThreats">${escapeHTML(threatText)}</span>`:'';
      lastPicks=pickText;lastThreats=threatText;
      return `<li class="tlRow verdict-${cls}"><span class="tlTime">${r.time}</span><span class="tlItem">${art(r.icon)}${escapeHTML(r.item)}</span><span class="tlVerdict">${label}</span>${picks}${threats}</li>`;
    }).join('');
    return `<section class="debriefSection"><h3>Purchase timeline <small>${a.counts.top} top picks · ${a.counts.counter} other counters · ${a.counts.build} build items</small></h3>`+
      `<p class="supportText">The advisor only rates defensive counters, so offensive and build items show as "Build item". That isn't a mistake by itself.</p><ol class="timeline">${rows}</ol></section>`;
  }
  function build(a){
    const rows=a.build.map(b=>`<li><span class="itemIcon ${escapeHTML(b.category)}">${art(b.icon)||'◆'}</span><span class="buildText"><b>${escapeHTML(b.name)}</b> <small>${fmt.format(b.cost)} souls · ${escapeHTML(b.neededTime)}${b.bought?` · you bought it at ${b.bought}`:''}</small><span>${escapeHTML(b.evidence[0]||('Against '+b.reasons.join(', ').toLowerCase()))}</span></span></li>`).join('');
    return `<section class="debriefSection"><h3>Suggested counters for this match</h3><ol class="debriefBuild">${rows}</ol></section>`;
  }
}
root.DeadlockDebriefUI={setup};
})(typeof window!=='undefined'?window:globalThis);
