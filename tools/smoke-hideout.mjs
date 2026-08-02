// @ts-nocheck
/* The pre-game Hideout (sim mode 'hideout'): fixtures spawn, moving dummies
   actually move, camps come fast, the practice tower can die WITHOUT ending
   anything and gets rebuilt, no waves ever spawn, and no clock runs out. */
import { newSim, simStep, damage, applyCmd } from "../src/sim/engine.ts";
import { HIDEOUT, setWorldTunable, getWorldTunable } from "../src/data/world.ts";

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};
const step = (S, n) => { for (let i = 0; i < n; i++) simStep(S, TICK); };
const dummies = S => S.ents.filter(e => !e.dead && e.dummy);
const towers  = S => S.ents.filter(e => !e.dead && e.type === "tower");

console.log("\n== the room is furnished ==");
const S = newSim([{ h: "vex", tm: 0 }], "hideout");
S.noFx = true;
ok("mode flag set", S.hideout === true && S.mode === "hideout");
ok("one player, slot 0, team 0", S.players.length === 1 && S.players[0].team === 0);
ok("static dummies present", dummies(S).filter(e => e.static).length === HIDEOUT.DUMMIES.length);
ok("moving dummies present", dummies(S).filter(e => e.hdPat).length === HIDEOUT.MOVERS.length);
ok("exactly one tower, enemy, off to the side", towers(S).length === 1 &&
   towers(S)[0].team === 1 && towers(S)[0].x === HIDEOUT.TOWER.x, `n=${towers(S).length}`);
ok("both camp pockets open", S.campSides.length === 2, JSON.stringify(S.campSides));
ok("no way to win on kills", S.winKills > 100, `winKills=${S.winKills}`);

console.log("\n== moving dummies patrol; statics hold still ==");
{
  const mover = dummies(S).find(e => e.hdPat);
  const stat  = dummies(S).find(e => e.static);
  const mx0 = mover.x, sx0 = stat.x;
  step(S, Math.floor(1 / TICK));      // short window — it must not bounce back to start
  ok("mover moved", Math.abs(mover.x - mx0) > 40, `dx=${Math.round(mover.x - mx0)}`);
  step(S, Math.floor(2 / TICK));
  ok("mover stays on its run", mover.x >= mover.hdPat[0] - 1 && mover.x <= mover.hdPat[1] + 1);
  ok("static did not move", Math.abs(stat.x - sx0) < 1);
}

console.log("\n== no waves, fast camps ==");
{
  step(S, Math.floor(12 / TICK));                     // past the 10s hideout camp timer
  const lane = S.ents.filter(e => !e.dead && e.type === "creep" && !e.neutral && !e.dummy);
  ok("no lane creeps ever", lane.length === 0, `n=${lane.length}`);
  ok("camps spawned within ~10s", S.ents.some(e => !e.dead && e.neutral));
}

console.log("\n== dummies regenerate, and a destroyed one is replaced ==");
{
  const d = dummies(S).find(e => e.static);
  const p = S.players[0];
  d.hp = d.maxHp * 0.5;
  step(S, Math.floor(2 / TICK));
  ok("dummy healed back up", d.hp > d.maxHp * 0.5 + 100, `hp=${Math.round(d.hp)}`);
  const id = d.hd;
  damage(S, p.hero, d, 999999, { attack: true, pure: true });
  ok("dummy can still be killed", d.dead);
  step(S, Math.floor(8 / TICK));                      // 6s respawn + slack
  ok("replacement dummy stood back up", S.ents.some(e => !e.dead && e.hd === id));
}

console.log("\n== the practice tower dies without ending anything, then returns ==");
{
  const p = S.players[0];
  const tw = towers(S)[0];
  const gold0 = p.gold;
  tw.hp = 1;
  damage(S, p.hero, tw, 500, { attack: true });
  ok("tower went down", tw.dead);
  ok("match did NOT end", !S.over && S.winner === -1);
  ok("tower bounty still paid", p.gold > gold0 + 350, `+${Math.round(p.gold - gold0)}g`);
  step(S, Math.floor(20 / TICK));                     // 18s rebuild + slack
  ok("tower rebuilt", towers(S).length === 1, `n=${towers(S).length}`);
  ok("still no winner", !S.over);
}

console.log("\n== the clock never runs out ==");
{
  const oldLimit = getWorldTunable("MATCH_LIMIT");
  setWorldTunable("MATCH_LIMIT", 60);
  const H = newSim([{ h: "gruk", tm: 0 }], "hideout");
  H.noFx = true;
  step(H, Math.floor(70 / TICK));                     // sail past the cap
  ok("alive past MATCH_LIMIT", !H.over && H.t > 60, `t=${Math.round(H.t)}`);
  // debug commands still work in the room (it's a practice space)
  const g0 = H.players[0].gold;
  applyCmd(H, 0, { a: "dbg", w: "gold" });
  ok("debug cheats work in the hideout", H.players[0].gold === g0 + 1000);
  setWorldTunable("MATCH_LIMIT", oldLimit);
}

console.log("\n== a real match is untouched by all this ==");
{
  const M = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  M.noFx = true;
  ok("1v1 has no hideout flag", !M.hideout);
  ok("1v1 keeps two towers", towers(M).length === 2);
  ok("1v1 keeps its win condition", M.winKills === 2, `winKills=${M.winKills}`);
  step(M, Math.floor(8 / TICK));
  ok("1v1 waves still spawn", M.ents.some(e => !e.dead && e.type === "creep" && !e.neutral));
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL HIDEOUT CHECKS PASSED");
process.exit(fails ? 1 : 0);
