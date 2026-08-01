// @ts-nocheck
import {
  clamp, clampToLane, dist, heal, now
} from '../data/world';
import { overheal, sliceAndDice } from './abilities';
import { addEmber, applyDot, applyRoot, applySilence, applySlow, applyStun, damage, disjoint } from './combat';
import { ent, fx, spawnBrood } from './create';

export function addZone(S,o){ o.id=S.nextId++; S.zones.push(o); return o; }
/* An explosion or a great door hurls whatever it catches away from a point.
   Marks the target as freshly shoved — Dorn's scepter doors read that mark. */
export function knockback(o, fx0, fy0, d){
  if (o.dead || o.type==='tower' || o.colT>0) return;
  let dx = o.x - fx0, dy = o.y - fy0, dd = Math.hypot(dx,dy);
  if (dd < 1){ const a = Math.random()*Math.PI*2; dx = Math.cos(a); dy = Math.sin(a); dd = 1; }
  o.x += dx/dd*d; o.y += dy/dd*d;
  o.shovedT = 0.5;
  clampToLane(o);
}
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
    S.tag = z.tag || null;                    // whatever laid this down owns what it does
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
            if (o.dead || o.team===e2.team || o.type==='tower' || o.type==='creep') continue;
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
          // Wild Growth — the trap grows back once, three seconds later
          if (z.regrow)
            addZone(S,{kind:'trap', team:z.team, x:z.x, y:z.y, r:z.r, t:48, arm:3,
              dmg:z.dmg, src:z.src, tag:z.tag});
          break;
        }
      }
    } else if (z.kind==='hward'){
      const w = ent(S, z.follow);
      if (!w || w.dead) z.t = 0;                        // shoot the ward, lose the heal
      else {
        for (const q of S.players){
          if (q.team!==z.team || !q.hero || q.hero.dead) continue;
          if (dist(q.hero.x,q.hero.y,z.x,z.y) < z.r) heal(S, q.hero, z.hps*dt);
        }
        z.tickT -= dt;
        if (z.tickT<=0){ z.tickT=.5; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r, col:'#8affd4'}); }
      }
    } else if (z.kind==='omni'){
      const q = S.players[z.slot], h = q && q.hero;
      if (!h || h.dead){ z.t = 0; }
      else {
        z.tickT -= dt;
        if (z.tickT<=0){
          z.tickT = z.iv;
          const pool = [];
          for (const o of S.ents){
            if (o.dead || o.team===h.team || o.type==='tower') continue;
            if (dist(o.x,o.y,z.ax,z.ay) > z.r) continue;
            pool.push(o);
          }
          if (!pool.length){ z.t = 0; h.castLock = 0; h.invT = Math.min(h.invT||0, .2); }
          else {
            const tg = pool[Math.floor(Math.random()*pool.length)];
            const a = Math.random()*Math.PI*2;
            h.x = tg.x + Math.cos(a)*(tg.r + h.r + 8);
            h.y = tg.y + Math.sin(a)*(tg.r + h.r + 8);
            clampToLane(h);
            h.facing = Math.atan2(tg.y-h.y, tg.x-h.x);
            fx(S,{t:'dash', x:z.px, y:z.py, x2:h.x, y2:h.y, col:'#ffd9e8'});
            fx(S,{t:'slash', x:h.x, y:h.y, a:h.facing, team:h.team, rng:h.range});
            z.px = h.x; z.py = h.y;
            // every cut is the flat rank value on top of a full right click.
            // Dance of Death: scepter cuts can land Blade Dance crits, and every
            // crit buys one more cut — the dance runs as long as the blade is hot
            const crit = z.canCrit && h.crit>0 && Math.random() < h.crit;
            damage(S, h, tg, (z.dmg + (h.dmg||0)) * (crit?1.9:1), {ability:true, crit:crit});
            z.n--;
            if (crit && z.ex>0){
              z.ex--; z.n++;
              z.t += z.iv; h.castLock += z.iv; h.invT += z.iv;
            }
            if (z.n<=0){ z.t = 0; h.castLock = 0; h.invT = Math.min(h.invT||0, .2); }
          }
        }
      }
    } else if (z.kind==='edict'){
      z.tickT -= dt;
      if (z.tickT<=0){
        z.tickT = z.iv;
        const pool = [];
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type==='tower') continue;
          if (dist(o.x,o.y,z.x,z.y) > z.r) continue;
          pool.push(o);
        }
        if (pool.length){
          const tg = pool[Math.floor(Math.random()*pool.length)];
          fx(S,{t:'blast', x:tg.x, y:tg.y, r:80, col:'#9b5cff'});
          damage(S, ent(S,z.src), tg, z.dmg, {ability:true});
        }
      }
    } else if (z.kind==='nova'){
      const q = S.players[z.slot], h = q && q.hero;
      if (!h || h.dead){ z.t = 0; }
      else {
        z.tickT -= dt;
        if (z.tickT<=0){
          z.tickT = z.iv;
          if (h.mp < z.cost) z.t = 0;                   // the nova stops when he runs dry
          else {
            h.mp -= z.cost;
            fx(S,{t:'nova', x:z.x, y:z.y, r:z.r});
            let hh = 0;
            aoe(S, z.team, z.x, z.y, z.r, z.dmg, h, o=>{ if (o.type==='hero') hh++; });
            // Perpetual Torment — a pulse that catches a hero pays for itself and feeds him
            if (z.aghs && hh>0){
              h.mp = Math.min(h.maxMp, h.mp + z.cost);
              heal(S, h, 0.3*z.dmg*hh);
              fx(S,{t:'heal', x:h.x, y:h.y});
            }
          }
        }
      }
    } else if (z.kind==='firestorm'){
      const src = ent(S,z.src);
      z.tickT -= dt; z.embT -= dt;
      const feed = z.embT<=0;
      if (feed) z.embT = .5;
      for (const o of S.ents){
        if (o.dead || o.team===z.team || o.type==='tower') continue;
        if (dist(o.x,o.y,z.x,z.y) > z.r) continue;
        damage(S, src, o, z.dps*dt, {ability:true, silent:true});
        o.embHold = 0.6;                              // nothing burns out inside the storm
        if (feed) addEmber(S, o, 1, src);
      }
      if (z.tickT<=0){ z.tickT=.4; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r, col:'#ff8a4a'}); }
    } else if (z.kind==='hive'){
      const q = S.players[z.slot], h = q && q.hero;
      if (!h || h.dead){ z.t = 0; }
      else {
        z.tickT -= dt;
        if (z.tickT<=0){
          z.tickT = z.iv;
          let n = 0;
          for (const o of S.ents) if (!o.dead && o.brood && o.owner===h.id) n++;
          if (n < z.cap){
            const a = Math.random()*Math.PI*2;
            spawnBrood(S, q, h.x+Math.cos(a)*52, h.y+Math.sin(a)*52, 20);
            fx(S,{t:'raise', x:h.x, y:h.y});
          }
        }
      }
    } else if (z.kind==='yank'){
      // Baggage Check — the suitcase is recalled, dragging its holder to Dorn
      if (z.t<=0){
        const tg = ent(S, z.tid), q = S.players[z.slot], h = q && q.hero;
        if (tg && !tg.dead && h && !h.dead){
          const d = dist(tg.x,tg.y,h.x,h.y) || 1;
          const pull = Math.min(320, Math.max(0, d - 60));
          if (pull > 0){
            const ox=tg.x, oy=tg.y;
            tg.x += (h.x-tg.x)/d*pull; tg.y += (h.y-tg.y)/d*pull;
            tg.shovedT = 0.5;
            clampToLane(tg);
            fx(S,{t:'dash', x:ox, y:oy, x2:tg.x, y2:tg.y, col:'#f0e6d2'});
            fx(S,{t:'hit', x:tg.x, y:tg.y});
          }
        }
      }
    } else if (z.kind==='doors'){
      // Service Door — step in one side, out the other
      const port = (u, dx2, dy2, slow)=>{
        const ox=u.x, oy=u.y;
        u.x=dx2; u.y=dy2; clampToLane(u);
        u.doorCd = 1.0;
        disjoint(S, u);
        if (slow) applySlow(u, .30, 1.5);
        fx(S,{t:'dash', x:ox, y:oy, x2:u.x, y2:u.y, col:'#f0e6d2'});
        fx(S,{t:'disjoint', x:u.x, y:u.y});
      };
      for (const q of S.players){
        const u = q.hero;
        if (q.team!==z.team || !u || u.dead) continue;
        const onPad = dist(u.x,u.y,z.x,z.y) < z.r || dist(u.x,u.y,z.tx,z.ty) < z.r;
        // standing on the mat does not bounce you back and forth — the trip
        // only re-arms once you have stepped OFF a door for a beat
        if (u.doorCd>0){ if (onPad) u.doorCd = Math.max(u.doorCd, 0.25); continue; }
        if (u.rootT>0 || !onPad) continue;
        if (dist(u.x,u.y,z.x,z.y) < z.r) port(u, z.tx, z.ty, false);
        else port(u, z.x, z.y, false);
      }
      // Off the Guest List — enemies shoved into a door go through it too
      if (z.aghs){
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type==='tower') continue;
          if (!(o.shovedT>0) || o.doorCd>0) continue;
          if (dist(o.x,o.y,z.x,z.y) < z.r + o.r) port(o, z.tx, z.ty, true);
          else if (dist(o.x,o.y,z.tx,z.ty) < z.r + o.r) port(o, z.x, z.y, true);
        }
      }
    } else if (z.kind==='chakram'){
      // Timbersaw's blade, parked and spinning — fed by his mana until recalled
      const q = S.players[z.slot], h = q && q.hero;
      if (!h || h.dead){ z.t = 0; if (q) q.cds[3] = z.cd; }
      else {
        h.mp -= z.drain*dt;
        if (h.mp <= 0){ h.mp = 0; z.kind = 'chakret'; z.hits = []; }
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type==='tower') continue;
          if (dist(o.x,o.y,z.x,z.y) > z.r + o.r) continue;
          damage(S, ent(S,z.src)||h, o, z.dps*dt, {ability:true, silent:true});
          applySlow(o, .35, .3);
        }
        z.tickT -= dt;
        if (z.tickT<=0){ z.tickT=.45; fx(S,{t:'quake', x:z.x, y:z.y, r:z.r, col:'#d98862'}); }
      }
    } else if (z.kind==='chakret'){
      // the blade coming home — it saws through everything on the way
      const q = S.players[z.slot], h = q && q.hero;
      if (!h || h.dead){ z.t = 0; if (q) q.cds[3] = z.cd; }
      else {
        const d = dist(z.x,z.y,h.x,h.y) || 1;
        const step2 = 950*dt;
        if (d <= step2 + 40){ z.t = 0; q.cds[3] = z.cd; fx(S,{t:'hit', x:h.x, y:h.y}); }
        else { z.x += (h.x-z.x)/d*step2; z.y += (h.y-z.y)/d*step2; }
        for (const o of S.ents){
          if (o.dead || o.team===z.team || o.type==='tower') continue;
          if (z.hits.indexOf(o.id)>=0) continue;
          if (dist(o.x,o.y,z.x,z.y) > 110 + o.r) continue;
          z.hits.push(o.id);
          damage(S, h, o, z.dps*0.8, {ability:true});
        }
      }
    } else if (z.kind==='strike' && z.t<=0){
      const src = ent(S,z.src);
      if (z.bolt) fx(S,{t:'lightning', x:z.x, y:z.y, r:z.r, col:z.col});
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col:z.col||'#bfe9ff'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, src, o=>{
        if (z.stun) applyStun(S,o,z.stun);
        if (z.slow) applySlow(o, z.slow, z.slowT||2);
        if (z.sil)  applySilence(S,o,z.sil);
      });
    } else if (z.kind==='quake' || z.kind==='light' || z.kind==='thicket' || z.kind==='spin'){
      z.tickT -= dt;
      const src = ent(S,z.src);
      // Wild Growth — Thorne's thicket keeps spreading while it lives
      if (z.grow && z.r < z.rMax) z.r = Math.min(z.rMax, z.r + 26*dt);
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
        col: z.kind==='light' ? '#ffe9a8' : (z.kind==='thicket' ? '#7fdc6a' :
             (z.kind==='spin' ? '#ff9ec4' : '#c8945a'))}); }
    } else if (z.kind==='sanct'){
      for (const q of S.players){                       // Liora's ground heals her side
        if (q.team!==z.team || !q.hero || q.hero.dead) continue;
        if (dist(q.hero.x,q.hero.y,z.x,z.y) < z.r) overheal(S, q.hero, z.hps*dt, z.aghs);
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
          aoe(S, z.team, z.x, z.y, 150, z.dmg, ent(S,z.src), o2=>{
            applySlow(o2,.40,2);
            if (z.kb) knockback(o2, z.x, z.y, 150);     // Shock and Awe
          });
          z.t = 0;                              // spent
          break;
        }
      }
    } else if (z.kind==='blastoff' && z.t<=0){
      // the fuse ran out: the launch blast lands where he was standing, then he goes
      const q = S.players[z.slot], h = q && q.hero;
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col:'#ff7a3c'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, h || ent(S,z.src),
          z.kb ? (o=> knockback(o, z.x, z.y, 150)) : undefined);
      if (h && !h.dead){
        h.x = z.tx; h.y = z.ty; clampToLane(h);
        fx(S,{t:'dash', x:z.x, y:z.y, x2:h.x, y2:h.y, col:'#ff7a3c'});
        disjoint(S, h);
      }
    } else if (z.kind==='bomb' && z.t<=0){
      const src = ent(S,z.src);
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col:'#ff7a3c'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, src, o=>{
        applySlow(o,.30,1.5);
        if (z.kb) knockback(o, z.x, z.y, 150);          // Shock and Awe
      });
    } else if (z.kind==='azero' && z.t<=0){
      const src = ent(S,z.src);
      fx(S,{t:'blast', x:z.x, y:z.y, r:z.r, col:'#bfe9ff'});
      aoe(S, z.team, z.x, z.y, z.r, z.dmg, src, o=>{ applyStun(S,o,1.4); });
    }
    if (z.t<=0) S.zones.splice(i,1);
  }
  S.tag = null;
}
