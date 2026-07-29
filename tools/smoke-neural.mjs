// @ts-nocheck
/**
 * Headless smoke: neural brain vs classic bot for ~30s.
 */
import { newSim, simStep } from "../src/sim/engine.ts";
import { aiThink, lbGetBrain, LB_API } from "../src/ai/neural/runtime.ts";
import { botThink } from "../src/ai/bot.ts";

const brutal = lbGetBrain("brutal");
if (!brutal) {
  console.error("failed to load brutal brain");
  process.exit(1);
}

const S = newSim(
  [
    { h: "vex", tm: 0 },
    { h: "ilva", tm: 1 },
  ],
  "1v1",
);
S.noFx = true;
S.players[0].bot = true;
S.players[0].aiSpec = { genome: brutal, opts: { noise: 0 } };
S.players[1].bot = true;
S.players[1].aiSpec = null; // classic

const TICK = 1 / 60;
for (let i = 0; i < 60 * 30; i++) {
  for (const p of S.players) if (p.bot) aiThink(S, p, TICK);
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
    apiOk: !!(LB_API && botThink),
    brainWeights: brutal.w?.length || brutal.weights?.length || "ok",
  }),
);
