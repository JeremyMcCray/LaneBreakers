#!/usr/bin/env node
/* =====================================================================
   train.js — where the learning happens.

   Run it:
       node train.js                          (recipe "balanced", 60 gens)
       node train.js --recipe brawler --gens 200
       node train.js --recipe farmer --pop 80 --trials 10
       node train.js --recipe balanced --resume        (continue a run)

   ---------------------------------------------------------------------
   THE ALGORITHM, IN SIX LINES
   ---------------------------------------------------------------------
     1. Make 60 random bots.
     2. Make each of them play the same 8 matches, so the comparison is fair.
     3. Score each one with the recipe.
     4. Keep the best quarter. Throw the rest away.
     5. Refill the population with children of the survivors, slightly mutated.
     6. Go to 2.

   That is a genetic algorithm. There is no gradient, no backpropagation,
   no calculus — just "did you win, yes or no", repeated a great many
   times. It is the simplest thing that genuinely works, and because
   matches run 700x faster than real time, "a great many times" is only
   a few minutes of your afternoon.

   ---------------------------------------------------------------------
   TWO DETAILS THAT MATTER MORE THAN THEY LOOK
   ---------------------------------------------------------------------
   FAIR TRIALS. Every bot in a generation faces the identical list of
   (random seed, hero matchup, opponent, which side you start on). Without
   this you are largely measuring luck, and evolution happily selects for
   lucky rather than good.

   THE HALL OF FAME. Bots are also made to play champions from earlier
   generations. Left alone, a population that only plays itself goes
   round in circles — everyone counters what everyone else is doing right
   now, and strength quietly goes backwards. Old champions are the
   anchor that stops that happening.
   ===================================================================== */
'use strict';
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const Brain = require('./brain.js');

/* ------------------------------------------------------------------ */
/* WORKER SIDE — evaluates genomes                                     */
/* ------------------------------------------------------------------ */
if (!isMainThread) {
  const { loadGame } = require('./engine.js');
  const Arena = require('./arena.js');
  const game = loadGame();
  const api  = Arena.makeAPI(game);

  parentPort.on('message', (msg) => {
    if (msg.cmd === 'die') { process.exit(0); return; }
    const { jobs, trials, recipe, maxTime, mode } = msg;
    const out = [];
    for (const job of jobs) {
      const genome = job.genome;
      let total = 0, wins = 0, botWins = 0, botGames = 0;
      const agg = { cs: 0, kills: 0, deaths: 0, denies: 0, lvl: 0, dmgHero: 0, towerDmg: 0, lane: 0 };
      const macro = new Array(Brain.N_MACRO).fill(0);

      for (const tr of trials) {
        const mySlot = tr.side;                       // 0 = blue, 1 = red
        const agents = [];
        for (let s = 0; s < tr.picks.length; s++) {
          if (s % 2 === mySlot % 2) agents[s] = { kind: 'nn', genome };
          else agents[s] = tr.opp.kind === 'bot'
            ? { kind: 'bot' }
            : { kind: 'nn', genome: tr.opp.genome };
        }
        const res = Arena.runMatch(game, api, {
          seed: tr.seed, mode, picks: tr.picks, agents, maxTime
        });
        const me = res.players[mySlot];
        // the opponent I am being compared against, for the differential terms
        const foes = res.players.filter(p => p.team !== me.team);
        const foe = foes.length === 1 ? foes[0] : {
          cs: 0, kills: 0, netWorth: 0, lvl: 0, dmgHero: 0, denies: 0, towerDmg: 0,
          ...foes.reduce((a, p) => {
            for (const k of ['cs', 'kills', 'netWorth', 'lvl', 'dmgHero', 'denies', 'towerDmg'])
              a[k] = (a[k] || 0) + p[k] / foes.length;
            return a;
          }, {})
        };
        total += Arena.score(recipe, me, res, foe);
        wins += me.won;
        if (tr.opp.kind === 'bot') { botGames++; botWins += me.won; }
        agg.cs += me.cs; agg.kills += me.kills; agg.deaths += me.deaths;
        agg.denies += me.denies; agg.lvl += me.lvl; agg.dmgHero += me.dmgHero;
        agg.towerDmg += me.towerDmg; agg.lane += me.laneAvg;
        for (let i = 0; i < macro.length; i++) macro[i] += me.macroPct[i];
      }
      const n = trials.length;
      for (const k in agg) agg[k] /= n;
      for (let i = 0; i < macro.length; i++) macro[i] /= n;
      out.push({
        idx: job.idx, fitness: total / n, winRate: wins / n,
        botWinRate: botGames ? botWins / botGames : null, agg, macro
      });
    }
    parentPort.postMessage(out);
  });
  return;
}

/* ------------------------------------------------------------------ */
/* MAIN SIDE                                                           */
/* ------------------------------------------------------------------ */
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) continue;
    const k = t.slice(2);
    const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
    a[k] = v;
  }
  return a;
}
const A = parseArgs(process.argv);

const CFG = {
  recipe:   A.recipe   || 'balanced',
  gens:     +(A.gens   || 60),
  pop:      +(A.pop    || 60),
  trials:   +(A.trials || 8),
  workers:  A.workers === 'auto' || !A.workers ? Math.max(1, os.cpus().length - 1) : +A.workers,
  mode:     A.mode     || '1v1',
  hero:     A.hero     || 'random',
  maxTime:  +(A.maxtime || 420),
  eliteFrac:+(A.elite  || 0.25),
  mutRate:  +(A.mutrate || 0.18),
  mutSigma: +(A.sigma  || 0.22),
  freshFrac:+(A.fresh  || 0.06),
  botShare: +(A.botshare || 0.5),      // share of trials against the hand-written bot
  rotate:   +(A.rotate || 5),          // keep the same trial set for N generations
  hofSize:  +(A.hof    || 12),
  save:     +(A.save   || 5),          // checkpoint every N generations
  // stop cleanly after this many wall-clock seconds (0 = no limit). Useful
  // for training in short bursts: state is saved every generation, so
  // `--resume` picks up exactly where it left off.
  maxSeconds: +(A.maxseconds || 0),
  out:      A.out      || null,
  /* Continuing is the default: run the same command twice and it picks up
     where it left off. --fresh starts over, and never destroys the old run
     — it moves it into brains/_archive/ first. */
  fresh:    A.fresh === 'true' || A.fresh === true,
  quiet:    A.quiet === 'true' || A.quiet === true,
  /* budget in MATCHES rather than generations, which is the unit that
     actually costs you time. Overrides --gens when given. */
  budget:   +(A.budget || 0),
  seed:     +(A.seed   || 12345)
};

/* --recipefile lets lab.js run throwaway recipe variants without ever
   touching your recipes.json */
const RECIPE_FILE = A.recipefile
  ? path.resolve(A.recipefile)
  : path.join(__dirname, 'recipes.json');
const recipes = JSON.parse(fs.readFileSync(RECIPE_FILE, 'utf8'));
const RECIPE = recipes[CFG.recipe];
if (!RECIPE) {
  console.error('No recipe called "' + CFG.recipe + '". Available: ' +
    Object.keys(recipes).filter(k => k[0] !== '_').join(', '));
  process.exit(1);
}
const OUTDIR = CFG.out || path.join(__dirname, 'brains', CFG.recipe);
fs.mkdirSync(OUTDIR, { recursive: true });

/* a match budget is easier to reason about than a generation count, because
   generations get slower as bots survive longer */
if (CFG.budget) {
  CFG.gens = Math.max(1, Math.round(CFG.budget / (CFG.pop * CFG.trials)));
}

/* --fresh: put the old run somewhere safe rather than overwriting it. */
const POPFILE = path.join(OUTDIR, 'population.json');
if (CFG.fresh && fs.existsSync(POPFILE)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archive = path.join(__dirname, 'brains', '_archive', path.basename(OUTDIR) + '-' + stamp);
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.renameSync(OUTDIR, archive);
  fs.mkdirSync(OUTDIR, { recursive: true });
  console.log('\n  --fresh: previous run moved to ' + path.relative(__dirname, archive));
}

/* a seeded RNG for the training process itself, so a whole run is
   reproducible end to end */
let _s = CFG.seed >>> 0 || 1;
function rng() {
  _s ^= _s << 13; _s >>>= 0; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0;
  return _s / 4294967296;
}
const pick = arr => arr[Math.floor(rng() * arr.length) % arr.length];

/* need one copy of the game on the main thread just to read hero/item lists */
const { loadGame } = require('./engine.js');
const Arena = require('./arena.js');
const gameMain = loadGame();
const apiMain  = Arena.makeAPI(gameMain);
const ALL_HEROES = Object.keys(gameMain.HEROES);
const HEROES_USED = CFG.hero === 'random' ? ALL_HEROES : CFG.hero.split(',');
for (const h of HEROES_USED) if (!gameMain.HEROES[h]) {
  console.error('Unknown hero "' + h + '". Known: ' + ALL_HEROES.join(', '));
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* ---------------------------------------------------------------------
   Building a generation's exam paper.

   Two things here are more important than they look.

   THE PAPER ONLY CHANGES EVERY FEW GENERATIONS. If every generation faced
   brand new seeds and brand new hero matchups, the fitness number would
   move mostly because the exam changed, not because the bots got better —
   and selection would largely be picking lucky bots. Holding the trial set
   still for `--rotate` generations makes improvement real and visible.
   Rotating it at all is what stops the population overfitting to four
   particular matches.

   OPPONENTS ARE ASSIGNED BY POSITION, NOT BY DICE. With only a handful of
   trials, rolling randomly for each one meant some generations contained
   no matches against the hand-written bot at all — so the "beats old bot"
   reading vanished, and the anchor that stops the population drifting off
   into mutual weirdness came and went at random.
   --------------------------------------------------------------------- */
function buildTrials(gen, hof, elites) {
  const per = CFG.mode === '2v2' ? 4 : 2;
  const trials = [];
  const era = Math.floor(gen / CFG.rotate);
  const eraRng = (() => {                       // a fresh stream per era
    let s = (CFG.seed ^ (era * 2654435761)) >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  })();
  const draw = arr => arr[Math.floor(eraRng() * arr.length) % arr.length];
  const nBot = Math.max(1, Math.round(CFG.trials * CFG.botShare));

  for (let i = 0; i < CFG.trials; i++) {
    const picks = [];
    for (let s = 0; s < per; s++) picks.push(draw(HEROES_USED));
    // mirror matchups now and then: the same hero on both sides isolates
    // skill from hero balance, so the bot can't just learn "Sable is strong"
    if (i % 3 === 0) for (let s = 0; s < per; s++) picks[s] = picks[0];

    let opp;
    if (i < nBot || (!hof.length && !elites.length)) opp = { kind: 'bot' };
    else if (hof.length && (i % 2 === 0)) opp = { kind: 'nn', genome: pick(hof) };
    else if (elites.length) opp = { kind: 'nn', genome: pick(elites) };
    else opp = { kind: 'bot' };

    trials.push({
      seed: (era * 7919 + i * 104729 + 13) >>> 0,
      picks, opp, side: i % 2                   // half the trials from each side
    });
  }
  return trials;
}

/* ------------------------------------------------------------------ */
function makeWorkers(n) {
  const ws = [];
  for (let i = 0; i < n; i++) ws.push(new Worker(__filename, { workerData: { id: i } }));
  return ws;
}

function evaluateOnce(workers, population, trials) {
  return new Promise((resolve, reject) => {
    const results = new Array(population.length);
    const chunks = workers.map(() => []);
    population.forEach((g, idx) => chunks[idx % workers.length].push({ idx, genome: g }));
    let pending = workers.length, failed = false;
    workers.forEach((w, i) => {
      const onMsg = (out) => {
        w.off('message', onMsg); w.off('error', onErr); w.off('exit', onExit);
        for (const r of out) results[r.idx] = r;
        if (--pending === 0 && !failed) resolve(results);
      };
      const onErr = (e) => { failed = true; w.off('message', onMsg); reject(e); };
      const onExit = (code) => { if (code !== 0 && !failed) { failed = true; reject(new Error('worker exited with code ' + code)); } };
      w.on('message', onMsg); w.once('error', onErr); w.once('exit', onExit);
      w.postMessage({
        jobs: chunks[i], trials, recipe: RECIPE,
        maxTime: CFG.maxTime, mode: CFG.mode
      });
    });
  });
}

/* Workers occasionally die on their own — a V8 JIT hiccup, an out-of-memory
   moment on a busy machine. Over a two-hour run that would otherwise throw
   away everything. So: if one dies, replace it and redo the generation.
   Training state lives in the main thread, so nothing is lost. */
async function evaluate(workersRef, population, trials) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await evaluateOnce(workersRef.list, population, trials);
    } catch (err) {
      console.log('        ! a worker died (' + err.message + ') — restarting it and retrying');
      for (const w of workersRef.list) { try { w.terminate(); } catch (e) {} }
      await new Promise(r => setTimeout(r, 500));
      workersRef.list = makeWorkers(workersRef.list.length);
    }
  }
  throw new Error('workers kept failing — try fewer with --workers 1');
}

/* ------------------------------------------------------------------ */
function saveBrain(file, genome, meta) {
  fs.writeFileSync(file, JSON.stringify(Brain.serialize(genome, meta)));
}
function loadBrain(file) {
  return Brain.deserialize(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const bar = (v, lo, hi, w) => {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1)));
  const n = Math.round(t * w);
  return '█'.repeat(n) + '░'.repeat(w - n);
};

/* ------------------------------------------------------------------ */
async function main() {
  console.log('');
  console.log('  LANEBREAKER  —  neural bot training');
  console.log('  ' + '─'.repeat(66));
  console.log('  recipe      ' + CFG.recipe + '   — ' + (RECIPE.desc || ''));
  console.log('  network     ' + Brain.LAYERS.join(' → ') + '   (' + Brain.N_WEIGHTS + ' weights)');
  console.log('  population  ' + CFG.pop + ' bots × ' + CFG.trials + ' matches = ' +
              (CFG.pop * CFG.trials) + ' matches per generation');
  console.log('  generations ' + CFG.gens + '        workers ' + CFG.workers +
              '        mode ' + CFG.mode);
  console.log('  heroes      ' + (CFG.hero === 'random' ? 'all ' + ALL_HEROES.length + ', randomised' : CFG.hero));
  console.log('  saving to   ' + OUTDIR);
  console.log('  ' + '─'.repeat(66));
  console.log('');

  let population = [];
  let hof = [];
  let startGen = 0;
  const historyFile = path.join(OUTDIR, 'history.json');
  let history = [];

  if (fs.existsSync(POPFILE)) {
    const st = JSON.parse(fs.readFileSync(POPFILE, 'utf8'));
    try {
      population = st.population.map(Brain.deserialize);
      hof = (st.hof || []).map(Brain.deserialize);
      startGen = st.gen || 0;
      // population size may have changed since last time; keep the best
      if (population.length > CFG.pop) population = population.slice(0, CFG.pop);
      if (fs.existsSync(historyFile)) history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      console.log('  CONTINUING an existing run from generation ' + startGen +
                  '   (use --fresh to start over)');
      console.log('  will stop at generation ' + CFG.gens + '\n');
      if (startGen >= CFG.gens) {
        console.log('  Already past generation ' + CFG.gens + '. Raise --gens (or --budget)');
        console.log('  to train further, or use --fresh to start again.\n');
        process.exit(0);
      }
    } catch (err) {
      if (!err.incompatible) throw err;
      console.log('');
      console.log('  Cannot resume this run:');
      console.log('  ' + err.message);
      console.log('');
      console.log('  Nothing has been deleted. Re-run the same command with --fresh');
      console.log('  and the old run will be moved into brains/_archive/ for you.');
      console.log('');
      process.exit(1);
    }
  } else {
    for (let i = 0; i < CFG.pop; i++) population.push(Brain.randomGenome(apiMain, rng));
  }
  while (population.length < CFG.pop) population.push(Brain.randomGenome(apiMain, rng));

  const workersRef = { list: makeWorkers(CFG.workers) };
  const t0 = Date.now();
  let bestEver = -Infinity;

  for (let gen = startGen; gen < CFG.gens; gen++) {
    const elites = population.slice(0, Math.max(1, Math.floor(CFG.pop * CFG.eliteFrac)));
    const trials = buildTrials(gen, hof, gen === startGen ? [] : elites);

    const gt0 = Date.now();
    let results;
    try {
      results = await evaluate(workersRef, population, trials);
    } catch (err) {
      console.error('\n  Training stopped: ' + err.message);
      workersRef.list.forEach(w => w.terminate());
      process.exit(1);
    }
    const secs = (Date.now() - gt0) / 1000;

    /* rank */
    const order = results.map((r, i) => ({ r, i })).sort((a, b) => b.r.fitness - a.r.fitness);
    const best = order[0].r;
    const mean = results.reduce((s, r) => s + r.fitness, 0) / results.length;
    const botWR = results.filter(r => r.botWinRate !== null);
    const bestBotWR = best.botWinRate;
    const meanBotWR = botWR.length ? botWR.reduce((s, r) => s + r.botWinRate, 0) / botWR.length : 0;

    if (best.fitness > bestEver) bestEver = best.fitness;

    const topMacro = best.macro
      .map((v, i) => [Brain.MACRO_NAMES[i], v])
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([n, v]) => n.toLowerCase() + ' ' + Math.round(v * 100) + '%').join(', ');

    console.log(
      '  gen ' + String(gen).padStart(3) +
      ' | fit ' + best.fitness.toFixed(0).padStart(6) +
      ' (avg ' + mean.toFixed(0).padStart(6) + ')' +
      ' | beats old bot ' + (bestBotWR === null ? ' -- ' : (bestBotWR * 100).toFixed(0).padStart(3) + '%') +
      ' | cs ' + best.agg.cs.toFixed(0).padStart(3) +
      ' k/d ' + best.agg.kills.toFixed(1) + '/' + best.agg.deaths.toFixed(1) +
      ' | ' + secs.toFixed(1) + 's'
    );
    if (gen % 5 === 0) console.log('        └ favours: ' + topMacro);

    history.push({
      gen, best: best.fitness, mean, bestBotWR, meanBotWR,
      cs: best.agg.cs, kills: best.agg.kills, deaths: best.agg.deaths,
      lane: best.agg.lane, macro: best.macro
    });

    /* ---- checkpoints: these become the difficulty ladder ---- */
    const bestGenome = population[order[0].i];
    if (gen % CFG.save === 0 || gen === CFG.gens - 1) {
      saveBrain(path.join(OUTDIR, 'gen' + String(gen).padStart(4, '0') + '.json'), bestGenome, {
        recipe: CFG.recipe, gen, fitness: best.fitness, botWinRate: best.botWinRate,
        mode: CFG.mode, trained: new Date().toISOString()
      });
    }
    saveBrain(path.join(OUTDIR, 'best.json'), bestGenome, {
      recipe: CFG.recipe, gen, fitness: best.fitness, botWinRate: best.botWinRate,
      mode: CFG.mode, trained: new Date().toISOString()
    });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 1));

    /* ---- hall of fame ---- */
    if (gen % 5 === 0) {
      hof.push(Brain.cloneGenome(bestGenome));
      if (hof.length > CFG.hofSize) hof.shift();
    }

    /* ---- breed the next generation ---------------------------------
       elites survive untouched (so we can never get worse by accident),
       most of the rest are mutated children of two good parents, and a
       few are brand new randoms to keep fresh ideas entering the pool. */
    const nElite = Math.max(2, Math.floor(CFG.pop * CFG.eliteFrac));
    const nFresh = Math.floor(CFG.pop * CFG.freshFrac);
    const parents = order.slice(0, nElite).map(o => population[o.i]);
    const next = parents.map(Brain.cloneGenome);

    const tournament = () => {
      // pick 3 at random from the top half, keep the best of them
      const half = Math.max(2, Math.floor(CFG.pop / 2));
      let bi = -1, bf = -Infinity;
      for (let k = 0; k < 3; k++) {
        const c = Math.floor(rng() * half);
        if (order[c].r.fitness > bf) { bf = order[c].r.fitness; bi = order[c].i; }
      }
      return population[bi];
    };

    while (next.length < CFG.pop - nFresh) {
      const pa = tournament(), pb = tournament();
      let child = rng() < 0.65 ? Brain.crossover(pa, pb, rng) : Brain.cloneGenome(pa);
      // late in a run, mutate more gently — coarse changes stop helping
      const decay = 1 - 0.6 * (gen / Math.max(1, CFG.gens));
      child = Brain.mutate(child, rng, CFG.mutRate, CFG.mutSigma * decay);
      next.push(child);
    }
    while (next.length < CFG.pop) next.push(Brain.randomGenome(apiMain, rng));
    population = next;

    fs.writeFileSync(path.join(OUTDIR, 'population.json'), JSON.stringify({
      gen: gen + 1,
      population: population.map(g => Brain.serialize(g)),
      hof: hof.map(g => Brain.serialize(g))
    }));

    if (CFG.maxSeconds && (Date.now() - t0) / 1000 >= CFG.maxSeconds) {
      workersRef.list.forEach(w => w.terminate());
      console.log('\n  time budget reached at generation ' + (gen + 1) +
                  ' — everything is saved. Continue with --resume.\n');
      process.exit(0);
    }
  }

  workersRef.list.forEach(w => w.terminate());
  const mins = (Date.now() - t0) / 60000;
  console.log('');
  console.log('  ' + '─'.repeat(66));
  console.log('  done in ' + mins.toFixed(1) + ' min. Best brain: ' + path.join(OUTDIR, 'best.json'));
  console.log('  checkpoints in ' + OUTDIR + ' are your difficulty ladder.');
  console.log('');
  console.log('  next:   node versus.js --a ' + CFG.recipe + ' --b bot');
  console.log('          node bake.js            (put the trained brains into the game)');
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
