// @ts-nocheck
import {
  dist, heal
} from '../data/world';
import { ent, fx } from './create';

export function towerShielded(S, tw){
  if (S.hideout) return false;    // the practice tower takes real hits — no wave needed
  for (const o of S.ents){
    if (o.dead || o.type!=='creep' || o.team===tw.team) continue;
    if (dist(o.x,o.y,tw.x,tw.y) < 900) return false;
  }
  return true;
}
function heroThreatForTower(S, tw){
  const allyTeam = tw.team;
  for (const h of S.ents){
    if (h.dead || h.type!=='hero' || h.team===allyTeam) continue;
    const hit = ent(S, h.curTid || h.wTid || h.tid);
    if (hit && hit.type==='hero' && hit.team===allyTeam && dist(tw.x,tw.y,h.x,h.y) <= tw.range){
      return h;
    }
  }
  return null;
}
export function towerThink(S,e,dt){
  e.bd = towerShielded(S,e) ? 1 : 0;    // protection only — a tower never heals
  if (e.heroThreatLockT>0){ e.heroThreatLockT = Math.max(0, e.heroThreatLockT-dt); }
  let tgt = ent(S,e.tid);
  const heroThreat = e.heroThreatLockT<=0 ? heroThreatForTower(S,e) : null;
  if (heroThreat){
    tgt = heroThreat; e.tid = heroThreat.id; e.ramp = 0; e.lockT = 0; e.lockId = 0;
  } else {
    const pull = S.towerAggro && S.towerAggro[e.team];
    if (pull && pull.t>0){
      const pt = ent(S,pull.id);
      if (pt && !pt.dead && !(pt.type==='creep' && pt.team===e.team) && dist(e.x,e.y,pt.x,pt.y) <= e.range){
        tgt = pt; e.tid = pt.id; e.ramp = 0; e.lockT = 0; e.lockId = 0;
      }
    }
  }
  // a target that dies or walks out is dropped properly, id and all
  if (tgt && (tgt.dead || dist(e.x,e.y,tgt.x,tgt.y) > e.range+40)){ tgt=null; e.tid=0; e.ramp=0; e.lockT=0; e.lockId=0; }
  if (!tgt) e.tid = 0;
  if (!tgt){
    if (e.lockT>0){
      e.lockT = Math.max(0, e.lockT-dt);
      if (e.lockT===0 && e.lockId){
        tgt = ent(S,e.lockId);
        if (tgt && !tgt.dead && dist(e.x,e.y,tgt.x,tgt.y) <= e.range){
          e.tid = tgt.id; e.ramp = 0;
        } else {
          e.lockId = 0;
        }
      }
    }
    if (!tgt){
      let best=null, bd=1e9;
      for (const o of S.ents){
        if (o.dead || o.team===e.team || o.type==='tower') continue;
        if (o.ward) continue;                 // towers cannot touch a Healing Ward
        const d = dist(e.x,e.y,o.x,o.y);
        if (d > e.range) continue;
        const score = d;
        if (score<bd){ bd=score; best=o; }
      }
      if (best){
        e.lockId = best.id;
        e.lockT = 0.35;
        tgt = null;
      }
    }
  }
  if (!tgt && e.lockId){
    const locked = ent(S,e.lockId);
    if (locked && !locked.dead && dist(e.x,e.y,locked.x,locked.y) <= e.range){
      tgt = locked;
      e.tid = locked.id;
      e.ramp = 0;
    } else {
      e.lockId = 0;
      e.lockT = 0;
    }
  }
  e.atkCd -= dt;
  if (tgt && e.atkCd<=0){
    e.atkCd = e.bat;
    const dmgMult = tgt.type==='creep' ? 0.7 : 1;
    S.projs.push({id:S.nextId++, kind:'tower', team:e.team, x:e.x, y:e.y-30,
      tid:tgt.id, dmg:e.dmg*(1+e.ramp*0.18)*dmgMult, src:e.id, speed:1100, r:9});
    e.ramp = Math.min(3, e.ramp+1);
    fx(S,{t:'twrfire', x:e.x, y:e.y-30});
  }
}
