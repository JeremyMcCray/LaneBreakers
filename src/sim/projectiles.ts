// @ts-nocheck
import {
  clamp, clampToLane, dist, heal, walkable
} from '../data/world';
import { addEmber, applyDot, applySilence, applySlow, applyStun, damage } from './combat';
import { addZone, itemBolt } from './zones';
import { cleaveHit } from './attack';
import { ent, fx } from './create';

/* How far past the walls a free-flying shot may live before the wall eats it.
   Ability projectiles spawn 8px above their caster, and a hero pressed flush
   against a wall already stands 10px outside the walkable region, so an
   unpadded test killed every spell cast while hugging the north wall on the
   tick it was fired. The pad covers that gap with a few pixels to spare; a
   shot aimed into a wall still dies, just barely past the wall line. */
const WALL_PAD = 22;

export function stepProjectiles(S,dt){
  for (let i=S.projs.length-1;i>=0;i--){
    const pr = S.projs[i];
    S.tag = pr.tag || (pr.kind==='atk' ? 'atk' : (pr.kind==='tower' ? 'tower' : null));
    if (pr.kind==='atk' || pr.kind==='tower'){
      const tg = ent(S,pr.tid);
      if (!tg || tg.dead){ S.projs.splice(i,1); continue; }
      const dx=tg.x-pr.x, dy=(tg.y-10)-pr.y, d=Math.hypot(dx,dy);
      const step = pr.speed*dt;
      if (d<=step+4){
        const src = ent(S,pr.src);
        // Wildfire — the shot was thrown alight; the embers land before the blow
        if (pr.atkEmb) addEmber(S, tg, pr.atkEmb, src);
        damage(S, src, tg, pr.dmg, {attack:pr.kind==='atk', crit:pr.crit, blame:pr.ps});
        // Warmarch — the siege shell splashes into everything around the target
        if (pr.spl && src && !src.dead && tg.team!==pr.team)
          cleaveHit(S, src, tg, pr.dmg, pr.spl, 'full');
        // Lightning Strike (the item) — the shot was rolled at release; the
        // bolt starts where it lands, even if the attack killed the target
        if (pr.bolt && src) itemBolt(S, src, tg.x, tg.y, pr.bolt);
        if (pr.kind==='atk' && !tg.dead){
          if (pr.rend)  applySlow(tg, .25, 1.5);
          if (pr.chill) applySlow(tg, .20, 1.5);
          if (pr.ven && tg.type!=='tower') applyDot(S, tg, pr.ven, 3, pr.src);  // Bogfang venom
          // Rip and Tear — the shot was thrown at full Fervor and lands twice
          if (pr.twin) damage(S, src, tg, pr.dmg*pr.twin, {attack:true, blame:pr.ps});
        }
        fx(S,{t:'hit', x:tg.x, y:tg.y});
        S.projs.splice(i,1); continue;
      }
      pr.x += dx/d*step; pr.y += dy/d*step;
      pr.a = Math.atan2(dy,dx);
    } else {
      pr.x += pr.vx*dt; pr.y += pr.vy*dt; pr.life -= dt;
      pr.a = Math.atan2(pr.vy,pr.vx);
      // Siege Bolt — the bolt sails over its own wave, mending each creep once
      if (pr.heals) for (const o of S.ents){
        if (o.dead || o.team!==pr.team || o.type!=='creep') continue;
        if (pr.healed.indexOf(o.id)>=0) continue;
        if (dist(o.x,o.y,pr.x,pr.y) < o.r + pr.r){
          pr.healed.push(o.id);
          heal(S, o, Math.round(pr.heals));
          fx(S,{t:'heal', x:o.x, y:o.y});
          if (pr.fall) pr.heals *= (1 - pr.fall);   // each creep mended saps the bolt's balm
        }
      }
      let hitE = null;
      // a ghost shot (Geist's globe) sails over everything and only matters where it lands
      if (!pr.ghost) for (const o of S.ents){
        if (o.dead || o.team===pr.team) continue;
        if (o.type==='tower' && !pr.siege) continue;
        if (pr.heroOnly && o.type!=='hero') continue;   // Deadshot sails over creeps
        if (pr.hits && pr.hits.indexOf(o.id)>=0) continue;
        // a shared volley ledger spends at most one knife per victim — the rest
        // fly past (Shiv's rage volley counts heroes only; `vall` counts everything)
        if (pr.vhits && (pr.vall || o.type==='hero') && pr.vhits.indexOf(o.id)>=0) continue;
        if (dist(o.x,o.y,pr.x,pr.y) < o.r + pr.r){ hitE=o; break; }
      }
      if (hitE){
        if (pr.vhits && (pr.vall || hitE.type==='hero')) pr.vhits.push(hitE.id);
        const src = ent(S,pr.src);
        const amt = pr.dmg * (hitE.type==='tower' ? (pr.twr||1) : 1);
        // embers land BEFORE the blow, so a killing bolt still passes the fire on
        if (pr.emb) addEmber(S, hitE, pr.emb, src);
        damage(S, src, hitE, amt, {ability:true});
        if (pr.slow) applySlow(hitE, pr.slow.p, pr.slow.t);
        if (pr.stun) applyStun(S, hitE, pr.stun);
        if (pr.sil)  applySilence(S, hitE, pr.sil);
        if (pr.dot)  applyDot(S, hitE, pr.dot.dps, pr.dot.t, pr.src, pr.dot.stack);
        // a shot that bursts where it lands — Storm Hammer. Everything else in the
        // blast takes the same damage and the same riders the direct hit did.
        if (pr.burst){
          fx(S,{t:'blast', x:hitE.x, y:hitE.y, r:pr.burst, col:pr.col});
          for (const o of S.ents){
            if (o===hitE || o.dead || o.team===pr.team || o.type==='tower') continue;
            if (dist(o.x,o.y,hitE.x,hitE.y) > pr.burst + o.r) continue;
            damage(S, src, o, amt, {ability:true});
            if (pr.stun) applyStun(S, o, pr.stun);
            if (pr.slow) applySlow(o, pr.slow.p, pr.slow.t);
          }
        }
        // Bloodtrail — a wound worth a fixed slice of the victim, and a beacon
        // the Drifter can recast to step through the blood to
        if (pr.phdot && hitE.type!=='tower' && !hitE.dead){
          applyDot(S, hitE, hitE.maxHp*pr.phdot.pct/pr.phdot.t, pr.phdot.t, pr.src);
          if (pr.bmark){
            const sh = ent(S, pr.src);
            if (sh && !sh.dead){ sh.btId = hitE.id; sh.btT = pr.phdot.t; }
          }
          fx(S,{t:'bleed', x:hitE.x, y:hitE.y});
        }
        // Malice — Geist's curse: everything hits the victim harder for a while
        if (pr.mark && !hitE.dead && hitE.type!=='tower'){
          hitE.markT = pr.mark.t; hitE.markP = pr.mark.p;
          fx(S,{t:'mark', x:hitE.x, y:hitE.y});
        }
        // Baggage Check — the suitcase clamps on; the recall is a delayed zone
        if (pr.lug!==undefined && !hitE.dead && hitE.type!=='tower')
          addZone(S,{kind:'yank', team:pr.team, x:hitE.x, y:hitE.y, r:0, t:0.9,
            tid:hitE.id, slot:pr.lug, tag:pr.tag});
        // Shockwave — everything the wave rolls over is dragged a short step
        // back toward its caster (never past his own body)
        if (pr.drag && src && !src.dead && !hitE.dead && hitE.type!=='tower'){
          const dd = dist(hitE.x, hitE.y, src.x, src.y) || 1;
          const pullD = Math.min(pr.drag, Math.max(0, dd - (src.r + hitE.r + 6)));
          if (pullD > 0){
            hitE.x += (src.x-hitE.x)/dd*pullD;
            hitE.y += (src.y-hitE.y)/dd*pullD;
            clampToLane(hitE);
          }
        }
        if (pr.pull && src && !src.dead && !hitE.dead){
          const a = Math.atan2(hitE.y-src.y, hitE.x-src.x);
          const ox=hitE.x, oy=hitE.y;
          if (src.aghs && src.heroId==='brann' && hitE.type==='hero'){
            // Over the Shoulder — dragged THROUGH Brann, slammed down behind him
            hitE.x = src.x - Math.cos(a)*(src.r + hitE.r + 20);
            hitE.y = src.y - Math.sin(a)*(src.r + hitE.r + 20);
            clampToLane(hitE);
            fx(S,{t:'dash', x:ox, y:oy, x2:hitE.x, y2:hitE.y, col:'#ff9b6a'});
            fx(S,{t:'quake', x:hitE.x, y:hitE.y, r:120});
            damage(S, src, hitE, pr.dmg, {ability:true});
            if (!hitE.dead) applyStun(S, hitE, 1.0);
          } else {
            hitE.x = src.x + Math.cos(a)*(src.r + hitE.r + 14);
            hitE.y = src.y + Math.sin(a)*(src.r + hitE.r + 14);
            clampToLane(hitE);
            fx(S,{t:'dash', x:ox, y:oy, x2:hitE.x, y2:hitE.y, col:'#ff9b6a'});
          }
        }
        fx(S,{t:'blast', x:pr.x, y:pr.y, r:pr.r*2.2, col:pr.col});
        // Siege Bolt — an enemy lane creep spends the bolt: the creep is pinned
        // for the wind-up, then batted down the bolt's flight line to explode on
        // the first enemy thing or wall it meets (the 'bat' zone in zones.ts).
        // Jungle neutrals just take the hit — camps stay parked.
        if (pr.bat && hitE.type==='creep' && !hitE.neutral){
          if (!hitE.dead){
            applyStun(S, hitE, 0.45);
            hitE.batT = 0.45;
            const bs = Math.hypot(pr.vx, pr.vy) || 1, ux = pr.vx/bs, uy = pr.vy/bs;
            addZone(S,{kind:'bat', team:pr.team, x:hitE.x, y:hitE.y, r:0, t:3,
              tid:hitE.id, ux, uy, wind:0.4, mt:0.4,
              tx:hitE.x + ux*420, ty:hitE.y + uy*420,
              dmg:pr.dmg*pr.bat.mult, twr:pr.bat.twr, src:pr.src, tag:pr.tag});
          }
          S.projs.splice(i,1); continue;
        }
        // pierce:true flies through everything; pierce:'creep' flies through
        // creeps but is stopped by the first hero it hits (Jarak's axes)
        else if (pr.pierce && !(pr.pierce==='creep' && hitE.type==='hero')){
          pr.hits.push(hitE.id);
          // Killshot — a kill FEEDS the shot; only survivors sap it
          if (pr.grow && hitE.dead){
            pr.dmg *= 1.4;
            pr.r = Math.min(34, pr.r*1.08);
            fx(S,{t:'buff', x:pr.x, y:pr.y, col:'#eaffb0'});
          } else if (pr.fall){                // each body it punches through saps the shot
            pr.dmg *= (1 - pr.fall);
            pr.r = Math.max(8, pr.r*0.93);
          }
        }
        else { S.projs.splice(i,1); continue; }
      }
      if (pr.life<=0 || !walkable(pr.x,pr.y,WALL_PAD)){
        // Timber Chain flies as a ghost shot and anchors wherever it stops —
        // the target point, or the wall that cut the flight short
        if (pr.reel!==undefined) reelIn(S, pr, pr.x, pr.y);
        // a shot carrying a zone plants it where it stopped (Geist's globe)
        if (pr.plant){
          const z = Object.assign({}, pr.plant);
          z.x = pr.x; z.y = pr.y; z.tag = pr.tag;
          addZone(S, z);
          fx(S,{t:'telegraph', x:z.x, y:z.y, r:z.r, life:z.t, col:pr.col});
        }
        fx(S,{t:'blast', x:pr.x, y:pr.y, r:pr.r*1.5, col:pr.col});
        S.projs.splice(i,1);
      }
    }
  }
  S.tag = null;
}

/* Timber Chain's anchor: the chain has stopped, so hand the reeling itself to a
   charge zone — the same zone Svaar's Battle Cry runs on. The chain's zone
   carries no damage; it only moves the hero. */
function reelIn(S, pr, ax, ay){
  const src = ent(S, pr.src);
  if (!src || src.dead) return;
  const B = {x:ax, y:ay};
  clampToLane(B);
  fx(S,{t:'chain', x:src.x, y:src.y-8, x2:B.x, y2:B.y, col:pr.col});
  addZone(S,{kind:'charge', team:pr.team, x:src.x, y:src.y, tx:B.x, ty:B.y,
    r:110, sp:1500, t:1.2, dmg:0, slot:pr.reel, hits:[], tag:pr.tag});
}

