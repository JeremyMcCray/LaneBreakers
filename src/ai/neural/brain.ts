// @ts-nocheck
/* Ported from ../../Lanebreakers/ai/brain.js — keep behavior identical. */
/* ------------------------------------------------------------------ */
/* shape of the network                                                */
/* ------------------------------------------------------------------ */
/* Bump BRAIN_FORMAT whenever the meaning or count of the inputs changes.
   A brain is only a list of numbers — it has no idea what those numbers
   were measuring, so feeding an old brain new senses produces confident
   nonsense rather than an error. The version stamp turns that into a
   clear "retrain me" instead. */
const BRAIN_FORMAT = 'lanebreaker-brain-2';

const N_IN      = 44;
/* One hidden layer of 20. Deliberately small: with evolution (rather than
   gradient descent) the number of generations needed grows with the number
   of weights, and a single hidden layer is ample for choosing between eight
   behaviours. 1,000 weights learns in an afternoon; 10,000 would not. If you
   later want more subtlety, widen this — and expect to train longer. */
const N_HIDDEN  = [20];
const N_MACRO   = 8;
const N_ABILITY = 4;
const N_OUT     = N_MACRO + N_ABILITY;   // 12
const LAYERS    = [N_IN, ...N_HIDDEN, N_OUT];

const MACRO_NAMES = ['FARM', 'PUSH', 'HARASS', 'ALL_IN',
                     'RETREAT', 'DENY', 'SIEGE', 'REPOSITION'];

/* how often a bot re-thinks, in seconds. 10 times a second, same as the
   original hand-written bot, so the comparison between them is fair. */
const THINK_INTERVAL = 0.1;

/* ------------------------------------------------------------------ */
/* the maths                                                           */
/* ------------------------------------------------------------------ */
function weightCount(layers) {
  let n = 0;
  for (let i = 0; i < layers.length - 1; i++) n += layers[i] * layers[i + 1] + layers[i + 1];
  return n;
}
const N_WEIGHTS = weightCount(LAYERS);

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const dist  = (a, b, c, d) => Math.hypot(a - c, b - d);
const sigmoid = x => 1 / (1 + Math.exp(-x));

/* A standard forward pass. tanh on the hidden layers keeps values in
   [-1,1] so nothing explodes; the output layer is left raw and
   interpreted by the caller. */
function forward(weights, input, out) {
  let cur = input, w = 0;
  for (let L = 0; L < LAYERS.length - 1; L++) {
    const nIn = LAYERS[L], nOut = LAYERS[L + 1];
    const next = (L === LAYERS.length - 2 && out) ? out : new Float64Array(nOut);
    for (let j = 0; j < nOut; j++) {
      let sum = weights[w + nIn * nOut + j];          // bias
      const base = w + j * nIn;
      for (let i = 0; i < nIn; i++) sum += weights[base + i] * cur[i];
      next[j] = (L === LAYERS.length - 2) ? sum : Math.tanh(sum);
    }
    w += nIn * nOut + nOut;
    cur = next;
  }
  return cur;
}

/* ------------------------------------------------------------------ */
/* genomes                                                             */
/* ------------------------------------------------------------------ */

/* Every non-consumable item, in a stable order. Stored inside each saved
   brain so a brain trained before you added a new item still loads. */
function itemPool(API) {
  return Object.keys(API.ITEMS).filter(k => API.ITEMS[k].cat !== 'consume');
}

/* Box-Muller: turns two flat random numbers into one bell-curve random
   number. Mutations want a bell curve — mostly small nudges, rarely a
   big jump. */
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Index of the first bias of the final layer, so we can set the bot's
   starting disposition without touching anything else. */
function outputBiasOffset() {
  let w = 0;
  for (let L = 0; L < LAYERS.length - 2; L++) w += LAYERS[L] * LAYERS[L + 1] + LAYERS[L + 1];
  return w + LAYERS[LAYERS.length - 2] * LAYERS[LAYERS.length - 1];
}

function randomGenome(API, rng) {
  rng = rng || Math.random;
  const pool = itemPool(API);
  const w = new Float64Array(N_WEIGHTS);
  // small random starting weights — big ones saturate tanh and the bot
  // is born with strong opinions it can never be talked out of
  for (let i = 0; i < w.length; i++) w[i] = gauss(rng) * 0.5;

  /* ---- give generation zero a sensible posture --------------------
     Left purely random, a newborn bot twitches between all eight moods
     several times a second and does nothing coherent. Every early
     generation is then spent rediscovering "stand near the creeps and
     hit them", which we already know is the right default.

     So the output biases start tilted: FARM is the resting behaviour and
     abilities lean slightly towards being used when they are up. This is
     a starting posture, not a rule — the biases are ordinary weights and
     evolution overrides them the moment that pays. It buys perhaps
     twenty generations of head start.                                */
  const b = outputBiasOffset();
  for (let i = 0; i < N_MACRO; i++)   w[b + i] = gauss(rng) * 0.3;
  w[b + 0] += 1.4;                       // FARM — the sane default
  w[b + 2] += 0.3;                       // HARASS — mild willingness to poke
  w[b + 4] -= 0.5;                       // RETREAT — don't start as a coward
  w[b + 7] -= 0.5;                       // REPOSITION — nor as a hermit
  for (let i = 0; i < N_ABILITY; i++) w[b + N_MACRO + i] = 0.4 + gauss(rng) * 0.3;

  const skillPri = new Float64Array(4);
  for (let i = 0; i < 4; i++) skillPri[i] = rng();
  const itemPri = new Float64Array(pool.length);
  for (let i = 0; i < pool.length; i++) itemPri[i] = rng();
  /* boots are not a discovery worth spending generations on */
  const bi = pool.indexOf('boots');
  if (bi >= 0) itemPri[bi] = 0.75 + rng() * 0.25;
  return { w, skillPri, itemPri, pool, layers: LAYERS.slice() };
}

/* Mutation: nudge most genes a little, occasionally shove one hard.
   `rate` is what fraction of genes get touched, `sigma` how hard. */
function mutate(g, rng, rate, sigma) {
  const out = cloneGenome(g);
  for (let i = 0; i < out.w.length; i++) {
    if (rng() < rate) {
      // 5% of the time make a bold jump instead of a nudge — this is how
      // a population escapes a strategy that is merely OK
      out.w[i] += gauss(rng) * (rng() < 0.05 ? sigma * 6 : sigma);
    }
  }
  for (let i = 0; i < out.skillPri.length; i++)
    if (rng() < rate * 2) out.skillPri[i] = clamp(out.skillPri[i] + gauss(rng) * 0.25, 0, 1);
  for (let i = 0; i < out.itemPri.length; i++)
    if (rng() < rate * 2) out.itemPri[i] = clamp(out.itemPri[i] + gauss(rng) * 0.25, 0, 1);
  return out;
}

/* Crossover: build a child by taking runs of genes alternately from two
   parents. Runs rather than single genes, because neighbouring weights
   tend to cooperate and chopping too finely destroys what works. */
function crossover(a, b, rng) {
  const out = cloneGenome(a);
  let from = rng() < 0.5;
  for (let i = 0; i < out.w.length; i++) {
    if (rng() < 0.02) from = !from;               // ~50-gene average runs
    out.w[i] = from ? a.w[i] : b.w[i];
  }
  for (let i = 0; i < out.skillPri.length; i++) out.skillPri[i] = rng() < 0.5 ? a.skillPri[i] : b.skillPri[i];
  for (let i = 0; i < out.itemPri.length; i++)   out.itemPri[i]  = rng() < 0.5 ? a.itemPri[i]  : b.itemPri[i];
  return out;
}

function cloneGenome(g) {
  return {
    w: Float64Array.from(g.w),
    skillPri: Float64Array.from(g.skillPri),
    itemPri: Float64Array.from(g.itemPri),
    pool: g.pool.slice(),
    layers: (g.layers || LAYERS).slice()
  };
}

/* Saved form: plain JSON, rounded to 4 decimals to keep files small.
   A whole brain is about 25 KB — small enough to paste into the HTML. */
function serialize(g, meta) {
  const r = a => Array.from(a, x => Math.round(x * 1e4) / 1e4);
  return Object.assign({
    format: BRAIN_FORMAT,
    layers: g.layers || LAYERS,
    w: r(g.w), skillPri: r(g.skillPri), itemPri: r(g.itemPri), pool: g.pool
  }, meta || {});
}

/* Thrown, rather than limped past, when a saved brain does not match the
   senses this build has. Carries a `.incompatible` flag so callers can
   skip a stale file gracefully instead of falling over. */
function IncompatibleBrain(msg) {
  const e = new Error(msg);
  e.incompatible = true;
  return e;
}

function deserialize(o) {
  const layers = (o.layers || LAYERS).slice();
  if (layers[0] !== N_IN) {
    throw IncompatibleBrain(
      'This brain expects ' + layers[0] + ' inputs but this build of the AI has ' + N_IN +
      '. It was trained before the senses changed, so its weights no longer mean anything. ' +
      'Train a fresh one (drop --resume, or delete that folder under ai/brains/).');
  }
  if (layers[layers.length - 1] !== N_OUT) {
    throw IncompatibleBrain('This brain has ' + layers[layers.length - 1] +
      ' outputs but this build expects ' + N_OUT + '. Retrain it.');
  }
  return {
    w: Float64Array.from(o.w),
    skillPri: Float64Array.from(o.skillPri),
    itemPri: Float64Array.from(o.itemPri),
    pool: o.pool.slice(),
    layers
  };
}

/* ------------------------------------------------------------------ */
/* SENSES — turning a game state into 40 numbers                       */
/* ------------------------------------------------------------------ */
/*
   Two rules govern everything here:

   1. Everything is normalised to roughly -1..1. A network fed raw values
      like "gold = 2400" alongside "hp fraction = 0.8" simply ignores the
      small one. Scale matters more than almost anything else.

   2. Everything is mirrored so that "forward" always means "toward the
      enemy". A bot on the red team sees the same numbers it would see on
      blue. Without this you would have to train two separate bots.
*/
function features(API, S, p, mem, buf) {
  const f = buf || new Float64Array(N_IN);
  f.fill(0);
  const e = p.hero;
  if (!e) return f;

  const H       = API.HEROES[p.heroId];
  const dir     = p.team === 0 ? 1 : -1;
  const myTower = API.TOWER_X[p.team];
  const foeTowerX = API.TOWER_X[1 - p.team];
  const laneY   = mem.laneY;
  const span    = Math.abs(foeTowerX - myTower) || 1;

  /* nearest living enemy hero */
  let foe = null, foeD = 9999;
  for (const q of S.players) {
    if (q.team === p.team || !q.hero || q.hero.dead) continue;
    const d = dist(e.x, e.y, q.hero.x, q.hero.y);
    if (d < foeD) { foeD = d; foe = q; }
  }
  const foeE = foe ? foe.hero : null;

  /* --- self ------------------------------------------------------- */
  f[0] = e.hp / e.maxHp;
  f[1] = e.maxMp > 0 ? e.mp / e.maxMp : 1;
  f[2] = p.lvl / 12;
  f[3] = clamp(((e.x - myTower) * dir) / span, -0.5, 1.5);     // lane position
  f[4] = clamp((e.y - laneY) / 260, -1, 1);                    // how far off-centre
  f[5] = clamp(p.gold / 2500, 0, 1);
  f[6] = p.items.length / 6;
  f[7] = e.atkCd > 0 ? 0 : 1;                                  // swing ready
  f[8] = clamp((mem.prevHp - e.hp) / (e.maxHp * 0.15), -1, 1); // taking damage right now?

  /* --- the enemy hero --------------------------------------------- */
  f[9]  = foeE ? foeE.hp / foeE.maxHp : 1;
  f[10] = foeE && foeE.maxMp > 0 ? foeE.mp / foeE.maxMp : 1;
  f[11] = foe ? clamp((p.lvl - foe.lvl) / 6, -1, 1) : 0;
  f[12] = clamp(foeD / 1200, 0, 1);
  f[13] = foe ? 0 : 1;                                          // all enemies dead
  f[14] = foeE ? clamp(((foeE.x - myTower) * dir) / span, -0.5, 1.5) : 1;
  f[15] = foeE && foeD < (e.range + e.r + foeE.r + 30) ? 1 : 0;  // I can hit them
  f[16] = foeE && foeD < (foeE.range + foeE.r + e.r + 30) ? 1 : 0; // they can hit me

  /* --- one pass over the world -------------------------------------
     Creeps, towers and "who is currently trying to kill me" all come out
     of the same sweep. This runs ten times a second for every bot, so it
     is worth doing once rather than three times. */
  let myCreeps = 0, foeCreeps = 0;
  let nearestFoeCreep = 9999, lastHitNow = 0, lastHitSoon = 0, denyNow = 0;
  let frontX = null;
  let myTowerE = null, foeTowerE = null;
  let creepsOnMe = 0, towerOnMe = 0, heroSwingingAtMe = 0;
  const swing = e.dmg;

  for (const o of S.ents) {
    if (o.dead) continue;

    /* --- am I the one being hit? --------------------------------
       Every creep and tower carries `tid`, the id of whatever it has
       decided to attack; a hero mid-swing carries `wTid` plus a
       positive `windT`. Reading them tells the bot it is about to be
       hit BEFORE the damage lands, which is the difference between
       backing off and dying. */
    if (o.team !== p.team) {
      if (o.tid === e.id) {
        if (o.type === 'creep') creepsOnMe++;
        else if (o.type === 'tower') towerOnMe = 1;
      }
      if (o.type === 'hero' && o.wTid === e.id && o.windT > 0) heroSwingingAtMe = 1;
    }

    if (o.type === 'tower') {
      if (o.team === p.team) myTowerE = o; else foeTowerE = o;
      continue;
    }
    if (o.type !== 'creep') continue;

    const d = dist(e.x, e.y, o.x, o.y);
    if (d > 1100) continue;
    const reach = e.range + o.r + e.r * 0.4;
    const hit = swing * API.armorMult(o.armor || 0);
    if (o.team === p.team) {
      myCreeps++;
      if (frontX === null || (dir > 0 ? o.x > frontX : o.x < frontX)) frontX = o.x;
      // a deny is only legal below half health
      if (d < reach + 20 && o.hp / o.maxHp < 0.5 && o.hp <= hit * 1.3) denyNow = 1;
    } else {
      foeCreeps++;
      if (d < nearestFoeCreep) nearestFoeCreep = d;
      if (d < reach && o.hp <= hit * 1.3) lastHitNow = 1;
      const soon = 1 / (1 + o.hp / Math.max(1, hit));
      if (d < reach + 260 && soon > lastHitSoon) lastHitSoon = soon;
    }
  }

  /* damage already in the air with my name on it — tower shots, ranged
     autos and homing bolts are all projectiles carrying a target id */
  let incoming = 0;
  for (const pr of S.projs) if (pr.tid === e.id) incoming += (pr.dmg || 0);
  f[17] = clamp((myCreeps - foeCreeps) / 6, -1, 1);
  f[18] = clamp(nearestFoeCreep / 900, 0, 1);
  f[19] = lastHitNow;
  f[20] = lastHitSoon;
  f[21] = denyNow;
  f[22] = frontX !== null ? clamp(((frontX - myTower) * dir) / span, -0.5, 1.5) : 0.5;
  f[23] = clamp(1 - S.waveT / 25, 0, 1);                        // next wave imminent

  /* --- towers ------------------------------------------------------ */
  f[24] = foeTowerE ? foeTowerE.hp / foeTowerE.maxHp : 0;
  f[25] = myTowerE ? myTowerE.hp / myTowerE.maxHp : 0;
  f[26] = clamp(1 - Math.abs(e.x - foeTowerX) / 900, 0, 1);      // in tower range
  f[27] = clamp(1 - Math.abs(e.x - myTower) / 900, 0, 1);        // safe under mine

  /* --- my abilities ------------------------------------------------ */
  let burst = 0;
  for (let i = 0; i < 4; i++) {
    const ready = API.canCast(S, p, i) ? 1 : 0;
    f[28 + i] = ready;
    if (ready) {
      const A = H.abilities[i];
      if (A.val && p.sk[i] > 0) burst += (A.val[p.sk[i] - 1] || 0);
    }
  }
  f[32] = foeE ? clamp(burst / Math.max(1, foeE.hp), 0, 1) : 0;  // can I burst them down

  /* --- match context ----------------------------------------------- */
  f[33] = clamp(S.t / 900, 0, 1);
  f[34] = clamp((S.teamKills[p.team] - S.teamKills[1 - p.team]) / (S.winKills || 3), -1, 1);
  f[35] = clamp(S.teamKills[p.team] / (S.winKills || 3), 0, 1);

  /* --- who am I ----------------------------------------------------
     These let ONE network play all 14 heroes. Without them the net has
     no way to know that a 640-range sniper should not walk into melee. */
  f[36] = H.ranged ? 1 : 0;
  f[37] = clamp(e.range / 700, 0, 1);
  f[38] = clamp(e.ms / 400, 0, 1);

  /* --- THREAT: who is currently trying to kill me ------------------
     Before these existed the bot could only infer danger after the fact,
     from its own health dropping (f[8]) — which is a tenth of a second
     too late to do anything about. These four say what is about to
     happen instead of what just did.

     Creep aggro and tower aggro are the two things that decide whether
     stepping up for a last hit is free or fatal, and they are invisible
     in every other input. */
  f[39] = clamp(creepsOnMe / 4, 0, 1);                 // enemy creeps locked onto me
  f[40] = towerOnMe;                                   // the enemy tower has picked me
  f[41] = heroSwingingAtMe;                            // their hero is mid-swing at me
  f[42] = clamp(incoming / Math.max(1, e.hp), 0, 1);   // damage already in the air, vs my HP

  f[43] = 1;                                           // bias

  return f;
}

/* ------------------------------------------------------------------ */
/* HANDS — turning a decision into game orders                         */
/* ------------------------------------------------------------------ */

/* Where should ability `i` be aimed? The network decided it wants to
   cast; this picks a sensible point so it does not have to learn
   geometry from scratch. */
function aimAbility(API, S, p, i, macro, foeE, mem) {
  const e = p.hero, A = API.HEROES[p.heroId].abilities[i];
  const dir = p.team === 0 ? 1 : -1;
  const laneY = mem.laneY;

  if (A.cast === 'self') return { x: foeE ? foeE.x : e.x + dir * 200, y: foeE ? foeE.y : e.y };

  const range = A.range || 400;

  // an escape blink used while retreating should go BACKWARDS
  if (A.blink && (macro === 4 /* RETREAT */ || (foeE && e.hp / e.maxHp < 0.3))) {
    return { x: e.x - dir * range, y: laneY };
  }

  if (foeE) {
    const d = dist(e.x, e.y, foeE.x, foeE.y);
    if (d < range * 1.05) {
      // lead the target: aim where they will be, not where they are.
      // mem.foeVel is measured from their movement since the last think.
      const flight = (A.blink ? 0 : d / 1400) + 0.12;
      return { x: foeE.x + mem.foeVx * flight, y: foeE.y + mem.foeVy * flight };
    }
  }

  // no hero in reach — throw it at the wave instead
  let best = null, bestD = 1e9;
  for (const o of S.ents) {
    if (o.dead || o.type !== 'creep' || o.team === p.team) continue;
    const d = dist(e.x, e.y, o.x, o.y);
    if (d < bestD && d < range * 1.05) { bestD = d; best = o; }
  }
  if (best) return { x: best.x, y: best.y };
  return { x: e.x + dir * range * 0.8, y: laneY };
}

/* Find something worth auto-attacking right now. */
function findLastHit(API, S, p) {
  const e = p.hero, swing = e.dmg;
  let target = null, bestHp = 1e9;
  for (const o of S.ents) {
    if (o.dead || o.type !== 'creep' || o.team === p.team) continue;
    const reach = e.range + o.r + e.r * 0.4;
    if (dist(e.x, e.y, o.x, o.y) > reach) continue;
    // swing early: the blow lands after a wind-up, so aim at what will be
    // dead by the time it arrives, not what is dead now
    const hit = swing * API.armorMult(o.armor || 0);
    if (o.hp <= hit * 1.9 && o.hp < bestHp) { bestHp = o.hp; target = o; }
  }
  return target;
}
function findDeny(API, S, p) {
  const e = p.hero, swing = e.dmg;
  let target = null, bestHp = 1e9;
  for (const o of S.ents) {
    if (o.dead || o.type !== 'creep' || o.team !== p.team) continue;
    if (o.hp / o.maxHp >= 0.5) continue;                 // not deniable yet
    const reach = e.range + o.r + e.r * 0.4;
    if (dist(e.x, e.y, o.x, o.y) > reach + 20) continue;
    const hit = swing * API.armorMult(o.armor || 0);
    if (o.hp <= hit * 1.9 && o.hp < bestHp) { bestHp = o.hp; target = o; }
  }
  return target;
}
/* the front of my own creep line — the natural place to stand */
function creepAnchor(S, p, dir, fallback) {
  let frontX = null;
  for (const o of S.ents) {
    if (o.dead || o.type !== 'creep' || o.team !== p.team) continue;
    if (frontX === null || (dir > 0 ? o.x > frontX : o.x < frontX)) frontX = o.x;
  }
  return frontX === null ? fallback : frontX;
}

/* ------------------------------------------------------------------ */
/* HOUSEKEEPING — levelling and shopping                               */
/* ------------------------------------------------------------------ */
function spendSkillPoints(API, p, g) {
  const H = API.HEROES[p.heroId];
  const ULT_REQ = [6, 9, 12];
  let guard = 8;
  while (p.points > 0 && guard-- > 0) {
    let best = -1, bestPri = -1e9;
    for (let i = 0; i < 4; i++) {
      const A = H.abilities[i];
      const max = A.ult ? 3 : 4;
      if (p.sk[i] >= max) continue;
      if (A.ult && p.lvl < ULT_REQ[p.sk[i]]) continue;
      if (A.passive && p.sk[i] >= max) continue;
      // an ult you can take is almost always worth taking, so it gets a
      // thumb on the scale — but the genome can still overrule it
      const pri = g.skillPri[i] + (A.ult ? 0.35 : 0);
      if (pri > bestPri) { bestPri = pri; best = i; }
    }
    if (best < 0) break;
    p.sk[best]++; p.points--;
    const A = H.abilities[best];
    if (A.charges && p.sk[best] === 1) p.chg[best] = A.charges;
  }
}

function doShopping(API, S, p, g) {
  const e = p.hero;
  const owned = new Set();
  for (const it of p.items)   owned.add(it.id);
  for (const q of p.pending)  owned.add(q.id);

  // consumables stay on simple rules — no need to evolve "buy a potion
  // when hurt", and letting the net waste gold on salves is just noise
  if (e && e.hp / e.maxHp < 0.55 && !owned.has('salve') && p.gold > API.ITEMS.salve.cost + 250) {
    API.buyItem(S, p, 'salve');
  }
  if (p.items.length + p.pending.length >= 6) return;

  // buy the highest-priority thing currently affordable
  let best = null, bestPri = -1e9;
  for (let i = 0; i < g.pool.length; i++) {
    const id = g.pool[i];
    if (owned.has(id)) continue;
    const def = API.ITEMS[id];
    if (!def || p.gold < def.cost) continue;
    if (g.itemPri[i] > bestPri) { bestPri = g.itemPri[i]; best = id; }
  }
  if (best) API.buyItem(S, p, best);
}

/* ------------------------------------------------------------------ */
/* THE MAIN LOOP — called once per tick per bot                        */
/* ------------------------------------------------------------------ */
function think(API, S, p, dt, genome, opts) {
  if (S.over) return;
  const e = p.hero;
  if (!e) return;
  opts = opts || {};

  /* per-bot scratch memory. Only numbers and ids live here — never an
     object reference, because players get serialised into snapshots. */
  let mem = p.nn;
  if (!mem) {
    let laneY = 450;
    for (const o of S.ents) if (o.type === 'tower') { laneY = o.y; break; }
    mem = p.nn = {
      t: 0, prevHp: e.hp, foeX: e.x, foeY: e.y, foeVx: 0, foeVy: 0,
      macro: 0, laneY, buf: new Float64Array(N_IN), out: new Float64Array(N_OUT),
      macroTime: new Array(N_MACRO).fill(0)
    };
  }

  spendSkillPoints(API, p, genome);
  doShopping(API, S, p, genome);
  if (e.dead) { mem.prevHp = e.hp; return; }

  mem.t -= dt;
  if (mem.t > 0) return;
  mem.t = THINK_INTERVAL;

  /* --- track enemy movement so abilities can be led ---------------- */
  let foe = null, foeD = 9999;
  for (const q of S.players) {
    if (q.team === p.team || !q.hero || q.hero.dead) continue;
    const d = dist(e.x, e.y, q.hero.x, q.hero.y);
    if (d < foeD) { foeD = d; foe = q; }
  }
  const foeE = foe ? foe.hero : null;
  if (foeE) {
    mem.foeVx = (foeE.x - mem.foeX) / THINK_INTERVAL;
    mem.foeVy = (foeE.y - mem.foeY) / THINK_INTERVAL;
    mem.foeX = foeE.x; mem.foeY = foeE.y;
  } else { mem.foeVx = mem.foeVy = 0; }

  /* --- LOOK, THINK, ACT -------------------------------------------- */
  const f = features(API, S, p, mem, mem.buf);
  const out = forward(genome.w, f, mem.out);

  let macro = 0, bestV = -1e9;
  for (let i = 0; i < N_MACRO; i++) if (out[i] > bestV) { bestV = out[i]; macro = i; }

  /* Optional handicap, used for the easier difficulty tiers: some of the
     time, ignore the network and just farm. A weaker opponent, not a
     stupid one. */
  if (opts.noise && Math.random() < opts.noise) macro = 0;

  mem.macro = macro;
  mem.macroTime[macro] += THINK_INTERVAL;

  const dir      = p.team === 0 ? 1 : -1;
  const myTower  = API.TOWER_X[p.team];
  const foeTower = API.TOWER_X[1 - p.team];
  const laneY    = mem.laneY;
  const hpPct    = e.hp / e.maxHp;

  /* mana potion, when it is obviously right */
  const draIdx = p.items.findIndex(it => it.id === 'draught');
  if (draIdx >= 0 && e.maxMp > 0 && e.mp / e.maxMp < 0.3) API.useItem(S, p, draIdx, e.x, e.y);
  const salveIdx = p.items.findIndex(it => it.id === 'salve');
  if (salveIdx >= 0 && hpPct < 0.5 && e.salveT <= 0 && foeD > 650) API.useItem(S, p, salveIdx, e.x, e.y);

  /* --- abilities: net says whether, code says where ---------------- */
  for (let i = 0; i < N_ABILITY; i++) {
    if (sigmoid(out[N_MACRO + i]) < 0.5) continue;
    if (!API.canCast(S, p, i)) continue;
    const A = API.HEROES[p.heroId].abilities[i];
    // don't fling a targeted spell at nothing
    if (A.cast === 'point' && !foeE) {
      let anyCreep = false;
      for (const o of S.ents) {
        if (o.dead || o.type !== 'creep' || o.team === p.team) continue;
        if (dist(e.x, e.y, o.x, o.y) < (A.range || 400)) { anyCreep = true; break; }
      }
      if (!anyCreep && !A.blink) continue;
    }
    const aim = aimAbility(API, S, p, i, macro, foeE, mem);
    API.castAbility(S, p, i, aim.x, aim.y);
    break;                                    // one cast per think — no instant combos
  }

  /* --- free execution: take a last hit whenever one is there -------
     Skipped during ALL_IN and RETREAT, where the bot has decided it has
     bigger problems than a creep. */
  if (macro !== 3 && macro !== 4) {
    const lh = findLastHit(API, S, p);
    if (lh) { p.order = { type: 'attack', tid: lh.id }; return; }
  }

  /* --- carry out the mood ------------------------------------------ */
  switch (macro) {
    case 0: { // FARM — sit on the creep line and farm
      const anchor = creepAnchor(S, p, dir, (myTower + foeTower) / 2) - dir * 70;
      const px = clamp(anchor, Math.min(myTower, foeTower) + 120, Math.max(myTower, foeTower) - 120);
      p.order = { type: 'move', x: px, y: laneY + Math.sin(S.t * 0.7) * 40 };
      break;
    }
    case 1: { // PUSH — attack-move up the lane
      const limit = foeTower - dir * 420;
      const px = dir > 0 ? Math.min(e.x + 400, limit) : Math.max(e.x - 400, limit);
      p.order = { type: 'amove', x: px, y: laneY, sm: 1 };
      break;
    }
    case 2: { // HARASS — poke the enemy while keeping my preferred range
      if (!foeE) { p.order = { type: 'amove', x: e.x + dir * 300, y: laneY, sm: 1 }; break; }
      const want = e.range * 0.85;
      if (foeD > e.range + e.r + foeE.r) {
        const t = (foeD - want) / foeD;
        p.order = { type: 'move', x: e.x + (foeE.x - e.x) * t, y: e.y + (foeE.y - e.y) * t };
      } else if (foeD < want * 0.6 && API.HEROES[p.heroId].ranged) {
        p.order = { type: 'move', x: e.x - (foeE.x - e.x) * 0.5, y: e.y - (foeE.y - e.y) * 0.5 };
      } else {
        p.order = { type: 'attack', tid: foeE.id };
      }
      break;
    }
    case 3: { // ALL_IN — commit to the kill
      if (!foeE) { p.order = { type: 'amove', x: e.x + dir * 300, y: laneY, sm: 1 }; break; }
      p.order = { type: 'attack', tid: foeE.id };
      break;
    }
    case 4: { // RETREAT — get out
      const back = e.x - dir * 700;
      p.order = { type: 'move', x: clamp(back, 60, foeTower + dir * 0 + (dir > 0 ? 0 : 3400)), y: laneY };
      p.order.x = dir > 0 ? Math.max(60, back) : Math.min(3340, back);
      break;
    }
    case 5: { // DENY — kill my own creeps to starve them
      const dn = findDeny(API, S, p);
      if (dn) { p.order = { type: 'attack', tid: dn.id }; break; }
      const anchor = creepAnchor(S, p, dir, (myTower + foeTower) / 2);
      p.order = { type: 'move', x: anchor, y: laneY };
      break;
    }
    case 6: { // SIEGE — hit the tower
      let tw = null;
      for (const o of S.ents) if (o.type === 'tower' && o.team !== p.team && !o.dead) tw = o;
      if (tw && Math.abs(e.x - tw.x) < e.range + 200) p.order = { type: 'attack', tid: tw.id };
      else p.order = { type: 'amove', x: foeTower - dir * 60, y: laneY, sm: 1 };
      break;
    }
    default: { // REPOSITION — tuck in behind my own wave
      const anchor = creepAnchor(S, p, dir, (myTower + foeTower) / 2) - dir * 260;
      p.order = { type: 'move', x: clamp(anchor, 120, 3280), y: laneY + Math.sin(S.t * 1.3) * 60 };
    }
  }
  mem.prevHp = e.hp;
}

/* ------------------------------------------------------------------ */
/* FITNESS — turning a finished match into a single number.

   Lives here rather than in the trainer so that the Node trainer and the
   in-game trainer score matches with exactly the same arithmetic. A
   "recipe" (see recipes.json) is just a table of wages: the bot learns
   to do whatever you pay it for, and nothing else. This is the most
   powerful knob in the whole project.
   ------------------------------------------------------------------ */
function score(recipe, me, result, foe) {
  const R = recipe.weights || recipe;
  const mins = Math.max(1, result.duration) / 60;
  let s = 0;

  /* ---- differentials: the terms that matter most -------------------
     "I got 30 last hits" is a bad goal — in a long match everyone gets
     30. "I got 12 more last hits than my opponent" is a real one. Paying
     for the gap rather than the total also removes match length from the
     equation entirely, which is what stopped an earlier version of this
     bot from discovering that the safest way to win a short match was to
     hide behind its own creeps and farm quietly to the final whistle. */
  if (foe) {
    s += (R.csDiff    || 0) * (me.cs      - foe.cs);
    s += (R.killDiff  || 0) * (me.kills   - foe.kills);
    s += (R.goldDiff  || 0) * (me.netWorth - foe.netWorth);
    s += (R.lvlDiff   || 0) * (me.lvl     - foe.lvl);
    s += (R.dmgDiff   || 0) * (me.dmgHero - foe.dmgHero);
    s += (R.denyDiff  || 0) * (me.denies  - foe.denies);
    s += (R.towerDiff || 0) * (me.towerDmg - foe.towerDmg);
  }

  if (me.won)       s += R.win  || 0;
  else if (me.draw) s += R.draw || 0;
  else              s += R.loss || 0;

  // a fast win is worth more than a slow one; a slow loss beats a fast one
  if (R.speed) {
    const frac = 1 - Math.min(1, result.duration / 900);
    s += (me.won ? R.speed * frac : -R.speed * frac * 0.5);
  }

  s += (R.cs      || 0) * me.cs;
  s += (R.deny    || 0) * me.denies;
  s += (R.gold    || 0) * me.netWorth;
  s += (R.level   || 0) * me.lvl;
  s += (R.csRate  || 0) * (me.cs / mins);

  s += (R.kill     || 0) * me.kills;
  s += (R.assist   || 0) * me.assists;
  s += (R.death    || 0) * me.deaths;
  s += (R.dmgHero  || 0) * me.dmgHero;
  s += (R.towerDmg || 0) * me.towerDmg;
  s += (R.heal     || 0) * me.healed;

  s += (R.aggression || 0) * me.laneAvg;
  if (R.passivity) {
    const passive = me.macroPct[0] + me.macroPct[4] + me.macroPct[7]; // FARM+RETREAT+REPOSITION
    s += R.passivity * passive;
  }
  if (R.variety) {
    let h = 0;
    for (const v of me.macroPct) if (v > 0) h -= v * Math.log(v);
    s += R.variety * (h / Math.log(N_MACRO));
  }
  return s;
}

/* A seeded random number generator, shared for the same reason: matches
   must be replayable so two bots can be compared on identical luck. */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}


export {
  N_IN, N_OUT, N_MACRO, N_ABILITY, N_WEIGHTS, LAYERS, MACRO_NAMES, THINK_INTERVAL,
  BRAIN_FORMAT, IncompatibleBrain,
  itemPool, randomGenome, mutate, crossover, cloneGenome,
  serialize, deserialize, features, forward, think, gauss, score, makeRng
};
export default {
  N_IN, N_OUT, N_MACRO, N_ABILITY, N_WEIGHTS, LAYERS, MACRO_NAMES, THINK_INTERVAL,
  BRAIN_FORMAT, IncompatibleBrain,
  itemPool, randomGenome, mutate, crossover, cloneGenome,
  serialize, deserialize, features, forward, think, gauss, score, makeRng
};
