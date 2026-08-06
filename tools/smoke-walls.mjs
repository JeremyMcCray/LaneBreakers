// @ts-nocheck
/* Casting with your back to a wall: a spell fired from a hero standing flush
   against the lane edge (or a camp pocket rim) must not be eaten by the wall
   on the tick it leaves the caster. Ability projectiles spawn 8px above their
   owner and a hero pressed to a wall already stands slightly outside the
   walkable region, so the out-of-bounds test that culls projectiles is padded
   (WALL_PAD in sim/projectiles.ts). Shots aimed INTO a wall must still die. */
import { newSim, simStep } from "../src/sim/engine.ts";
import { castAbility } from "../src/sim/abilities.ts";
import { HERO_IDS, HEROES } from "../src/data/heroes.ts";
import {
  clampToLane, laneHalf, LANE_Y, CAMP_X, campY, CAMP_R, setCampsOpen
} from "../src/data/world.ts";

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};
const free = S => S.projs.filter(pr => pr.kind !== "atk" && pr.kind !== "tower").length;

/* Stand the hero at (x,y) — clamped like any real position — and cast ability i
   at a point (ax,ay) away from where they ended up. Returns how many
   free-flying shots the cast spawned and how many survived one tick.
   `camps` forces the open pockets AFTER newSim, which picks its own. */
function fire(id, i, x, y, ax, ay, camps){
  const S = newSim([{ h: id, tm: 0 }, { h: "vex", tm: 1 }], "1v1");
  S.noFx = true;
  if (camps) setCampsOpen(camps);
  const p = S.players[0], e = p.hero;
  p.sk = [4, 4, 4, 3];
  p.devFree = true;                       // no mana/cooldown gate, real rules otherwise
  e.x = x; e.y = y; clampToLane(e);
  const before = free(S);
  castAbility(S, p, i, e.x + ax, e.y + ay);
  const made = free(S) - before;
  simStep(S, TICK);
  return { made, alive: free(S), y: e.y };
}

console.log("\n== every hero, flush against each lane wall, firing along it ==");
{
  setCampsOpen([]);                       // plain lane walls, no pockets to escape into
  let tested = 0;
  const eaten = [];
  for (const id of HERO_IDS){
    for (const dir of [-1, 1]){
      const wall = dir < 0 ? "north" : "south";
      for (let i = 0; i < 4; i++){
        if (HEROES[id].abilities[i].passive) continue;
        const r = fire(id, i, 1200, LANE_Y + dir * 9999, 400, 0, []);
        if (!r.made) continue;             // this cast makes no projectile
        tested++;
        if (r.alive < r.made) eaten.push(`${id} a${i} @ ${wall}`);
      }
    }
  }
  ok("casts were actually exercised", tested > 20, `casts=${tested}`);
  ok("no wall-hugging cast was eaten", eaten.length === 0, eaten.join(", "));
}

console.log("\n== flush against a camp pocket rim, firing along it ==");
{
  let tested = 0;
  const eaten = [];
  for (const id of HERO_IDS){
    for (let i = 0; i < 4; i++){
      if (HEROES[id].abilities[i].passive) continue;
      const r = fire(id, i, CAMP_X, campY(0) - CAMP_R, 260, 0, [0]);
      if (!r.made) continue;
      tested++;
      if (r.alive < r.made) eaten.push(`${id} a${i}`);
    }
  }
  setCampsOpen([]);
  ok("casts were actually exercised", tested > 10, `casts=${tested}`);
  ok("no cast from the pocket rim was eaten", eaten.length === 0, eaten.join(", "));
}

console.log("\n== walls still stop shots fired into them ==");
{
  setCampsOpen([]);
  const S = newSim([{ h: "sable", tm: 0 }, { h: "vex", tm: 1 }], "1v1");
  S.noFx = true;
  setCampsOpen([]);
  const p = S.players[0], e = p.hero;
  p.sk = [4, 4, 4, 3]; p.devFree = true;
  e.x = 1200; e.y = LANE_Y;
  castAbility(S, p, 0, 1200, LANE_Y - 2000);          // straight up, into the wall
  ok("shot fired at the wall exists", free(S) > 0);
  let lastY = LANE_Y;
  for (let n = 0; n < 240 && free(S) > 0; n++){
    lastY = S.projs[S.projs.length - 1].y;
    simStep(S, TICK);
  }
  ok("the wall ate it", free(S) === 0);
  // the lane edge a hero can stand on; a shot may pass it only by the pad
  const edge = LANE_Y - (laneHalf(1200) - 10);
  ok("it stopped at the wall, not far beyond", lastY > edge - 40,
    `died at y=${Math.round(lastY)}, standable edge=${Math.round(edge)}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall wall-cast checks passed");
process.exit(fails ? 1 : 0);
