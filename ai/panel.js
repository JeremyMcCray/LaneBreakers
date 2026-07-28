#!/usr/bin/env node
/* =====================================================================
   panel.js — a control panel, so you never have to remember a flag.

       node panel.js

   Starts a small web page on http://127.0.0.1:8787 and opens it. From
   there you can start training, run lab experiments, edit recipe weights
   with sliders, watch the live log, and bake the result into the game —
   without typing a command.

       --port 9000     use a different port
       --no-open       don't launch a browser

   It is only a front end. Every button builds the same command you would
   have typed and runs the same script, so anything you start here you can
   also start from a terminal, and vice versa.

   ---------------------------------------------------------------------
   A note on safety
   ---------------------------------------------------------------------
   The server binds to 127.0.0.1 only, and it never passes anything from
   the page to a shell. Each command is assembled here from a fixed
   whitelist of flags, with every value coerced to a number or checked
   against a known list first. The page cannot ask it to run anything but
   train.js, lab.js, versus.js and bake.js.
   ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const AI = __dirname;
const RECIPES = path.join(AI, 'recipes.json');
const BRAINS = path.join(AI, 'brains');
const LAB = path.join(AI, 'lab');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith('--')) ? true : v;
}
const PORT = +(arg('port', 8787));
const OPEN = !arg('no-open', false);

/* ------------------------------------------------------------------ */
/* what each fitness weight means, for the sliders                     */
/* ------------------------------------------------------------------ */
const WEIGHT_META = [
  { group: 'Match outcome', keys: [
    ['win',   0, 300, 5,  'Paid for winning the match.'],
    ['loss',  -200, 0, 5, 'Paid for losing. Usually 0 — a negative here makes losing actively painful.'],
    ['draw',  -100, 150, 5, 'Paid for a draw.'],
    ['speed', 0, 150, 5,  'Bonus for winning FAST, and mercy for losing slowly.']
  ]},
  { group: 'Differentials — prefer these', keys: [
    ['csDiff',    0, 15, 0.5,   'Per last hit MORE than the opponent got.'],
    ['denyDiff',  0, 15, 0.5,   'Per net deny.'],
    ['killDiff',  0, 200, 5,    'Per net kill. The big lever for aggression.'],
    ['goldDiff',  0, 0.1, 0.002,'Per gold of net-worth lead. Keep tiny.'],
    ['lvlDiff',   0, 40, 1,     'Per level of lead.'],
    ['dmgDiff',   0, 0.2, 0.005,'Per point of hero-damage lead.'],
    ['towerDiff', 0, 0.5, 0.01, 'Per point of tower-damage lead. Raise to breed a pusher.']
  ]},
  { group: 'Behaviour', keys: [
    ['death',      -150, 0, 2,  'Fine per own death. Under a 2-kill win condition this bites hard.'],
    ['aggression', -30, 60, 1,  'Per unit of average lane position. Negative = hug your own tower.'],
    ['passivity',  -150, 0, 5,  'Fine on time spent farming/retreating. Stops the bot stalling.'],
    ['variety',    0, 40, 1,    'Rewards using a spread of behaviours rather than one on repeat.']
  ]},
  { group: 'Absolute totals — use sparingly', keys: [
    ['cs',       0, 10, 0.5,   'Per last hit, regardless of the opponent. Prefer csDiff.'],
    ['deny',     0, 10, 0.5,   'Per deny. Prefer denyDiff.'],
    ['kill',     0, 100, 5,    'Per kill. Prefer killDiff.'],
    ['assist',   0, 40, 1,     'Per assist.'],
    ['level',    0, 30, 1,     'Per hero level reached.'],
    ['gold',     0, 0.1, 0.002,'Per gold of net worth.'],
    ['csRate',   0, 10, 0.5,   'Per last hit per minute.'],
    ['dmgHero',  0, 0.15, 0.005,'Per point of damage to enemy heroes.'],
    ['towerDmg', 0, 0.3, 0.01, 'Per point of tower damage.'],
    ['heal',     0, 0.1, 0.002,'Per point healed.']
  ]}
];
const KNOWN_WEIGHTS = new Set(WEIGHT_META.flatMap(g => g.keys.map(k => k[0])));

/* ------------------------------------------------------------------ */
/* job runner                                                          */
/* ------------------------------------------------------------------ */
const job = {
  child: null, label: '', argv: [], log: [], startedAt: 0,
  gen: 0, totalGens: 0, genSecs: [], exitCode: null
};
const LOG_MAX = 5000;

function pushLog(chunk) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (line === '' && job.log.length && job.log[job.log.length - 1] === '') continue;
    job.log.push(line);
    parseProgress(line);
  }
  if (job.log.length > LOG_MAX) job.log.splice(0, job.log.length - LOG_MAX);
}
function parseProgress(line) {
  let m = line.match(/generations\s+(\d+)/);
  if (m) { job.totalGens = +m[1]; job.gen = 0; job.genSecs = []; }
  m = line.match(/^\s*gen\s+(\d+)\s*\|.*\|\s*([\d.]+)s\s*$/);
  if (m) {
    job.gen = +m[1] + 1;
    job.genSecs.push(+m[2]);
    if (job.genSecs.length > 12) job.genSecs.shift();
  }
  m = line.match(/CONTINUING an existing run from generation (\d+)/);
  if (m) job.gen = +m[1];
}

function startJob(label, argv) {
  if (job.child) throw new Error('Something is already running. Stop it first.');
  job.label = label; job.argv = argv; job.log = []; job.startedAt = Date.now();
  job.gen = 0; job.totalGens = 0; job.genSecs = []; job.exitCode = null;
  pushLog('$ node ' + argv.map(a => path.basename(a)).join(' ') + '\n');
  const child = spawn(process.execPath, argv, { cwd: AI });
  job.child = child;
  child.stdout.on('data', pushLog);
  child.stderr.on('data', pushLog);
  child.on('exit', (code, sig) => {
    job.exitCode = code;
    pushLog('\n' + (code === 0 ? '✔ finished' : (sig ? '■ stopped' : '✖ exited with code ' + code)) +
            ' after ' + fmtDur((Date.now() - job.startedAt) / 1000) + '\n');
    job.child = null;
  });
}
function fmtDur(s) {
  s = Math.round(s);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

/* ------------------------------------------------------------------ */
/* validation — nothing from the page reaches a command unchecked      */
/* ------------------------------------------------------------------ */
function readRecipes() {
  return JSON.parse(fs.readFileSync(RECIPES, 'utf8'));
}
function recipeNames() {
  return Object.keys(readRecipes()).filter(k => k[0] !== '_');
}
const num = (v, lo, hi, def) => {
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
};
function checkRecipe(name) {
  if (!recipeNames().includes(name)) throw new Error('Unknown recipe "' + name + '"');
  return name;
}
function checkMode(m) { return m === '2v2' ? '2v2' : '1v1'; }

function buildArgv(cmd, a) {
  a = a || {};
  const common = () => ([
    '--pop', String(num(a.pop, 4, 400, 24)),
    '--trials', String(num(a.trials, 1, 200, 8)),
    '--workers', String(num(a.workers, 1, 64, Math.max(1, os.cpus().length - 1))),
    '--mode', checkMode(a.mode),
    '--maxtime', String(num(a.maxtime, 30, 900, 600))
  ]);
  switch (cmd) {
    case 'train': {
      const argv = [path.join(AI, 'train.js'), '--recipe', checkRecipe(a.recipe), ...common()];
      if (a.useBudget) argv.push('--budget', String(num(a.budget, 50, 5e7, 10000)), '--gens', '1000000');
      else argv.push('--gens', String(num(a.gens, 1, 100000, 200)));
      if (a.fresh) argv.push('--fresh');
      return { label: 'train · ' + a.recipe, argv };
    }
    case 'bakeoff': {
      const list = (Array.isArray(a.recipes) ? a.recipes : []).map(checkRecipe);
      if (!list.length) throw new Error('Pick at least one recipe');
      const argv = [path.join(AI, 'lab.js'), 'bakeoff',
        '--recipes', list.join(','),
        '--budget', String(num(a.budget, 50, 5e7, 8000)),
        '--rounds', String(num(a.rounds, 1, 12, 1)),
        '--keep', String(num(a.keep, 1, 30, 4)),
        '--games', String(num(a.games, 2, 400, 24)),
        ...common()];
      if (a.name) argv.push('--name', String(a.name).replace(/[^\w.-]/g, '').slice(0, 40));
      if (a.fresh) argv.push('--fresh');
      if (a.nobot) argv.push('--nobot', 'true');
      return { label: 'bakeoff · ' + list.length + ' recipes', argv };
    }
    case 'sweep': {
      const w = String(a.weight || '');
      if (!KNOWN_WEIGHTS.has(w)) throw new Error('Unknown weight "' + w + '"');
      const vals = String(a.values || '').split(',').map(s => Number(s.trim()))
        .filter(n => isFinite(n)).slice(0, 8);
      if (vals.length < 2) throw new Error('Give at least two values to compare');
      const argv = [path.join(AI, 'lab.js'), 'sweep',
        '--recipe', checkRecipe(a.recipe),
        '--weight', w,
        '--values', vals.join(','),
        '--budget', String(num(a.budget, 50, 5e7, 8000)),
        '--games', String(num(a.games, 2, 400, 24)),
        ...common()];
      if (a.fresh) argv.push('--fresh');
      return { label: 'sweep · ' + a.recipe + ' / ' + w, argv };
    }
    case 'ladder': {
      const argv = [path.join(AI, 'lab.js'), 'ladder',
        '--recipe', checkRecipe(a.recipe),
        '--rungs', String(num(a.rungs, 2, 12, 6)),
        '--games', String(num(a.games, 2, 400, 12)),
        ...common()];
      return { label: 'ladder · ' + a.recipe, argv };
    }
    case 'versus': {
      const safe = s => String(s || '').replace(/[^\w./\\:-]/g, '').slice(0, 120);
      const argv = [path.join(AI, 'versus.js'),
        '--a', safe(a.a) || 'balanced',
        '--b', safe(a.b) || 'bot',
        '--games', String(num(a.games, 2, 400, 30)),
        '--mode', checkMode(a.mode),
        '--maxtime', String(num(a.maxtime, 30, 900, 600))];
      return { label: 'versus · ' + safe(a.a) + ' vs ' + safe(a.b), argv };
    }
    case 'bake':
      return { label: 'bake into the game', argv: [path.join(AI, 'bake.js')] };
    default:
      throw new Error('Unknown command');
  }
}

/* ------------------------------------------------------------------ */
/* discovering existing runs                                           */
/* ------------------------------------------------------------------ */
function runInfo(dir, name, kind) {
  const hist = path.join(dir, 'history.json');
  const best = path.join(dir, 'best.json');
  if (!fs.existsSync(best)) return null;
  const o = { name, kind, gens: 0, best: null, botWR: null, checkpoints: 0, stale: false };
  try {
    const b = JSON.parse(fs.readFileSync(best, 'utf8'));
    o.gens = (b.gen || 0) + 1;
    o.recipe = b.recipe;
    const Brain = require('./brain.js');
    if ((b.layers || [])[0] !== Brain.N_IN) o.stale = true;
  } catch (e) { o.stale = true; }
  try {
    const h = JSON.parse(fs.readFileSync(hist, 'utf8'));
    o.gens = h.length;
    const last = h[h.length - 1];
    o.best = last.best;
    const wr = h.filter(x => x.bestBotWR != null).slice(-10);
    if (wr.length) o.botWR = wr.reduce((s, x) => s + x.bestBotWR, 0) / wr.length;
    o.curve = h.filter((_, i) => i % Math.max(1, Math.ceil(h.length / 40)) === 0)
                .map(x => x.best);
  } catch (e) { /* no history */ }
  try {
    o.checkpoints = fs.readdirSync(dir).filter(f => /^gen\d+\.json$/.test(f)).length;
  } catch (e) {}
  return o;
}
function listRuns() {
  const out = [];
  const walk = (root, kind, prefix) => {
    if (!fs.existsSync(root)) return;
    for (const d of fs.readdirSync(root)) {
      if (d[0] === '_' && kind !== 'archive') continue;
      const full = path.join(root, d);
      let st; try { st = fs.statSync(full); } catch (e) { continue; }
      if (!st.isDirectory()) continue;
      const r = runInfo(full, (prefix || '') + d, kind);
      if (r) { out.push(r); continue; }
      // one level deeper, for lab experiments containing several schools
      if (kind === 'lab') {
        for (const s of fs.readdirSync(full)) {
          const sub = path.join(full, s);
          try { if (!fs.statSync(sub).isDirectory()) continue; } catch (e) { continue; }
          const r2 = runInfo(sub, d + '/' + s, 'lab');
          if (r2) out.push(r2);
        }
      }
    }
  };
  walk(BRAINS, 'run');
  walk(path.join(BRAINS, '_archive'), 'archive', 'archive: ');
  walk(LAB, 'lab');
  return out;
}
function listReports() {
  const out = [];
  if (!fs.existsSync(LAB)) return out;
  for (const d of fs.readdirSync(LAB)) {
    const f = path.join(LAB, d, 'report.md');
    if (fs.existsSync(f)) out.push({ name: d, mtime: fs.statSync(f).mtimeMs });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */
function body(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', d => { b += d; if (b.length > 4e6) req.destroy(); });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch (e) { rej(e); } });
  });
}
function json(res, obj, code) {
  const s = JSON.stringify(obj);
  res.writeHead(code || 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(s);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/') {
      const html = fs.readFileSync(path.join(AI, 'panel.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (url.pathname === '/api/state') {
      const secs = job.startedAt ? (Date.now() - job.startedAt) / 1000 : 0;
      const avg = job.genSecs.length
        ? job.genSecs.reduce((a, b) => a + b, 0) / job.genSecs.length : 0;
      const left = (job.totalGens && job.gen && avg)
        ? Math.max(0, (job.totalGens - job.gen) * avg) : 0;

      /* Each piece is fetched independently. One unreadable file used to
         fail the whole request, and the page — which had no way to show
         an error — simply rendered nothing at all. Now a broken part
         comes back empty with an explanation attached, and the rest of
         the panel still works. */
      const problems = [];
      const attempt = (label, fn, fallback) => {
        try { return fn(); }
        catch (e) {
          const msg = label + ' — ' + e.message;
          problems.push(msg);
          console.log('  ! ' + msg);
          return fallback;
        }
      };
      const recipes = attempt('could not read recipes.json', readRecipes, {});
      const runs = attempt('could not scan brains/ and lab/', listRuns, []);
      const reports = attempt('could not list lab reports', listReports, []);
      if (!Object.keys(recipes).filter(k => k[0] !== '_').length && !problems.length) {
        problems.push('recipes.json parsed but contains no recipes — ' + RECIPES);
      }

      return json(res, {
        recipes,
        weightMeta: WEIGHT_META,
        runs,
        reports,
        problems,
        paths: { ai: AI, recipes: RECIPES },
        cpus: os.cpus().length,
        running: job.child ? {
          label: job.label, secs, gen: job.gen, totalGens: job.totalGens,
          eta: left ? fmtDur(left) : null, elapsed: fmtDur(secs)
        } : null,
        lastExit: job.child ? null : job.exitCode
      });
    }

    if (url.pathname === '/api/log') {
      const since = Math.max(0, +url.searchParams.get('since') || 0);
      return json(res, { lines: job.log.slice(since), total: job.log.length, running: !!job.child });
    }

    if (url.pathname === '/api/run' && req.method === 'POST') {
      const b = await body(req);
      const { label, argv } = buildArgv(b.cmd, b.args);
      startJob(label, argv);
      return json(res, { ok: true, label, command: 'node ' + argv.map(x => path.basename(x)).join(' ') });
    }

    if (url.pathname === '/api/preview' && req.method === 'POST') {
      const b = await body(req);
      const { argv } = buildArgv(b.cmd, b.args);
      return json(res, { command: 'node ' + argv.map(x => path.basename(x)).join(' ') });
    }

    if (url.pathname === '/api/stop' && req.method === 'POST') {
      if (job.child) job.child.kill('SIGTERM');
      return json(res, { ok: true });
    }

    if (url.pathname === '/api/recipes' && req.method === 'POST') {
      const b = await body(req);
      const current = readRecipes();
      const next = {};
      if (current._README) next._README = current._README;
      for (const [name, r] of Object.entries(b.recipes || {})) {
        if (name[0] === '_') continue;
        const clean = { desc: String(r.desc || '').slice(0, 300), weights: {} };
        for (const [k, v] of Object.entries(r.weights || {})) {
          if (!KNOWN_WEIGHTS.has(k)) continue;
          const n = Number(v);
          if (isFinite(n) && n !== 0) clean.weights[k] = n;
        }
        next[String(name).replace(/[^\w-]/g, '').slice(0, 40)] = clean;
      }
      if (!Object.keys(next).filter(k => k[0] !== '_').length) {
        return json(res, { error: 'Refusing to save an empty recipe file' }, 400);
      }
      // write via a temp file so an interrupted save can't corrupt it
      const tmp = RECIPES + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
      fs.renameSync(tmp, RECIPES);
      return json(res, { ok: true });
    }

    if (url.pathname === '/api/report') {
      const name = String(url.searchParams.get('name') || '').replace(/[^\w.-]/g, '');
      const f = path.join(LAB, name, 'report.md');
      if (!fs.existsSync(f)) return json(res, { error: 'no report' }, 404);
      return json(res, { md: fs.readFileSync(f, 'utf8') });
    }

    res.writeHead(404); res.end('not found');
  } catch (err) {
    console.log('  ! ' + url.pathname + ' — ' + err.message);
    json(res, { error: err.message }, 400);
  }
});

/* ------------------------------------------------------------------ */
/* node panel.js --check  — say what the panel can and cannot see      */
/* ------------------------------------------------------------------ */
if (arg('check', false)) {
  const ok = s => '  ✔ ' + s;
  const no = s => '  ✘ ' + s;
  console.log('\n  Lanebreaker AI — checking what the panel can see\n  ' + '─'.repeat(52));
  console.log('  ai folder     ' + AI);
  console.log('  recipes file  ' + RECIPES);
  for (const f of ['panel.html', 'brain.js', 'train.js', 'lab.js', 'versus.js', 'bake.js', 'recipes.json'])
    console.log(fs.existsSync(path.join(AI, f)) ? ok(f) : no(f + '  — MISSING'));
  try {
    const r = readRecipes();
    const names = Object.keys(r).filter(k => k[0] !== '_');
    console.log(ok('recipes.json is valid JSON'));
    if (names.length) console.log(ok(names.length + ' recipes: ' + names.join(', ')));
    else console.log(no('recipes.json has no recipes in it'));
    for (const n of names) {
      const unknown = Object.keys((r[n] || {}).weights || {}).filter(k => !KNOWN_WEIGHTS.has(k));
      if (unknown.length) console.log('    ! "' + n + '" has weights the panel does not know: ' + unknown.join(', '));
    }
  } catch (e) {
    console.log(no('recipes.json could NOT be parsed:'));
    console.log('      ' + e.message);
    console.log('      That is what stops recipes appearing in the panel.');
  }
  try { console.log(ok(listRuns().length + ' trained run(s) found')); }
  catch (e) { console.log(no('could not scan brains/ and lab/ — ' + e.message)); }
  console.log('  node          ' + process.version + '   platform ' + process.platform);
  console.log('');
  process.exit(0);
}

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT;
  console.log('');
  console.log('  LANEBREAKER AI — control panel');
  console.log('  ' + '─'.repeat(46));
  console.log('  ' + url);
  console.log('  ' + os.cpus().length + ' cores detected');
  console.log('  Ctrl-C here to shut it down.');
  console.log('');
  if (OPEN) {
    const cmd = process.platform === 'win32' ? 'cmd'
      : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try { spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref(); } catch (e) {}
  }
});
process.on('SIGINT', () => {
  if (job.child) job.child.kill('SIGTERM');
  console.log('\n  panel stopped.\n');
  process.exit(0);
});
