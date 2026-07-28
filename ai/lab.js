#!/usr/bin/env node
/* =====================================================================
   lab.js — the playground.

   Everything here is about answering "what happens if I pay for THIS
   instead?" without babysitting a terminal. You give it a budget in
   matches, it trains, it makes the results fight, it writes a report.

   ---------------------------------------------------------------------
   THE FOUR EXPERIMENTS
   ---------------------------------------------------------------------

   node lab.js bakeoff --budget 10000
       Train every recipe on 10,000 matches each, then round-robin the
       champions against each other and against your hand-coded bot.
       Leaderboard, playstyles, report.

   node lab.js bakeoff --budget 10000 --rounds 3 --keep 4
       The same, but as a tournament with elimination. After each round
       the bottom recipes are dropped and the survivors are CROSS-BRED:
       each surviving school's next population is seeded with the
       champions of all the other survivors. Schools stop being isolated
       and start stealing each other's tricks.

   node lab.js sweep --recipe brawler --weight killDiff --values 10,30,70,150
       Take one recipe, vary ONE number, train each variant on the same
       budget, and fight them. This is the experiment that actually
       teaches you what a weight does.

   node lab.js ladder --recipe balanced
       Take every checkpoint of a finished run and make them all fight.
       Fitness is a proxy; this is measured strength over training, which
       is the honest version of the same curve.

   ---------------------------------------------------------------------
   Common options
   ---------------------------------------------------------------------
     --budget N     matches of training per recipe per round  (default 6000)
     --games N      games per pairing in the round robin      (default 24)
     --pop N        population                                (default 24)
     --trials N     matches per bot per generation            (default 8)
     --workers N    parallel processes            (default: cores - 1)
     --recipes a,b  which recipes to include  (default: all of them)
     --keep N       survivors per elimination round           (default 4)
     --rounds N     elimination rounds                        (default 1)
     --name X       name this experiment (default: auto)
     --mode 1v1|2v2
     --fresh        discard any previous run of this experiment

   Results land in ai/lab/<name>/ — brains, a report.md, and results.json.
   Re-running the same --name continues rather than restarting.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const Brain = require('./brain.js');
const Compete = require('./compete.js');

/* ------------------------------------------------------------------ */
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith('--')) { a._.push(t); continue; }
    const k = t.slice(2);
    a[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
  }
  return a;
}
const A = parseArgs(process.argv);
const CMD = A._[0] || 'help';

const RECIPES_FILE = path.join(__dirname, 'recipes.json');
const allRecipes = JSON.parse(fs.readFileSync(RECIPES_FILE, 'utf8'));
const recipeNames = Object.keys(allRecipes).filter(k => k[0] !== '_');

const CFG = {
  budget:  +(A.budget  || 6000),
  games:   +(A.games   || 24),
  pop:     +(A.pop     || 24),
  trials:  +(A.trials  || 8),
  workers: +(A.workers || Math.max(1, os.cpus().length - 1)),
  keep:    +(A.keep    || 4),
  rounds:  +(A.rounds  || 1),
  mode:    A.mode      || '1v1',
  maxTime: +(A.maxtime || 600),
  fresh:   A.fresh === 'true',
  seed:    +(A.seed    || 999)
};

const LABDIR = path.join(__dirname, 'lab');

/* ------------------------------------------------------------------ */
/* running the trainer                                                 */
/* ------------------------------------------------------------------ */
function train(recipeName, outDir, budget, opts) {
  opts = opts || {};
  const args = [
    path.join(__dirname, 'train.js'),
    '--recipe', recipeName,
    '--out', outDir,
    '--budget', String(budget),
    '--pop', String(CFG.pop),
    '--trials', String(CFG.trials),
    '--workers', String(CFG.workers),
    '--mode', CFG.mode,
    '--gens', '100000'            // budget decides; keep gens out of the way
  ];
  if (opts.recipeFile) args.push('--recipefile', opts.recipeFile);
  if (opts.fresh) args.push('--fresh');
  const r = spawnSync(process.execPath, args, { stdio: opts.quiet ? 'pipe' : 'inherit' });
  if (r.status !== 0 && !opts.tolerant) {
    throw new Error('training ' + recipeName + ' failed (exit ' + r.status + ')' +
      (r.stderr ? '\n' + r.stderr.toString().slice(-800) : ''));
  }
  return outDir;
}

/* Seed a run's population from a set of donor genomes, so the next round
   of training starts from what already worked instead of from noise.
   This is the cross-breeding step: each survivor inherits the champions
   of every other survivor. */
function seedPopulationWith(outDir, donors, keepGen, rng) {
  fs.mkdirSync(outDir, { recursive: true });
  const pop = [];
  for (const d of donors) pop.push(Brain.cloneGenome(d));          // the champions, untouched
  let i = 0;
  while (pop.length < CFG.pop) {
    const a = donors[i % donors.length];
    const b = donors[(i + 1 + Math.floor(rng() * (donors.length - 1 || 1))) % donors.length];
    let child = donors.length > 1 ? Brain.crossover(a, b, rng) : Brain.cloneGenome(a);
    child = Brain.mutate(child, rng, 0.16, 0.18);
    pop.push(child);
    i++;
  }
  fs.writeFileSync(path.join(outDir, 'population.json'), JSON.stringify({
    gen: keepGen || 0,
    population: pop.map(g => Brain.serialize(g)),
    hof: donors.slice(0, 6).map(g => Brain.serialize(g))
  }));
}

/* ------------------------------------------------------------------ */
/* reporting                                                           */
/* ------------------------------------------------------------------ */
function bar(v, w) {
  const n = Math.max(0, Math.min(w, Math.round(v * w)));
  return '█'.repeat(n) + '░'.repeat(w - n);
}
function printStandings(fighters, table, title) {
  const rows = fighters.map((f, i) => ({ f, ...table[i] }))
    .sort((a, b) => b.rate - a.rate);
  console.log('');
  console.log('  ' + title);
  console.log('  ' + '─'.repeat(72));
  console.log('  ' + '#'.padEnd(3) + 'school'.padEnd(20) + 'win%'.padStart(6) +
              '   record'.padEnd(13) + 'cs'.padStart(5) + 'k/d'.padStart(9) + '  style');
  rows.forEach((r, i) => {
    console.log('  ' + String(i + 1).padEnd(3) +
      r.f.label.slice(0, 19).padEnd(20) +
      Compete.pct(r.rate).padStart(6) + '   ' +
      (r.w + 'W-' + r.l + 'L').padEnd(12) +
      r.st.cs.toFixed(0).padStart(4) +
      (r.st.kills.toFixed(1) + '/' + r.st.deaths.toFixed(1)).padStart(10) + '  ' +
      Compete.styleOf(r.st.macro).slice(0, 34));
  });
  console.log('');
  return rows;
}
function mdStandings(rows) {
  let s = '| # | school | win% | record | cs | kills | deaths | tower dmg | style |\n';
  s += '|---|---|---|---|---|---|---|---|---|\n';
  rows.forEach((r, i) => {
    s += '| ' + (i + 1) + ' | ' + r.f.label + ' | ' + Compete.pct(r.rate) + ' | ' +
      r.w + 'W-' + r.l + 'L | ' + r.st.cs.toFixed(0) + ' | ' + r.st.kills.toFixed(1) + ' | ' +
      r.st.deaths.toFixed(1) + ' | ' + r.st.towerDmg.toFixed(0) + ' | ' +
      Compete.styleOf(r.st.macro) + ' |\n';
  });
  return s;
}

/* ------------------------------------------------------------------ */
/* shared setup for anything that needs to run matches                 */
/* ------------------------------------------------------------------ */
function arena() {
  const { loadGame } = require('./engine.js');
  const Arena = require('./arena.js');
  const game = loadGame();
  return { game, api: Arena.makeAPI(game), allHeroes: Object.keys(game.HEROES) };
}

function fightAll(entries, label) {
  const { game, api, allHeroes } = arena();
  const schedule = Compete.buildSchedule(CFG.games, {
    mode: CFG.mode, allHeroes, seed: CFG.seed
  });
  const fighters = [];
  for (const e of entries) {
    try { fighters.push(Compete.resolveBrain(e.path || e.name, LABDIR)); }
    catch (err) {
      console.log('  (skipping ' + e.name + ': ' + err.message.split('\n')[0] + ')');
      continue;
    }
    fighters[fighters.length - 1].label = e.name;
  }
  if (A.nobot !== 'true') fighters.push(Compete.resolveBrain('bot'));
  if (fighters.length < 2) throw new Error('need at least two contestants');

  process.stdout.write('  fighting ' + fighters.length + ' contestants, ' +
    (fighters.length * (fighters.length - 1) / 2 * CFG.games) + ' matches ');
  const table = Compete.roundRobin(game, api, fighters, schedule,
    { mode: CFG.mode, maxTime: CFG.maxTime }, () => process.stdout.write('.'));
  console.log('');
  return { fighters, table, rows: printStandings(fighters, table, label) };
}

/* ================================================================== */
/* COMMAND: bakeoff                                                    */
/* ================================================================== */
function cmdBakeoff() {
  const names = (A.recipes ? A.recipes.split(',') : recipeNames)
    .map(s => s.trim()).filter(Boolean);
  for (const n of names) if (!allRecipes[n]) {
    console.error('No recipe "' + n + '". Known: ' + recipeNames.join(', '));
    process.exit(1);
  }
  const expName = A.name || ('bakeoff-' + names.length + 'x' + CFG.budget);
  const dir = path.join(LABDIR, expName);
  if (CFG.fresh && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const totalMatches = names.length * CFG.budget * CFG.rounds;
  console.log('');
  console.log('  BAKEOFF — ' + expName);
  console.log('  ' + '─'.repeat(72));
  console.log('  recipes    ' + names.join(', '));
  console.log('  budget     ' + CFG.budget.toLocaleString() + ' matches each, per round');
  console.log('  rounds     ' + CFG.rounds + (CFG.rounds > 1 ? '  (keeping top ' + CFG.keep + ', cross-bred between rounds)' : ''));
  console.log('  training   ~' + totalMatches.toLocaleString() + ' matches total');
  console.log('  output     ' + path.relative(process.cwd(), dir));
  console.log('  ' + '─'.repeat(72));

  let alive = names.slice();
  const log = [];

  for (let round = 1; round <= CFG.rounds; round++) {
    console.log('\n  ══ ROUND ' + round + ' / ' + CFG.rounds + ' ══  training ' +
                alive.length + ' schools\n');
    for (const n of alive) {
      const out = path.join(dir, n);
      console.log('  ── ' + n + ' ' + '─'.repeat(Math.max(0, 60 - n.length)));
      train(n, out, CFG.budget, { tolerant: false });
    }

    const { fighters, table, rows } = fightAll(
      alive.map(n => ({ name: n, path: path.join(dir, n, 'best.json') })),
      'ROUND ' + round + ' STANDINGS  (' + CFG.games + ' games per pairing)');

    log.push({ round, rows: rows.map(r => ({ name: r.f.label, rate: r.rate, w: r.w, l: r.l })) });

    if (round < CFG.rounds) {
      const survivors = rows.map(r => r.f.label).filter(l => l !== 'hand-coded bot')
        .slice(0, CFG.keep);
      const dropped = alive.filter(n => !survivors.includes(n));
      alive = survivors;
      if (dropped.length) console.log('  eliminated: ' + dropped.join(', '));
      console.log('  surviving:  ' + alive.join(', '));

      /* cross-breed: everyone inherits everyone else's champion */
      const donors = [];
      for (const n of alive) {
        try { donors.push(Compete.resolveBrain(path.join(dir, n, 'best.json')).genome); }
        catch (e) { /* skip */ }
      }
      if (donors.length) {
        console.log('  cross-breeding ' + donors.length + ' champions into each survivor\n');
        for (const n of alive) {
          const st = JSON.parse(fs.readFileSync(path.join(dir, n, 'population.json'), 'utf8'));
          seedPopulationWith(path.join(dir, n), donors, st.gen || 0, Brain.makeRng(round * 7919 + 5));
        }
      }
    }
  }

  /* final report */
  const final = log[log.length - 1];
  let md = '# Bakeoff — ' + expName + '\n\n';
  md += '- recipes: `' + names.join('`, `') + '`\n';
  md += '- budget: ' + CFG.budget.toLocaleString() + ' matches per school per round\n';
  md += '- rounds: ' + CFG.rounds + (CFG.rounds > 1 ? ' (top ' + CFG.keep + ' survive, cross-bred between rounds)' : '') + '\n';
  md += '- round robin: ' + CFG.games + ' games per pairing, ' + CFG.mode + '\n';
  md += '- run: ' + new Date().toISOString() + '\n\n';
  log.forEach(r => {
    md += '## Round ' + r.round + '\n\n';
    md += '| # | school | win% | record |\n|---|---|---|---|\n';
    r.rows.forEach((x, i) => {
      md += '| ' + (i + 1) + ' | ' + x.name + ' | ' + Compete.pct(x.rate) + ' | ' + x.w + 'W-' + x.l + 'L |\n';
    });
    md += '\n';
  });
  md += '\nBrains are in this folder, one directory per school. Try one in the game with:\n\n';
  md += '```\nnode bake.js\n```\n';
  fs.writeFileSync(path.join(dir, 'report.md'), md);
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(log, null, 1));

  console.log('  report written to ' + path.relative(process.cwd(), path.join(dir, 'report.md')));
  console.log('  winner: ' + final.rows[0].name + '\n');
}

/* ================================================================== */
/* COMMAND: sweep                                                      */
/* ================================================================== */
function cmdSweep() {
  const base = A.recipe || 'balanced';
  const weight = A.weight;
  if (!allRecipes[base]) { console.error('No recipe "' + base + '"'); process.exit(1); }
  if (!weight) {
    console.error('Which weight? e.g. --weight killDiff --values 10,30,70');
    process.exit(1);
  }
  const values = (A.values || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
  if (values.length < 2) { console.error('Give at least two --values, e.g. 10,30,70'); process.exit(1); }

  const expName = A.name || ('sweep-' + base + '-' + weight);
  const dir = path.join(LABDIR, expName);
  if (CFG.fresh && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  console.log('');
  console.log('  SWEEP — "' + base + '", varying ' + weight);
  console.log('  ' + '─'.repeat(72));
  console.log('  values     ' + values.join(', ') + '   (currently ' +
              (allRecipes[base].weights[weight] !== undefined ? allRecipes[base].weights[weight] : 'unset') + ')');
  console.log('  budget     ' + CFG.budget.toLocaleString() + ' matches each');
  console.log('  ' + '─'.repeat(72));

  /* The variants live in their own throwaway file inside the experiment
     folder. Your recipes.json is never opened for writing — an earlier
     version swapped it out and restored it afterwards, which would have
     left your edits mangled if the run were ever killed mid-sweep. */
  const variants = [];
  const tmpRecipes = {};
  for (const v of values) {
    const nm = base + '_' + weight + '_' + String(v).replace(/[^\w-]/g, '');
    tmpRecipes[nm] = JSON.parse(JSON.stringify(allRecipes[base]));
    tmpRecipes[nm].desc = base + ' with ' + weight + ' = ' + v;
    tmpRecipes[nm].weights[weight] = v;
    variants.push(nm);
  }
  const recipeFile = path.join(dir, 'variants.json');
  fs.writeFileSync(recipeFile, JSON.stringify(tmpRecipes, null, 2));
  for (const nm of variants) {
    console.log('  ── ' + nm + ' ' + '─'.repeat(Math.max(0, 56 - nm.length)));
    train(nm, path.join(dir, nm), CFG.budget, { recipeFile });
  }

  const { rows } = fightAll(
    variants.map(nm => ({ name: nm, path: path.join(dir, nm, 'best.json') })),
    'SWEEP RESULTS — ' + base + ', ' + weight + ' varied');

  let md = '# Sweep — `' + base + '`, varying `' + weight + '`\n\n';
  md += 'Values tried: ' + values.join(', ') + '  \n';
  md += 'Budget: ' + CFG.budget.toLocaleString() + ' matches each  \n';
  md += 'Round robin: ' + CFG.games + ' games per pairing\n\n';
  md += mdStandings(rows);
  md += '\nThe `style` column is usually more interesting than the win rate — it shows ' +
        'what the weight actually *did* to the bot\'s behaviour.\n';
  fs.writeFileSync(path.join(dir, 'report.md'), md);
  console.log('  report written to ' + path.relative(process.cwd(), path.join(dir, 'report.md')) + '\n');
}

/* ================================================================== */
/* COMMAND: ladder                                                     */
/* ================================================================== */
function cmdLadder() {
  const recipe = A.recipe || 'balanced';
  const dir = A.dir ? path.resolve(A.dir) : path.join(__dirname, 'brains', recipe);
  if (!fs.existsSync(dir)) { console.error('No run at ' + dir); process.exit(1); }
  const cps = fs.readdirSync(dir).filter(f => /^gen\d+\.json$/.test(f)).sort();
  if (cps.length < 2) { console.error('Need at least two checkpoints in ' + dir); process.exit(1); }

  // don't fight 60 checkpoints against each other; take an even spread
  const want = Math.min(+(A.rungs || 6), cps.length);
  const picked = [];
  for (let i = 0; i < want; i++) {
    picked.push(cps[Math.round(i * (cps.length - 1) / (want - 1))]);
  }
  console.log('');
  console.log('  LADDER — ' + recipe + ', ' + picked.length + ' checkpoints of ' + cps.length);
  console.log('  ' + '─'.repeat(72));

  const { rows } = fightAll(
    picked.map(f => ({ name: recipe + '/' + f.replace('.json', ''), path: path.join(dir, f) })),
    'MEASURED STRENGTH BY CHECKPOINT');

  console.log('  If later checkpoints are not beating earlier ones, training has');
  console.log('  stalled — usually too few --trials, or a recipe with nothing left');
  console.log('  to say.\n');

  let md = '# Ladder — `' + recipe + '`\n\n' + mdStandings(rows);
  fs.mkdirSync(path.join(LABDIR, 'ladder-' + recipe), { recursive: true });
  fs.writeFileSync(path.join(LABDIR, 'ladder-' + recipe, 'report.md'), md);
}

/* ================================================================== */
function help() {
  console.log(fs.readFileSync(__filename, 'utf8')
    .split('/* ====')[1].split('====== */')[0]
    .replace(/^=+\n/, '').replace(/\n   /g, '\n'));
}

try {
  switch (CMD) {
    case 'bakeoff': cmdBakeoff(); break;
    case 'sweep':   cmdSweep();   break;
    case 'ladder':  cmdLadder();  break;
    default: help();
  }
} catch (err) {
  console.error('\n  ' + err.message + '\n');
  process.exit(1);
}
