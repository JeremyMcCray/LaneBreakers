// @ts-nocheck
/* Focused checks on the newer kits — each one asserts the mechanic that
   defines the hero, not just "it did not crash". */
import { newSim, simStep, castAbility, mkEnt, kill, damage } from "../src/sim/engine.ts";
import { HEROES, HERO_IDS } from "../src/data/heroes.ts";
import { BOT_BUILD } from "../src/ai/bot.ts";
import { LANE_Y, armorMult } from "../src/data/world.ts";

const TICK = 1 / 60;
const CREEP_RESIST = 0.70;   // creeps shrug off 30% of ability damage (dummies are creeps)
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
  // melee grip nets +15 AS on top of the stacks (-20 base, +35 from the blade)
  const want = (1 + (15 + 4 * HEROES.jarak.abilities[1].val[3]) / 100) / HEROES.jarak.bat;
  ok("aps matches melee grip + 4 stacks at rank 4", Math.abs(apsUp - want) < 0.01, `got ${apsUp.toFixed(3)} want ${want.toFixed(3)}`);
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
  const per = (HEROES.ronin.abilities[3].val[2] + h.dmg) * CREEP_RESIST;
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
  const perStack = HEROES.ash.abilities[1].val[3] * CREEP_RESIST;
  const burned = hp0 - d.hp;
  ok("they burn for stacks x rank each second", Math.abs(burned - 2 * perStack) < perStack * 0.6,
     `took ${burned.toFixed(0)}/s, expected ~${(2 * perStack).toFixed(0)}`);
  // charges let him prime to the cap fast
  p.chg[0] = 3;
  for (let k = 0; k < 3; k++) { castAbility(S, p, 0, d.x, d.y); step(S, 25); }
  ok("stacks cap at six with Wildfire", d.embN === 6, `embN=${d.embN}`);
  // detonate
  const preDet = d.hp;
  castAbility(S, p, 2, d.x, d.y);                  // Conflagrate
  const perStackDet = HEROES.ash.abilities[2].val[3] * CREEP_RESIST;
  ok("conflagrate consumed every stack", d.embN === 0, `embN=${d.embN}`);
  ok("and paid out per stack consumed", Math.abs((preDet - d.hp) - perStackDet * 6) < 2,
     `burst=${(preDet - d.hp).toFixed(0)} want=${(perStackDet * 6).toFixed(0)}`);
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
  const dying = dummy(S, 1, h.x + 300, LANE_Y, 140);
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

console.log("\n== DORN — the Revolving Door shoves, the luggage comes back ==");
{
  const S = sim("dorn", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 120, LANE_Y);
  const x0 = d.x;
  castAbility(S, p, 0, d.x, d.y);                  // Revolving Door
  ok("the target was shoved away", d.x > x0 + 150, `${Math.round(x0)} -> ${Math.round(d.x)}`);
  ok("and slowed", d.slowT > 0, `slowT=${d.slowT.toFixed(1)}`);
  // a fresh sim so the shoved dummy is not squatting on the suitcase's flight path
  const S2 = sim("dorn", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  S2.players[1].hero.x = 3200;                     // the suitcase clamps the FIRST thing it meets
  const far = dummy(S2, 1, h2.x + 600, LANE_Y);
  const hp0 = far.hp;
  castAbility(S2, p2, 1, far.x, far.y);            // Baggage Check
  step(S2, 40);                                    // flight + the clamp
  const fx0 = far.x;
  ok("the suitcase hit and clamped on", far.hp < hp0 && S2.zones.some(z => z.kind === "yank"),
     `hp ${hp0} -> ${Math.round(far.hp)}`);
  step(S2, 60);                                    // the recall fires at 0.9s
  ok("the recall dragged them to Dorn", far.x < fx0 - 220, `${Math.round(fx0)} -> ${Math.round(far.x)}`);
}

console.log("\n== DORN — Service Doors carry his side, once per entry ==");
{
  const S = sim("dorn", "vex");
  const p = S.players[0], h = p.hero;
  const hx0 = h.x;
  castAbility(S, p, 2, h.x + 500, LANE_Y);         // door A at his feet, B at +500
  ok("a pair of doors is standing", S.zones.some(z => z.kind === "doors"), "");
  step(S, 5);
  ok("he stepped through to the far door", Math.abs(h.x - (hx0 + 500)) < 80,
     `${Math.round(hx0)} -> ${Math.round(h.x)}`);
  step(S, 90);                                     // stand on the mat well past the cooldown
  ok("standing on the mat does not bounce him back", Math.abs(h.x - (hx0 + 500)) < 120,
     `x=${Math.round(h.x)}`);
  step(S, 60 * 10);
  ok("the doors close on schedule", !S.zones.some(z => z.kind === "doors"), "");
}

console.log("\n== DORN — The Grand Door shows you out ==");
{
  const S = sim("dorn", "vex");                    // with doors: escorted to the far side
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 200; foe.y = LANE_Y;
  castAbility(S, p, 2, h.x + 500, LANE_Y);
  const door = S.zones.find(z => z.kind === "doors");
  castAbility(S, p, 3, foe.x, foe.y);
  ok("the victim came out the far door", Math.abs(foe.x - door.tx) < 60 && Math.abs(foe.y - door.ty) < 60,
     `foe at ${Math.round(foe.x)}, far door at ${Math.round(door.tx)}`);
  ok("dazed by the trip", foe.stun > 0, `stun=${foe.stun.toFixed(2)}`);

  const S2 = sim("dorn", "vex");                   // without doors: hurled toward home
  const p2 = S2.players[0], h2 = p2.hero;
  const foe2 = S2.players[1].hero;
  foe2.x = h2.x + 200; foe2.y = LANE_Y;
  const fx2 = foe2.x;
  castAbility(S2, p2, 3, foe2.x, foe2.y);
  ok("no doors — thrown 450 toward their own base", foe2.x > fx2 + 380,
     `${Math.round(fx2)} -> ${Math.round(foe2.x)}`);
  ok("and slowed on the way out", foe2.slowT > 0, `slowT=${foe2.slowT.toFixed(1)}`);
}

console.log("\n== TIMBER — spin, chain, plates ==");
{
  const S = sim("timber", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 150, LANE_Y);
  const hp0 = d.hp;
  castAbility(S, p, 0, h.x, h.y);                  // Whirling Death
  ok("the spin chewed the target and slowed it", d.hp < hp0 && d.slowT > 0,
     `${hp0} -> ${Math.round(d.hp)} slowT=${d.slowT.toFixed(1)}`);
  const d2 = dummy(S, 1, h.x + 400, LANE_Y + 40);
  const d2hp = d2.hp, hx0 = h.x;
  castAbility(S, p, 1, h.x + 500, LANE_Y + 40);    // Timber Chain
  ok("the chain reeled him across the lane", h.x > hx0 + 400, `${Math.round(hx0)} -> ${Math.round(h.x)}`);
  ok("and sawed what he passed", d2.hp < d2hp, `${d2hp} -> ${Math.round(d2.hp)}`);
  const foe = S.players[1].hero;
  step(S, 2);                                      // a stats pass so Reactive Armor is armed
  const arm0 = h.armor;
  for (let k = 0; k < 5; k++) damage(S, foe, h, 10, { attack: true });
  step(S, 2);
  ok("five landed attacks are five armor plates", h.raN === 5, `raN=${h.raN}`);
  ok("and his armor actually rose", h.armor > arm0 + 5*1.3, `${arm0.toFixed(1)} -> ${h.armor.toFixed(1)}`);
  step(S, 60 * 13);                                // let the plates lapse
  ok("the plates fall off after 12s", !(h.raN > 0), `raN=${h.raN}`);
}

console.log("\n== TIMBER — the Chakram parks, drains, and comes home ==");
{
  const S = sim("timber", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x - 400, LANE_Y);        // behind him, away from the enemy hero
  castAbility(S, p, 3, d.x, d.y);
  ok("the blade is parked with no cooldown ticking", S.zones.some(z => z.kind === "chakram") && p.cds[3] === 0,
     `cd=${p.cds[3]}`);
  const hp0 = d.hp, mp0 = h.mp;
  step(S, 60);
  ok("it grinds and slows what stands in it", d.hp < hp0 - 30 && d.slowT > 0,
     `${hp0} -> ${Math.round(d.hp)}`);
  ok("and feeds on his mana", h.mp < mp0 - 10, `${Math.round(mp0)} -> ${Math.round(h.mp)}`);
  castAbility(S, p, 3, h.x, h.y);                  // the recall
  ok("R again recalls it", S.zones.some(z => z.kind === "chakret"), "");
  step(S, 90);
  ok("it returns and only then starts the cooldown",
     !S.zones.some(z => z.kind === "chakram" || z.kind === "chakret") && p.cds[3] > 5,
     `cd=${p.cds[3].toFixed(1)}`);
}

console.log("\n== DRIFT — Twin Rakes: magic at the tips, steel up close ==");
{
  const S = sim("drift", "vex");
  const p = S.players[0], h = p.hero;
  step(S, 2);                                      // settle the lvl-12 stat pass
  const V = HEROES.drift.abilities[0].val[3];
  const near = dummy(S, 1, h.x + 70, LANE_Y);      // inside the closest 30% of 320
  const far  = dummy(S, 1, h.x + 290, LANE_Y);     // out at the tips
  const behind = dummy(S, 1, h.x - 150, LANE_Y);   // outside the arc entirely
  castAbility(S, p, 0, h.x + 300, LANE_Y);
  const magic = V * CREEP_RESIST;
  const steel = h.dmg * HEROES.drift.abilities[0].val2[3] / 100;
  ok("the far target took the magic only", Math.abs((4000 - far.hp) - magic) < 3,
     `took ${Math.round(4000 - far.hp)} want ~${Math.round(magic)}`);
  ok("the near target took magic AND steel", Math.abs((4000 - near.hp) - (magic + steel)) < steel * 0.3,
     `took ${Math.round(4000 - near.hp)} want ~${Math.round(magic + steel)}`);
  ok("nothing behind him was touched", behind.hp === 4000, "");
}

console.log("\n== DRIFT — Bloodtrail: the wound bleeds, and he steps through the blood ==");
{
  const S = sim("drift", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 500, LANE_Y - 160);  // off the enemy hero's body
  castAbility(S, p, 1, d.x, d.y);
  step(S, 40);                                     // the knife flies and lands
  ok("the wound is open and bleeding", d.dotT > 0 && d.dotSrc === h.id, `dotT=${(d.dotT||0).toFixed(1)}`);
  const perSec = 4000 * (HEROES.drift.abilities[1].val[3] / 100) / 5 * CREEP_RESIST;
  const hp1 = d.hp;
  step(S, 120);                                    // two seconds of bleeding
  ok("it bleeds a fixed slice of max health", Math.abs((hp1 - d.hp) - perSec * 2) < 70,
     `bled ${Math.round(hp1 - d.hp)} want ~${Math.round(perSec * 2)}`);
  const hpL = d.hp;
  damage(S, h, d, 100, { pure: true });
  ok("Lacerate tears 24% harder into the bleeding", Math.abs((hpL - d.hp) - 124) < 2,
     `dealt ${Math.round(hpL - d.hp)}/124`);
  const mp0 = h.mp, cd0 = p.cds[1];
  castAbility(S, p, 1, h.x, h.y);                  // the recast — step to the wound
  const gap = Math.hypot(h.x - d.x, h.y - d.y);
  ok("the recast stepped him to the wound", gap < 60, `landed ${Math.round(gap)} away`);
  ok("and it was free", h.mp === mp0 && p.cds[1] === cd0, `mp ${Math.round(mp0)} cd ${cd0.toFixed(1)}`);
  h.hp = 500;
  const hp2 = h.hp;
  damage(S, h, d, 99999, { pure: true });          // kill it while it bleeds
  ok("a bleeding kill feeds him 90 health", h.hp >= hp2 + 80, `${hp2} -> ${Math.round(h.hp)}`);
}

console.log("\n== DRIFT — Blackout: the other side goes night-blind ==");
{
  const S = sim("drift", "vex");
  const p = S.players[0], foe = S.players[1].hero;
  castAbility(S, p, 3, p.hero.x, p.hero.y);
  ok("the enemy hero is night-blind for 8s", Math.abs(foe.blindT - 8) < 0.1, `blindT=${(foe.blindT||0).toFixed(1)}`);
  ok("his own side keeps its eyes", !(p.hero.blindT > 0), "");
  step(S, 60 * 9);
  ok("the lights come back on", !(foe.blindT > 0), `blindT=${(foe.blindT||0).toFixed(1)}`);
}

console.log("\n== GEIST — blood in, blood out ==");
{
  const S = sim("geist", "vex");
  const p = S.players[0], h = p.hero;
  step(S, 2);                                      // settle the lvl-12 stat pass
  h.hp = h.maxHp;
  const d = dummy(S, 1, h.x + 400, LANE_Y - 140);  // clear of the enemy hero
  const V = HEROES.geist.abilities[0].val[3];
  const hp0 = h.hp;
  castAbility(S, p, 0, d.x, d.y);                  // Essence Bomb
  ok("Essence Bomb cost her 7% of herself", Math.abs((hp0 - h.hp) - h.maxHp * 0.07) < 2,
     `paid ${Math.round(hp0 - h.hp)}`);
  ok("and the blast landed", Math.abs((4000 - d.hp) - V * CREEP_RESIST) < 3,
     `took ${Math.round(4000 - d.hp)} want ~${Math.round(V * CREEP_RESIST)}`);
  h.hp = 500;
  const d1 = d.hp, mine = h.hp;
  castAbility(S, p, 1, d.x, d.y);                  // Life Drain
  step(S, 130);                                    // ~2s on the tether
  ok("the tether drains the victim", d.hp < d1 - 80, `${Math.round(d1)} -> ${Math.round(d.hp)}`);
  ok("and every drop comes back to her", h.hp > mine + 80, `${mine} -> ${Math.round(h.hp)}`);
  const d3 = dummy(S, 1, h.x + 300, LANE_Y + 80);
  castAbility(S, p, 2, d3.x, d3.y);                // Malice
  step(S, 30);
  ok("Malice cursed the victim", d3.markT > 0 && Math.abs(d3.markP - 0.24) < 0.001,
     `markT=${(d3.markT||0).toFixed(1)} markP=${d3.markP}`);
  const m0 = d3.hp;
  damage(S, h, d3, 100, { pure: true });
  ok("and everything hits them 24% harder", Math.abs((m0 - d3.hp) - 124) < 2, `dealt ${Math.round(m0 - d3.hp)}/124`);
}

console.log("\n== GEIST — Soul Exchange trades health bars ==");
{
  const S = sim("geist", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 300; foe.y = LANE_Y;
  step(S, 2);
  h.hp = h.maxHp * 0.15; foe.hp = foe.maxHp * 0.90;
  castAbility(S, p, 3, foe.x, foe.y);
  ok("she walked away with their 90%", Math.abs(h.hp / h.maxHp - 0.90) < 0.02,
     `now at ${Math.round(h.hp / h.maxHp * 100)}%`);
  ok("they got her 15% — floored at 20%", Math.abs(foe.hp / foe.maxHp - 0.20) < 0.02,
     `now at ${Math.round(foe.hp / foe.maxHp * 100)}%`);
}

console.log("\n== ORRIN — Siege Bolt mends the wave, hurls theirs into their heroes ==");
{
  const S = sim("orrin", "vex");
  const p = S.players[0], h = p.hero;
  const V = HEROES.orrin.abilities[0].val[3];
  // an allied creep in the flight path, wounded
  const ally = dummy(S, 0, h.x + 150, LANE_Y, 4000);
  ally.hp = 1000;
  // an enemy creep further along, with the enemy hero parked right behind it
  const foe = dummy(S, 1, h.x + 300, LANE_Y, 4000);
  const vex = S.players[1].hero;
  vex.x = h.x + 400; vex.y = LANE_Y;
  step(S, 1);                                       // let the lvl-12 stat pass settle hp first
  const vexHp = vex.hp, foeX = foe.x;
  castAbility(S, p, 0, h.x + 500, LANE_Y);
  step(S, 30);
  ok("the allied creep was mended for half", Math.abs(ally.hp - (1000 + V / 2)) < 2,
     `1000 -> ${Math.round(ally.hp)} (half of ${V})`);
  ok("the enemy creep took the bolt (less 30% spell resist)",
     Math.abs(foe.hp - (4000 - V * CREEP_RESIST)) < 2, `4000 -> ${Math.round(foe.hp)}`);
  ok("and was hurled backward", foe.x > foeX + 40, `${foeX} -> ${Math.round(foe.x)}`);
  ok("it slammed into the hero behind it", foe.x < vex.x, `stopped at ${Math.round(foe.x)}, hero at ${Math.round(vex.x)}`);
  // the hero stands in the flight line too, so they eat the bolt AND the slam —
  // the slam lands at full V/2, then the creep saps the bolt 30% before the
  // direct hit (both mitigated by armor — same formula the sim uses)
  const want = (V * 0.5 + V * 0.7) * armorMult(vex.armor);
  ok("who took the slam plus the sapped bolt", Math.abs((vexHp - vex.hp) - want) < 25,
     `took ${Math.round(vexHp - vex.hp)} want ~${Math.round(want)}`);
  // no hero behind: the creep just flies the full shove distance
  const S2 = sim("orrin", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  S2.players[1].hero.y = LANE_Y - 200;              // out of the corridor
  const foe2 = dummy(S2, 1, h2.x + 300, LANE_Y, 4000);
  const foe2X = foe2.x;
  castAbility(S2, p2, 0, h2.x + 500, LANE_Y);
  step(S2, 30);
  ok("with nobody behind it the creep flies the full 170", Math.abs(foe2.x - (foe2X + 170)) < 8,
     `${foe2X} -> ${Math.round(foe2.x)}`);
  ok("the bolt pierced on through (still flying or spent down-lane)", !S2.projs.some(pr => pr.siege && pr.x < foe2X),
     "no bolt died on the creep");
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
  ok("all 24 heroes are registered", HERO_IDS.length === 24, `${HERO_IDS.length} heroes`);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
