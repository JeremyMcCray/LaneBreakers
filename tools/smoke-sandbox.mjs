// @ts-nocheck
/* The dev sandbox is only worth anything if a number you change actually reaches
   the sim. These checks drive the real tuning module against the real ruleset:
   retune, cast, measure, reset, measure again. */
import { newSim, simStep, applyCmd, castAbility } from "../src/sim/engine.ts";
import { HEROES } from "../src/data/heroes.ts";
import { LANE_Y, WAVE_INTERVAL, getWorldTunable } from "../src/data/world.ts";
import {
  abKey, heroKey, worldKey, setTuning, resetKey, resetAll, resetHero,
  tunedCount, baseValue, liveValue, setScaling, scaleArray,
  exportJson, importJson, diffLines,
} from "../src/dev/tuning.ts";

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};
const step = (S, n) => { for (let i = 0; i < n; i++) simStep(S, TICK); };

/* Two maxed heroes in mid-lane, no towers and no waves — nothing but the thing
   under test can move a health bar. */
function bench(a, b) {
  const S = newSim([{ h: a, tm: 0 }, { h: b, tm: 1 }], "1v1");
  S.noFx = true;
  S.ents = S.ents.filter(e => e.type !== "tower");
  S.waveT = 1e9;
  for (const p of S.players) {
    p.lvl = 12;
    for (let k = 0; k < 4; k++) {
      const A = HEROES[p.heroId].abilities[k];
      p.sk[k] = A.ult ? 3 : 4;
      if (A.charges) { p.chg[k] = A.charges; p.chgT[k] = 0; p.chgM[k] = 0; }
    }
    p.hero.x = p.team === 0 ? 1500 : 1560;
    p.hero.y = LANE_Y;
    p.hero.mp = 9999;
  }
  return S;
}
/* Vex Q is a short dash — cast it onto the enemy, let it travel, read the damage. */
function vexQ(valOverride) {
  if (valOverride !== null) setTuning(abKey("vex", 0, "val", 3), valOverride);
  const S = bench("vex", "gruk");
  step(S, 2);                                     // settle the lvl-12 stat pass
  const foe = S.players[1].hero;
  const before = foe.hp;
  castAbility(S, S.players[0], 0, foe.x, foe.y);
  step(S, 10);                                    // the dash crosses the foe
  return before - foe.hp;
}

console.log("== TUNING REACHES THE SIM ==");
resetAll();
const shipped = vexQ(null);
const doubled = vexQ(baseValue(abKey("vex", 0, "val", 3)) * 2);
ok("a retuned spell value changes the damage dealt",
   doubled > shipped * 1.9 && doubled < shipped * 2.1,
   Math.round(shipped) + " -> " + Math.round(doubled));
resetKey(abKey("vex", 0, "val", 3));
ok("resetting puts the shipped damage back",
   Math.abs(vexQ(null) - shipped) < 0.5, Math.round(shipped));

/* Cast range is clamped inside castAbility, so widening it must let a spell
   land on something that was previously out of reach. */
console.log("\n== CAST RANGE IS LIVE ==");
{
  resetAll();
  const S = bench("vex", "gruk");
  step(S, 2);                                   // settle the lvl-12 stat pass
  const foe = S.players[1].hero;
  foe.x = S.players[0].hero.x + 900;            // far outside Q's 430
  const far = foe.hp;
  castAbility(S, S.players[0], 0, foe.x, foe.y);
  step(S, 45);
  ok("out of range, the dash does not reach", Math.abs(foe.hp - far) < 5);

  setTuning(abKey("vex", 0, "range"), 1000);
  const S2 = bench("vex", "gruk");
  step(S2, 2);                                  // settle the lvl-12 stat pass
  const foe2 = S2.players[1].hero;
  foe2.x = S2.players[0].hero.x + 900;
  const before2 = foe2.hp;
  castAbility(S2, S2.players[0], 0, foe2.x, foe2.y);
  step(S2, 50);
  ok("with the range widened it lands", foe2.hp < before2 - 20,
     "took " + Math.round(before2 - foe2.hp));
  resetAll();
}

/* Base stats are recomputed by updateHeroStats every tick. */
console.log("\n== BASE STATS ARE LIVE ==");
{
  const S = bench("vex", "gruk");
  const before = S.players[0].hero.ms;
  setTuning(heroKey("vex", "ms"), 500);
  step(S, 2);
  ok("move speed follows the tuned base", S.players[0].hero.ms === 500,
     before + " -> " + S.players[0].hero.ms);
  resetKey(heroKey("vex", "ms"));
  step(S, 2);
  ok("and goes back when reset", S.players[0].hero.ms === before);
}

console.log("\n== SCALING HELPERS ==");
{
  resetAll();
  setScaling("vex", 0, "val", 100, 60);
  ok("ramp rewrites every rank",
     HEROES.vex.abilities[0].val.join(",") === "100,160,220,280",
     HEROES.vex.abilities[0].val.join(","));
  resetAll();
  const base = baseValue(abKey("vex", 0, "val", 0));
  scaleArray("vex", 0, "val", 1.5);
  ok("percentage scaling works off the SHIPPED value, not the current one",
     Math.abs(HEROES.vex.abilities[0].val[0] - base * 1.5) < 0.01,
     base + " * 1.5 = " + HEROES.vex.abilities[0].val[0]);
  scaleArray("vex", 0, "val", 1.5);
  ok("applying it twice does not compound",
     Math.abs(HEROES.vex.abilities[0].val[0] - base * 1.5) < 0.01);
  resetAll();
}

console.log("\n== WORLD CONSTANTS ARE LIVE ==");
{
  resetAll();
  const S = bench("vex", "gruk");
  S.waveT = 0.001;
  setTuning(worldKey("WAVE_INTERVAL"), 7);
  step(S, 1);
  ok("the next wave is armed at the tuned interval", Math.abs(S.waveT - 7) < 0.02,
     "waveT " + S.waveT.toFixed(2));
  ok("the importing module sees the new value too", WAVE_INTERVAL === 7,
     "live binding held through the bundler");
  resetKey(worldKey("WAVE_INTERVAL"));
  ok("reset restores it", getWorldTunable("WAVE_INTERVAL") === 25);

  setTuning(worldKey("MAX_LEVEL"), 99);
  ok("MAX_LEVEL is clamped so it can never index past XP_TABLE",
     getWorldTunable("MAX_LEVEL") === 12, "asked 99, got " + getWorldTunable("MAX_LEVEL"));
  resetAll();
}

console.log("\n== OVERRIDE BOOK-KEEPING ==");
{
  resetAll();
  ok("a clean slate has no overrides", tunedCount() === 0);
  setTuning(abKey("vex", 0, "val", 0), 999);
  setTuning(heroKey("ilva", "hp"), 700);
  ok("two changes, two overrides", tunedCount() === 2);
  ok("setting a value back to shipped drops the override",
     (setTuning(abKey("vex", 0, "val", 0), baseValue(abKey("vex", 0, "val", 0))),
      tunedCount() === 1));
  const json = exportJson();
  ok("the diff names what changed", diffLines()[0].what.includes("ILVA"),
     diffLines()[0].what);
  resetAll();
  ok("reset all clears everything", tunedCount() === 0 && liveValue(heroKey("ilva", "hp")) === 540);
  ok("and a round trip through JSON restores it", importJson(json) === 1 &&
     liveValue(heroKey("ilva", "hp")) === 700);
  resetHero("ilva");
  ok("resetHero only touches that hero", tunedCount() === 0);
}

console.log("\n== SANDBOX CHEATS ==");
{
  resetAll();
  const S = bench("vex", "gruk");
  step(S, 2);                                    // settle the lvl-12 stat pass
  const p = S.players[0];

  p.cds = [9, 9, 9, 9];
  applyCmd(S, 0, { a: "dbg", w: "free" });
  ok("free cast toggles on and clears what was already ticking",
     p.devFree === true && p.cds[0] === 0);
  p.cds = [9, 9, 9, 9];                          // and it ignores anything set after
  p.hero.mp = 0;
  const foe = S.players[1].hero;
  const hp0 = foe.hp;
  castAbility(S, p, 0, foe.x, foe.y);
  ok("and neither mana nor the cooldown was spent", p.hero.mp === 0 && p.cds[0] === 9);
  step(S, 10);                                   // the dash crosses the foe
  ok("it casts with no mana and a full cooldown", foe.hp < hp0);
  applyCmd(S, 0, { a: "dbg", w: "free" });
  ok("free cast toggles back off", p.devFree === false);
  p.cds = [9, 9, 9, 9]; p.hero.mp = 9999;
  const hp1 = foe.hp;
  castAbility(S, p, 0, foe.x, foe.y);
  ok("with it off, the cooldown gates the cast again", foe.hp === hp1);

  applyCmd(S, 0, { a: "dbg", w: "dummy", v: 12345, arm: 4, rg: 0 });
  const d = S.ents.find(e => e.dummy);
  ok("a dummy spawns with the asked-for health and armor",
     d && d.maxHp === 12345 && d.armor === 4);
  const dx = d.x, dy = d.y;
  step(S, 120);
  ok("it never moves and never swings", d.x === dx && d.y === dy && d.dmg === 0);
  ok("clearing creeps leaves the dummies standing",
     (applyCmd(S, 0, { a: "dbg", w: "clear" }), !d.dead));
  applyCmd(S, 0, { a: "dbg", w: "nodummy" });
  ok("removing dummies works", d.dead === true);

  applyCmd(S, 0, { a: "dbg", w: "dummy", v: 5000, arm: 0, rg: 500 });
  const d2 = S.ents.find(e => e.dummy && !e.dead);
  d2.hp = 1000;
  step(S, 60);
  ok("a regenerating dummy heals back at the asked-for rate",
     Math.abs(d2.hp - 1500) < 20, "hp " + Math.round(d2.hp));

  applyCmd(S, 0, { a: "dbg", w: "resetsk" });
  ok("skills can be unlearned", p.sk.join("") === "0000");
  applyCmd(S, 0, { a: "dbg", w: "maxsk" });
  ok("and maxed in one go", p.sk.join(",") === "4,4,4,3", p.sk.join(","));

  const kills = S.teamKills.slice();
  applyCmd(S, 0, { a: "dbg", w: "suicide" });
  ok("dying in the sandbox costs no score", p.hero.dead &&
     S.teamKills.join() === kills.join());
  ok("respawn now shortens the timer",
     (applyCmd(S, 0, { a: "dbg", w: "respawn" }), p.respawn < 0.1));

  applyCmd(S, 0, { a: "dbg", w: "god", sl: 1 });
  ok("a cheat can be aimed at another seat", S.players[1].god === true);
  applyCmd(S, 0, { a: "dbg", w: "setgold", v: 4321 });
  ok("gold can be set outright", Math.round(p.gold) === 4321);
  resetAll();
}

console.log("\n== THE RULESET IS UNCHANGED WHEN NOTHING IS TUNED ==");
{
  resetAll();
  ok("no overrides survive the run", tunedCount() === 0);
  let clean = true, off = "";
  for (const id in HEROES) {
    const H = HEROES[id];
    for (let i = 0; i < 4; i++) {
      const A = H.abilities[i];
      for (const f of ["val", "val2", "cd", "mana"]) {
        if (!A[f]) continue;
        for (let r = 0; r < A[f].length; r++)
          if (A[f][r] !== baseValue(abKey(id, i, f, r))) { clean = false; off = id + " " + A.key + " " + f; }
      }
      if (A.range !== baseValue(abKey(id, i, "range"))) { clean = false; off = id + " " + A.key + " range"; }
    }
    for (const st of ["hp", "hpg", "mp", "mpg", "dmg", "dmgg", "arm", "armg", "ms", "range", "bat"])
      if (H[st] !== baseValue(heroKey(id, st))) { clean = false; off = id + " " + st; }
  }
  ok("every hero number is back to what ships in src/data/heroes.ts", clean, off || "all 21 heroes");
}

console.log(fails ? "\n" + fails + " CHECK(S) FAILED" : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
