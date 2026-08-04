// @ts-nocheck
/* Focused checks on the newer kits — each one asserts the mechanic that
   defines the hero, not just "it did not crash". */
import { newSim, simStep, castAbility, mkEnt, kill, damage,
         buildSnapshot, updateHeroStats } from "../src/sim/engine.ts";
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
  const cap = HEROES.jarak.abilities[1].stacks[3];
  ok("stacks reach the rank-4 cap of 8", stacked === 8 && cap === 8, `fervN=${stacked} cap=${cap}`);
  ok("attack speed actually rose", apsUp > base + 0.4, `${base.toFixed(2)} -> ${apsUp.toFixed(2)}`);
  // melee grip nets +15 AS on top of the stacks (-20 base, +35 from the blade)
  const want = (1 + (15 + cap * HEROES.jarak.abilities[1].val[3]) / 100) / HEROES.jarak.bat;
  ok("aps matches melee grip + 8 stacks at rank 4", Math.abs(apsUp - want) < 0.01, `got ${apsUp.toFixed(3)} want ${want.toFixed(3)}`);
  p.order = { type: "attack", tid: b.id };
  step(S, 40);
  ok("switching target wipes the stacks", h.fervN < stacked, `fervN=${h.fervN}`);
}

console.log("\n== JARAK — Frenzied Charge channels, releases and grants stacks ==");
{
  const S = sim("jarak", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 2, h.x + 300, h.y);            // start the channel
  ok("the channel is running", h.chanT > 0, `chanT=${(h.chanT||0).toFixed(2)}`);
  const x0 = h.x;
  step(S, 150);                                    // full 1.5s channel + the charge itself
  ok("full channel grants full stacks", h.fervN === 4, `fervN=${h.fervN}`);
  ok("the release carried him forward", h.x > x0 + 200, `moved ${(h.x - x0).toFixed(0)}`);
  const S2 = sim("jarak", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  castAbility(S2, p2, 2, h2.x + 300, h2.y);
  step(S2, 20);                                    // a third of a second in
  castAbility(S2, p2, 2, h2.x + 300, h2.y);        // recast releases early
  ok("early release grants fewer stacks", h2.fervN >= 1 && h2.fervN < 4, `fervN=${h2.fervN}`);
  ok("the channel is over", !(h2.chanT > 0), `chanT=${(h2.chanT||0).toFixed(2)}`);
}

console.log("\n== JARAK — charge-granted stacks carry onto the next target ==");
{
  const S = sim("jarak", "vex");
  const p = S.players[0], h = p.hero;
  // build stacks on a first victim so the release has an old target to betray
  const a = dummy(S, 1, h.x + 100, LANE_Y);
  p.order = { type: "attack", tid: a.id };
  step(S, 120);                                    // mid wind-up on the old target is likely here
  castAbility(S, p, 2, h.x + 300, h.y);            // channel...
  p.order = { type: "stop" };                      // the player lets go of the old target
  step(S, 100);                                    // ...runs its full 1s, releases, and the charge lands
  ok("release granted stacks and cleared the target", h.fervN >= 4 && !h.fervTid,
     `fervN=${h.fervN} fervTid=${h.fervTid}`);
  const carried = h.fervN;
  const b = dummy(S, 1, h.x + 60, h.y);
  p.order = { type: "attack", tid: b.id };
  step(S, 60);                                     // a swing or two on the NEW target
  ok("the new target adopted the stacks instead of wiping them",
     h.fervTid === b.id && h.fervN >= carried, `fervN=${h.fervN} carried=${carried}`);
}

console.log("\n== JARAK — Undying Rage purges and refuses to die ==");
{
  const S = sim("jarak", "vex");
  const p = S.players[0], h = p.hero;
  h.stun = 2; h.silT = 2; h.slowT = 3; h.slowP = .4;
  castAbility(S, p, 3, h.x, h.y);
  ok("cast through the stun and purged everything",
     h.stun === 0 && h.silT === 0 && h.slowT === 0,
     `stun=${h.stun} sil=${h.silT} slow=${h.slowT}`);
  ok("the shield is up", h.undyT > 0, `undyT=${(h.undyT||0).toFixed(1)}`);
  h.hp = 50;
  damage(S, null, h, 5000, { pure: true });
  ok("he cannot be killed while it runs", !h.dead && h.hp >= 1, `hp=${Math.round(h.hp)}`);
  step(S, 60 * 5);                                 // 5s — the shield has lapsed
  h.hp = 50;
  damage(S, null, h, 5000, { pure: true });
  ok("once it lapses he dies normally", h.dead, `hp=${Math.round(h.hp)}`);
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

console.log("\n== ZAAL — Arc Lightning bounces from body to body ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;                      // keep the enemy hero out of the jump pool
  const ds = [];
  for (let i = 0; i < 5; i++) ds.push(dummy(S, 1, h.x + 260 + i * 120, LANE_Y + (i % 2 ? 40 : -40)));
  const hp0 = ds.map(d => d.hp);
  castAbility(S, p, 0, ds[0].x, ds[0].y);
  ok("a bouncing bolt was launched", S.zones.some(z => z.kind === "arc"), "");
  step(S, 6);                                      // 0.1s in — one jump, not the whole line
  const early = ds.filter((d, i) => d.hp < hp0[i]).length;
  ok("it does not strike everything at once", early < 5, `${early} of 5 already hit`);
  step(S, 80);
  const hurt = ds.filter((d, i) => d.hp < hp0[i]).length;
  ok("the bolt bounced across several bodies", hurt >= 4, `hit ${hurt} of 5`);
  const dmgs = ds.map((d, i) => hp0[i] - d.hp).filter(v => v > 0).sort((a, b) => b - a);
  ok("damage falls off with each jump", dmgs[0] > dmgs[dmgs.length - 1] * 1.4,
     `first=${dmgs[0].toFixed(0)} last=${dmgs[dmgs.length - 1].toFixed(0)}`);
}

console.log("\n== ZAAL — Lightning Rod parries what touches him and shocks the thrower ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
  const fh = S.players[1].hero;
  fh.x = h.x + 120; fh.y = LANE_Y;
  step(S, 2);
  castAbility(S, p, 2, h.x, h.y);
  ok("he plants himself, rooted and untouchable",
     h.rootT > 1 && h.csT > 1 && h.parryT > 1,
     `root=${h.rootT.toFixed(1)} cs=${h.csT.toFixed(1)} parry=${h.parryT.toFixed(1)}`);
  const zhp = h.hp, fhp = fh.hp;
  damage(S, fh, h, 300, { attack: true });         // a right click into the rod
  ok("the attack was turned aside", h.hp === zhp, `hp=${Math.round(h.hp)}`);
  ok("and the attacker was shocked", fh.hp < fhp, `${Math.round(fhp)} -> ${Math.round(fh.hp)}`);
  ok("and stunned", fh.stun > 0, `stun=${(fh.stun || 0).toFixed(2)}`);
  fh.stun = 0;
  const zhp2 = h.hp, fhp2 = fh.hp;
  damage(S, fh, h, 300, { ability: true });
  ok("a spell is parried the same way", h.hp === zhp2 && fh.hp < fhp2,
     `zaal ${Math.round(h.hp)}, vex ${Math.round(fhp2)} -> ${Math.round(fh.hp)}`);
  const c = dummy(S, 1, h.x + 40, LANE_Y);         // the wave is what punishes him for standing still
  const zhp3 = h.hp;
  damage(S, c, h, 120, { attack: true });
  ok("but a creep's swing still lands", h.hp < zhp3, `${Math.round(zhp3)} -> ${Math.round(h.hp)}`);
  step(S, 60 * 3);
  ok("it lapses after 2s", !(h.parryT > 0) && !(h.rootT > 0),
     `parry=${h.parryT} root=${h.rootT}`);
}

console.log("\n== ZAAL — Lightning Bolt telegraphs for 0.5s, then lands ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
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

console.log("\n== RONIN — Healing Ward pays a share of max health, and only heroes can break it ==");
{
  const S = sim("ronin", "vex");
  const p = S.players[0], h = p.hero;
  step(S, 2);                                      // settle the lvl-12 stat pass
  h.hp = h.maxHp * 0.4;
  castAbility(S, p, 1, h.x + 60, LANE_Y);
  const w = S.ents.find(e => e.ward);
  const hits = HEROES.ronin.abilities[1].val2[3];
  ok("the ward carries rank-scaled hit points", !!w && w.hp === hits, w ? `hp=${w.hp} want ${hits}` : "none");
  ok("a heal field followed it", S.zones.some(z => z.kind === "hward"), "");
  const hp0 = h.hp, pct = HEROES.ronin.abilities[1].val[3] / 100;
  step(S, 120);                                    // 2s standing in it
  ok("it healed a share of his maximum health", h.hp > hp0 + h.maxHp * pct * 1.5,
     `${Math.round(hp0)} -> ${Math.round(h.hp)} at ${(pct * 100).toFixed(1)}%/s of ${Math.round(h.maxHp)}`);
  const c = dummy(S, 1, w.x, w.y);
  damage(S, c, w, 500, { attack: true });
  ok("a creep cannot scratch it", w.hp === hits, `hp=${w.hp}`);
  const foe = S.players[1].hero;
  for (let k = 0; k < hits; k++) damage(S, foe, w, 500, { attack: true });
  ok("an enemy hero takes it down in exactly its hit points", w.dead, `hp=${w.hp}`);
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
  // every cut is a real attack swing plus the rank value as ability damage;
  // only the ability half is blunted by creep resist
  const per = HEROES.ronin.abilities[3].val[2] * CREEP_RESIST + h.dmg;
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
  ok("it runs as a toggle, with no clock ticking", p3.cds[3] === 0, `cd=${p3.cds[3]}`);
  castAbility(S3, p3, 3, h3.x, h3.y);              // press R again
  step(S3, 2);
  ok("pressing R again switches it off and starts the cooldown",
     !S3.zones.some(z => z.kind === "nova") && p3.cds[3] > 5, `cd=${p3.cds[3].toFixed(1)}`);

  const S4 = sim("vosk", "vex");
  const p4 = S4.players[0], h4 = p4.hero;
  dummy(S4, 1, h4.x + 150, LANE_Y);
  castAbility(S4, p4, 3, h4.x, h4.y);
  step(S4, 30);                                    // let the lvl-12 stat pass settle the mana pool
  h4.mp = 0;
  step(S4, 60);
  ok("it also shuts off on its own when the mana runs dry",
     !S4.zones.some(z => z.kind === "nova") && p4.cds[3] > 5, `cd=${p4.cds[3].toFixed(1)}`);
}

console.log("\n== VOSK — Lightning Storm bounces and slows ==");
{
  const S = sim("vosk", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;                      // keep the enemy hero out of the jump pool
  const ds = [];
  for (let i = 0; i < 4; i++) ds.push(dummy(S, 1, h.x + 260 + i * 110, LANE_Y + (i % 2 ? 30 : -30)));
  const hp0 = ds.map(d => d.hp);
  castAbility(S, p, 2, ds[0].x, ds[0].y);
  ok("a bouncing bolt was launched", S.zones.some(z => z.kind === "arc"), "");
  step(S, 40);
  const hurt = ds.filter((d, i) => d.hp < hp0[i]).length;
  ok("the storm bounced between bodies", hurt >= 3, `hit ${hurt} of 4`);
  ok("and slowed what it touched", ds.filter(d => d.slowT > 0).length >= 3,
     `slowed ${ds.filter(d => d.slowT > 0).length}`);
}

console.log("\n== STRYG — Blood Frenzy trades health for attack speed ==");
{
  const S = sim("stryg", "vex");
  const p = S.players[0], h = p.hero;
  step(S, 2);                                      // settle the stat pass
  const hp0 = h.hp, aps0 = h.aps;
  castAbility(S, p, 1, h.x, h.y);
  step(S, 2);
  ok("a quarter of his current health was paid", hp0 - h.hp > hp0 * 0.2,
     `${Math.round(hp0)} -> ${Math.round(h.hp)}`);
  ok("attack speed rose sharply", h.aps > aps0 * 1.5,
     `${aps0.toFixed(2)} -> ${h.aps.toFixed(2)}`);
  step(S, 60 * 7);                                 // the frenzy lapses
  ok("it wears off", Math.abs(h.aps - aps0) < 0.01, `aps=${h.aps.toFixed(2)}`);
}

console.log("\n== GRUK — Shockwave damages, drags and slows ==");
{
  const S = sim("gruk", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 400, LANE_Y);
  const x0 = d.x, hp0 = d.hp;
  castAbility(S, p, 1, d.x, d.y);
  step(S, 40);
  ok("the wave damaged what it rolled over", d.hp < hp0, `${hp0} -> ${Math.round(d.hp)}`);
  ok("and dragged it toward Gruk", d.x < x0 - 30, `x ${x0} -> ${Math.round(d.x)}`);
  ok("and slowed it", d.slowT > 0 && d.slowP > 0.05, `slow ${Math.round((d.slowP||0)*100)}% for ${(d.slowT||0).toFixed(1)}s`);
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
  const perStack = HEROES.ash.abilities[1].val2[3] * CREEP_RESIST;
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
  // the deep stack and the jump off a corpse are innate — Wildfire only decides
  // how hard an ember burns and how often his swings light one
  const S2 = sim("ash", "vex");
  const p2 = S2.players[0]; p2.sk[1] = 0;
  step(S2, 2);
  ok("the six-deep cap is innate", (p2.hero.embCap || 0) === 6, `cap=${p2.hero.embCap}`);
  ok("embers burn at the base rate without Wildfire", p2.hero.embPow === 5, `pow=${p2.hero.embPow}`);
  ok("and his swings light nothing", !(p2.hero.embAtk > 0), `chance=${p2.hero.embAtk || 0}`);
}

console.log("\n== ASH — Wildfire sets his swings alight ==");
{
  const realRandom = Math.random;
  const S = sim("ash", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 200, LANE_Y, 60000);
  p.order = { type: "attack", tid: d.id };
  Math.random = () => 0.0;                         // every swing rolls the proc
  step(S, 180);
  Math.random = realRandom;
  ok("his attacks light embers", d.embN > 0, `embN=${d.embN}`);
  const S2 = sim("ash", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  p2.sk[1] = 0;
  const d2 = dummy(S2, 1, h2.x + 200, LANE_Y, 60000);
  p2.order = { type: "attack", tid: d2.id };
  Math.random = () => 0.0;
  step(S2, 180);
  Math.random = realRandom;
  ok("without Wildfire they never do", !(d2.embN > 0), `embN=${d2.embN || 0}`);
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
  ok("the landing is telegraphed — nobody moved yet",
     brood.every(o => Math.hypot(o.x - tx, o.y - ty) > 130), "");
  step(S, 35);                                     // past the 0.5s telegraph
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
  const foe = S.players[1].hero;
  foe.x = 3200;                                    // clear the chain's flight path
  const d = dummy(S, 1, h.x + 150, LANE_Y - 150);  // in the spin, off the chain's line
  const hp0 = d.hp;
  castAbility(S, p, 0, h.x, h.y);                  // Whirling Death
  ok("the spin chewed the target and slowed it", d.hp < hp0 && d.slowT > 0,
     `${hp0} -> ${Math.round(d.hp)} slowT=${d.slowT.toFixed(1)}`);
  // the chain is thrown, not blinked: it flies to the point, ignoring every
  // unit on the way, and only then reels him in
  const d2 = dummy(S, 1, h.x + 560, LANE_Y + 40);
  const d2hp = d2.hp, hx0 = h.x;
  castAbility(S, p, 1, h.x + 620, LANE_Y + 40);    // Timber Chain
  ok("a chain was thrown and he has not moved yet",
     S.projs.some(q => q.kind === "chain") && Math.abs(h.x - hx0) < 1, `x=${Math.round(h.x)}`);
  step(S, 60);
  ok("the chain reeled him across the lane", h.x > hx0 + 400, `${Math.round(hx0)} -> ${Math.round(h.x)}`);
  ok("and touched nothing on the way", d2.hp === d2hp, `${d2hp} -> ${Math.round(d2.hp)}`);
  step(S, 2);                                      // a stats pass so Reactive Armor is armed
  const arm0 = h.armor;
  for (let k = 0; k < 5; k++) damage(S, foe, h, 10, { attack: true });
  step(S, 2);
  ok("five landed attacks are five armor plates", h.raN === 5, `raN=${h.raN}`);
  ok("and his armor actually rose", h.armor > arm0 + 5*1.3, `${arm0.toFixed(1)} -> ${h.armor.toFixed(1)}`);
  step(S, 60 * 13);                                // let the plates lapse
  ok("the plates fall off after 12s", !(h.raN > 0), `raN=${h.raN}`);
}

console.log("\n== TIMBER — the Chakram flies out, parks, drains, and comes home ==");
{
  const S = sim("timber", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x - 400, LANE_Y);        // behind him, away from the enemy hero
  const dhp0 = d.hp;
  castAbility(S, p, 3, d.x, d.y);
  ok("the blade flies out with no cooldown ticking",
     S.zones.some(z => z.kind === "chakout") && p.cds[3] === 0, `cd=${p.cds[3]}`);
  step(S, 40);                                     // 400 units at 950/s
  ok("it parks where he aimed", S.zones.some(z => z.kind === "chakram"), "");
  ok("and sawed what it passed on the way out", d.hp < dhp0, `${dhp0} -> ${Math.round(d.hp)}`);
  const hp0 = d.hp, mp0 = h.mp;
  step(S, 60);
  ok("it grinds and slows what stands in it", d.hp < hp0 - 30 && d.slowT > 0,
     `${hp0} -> ${Math.round(d.hp)}`);
  ok("and feeds on his mana", h.mp < mp0 - 10, `${Math.round(mp0)} -> ${Math.round(h.mp)}`);
  castAbility(S, p, 3, h.x, h.y);                  // the recall
  ok("R again recalls it", S.zones.some(z => z.kind === "chakret"), "");
  step(S, 90);
  ok("it returns and only then starts the cooldown",
     !S.zones.some(z => z.kind === "chakout" || z.kind === "chakram" || z.kind === "chakret") && p.cds[3] > 5,
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
  ok("the globe flies before it lands — nothing hit yet", d.hp === 4000, `hp=${Math.round(d.hp)}`);
  step(S, 80);                                     // flight to the point + the 0.6s fuse
  ok("and the blast landed after the fuse", Math.abs((4000 - d.hp) - V * CREEP_RESIST) < 3,
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

console.log("\n== ORRIN — Siege Bolt heals the wave, bats theirs down the lane ==");
{
  const S = sim("orrin", "vex");
  const p = S.players[0], h = p.hero;
  const V = HEROES.orrin.abilities[0].val[3];
  // an allied creep in the flight path, wounded
  const ally = dummy(S, 0, h.x + 150, LANE_Y, 4000);
  ally.hp = 1000;
  // an enemy creep further along, with the enemy hero parked well behind it
  const foe = dummy(S, 1, h.x + 300, LANE_Y, 4000);
  const vex = S.players[1].hero;
  vex.x = h.x + 520; vex.y = LANE_Y;
  step(S, 1);                                       // let the lvl-12 stat pass settle hp first
  const vexHp = vex.hp, foeX = foe.x, cs0 = p.cs;
  castAbility(S, p, 0, h.x + 500, LANE_Y);
  step(S, 18);                                      // 0.3s: the bolt has reached the creep
  ok("the allied creep was healed for the full bolt damage", Math.abs(ally.hp - (1000 + V)) < 2,
     `1000 -> ${Math.round(ally.hp)} (V=${V})`);
  ok("the enemy creep took the bolt (less 30% spell resist)",
     Math.abs(foe.hp - (4000 - V * CREEP_RESIST)) < 2, `4000 -> ${Math.round(foe.hp)}`);
  ok("and the bolt was spent on it", !S.projs.some(pr => pr.siege), "");
  ok("the creep is pinned for the wind-up", foe.stun > 0 && S.zones.some(z => z.kind === "bat"),
     `stun=${(foe.stun || 0).toFixed(2)}`);
  ok("and has not moved yet", Math.abs(foe.x - foeX) < 2, `${foeX} -> ${Math.round(foe.x)}`);
  step(S, 60);                                      // wind-up ends, the creep flies into the hero
  ok("then it was batted into the hero and exploded", foe.dead, "");
  ok("the launch ended the bat zone", !S.zones.some(z => z.kind === "bat"), "");
  ok("Corvick got the last hit for it", p.cs === cs0 + 1, `cs ${cs0} -> ${p.cs}`);
  // the explosion carries three times the bolt's damage (mitigated by armor)
  const want = V * 3 * armorMult(vex.armor);
  ok("the hero took the triple-damage blast", Math.abs((vexHp - vex.hp) - want) < 30,
     `took ${Math.round(vexHp - vex.hp)} want ~${Math.round(want)}`);
  // no creep in the way: the bolt hits the hero directly for plain bolt damage
  const S2 = sim("orrin", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  const vex2 = S2.players[1].hero;
  step(S2, 1);
  const vex2Hp = vex2.hp;
  castAbility(S2, p2, 0, vex2.x, vex2.y);
  step(S2, 30);
  const want2 = V * armorMult(vex2.armor);
  ok("a clean bolt hits the hero for plain bolt damage", Math.abs((vex2Hp - vex2.hp) - want2) < 25,
     `took ${Math.round(vex2Hp - vex2.hp)} want ~${Math.round(want2)}`);
  // nothing in the flight line: the batted creep flies until the wall and dies there
  const S3 = sim("orrin", "vex");
  const p3 = S3.players[0], h3 = p3.hero;
  S3.players[1].hero.y = LANE_Y - 200;              // out of the corridor
  const foe3 = dummy(S3, 1, h3.x + 300, LANE_Y, 4000);
  castAbility(S3, p3, 0, h3.x + 500, LANE_Y);
  step(S3, 200);                                    // wind-up + a long flight east
  ok("with nothing in the way the creep explodes on the wall", foe3.dead, "");
  ok("and that bat zone is gone too", !S3.zones.some(z => z.kind === "bat"), "");
}

console.log("\n== ORRIN — turrets shoot his target, scale with spell power, and stack up ==");
{
  const S = sim("orrin", "vex");
  const p = S.players[0], h = p.hero;
  const V = HEROES.orrin.abilities[2].val[3];
  step(S, 1);
  castAbility(S, p, 2, h.x + 120, LANE_Y);
  const t = S.ents.find(o => o.turret && !o.dead);
  ok("the turret is built off the rank value alone", !!t && t.dmg === V, t ? `dmg=${t.dmg} want ${V}` : "none");
  ok("it lasts the rank-4 duration", !!t && Math.abs(t.ttl - 24) < 0.1, t ? `ttl=${t.ttl.toFixed(1)}` : "");
  // spell power reaches the guns already standing
  p.items.push({ id: "orb" });
  step(S, 2);
  ok("spell power raises its damage", t.dmg > V, `${V} -> ${t.dmg} (amp ${h.amp})`);
  ok("his attack damage does not", Math.abs(t.dmg - Math.round(V * (1 + h.amp))) < 1,
     `dmg=${t.dmg} want ${Math.round(V * (1 + h.amp))}`);
  // two bodies in reach: the far one is what Corvick is hitting, so the gun swings to it
  const near = dummy(S, 1, t.x + 60, LANE_Y), far = dummy(S, 1, t.x + 320, LANE_Y);
  h.x = far.x - 100;
  p.order = { type: "attack", tid: far.id };
  step(S, 30);
  ok("the turret fires at whatever Corvick is attacking", t.tid === far.id,
     `turret tid=${t.tid} far=${far.id} near=${near.id}`);
  ok("and the untargeted body is untouched", near.hp === near.maxHp, `near hp=${Math.round(near.hp)}`);
  // the cooldown is shorter than the duration at max rank, so a second gun joins the first
  p.cds[2] = 0;
  castAbility(S, p, 2, h.x + 120, LANE_Y);
  const up = S.ents.filter(o => o.turret && !o.dead).length;
  ok("a maxed Corvick keeps two turrets standing", up === 2, `${up} up`);
  ok("the cooldown is shorter than the duration", HEROES.orrin.abilities[2].cd[3] < 24,
     `cd=${HEROES.orrin.abilities[2].cd[3]} ttl=24`);
}

console.log("\n== ORRIN — Warmarch anchors him as a siege platform ==");
{
  const S = sim("orrin", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;
  step(S, 1);                                       // settle the lvl-12 stat pass
  const baseRange = h.range, baseDmg = h.dmg;
  const V = HEROES.orrin.abilities[3].val[2];
  castAbility(S, p, 3, h.x, h.y);
  step(S, 2);
  ok("siege mode adds 250 attack range", Math.abs(h.range - (baseRange + 250)) < 0.1,
     `${baseRange} -> ${h.range}`);
  ok("and the rank-3 attack damage", Math.abs(h.dmg - (baseDmg + V)) < 0.5,
     `${Math.round(baseDmg)} -> ${Math.round(h.dmg)}`);
  // spell power scales the platform's bonus damage, like his turrets
  p.items.push({ id: "orb" });
  step(S, 2);
  ok("spell power raises the Warmarch bonus",
     Math.abs(h.dmg - (baseDmg + Math.round(V * (1 + h.amp)))) < 0.5,
     `dmg=${Math.round(h.dmg)} want ${Math.round(baseDmg + Math.round(V * (1 + h.amp)))} (amp ${h.amp})`);
  const x0 = h.x;
  p.order = { type: "move", x: h.x + 400, y: LANE_Y };
  step(S, 60);
  ok("he cannot walk while anchored", Math.abs(h.x - x0) < 1, `moved ${Math.abs(h.x - x0).toFixed(1)}`);
  // his shells burst on impact: a body beside the target eats 60% of the hit
  const tgt = dummy(S, 1, h.x + 500, LANE_Y);
  const side = dummy(S, 1, h.x + 500, LANE_Y + 100);
  p.order = { type: "attack", tid: tgt.id };
  step(S, 120);
  const direct = tgt.maxHp - tgt.hp, splash = side.maxHp - side.hp;
  ok("the anchored gun reaches a target 500 out", direct > 0, `direct=${Math.round(direct)}`);
  ok("the shell splashes into the body beside it", splash > 0, `splash=${Math.round(splash)}`);
  ok("at 60% of the direct hit", Math.abs(splash - direct * 0.6) < 2,
     `${Math.round(splash)} vs 60% of ${Math.round(direct)}`);
  step(S, 60 * 10);                                 // the anchor lets go after 10s
  ok("the platform stands down", !(h.wmT > 0) && Math.abs(h.range - baseRange) < 0.1,
     `range back to ${h.range}`);
  p.order = { type: "move", x: h.x + 200, y: LANE_Y };
  const x1 = h.x;
  step(S, 30);
  ok("and he can walk again", Math.abs(h.x - x1) > 50, `moved ${Math.round(Math.abs(h.x - x1))}`);
}

console.log("\n== SABLE — Sidestep rolls, and Deadshot ignores the wave ==");
{
  const S = sim("sable", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;
  const x0 = h.x;
  castAbility(S, p, 2, h.x + 400, LANE_Y);
  step(S, 3);
  ok("Sidestep is a roll, not a blink — she is still on her way", h.x > x0 + 20 && h.x < x0 + 200,
     `+${Math.round(h.x - x0)} after 3 ticks`);
  step(S, 40);
  ok("the roll delivers her the full 400", Math.abs(h.x - (x0 + 400)) < 8, `landed +${Math.round(h.x - x0)}`);
  ok("with the attack-speed buff up", h.asT > 0, `asT=${h.asT.toFixed(1)}`);
  // Deadshot: creeps never block it; the first hero stops it
  const vex = S.players[1].hero;
  vex.x = h.x + 700; vex.y = LANE_Y;
  const creep = dummy(S, 1, h.x + 350, LANE_Y);
  const vHp0 = vex.hp;
  castAbility(S, p, 3, h.x + 1200, LANE_Y);
  step(S, 40);
  ok("Deadshot sails over the creep in the way", creep.hp === creep.maxHp, "");
  ok("and lands on the first hero", vex.hp < vHp0, `took ${Math.round(vHp0 - vex.hp)}`);
}

console.log("\n== SHIV — knives are cheap and fast, and creeps do not sustain rage ==");
{
  const S = sim("shiv", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;
  const Q = HEROES.shiv.abilities[0];
  ok("the recharge scales 7 down to 4 seconds", Q.cd.join("/") === "7/6/5/4", Q.cd.join("/"));
  ok("and casts are spaced 0.9s apart", Q.castGap === 0.9, `castGap=${Q.castGap}`);
  const d = dummy(S, 1, h.x + 300, LANE_Y, 60000);
  castAbility(S, p, 0, d.x, d.y);
  step(S, 30);
  const impact = 60000 - d.hp;
  ok("the impact is the small half of the knife", Math.abs(impact - Q.val[3] * CREEP_RESIST) < 2,
     `took ${Math.round(impact)} want ~${Math.round(Q.val[3] * CREEP_RESIST)}`);
  ok("and it opened a bleed", d.dotT > 0 && Math.abs(d.dotDps - Q.val2[3]) < 0.01,
     `dps=${(d.dotDps || 0).toFixed(1)} want ${Q.val2[3]}`);
  // 0.5s after the first throw the gap is still running: the recast must not fire
  const dpsBefore = d.dotDps;
  castAbility(S, p, 0, d.x, d.y);
  ok("a recast inside the 0.9s gap is refused", Math.abs(d.dotDps - dpsBefore) < 0.01,
     `dps=${d.dotDps.toFixed(1)}`);
  // wait out the gap between throws: the bleed stacks knife by knife
  for (let k = 0; k < 2; k++) { step(S, 30); castAbility(S, p, 0, d.x, d.y); step(S, 30); }
  ok("stacking knives deepen the same bleed", d.dotDps > Q.val2[3] * 2.5,
     `dps=${d.dotDps.toFixed(1)}`);

  // rage: farming builds it, but only a hero on the other end holds off the drain
  const S2 = sim("shiv", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  S2.players[1].hero.x = 3200;
  const c = dummy(S2, 1, h2.x + 80, LANE_Y, 60000);
  p2.order = { type: "attack", tid: c.id };
  step(S2, 60);
  ok("hitting creeps builds rage", h2.rage > 0, `rage=${h2.rage.toFixed(1)}`);
  ok("but creeps never refresh the sustain window", !(h2.rageT > 0), `rageT=${(h2.rageT || 0).toFixed(2)}`);
  step(S2, 300);                                   // five more seconds of farming
  const farmed = h2.rage;
  ok("so farming alone never builds toward full rage", farmed < 40, `rage=${farmed.toFixed(1)}`);

  const S3 = sim("shiv", "vex");
  const p3 = S3.players[0], h3 = p3.hero, fh = S3.players[1].hero;
  fh.x = h3.x + 80; fh.y = LANE_Y;
  S3.players[1].order = { type: "stop" };
  p3.order = { type: "attack", tid: fh.id };
  step(S3, 480);
  ok("fighting a hero holds the window open", h3.rageT > 0, `rageT=${h3.rageT.toFixed(2)}`);
  ok("and rage climbs far past anything farming reaches", h3.rage > farmed + 25,
     `hero ${h3.rage.toFixed(1)} vs creep ${farmed.toFixed(1)}`);
}

console.log("\n== SVAAR — the hammer bursts, the cry charges ==");
{
  const S = sim("svaar", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;
  const onIt = dummy(S, 1, h.x + 400, LANE_Y);
  const beside = dummy(S, 1, h.x + 400, LANE_Y + 110);   // off the flight line, inside the burst
  const away = dummy(S, 1, h.x + 400, LANE_Y - 260);     // well outside it
  castAbility(S, p, 0, onIt.x, onIt.y);
  step(S, 40);
  ok("the hammer struck what it hit", onIt.hp < 4000 && onIt.stun > 0, `stun=${onIt.stun.toFixed(2)}`);
  ok("and burst onto the body beside it", beside.hp < 4000 && beside.stun > 0,
     `${Math.round(beside.hp)} stun=${(beside.stun || 0).toFixed(2)}`);
  ok("but not one standing clear of the blast", away.hp === 4000, `hp=${Math.round(away.hp)}`);

  const S2 = sim("svaar", "vex");
  const p2 = S2.players[0], h2 = p2.hero;
  S2.players[1].hero.x = 3200;
  step(S2, 2);
  const line = dummy(S2, 1, h2.x + 250, LANE_Y, 60000);
  const hx0 = h2.x, plainDmg = h2.dmg;
  castAbility(S2, p2, 1, h2.x + 500, LANE_Y);
  ok("the cry charges his next swing", h2.cryN === 1 && h2.dmg > plainDmg,
     `dmg ${Math.round(plainDmg)} -> ${Math.round(h2.dmg)}`);
  ok("he has not teleported — the charge has to carry him", Math.abs(h2.x - hx0) < 40,
     `x=${Math.round(h2.x)}`);
  step(S2, 40);
  ok("the charge carried him to the cursor", h2.x > hx0 + 400, `${hx0} -> ${Math.round(h2.x)}`);
  ok("cutting what he ran through", line.hp < 60000, `${60000} -> ${Math.round(line.hp)}`);
  const V2 = HEROES.svaar.abilities[1].val2[3] / 100;
  ok("the bonus is the ultimate's, at this rank", Math.abs(h2.cryP - V2) < 1e-9, `cryP=${h2.cryP}`);
  const beforeSwing = line.hp;
  p2.order = { type: "attack", tid: line.id };
  step(S2, 120);
  ok("landing a hit spends the charge", h2.cryN === 0, `cryN=${h2.cryN}`);
  ok("and the swing actually hurt", line.hp < beforeSwing, `${Math.round(beforeSwing)} -> ${Math.round(line.hp)}`);
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
    // a pure-utility ability (all rank values zero, e.g. Timber Chain) may go
    // without a %d placeholder; anything with real numbers must show them
    if (!A.desc.includes("%d") && A.val.some(v => v)) bad.push(id + i + ":desc");
    if (A.passive && !A.grants) bad.push(id + i + ":grants");
    // `scaled` tells the HUD which placeholder to multiply by spell amplification,
    // so it may only name placeholders the description actually has
    if (A.scaled !== undefined){
      if (!/^d?p?$/.test(A.scaled) || !A.scaled) bad.push(id + i + ":scaled");
      else {
        if (A.scaled.includes("p") && (!A.val2 || !A.desc.includes("%p"))) bad.push(id + i + ":scaled-p");
      }
    }
  });
  ok("rank tables and tooltips are well formed", bad.length === 0, bad.join(",") || "ok");

  // The tooltip must show real damage: a hero with spell amp sees the flagged
  // numbers multiplied, and unflagged ones (shields, healing, percentages) left alone.
  const scaledCount = HERO_IDS.reduce((n, id) =>
    n + HEROES[id].abilities.filter(A => A.scaled).length, 0);
  ok("the roster marks amp-scaled ability numbers", scaledCount > 40, `${scaledCount} flagged`);
}

console.log("\n== HUD TOOLTIP — hovering an ability shows what it really deals ==");
{
  const S = newSim(["vex", "ilva"], "1v1");
  const p = S.players[0];
  p.sk = [4, 4, 4, 3]; p.lvl = 12;
  p.items = [{ id: "scepter", cd: 0, bought: 0 }];
  updateHeroStats(S, p);
  const sp = buildSnapshot(S).ps[0].sp;
  ok("the snapshot carries the caster's spell power", typeof sp === "number", `sp=${sp}`);
  const Q = HEROES.vex.abilities[0], E = HEROES.vex.abilities[2];
  ok("Blink Slash is flagged as amp-scaled", Q.scaled === "d", `scaled=${Q.scaled}`);
  ok("Riposte's shield is not", !E.scaled, `scaled=${E.scaled}`);

  // give him real spell amplification and check the number moves with it
  p.hero.amp = 0.25;
  const sp2 = buildSnapshot(S).ps[0].sp;
  ok("spell power tracks the caster's amp", Math.abs(sp2 - 1.25) < 1e-6, `sp=${sp2}`);
  ok("the tooltip number is amplified", Math.round(Q.val[3] * sp2) === 338,
     `${Q.val[3]} -> ${Math.round(Q.val[3] * sp2)}`);
  ok("all 23 heroes are registered", HERO_IDS.length === 23, `${HERO_IDS.length} heroes`);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
