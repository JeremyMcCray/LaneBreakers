/**
 * Bundle the headless sim for Node trainers (CommonJS).
 * Output: dist-sim/game.cjs + dist-sim/index.cjs (with __setSeed)
 */
import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(root, "dist-sim");
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "src/node-sim.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(outdir, "game.cjs"),
  logLevel: "info",
  banner: {
    js: "/* Lanebreakers sim for Node trainers — tools/build-sim-cjs.mjs */\n",
  },
});

fs.writeFileSync(
  path.join(outdir, "index.cjs"),
  `/* Trainer-facing wrapper: adds __setSeed like the HTML vm sandbox. */
'use strict';
const game = require('./game.cjs');

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function attachSeed(api) {
  api.__setSeed = (seed) => { Math.random = makeRng(seed); };
  api.makeRng = makeRng;
  return api;
}

module.exports = attachSeed(Object.assign({}, game));
`,
);

console.log("wrote dist-sim/game.cjs + dist-sim/index.cjs");
