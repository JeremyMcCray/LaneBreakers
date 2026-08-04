// @ts-nocheck
import {
  MAX_LEVEL, XP_TABLE
} from '../data/world';
import { HEROES } from '../data/heroes';
import { ITEMS, itemStats } from '../data/items';
import { damage } from './combat';
import { broodStats, fx, symbiosisRank, teamOf, turretDmg } from './create';

export function updateHeroStats(S,p,init){
  const e = p.hero, H = HEROES[p.heroId], l = p.lvl, it = itemStats(p.items);
  // the Ascendant Scepter: one flag the whole sim keys its per-hero upgrades off
  e.aghs = p.items.some(x=>x.id==='scepter');
  e.maxHp = H.hp  + H.hpg *(l-1) + it.hp + e.bonusHp;
  e.maxMp = H.mp  + H.mpg *(l-1) + it.mp;
  e.dmg   = H.dmg + H.dmgg*(l-1) + it.dmg + e.bonusDmg;
  e.armor = H.arm + H.armg*(l-1) + it.arm + (e.armT>0 ? e.armB : 0);
  e.ms    = H.ms + it.ms + (e.msT>0 ? H.ms*e.msP : 0);
  e.range = H.range; e.ranged = H.ranged;
  let asB = it.as + (e.asT>0 ? e.asP : 0);      // attack speed is finished after the passives
  e.ls    = it.ls + (e.lsT>0 ? e.lsP : 0);
  e.sls   = it.sls;                             // Soulweave — abilities feed the caster
  e.thorns= it.thorns; e.cdr = it.cdr; e.hpr = it.hpr; e.mpr = it.mpr;
  e.crit = it.crit; e.chill = it.chill; e.amp = it.amp; e.bolt = it.bolt;
  e.scrit = it.scrit; e.mburn = it.mburn;
  e.block = it.block; e.hcut = it.hcut; e.hcutM = it.hcutM; e.shredOn = it.shred;
  e.cleave = H.ranged ? 0 : it.cleave;          // cleave only applies to melee heroes
  // Passive abilities are applied here as stat bonuses. This checks `grants` rather
  // than `passive` because some abilities (e.g. Fervor) have both an active and a
  // passive component, and the passive must still apply.
  e.fervAs = 0; e.fervMax = 0; e.fervStep = 1; e.thirst = 0;
  e.thirstPct = 0; e.thirstMs = 0; e.rootChance = 0;
  e.reactOn = false; e.raArm = 0; e.lacer = 0;
  for (let i=0;i<4;i++){
    const A = H.abilities[i];
    if (!A.grants || p.sk[i]<=0) continue;
    const PV = A.val[p.sk[i]-1];
    if (A.grants==='cleave' && !H.ranged) e.cleave = Math.max(e.cleave, PV/100);
    else if (A.grants==='crit')   e.crit = Math.min(.80, e.crit + PV/100);
    else if (A.grants==='thirst'){
      e.thirst = PV;                            // flat, and a slice of the pool so it scales
      e.thirstPct = 0.02;
      e.thirstMs = (A.val2 ? A.val2[p.sk[i]-1] : 0)/100;
    }
    else if (A.grants==='fervor'){
      e.fervAs = PV; e.fervMax = A.stacks ? A.stacks[p.sk[i]-1] : 4;
      // the melee grip trades the extra reach for a chance to pin what he is chewing on
      if (!e.stanceR) e.rootChance = (A.val2 ? A.val2[p.sk[i]-1] : 0)/100;
    }
    else if (A.grants==='reactive'){ e.reactOn = true; e.raArm = PV; }
    else if (A.grants==='lacerate'){ e.lacer = PV/100; }   // Drift tears open the bleeding
  }
  // Reactive Armor — being attacked plates Timbersaw up
  if (H.id==='timber'){
    if (!e.reactOn) e.raN = 0;
    else { e.armor += (e.raN||0)*(e.raArm||0); e.hpr = (e.hpr||0) + (e.raN||0)*1.0; }
  }
  // Jarak's Fervor stance: the ranged grip gives up reach for range, and cannot cleave
  if (e.stanceR){ e.ranged = true; e.range = 520; e.cleave = 0; }
  // he traded 20 attack speed away; only the blade grip pays 35 of it back
  if (H.id==='jarak') asB += (e.stanceR ? 0 : 35) - 20;
  // Fervor: stacks earned on one target (or granted at once by Frenzied Charge)
  if (e.fervMax>0){
    e.fervN = Math.min(e.fervN||0, e.fervMax);
    asB += e.fervN * e.fervAs;
  } else { e.fervN = 0; e.fervTid = 0; }
  e.aps = (1 + asB/100) / H.bat;
  if (e.banT>0){ e.dmg += e.banDmg||0; e.armor += e.banArm||0; e.ms += e.banMs||0; }  // War Banner
  if (e.gsT>0) e.dmg *= (1 + e.gsP);            // God's Strength
  // Battle Cry — one charged swing carries the ult's bonus; it never doubles with the ult itself
  else if (e.cryN>0 && e.cryT>0) e.dmg *= (1 + (e.cryP||0));
  if (H.id==='shiv'){
    e.rageOn = true;
    e.deferPct = p.sk[1]>0 ? H.abilities[1].val[p.sk[1]-1]/100 : 0;
    e.bleedHeal = e.aghs ? .35 : 0;             // Bad Blood — his bleeds feed him
  }
  // Deep Freeze: Ilva's ability damage stacks Frostbite (resolved in combat.ts)
  e.frostTouch = (H.id==='ilva' && e.aghs);
  // Ash's EMBERS: six-deep stacks and the jump off a corpse are innate. Wildfire
  // only decides how hard each ember burns and how often his swings light one.
  if (H.id==='ash'){
    const lv = p.sk[1];
    e.embPow    = lv>0 ? H.abilities[1].val2[lv-1] : 5;
    e.embAtk    = lv>0 ? H.abilities[1].val[lv-1]/100 : 0;
    e.embCap    = 6 + (e.aghs ? 2 : 0);               // From the Ashes — eight deep
    e.embSpread = true;
  }
  // Corvick's standing turrets track his spell power and armor, so items he buys
  // after deploying them still reach the guns already on the field
  e.splash = 0;
  if (H.id==='orrin'){
    // Warmarch siege mode: anchored in place, trading mobility for reach and
    // power. The bonus damage scales with his spell power, like his turrets.
    if (e.wmT>0){
      const lv = p.sk[3];
      e.dmg += lv>0 ? Math.round(H.abilities[3].val[lv-1] * (1 + (e.amp||0))) : 0;
      e.range += 250;
      e.ms = 0;
      e.splash = 0.6;
    }
    for (const o of S.ents){
      if (o.dead || !o.turret || o.owner!==e.id) continue;
      o.bdmg = turretDmg(e, o.tv||0);
      o.dmg  = o.bdmg + (o.buffT>0 ? (o.buffDmg||0) : 0);
      o.armor = 2 + Math.round(e.armor*0.5);
    }
  }
  // Symbiosis: the brood is rebuilt from Vhal every tick, so her items reach it
  if (H.id==='vhal'){
    const V = symbiosisRank(p);
    const st = broodStats(e, V);
    const mult = 1 + (e.hiveT>0 ? (e.hiveP||0) : 0);      // Hive Ascendant
    let alive = 0;
    for (const o of S.ents){
      if (o.dead || !o.brood || o.owner!==e.id) continue;
      alive++;
      if (o.maxHp !== st.hp){
        const gain = st.hp - o.maxHp;
        o.maxHp = st.hp;
        o.hp = Math.min(st.hp, o.hp + Math.max(0, gain));  // growing never heals backwards
      }
      // bdmg is the creep's base — write that, or the buff pass overwrites us every frame
      o.bdmg = Math.round(st.dmg * mult);
      o.dmg  = o.bdmg + (o.buffT>0 ? (o.buffDmg||0) : 0);
    }
    e.broodN = alive;
    // Virulent Brood: the flat Symbiosis bonus becomes per-spawnling
    if (V>0 && alive>0){
      if (e.aghs){ e.armor += alive; e.hpr = (e.hpr||0) + 2*alive; }
      else       { e.armor += 5;     e.hpr = (e.hpr||0) + 10; }
    }
  }
  // Thirst: the more beaten up the worst-off enemy hero is, the faster he closes on them.
  // Ramps in from 85% of their health and maxes out at 25%.
  if (e.thirstMs>0){
    let worst = 1;
    for (const q of S.players){
      if (q.team===p.team || !q.hero || q.hero.dead) continue;
      worst = Math.min(worst, q.hero.hp/(q.hero.maxHp||1));
    }
    const t = Math.max(0, Math.min(1, (0.85 - worst)/0.60));
    if (t>0) e.ms += H.ms * e.thirstMs * t;
  }
  e.quell = it.quell * (H.ranged ? 0.5 : 1);
  if (e.slowT>0) e.ms *= (1 - e.slowP);
  if (init){ e.prevMaxHp = e.maxHp; e.prevMaxMp = e.maxMp; return; }
  if (e.maxHp > e.prevMaxHp) e.hp += (e.maxHp - e.prevMaxHp);
  if (e.maxMp > e.prevMaxMp) e.mp += (e.maxMp - e.prevMaxMp);
  e.prevMaxHp = e.maxHp; e.prevMaxMp = e.maxMp;
  e.hp = Math.min(e.hp, e.maxHp); e.mp = Math.min(e.mp, e.maxMp);
}

/* ------------------------------ damage ----------------------------- */

export function netWorth(p){
  let w = p.gold;
  for (const it of p.items)   w += ITEMS[it.id].cost;
  for (const q of p.pending)  w += ITEMS[q.id].cost;
  return w;
}
/* decides a match that hit the time cap: kills, then net worth, then last hits */

export function timeWinner(S){
  const sum = (t, f) => teamOf(S,t).reduce((a,p)=>a+f(p), 0);
  if (S.teamKills[0] !== S.teamKills[1]) return S.teamKills[0] > S.teamKills[1] ? 0 : 1;
  const na = sum(0, netWorth), nb = sum(1, netWorth);
  if (Math.abs(na-nb) > 50) return na > nb ? 0 : 1;
  const ca = sum(0, p=>p.cs), cb = sum(1, p=>p.cs);
  if (ca !== cb) return ca > cb ? 0 : 1;
  return 0;
}

export function endGame(S, team, how){
  if (S.over) return;
  sampleSeries(S);                 // a final point so the graphs run to the whistle
  S.over = true; S.winner = team; S.how = how;
  fx(S,{t:'end', team:team});
}

export function addXp(S,p,amt){
  if (p.lvl>=MAX_LEVEL) return;
  p.xp += amt;
  while (p.lvl<MAX_LEVEL && p.xp >= XP_TABLE[p.lvl+1]){
    p.lvl++; p.points++;
    updateHeroStats(S,p);
    logEvent(S, p, 'lvl', p.lvl);
    if (p.hero){ p.hero.hp = Math.min(p.hero.maxHp, p.hero.hp + 90); fx(S,{t:'lvlup', x:p.hero.x, y:p.hero.y}); }
  }
}

/* ------------------- post-game telemetry ------------------- */
/* Gold that was EARNED, as opposed to the balance in hand. Refunds and the death
   penalty deliberately do not touch it, so the graph reads as income over time. */
export function addGold(p, amt){
  if (!(amt>0)) return;
  p.gold += amt;
  p.goldEarned += amt;
}
export function logEvent(S, p, k, v){
  if (p.events.length >= 500) return;            // a runaway match cannot bloat the payload
  p.events.push({t:Math.round(S.t*10)/10, k:k, v:v});
}
/* One row per player per sample: the shape the post-game graphs are drawn from. */
export function sampleSeries(S){
  for (const p of S.players){
    if (p.series.length >= 400) return;
    p.series.push([
      Math.round(S.t),
      Math.round(p.dmgHero), Math.round(p.dmgAll), Math.round(p.dmgTaken),
      Math.round(p.goldEarned), Math.round(netWorth(p)),
      p.cs, p.kills, p.deaths, p.lvl
    ]);
  }
}
/* index names for the row above — kept beside it so the two never drift */
export const SERIES_KEYS = ['t','dmgHero','dmgAll','dmgTaken','goldEarned','netWorth','cs','kills','deaths','lvl'];
export const SERIES_TICK = 5;

