/* =====================================================================
   engine.js — loads the ACTUAL game out of lanebreaker.html and runs it
   headless in Node, with no rendering and no browser.

   Why it reads the .html directly: there is exactly one copy of the game
   rules. You can keep editing lanebreaker.html however you like and the
   trainer automatically trains against the new rules. Nothing to keep in
   sync, nothing to drift.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------------------------------------------------------------
   Which copy of the game do we train against?

   Override with the LB_HTML environment variable, or just let it look.
   It checks the obvious filenames in the folder above `ai/`, then any
   other .html there, and prefers a file that already has the AI installed
   — so if you keep both the original and the AI build side by side, it
   picks the AI build rather than silently training against the old one.
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
    throw new Error('Could not find lanebreaker.html next to the ai/ folder. ' +
      'Put ai/ beside your game file, or set LB_HTML=/path/to/your/game.html');
  }
  const withAi = isGame.find(g => g.installed);
  return (withAi || isGame[0]).p;
}

const HTML_PATH = findGameHtml();

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

/* ---------------------------------------------------------------------
   The fake browser. The game script touches document/window/canvas at
   load time to wire up its UI. None of that matters for simulation, so
   we hand it a stack of harmless dummies and let it wire itself up to
   nothing.
   --------------------------------------------------------------------- */
function makeSandbox(rngRef) {
  const noop = () => {};
  /* A stub 2D canvas context. Deliberately a plain object rather than a
     Proxy: heavy Proxy use inside a vm context has been observed to crash
     V8's optimiser during long training runs, and nothing here needs to
     be clever — no pixels are ever drawn headlessly. */
  const fakeCtx = {
    canvas: { width: 1600, height: 900 },
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', globalCompositeOperation: 'source-over',
    shadowBlur: 0, shadowColor: '#000', filter: 'none', miterLimit: 10,
    lineDashOffset: 0, imageSmoothingEnabled: true
  };
  for (const m of ['save', 'restore', 'scale', 'rotate', 'translate', 'transform',
    'setTransform', 'resetTransform', 'clearRect', 'fillRect', 'strokeRect',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo',
    'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip',
    'isPointInPath', 'isPointInStroke', 'fillText', 'strokeText', 'drawImage',
    'setLineDash', 'getLineDash', 'putImageData', 'drawFocusIfNeeded'])
    fakeCtx[m] = noop;
  fakeCtx.measureText = () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
  fakeCtx.createLinearGradient = fakeCtx.createRadialGradient = fakeCtx.createConicGradient =
    () => ({ addColorStop: noop });
  fakeCtx.createPattern = () => null;
  fakeCtx.getImageData = () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
  fakeCtx.createImageData = () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
  const makeEl = () => {
    const el = {
      style: {}, dataset: {}, children: [], value: '', textContent: '',
      innerHTML: '', width: 1600, height: 900, readyState: 'complete',
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: noop, removeChild: noop, insertBefore: noop, remove: noop,
      addEventListener: noop, removeEventListener: noop, setAttribute: noop,
      getAttribute: () => null, focus: noop, blur: noop, click: noop,
      getContext: () => fakeCtx, getBoundingClientRect: () => ({
        left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900
      }),
      querySelector: () => makeEl(), querySelectorAll: () => [],
      scrollIntoView: noop, select: noop
    };
    return el;
  };

  const document = {
    getElementById: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    createElementNS: () => makeEl(),
    addEventListener: noop, removeEventListener: noop,
    head: makeEl(), body: makeEl(), documentElement: makeEl(),
    hidden: false, visibilityState: 'visible'
  };

  const localStorage = {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; }
  };

  const sandbox = {
    console,
    document,
    localStorage,
    navigator: { userAgent: 'node', maxTouchPoints: 0, clipboard: { writeText: async () => {} } },
    performance: { now: () => Date.now() },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    getComputedStyle: () => ({}),
    devicePixelRatio: 1, innerWidth: 1600, innerHeight: 900,
    location: { reload: noop, href: '', search: '' },
    alert: noop, prompt: () => null, confirm: () => false,
    Image: function () { return makeEl(); },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    RTCPeerConnection: function () {
      return {
        createDataChannel: () => ({}), addEventListener: noop,
        createOffer: async () => ({}), setLocalDescription: async () => {},
        setRemoteDescription: async () => {}, createAnswer: async () => ({}),
        iceGatheringState: 'complete', connectionState: 'new', close: noop
      };
    },
    module: { exports: {} },
    // Math is replaced with a copy whose .random we control per match
    Math: Object.create(Math)
  };
  sandbox.Math.random = () => rngRef.fn();
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.exports = sandbox.module.exports;
  return sandbox;
}

/* Pull the game's <script> block out of the HTML file. */
function extractScript(html) {
  const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m => m[1])
    .filter(s => s.includes('function simStep'));
  if (!blocks.length) {
    throw new Error('Could not find the game script inside ' + HTML_PATH +
      ' (looked for a <script> block containing "function simStep").');
  }
  return blocks[blocks.length - 1];
}

/* ---------------------------------------------------------------------
   loadGame() -> a live, isolated copy of the game rules.
   Each call gives a fresh world with its own module-level state, so
   parallel workers can never tread on each other.
   --------------------------------------------------------------------- */
function loadGame() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const src = extractScript(html);
  const rngRef = { fn: Math.random };
  const sandbox = makeSandbox(rngRef);
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: 'lanebreaker.game.js' });
  } catch (err) {
    throw new Error('The game script failed to load headlessly: ' + err.message +
      '\n(If you added new browser API calls at the top level of the script, ' +
      'engine.js may need another stub in makeSandbox.)');
  }
  const api = sandbox.module.exports;
  if (!api || !api.newSim) {
    throw new Error('The game script loaded but did not export newSim. ' +
      'Check the module.exports block at the bottom of lanebreaker.html.');
  }
  api.__setSeed = (seed) => { rngRef.fn = makeRng(seed); };
  return api;
}

module.exports = { loadGame, makeRng, HTML_PATH };
