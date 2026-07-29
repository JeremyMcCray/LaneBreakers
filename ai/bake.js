#!/usr/bin/env node
/* =====================================================================
   bake.js — puts the AI into lanebreaker.html.

       node bake.js                    install / refresh everything
       node bake.js --out game-ai.html write somewhere else
       node bake.js --dry              show what it would do

   It does two jobs:

   1. INSTALL (only the first time). Adds the neural runtime, the TRAIN
      screen, and the opponent picker to the game, and re-points the game
      loop at aiThink() instead of botThink().

   2. BAKE (every time). Copies the current brain.js, the current
      recipes.json, and the trained brains from brains/ into the HTML as
      constants — so the game file stays a single self-contained file you
      can double-click or email to someone.

   Safe to run repeatedly. Everything it writes sits between clearly
   marked comment fences and is replaced wholesale on each run, so your
   own edits to the rest of the file are never touched.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (!v || v.startsWith('--')) ? true : v;
}
const DRY = !!arg('dry', false);
/* HTML discovery for baking brains into lanebreaker*.html (not used for training).
   Training uses the modular sim via engine.js / LB_SIM. */
const discoveredHtml = require('./engine.js').HTML_PATH;
const SRC = arg('in', discoveredHtml);
if (!SRC || SRC === true) {
  console.error('No lanebreaker*.html found. Pass --in /path/to/game.html');
  process.exit(1);
}
const OUT = arg('out', SRC);

const F = {
  brain:   path.join(__dirname, 'brain.js'),
  runtime: path.join(__dirname, 'inject', 'runtime.js'),
  trainer: path.join(__dirname, 'inject', 'trainer.js'),
  screen:  path.join(__dirname, 'inject', 'screen.html'),
  recipes: path.join(__dirname, 'recipes.json'),
  brains:  path.join(__dirname, 'brains')
};

let html = fs.readFileSync(SRC, 'utf8');
const before = html;
const notes = [];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function fence(tag, body) {
  return '/*<<<' + tag + '>>>*/\n' + body + '\n/*<<<END ' + tag + '>>>*/';
}
function replaceFence(tag, body) {
  const re = new RegExp('/\\*<<<' + tag + '>>>\\*/[\\s\\S]*?/\\*<<<END ' + tag + '>>>\\*/');
  if (!re.test(html)) return false;
  html = html.replace(re, () => fence(tag, body));
  return true;
}
function once(what, from, to) {
  const n = html.split(from).length - 1;
  if (n === 0) return false;
  if (n > 1) throw new Error('"' + what + '": expected 1 match, found ' + n +
    '. The game file has changed shape — bake.js needs updating.');
  html = html.replace(from, to);
  notes.push('  patched  ' + what);
  return true;
}

/* ------------------------------------------------------------------ */
/* 0. MAINTENANCE PATCHES                                              */
/*    Applied whether or not the AI is already installed, each guarded */
/*    by a check so running bake.js twice is harmless.                 */
/* ------------------------------------------------------------------ */

/* Skip building visual-effect objects when nobody is watching.
   Every hit, heal and spell pushes a little object onto S.fx for the
   renderer to consume. Headless there is no renderer, so those objects
   are allocated and thrown away sixty times a second — about 20% of
   training time in a busy match. One flag removes it entirely. */
if (!html.includes('if (S.noFx) return;')) {
  once('speed: skip visual effects when running headless',
    'function fx(S,o){ S.fx.push(o); }',
    'function fx(S,o){ if (S.noFx) return; S.fx.push(o); }   /* headless trainers set noFx */');
}

/* ------------------------------------------------------------------ */
/* 1. STRUCTURAL INSTALL                                               */
/* ------------------------------------------------------------------ */
const INSTALLED = html.includes('/*<<<LB_AI_RUNTIME>>>*/');

if (!INSTALLED) {
  notes.push('  installing the neural AI for the first time');

  /* a0) let the Node trainer reach the functions the brain needs ----- */
  if (!html.includes('exposed so the neural AI trainer')) {
    once('trainer export list',
`  module.exports = {newSim, simStep, applyCmd, buildSnapshot, botThink, HEROES, ITEMS,
                    XP_TABLE, TOWER_X, BASE_X, damage, ent, castAbility, buyItem,`,
`  module.exports = {newSim, simStep, applyCmd, buildSnapshot, botThink, HEROES, ITEMS,
                    /* --- exposed so the neural AI trainer in ai/ can drive the game --- */
                    armorMult, canCast, netWorth, HERO_IDS, LANE_Y, WORLD_W, MAX_LEVEL,
                    XP_TABLE, TOWER_X, BASE_X, damage, ent, castAbility, buyItem,`);
  }

  /* a1) CRASH FIX, found by the trainer -----------------------------
     Reflected damage was itself able to reflect. Two heroes with a
     reflecting shield up at the same time (two Vexes with Riposte, say)
     bounced damage back and forth until the call stack overflowed and
     the tab died. Damage that is already a reflection no longer
     reflects again — one bounce, as the ability text intends.        */
  once('crash fix: infinite damage reflection',
`    if (tgt.shieldRef>0 && src && src.team!==tgt.team)
      damage(S, tgt, src, abs*tgt.shieldRef, {pure:true, silent:true});`,
`    if (tgt.shieldRef>0 && src && src.team!==tgt.team && !opt.reflected)
      damage(S, tgt, src, abs*tgt.shieldRef, {pure:true, silent:true, reflected:true});`);

  /* a) the game loop calls aiThink instead of botThink -------------- */
  once('game loop → aiThink',
    'for (const bp of S.players) if (bp.bot) botThink(S, bp, TICK);',
    'for (const bp of S.players) if (bp.bot) aiThink(S, bp, TICK);');

  /* b) practice bots get whatever brain the menu selected ----------- */
  once('practice bots get a brain',
`    if (mode==='local')
      for (const q of G.S.players) if (q.slot!==G.mySlot) q.bot = true;`,
`    if (mode==='local'){
      const _spec = (typeof lbCurrentAiSpec==='function') ? lbCurrentAiSpec() : null;
      for (const q of G.S.players) if (q.slot!==G.mySlot){ q.bot = true; q.aiSpec = _spec; }
    }`);

  /* c) the AI code block, dropped in just after the old bot --------- */
  once('AI code block',
    '/* =============================== NET =============================== */',
`/*<<<LB_AI_RUNTIME>>>*/
/*<<<END LB_AI_RUNTIME>>>*/

/* =============================== NET =============================== */`);

  /* d) opponent picker on the menu ---------------------------------- */
  once('opponent picker',
`        <button onclick="startPractice('1v1')">Practice 1v1</button>
        <button onclick="startPractice('2v2')">Practice 2v2</button>`,
`        <button onclick="startPractice('1v1')">Practice 1v1</button>
        <button onclick="startPractice('2v2')">Practice 2v2</button>
        <select id="aiTier" class="modedd" style="width:auto;margin:0;padding:9px 10px"
                onchange="lbSetAiTier(this.value)" title="Which AI you practise against"></select>
        <button onclick="showScreen('scrTrain')">Train AI</button>`);

  once('opponent description line',
`      <div class="row hide" id="rowLobby">`,
`      <div class="note" id="aiTierDesc" style="margin-top:6px"></div>
      <div class="row hide" id="rowLobby">`);

  /* e) the TRAIN screen --------------------------------------------- */
  once('TRAIN screen markup',
    '    <!-- quick play -->',
    fs.readFileSync(F.screen, 'utf8') + '\n    <!-- quick play -->');

  once('showScreen knows about scrTrain',
    `for (const s of ['scrHero','scrStats','scrHeroBook','scrItems','scrDraft','scrQuick','scrHost','scrJoin'])`,
    `for (const s of ['scrHero','scrStats','scrHeroBook','scrItems','scrDraft','scrQuick','scrHost','scrJoin','scrTrain'])`);

  once('showScreen opens the trainer',
    `  if (id==='scrHeroBook') renderHeroBook();`,
    `  if (id==='scrHeroBook') renderHeroBook();
  if (id==='scrTrain') lbTrainOpen();`);

  /* f) restore the chosen opponent on load -------------------------- */
  once('load saved opponent choice',
    `buildHeroMenu();
toggleHelpMenu();`,
    `buildHeroMenu();
toggleHelpMenu();
G.aiTier = Store.get('lb.aiTier', 'classic');
lbBuildAiSelect();`);
}

/* ------------------------------------------------------------------ */
/* 2. BAKE THE CONTENTS                                                */
/* ------------------------------------------------------------------ */

/* --- collect trained brains --------------------------------------- */
const Brain = require('./brain.js');
const skipped = new Set();

/* Returns null (with a note) rather than throwing when a brain predates
   the current senses — a stale folder should not stop you rebuilding the
   game, it should just not be baked into it. */
function readBrain(file) {
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!o.w || !o.pool) throw new Error(file + ' is not a brain file');
  try {
    Brain.deserialize(o);
  } catch (err) {
    if (!err.incompatible) throw err;
    skipped.add(path.basename(path.dirname(file)));
    return null;
  }
  return o;
}
function checkpointsOf(dir) {
  return fs.readdirSync(dir)
    .filter(f => /^gen\d+\.json$/.test(f))
    .sort()
    .map(f => ({ f, gen: +f.match(/\d+/)[0], file: path.join(dir, f) }));
}

const baked = { brains: {}, schools: {}, ladderFrom: null };

if (fs.existsSync(F.brains)) {
  const schools = fs.readdirSync(F.brains)
    .filter(d => fs.statSync(path.join(F.brains, d)).isDirectory())
    .filter(d => fs.existsSync(path.join(F.brains, d, 'best.json')));

  /* every school becomes a selectable opponent */
  const recipesAll = JSON.parse(fs.readFileSync(F.recipes, 'utf8'));
  for (const s of schools) {
    const brain = readBrain(path.join(F.brains, s, 'best.json'));
    if (!brain) continue;
    baked.schools[s] = {
      desc: (recipesAll[s] && recipesAll[s].desc) || 'A trained school of bot.',
      brain
    };
  }

  /* the difficulty ladder is taken from ONE school's checkpoints —
     preferring "balanced", else whichever trained longest */
  const ladderSchool = schools.includes(arg('ladder', 'balanced'))
    ? arg('ladder', 'balanced')
    : schools.sort((a, b) => checkpointsOf(path.join(F.brains, b)).length -
                             checkpointsOf(path.join(F.brains, a)).length)[0];

  if (ladderSchool) {
    const cps = checkpointsOf(path.join(F.brains, ladderSchool));
    baked.ladderFrom = ladderSchool;
    if (cps.length) {
      // spread four rungs across the run: early, third, two-thirds, best
      const at = t => cps[Math.min(cps.length - 1, Math.round(t * (cps.length - 1)))];
      const rungs = {
        rookie: readBrain(at(0.10).file),
        steady: readBrain(at(0.40).file),
        sharp:  readBrain(at(0.75).file),
        brutal: readBrain(path.join(F.brains, ladderSchool, 'best.json'))
      };
      if (Object.values(rungs).every(Boolean)) {
        Object.assign(baked.brains, rungs);
        notes.push('  ladder    from "' + ladderSchool + '" (' + cps.length + ' checkpoints: gen ' +
                   at(0.10).gen + ' / ' + at(0.40).gen + ' / ' + at(0.75).gen + ' / best)');
      }
    }
  }
  notes.push('  schools   ' + (Object.keys(baked.schools).length
    ? Object.keys(baked.schools).join(', ') : 'none'));
  if (skipped.size) {
    notes.push('  SKIPPED   ' + [...skipped].join(', ') + ' — trained before the senses changed.');
    notes.push('            Those brains cannot be used by this build. Retrain them.');
  }
} else {
  notes.push('  no brains/ folder yet — the game will use the old hand-coded bot');
}

/* --- brain.js, stripped of its Node wrapper ----------------------- */
const brainSrc = fs.readFileSync(F.brain, 'utf8');

/* --- recipes, minus the long README block ------------------------- */
const recipes = JSON.parse(fs.readFileSync(F.recipes, 'utf8'));
delete recipes._README;

const runtimeSrc = fs.readFileSync(F.runtime, 'utf8');
const trainerSrc = fs.readFileSync(F.trainer, 'utf8');

const block = [
  '/* ================== NEURAL AI — generated by ai/bake.js ==================',
  '   Do not hand-edit between these fences; `node ai/bake.js` overwrites them.',
  '   Source of truth: ai/brain.js, ai/inject/*.js, ai/recipes.json, ai/brains/',
  '   ====================================================================== */',
  'var LB_INLINE_BRAIN = 1;',
  brainSrc,
  '',
  'const LB_RECIPES = ' + JSON.stringify(recipes) + ';',
  '',
  'const LB_BAKED = ' + JSON.stringify(baked) + ';',
  '',
  runtimeSrc,
  '',
  trainerSrc
].join('\n');

if (!replaceFence('LB_AI_RUNTIME', block)) {
  console.error('Could not find the LB_AI_RUNTIME fence. Is this the right file?');
  process.exit(1);
}

/* ------------------------------------------------------------------ */
const sizeKb = n => (n / 1024).toFixed(0) + ' KB';
console.log('');
console.log('  bake.js — ' + path.basename(SRC) + ' → ' + path.basename(OUT));
console.log('  ' + '─'.repeat(62));
notes.forEach(n => console.log(n));
console.log('  size      ' + sizeKb(before.length) + ' → ' + sizeKb(html.length));
const tiers = Object.keys(baked.brains);
console.log('  opponents Classic' + (tiers.length ? ', Rookie, Steady, Sharp, Brutal' : ' only (train some brains!)'));
if (DRY) { console.log('\n  --dry: nothing written\n'); process.exit(0); }
fs.writeFileSync(OUT, html);

/* Also refresh the Vite game's baked.json when that tree is present. */
const modularBaked = path.join(__dirname, '..', 'src', 'ai', 'neural', 'brains', 'baked.json');
if (fs.existsSync(path.dirname(modularBaked))) {
  fs.mkdirSync(path.dirname(modularBaked), { recursive: true });
  fs.writeFileSync(modularBaked, JSON.stringify(baked));
  console.log('  modular   wrote ' + modularBaked);
}

console.log('  ' + '─'.repeat(62));
console.log('  written. Open it and look for the opponent dropdown next to');
console.log('  "Practice 1v1", and the "Train AI" button beside it.');
console.log('');
