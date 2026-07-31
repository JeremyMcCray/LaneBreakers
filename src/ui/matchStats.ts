// @ts-nocheck
/**
 * Post-game analysis: where a match's damage actually came from, and how the
 * numbers moved while it was happening.
 *
 * The sim tags every blow with its source (see damageTag in sim/combat) and takes a
 * sample of each player every few seconds; both ride in on the final snapshot only.
 * Everything here is a pure read of that payload — no sim access, no live state.
 *
 * Charts follow the house data-viz rules: one measure per plot (never a second
 * y-axis), categorical colour assigned per player in fixed slot order so a hue
 * always means the same person, legend plus end-of-line direct labels, recessive
 * grid, and a shared crosshair readout.
 */
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { TEAM_COL } from '../data/world';
import { G } from '../app/state';

/* Categorical slots, validated for CVD against the #161e30 panel these sit on.
   Assigned by player slot and never recycled, so a colour always means one player. */
const SERIES_COL = ['#3987e5', '#d95926', '#199e70', '#c98500'];

/* series row layout, mirroring SERIES_KEYS in sim/stats */
const IX = {t:0, dmgHero:1, dmgAll:2, dmgTaken:3, goldEarned:4, netWorth:5, cs:6, kills:7, deaths:8, lvl:9};

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mmss = t => Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
const short = n => n>=10000 ? (n/1000).toFixed(0)+'k' : (n>=1000 ? (n/1000).toFixed(1)+'k' : Math.round(n));

/* ------------------------------ labels ----------------------------- */
const PLAIN = {
  atk:'Attacks', cleave:'Cleave', summon:'Summons', ember:'Embers', dot:'Damage over time',
  creep:'Lane creeps', tower:'Tower', thorns:'Thorns', barbs:'Barbed Hide', reflect:'Reflected',
  fountain:'Enemy fountain', abil:'Abilities', other:'Unattributed'
};
/* a damage tag, spelled out for a human — 'a2' becomes that hero's E and its name */
export function tagLabel(hid, tag){
  if (/^a[0-3]$/.test(tag)){
    const A = HEROES[hid] && HEROES[hid].abilities[+tag[1]];
    if (A) return A.key+' · '+A.name;
  }
  if (tag.slice(0,2)==='i:'){ const it = ITEMS[tag.slice(2)]; return it ? it.name : 'Item'; }
  return PLAIN[tag] || tag;
}
/* a "<slot>|<tag>" blame key, spelled out as "HERO — Ability" */
function blameLabel(ps, key){
  const cut = key.indexOf('|');
  const slot = +key.slice(0, cut), tag = key.slice(cut+1);
  const who = ps.find(q=>q.sl===slot);
  if (!who) return {name: PLAIN[tag] || tag, sub:'', col:'#5a6885'};
  return {name: tagLabel(who.hid, tag), sub: HEROES[who.hid].name, col: HEROES[who.hid].col};
}

/* --------------------------- damage panel -------------------------- */
function barRows(entries, total, colorOf){
  if (!entries.length) return '<div class="note">Nothing recorded.</div>';
  const top = entries[0][1] || 1;
  return '<div class="dmgrows">'+entries.map(([k, v, meta])=>{
    const pct = total ? (v/total*100) : 0;
    return '<div class="dmgrow">'+
      '<div class="dlab">'+esc(meta.name)+
        (meta.sub ? '<span class="dsub" style="color:'+meta.col+'">'+esc(meta.sub)+'</span>' : '')+'</div>'+
      '<div class="dbar"><i style="width:'+(v/top*100).toFixed(1)+'%;background:'+colorOf+'"></i></div>'+
      '<div class="dval">'+Math.round(v).toLocaleString()+'<span class="dpct">'+pct.toFixed(1)+'%</span></div>'+
    '</div>';
  }).join('')+'</div>';
}
function damagePanel(v, slot){
  const q = v.ps.find(p=>p.sl===slot);
  if (!q || !q.dby) return '<div class="note">No breakdown was recorded for this match.</div>';
  const hid = q.hid;
  const dealtAll = Object.entries(q.dby).map(([k,x])=>[k,x,{name:tagLabel(hid,k), sub:'', col:''}])
                     .sort((a,b)=>b[1]-a[1]);
  const dealtHero = Object.entries(q.hby||{}).map(([k,x])=>[k,x,{name:tagLabel(hid,k), sub:'', col:''}])
                     .sort((a,b)=>b[1]-a[1]);
  const taken = Object.entries(q.tby||{}).map(([k,x])=>[k,x,blameLabel(v.ps,k)])
                     .sort((a,b)=>b[1]-a[1]);
  const sum = a => a.reduce((x,y)=>x+y[1], 0);
  const tabs = v.ps.slice().sort((a,b)=>(a.tm===G.myTeam?0:1)-(b.tm===G.myTeam?0:1)||a.sl-b.sl)
    .map(p=>'<button class="dtab'+(p.sl===slot?' on':'')+'" data-slot="'+p.sl+'" '+
      'style="border-left:3px solid '+TEAM_COL[p.tm]+'">'+
      '<b style="color:'+HEROES[p.hid].col+'">'+HEROES[p.hid].name+'</b>'+
      '<span>'+esc(p.nm||('Player '+(p.sl+1)))+'</span></button>').join('');

  return '<div class="dtabs">'+tabs+'</div>'+
    '<div class="dcols">'+
      '<div><h4>Damage dealt — to heroes <em>'+Math.round(sum(dealtHero)).toLocaleString()+'</em></h4>'+
        barRows(dealtHero, sum(dealtHero), SERIES_COL[0])+'</div>'+
      '<div><h4>Damage dealt — everything <em>'+Math.round(sum(dealtAll)).toLocaleString()+'</em></h4>'+
        barRows(dealtAll, sum(dealtAll), SERIES_COL[2])+'</div>'+
      '<div><h4>Damage taken <em>'+Math.round(sum(taken)).toLocaleString()+'</em></h4>'+
        barRows(taken, sum(taken), SERIES_COL[1])+'</div>'+
    '</div>';
}

/* ---------------------------- line charts -------------------------- */
const CW = 340, CH = 132, PADL = 40, PADR = 12, PADT = 12, PADB = 20;
/* One measure, one y-axis. Never two — a second scale invents a correlation. */
function lineChart(title, series, key, fmt, marks){
  let maxY = 0, maxT = 0;
  for (const s of series) for (const r of s.rows){ if (r[key]>maxY) maxY=r[key]; if (r[IX.t]>maxT) maxT=r[IX.t]; }
  maxY = maxY || 1; maxT = maxT || 1;
  const nice = Math.pow(10, Math.floor(Math.log10(maxY)));
  const top = Math.ceil(maxY/nice)*nice || 1;
  const X = t => PADL + (t/maxT)*(CW-PADL-PADR);
  const Y = y => CH-PADB - (y/top)*(CH-PADT-PADB);

  let grid = '';
  for (let g=0; g<=2; g++){
    const val = top*g/2, yy = Y(val);
    grid += '<line class="cgl" x1="'+PADL+'" y1="'+yy.toFixed(1)+'" x2="'+(CW-PADR)+'" y2="'+yy.toFixed(1)+'"/>'+
            '<text class="cax" x="'+(PADL-6)+'" y="'+(yy+3.5).toFixed(1)+'" text-anchor="end">'+fmt(val)+'</text>';
  }
  for (let g=0; g<=2; g++){
    const tv = maxT*g/2;
    grid += '<text class="cax" x="'+X(tv).toFixed(1)+'" y="'+(CH-6)+'" text-anchor="middle">'+mmss(tv)+'</text>';
  }
  let paths = '', ends = '';
  series.forEach(s=>{
    if (!s.rows.length) return;
    const d = s.rows.map((r,i)=>(i?'L':'M')+X(r[IX.t]).toFixed(1)+' '+Y(r[key]).toFixed(1)).join(' ');
    paths += '<path class="cln" d="'+d+'" stroke="'+s.col+'"/>';
    const last = s.rows[s.rows.length-1];
    // direct label at the line end — identity is never colour alone
    ends += '<circle cx="'+X(last[IX.t]).toFixed(1)+'" cy="'+Y(last[key]).toFixed(1)+'" r="2.6" fill="'+s.col+'"/>';
  });
  // Event pips, drawn only on the plot each one actually explains: purchases against
  // the money, kills and deaths against the damage. Shapes match the legend.
  let pips = '';
  const want = marks || [];
  series.forEach(s=>{
    for (const ev of (s.marks||[])){
      if (want.indexOf(ev.k)<0) continue;
      const x = +X(Math.min(ev.t, maxT)).toFixed(1);
      if (ev.k==='item')
        pips += '<rect class="cpip" x="'+(x-2.4)+'" y="'+(CH-PADB-4.8)+'" width="4.8" height="4.8" '+
                'transform="rotate(45 '+x+' '+(CH-PADB-2.4)+')" fill="'+s.col+'" stroke="none"/>';
      else if (ev.k==='kill')
        pips += '<polygon class="cpip" points="'+x+','+PADT+' '+(x-3.4)+','+(PADT+5.6)+' '+(x+3.4)+','+(PADT+5.6)+'" fill="'+s.col+'" stroke="none"/>';
      else if (ev.k==='death')
        pips += '<polygon class="cpip" points="'+x+','+(CH-PADB)+' '+(x-3.4)+','+(CH-PADB-5.6)+' '+(x+3.4)+','+(CH-PADB-5.6)+'" fill="#ff5f5f" stroke="none"/>';
    }
  });
  return '<figure class="chart" data-key="'+key+'" data-maxt="'+maxT+'">'+
    '<figcaption>'+esc(title)+'</figcaption>'+
    '<svg viewBox="0 0 '+CW+' '+CH+'" preserveAspectRatio="none" role="img" aria-label="'+esc(title)+'">'+
      grid + pips + paths + ends +
      '<line class="ccross" x1="0" y1="'+PADT+'" x2="0" y2="'+(CH-PADB)+'" style="display:none"/>'+
    '</svg><div class="ctip"></div></figure>';
}

/* ------------------------- purchase timeline ----------------------- */
function buyRail(v){
  const dur = Math.max(1, v.t||1);
  const rows = v.ps.slice().sort((a,b)=>(a.tm===G.myTeam?0:1)-(b.tm===G.myTeam?0:1)||a.sl-b.sl).map(p=>{
    const buys = (p.ev||[]).filter(e=>e.k==='item');
    const col = SERIES_COL[p.sl % SERIES_COL.length];
    const pins = buys.map(e=>{
      const it = ITEMS[e.v];
      return '<i style="left:'+(e.t/dur*100).toFixed(2)+'%;background:'+col+'" '+
             'title="'+esc((it?it.name:e.v)+' — '+mmss(e.t))+'"><span>'+esc((it?it.name:e.v).slice(0,2).toUpperCase())+'</span></i>';
    }).join('');
    return '<div class="brrow"><div class="brwho" style="border-left:3px solid '+TEAM_COL[p.tm]+'">'+
      '<b style="color:'+HEROES[p.hid].col+'">'+HEROES[p.hid].name+'</b>'+
      '<span>'+buys.length+' bought</span></div>'+
      '<div class="brtrack">'+pins+'</div></div>';
  }).join('');
  return '<h4>When items were bought</h4><div class="brail">'+rows+
    '<div class="brscale"><span>0:00</span><span>'+mmss(dur/2)+'</span><span>'+mmss(dur)+'</span></div></div>';
}

/* --------------------------- timeline panel ------------------------ */
function timelinePanel(v){
  const players = v.ps.slice().sort((a,b)=>(a.tm===G.myTeam?0:1)-(b.tm===G.myTeam?0:1)||a.sl-b.sl);
  if (!players.some(p=>p.sr && p.sr.length>1))
    return '<div class="note">This match was too short to graph.</div>';
  const series = players.map(p=>({
    name: HEROES[p.hid].name, who: p.nm||('Player '+(p.sl+1)), tm: p.tm,
    col: SERIES_COL[p.sl % SERIES_COL.length],
    rows: p.sr || [], marks: p.ev || []
  }));
  const legend = '<div class="clegend">'+series.map(s=>
    '<span><i style="background:'+s.col+'"></i>'+esc(s.name)+
    '<em style="color:'+TEAM_COL[s.tm]+'">'+esc(s.who)+'</em></span>').join('')+
    '<span class="cnote">▲ kill · ▼ death on the damage plots · ◆ item bought on the money plots</span></div>';
  return legend +
    '<div class="charts">'+
      lineChart('Hero damage dealt', series, IX.dmgHero, short, ['kill','death'])+
      lineChart('Damage taken', series, IX.dmgTaken, short, ['kill','death'])+
      lineChart('Gold earned', series, IX.goldEarned, short, ['item'])+
      lineChart('Net worth', series, IX.netWorth, short, ['item'])+
      lineChart('Last hits', series, IX.cs, n=>Math.round(n))+
      lineChart('Level', series, IX.lvl, n=>Math.round(n))+
    '</div>' + buyRail(v);
}

/* ------------------------------ wiring ----------------------------- */
/* Shared crosshair: hovering any chart reads every series at that moment. */
function wireCharts(root, v){
  const players = v.ps.slice().sort((a,b)=>(a.tm===G.myTeam?0:1)-(b.tm===G.myTeam?0:1)||a.sl-b.sl);
  root.querySelectorAll('.chart').forEach(fig=>{
    const svg = fig.querySelector('svg'), tip = fig.querySelector('.ctip');
    const cross = fig.querySelector('.ccross');
    const key = +fig.dataset.key, maxT = +fig.dataset.maxt;
    const move = ev=>{
      const b = svg.getBoundingClientRect();
      const fx = (ev.clientX - b.left) / b.width;                 // 0..1 across the plot
      const px = fx*CW;
      if (px < PADL || px > CW-PADR){ cross.style.display='none'; tip.style.display='none'; return; }
      const t = ((px-PADL)/(CW-PADL-PADR))*maxT;
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      cross.style.display = '';
      const lines = players.map(p=>{
        const rows = p.sr||[];
        if (!rows.length) return '';
        let best = rows[0];
        for (const r of rows) if (Math.abs(r[IX.t]-t) < Math.abs(best[IX.t]-t)) best = r;
        return '<span><i style="background:'+SERIES_COL[p.sl%SERIES_COL.length]+'"></i>'+
               esc(HEROES[p.hid].name)+'<b>'+Math.round(best[key]).toLocaleString()+'</b></span>';
      }).join('');
      tip.innerHTML = '<em>'+mmss(t)+'</em>'+lines;
      tip.style.display = '';
      tip.style.left = Math.min(Math.max(fx*100, 12), 88)+'%';
    };
    svg.addEventListener('mousemove', move);
    svg.addEventListener('mouseleave', ()=>{ cross.style.display='none'; tip.style.display='none'; });
  });
}

let curTab = 'sum', curSlot = null;
export function renderMatchStats(v, summaryHtml, openTab){
  const box = document.getElementById('endStats');
  if (!box) return;
  if (openTab) curTab = openTab;
  const hasDetail = !!(v && v.ps && v.ps.some(p=>p.dby));
  if (curSlot === null || !v.ps.some(p=>p.sl===curSlot)) curSlot = G.mySlot;
  const tab = hasDetail ? curTab : 'sum';
  const btn = (id,label)=>'<button class="etab'+(tab===id?' on':'')+'" data-tab="'+id+'">'+label+'</button>';
  const body = tab==='dmg' ? damagePanel(v, curSlot)
             : tab==='time' ? timelinePanel(v)
             : summaryHtml;
  box.innerHTML =
    (hasDetail ? '<div class="etabs">'+btn('sum','Summary')+btn('dmg','Damage')+btn('time','Timeline')+'</div>' : '')+
    '<div class="epane">'+body+'</div>';

  box.querySelectorAll('.etab').forEach(b=>b.onclick = ()=>{ curTab = b.dataset.tab; renderMatchStats(v, summaryHtml); });
  box.querySelectorAll('.dtab').forEach(b=>b.onclick = ()=>{ curSlot = +b.dataset.slot; renderMatchStats(v, summaryHtml); });
  if (tab==='time') wireCharts(box, v);
}
export function resetMatchStats(){ curTab = 'sum'; curSlot = null; }
