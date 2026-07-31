// @ts-nocheck
/* Focused checks on the five new kits — each one asserts the mechanic that
   defines the hero, not just "it did not crash". */
import { newSim, simStep, castAbility, mkEnt, kill } from "../src/sim/engine.ts";
import { HEROES, HERO_IDS } from "../src/data/heroes.ts";
import { BOT_BUILD } from "../src/ai/bot.ts";
import { LANE_Y } from "../src/data/world.ts";

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};

/* A clean bench: both heroes maxed and parked in mid-lane, towers removed.
   Fountain regen and stray tower fire would otherwise swamp every measurement. */
function sim(a, b) {
  const S = newSim([{ h: a, tm: 0 }, { h: b, tm: 1 }], "1v1");
  S.noFx = true;
  S.ents = S.ents.filter(e => e.type !== "tower");
  S.waveT = 1e9;                                   // no creep waves during a measurement
  for (const p of S.players) {
    p.lvl = 12;
    for (let k = 0; k < 4; k++) {
      const A = HEROES[p.heroId].abilities[k];
      p.sk[k] = A.ult ? 3 : 4;
      // charge abilities only fill inside simStep — hand them over so a pre-step cast works
      if (A.charges) { p.chg[k] = A.charges; p.chgT[k] = 0; p.chgM[k] = 0; }
    }
    p.hero.x = p.team === 0 ? 1500 : 1900;
    p.hero.y = LANE_Y;
    p.hero.mp = 9999;                              // maxMp is recomputed every tick — just top up
  }
  return S;
}
const step = (S, n) => { for (let i = 0; i < n; i++) simStep(S, TICK); };
/* a stationary practice dummy that will not fight back */
function dummy(S, team, x, y, hp) {
  return mkEnt(S, {
    type: "creep", kind: "melee", team, x, y, r: 12, hp: hp || 4000, maxHp: hp || 4000,
    dmg: 0, armor: 0, range: 10, bat: 9, atkCd: 0, ms: 0, ranged: false,
    laneOff: 0, tid: 0, static: true,
  });
}

console.log("\n== JARAK — Fervor stacks on one target, resets on a switch ==");
{
  const S = sim("jarak", "vex");
  const p = S.players[0], h = p.hero;
  const a = dummy(S, 1, h.x + 100, LANE_Y), b = dummy(S, 1, h.x + 120, LANE_Y + 40);
  const base = h.aps;
  p.order = { type: "attack", tid: a.id };
  step(S, 300);                                    // ~5s of swinging one target
  const stacked = h.fervN, apsUp = h.aps;
  ok("stacks reach the cap of 4", stacked === 4, `fervN=${stacked}`);
  ok("attack speed actually rose", apsUp > base + 0.4, `${base.toFixed(2)} -> ${apsUp.toFixed(2)}`);
  const want = (1 + (4 * HEROES.jarak.abilities[1].val[3]) / 100) / HEROES.jarak.bat;
  ok("aps matches 4 x 32% at rank 4", Math.abs(apsUp - want) < 0.01, `got ${apsUp.toFixed(3)} want ${want.toFixed(3)}`);
  p.order = { type: "attack", tid: b.id };
  step(S, 40);
  ok("switching target wipes the stacks", h.fervN < 4, `fervN=${h.fervN}`);
  castAbility(S, p, 2, h.x, h.y);                  // Berserker's Rage
  p.order = { type: "attack", tid: b.id };
  step(S, 300);
  ok("Berserker's Rage lifts the cap to 8", h.fervMax === 8 && h.fervN === 8, `fervN=${h.fervN}/${h.fervMax}`);
  step(S, 60 * 9);                                 // let the buff lapse
  ok("cap drops back to 4 afterwards", h.fervMax === 4, `fervMax=${h.fervMax}`);
}

console.log("\n== STRYG — Thirst heals off last hits ==");
{
  const S = sim("stryg", "vex");
  const p = S.players[0], h = p.hero;
  h.hp = 200;
  const before = h.hp;
  const c = dummy(S, 1, h.x + 100, LANE_Y, 1);     // one hit from death
  p.order = { type: "attack", tid: c.id };
  step(S, 120);
  const rank4 = HEROES.stryg.abilities[2].val[3];
  ok("last hit restored health", h.hp > before, `${before} -> ${Math.round(h.hp)}`);
  ok("healed by roughly the listed amount", p.healed >= rank4 * 0.9, `healed=${Math.round(p.healed)} listed=${rank4}`);
  const S2 = sim("stryg", "vex");
  S2.players[0].sk[2] = 0;                         // passive not levelled
  const h2 = S2.players[0].hero; h2.hp = 200;
  const c2 = dummy(S2, 1, h2.x + 100, LANE_Y, 1);
  S2.players[0].order = { type: "attack", tid: c2.id };
  step(S2, 120);
  ok("unlevelled Thirst heals nothing", S2.players[0].healed < 20, `healed=${Math.round(S2.players[0].healed)}`);
}

console.log("\n== STRYG — Rupture bites while moving, not while still ==");
{
  const S = sim("stryg", "vex");
  const me = S.players[0], foe = S.players[1];
  foe.hero.x = me.hero.x + 200; foe.hero.y = LANE_Y;
  castAbility(S, me, 3, foe.hero.x, foe.hero.y);
  ok("rupture landed on the enemy hero", foe.hero.rupT > 0, `rupT=${foe.hero.rupT.toFixed(1)}`);
  foe.order = { type: "stop" };
  const hpStill0 = foe.hero.hp; step(S, 90); const stillLoss = hpStill0 - foe.hero.hp;
  foe.order = { type: "move", x: foe.hero.x + 900, y: LANE_Y };
  const hpRun0 = foe.hero.hp; step(S, 90); const runLoss = hpRun0 - foe.hero.hp;
  ok("running costs far more than standing", runLoss > stillLoss * 3 + 10,
     `still=${stillLoss.toFixed(1)} run=${runLoss.toFixed(1)}`);
  step(S, 60 * 7);
  ok("it expires after 6s", !(foe.hero.rupT > 0), `rupT=${foe.hero.rupT}`);
}

console.log("\n== ZAAL — Arc Lightning chains, Static Field bleeds on every cast ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
  p.sk[2] = 0;                                     // isolate the chain from Static Field
  const ds = [];
  for (let i = 0; i < 5; i++) ds.push(dummy(S, 1, h.x + 260 + i * 120, LANE_Y + (i % 2 ? 40 : -40)));
  const hp0 = ds.map(d => d.hp);
  castAbility(S, p, 0, ds[0].x, ds[0].y);
  const hurt = ds.filter((d, i) => d.hp < hp0[i]).length;
  ok("the bolt jumped across several bodies", hurt >= 4, `hit ${hurt} of 5`);
  const dmgs = ds.map((d, i) => hp0[i] - d.hp).filter(v => v > 0).sort((a, b) => b - a);
  ok("damage falls off with each jump", dmgs[0] > dmgs[dmgs.length - 1] * 1.4,
     `first=${dmgs[0].toFixed(0)} last=${dmgs[dmgs.length - 1].toFixed(0)}`);

  const S2 = sim("zaal", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  const near = dummy(S2, 1, h2.x + 300, LANE_Y);
  const nh0 = near.hp;
  castAbility(S2, p2, 3, h2.x, h2.y);              // ult hits heroes only — creep loss must be Static Field
  const pct = HEROES.zaal.abilities[2].val[3] / 100;
  ok("Static Field tore into a nearby creep", near.hp < nh0, `${nh0} -> ${Math.round(near.hp)}`);
  ok("and it scaled off current health", (nh0 - near.hp) <= nh0 * pct + 1,
     `took ${(nh0 - near.hp).toFixed(0)} of a ${(nh0 * pct).toFixed(0)} ceiling`);
}

console.log("\n== ZAAL — Lightning Bolt telegraphs for 0.5s, then lands ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
  p.sk[2] = 0;                                     // keep Static Field out of the reading
  const d = dummy(S, 1, h.x + 400, LANE_Y);
  const hp0 = d.hp;
  castAbility(S, p, 1, d.x, d.y);
  const z = S.zones.find(q => q.kind === "strike");
  ok("a telegraphed strike zone was placed", !!z && Math.abs(z.t - 0.5) < 0.01, z ? `t=${z.t}` : "none");
  step(S, 24);                                     // 0.4s — still in the air
  ok("nothing has landed yet at 0.4s", d.hp === hp0, `hp=${Math.round(d.hp)}`);
  step(S, 12);                                     // past 0.5s
  ok("it lands after the telegraph", d.hp < hp0, `${hp0} -> ${Math.round(d.hp)}`);
  ok("and it stunned what it hit", d.stun > 0, `stun=${d.stun.toFixed(2)}`);
}

console.log("\n== RONIN — Bladefury: spell immune, cannot swing, damages around him ==");
{
  const S = sim("ronin", "ilva");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 120, LANE_Y);
  const hp0 = d.hp;
  castAbility(S, p, 0, h.x, h.y);
  ok("spin flag and spell immunity are both up", h.spinT > 0 && h.csT > 0, `spinT=${h.spinT} csT=${h.csT}`);
  p.order = { type: "attack", tid: d.id };
  step(S, 60);
  ok("he cannot land an attack while spinning", h.windT === 0 && h.wTid === 0, `wTid=${h.wTid}`);
  ok("but the whirl still chews the target", d.hp < hp0, `${hp0} -> ${Math.round(d.hp)}`);
  const foe = S.players[1];
  foe.hero.x = h.x + 150; foe.hero.y = LANE_Y;
  const hpBeforeNuke = h.hp;
  castAbility(S, foe, 1, h.x, h.y);                // Ilva's Rime Nova, straight at him
  step(S, 6);
  ok("magic immunity held", h.hp >= hpBeforeNuke, `hp ${Math.round(hpBeforeNuke)} -> ${Math.round(h.hp)}`);
  step(S, 60 * 4);
  ok("spin ends and he can swing again", !(h.spinT > 0), `spinT=${h.spinT}`);
}

console.log("\n== RONIN — Healing Ward heals, and dies when shot ==");
{
  const S = sim("ronin", "vex");
  const p = S.players[0], h = p.hero;
  h.hp = 400;
  castAbility(S, p, 1, h.x + 60, LANE_Y);
  const w = S.ents.find(e => e.ward);
  ok("a ward was planted", !!w, w ? `hp=${w.hp}` : "none");
  ok("a heal field followed it", S.zones.some(z => z.kind === "hward"), "");
  const hp0 = h.hp;
  step(S, 120);
  ok("it healed the hero standing on it", h.hp > hp0 + 30, `${hp0} -> ${Math.round(h.hp)}`);
  w.hp = 0; w.dead = true;
  step(S, 10);
  ok("killing the ward removes the field", !S.zones.some(z => z.kind === "hward"), "");
}

console.log("\n== RONIN — Omnislash strikes repeatedly and is untouchable ==");
{
  const S = sim("ronin", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3000;                      // keep the enemy hero out of the bounce pool
  const ds = [dummy(S, 1, h.x + 200, LANE_Y), dummy(S, 1, h.x + 300, LANE_Y + 60)];
  const hp0 = ds.map(d => d.hp);
  castAbility(S, p, 3, ds[0].x, ds[0].y);
  ok("he is untouchable while it runs", h.invT > 0 && h.castLock > 1, `invT=${h.invT} lock=${h.castLock.toFixed(2)}`);
  ok("the slash zone was queued", S.zones.some(z => z.kind === "omni"), "");
  step(S, 150);
  const total = ds.reduce((a, d, i) => a + (hp0[i] - d.hp), 0);
  // every cut is the flat rank value PLUS a full right click
  const per = HEROES.ronin.abilities[3].val[2] + h.dmg;
  ok("all six cuts landed", Math.abs(total - per * 6) < 1, `total=${total.toFixed(0)} want=${(per * 6).toFixed(0)}`);
  ok("the cuts were spread across both bodies",
     ds.every((d, i) => hp0[i] - d.hp > 0), ds.map((d, i) => Math.round(hp0[i] - d.hp)).join("+"));
  ok("invulnerability and lock cleared afterwards", !(h.invT > 0.25) && !(h.castLock > 0.1),
     `invT=${(h.invT || 0).toFixed(2)} lock=${(h.castLock || 0).toFixed(2)}`);
}

console.log("\n== VOSK — Split Earth stuns, Edict pulses, Pulse Nova drains mana ==");
{
  const S = sim("vosk", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 300, LANE_Y);
  const hp0 = d.hp;
  castAbility(S, p, 0, d.x, d.y);
  step(S, 40);
  ok("Split Earth landed and stunned", d.hp < hp0 && d.stun > 0, `stun=${d.stun.toFixed(2)}`);

  const S2 = sim("vosk", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  const d2 = dummy(S2, 1, h2.x + 150, LANE_Y);
  const h20 = d2.hp;
  castAbility(S2, p2, 1, h2.x, h2.y);
  ok("edict zone is up", S2.zones.some(z => z.kind === "edict"), "");
  step(S2, 60 * 3);
  ok("explosions are landing over time", d2.hp < h20, `${h20} -> ${Math.round(d2.hp)}`);

  const S3 = sim("vosk", "vex");
  const p3 = S3.players[0], h3 = p3.hero;
  const d3 = dummy(S3, 1, h3.x + 150, LANE_Y);
  const h30 = d3.hp;
  castAbility(S3, p3, 3, h3.x, h3.y);
  const mp0 = h3.mp;
  step(S3, 60 * 3);                                // ~3 pulses at 22 mana, regen is only ~3/s
  ok("nova pulses hurt and cost mana", d3.hp < h30 && h3.mp < mp0 - 40,
     `mp ${Math.round(mp0)} -> ${Math.round(h3.mp)}, dummy took ${Math.round(h30 - d3.hp)}`);
  h3.mp = 0;
  step(S3, 60);
  ok("it shuts off when the mana runs dry", !S3.zones.some(z => z.kind === "nova"), "");
}

console.log("\n== VOSK — Lightning Storm chains and slows ==");
{
  const S = sim("vosk", "vex");
  const p = S.players[0], h = p.hero;
  const ds = [];
  for (let i = 0; i < 4; i++) ds.push(dummy(S, 1, h.x + 260 + i * 110, LANE_Y + (i % 2 ? 30 : -30)));
  const hp0 = ds.map(d => d.hp);
  castAbility(S, p, 2, ds[0].x, ds[0].y);
  const hurt = ds.filter((d, i) => d.hp < hp0[i]).length;
  ok("the storm jumped between bodies", hurt >= 3, `hit ${hurt} of 4`);
  ok("and slowed what it touched", ds.filter(d => d.slowT > 0).length >= 3,
     `slowed ${ds.filter(d => d.slowT > 0).length}`);
}

console.log("\n== STRYG — Bloodrage cuts both ways ==");
{
  const S = sim("stryg", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 100, LANE_Y);
  const plain0 = d.hp;
  p.order = { type: "attack", tid: d.id };
  step(S, 180);
  const plain = plain0 - d.hp;
  const d2 = dummy(S, 1, h.x + 100, LANE_Y + 30);
  castAbility(S, p, 1, h.x, h.y);
  ok("outgoing and incoming amps are both set", h.brT > 0 && h.vulT > 0, `br=${h.brP} vul=${h.vulP}`);
  p.order = { type: "attack", tid: d2.id };
  const start = d2.hp;
  step(S, 180);
  const raged = start - d2.hp;
  ok("he hits noticeably harder while raging", raged > plain * 1.15,
     `${plain.toFixed(0)} -> ${raged.toFixed(0)} over 3s`);
}

console.log("\n== ASH — embers stack, burn, detonate and spread ==");
{
  const S = sim("ash", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 300, LANE_Y);
  castAbility(S, p, 0, d.x, d.y);                  // Cinderbolt: 2 embers
  step(S, 30);
  ok("a bolt lit 2 embers", d.embN === 2, `embN=${d.embN}`);
  const hp0 = d.hp;
  step(S, 60);                                     // 1s of burning
  const perStack = HEROES.ash.abilities[1].val[3];
  const burned = hp0 - d.hp;
  ok("they burn for stacks x rank each second", Math.abs(burned - 2 * perStack) < perStack * 0.6,
     `took ${burned.toFixed(0)}/s, expected ~${2 * perStack}`);
  // charges let him prime to the cap fast
  p.chg[0] = 3;
  for (let k = 0; k < 3; k++) { castAbility(S, p, 0, d.x, d.y); step(S, 25); }
  ok("stacks cap at six with Wildfire", d.embN === 6, `embN=${d.embN}`);
  // detonate
  const preDet = d.hp;
  castAbility(S, p, 2, d.x, d.y);                  // Conflagrate
  const perStackDet = HEROES.ash.abilities[2].val[3];
  ok("conflagrate consumed every stack", d.embN === 0, `embN=${d.embN}`);
  ok("and paid out per stack consumed", Math.abs((preDet - d.hp) - perStackDet * 6) < 2,
     `burst=${(preDet - d.hp).toFixed(0)} want=${perStackDet * 6}`);
  // an unburnt target gets lit instead of whiffing
  const fresh = dummy(S, 1, h.x + 320, LANE_Y + 20);
  S.players[0].cds[2] = 0;
  castAbility(S, p, 2, fresh.x, fresh.y);
  ok("an unburnt target catches embers instead", fresh.embN === 2, `embN=${fresh.embN}`);
}

console.log("\n== ASH — Wildfire throws embers off a corpse ==");
{
  const S = sim("ash", "vex");
  const p = S.players[0], h = p.hero;
  // enough HP to survive the bolt but not the burn it leaves behind
  const dying = dummy(S, 1, h.x + 300, LANE_Y, 200);
  const neighbour = dummy(S, 1, h.x + 340, LANE_Y + 30);
  castAbility(S, p, 0, dying.x, dying.y);
  step(S, 30);
  ok("the doomed creep is burning", dying.embN > 0 && !dying.dead, `embN=${dying.embN} hp=${Math.round(dying.hp)}`);
  step(S, 150);                                    // the burn itself finishes it
  ok("it died to the burn", dying.dead, `hp=${Math.round(dying.hp)}`);
  ok("its embers leapt to the neighbour", neighbour.embN > 0, `embN=${neighbour.embN}`);
  // without Wildfire levelled there is no spread and a shallower cap
  const S2 = sim("ash", "vex");
  const p2 = S2.players[0]; p2.sk[1] = 0;
  const a2 = dummy(S2, 1, p2.hero.x + 300, LANE_Y, 1);
  const b2 = dummy(S2, 1, p2.hero.x + 340, LANE_Y + 30);
  castAbility(S2, p2, 0, a2.x, a2.y);
  step(S2, 120);
  ok("no spread without Wildfire", !(b2.embN > 0), `embN=${b2.embN || 0}`);
  ok("and the cap is only three", (p2.hero.embCap || 0) === 3, `cap=${p2.hero.embCap}`);
}

console.log("\n== ASH — Firestorm feeds embers and holds them lit ==");
{
  const S = sim("ash", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 300, LANE_Y);
  castAbility(S, p, 3, d.x, d.y);
  ok("the storm is up", S.zones.some(z => z.kind === "firestorm"), "");
  step(S, 120);                                    // 2s inside
  ok("it force-feeds embers", d.embN >= 4, `embN=${d.embN}`);
  ok("and embers cannot burn out inside it", d.embHold > 0, `hold=${(d.embHold || 0).toFixed(2)}`);
  step(S, 60 * 5);
  ok("storm expires", !S.zones.some(z => z.kind === "firestorm"), "");
}

console.log("\n== VHAL — the brood is cut from her own stats ==");
{
  const S = sim("vhal", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 0, h.x, h.y);                  // Spawn Brood, rank 4 = 5
  const brood = S.ents.filter(o => o.brood && o.owner === h.id);
  ok("five spawnlings crawled out", brood.length === 5, `${brood.length}`);
  const V = HEROES.vhal.abilities[2].val[3];
  const wantDmg = Math.round(12 + h.dmg * V / 100);
  const wantHp = Math.round(110 + h.maxHp * V / 400);
  ok("each inherits her attack damage", brood[0].dmg === wantDmg, `${brood[0].dmg} want ${wantDmg}`);
  ok("and a quarter as much of her health", brood[0].maxHp === wantHp, `${brood[0].maxHp} want ${wantHp}`);
  step(S, 2);                                      // let a stat pass run at her real level
  const bare = HEROES.vhal.arm + HEROES.vhal.armg * 11;
  ok("she gains armor while one lives", h.armor > bare + 4, `armor=${h.armor.toFixed(1)} bare=${bare.toFixed(1)}`);
  // buying damage has to reach the brood
  const before = brood[0].dmg;
  p.items.push({ id: "blade", cd: 0 });            // +28 attack damage
  step(S, 2);
  ok("her items scale the whole swarm", brood[0].dmg > before, `${before} -> ${brood[0].dmg}`);
  // no symbiosis, no inheritance
  const S2 = sim("vhal", "vex");
  S2.players[0].sk[2] = 0;
  castAbility(S2, S2.players[0], 0, S2.players[0].hero.x, S2.players[0].hero.y);
  const b2 = S2.ents.filter(o => o.brood)[0];
  ok("unlevelled Symbiosis inherits nothing", b2.dmg === 12 && b2.maxHp === 110, `dmg=${b2.dmg} hp=${b2.maxHp}`);
}

console.log("\n== VHAL — Unleash flings the swarm and hastes it ==");
{
  const S = sim("vhal", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 0, h.x, h.y);
  const brood = S.ents.filter(o => o.brood && o.owner === h.id);
  const baseAps = brood[0].aps;
  const tx = h.x + 500, ty = LANE_Y;
  castAbility(S, p, 1, tx, ty);
  ok("every spawnling teleported to the cursor",
     brood.every(o => Math.hypot(o.x - tx, o.y - ty) < 130), "");
  const V = HEROES.vhal.abilities[1].val[3];
  ok("they attack faster", Math.abs(brood[0].aps - baseAps * (1 + V / 100)) < 0.01,
     `${baseAps.toFixed(2)} -> ${brood[0].aps.toFixed(2)}`);
  ok("and gained lifesteal", brood[0].ls > 0, `ls=${brood[0].ls}`);
  step(S, 60 * 6);
  ok("the haste wears off", Math.abs(brood[0].aps - baseAps) < 0.01 && !(brood[0].ls > 0),
     `aps=${brood[0].aps.toFixed(2)} ls=${brood[0].ls}`);
}

console.log("\n== VHAL — Hive Ascendant grows and raises the dead ==");
{
  const S = sim("vhal", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 3, h.x, h.y);
  ok("the hive is up", S.zones.some(z => z.kind === "hive") && h.hiveT > 0, `hiveT=${h.hiveT}`);
  step(S, 60 * 5);                                 // a spawnling every 2s
  const n = S.ents.filter(o => o.brood && o.owner === h.id && !o.dead).length;
  ok("spawnlings crawl out on their own", n >= 2, `${n} alive`);
  // a lane creep dying inside the hive comes back on her side
  const corpse = dummy(S, 1, h.x + 100, LANE_Y, 1);
  corpse.pet = false;
  const before = S.ents.filter(o => o.brood && o.owner === h.id && !o.dead).length;
  corpse.hp = 0;
  kill(S, h, corpse);
  const after = S.ents.filter(o => o.brood && o.owner === h.id && !o.dead).length;
  ok("an enemy corpse rises on her side", after === before + 1, `${before} -> ${after}`);
  // hard cap of eight
  for (let k = 0; k < 12; k++) {
    const c = dummy(S, 1, h.x + 100, LANE_Y, 1);
    c.hp = 0; kill(S, h, c);
  }
  const capped = S.ents.filter(o => o.brood && o.owner === h.id && !o.dead).length;
  ok("the brood is capped at eight", capped <= 8, `${capped} alive`);
  step(S, 60 * 17);
  ok("the hive closes after 16s", !S.zones.some(z => z.kind === "hive"), "");
}

console.log("\n== ROSTER — nothing on the new heroes is half-wired ==");
{
  const missing = HERO_IDS.filter(id => !BOT_BUILD[id]);
  ok("no hero is missing a bot item build", missing.length === 0, missing.join(",") || "all present");
  const badAb = HERO_IDS.filter(id => HEROES[id].abilities.length !== 4);
  ok("every hero has exactly four abilities", badAb.length === 0, badAb.join(",") || "ok");
  const bad = [];
  for (const id of HERO_IDS) HEROES[id].abilities.forEach((A, i) => {
    const want = A.ult ? 3 : 4;
    if (A.val.length !== want || A.mana.length !== want || A.cd.length !== want) bad.push(id + i + ":ranks");
    if (!A.desc.includes("%d")) bad.push(id + i + ":desc");
    if (A.passive && !A.grants) bad.push(id + i + ":grants");
  });
  ok("rank tables and tooltips are well formed", bad.length === 0, bad.join(",") || "ok");
  ok("all 21 heroes are registered", HERO_IDS.length === 21, `${HERO_IDS.length} heroes`);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
