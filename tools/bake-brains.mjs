/**
 * Bake trained brains from ai/brains into
 * src/ai/neural/brains/baked.json (same shape as bake.js LB_BAKED).
 *
 * Does not touch any HTML — browser game only.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function findAiDir() {
  const candidates = [
    path.join(root, "ai"),
    path.join(root, "..", "..", "Lanebreakers", "ai"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "brain.js"))) return p;
  }
  throw new Error("Could not find ai/ (expected ./ai next to package.json)");
}

const lbAi = findAiDir();
const Brain = require(path.join(lbAi, "brain.js"));

const F = {
  recipes: path.join(lbAi, "recipes.json"),
  brains: path.join(lbAi, "brains"),
  out: path.join(root, "src", "ai", "neural", "brains", "baked.json"),
};

function readBrain(file) {
  const o = JSON.parse(fs.readFileSync(file, "utf8"));
  Brain.deserialize(o);
  return o;
}
function checkpointsOf(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^gen\d+\.json$/.test(f))
    .sort()
    .map((f) => ({ f, gen: +f.match(/\d+/)[0], file: path.join(dir, f) }));
}

const baked = { brains: {}, schools: {}, ladderFrom: null };
const recipesAll = JSON.parse(fs.readFileSync(F.recipes, "utf8"));
const schools = fs
  .readdirSync(F.brains)
  .filter((d) => fs.statSync(path.join(F.brains, d)).isDirectory())
  .filter((d) => fs.existsSync(path.join(F.brains, d, "best.json")));

for (const s of schools) {
  baked.schools[s] = {
    desc: (recipesAll[s] && recipesAll[s].desc) || "A trained school of bot.",
    brain: readBrain(path.join(F.brains, s, "best.json")),
  };
}

const ladderSchool = schools.includes("balanced")
  ? "balanced"
  : schools.sort(
      (a, b) =>
        checkpointsOf(path.join(F.brains, b)).length -
        checkpointsOf(path.join(F.brains, a)).length,
    )[0];

if (ladderSchool) {
  const cps = checkpointsOf(path.join(F.brains, ladderSchool));
  baked.ladderFrom = ladderSchool;
  if (cps.length) {
    const at = (t) => cps[Math.min(cps.length - 1, Math.round(t * (cps.length - 1)))];
    Object.assign(baked.brains, {
      rookie: readBrain(at(0.1).file),
      steady: readBrain(at(0.4).file),
      sharp: readBrain(at(0.75).file),
      brutal: readBrain(path.join(F.brains, ladderSchool, "best.json")),
    });
  }
}

fs.mkdirSync(path.dirname(F.out), { recursive: true });
fs.writeFileSync(F.out, JSON.stringify(baked));
console.log(
  JSON.stringify({
    out: path.relative(root, F.out),
    schools: Object.keys(baked.schools),
    tiers: Object.keys(baked.brains),
    ladderFrom: baked.ladderFrom,
  }),
);
