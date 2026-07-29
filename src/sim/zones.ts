// @ts-nocheck
import {
  clamp, clampToLane, dist, heal, now
} from '../data/world';
import { sliceAndDice } from './abilities';
import { applyDot, applyRoot, applySlow, applyStun, damage, disjoint } from './combat';
import { ent, fx } from './create';

export function addZone(S,o){ o.id=S.nextId++; S.zones.push(o); return o; }
export function aoe(S, srcTeam, x, y, r, dmgAmt, src, cb){
  let hit = 0;
  for (const o of S.ents){
    if (o.dead || o.team===srcTeam || o.type==='tower') continue;
    if (dist(o.x,o.y,x,y) > r + o.r) continue;
    hit++;
    if (dmgAmt>0) damage(S, src, o, dmgAmt, {ability:true});
    if (cb) cb(o);
  }
  return hit;
}
export function nearestFoe(S, team, x, y, r){
  let best=null, bd=r;
  for (const o of S.ents){
    if (o.dead || o.team===team || o.type==='tower') continue;
    const d = dist(o.x,o.y,x,y);
    if (d<bd){ bd=d; best=o; }
  }
  return best;
}

export function stepZones(S,dt){
  for (let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    z.t -= dt;
    if (z.follow){ const h=ent(S,z.follow); if (h && !h.dead){ z.x=h.x; z.y=h.y; } }
    if (z.kind==='frost'){
      for (const o of S.ents){
        if (o.dead || o.team===z.team || o.type==='tower') continue;
        if (dist(o.x,o.y,z.x,z.y) < z.r) applySlow(o, z.slow, .35);
      }
    } else if (z.kind==='banner'){
      for (const o of S.ents){
        if (o.dead || o.team!==z.team) continue;
        if (dist(o.x,o.y,z.x,z.y) > z.r) continue;
        if (o.type==='creep'){
          o.buffT = Math.max(o.buffT||0, .35);
          o.buffDmg = Math.max(o.buffDmg||0, z.bd);
          o.buffArm = Math.max(o.buffArm||0, z.ba);
          o.buffMs  = Math.max(o.buffMs||0,  z.bm);
        } else if (o.type==='hero'){                 // the banner rallies heroes too
          o.banT = Math.max(o.banT||0, .35);
          o.banDmg = z.bd; o.banArm = z.ba; o.banMs = z.bm;
        }
      }
      z.tickT -= dt;
      if (z.tickT<=0){ z.tickT=.6; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r, col:'#e0c477'}); }
    } else if (z.kind==='echo'){
      if (z.t<=0){
        const q = S.players[z.slot];
        if (q && q.hero) sliceAndDice(S, q, z.ox, z.oy, z.tx, z.ty, z.dmg, true);
        fx(S,{t:'echodash', x:z.ox, y:z.oy, x2:z.tx, y2:z.ty});
      }
    } else if (z.kind==='killingblow'){
      if (z.t<=0){
        const q = S.players[z.slot], e2 = q && q.hero;
        if (e2 && !e2.dead){
          const dx = z.tx-z.ox, dy = z.ty-z.oy;
          const len = Math.hypot(dx,dy) || 1;
          // find the first thing standing on the line right now
          let best=null, bd=1e9;
          for (const o of S.ents){
            if (o.dead || o.team===e2.team || o.type==='tower') continue;
            const t2 = clamp(((o.x-z.ox)*dx + (o.y-z.oy)*dy) / (len*len), 0, 1);
            const px = z.ox + dx*t2, py = z.oy + dy*t2;
            if (dist(px,py,o.x,o.y) > 70 + o.r) continue;
            const along = t2*len;
            if (along < bd){ bd = along; best = o; }
          }
          const stop = best ? Math.max(0, bd - (best.r + e2.r*0.6)) : len;
          e2.x = z.ox + dx/len*stop; e2.y = z.oy + dy/len*stop;
          clampToLane(e2);
          disjoint(S, e2);
          fx(S,{t:'dash', x:z.ox, y:z.oy, x2:e2.x, y2:e2.y, col:'#ffd0d0'});
          if (best){
            const low = best.hp/(best.maxHp||1) < .35;
            fx(S,{t:'exec', x:best.x, y:best.y});
            damage(S, e2, best, z.dmg*(low?3:1), {ability:true});
          }
        }
      }
    } else if (z.kind==='trap'){
      z.arm -= dt;
      if (z.arm<=0){
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type!=='hero') continue;
          if (dist(o.x,o.y,z.x,z.y) > 130) continue;
          fx(S,{t:'blast', x:z.x, y:z.y, r:160, col:'#7fdc6a'});
          damage(S, ent(S,z.src), o, z.dmg, {ability:true});
          applyRoot(S, o, 1.5);
          z.t = 0;                              // sprung
          break;
        }
      }
    } else if (z.kind==='quake' || z.kind==='miasma' || z.kind==='fire' || z.kind==='light' || z.kind==='thicket'){
      z.tickT -= dt;
      const src = ent(S,z.src);
      for (const o of S.ents){
        if (o.dead || o.team===z.team || o.type==='tower') continue;
        if (dist(o.x,o.y,z.x,z.y) < z.r){
          if (z.slow) applySlow(o, z.slow, .3);
          damage(S, src, o, z.dps*dt, {ability:true, silent:true});
        }
      }
      if (z.kind==='light' && src && !src.dead && dist(src.x,src.y,z.x,z.y) < z.r)
        heal(S, src, z.dps*1.2*dt);
      if (z.tickT<=0){ z.tickT=.5; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r,
        col: z.kind==='miasma' ? '#b78cff' : (z.kind==='fire' ? '#ff8a4a' :
             (z.kind==='light' ? '#ffe9a8' : (z.kind==='thicket' ? '#7fdc6a' : '#c8945a')))}); }
    } else if (z.kind==='sanct'){
      for (const q of S.players){                       // Liora's ground heals her side
        if (q.team!==z.team || !q.hero || q.hero.dead) continue;
        if (dist(q.hero.x,q.hero.y,z.x,z.y) < z.r) heal(S, q.hero, z.hps*dt);
      }
      for (const o of S.ents){
        if (o.dead || o.team===z.team || o.type==='tower') continue;
        if (dist(o.x,o.y,z.x,z.y) < z.r) applySlow(o, .30, .3);
      }
      z.tickT -= dt;
      if (z.tickT<=0){ z.tickT=.5; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r, col:'#8affd4'}); }
    } else if (z.kind==='mine'){
      z.arm -= dt;
      if (z.arm<=0){
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type==='tower') continue;
          if (dist(o.x,o.y,z.x,z.y) > z.r) continue;
          fx(S,{t:'blast', x:z.x, y:z.y, r:150, col:'#ff7a3c'});
          aoe(S, z.team, z.x, z.y, 150, z.dmg, ent(S,z.src), o2=> applySlow(o2,.40,2));
          z.t = 0;                              // spent
          break;
        }
      }
    } else if (z.kind==='bomb' && z.t<=0){
      const src = ent(S,z.src);
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col:'#ff7a3c'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, src, o=> applySlow(o,.30,1.5));
    } else if ((z.kind==='azero' || z.kind==='meteor') && z.t<=0){
      const src = ent(S,z.src);
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col: z.kind==='meteor' ? '#ff8a4a' : '#bfe9ff'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, src, o=>{
        if (z.kind==='meteor') applyDot(S, o, z.dmg*0.08, 4, z.src);
        else applyStun(S,o,1.4);
      });
    }
    if (z.t<=0) S.zones.splice(i,1);
  }
}
