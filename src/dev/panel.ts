// @ts-nocheck
/**
 * The dev sandbox panel — a floating DOM window over the canvas.
 *
 * Tabs: Abilities · Hero · World · Sandbox · Changes.
 * Every input writes straight through `tuning.setTuning`, which mutates the live
 * HEROES / world data the sim reads each tick, so nothing needs a restart.
 *
 * Built in JS rather than index.html because most of it is generated from the
 * hero's own ability schema — one hero has three ult ranks, another has charges
 * and a second value array, and the panel should follow whatever the data says.
 */
import { HEROES } from '../data/heroes';
import { G } from '../app/state';
import { cmd } from '../app/shell';
import { addToast } from '../render/fx';
import {
  HERO_STATS, AB_FIELDS, WORLD_TUNABLES, ALL_HEROES,
  heroKey, abKey, worldKey, baseValue, liveValue, setTuning, resetKey,
  resetHero, resetAll, tunedCount, isTuned, setScaling, scaleArray,
  exportJson, importJson, diffLines
} from './tuning';

let root = null, bodyEl = null, badgeEl = null;
let tab = 'ab';
let builtFor = -1;           // G.matchCount the current pane was built against
let heroSel = null;          // which hero the Abilities/Hero tabs are editing
let seat = -1;               // which seat the cheats hit; -1 = mine
const dummy = {hp:20000, arm:0, regen:0};

const fmt = v => (v === undefined || v === null) ? '—'
  : (Math.round(v * 100) / 100).toString();
const el = (t, cls, html) => {
  const n = document.createElement(t);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* Which hero the panel is pointed at — follows your own pick until you change it. */
function curHero(){
  if (heroSel && HEROES[heroSel]) return heroSel;
  const me = G.view && G.view.ps && G.view.ps[G.mySlot];
  return (me && me.hid) || G.pick || ALL_HEROES[0];
}
/* A seat picked in a 2v2 must not linger into the next 1v1. */
function targetSeat(){
  if (seat >= 0 && (!G.S || G.S.players[seat])) return seat;
  seat = -1;
  return G.mySlot;
}
function dbgCmd(w, extra){
  const c = Object.assign({a:'dbg', w}, extra || {});
  if (G.mode === 'local' && seat >= 0) c.sl = seat;
  cmd(c);
}

/* =========================== widgets ============================== */

/** One tunable number: slider + box + reset. */
function numRow(key, spec, label){
  const row = el('div', 'dvrow');
  const base = baseValue(key);
  const lab = el('label', null, label || spec.label);
  const rng = el('input'); rng.type = 'range';
  const num = el('input'); num.type = 'number';
  num.className = 'dvnum';
  const rst = el('button', 'dvrst', '&#8635;');
  rst.title = 'Reset to ' + fmt(base);

  const bound = () => {
    // the slider tracks the shipped value's neighbourhood; the box has no ceiling
    const hi = Math.max(spec.max, base * 2.5, liveValue(key) * 1.2 || 0);
    rng.min = spec.min; rng.max = hi; rng.step = spec.step;
    num.min = spec.min; num.step = spec.step;
  };
  const paint = () => {
    const v = liveValue(key);
    rng.value = v; num.value = fmt(v);
    row.classList.toggle('tuned', isTuned(key));
    rst.style.visibility = isTuned(key) ? 'visible' : 'hidden';
    lab.title = 'shipped: ' + fmt(base);
  };
  // Only re-derive the slider's range when the value arrives from somewhere
  // other than the slider — rebounding mid-drag makes the thumb jump backwards.
  const push = (v, rebound) => { setTuning(key, v); if (rebound) bound(); paint(); onChange(); };

  bound(); paint();
  rng.oninput = () => { num.value = rng.value; push(rng.value, false); };
  rng.onchange = bound;                    // grew past the end? widen it on release
  num.onchange = () => push(num.value, true);
  rst.onclick = () => { resetKey(key); bound(); paint(); onChange(); };
  row.append(lab, rng, num, rst);
  return row;
}

/** A per-rank array (val / cd / mana) plus the scaling tools. */
function arrRow(hero, i, spec){
  const A = HEROES[hero].abilities[i];
  const arr = A[spec.k];
  const wrap = el('div', 'dvarr');
  const head = el('label', null, spec.label + ' <em></em>');
  const ranks = el('div', 'dvranks');
  const boxes = [];

  const paint = () => {
    let tuned = false;
    for (let r = 0; r < arr.length; r++){
      const key = abKey(hero, i, spec.k, r);
      boxes[r].value = fmt(liveValue(key));
      boxes[r].parentNode.classList.toggle('tuned', isTuned(key));
      if (isTuned(key)) tuned = true;
    }
    head.querySelector('em').textContent =
      'shipped ' + baseArr(hero, i, spec.k).map(fmt).join(' / ');
    wrap.classList.toggle('tuned', tuned);
  };
  for (let r = 0; r < arr.length; r++){
    const cell = el('div', 'dvrank');
    const n = el('input'); n.type = 'number'; n.step = spec.step; n.min = spec.min;
    n.onchange = () => { setTuning(abKey(hero, i, spec.k, r), n.value); paint(); onChange(); };
    cell.append(el('span', null, 'R' + (r + 1)), n);
    boxes.push(n); ranks.append(cell);
  }

  const tools = el('div', 'dvscale');
  tools.append(el('span', 'dvsl', 'scale'));
  for (const m of [0.75, 0.9, 1.1, 1.25, 1.5, 2]){
    const b = el('button', null, (m < 1 ? '' : '+') + Math.round((m - 1) * 100) + '%');
    b.title = 'Set every rank to ' + m + '× the shipped value';
    b.onclick = () => { scaleArray(hero, i, spec.k, m); paint(); onChange(); };
    tools.append(b);
  }
  const start = el('input'); start.type = 'number'; start.className = 'dvramp';
  start.placeholder = 'start'; start.value = fmt(arr[0]);
  const stepI = el('input'); stepI.type = 'number'; stepI.className = 'dvramp';
  stepI.placeholder = 'per rank';
  stepI.value = fmt(arr.length > 1 ? Math.round((arr[arr.length - 1] - arr[0]) / (arr.length - 1) * 100) / 100 : 0);
  const ramp = el('button', 'dvpri', 'ramp');
  ramp.title = 'Rewrite all ranks as start, start+step, start+2·step …';
  ramp.onclick = () => { setScaling(hero, i, spec.k, +start.value, +stepI.value); paint(); onChange(); };
  const rst = el('button', 'dvrst', '&#8635;');
  rst.title = 'Reset every rank';
  rst.onclick = () => {
    for (let r = 0; r < arr.length; r++) resetKey(abKey(hero, i, spec.k, r));
    paint(); onChange();
  };
  tools.append(start, stepI, ramp, rst);

  paint();
  wrap.append(head, ranks, tools);
  return wrap;
}
const baseArr = (hero, i, field) => {
  const out = [];
  const n = HEROES[hero].abilities[i][field].length;
  for (let r = 0; r < n; r++) out.push(baseValue(abKey(hero, i, field, r)));
  return out;
};

function toggle(label, get, set, hint){
  const b = el('button', 'dvtog', label);
  if (hint) b.title = hint;
  const paint = () => b.classList.toggle('on', !!get());
  b.onclick = () => { set(!get()); paint(); };
  paint();
  b._paint = paint;              // repaintLive re-reads it — sim flags change under us
  return b;
}
function btn(label, fn, cls, hint){
  const b = el('button', cls || null, label);
  if (hint) b.title = hint;
  b.onclick = fn;
  return b;
}
function section(title, note){
  const s = el('div', 'dvsec');
  s.append(el('h4', null, title));
  if (note) s.append(el('p', 'dvnote', note));
  return s;
}

/* ============================= tabs =============================== */

function paneAbilities(){
  const hero = curHero(), H = HEROES[hero];
  const pane = el('div');
  pane.append(heroPicker(hero));

  const me = G.view && G.view.ps && G.view.ps[G.mySlot];
  for (let i = 0; i < 4; i++){
    const A = H.abilities[i];
    const card = el('div', 'dvcard');
    card.append(el('div', 'dvcardh',
      '<b class="k">' + A.key + '</b><b>' + A.name + '</b>' +
      (A.passive ? '<i>passive</i>' : A.cast === 'self' ? '<i>self</i>' : '<i>point</i>') +
      '<span class="dvlive" data-ab="' + i + '"></span>'));
    for (const f of AB_FIELDS){
      if (A[f.k] === undefined || A[f.k] === null) continue;
      // a passive has no cost and no cooldown — the zeroed arrays are just noise
      if (A.passive && (f.k === 'cd' || f.k === 'mana')) continue;
      if (f.arr) card.append(arrRow(hero, i, f));
      else card.append(numRow(abKey(hero, i, f.k), f));
    }
    // the tooltip the player actually reads, with the live per-rank numbers in it
    card.append(el('p', 'dvnote dvdesc',
      A.desc.replace('%d', '<b>' + A.val.join('/') + '</b>')
            .replace('%p', '<b>' + (A.val2 || []).join('/') + '</b>')));
    pane.append(card);
  }
  return pane;
}

function paneHero(){
  const hero = curHero(), H = HEROES[hero];
  const pane = el('div');
  pane.append(heroPicker(hero));
  const s = section(H.name + ' — base stats',
    'Recomputed every tick, so a change lands on a live hero immediately. ' +
    'Per-level values apply from level 1 up.');
  for (const st of HERO_STATS){
    if (st.opt && H[st.k] === undefined) continue;
    s.append(numRow(heroKey(hero, st.k), st));
  }
  pane.append(s);

  const calc = section('At level 12, no items', null);
  const box = el('div', 'dvcalc'); box.dataset.calc = hero;
  calc.append(box);
  pane.append(calc);
  return pane;
}

function paneWorld(){
  const pane = el('div');
  const live = section('Match rules', 'Values marked NEXT MATCH are only read when a match is created.');
  for (const t of WORLD_TUNABLES){
    const r = numRow(worldKey(t.k), t, t.label + (t.live ? '' : ' <i class="dvnext">next match</i>'));
    live.append(r);
  }
  pane.append(live);
  return pane;
}

function paneSim(){
  const D = G.dev;
  const pane = el('div');

  /* ---- clock ---- */
  const clk = section('Clock', 'Slow the sim down to read a wind-up frame by frame, or run it hot to reach the late game.');
  const row = el('div', 'dvbtns');
  for (const s of [0.1, 0.25, 0.5, 1, 2, 4]){
    const b = btn(s + '×', () => { D.timeScale = s; D.frozen = false; repaintLive(); }, 'dvspd');
    b.dataset.spd = s;
    row.append(b);
  }
  clk.append(row);
  const sl = el('input'); sl.type = 'range'; sl.min = 0.05; sl.max = 4; sl.step = 0.05;
  sl.value = D.timeScale;
  sl.oninput = () => { D.timeScale = +sl.value; D.frozen = false; repaintLive(); };
  sl.dataset.live = 'spd';
  clk.append(sl);
  const frow = el('div', 'dvbtns');
  frow.append(
    toggle('Freeze', () => D.frozen, v => D.frozen = v, 'Stop the sim without stopping the renderer'),
    btn('Step 1', () => { D.frozen = true; D.stepReq += 1; repaintLive(); }, null, 'Advance one 1/60s tick'),
    btn('Step 10', () => { D.frozen = true; D.stepReq += 10; repaintLive(); }),
    toggle('Freeze bots', () => D.freezeBots, v => {
      D.freezeBots = v;
      if (v && G.S) for (const p of G.S.players) if (p.bot) p.order = {type:'stop'};
    }, 'Bots stop issuing orders and hold their current position')
  );
  clk.append(frow);
  pane.append(clk);

  /* ---- who the cheats hit ---- */
  const who = section('Cheats', null);
  if (G.mode === 'local' && G.S){
    const seatRow = el('div', 'dvbtns');
    const mk = (label, sl2) => {
      const b = btn(label, () => { seat = sl2; build(); }, 'dvtog');
      b.classList.toggle('on', targetSeat() === (sl2 < 0 ? G.mySlot : sl2));
      return b;
    };
    seatRow.append(el('span', 'dvsl', 'target'), mk('You', -1));
    for (const p of G.S.players){
      if (p.slot === G.mySlot) continue;
      seatRow.append(mk((HEROES[p.heroId] || {}).name || ('Seat ' + p.slot), p.slot));
    }
    who.append(seatRow);
  } else {
    who.append(el('p', 'dvnote', 'Cheats apply to your own hero. Other seats can only be reached in a practice match.'));
  }

  // looked up per click, not captured — beginMatch replaces G.S wholesale
  const P = () => (G.S ? G.S.players[targetSeat()] : null);
  const g1 = el('div', 'dvbtns');
  g1.append(
    btn('+1000g', () => dbgCmd('gold')), btn('+5000g', () => dbgCmd('gold5')),
    btn('Level up', () => dbgCmd('lvl')), btn('Max level', () => dbgCmd('lvlmax')),
    btn('+1 point', () => dbgCmd('pts')),
    btn('Max all skills', () => dbgCmd('maxsk')),
    btn('Unlearn skills', () => dbgCmd('resetsk'))
  );
  const g2 = el('div', 'dvbtns');
  g2.append(
    btn('Reset cooldowns', () => dbgCmd('cd')),
    btn('Full HP / mana', () => dbgCmd('heal')),
    toggle('God mode', () => !!(P() && P().god), () => dbgCmd('god'),
           'Takes zero damage from anything'),
    toggle('Free cast', () => !!(P() && P().devFree), () => dbgCmd('free'),
           'No mana cost and no cooldowns — stun, silence and root still apply'),
    toggle('Fast gold', () => !!(G.S && G.S.fastGold), () => dbgCmd('fast')),
    btn('Die (no bounty)', () => dbgCmd('suicide')),
    btn('Respawn now', () => dbgCmd('respawn'))
  );
  const g3 = el('div', 'dvbtns');
  const gv = el('input'); gv.type = 'number'; gv.className = 'dvnum'; gv.value = 2000;
  const lv = el('input'); lv.type = 'number'; lv.className = 'dvnum'; lv.value = 6; lv.min = 1; lv.max = 12;
  g3.append(el('span', 'dvsl', 'set'), gv, btn('gold', () => dbgCmd('setgold', {v:+gv.value})),
            lv, btn('level', () => dbgCmd('setlvl', {v:+lv.value})));
  who.append(g1, g2, g3);
  pane.append(who);

  /* ---- lane ---- */
  const lane = section('Lane', null);
  const lrow = el('div', 'dvbtns');
  lrow.append(btn('Spawn wave now', () => dbgCmd('wave')),
              btn('Clear creeps', () => dbgCmd('clear')));
  lane.append(lrow);
  pane.append(lane);

  /* ---- dummies ---- */
  const dm = section('Training dummy',
    'An inert enemy that never moves, never swings and pays no gold or XP. ' +
    'Clear the creeps and freeze the bots first for a clean reading.');
  const drow = el('div', 'dvbtns');
  const mkNum = (k, hint) => {
    const n = el('input'); n.type = 'number'; n.className = 'dvnum'; n.value = dummy[k];
    n.title = hint;
    n.onchange = () => dummy[k] = +n.value;
    return n;
  };
  drow.append(el('span', 'dvsl', 'hp'), mkNum('hp', 'How much health the next dummy spawns with'),
              el('span', 'dvsl', 'armor'), mkNum('arm', 'Armor, so you can read damage through mitigation'),
              el('span', 'dvsl', 'regen/s'), mkNum('regen', 'Health regained per second — 0 for a plain punching bag'));
  const drow2 = el('div', 'dvbtns');
  drow2.append(
    btn('Spawn dummy', () => dbgCmd('dummy', {v:dummy.hp, arm:dummy.arm, rg:dummy.regen}), 'dvpri'),
    btn('Heal dummies', () => dbgCmd('healdummy')),
    btn('Remove dummies', () => dbgCmd('nodummy'))
  );
  dm.append(drow, drow2);
  pane.append(dm);

  /* ---- overlays ---- */
  const ov = section('Overlays', null);
  const orow = el('div', 'dvbtns');
  orow.append(
    toggle('Ability ranges', () => D.rings, v => D.rings = v,
           'Draw every cast range, AOE size and your attack range on the ground'),
    toggle('Hitboxes & tower range', () => D.radii, v => D.radii = v),
    toggle('Aggro & XP radii', () => D.acq, v => D.acq = v)
  );
  ov.append(orow);
  pane.append(ov);

  /* ---- readout ---- */
  const rd = section('Live readout', null);
  const box = el('div', 'dvcalc'); box.dataset.readout = '1';
  rd.append(box);
  pane.append(rd);
  return pane;
}

function paneDiff(){
  const pane = el('div');
  const rows = diffLines();
  const s = section(rows.length ? rows.length + ' value' + (rows.length === 1 ? '' : 's') + ' changed'
                                : 'Nothing changed',
    'Everything below overrides the numbers in src/data/. Copy them out to make them real.');
  if (rows.length){
    const t = el('table', 'dvdiff');
    // rows go in a real tbody — appending <tr> straight to <table> is a parse
    // quirk browsers only tolerate by accident
    const body = el('tbody');
    t.innerHTML = '<thead><tr><th>What</th><th>Shipped</th><th>Now</th><th></th></tr></thead>';
    for (const r of rows){
      const tr = el('tr');
      tr.append(el('td', null, r.what), el('td', 'dvdim', fmt(r.base)), el('td', 'dvhot', fmt(r.now)));
      const td = el('td');
      td.append(btn('&#8635;', () => { resetKey(r.key); build(); }, 'dvrst'));
      tr.append(td);
      body.append(tr);
    }
    t.append(body);
    s.append(t);
  }
  const acts = el('div', 'dvbtns');
  acts.append(
    btn('Copy JSON', () => {
      navigator.clipboard.writeText(exportJson())
        .then(() => addToast('Tuning JSON copied'))
        .catch(() => addToast('Clipboard blocked — use Download'));
    }, 'dvpri'),
    btn('Download', () => {
      const b = new Blob([exportJson()], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'lanebreaker-tuning.json';
      a.click(); URL.revokeObjectURL(a.href);
    }),
    btn('Load…', () => fileIn.click()),
    btn('Reset this hero', () => { resetHero(curHero()); build(); }),
    btn('Reset everything', () => {
      if (confirm('Put every number back to the shipped value?')){ resetAll(); build(); }
    }, 'dvdanger')
  );
  const fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'application/json';
  fileIn.style.display = 'none';
  fileIn.onchange = () => {
    const f = fileIn.files[0]; if (!f) return;
    f.text().then(txt => {
      try { addToast('Loaded ' + importJson(txt) + ' overrides'); build(); }
      catch (e){ addToast('That file is not tuning JSON'); }
    });
  };
  s.append(acts, fileIn);
  pane.append(s);
  return pane;
}

function heroPicker(hero){
  const wrap = el('div', 'dvpick');
  const sel = el('select');
  for (const id of ALL_HEROES){
    const o = el('option', null, HEROES[id].name + ' — ' + HEROES[id].title);
    o.value = id; if (id === hero) o.selected = true;
    sel.append(o);
  }
  sel.onchange = () => { heroSel = sel.value; build(); };
  wrap.append(el('span', 'dvsl', 'editing'), sel);
  wrap.append(btn('follow my hero', () => { heroSel = null; build(); }, 'dvtog',
                  'Snap back to whichever hero you are playing'));
  return wrap;
}

/* ============================ shell =============================== */

const TABS = [['ab', 'Abilities'], ['hero', 'Hero'], ['world', 'World'],
              ['sim', 'Sandbox'], ['diff', 'Changes']];

export function buildDevPanel(){
  root = el('div', 'hide'); root.id = 'devpanel';

  const head = el('header', 'dvhead');
  head.innerHTML = '<b>SANDBOX</b>';
  badgeEl = el('span', 'dvbadge');
  head.append(badgeEl, el('span', 'dvsp'));
  head.append(btn('×', () => toggleDevPanel(false), 'dvclose'));
  root.append(head);

  const nav = el('nav', 'dvtabs');
  for (const [id, label] of TABS){
    const b = btn(label, () => { tab = id; build(); });
    b.dataset.tab = id;
    nav.append(b);
  }
  root.append(nav);

  bodyEl = el('div', 'dvbody');
  root.append(bodyEl);
  document.body.append(root);

  dragify(head);
  build();
  setInterval(repaintLive, 200);
  bindKeys();
}

/* Sandbox hotkeys. Registered here rather than in ui/input so the game's key
   handling stays ignorant of the sandbox — and so F4 works on the menu too. */
function bindKeys(){
  addEventListener('keydown', e => {
    if (e.key === 'F4'){ e.preventDefault(); toggleDevPanel(); return; }
    if (!devPanelOpen()) return;
    const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
    if (inField) return;
    const D = G.dev;
    if (e.key === '\\'){ e.preventDefault(); D.frozen = !D.frozen; repaintLive(); }
    else if (e.key === ']'){ e.preventDefault(); D.frozen = true; D.stepReq += 1; }
    else if (e.key === '['){ e.preventDefault(); D.timeScale = Math.max(.05, D.timeScale / 2); repaintLive(); }
    else if (e.key === '='){ e.preventDefault(); D.timeScale = Math.min(4, D.timeScale * 2); repaintLive(); }
  });
}

function build(){
  if (!bodyEl) return;
  builtFor = G.matchCount;
  for (const b of root.querySelectorAll('.dvtabs button'))
    b.classList.toggle('on', b.dataset.tab === tab);
  bodyEl.innerHTML = '';
  bodyEl.append(tab === 'ab' ? paneAbilities()
              : tab === 'hero' ? paneHero()
              : tab === 'world' ? paneWorld()
              : tab === 'sim' ? paneSim()
              : paneDiff());
  onChange();
  repaintLive();
}

/** Badge + the DEV watermark bookkeeping, after anything is retuned. */
function onChange(){
  const n = tunedCount();
  G.dev.tuned = n;
  if (badgeEl){
    badgeEl.textContent = n ? n + ' tuned' : '';
    badgeEl.classList.toggle('on', n > 0);
  }
}

/** The 5 Hz pass: only text that changes on its own, never the inputs you are typing in. */
function repaintLive(){
  if (!root || root.classList.contains('hide')) return;
  // a new match brings a new sim, new seats and possibly a different hero —
  // rebuild rather than let the pane point at the match that just ended
  if (builtFor !== G.matchCount){ build(); return; }
  const D = G.dev;
  for (const b of root.querySelectorAll('[data-spd]'))
    b.classList.toggle('on', !D.frozen && Math.abs(+b.dataset.spd - D.timeScale) < 1e-6);
  const sl = root.querySelector('input[data-live="spd"]');
  if (sl && document.activeElement !== sl) sl.value = D.timeScale;
  for (const b of root.querySelectorAll('.dvtog')) if (b._paint) b._paint();

  const me = G.view && G.view.ps && G.view.ps[G.mySlot];
  // per-ability "what it does at your current rank"
  for (const s of root.querySelectorAll('.dvlive')){
    const i = +s.dataset.ab, hero = curHero();
    const A = HEROES[hero].abilities[i];
    if (!me || me.hid !== hero || !me.sk[i]){ s.textContent = A.passive ? '' : 'rank 0'; continue; }
    const r = me.sk[i] - 1;
    const bits = ['R' + me.sk[i], fmt(A.val[r])];
    if (A.val2) bits.push('/ ' + fmt(A.val2[r]));
    if (!A.passive) bits.push(fmt(A.cd[r]) + 's', fmt(A.mana[r]) + 'mp');
    if (A.range) bits.push(fmt(A.range) + 'u range');
    if (A.aoe) bits.push(fmt(A.aoe) + 'u aoe');
    s.textContent = bits.join(' · ');
  }
  const calc = root.querySelector('[data-calc]');
  if (calc){
    const H = HEROES[calc.dataset.calc], L = 11;
    calc.innerHTML = kv('HP', Math.round(H.hp + H.hpg * L))
      + kv('Mana', Math.round(H.mp + H.mpg * L))
      + kv('Damage', Math.round(H.dmg + H.dmgg * L))
      + kv('Armor', fmt(H.arm + H.armg * L))
      + kv('Attacks / s', fmt(1 / H.bat))
      + kv('DPS', Math.round((H.dmg + H.dmgg * L) / H.bat));
  }
  const rd = root.querySelector('[data-readout]');
  if (rd) rd.innerHTML = readout();
}
const kv = (k, v) => '<div><span>' + k + '</span><b>' + v + '</b></div>';

/* Rolling damage window, sampled off the snapshot the HUD already draws from. */
const dps = {t:0, d:0, v:0};
function readout(){
  const v = G.view;
  if (!v || !v.ps) return '<div><span>state</span><b>no match</b></div>';
  const me = v.ps[G.mySlot];
  const now = performance.now() / 1000;
  if (!dps.t){ dps.t = now; dps.d = me.da; }
  else if (now - dps.t >= 1){
    dps.v = (me.da - dps.d) / (now - dps.t);
    dps.t = now; dps.d = me.da;
  }
  if (me.da < dps.d) { dps.d = me.da; dps.v = 0; }   // new match — start the window over
  const own = v.e.find(e => e.ty === 0 && e.sl === G.mySlot);
  // damage taken only rides on the final snapshot, so read the sim when we have it
  const mine = G.S && G.S.players[G.mySlot];
  const taken = mine ? mine.dmgTaken : me.dtk;
  let out = kv('Damage / s', Math.round(dps.v))
    + kv('Damage dealt', Math.round(me.da))
    + kv('To heroes', Math.round(me.dh))
    + (taken === undefined ? '' : kv('Taken', Math.round(taken)))
    + kv('Attack dmg', Math.round(me.dmg))
    + kv('Armor', fmt(me.arm))
    + kv('Attacks / s', fmt(me.aps))
    + kv('Move speed', Math.round(me.ms))
    + kv('Level', me.lvl)
    + kv('Sim clock', fmt(v.t) + 's');
  if (own) out += kv('HP', Math.round(own.h) + ' / ' + Math.round(own.mh));
  // dummies are a sandbox thing, so read them off the sim rather than paying for
  // a flag on every entity in every snapshot
  if (G.S){
    const d = G.S.ents.filter(e => e.dummy && !e.dead);
    if (d.length) out += kv('Dummy HP (' + d.length + ')',
      Math.round(d[0].hp) + ' / ' + Math.round(d[0].maxHp));
  }
  return out;
}

/* Drag the panel around by its header. */
function dragify(handle){
  let sx = 0, sy = 0, ox = 0, oy = 0, on = false;
  handle.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    on = true; sx = e.clientX; sy = e.clientY;
    const r = root.getBoundingClientRect(); ox = r.left; oy = r.top;
    e.preventDefault();
  });
  addEventListener('mousemove', e => {
    if (!on) return;
    root.style.left = Math.max(0, Math.min(innerWidth - 120, ox + e.clientX - sx)) + 'px';
    root.style.top  = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + 'px';
    root.style.right = 'auto';
  });
  addEventListener('mouseup', () => on = false);
}

export function toggleDevPanel(on){
  if (!root) return;
  const want = on === undefined ? root.classList.contains('hide') : !!on;
  root.classList.toggle('hide', !want);
  G.dev.open = want;
  if (want) build();
}
export const devPanelOpen = () => !!(root && !root.classList.contains('hide'));
export const devPanelEl = () => root;
