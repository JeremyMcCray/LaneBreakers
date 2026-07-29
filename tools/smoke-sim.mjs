// @ts-nocheck
import { newSim, simStep, applyCmd } from "../src/sim/engine.ts";
import { botThink } from "../src/ai/bot.ts";

const S = newSim(
  [
    { h: "vex", tm: 0 },
    { h: "ilva", tm: 1 },
  ],
  "1v1",
);
S.noFx = true;

const TICK = 1 / 60;
for (let i = 0; i < 60 * 30; i++) {
  for (const p of S.players) if (p.bot || true) {
    // drive both with bot for smoke
    p.bot = true;
    botThink(S, p, TICK);
  }
  simStep(S, TICK);
  if (S.over) break;
}

console.log(
  JSON.stringify({
    t: +S.t.toFixed(1),
    over: S.over,
    winner: S.winner,
    kills: S.teamKills,
    gold: S.players.map((p) => Math.floor(p.gold)),
    hp: S.players.map((p) => (p.hero && !p.hero.dead ? Math.floor(p.hero.hp) : 0)),
    ents: S.ents.length,
  }),
);
