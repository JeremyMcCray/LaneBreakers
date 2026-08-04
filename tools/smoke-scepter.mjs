// @ts-nocheck
/* The Ascendant Scepter â€” one focused check per hero, asserting the unique
   upgrade actually fires, plus a roster-wide crash fuzz with the item held. */
import { newSim, simStep, castAbility, mkEnt, damage } from "../src/sim/engine.ts";
import { HEROES, HERO_IDS } from "../src/data/heroes.ts";
import { ITEMS } from "../src/data/items.ts";
import { BOT_BUILD } from "../src/ai/bot.ts";
import { LANE_Y } from "../src/data/world.ts";

const TICK = 1 / 60;
const CREEP_RESIST = 0.70;   // creeps shrug off 30% of ability damage (dummies are creeps)
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
};

/* A clean bench: both heroes maxed and parked mid-lane, towers gone, no waves.
   Player 0 holds the Ascendant Scepter unless told otherwise. */
function sim(a, b, noScepter) {
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
    p.hero.x = p.team === 0 ? 1500 : 1900;
    p.hero.y = LANE_Y;
    p.hero.mp = 9999;
  }
  if (!noScepter) S.players[0].items.push({ id: "scepter", cd: 0 });
  simStep(S, TICK); simStep(S, TICK);              // a stat pass so e.aghs lands
  for (const p of S.players){ p.hero.mp = p.hero.maxMp; p.cds = [0,0,0,0]; }
  return S;
}
const step = (S, n) => { for (let i = 0; i < n; i++) simStep(S, TICK); };
function dummy(S, team, x, y, hp) {
  return mkEnt(S, {
    type: "creep", kind: "melee", team, x, y, r: 12, hp: hp || 4000, maxHp: hp || 4000,
    dmg: 0, armor: 0, range: 10, bat: 9, atkCd: 0, ms: 0, ranged: false,
    laneOff: 0, tid: 0, static: true,
  });
}

console.log("\n== ITEM â€” the Scepter itself is wired ==");
{
  ok("scepter exists and is the priciest item in the shop",
     ITEMS.scepter && Object.keys(ITEMS).every(id => ITEMS[id].cost <= ITEMS.scepter.cost),
     `cost=${ITEMS.scepter.cost}g`);
  const missing = HERO_IDS.filter(id => !HEROES[id].scepter || !HEROES[id].scepter.name || !HEROES[id].scepter.desc);
  ok("every hero has a named scepter upgrade", missing.length === 0,
     missing.join(",") || "all " + HERO_IDS.length);
  const S = sim("vex", "ilva");
  ok("holding it sets the aghs flag", S.players[0].hero.aghs === true, "");
  ok("not holding it does not", !S.players[1].hero.aghs, "");
}

console.log("\n== VEX â€” Encore: an Execute kill refunds and resets ==");
{
  const S = sim("vex", "ilva");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 150, LANE_Y, 1);
  p.cds[0] = 5;                                    // Blink Slash mid-cooldown
  const mp0 = h.mp;
  castAbility(S, p, 3, d.x, d.y);
  ok("the target died", d.dead, "");
  ok("Execute came straight back", p.cds[3] === 0, `cd=${p.cds[3]}`);
  ok("Blink Slash reset too", p.cds[0] === 0, `cd=${p.cds[0]}`);
  ok("the mana came back", h.mp >= mp0 - 1, `${Math.round(mp0)} -> ${Math.round(h.mp)}`);
  const S2 = sim("vex", "ilva", true);             // no scepter â€” no encore
  const p2 = S2.players[0];
  const d2 = dummy(S2, 1, p2.hero.x + 150, LANE_Y, 1);
  castAbility(S2, p2, 3, d2.x, d2.y);
  ok("without the scepter the cooldown stays spent", p2.cds[3] > 0, `cd=${p2.cds[3].toFixed(1)}`);
}

console.log("\n== ILVA â€” Deep Freeze: the fourth touch freezes solid ==");
{
  const S = sim("ilva", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 150, LANE_Y);
  castAbility(S, p, 1, h.x, h.y);                  // Rime Nova reaches the dummy
  ok("one ability hit is one Frostbite stack", d.fbN === 1, `fbN=${d.fbN}`);
  for (let k = 0; k < 3; k++){ p.cds[1] = 0; h.mp = h.maxMp; castAbility(S, p, 1, h.x, h.y); }
  ok("the fourth stack shattered", d.fbN === 0 && d.fbCd > 0, `fbN=${d.fbN} cd=${(d.fbCd||0).toFixed(1)}`);
  ok("and froze the victim solid", d.stun > 0, `stun=${d.stun.toFixed(2)}`);
  p.cds[1] = 0; h.mp = h.maxMp; castAbility(S, p, 1, h.x, h.y);
  ok("a thawed target cannot restack yet", d.fbN === 0, `fbN=${d.fbN}`);
}

console.log("\n== GRUK â€” Walking Mountain: Colossus carries Quake ==");
{
  const S = sim("gruk", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 3, h.x, h.y);
  const z = S.zones.find(q => q.kind === "quake" && q.follow === h.id);
  ok("a free Quake walks with him", !!z && Math.abs(z.t - 12) < 0.1, z ? `t=${z.t}` : "none");
  const d = dummy(S, 1, h.x + 150, LANE_Y);
  const hp0 = d.hp;
  step(S, 60);
  ok("it grinds whatever stands near him", d.hp < hp0, `${hp0} -> ${Math.round(d.hp)}`);
  h.mp = h.maxMp;
  castAbility(S, p, 0, h.x + 400, LANE_Y);
  const qcd = HEROES.gruk.abilities[0].cd[3];
  ok("Boulder Toss cools twice as fast under Colossus", p.cds[0] <= qcd * 0.5 + 0.01,
     `cd=${p.cds[0].toFixed(2)} base=${qcd}`);
}

console.log("\n== BRANN â€” Over the Shoulder: hooked heroes land BEHIND him ==");
{
  const S = sim("brann", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 500; foe.y = LANE_Y;
  const hp0 = foe.hp;
  castAbility(S, p, 0, foe.x, foe.y);
  step(S, 40);                                     // hook flight
  ok("the hero was dragged through and past him", foe.x < h.x, `foe.x=${Math.round(foe.x)} brann.x=${Math.round(h.x)}`);
  ok("slammed for the hook damage twice", hp0 - foe.hp > HEROES.brann.abilities[0].val[3] * 1.5,
     `took ${Math.round(hp0 - foe.hp)}`);
  ok("and stunned on impact", foe.stun > 0, `stun=${foe.stun.toFixed(2)}`);
}

console.log("\n== SABLE â€” Killshot: kills feed the shot ==");
{
  const S = sim("sable", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;                      // out of the firing line
  dummy(S, 1, h.x + 300, LANE_Y, 1);
  dummy(S, 1, h.x + 500, LANE_Y, 1);
  const wall = dummy(S, 1, h.x + 800, LANE_Y);
  const hp0 = wall.hp;
  castAbility(S, p, 3, h.x + 900, LANE_Y);
  step(S, 40);
  const V = HEROES.sable.abilities[3].val[2];
  ok("the shot pierced two kills and grew", hp0 - wall.hp > V * 1.5,
     `took ${Math.round(hp0 - wall.hp)}, base ${V}`);
  // without the scepter the shot sails over creeps but stops on the first hero
  const S2 = sim("sable", "vex", true);
  const p2 = S2.players[0];
  const vex = S2.players[1].hero;
  vex.x = p2.hero.x + 600; vex.y = LANE_Y;
  const first = dummy(S2, 1, p2.hero.x + 300, LANE_Y, 1);
  const past = dummy(S2, 1, p2.hero.x + 800, LANE_Y);
  const vHp0 = vex.hp;
  castAbility(S2, p2, 3, p2.hero.x + 900, LANE_Y);
  step(S2, 40);
  ok("without the scepter the creep in the way is untouched", !first.dead && first.hp === first.maxHp, "");
  ok("the shot landed on the hero behind it", vex.hp < vHp0, `took ${Math.round(vHp0 - vex.hp)}`);
  ok("and went no further", past.hp === past.maxHp, "");
}

console.log("\n== VHAL â€” Virulent Brood: spawnlings burst on death ==");
{
  const S = sim("vhal", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 0, h.x, h.y);
  const brood = S.ents.filter(o => o.brood && o.owner === h.id);
  ok("the brood is out", brood.length === 5, `${brood.length}`);
  const d = dummy(S, 1, brood[0].x + 60, brood[0].y);
  const hp0 = d.hp;
  brood[0].hp = 5;
  damage(S, d, brood[0], 500, {attack:true, pure:true});   // enemy lands the killing blow
  ok("the corpse burst on the enemy beside it", d.hp < hp0, `${hp0} -> ${Math.round(d.hp)}`);
  ok("and the venom slowed them", d.slowT > 0, `slowT=${d.slowT.toFixed(1)}`);
  step(S, 2);
  const bare = HEROES.vhal.arm + HEROES.vhal.armg * 11;
  const alive = S.ents.filter(o => o.brood && o.owner === h.id && !o.dead).length;
  ok("Symbiosis armor now counts heads", Math.abs(h.armor - (bare + alive)) < 0.6,
     `armor=${h.armor.toFixed(1)} bare=${bare.toFixed(1)} alive=${alive}`);
}

console.log("\n== ASH â€” From the Ashes: eight embers, and heroes erupt ==");
{
  const S = sim("ash", "vex");
  const p = S.players[0], h = p.hero;
  ok("the ember cap rose to eight", h.embCap === 8, `cap=${h.embCap}`);
  const foe = S.players[1].hero;
  foe.x = h.x + 300; foe.y = LANE_Y;
  castAbility(S, p, 0, foe.x, foe.y);
  step(S, 30);
  ok("the enemy hero is burning", foe.embN > 0, `embN=${foe.embN}`);
  foe.hp = 1;
  step(S, 40);                                     // the burn finishes them
  ok("they died still alight", foe.dead, "");
  ok("and a free Firestorm erupted on the corpse",
     S.zones.some(z => z.kind === "firestorm" && z.tag === "i:scepter"), "");
}

console.log("\n== ORRIN â€” Legs for the Guns: turrets march ==");
{
  const S = sim("orrin", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;                      // nothing in range â€” the turret has to march
  castAbility(S, p, 2, h.x + 200, LANE_Y);
  const t = S.ents.find(o => o.turret && !o.dead);
  ok("the turret has legs", !!t && !t.static && t.ms > 0, t ? `ms=${t.ms}` : "none");
  const baseTtl = [12, 16, 20, 24][p.sk[2] - 1];
  ok("and a longer service life", !!t && Math.abs(t.ttl - (baseTtl + 8)) < 0.1, t ? `ttl=${t.ttl.toFixed(1)}` : "");
  const x0 = t.x;
  step(S, 120);
  ok("it actually walks the lane", Math.abs(t.x - x0) > 100, `moved ${Math.round(Math.abs(t.x - x0))}`);
  const S2 = sim("orrin", "vex", true);
  castAbility(S2, S2.players[0], 2, S2.players[0].hero.x + 200, LANE_Y);
  const t2 = S2.ents.find(o => o.turret && !o.dead);
  ok("without the scepter it stays put", !!t2 && t2.static && t2.ms === 0, "");
}

console.log("\n== NIX â€” Hall of Mirrors: blinks leave an illusion behind ==");
{
  const S = sim("nix", "vex");
  const p = S.players[0], h = p.hero;
  const ox = h.x, oy = h.y;
  castAbility(S, p, 1, h.x + 600, LANE_Y);         // Displace with no illusions = raw blink
  let ill = S.ents.filter(o => o.illu && o.team === 0 && !o.dead);
  ok("Displace left a copy at her origin", ill.length === 1 && Math.hypot(ill[0].x - ox, ill[0].y - oy) < 40,
     `${ill.length} illusions`);
  const px = h.x, py = h.y;
  castAbility(S, p, 2, h.x + 300, LANE_Y);         // Phantom Strike
  step(S, 32);                                     // past the 0.45s telegraph
  ill = S.ents.filter(o => o.illu && o.team === 0 && !o.dead);
  ok("Phantom Strike left another", ill.length >= 2, `${ill.length} illusions`);
}

console.log("\n== THORNE â€” Wild Growth: thickets spread, traps regrow ==");
{
  const S = sim("thorne", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 2, h.x + 300, LANE_Y);
  const z = S.zones.find(q => q.kind === "thicket");
  const r0 = z.r;
  step(S, 120);
  ok("the thicket keeps spreading", z.r > r0 + 30, `${r0} -> ${Math.round(z.r)}`);
  castAbility(S, p, 0, h.x + 600, LANE_Y);
  const trap = S.zones.find(q => q.kind === "trap");
  const foe = S.players[1].hero;
  foe.x = trap.x; foe.y = trap.y;
  step(S, 90);                                     // arm + spring
  const regrown = S.zones.find(q => q.kind === "trap");
  ok("the sprung trap grew back on its own", !!regrown && regrown.arm > 1, regrown ? `arm=${regrown.arm.toFixed(1)}` : "gone");
}

console.log("\n== KRELL â€” Void Feedback: enemy casts feed his clock ==");
{
  const S = sim("krell", "vex");
  const kp = S.players[0], vp = S.players[1];
  kp.cds = [5, 5, 5, 5];
  const vh = vp.hero;
  const mp0 = vh.mp, hp0 = vh.hp;
  castAbility(S, vp, 1, vh.x, vh.y);               // Vex casts Bladestorm nearby
  const manaCost = HEROES.vex.abilities[1].mana[3];
  ok("the cast cost 40 extra mana", vh.mp <= mp0 - manaCost - 40 + 1,
     `mp ${Math.round(mp0)} -> ${Math.round(vh.mp)}`);
  ok("dealt back as damage", vh.hp < hp0, `${Math.round(hp0)} -> ${Math.round(vh.hp)}`);
  ok("and wound all of Krell's cooldowns", kp.cds.every(c => Math.abs(c - 4) < 0.1),
     kp.cds.map(c => c.toFixed(1)).join("/"));
}

console.log("\n== SHIV â€” Bad Blood: bleeds heal him, rage attacks cut ==");
{
  const S = sim("shiv", "vex");
  const p = S.players[0], h = p.hero;
  step(S, 2);
  ok("his bleeds now feed him", h.bleedHeal === 0.35, `bleedHeal=${h.bleedHeal}`);
  const d = dummy(S, 1, h.x + 80, LANE_Y);
  h.rage = 100; h.rageT = 30;
  p.order = { type: "attack", tid: d.id };
  step(S, 60);
  ok("full-rage attacks opened a wound", d.dotT > 0, `dotT=${(d.dotT||0).toFixed(1)}`);
  h.hp = h.maxHp * 0.3;
  const hp0 = h.hp;
  p.order = { type: "stop" };
  h.rage = 0;                                      // stop swinging, let the dot tick
  step(S, 120);
  ok("the wound healed him as it bled", h.hp > hp0, `${Math.round(hp0)} -> ${Math.round(h.hp)}`);
}

console.log("\n== SVAAR â€” Worldbreaker: full-circle cleave under the ult ==");
{
  const S = sim("svaar", "vex");
  const p = S.players[0], h = p.hero;
  const front = dummy(S, 1, h.x + 120, LANE_Y);
  const behind = dummy(S, 1, h.x - 30, LANE_Y);    // inside cleave range of the target, behind him
  castAbility(S, p, 3, h.x, h.y);                  // God's Strength
  const b0 = behind.hp;
  p.order = { type: "attack", tid: front.id };
  step(S, 90);
  ok("the swing wrecked what stood BEHIND him", behind.hp < b0, `${b0} -> ${Math.round(behind.hp)}`);
  ok("and slowed it", behind.slowT > 0, `slowT=${behind.slowT.toFixed(1)}`);
  const S2 = sim("svaar", "vex", true);
  const p2 = S2.players[0], h2 = p2.hero;
  const front2 = dummy(S2, 1, h2.x + 120, LANE_Y);
  const behind2 = dummy(S2, 1, h2.x - 30, LANE_Y);
  castAbility(S2, p2, 3, h2.x, h2.y);
  const c0 = behind2.hp;
  p2.order = { type: "attack", tid: front2.id };
  step(S2, 90);
  ok("without the scepter the cone stays a cone", behind2.hp === c0, "");
}

console.log("\n== GEIST â€” Blood Dividend: a bomb that finds heroes repays the flesh ==");
{
  const S = sim("geist", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 300; foe.y = LANE_Y;
  h.hp = h.maxHp;
  const hp0 = h.hp;
  castAbility(S, p, 0, foe.x, foe.y);              // Essence Bomb dead on a hero
  step(S, 75);                                     // flight + the 0.6s fuse
  ok("the health cost came straight back (plus 60 a head)", h.hp >= hp0 - 1,
     `${Math.round(hp0)} -> ${Math.round(h.hp)}`);
  const S2 = sim("geist", "vex", true);
  const p2 = S2.players[0], h2 = p2.hero, foe2 = S2.players[1].hero;
  foe2.x = h2.x + 300; foe2.y = LANE_Y;
  h2.hp = h2.maxHp;
  const hp2 = h2.hp;
  castAbility(S2, p2, 0, foe2.x, foe2.y);
  ok("without the scepter the flesh stays spent", h2.hp <= hp2 - h2.maxHp * 0.07 + 1,
     `${Math.round(hp2)} -> ${Math.round(h2.hp)}`);
}

console.log("\n== DREX â€” Shock and Awe: explosions throw people ==");
{
  const S = sim("drex", "vex");
  const p = S.players[0], h = p.hero;
  const d = dummy(S, 1, h.x + 400, LANE_Y);
  castAbility(S, p, 0, d.x, d.y);                  // Sticky Bomb dead on top of it
  step(S, 70);                                     // past the 0.9s fuse
  const thrown = Math.hypot(d.x - (h.x + 400), d.y - LANE_Y);
  ok("the blast hurled the target away", thrown > 100, `thrown ${Math.round(thrown)} units`);
}

console.log("\n== RONIN â€” Dance of Death: crits extend the ult ==");
{
  const S = sim("ronin", "vex");
  const p = S.players[0], h = p.hero;
  S.players[1].hero.x = 3200;
  const d = dummy(S, 1, h.x + 200, LANE_Y, 30000);
  const hp0 = d.hp;
  const realRandom = Math.random;
  Math.random = () => 0.0;                         // every cut crits on the bench
  castAbility(S, p, 3, d.x, d.y);
  step(S, 240);
  Math.random = realRandom;
  // each cut is a full attack swing plus the rank value as ability damage;
  // the scepter's +10% ability amp and creep resist apply to the ability half only
  const per = (HEROES.ronin.abilities[3].val[2] * (1 + h.amp) * CREEP_RESIST + h.dmg) * 1.9;
  const cuts = (hp0 - d.hp) / per;
  ok("all four bonus cuts were earned", Math.abs(cuts - 10) < 0.2, `~${cuts.toFixed(1)} crit cuts`);
  const S2 = sim("ronin", "vex", true);
  S2.players[1].hero.x = 3200;
  const p2 = S2.players[0];
  const d2 = dummy(S2, 1, p2.hero.x + 200, LANE_Y, 30000);
  const h20 = d2.hp;
  Math.random = () => 0.0;
  castAbility(S2, p2, 3, d2.x, d2.y);
  step(S2, 240);
  Math.random = realRandom;
  const base = HEROES.ronin.abilities[3].val[2] * CREEP_RESIST + p2.hero.dmg;
  ok("without the scepter it is six plain cuts", Math.abs((h20 - d2.hp) - base * 6) < 2,
     `took ${Math.round(h20 - d2.hp)} want ${Math.round(base*6)}`);
}

console.log("\n== ZAAL â€” The Sky Remembers: a second bolt follows the ult ==");
{
  const S = sim("zaal", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  castAbility(S, p, 3, h.x, h.y);
  const z = S.zones.find(q => q.kind === "strike" && q.tag === "i:scepter");
  ok("a follow-up bolt was marked on the ground", !!z && Math.abs(z.t - 1.5) < 0.02, z ? `t=${z.t}` : "none");
  const hp1 = foe.hp;                              // after the ult strike itself
  step(S, 100);                                    // past the 1.5s telegraph
  ok("it landed on whoever stood still", foe.hp < hp1, `${Math.round(hp1)} -> ${Math.round(foe.hp)}`);
}

console.log("\n== JARAK â€” Rip and Tear: max Fervor lands twice ==");
{
  const bench = withScepter => {
    const S = sim("jarak", "vex", !withScepter);
    const p = S.players[0], h = p.hero;
    const d = dummy(S, 1, h.x + 100, LANE_Y, 30000);
    p.order = { type: "attack", tid: d.id };
    step(S, 240);                                  // ramp the stacks
    const hp0 = d.hp;
    step(S, 240);                                  // measure at full Fervor
    return hp0 - d.hp;
  };
  const plain = bench(false), torn = bench(true);
  ok("full-Fervor damage jumped by roughly half", torn > plain * 1.3,
     `${Math.round(plain)} -> ${Math.round(torn)} over 4s`);
}

console.log("\n== STRYG â€” Open Wounds: attacks tear a Rupture ==");
{
  const S = sim("stryg", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 120; foe.y = LANE_Y;
  S.players[1].order = { type: "stop" };
  p.order = { type: "attack", tid: foe.id };
  step(S, 120);
  const plainLoss = foe.maxHp - foe.hp;
  foe.hp = foe.maxHp;
  castAbility(S, p, 3, foe.x, foe.y);
  ok("the rupture landed", foe.rupT > 0, `rupT=${(foe.rupT||0).toFixed(1)}`);
  p.order = { type: "attack", tid: foe.id };
  step(S, 120);
  const tornLoss = foe.maxHp - foe.hp;
  ok("attacking a Ruptured, STATIONARY target bleeds extra", tornLoss > plainLoss + 25,
     `${Math.round(plainLoss)} -> ${Math.round(tornLoss)} over 2s`);
}

console.log("\n== VOSK â€” Perpetual Torment: pulses pay for themselves ==");
{
  const S = sim("vosk", "vex");
  const p = S.players[0], h = p.hero;
  const foe = S.players[1].hero;
  foe.x = h.x + 150; foe.y = LANE_Y;
  S.players[1].order = { type: "stop" };
  h.hp = h.maxHp * 0.4;
  castAbility(S, p, 3, h.x, h.y);
  const mp0 = h.mp, hp0 = h.hp, healed0 = p.healed;
  step(S, 200);                                    // ~4 pulses, every one catching the hero
  ok("mana barely moved while a hero was caught", h.mp > mp0 - 30,
     `mp ${Math.round(mp0)} -> ${Math.round(h.mp)}`);
  ok("and the pulses fed him", p.healed > healed0 + 50, `healed ${Math.round(p.healed - healed0)}`);
  const S2 = sim("vosk", "vex", true);
  const p2 = S2.players[0], h2 = p2.hero;
  S2.players[1].hero.x = h2.x + 150;
  castAbility(S2, p2, 3, h2.x, h2.y);
  const m20 = h2.mp;
  step(S2, 200);
  ok("without the scepter the pulses still bill him", h2.mp < m20 - 40,
     `mp ${Math.round(m20)} -> ${Math.round(h2.mp)}`);
}

console.log("\n== DORN â€” Off the Guest List: the shoved go through his doors ==");
{
  const S = sim("dorn", "vex");
  const p = S.players[0], h = p.hero;
  const ax = h.x;                                  // door A stands here â€” Dorn himself may travel
  castAbility(S, p, 2, ax + 340, LANE_Y);          // far door at +340
  const d = dummy(S, 1, ax + 80, LANE_Y);          // in front â€” Q shoves it ~260 onto the far door
  castAbility(S, p, 0, d.x, d.y);
  step(S, 5);
  ok("the shoved enemy was pulled through the door", Math.abs(d.x - ax) < 70,
     `landed at ${Math.round(d.x)}, near-side door at ${Math.round(ax)}`);
  ok("and dumped out slowed", d.slowT > 0, `slowT=${(d.slowT||0).toFixed(1)}`);
  const S2 = sim("dorn", "vex", true);             // no scepter â€” doors check the guest list
  const p2 = S2.players[0], h2 = p2.hero;
  const ax2 = h2.x;
  castAbility(S2, p2, 2, ax2 + 340, LANE_Y);
  const d2 = dummy(S2, 1, ax2 + 80, LANE_Y);
  castAbility(S2, p2, 0, d2.x, d2.y);
  step(S2, 5);
  ok("without the scepter the door refuses them", Math.abs(d2.x - (ax2 + 340)) < 90,
     `stayed at ${Math.round(d2.x)}, far door at ${Math.round(ax2 + 340)}`);
}

console.log("\n== TIMBER â€” Second Chakram: two blades in the field ==");
{
  const S = sim("timber", "vex");
  const p = S.players[0], h = p.hero;
  castAbility(S, p, 3, h.x - 400, LANE_Y);
  h.mp = h.maxMp; p.cds[3] = 0;
  castAbility(S, p, 3, h.x - 200, LANE_Y + 60);
  ok("two chakrams deployed at once",
     S.zones.filter(z => z.kind === "chakout" || z.kind === "chakram").length === 2, "");
  castAbility(S, p, 3, h.x, h.y);                  // third press = recall everything
  ok("the third press recalls both", S.zones.filter(z => z.kind === "chakret").length === 2, "");
  step(S, 90);
  ok("both came home and the cooldown started",
     !S.zones.some(z => z.kind === "chakout" || z.kind === "chakram" || z.kind === "chakret") &&
     p.cds[3] > 5, `cd=${p.cds[3].toFixed(1)}`);
  const S2 = sim("timber", "vex", true);           // no scepter â€” one blade only
  const p2 = S2.players[0], h2 = p2.hero;
  castAbility(S2, p2, 3, h2.x - 400, LANE_Y);
  h2.mp = h2.maxMp;
  castAbility(S2, p2, 3, h2.x - 200, LANE_Y);      // second press must be the recall
  ok("without the scepter the second press recalls", S2.zones.some(z => z.kind === "chakret") &&
     !S2.zones.some(z => z.kind === "chakout" || z.kind === "chakram"), "");
}

console.log("\n== DRIFT â€” Pitch Black: the dark gets teeth ==");
{
  const S = sim("drift", "vex");
  const p = S.players[0], foe = S.players[1].hero;
  castAbility(S, p, 3, p.hero.x, p.hero.y);        // Blackout
  ok("the enemy is night-blind", foe.blindT > 4, `blindT=${(foe.blindT||0).toFixed(1)}`);
  ok("and slowed for the whole duration", foe.slowT > 4 && foe.slowP >= 0.25,
     `slowT=${(foe.slowT||0).toFixed(1)} slowP=${foe.slowP}`);
  const hp0 = foe.hp;
  damage(S, p.hero, foe, 100, { pure: true });
  ok("his blows land 20% harder on the night-blind", Math.abs((hp0 - foe.hp) - 120) < 2,
     `dealt ${Math.round(hp0 - foe.hp)}/120`);
  const S2 = sim("drift", "vex", true);
  const foe2 = S2.players[1].hero;
  castAbility(S2, S2.players[0], 3, S2.players[0].hero.x, S2.players[0].hero.y);
  ok("without the scepter the dark blinds but does not slow", foe2.blindT > 4 && !(foe2.slowT > 0),
     `blindT=${(foe2.blindT||0).toFixed(1)} slowT=${(foe2.slowT||0).toFixed(1)}`);
}

console.log("\n== ROSTER â€” every hero can rampage with the scepter and nothing breaks ==");
{
  let crashed = "";
  for (const id of HERO_IDS) {
    try {
      const S = sim(id, id === "vex" ? "ilva" : "vex");
      const p = S.players[0], h = p.hero;
      p.devFree = true;
      const foe = S.players[1].hero;
      dummy(S, 1, h.x + 200, LANE_Y);
      dummy(S, 1, h.x + 350, LANE_Y + 60);
      for (let t = 0; t < 600; t++) {
        if (t % 40 === 0) for (let k = 0; k < 4; k++) castAbility(S, p, k, foe.x, foe.y);
        if (t % 90 === 0 && !foe.dead) p.order = { type: "attack", tid: foe.id };
        simStep(S, TICK);
      }
      if (!isFinite(h.hp) || !isFinite(h.x) || !isFinite(h.mp)) crashed += id + ":NaN ";
    } catch (err) { crashed += id + ":" + err.message + " "; }
  }
  ok("all " + HERO_IDS.length + " heroes survived a 10s scepter rampage", crashed === "", crashed || "clean");
  const noBuild = HERO_IDS.filter(id => !(BOT_BUILD[id] || []).includes("scepter"));
  ok("every bot build saves for the scepter", noBuild.length === 0,
     noBuild.join(",") || "all " + HERO_IDS.length);
}

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
