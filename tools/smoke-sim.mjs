// @ts-nocheck
import { newSim, simStep, applyCmd } from "../src/sim/engine.ts";
import { botThink } from "../src/ai/bot.ts";
import { HERO_IDS } from "../src/data/heroes.ts";

const TICK = 1 / 60;
function runSim(S, secs) {
  S.noFx = true;
  for (let i = 0; i < 60 * secs; i++) {
    for (const p of S.players) {
      p.bot = true;
      botThink(S, p, TICK);
    }
    simStep(S, TICK);
    if (S.over) break;
  }
  return {
    t: +S.t.toFixed(1),
    over: S.over,
    winner: S.winner,
    kills: S.teamKills,
    gold: S.players.map((p) => Math.floor(p.gold)),
    hp: S.players.map((p) => (p.hero && !p.hero.dead ? Math.floor(p.hero.hp) : 0)),
    ents: S.ents.length,
  };
}

const S1 = newSim(
  [
    { h: "vex", tm: 0 },
    { h: "sable", tm: 1 },
  ],
  "1v1",
);
console.log("1v1", JSON.stringify(runSim(S1, 30)));

/* 3v3: six seats, the bigger win cap, both camp pockets, an 8-creep wave,
   and three distinct fountain rows per team */
const S3 = newSim(
  HERO_IDS.slice(0, 6).map((h, i) => ({ h, tm: i % 2 })),
  "3v3",
);
const assert = (ok, what) => {
  if (!ok) {
    console.error("3v3 FAIL:", what);
    process.exit(1);
  }
};
assert(S3.players.length === 6, "six players");
assert(S3.winKills === 6, "winKills is 6, got " + S3.winKills);
assert(S3.campSides.length === 2, "both camp pockets open");
const rows = S3.players.filter((p) => p.team === 0).map((p) => p.hero.y);
assert(new Set(rows).size === 3, "three distinct spawn rows, got " + rows);
S3.noFx = true;
for (let i = 0; i < 60 * 8; i++) simStep(S3, TICK); // past FIRST_WAVE, bots idle
const waveCreeps = S3.ents.filter((e) => e.type === "creep" && !e.dead && !e.neutral);
assert(waveCreeps.length === 16, "8 creeps a side, got " + waveCreeps.length);
console.log("3v3", JSON.stringify(runSim(S3, 300)));
