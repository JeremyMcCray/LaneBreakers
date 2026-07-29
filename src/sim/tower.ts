// @ts-nocheck
import {
  dist, heal
} from '../data/world';
import { ent, fx } from './create';

export function towerShielded(S, tw){
  for (const o of S.ents){
    if (o.dead || o.type!=='creep' || o.team===tw.team) continue;
    if (dist(o.x,o.y,tw.x,tw.y) < 900) return false;
  }
  return true;
}
export function towerThink(S,e,dt){
  e.bd = towerShielded(S,e) ? 1 : 0;    // protection only — a tower never heals
  let tgt = ent(S,e.tid);
  // a target that dies or walks out is dropped properly, id and all
  if (tgt && (tgt.dead || dist(e.x,e.y,tgt.x,tgt.y) > e.range+40)){ tgt=null; e.tid=0; e.ramp=0; }
  if (!tgt) e.tid = 0;
  if (!tgt){
    let best=null, bd=1e9;
    const ag = S.aggro[e.team];
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type==='tower') continue;
      const d = dist(e.x,e.y,o.x,o.y);
      if (d > e.range) continue;
      let pri = 1;
      if (o.type==='hero' && ag && ag.t>0 && ag.id===o.id) pri = 0;
      const score = pri*10000 + d;
      if (score<bd){ bd=score; best=o; }
    }
    if (best){ tgt=best; e.tid=best.id; e.ramp=0; }
  }
  e.atkCd -= dt;
  if (tgt && e.atkCd<=0){
    e.atkCd = e.bat;
    S.projs.push({id:S.nextId++, kind:'tower', team:e.team, x:e.x, y:e.y-30,
      tid:tgt.id, dmg:e.dmg*(1+e.ramp*0.18), src:e.id, speed:1100, r:9});
    e.ramp = Math.min(3, e.ramp+1);
    fx(S,{t:'twrfire', x:e.x, y:e.y-30});
  }
}
