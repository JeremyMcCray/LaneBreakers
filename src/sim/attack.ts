// @ts-nocheck
import {
  AUTO_ACQ, CLEAVE_ARC, CLEAVE_R, armorMult, clamp, clampToLane, dist, effArmor, now
} from '../data/world';
import { HEROES } from '../data/heroes';
import { applyDot, applyRoot, applySlow, damage } from './combat';
import { ent, fx } from './create';

export function moveToward(S,e,tx,ty,dt){
  if (e.rootT>0){                       // rooted units still turn and swing, they just cannot walk
    e.facing = Math.atan2(ty-e.y, tx-e.x);
    return true;
  }
  const dx=tx-e.x, dy=ty-e.y, d=Math.hypot(dx,dy);
  if (d<2) return false;
  const sp = e.ms * (e.type!=='hero' && e.slowT>0 ? (1-e.slowP) : 1);
  const step = Math.min(d, sp*dt);
  e.x += dx/d*step; e.y += dy/d*step;
  e.facing = Math.atan2(dy,dx);
  e.moving = true;
  clampToLane(e);
  return true;
}
export function cancelWind(e){
  if (e.windT>0){ e.windT=0; e.wTid=0; e.atkCd=0; }   // full refund — the hit never happened
}
export function attackWith(S,e,tgt,dt){
  e.facing = Math.atan2(tgt.y-e.y, tgt.x-e.x);
  if (e.type==='hero') e.curTid = tgt.id;
  if (e.spinT>0) return;                     // whirling — there is no room to swing
  if (e.windT>0) return;                     // mid wind-up
  if (e.atkCd>0) return;                     // swing recharging (ticks globally now)
  const aps = e.aps || (1/e.bat);
  e.atkCd = 1/aps;
  e.windT = clamp(0.18/aps, 0.06, 0.20);     // short dota-style attack point
  e.wTid  = tgt.id;
}
export function releaseAttack(S,e){
  const tgt = ent(S,e.wTid);
  e.wTid = 0;
  if (!tgt || tgt.dead || e.dead){ e.atkCd = Math.min(e.atkCd, .1); return; }
  const reach = e.range + tgt.r + e.r*0.4 + 45;      // small leeway if they stepped away
  if (dist(e.x,e.y,tgt.x,tgt.y) > reach){ e.atkCd = Math.min(e.atkCd, .1); return; }
  e.facing = Math.atan2(tgt.y-e.y, tgt.x-e.x);
  e.swing = .16;
  // Fervor — consecutive blows on ONE throat wind the next swing up
  if (e.fervMax>0){
    if (e.fervTid===tgt.id) e.fervN = Math.min(e.fervMax, (e.fervN||0) + (e.fervStep||1));
    else { e.fervTid = tgt.id; e.fervN = 0; }
    e.fervT = 4;                             // stacks survive a short break in the chase
  }
  const bonus = e.rendT>0 ? e.rendV : 0;
  let amt = e.dmg + bonus, crit = false;
  if (e.type==='creep' && tgt.type==='creep') amt *= 0.7;   // creeps whittle each other slowly
  if (e.quell>0 && tgt.type==='creep') amt += e.quell;      // Quelling Blade
  if (e.crit>0 && Math.random() < e.crit){ amt *= 1.9; crit = true; }
  if (e.ranged){
    const sp = e.type==='hero' ? (HEROES[e.heroId].projSpeed||900) : 850;
    S.projs.push({id:S.nextId++, kind:'atk', team:e.team, x:e.x, y:e.y-10,
      tid:tgt.id, dmg:amt, src:e.id, speed:sp, r:7,
      ps: e.type==='hero' ? e.slot : (e.oslot!==undefined ? e.oslot : -1),
      rend:e.rendT>0, chill:e.chill>0, crit:crit,
      // Rip and Tear rides the shot out — resolved when it lands
      twin: (e.aghs && e.heroId==='jarak' && e.fervMax>0 && e.fervN>=e.fervMax) ? .5 : 0});
  } else {
    fx(S,{t:'slash', x:e.x, y:e.y, a:e.facing, team:e.team, rng:e.range});
    S.tag = 'atk';
    damage(S, e, tgt, amt, {attack:true, melee:true, crit:crit});
    S.tag = null;
    if (e.cleave>0 && tgt.team!==e.team)                   // melee only, and never on a deny
      cleaveHit(S, e, tgt, amt, e.cleave,
        e.aghs && e.heroId==='svaar' && e.gsT>0);          // Worldbreaker
    if (e.rendT>0)  applySlow(tgt, .25, 1.5);
    if (e.chill>0)  applySlow(tgt, .20, 1.5);
    // Fervor's melee grip: every so often the blade pins whatever it lands on
    if (e.rootChance>0 && tgt.team!==e.team && !tgt.dead && Math.random() < e.rootChance)
      applyRoot(S, tgt, 0.6);
    // scepter on-hit riders
    if (e.aghs && e.type==='hero' && tgt.team!==e.team && !tgt.dead){
      // Rip and Tear — at maximum Fervor every attack lands twice
      if (e.heroId==='jarak' && e.fervMax>0 && e.fervN>=e.fervMax){
        S.tag = 'atk';
        damage(S, e, tgt, amt*0.5, {attack:true, melee:true});
        S.tag = null;
      }
      // Bad Blood — at FULL RAGE every attack opens a serrated wound
      if (e.heroId==='shiv' && e.rageOn && e.rage>=100){
        const prev = S.tag; S.tag = 'i:scepter';
        applyDot(S, tgt, e.dmg*0.15, 5, e.id, true);
        S.tag = prev;
      }
      // Open Wounds — every blow on a Ruptured target counts as 50 units run
      if (e.heroId==='stryg' && tgt.rupT>0){
        damage(S, ent(S,tgt.rupSrc)||e, tgt, 0.5*(tgt.rupV||0), {pure:true, tag:'a3'});
        fx(S,{t:'bleed', x:tgt.x, y:tgt.y});
      }
    }
  }
}
/* The next thing an auto-attacking hero should swing at: closest first,
   creeps ahead of heroes, never buildings, and nothing at all beyond AUTO_ACQ. */
export function autoNext(S, e){
  let best=null, bd=1e9;
  for (const o of S.ents){
    if (o.dead || o.team===e.team) continue;
    if (o.type==='tower') continue;        // never auto-walk yourself into a tower
    const d = dist(e.x,e.y,o.x,o.y);
    if (d > AUTO_ACQ) continue;
    const pri = o.type==='creep' ? 0 : 1;  // creeps first, the enemy hero second
    const sc = pri*5000 + d;
    if (sc<bd){ bd=sc; best=o; }
  }
  return best;
}
/* A cleaving swing splashes into everything in a cone past the target.
   It never touches buildings and never feeds lifesteal a second time.
   `wb` is Svaar's Worldbreaker: the cone opens into a full circle and slows. */
export function cleaveHit(S, src, tgt, raw, pct, wb){
  const swing = Math.atan2(tgt.y-src.y, tgt.x-src.x);
  const arc = wb ? Math.PI : CLEAVE_ARC;
  let hit = 0;
  for (const o of S.ents){
    if (o.dead || o===tgt || o.team===src.team || o.type==='tower') continue;
    if (dist(tgt.x,tgt.y,o.x,o.y) > CLEAVE_R + o.r) continue;
    const a = Math.atan2(o.y-src.y, o.x-src.x);
    let da = Math.abs(((a - swing + Math.PI*3) % (Math.PI*2)) - Math.PI);
    if (da > arc) continue;
    damage(S, src, o, raw*pct, {cleave:true, tag:'cleave'});
    if (wb && !o.dead) applySlow(o, .20, 1);
    hit++;
  }
  if (hit) fx(S,{t:'cleave', x:tgt.x, y:tgt.y, a:swing, team:src.team});
  return hit;
}
/* per-hit damage a hero would deal right now — used for the last-hit preview */
export function previewHit(e, tgt){
  if (tgt.ward) return 1;                        // a ward takes one point per right click
  const bonus = e.rendT>0 ? e.rendV : 0;
  let raw = e.dmg + bonus + (e.quell>0 && tgt.type==='creep' ? e.quell : 0);
  if (e.brT>0)     raw *= (1 + e.brP);           // Bloodrage
  let d = raw * armorMult(effArmor(tgt));
  if (tgt.block>0) d = Math.max(0, d - tgt.block);
  if (tgt.illu)    d *= (tgt.illuTake||1.6);
  if (tgt.markT>0) d *= (1 + tgt.markP);
  if (tgt.vulT>0)  d *= (1 + tgt.vulP);
  if (tgt.drT>0)   d *= (1 - tgt.drP);
  return d;
}
/* damage per second a creep is about to take from creeps and towers targeting it */
export function incomingDps(S,c){
  let dps = 0;
  for (const o of S.ents){
    if (o.dead || o.team===c.team || o.type==='hero') continue;
    if (o.tid===c.id || o.wTid===c.id){
      const aps = o.aps || (1/o.bat);
      let hit = (o.dmg||0)*armorMult(effArmor(c));
      if (o.type==='creep') hit *= 0.7;
      dps += hit*aps;
    }
  }
  return dps;
}
/* Every blow already on its way to this creep, as [damage, seconds-until-impact].
   This is what stops the gold arrow lying to you when a ranged shot is in the air. */
export function imminentHits(S,c){
  const out = [];
  const am = armorMult(effArmor(c));
  for (const pr of S.projs){
    if (pr.tid!==c.id) continue;
    if (pr.kind!=='atk' && pr.kind!=='tower') continue;
    const d = dist(pr.x, pr.y, c.x, c.y);
    out.push([Math.round(pr.dmg*am), Math.round(Math.min(2, d/(pr.speed||900))*100)]);
  }
  for (const o of S.ents){
    if (o.dead || o.team===c.team || o.wTid!==c.id || !(o.windT>0)) continue;
    let hit = (o.dmg||0) + (o.rendT>0 ? o.rendV : 0);
    if (o.type==='creep' && c.type==='creep') hit *= 0.7;
    if (o.quell>0 && c.type==='creep') hit += o.quell;
    let eta = o.windT;
    if (o.ranged){
      const sp = o.type==='hero' ? (HEROES[o.heroId].projSpeed||900) : 850;
      eta += dist(o.x,o.y,c.x,c.y)/sp;
    }
    out.push([Math.round(hit*am), Math.round(Math.min(2,eta)*100)]);
  }
  out.sort((a,b)=>a[1]-b[1]);
  return out.slice(0,6);
}

/* ------------------------------ zones ------------------------------ */
