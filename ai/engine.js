/* =====================================================================
   engine.js — loads the game rules headless for the Node trainer.

   Uses the modular Vite/TS sim at ../dist-sim (repo root):
     npm run build:sim

   Overrides:
     LB_SIM=/path/to/index.cjs   modular bundle path
     LB_HTML=/path/to/game.html  HTML path for bake.js only (not for training)
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------------------------------------------------------------
   HTML path discovery — used by bake.js when an old HTML game file is
   still present. Not used for simulation / training.
   --------------------------------------------------------------------- */
function findGameHtml() {
  if (process.env.LB_HTML) return process.env.LB_HTML;
  const root = path.join(__dirname, '..');
  const named = ['lanebreaker-ai.html', 'lanebreaker.html'];
  let others = [];
  try {
    others = fs.readdirSync(root).filter(f => f.endsWith('.html') && !named.includes(f));
  } catch (e) { /* ignore */ }

  const candidates = [...named, ...others]
    .map(f => path.join(root, f))
    .filter(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });

  const isGame = [];
  for (const p of candidates) {
    let txt;
    try { txt = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
    if (txt.includes('function simStep')) {
      isGame.push({ p, installed: txt.includes('LB_AI_RUNTIME') });
    }
  }
  if (!isGame.length) {
    return null;
  }
  const withAi = isGame.find(g => g.installed);
  return (withAi || isGame[0]).p;
}

const HTML_PATH = findGameHtml();

function findModularSim() {
  if (process.env.LB_SIM) return process.env.LB_SIM;
  const candidates = [
    // Vite game at repo root, ai/ beside it (CI + local)
    path.join(__dirname, '..', 'dist-sim', 'index.cjs'),
  ];
  for (const p of candidates) {
    try { if (fs.statSync(p).isFile()) return p; } catch (e) { /* next */ }
  }
  return null;
}
const SIM_PATH = findModularSim();

/* ---------------------------------------------------------------------
   A deterministic random number generator.

   The game calls Math.random() in a lot of places (creep jitter, crit
   rolls, the old bot's dice). If we left that alone, the same bot could
   win one match and lose the next through pure luck, and evolution would
   end up selecting for lucky bots instead of good ones. So every match
   gets a fixed seed. Two different bots evaluated on seed 7 face exactly
   the same coin flips, which makes the comparison honest.
   --------------------------------------------------------------------- */
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    // xorshift32 — fast, good enough, and perfectly reproducible
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function loadGameModular(simPath) {
  delete require.cache[require.resolve(simPath)];
  const gamePath = path.join(path.dirname(simPath), 'game.cjs');
  try { delete require.cache[require.resolve(gamePath)]; } catch (e) { /* ok */ }
  const api = require(simPath);
  if (!api || !api.newSim) {
    throw new Error('Modular sim at ' + simPath + ' did not export newSim. ' +
      'Run npm run build:sim at the repo root.');
  }
  if (typeof api.__setSeed !== 'function') {
    api.__setSeed = (seed) => { Math.random = makeRng(seed); };
  }
  api.__source = 'modular:' + simPath;
  return api;
}

/* ---------------------------------------------------------------------
   loadGame() -> a live copy of the game rules from the modular sim.
   --------------------------------------------------------------------- */
function loadGame() {
  if (!SIM_PATH) {
    throw new Error(
      'No modular sim found (dist-sim/index.cjs).\n' +
      'Build it from the repo root:\n' +
      '  npm run build:sim\n' +
      'Or set LB_SIM=/absolute/path/to/index.cjs'
    );
  }
  return loadGameModular(SIM_PATH);
}

module.exports = { loadGame, makeRng, HTML_PATH, SIM_PATH, findGameHtml };
