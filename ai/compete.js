/* =====================================================================
   compete.js — putting two brains in a room, fairly.

   Shared by versus.js and lab.js so a "win rate" always means the same
   thing no matter which tool printed it.

   Fairness rules, both of which matter more than they look:
     - both contestants play the SAME seeds and the SAME hero matchups
     - sides are swapped every other game, so nobody wins on the coin toss
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const Brain = require('./brain.js');
const Arena = require('./arena.js');

/* ------------------------------------------------------------------ */
/* naming things                                                       */
/* ------------------------------------------------------------------ */
/*
   Accepted names:
     bot                  the original hand-written bot
     balanced             brains/balanced/best.json
     balanced/gen0050     that checkpoint
     lab/bakeoff-3/foo    anything under ai/, resolved as a folder with best.json
     ./some/path.json     that exact file
*/
function resolveBrain(name, baseDir) {
  if (name === 'bot') return { kind: 'bot', label: 'hand-coded bot' };
  const bases = [baseDir, path.join(__dirname, 'brains'), __dirname, process.cwd()]
    .filter(Boolean);

  /* Try every sensible reading of the name rather than guessing one.
     A name may be a folder (use its best.json), a checkpoint without the
     extension, or a full path — and it may be relative to the brains
     folder, the ai folder, or wherever you happen to be standing. */
  const candidates = [];
  if (path.isAbsolute(name)) candidates.push(name, path.join(name, 'best.json'), name + '.json');
  for (const b of bases) {
    candidates.push(
      path.join(b, name),                 // exact, if it already ends .json
      path.join(b, name + '.json'),       // a checkpoint, extension omitted
      path.join(b, name, 'best.json')     // a run folder
    );
  }
  const file = candidates.find(p => {
    try { return fs.statSync(p).isFile(); } catch (e) { return false; }
  });
  if (!file) {
    const e = new Error('No brain called "' + name + '".\n  Tried:\n    ' +
      [...new Set(candidates)].slice(0, 6).join('\n    '));
    e.notFound = true;
    throw e;
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    kind: 'nn',
    genome: Brain.deserialize(raw),        // throws .incompatible if stale
    label: name,
    file,
    meta: { gen: raw.gen, recipe: raw.recipe, fitness: raw.fitness }
  };
}

/* ------------------------------------------------------------------ */
/* the fixture list                                                    */
/* ------------------------------------------------------------------ */
function buildSchedule(n, opts) {
  opts = opts || {};
  const mode = opts.mode || '1v1';
  const per = mode === '2v2' ? 4 : 2;
  const pool = opts.heroes && opts.heroes.length ? opts.heroes : null;
  let s = (opts.seed || 999) >>> 0;
  const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const draw = arr => arr[Math.floor(rng() * arr.length) % arr.length];

  const list = [];
  for (let i = 0; i < n; i++) {
    const picks = [];
    const heroes = pool || opts.allHeroes;
    const h = draw(heroes);
    for (let k = 0; k < per; k++) {
      // every third fixture is a mirror, which isolates skill from hero balance
      picks.push(i % 3 === 0 ? h : draw(heroes));
    }
    list.push({ seed: 1000 + i * 7919, picks, side: i % 2 });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* the match itself                                                    */
/* ------------------------------------------------------------------ */
function blankStats() {
  return {
    cs: 0, kills: 0, deaths: 0, denies: 0, lvl: 0, towerDmg: 0, dmgHero: 0,
    lane: 0, macro: new Array(Brain.N_MACRO).fill(0)
  };
}

function duel(game, api, A, B, schedule, opts) {
  opts = opts || {};
  const mode = opts.mode || '1v1';
  const maxTime = opts.maxTime || 600;
  let aw = 0, bw = 0, draws = 0;
  const st = { a: blankStats(), b: blankStats() };

  for (const gme of schedule) {
    const agents = [];
    for (let s = 0; s < gme.picks.length; s++) {
      const isA = (s % 2) === (gme.side % 2);
      const who = isA ? A : B;
      agents[s] = who.kind === 'bot' ? { kind: 'bot' } : { kind: 'nn', genome: who.genome };
    }
    const res = Arena.runMatch(game, api, {
      seed: gme.seed, mode, picks: gme.picks, agents, maxTime
    });
    const meA = res.players[gme.side % 2];
    const meB = res.players[(gme.side + 1) % 2];
    if (res.winner < 0) draws++;
    else if (meA.won) aw++; else bw++;
    for (const [k, me] of [['a', meA], ['b', meB]]) {
      const t = st[k];
      t.cs += me.cs; t.kills += me.kills; t.deaths += me.deaths; t.denies += me.denies;
      t.lvl += me.lvl; t.towerDmg += me.towerDmg; t.dmgHero += me.dmgHero; t.lane += me.laneAvg;
      for (let i = 0; i < t.macro.length; i++) t.macro[i] += me.macroPct[i];
    }
  }
  const n = schedule.length || 1;
  for (const k of ['a', 'b']) {
    const t = st[k];
    for (const f of ['cs', 'kills', 'deaths', 'denies', 'lvl', 'towerDmg', 'dmgHero', 'lane'])
      t[f] /= n;
    for (let i = 0; i < t.macro.length; i++) t.macro[i] /= n;
  }
  return { aw, bw, draws, n, st };
}

/* ------------------------------------------------------------------ */
/* round robin                                                         */
/* ------------------------------------------------------------------ */
function roundRobin(game, api, fighters, schedule, opts, onPair) {
  const table = fighters.map(() => ({ w: 0, l: 0, d: 0, played: 0, st: blankStats(), pairs: 0 }));
  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const r = duel(game, api, fighters[i], fighters[j], schedule, opts);
      table[i].w += r.aw; table[i].l += r.bw; table[i].d += r.draws; table[i].played += r.n;
      table[j].w += r.bw; table[j].l += r.aw; table[j].d += r.draws; table[j].played += r.n;
      for (const [idx, side] of [[i, 'a'], [j, 'b']]) {
        const acc = table[idx].st, src = r.st[side];
        for (const f of ['cs', 'kills', 'deaths', 'denies', 'lvl', 'towerDmg', 'dmgHero', 'lane'])
          acc[f] += src[f];
        for (let k = 0; k < acc.macro.length; k++) acc.macro[k] += src.macro[k];
        table[idx].pairs++;
      }
      if (onPair) onPair(fighters[i], fighters[j], r);
    }
  }
  for (const row of table) {
    const p = row.pairs || 1;
    for (const f of ['cs', 'kills', 'deaths', 'denies', 'lvl', 'towerDmg', 'dmgHero', 'lane'])
      row.st[f] /= p;
    for (let k = 0; k < row.st.macro.length; k++) row.st.macro[k] /= p;
    row.rate = row.w / (row.w + row.l || 1);
  }
  return table;
}

/* ------------------------------------------------------------------ */
const styleOf = macro => macro
  .map((v, i) => [Brain.MACRO_NAMES[i], v])
  .sort((x, y) => y[1] - x[1]).slice(0, 3)
  .filter(([, v]) => v > 0.02)
  .map(([nm, v]) => nm.toLowerCase().replace('_', ' ') + ' ' + Math.round(v * 100) + '%')
  .join(', ') || '—';

const pct = v => (v * 100).toFixed(0) + '%';

module.exports = { resolveBrain, buildSchedule, duel, roundRobin, styleOf, pct, blankStats };
