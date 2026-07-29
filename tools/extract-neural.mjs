import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const lb = path.join(root, "../../Lanebreakers");

const brainSrc = fs.readFileSync(path.join(lb, "ai/brain.js"), "utf8");
const marker = "function () {";
const start = brainSrc.indexOf(marker);
if (start < 0) throw new Error("factory start not found");
const open = brainSrc.indexOf("{", start);
const ret = brainSrc.lastIndexOf("return {");
const endReturn = brainSrc.indexOf("};", ret) + 2;
let body = brainSrc.slice(open + 1, endReturn);
body = body.replace(/^\s*'use strict';\s*/m, "");
// Drop factory return — we use ESM exports instead
body = body.replace(/\n\/\* -+\s*\*\/\nreturn \{[\s\S]*\};\s*$/, "\n");

const out =
  `// @ts-nocheck
/* Ported from ../../Lanebreakers/ai/brain.js — keep behavior identical. */
` +
  body +
  `
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
`;

fs.mkdirSync(path.join(root, "src/ai/neural/brains"), { recursive: true });
fs.writeFileSync(path.join(root, "src/ai/neural/brain.ts"), out);
console.log("wrote brain.ts", out.split("\n").length, "lines");

const html = fs.readFileSync(path.join(lb, "lanebreaker-ai.html"), "utf8");
const m = html.match(/const LB_BAKED = (\{[\s\S]*?\});\s*\n\s*\/\* =+/);
if (!m) throw new Error("LB_BAKED not found");
const baked = JSON.parse(m[1]);
fs.writeFileSync(
  path.join(root, "src/ai/neural/brains/baked.json"),
  JSON.stringify(baked),
);
console.log("baked brains", Object.keys(baked.brains || {}));
console.log("schools", Object.keys(baked.schools || {}));
