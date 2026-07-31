// @ts-nocheck
import {
  BASE_X, CREEP_ACQ, CREEP_TICK, LANE_Y, TICK, dist, heal
} from '../data/world';
import { attackWith, moveToward } from './attack';
import { ent } from './create';

export function creepAcquire(S,e){
  const ag = S.aggro[e.team];
  let best=null, bestPri=99, bd=1e9;
  for (const o of S.ents){
    if (o.dead || o.team===e.team) continue;
    const d = dist(e.x,e.y,o.x,o.y);
    if (d > CREEP_ACQ) continue;
    let pri;
    if (o.type==='creep') pri = 1;
    else if (o.type==='hero'){
      if (e.noHeroT>0) continue;                    // just shook this creep off
      if (ag && ag.t>0 && ag.id===o.id) pri = 0;    // pulled
      else if (d <= 400) pri = 2;
      else continue;
    }
    else if (o.type==='tower') pri = 3;
    else continue;
    if (pri < bestPri || (pri===bestPri && d < bd)){ bestPri=pri; bd=d; best=o; }
  }
  return best;
}
export function creepThink(S,e,dt){
  if (e.dummy) return;                          // dev sandbox target — never moves, never swings
  if (e.stun>0) return;
  if (e.windT>0) return;
  if (e.noHeroT>0) e.noHeroT -= dt;
  // illusions mirror their owner's target
  e.forceTid = 0;
  if (e.illu){
    const ow = ent(S, e.owner);
    if (ow && !ow.dead && ow.curTid){
      const ot = ent(S, ow.curTid);
      if (ot && !ot.dead && ot.team!==e.team){ e.forceTid = ot.id; e.tid = ot.id; }
    }
  }
  const foeBase = BASE_X[1-e.team];
  let tgt = ent(S, e.tid);
  if (tgt && tgt.dead){ tgt=null; e.tid=0; }
  // leash — a creep chasing a hero only strays so far from where the chase began
  if (tgt && tgt.type==='hero'){
    if (e.leashX===undefined){ e.leashX=e.x; e.leashY=e.y; }
    if (dist(e.x,e.y,e.leashX,e.leashY) > 420 || dist(e.x,e.y,tgt.x,tgt.y) > 620){
      tgt=null; e.tid=0; e.noHeroT=2.5; e.leashX=undefined;
    }
  } else e.leashX=undefined;
  e.acqT = (e.acqT||0) - dt;
  if (e.acqT<=0){
    e.acqT = CREEP_TICK;
    const best = creepAcquire(S,e);
    if (best){
      if (best.id!==e.tid && best.type==='hero'){ e.leashX=e.x; e.leashY=e.y; }
      e.tid=best.id; tgt=best;
    } else if (!tgt || dist(e.x,e.y,tgt.x,tgt.y) > CREEP_ACQ+120){ e.tid=0; tgt=null; }
  }
  if (e.forceTid){ const ft = ent(S,e.forceTid); if (ft && !ft.dead){ e.tid=ft.id; tgt=ft; } }
  if (tgt){
    const d = dist(e.x,e.y,tgt.x,tgt.y);
    const reach = e.range + tgt.r;
    if (d <= reach){ attackWith(S,e,tgt,dt); return; }
    if (e.static) return;                       // turrets never leave their footing
    moveToward(S,e,tgt.x,tgt.y,dt);
  } else {
    if (e.static) return;
    moveToward(S,e, foeBase, LANE_Y + e.laneOff, dt);
  }
}

/* ------------------------------ towers ----------------------------- */
/* Backdoor protection: with no enemy creeps nearby a tower shrugs off almost
   everything and heals back up, so nobody wins by sneaking in alone. */
