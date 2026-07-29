// @ts-nocheck
import {
  clamp, clampToLane, dist, walkable
} from '../data/world';
import { applyDot, applySilence, applySlow, applyStun, damage } from './combat';
import { ent, fx } from './create';

export function stepProjectiles(S,dt){
  for (let i=S.projs.length-1;i>=0;i--){
    const pr = S.projs[i];
    if (pr.kind==='atk' || pr.kind==='tower'){
      const tg = ent(S,pr.tid);
      if (!tg || tg.dead){ S.projs.splice(i,1); continue; }
      const dx=tg.x-pr.x, dy=(tg.y-10)-pr.y, d=Math.hypot(dx,dy);
      const step = pr.speed*dt;
      if (d<=step+4){
        const src = ent(S,pr.src);
        damage(S, src, tg, pr.dmg, {attack:pr.kind==='atk', crit:pr.crit});
        if (pr.kind==='atk' && !tg.dead){
          if (pr.rend)  applySlow(tg, .25, 1.5);
          if (pr.chill) applySlow(tg, .20, 1.5);
        }
        fx(S,{t:'hit', x:tg.x, y:tg.y});
        S.projs.splice(i,1); continue;
      }
      pr.x += dx/d*step; pr.y += dy/d*step;
      pr.a = Math.atan2(dy,dx);
    } else {
      pr.x += pr.vx*dt; pr.y += pr.vy*dt; pr.life -= dt;
      pr.a = Math.atan2(pr.vy,pr.vx);
      let hitE = null;
      for (const o of S.ents){
        if (o.dead || o.team===pr.team) continue;
        if (o.type==='tower' && !pr.siege) continue;
        if (pr.hits && pr.hits.indexOf(o.id)>=0) continue;
        if (dist(o.x,o.y,pr.x,pr.y) < o.r + pr.r){ hitE=o; break; }
      }
      if (hitE){
        const src = ent(S,pr.src);
        const amt = pr.dmg * (hitE.type==='tower' ? (pr.twr||1) : 1);
        damage(S, src, hitE, amt, {ability:true});
        if (pr.slow) applySlow(hitE, pr.slow.p, pr.slow.t);
        if (pr.stun) applyStun(S, hitE, pr.stun);
        if (pr.sil)  applySilence(S, hitE, pr.sil);
        if (pr.dot)  applyDot(S, hitE, pr.dot.dps, pr.dot.t, pr.src, pr.dot.stack);
        if (pr.pull && src && !src.dead && !hitE.dead){
          const a = Math.atan2(hitE.y-src.y, hitE.x-src.x);
          const ox=hitE.x, oy=hitE.y;
          hitE.x = src.x + Math.cos(a)*(src.r + hitE.r + 14);
          hitE.y = src.y + Math.sin(a)*(src.r + hitE.r + 14);
          clampToLane(hitE);
          fx(S,{t:'dash', x:ox, y:oy, x2:hitE.x, y2:hitE.y, col:'#ff9b6a'});
        }
        fx(S,{t:'blast', x:pr.x, y:pr.y, r:pr.r*2.2, col:pr.col});
        if (pr.pierce){
          pr.hits.push(hitE.id);
          if (pr.fall){                       // each body it punches through saps the shot
            pr.dmg *= (1 - pr.fall);
            pr.r = Math.max(8, pr.r*0.93);
          }
        }
        else { S.projs.splice(i,1); continue; }
      }
      if (pr.life<=0 || !walkable(pr.x,pr.y)){
        fx(S,{t:'blast', x:pr.x, y:pr.y, r:pr.r*1.5, col:pr.col});
        S.projs.splice(i,1);
      }
    }
  }
}
