// @ts-nocheck
/* Jungle camps: spawn cycle, neutral behaviour, last-hit charges, and the
   charge → next-wave reinforcement pipeline. */
import { newSim, simStep, damage, spawnCamp, campAlive } from "../src/sim/engine.ts";
import { CAMP_VARIANTS, CAMP_IDS } from "../src/data/camps.ts";
import {
  CAMP_X, CAMP_R, campY, walkable, clampToLane, setCampsOpen, LANE_Y, BASE_X
} from "../src/data/world.ts";

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};
const step = (S, n) => { for (let i = 0; i < n; i++) simStep(S, TICK); };
const neutrals = S => S.ents.filter(e => !e.dead && e.neutral);

console.log("\n== spawn cycle: nothing before 2:00, then exactly one camp in 1v1 ==");
{
  const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  S.noFx = true;
  step(S, Math.floor(115 / TICK));
  ok("no neutrals before CAMP_FIRST", neutrals(S).length === 0, `n=${neutrals(S).length}`);
  step(S, Math.floor(10 / TICK));
  const n1 = neutrals(S);
  ok("a camp spawned after 2:00", n1.length > 0, `n=${n1.length}`);
  ok("1v1 opens exactly one side", S.campSides.length === 1, JSON.stringify(S.campSides));
  const vid = n1[0].jungle;
  ok("pack is a known variant", !!CAMP_VARIANTS[vid], vid);
  ok("full pack spawned", n1.length === CAMP_VARIANTS[vid].n, `${n1.length}/${CAMP_VARIANTS[vid].n}`);
  ok("every member is that variant", n1.every(e => e.jungle === vid && e.team === 2));
  // an occupied camp must NOT re-spawn at the next cycle
  step(S, Math.floor(125 / TICK));
  const n2 = neutrals(S).filter(e => e.camp === S.campSides[0]);
  ok("occupied camp did not double-spawn", n2.length <= CAMP_VARIANTS[vid].n, `n=${n2.length}`);
}

console.log("\n== 2v2 opens both camps ==");
{
  const S = newSim([{h:"vex",tm:0},{h:"gruk",tm:1},{h:"ilva",tm:0},{h:"svaar",tm:1}], "2v2");
  S.noFx = true;
  step(S, Math.floor(125 / TICK));
  ok("both sides open", S.campSides.length === 2, JSON.stringify(S.campSides));
  ok("north camp alive", campAlive(S, 0));
  ok("south camp alive", campAlive(S, 1));
}

console.log("\n== camp pockets are walkable ground (and only when open) ==");
{
  setCampsOpen([0]);
  ok("open pocket centre is walkable", walkable(CAMP_X, campY(0)));
  ok("closed pocket is not", !walkable(CAMP_X, campY(1)));
  const e = { x: CAMP_X, y: campY(0), r: 20 };
  clampToLane(e);
  ok("clamp leaves a unit standing in the open pocket", e.x === CAMP_X && e.y === campY(0));
  const f = { x: CAMP_X, y: campY(1), r: 20 };
  clampToLane(f);
  ok("clamp pushes a unit out of the closed pocket", Math.abs(f.y - LANE_Y) < 300, `y=${f.y}`);
}

console.log("\n== last hit banks a charge; the next wave cashes it in ==");
{
  const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  S.noFx = true;
  const side = S.campSides[0];
  const vid = spawnCamp(S, side, "brute");          // deterministic pack for the assert
  const brute = neutrals(S)[0];
  const p = S.players[0], gold0 = p.gold, cs0 = p.cs;
  p.hero.x = CAMP_X; p.hero.y = campY(side);        // stand at the camp for the XP share
  damage(S, p.hero, brute, 99999, { attack: true });
  ok("brute died to the hero", brute.dead);
  ok("team 0 banked a brute charge", S.campCharges[0].length === 1 && S.campCharges[0][0] === "brute",
     JSON.stringify(S.campCharges));
  ok("bounty paid", p.gold - gold0 >= CAMP_VARIANTS.brute.bounty, `+${Math.round(p.gold - gold0)}g`);
  ok("counts as a last hit", p.cs === cs0 + 1);
  S.waveT = 0.01;                                    // force the next wave
  step(S, 5);
  const ally = S.ents.find(e => !e.dead && e.jungle === "brute" && e.team === 0);
  ok("charge consumed on wave spawn", S.campCharges[0].length === 0);
  ok("a team-0 brute marches with the wave", !!ally && !ally.neutral,
     ally ? `x=${Math.round(ally.x)}` : "none");
  ok("it spawned at team 0's base", ally && Math.abs(ally.x - BASE_X[0]) < 200);
  ok("it keeps its cleave", ally && ally.cleave > 0);
}

console.log("\n== neutrals leash: waves march past without diverting ==");
{
  const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  S.noFx = true;
  const side = S.campSides[0];
  spawnCamp(S, side, "swarm");
  step(S, Math.floor(40 / TICK));                    // a wave crosses mid-lane
  const strays = neutrals(S).filter(e =>
    Math.hypot(e.x - CAMP_X, e.y - campY(side)) > CAMP_R + 120);
  ok("pack stays home while waves pass", strays.length === 0, `strays=${strays.length}`);
  const laneCreeps = S.ents.filter(e => !e.dead && e.type === "creep" && !e.neutral);
  ok("lane creeps ignored the camp", laneCreeps.every(e => {
    const t = S.ents.find(o => o.id === e.tid);
    return !t || !t.neutral;
  }));
}

console.log("\n== every variant spawns clean and its members carry their kit ==");
{
  for (const vid of CAMP_IDS) {
    const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
    S.noFx = true;
    const V = CAMP_VARIANTS[vid];
    spawnCamp(S, S.campSides[0], vid);
    const pack = neutrals(S);
    let good = pack.length === V.n && V.n >= 1 && V.n <= 8;
    if (vid === "brute") good = good && pack[0].cleave > 0;
    if (vid === "ram")   good = good && pack[0].siege > 1;
    if (vid === "storm") good = good && pack[0].ranged;
    step(S, 600);                                    // 10s idle — nothing crashes, nobody dies
    good = good && neutrals(S).length === V.n;
    ok(`${vid} (${V.name}, n=${V.n})`, good);
  }
}

console.log("\n== storm shaman bolts its attacker; mender pulse heals its pack ==");
{
  const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  S.noFx = true;
  const side = S.campSides[0];
  spawnCamp(S, side, "storm");
  const sham = neutrals(S)[0];
  const p = S.players[0];
  p.hero.x = CAMP_X; p.hero.y = campY(side) + 60; p.god = false;
  damage(S, p.hero, sham, 10, { attack: true });     // wake it up
  const hp0 = p.hero.hp;
  step(S, Math.floor(8 / TICK));
  ok("aggro'd shaman fought back", p.hero.hp < hp0 || p.hero.dead, `hp ${Math.round(hp0)} -> ${Math.round(p.hero.hp)}`);
}
{
  const S = newSim([{ h: "vex", tm: 0 }, { h: "gruk", tm: 1 }], "1v1");
  S.noFx = true;
  const side = S.campSides[0];
  spawnCamp(S, side, "mender");
  const pack = neutrals(S);
  pack[1].hp = pack[1].maxHp * 0.4;                  // wound a packmate
  step(S, Math.floor(4 / TICK));
  ok("mender pulse healed the pack", pack[1].hp > pack[1].maxHp * 0.4 + 30,
     `hp=${Math.round(pack[1].hp)}/${pack[1].maxHp}`);
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL CAMP CHECKS PASSED");
process.exit(fails ? 1 : 0);
