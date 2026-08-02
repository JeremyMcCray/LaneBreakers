// @ts-nocheck
/* The pre-game Hideout — a cozy practice pocket players warm up in while an
   online lobby fills. It runs on the real ruleset: real dummies, both jungle
   camps on a fast cycle, and a real tower parked off to the side. Nothing in
   here can end the match — step/combat/tower gate on S.hideout — and anything
   that gets wrecked is quietly rebuilt by stepHideout. */
import { HIDEOUT, clampToLane } from '../data/world';
import { mkEnt, spawnPet, fx } from './create';

/* every fixture the room must always contain, keyed by hd id */
function fixtures(){
  const F = [];
  HIDEOUT.DUMMIES.forEach((d,i)=> F.push({id:'d'+i, kind:'dummy', x:d.x, y:d.y}));
  HIDEOUT.MOVERS.forEach((m,i)=> F.push({id:'m'+i, kind:'mover', x:(m.x1+m.x2)/2, y:m.y,
                                          x1:m.x1, x2:m.x2, ms:m.ms}));
  F.push({id:'tw', kind:'tower'});
  return F;
}

function spawnFixture(S, f){
  if (!f) return;
  if (f.kind==='tower'){
    mkEnt(S,{type:'tower', team:1, hd:'tw', x:HIDEOUT.TOWER.x, y:HIDEOUT.TOWER.y, r:46,
      hp:1500, maxHp:1500, armor:9, dmg:135, range:576, bat:0.95, atkCd:0,
      ramp:0, tid:0, lockT:0, lockId:0, heroThreatLockT:0});
    return;
  }
  const mover = f.kind==='mover';
  spawnPet(S, 1, f.x, f.y, undefined, {
    dummy:true, static:!mover, r:mover?20:22, dmg:0, range:0,
    hp:mover?1800:2600, maxHp:mover?1800:2600, armor:2, dmyRegen:mover?120:140,
    hd:f.id, laneOff:0,
    ms: mover ? f.ms : 0,
    hdPat: mover ? [f.x1, f.x2] : undefined, hdY: mover ? f.y : undefined,
    facing: 0
  });
}

export function setupHideout(S){
  S.hdQ = [];           // respawn queue: {id, t}
  S.hdScanT = 1;
  for (const f of fixtures()) spawnFixture(S, f);
}

export function stepHideout(S, dt){
  // patrolling dummies pace their training run — slows, roots and stuns all
  // bite for real, so they double as skillshot and debuff practice
  for (const e of S.ents){
    if (e.dead || !e.hdPat) continue;
    if (e.stun>0 || e.rootT>0) continue;
    const sp = e.ms * (e.slowT>0 ? 1-e.slowP : 1);
    e.hdDir = e.hdDir || 1;
    e.x += e.hdDir * sp * dt;
    if (e.x >= e.hdPat[1]){ e.x = e.hdPat[1]; e.hdDir = -1; }
    if (e.x <= e.hdPat[0]){ e.x = e.hdPat[0]; e.hdDir = 1; }
    e.y += (e.hdY - e.y) * Math.min(1, dt*3);   // shoved around? drift back onto the run
    e.facing = e.hdDir>0 ? 0 : Math.PI;
    e.moving = true;
    clampToLane(e);
  }
  // anything broken gets quietly replaced — dummies fast, the tower slower
  S.hdScanT -= dt;
  if (S.hdScanT<=0){
    S.hdScanT = 1;
    for (const f of fixtures()){
      if (S.ents.some(e=>!e.dead && e.hd===f.id)) continue;
      if (S.hdQ.some(q=>q.id===f.id)) continue;
      S.hdQ.push({id:f.id, t: f.kind==='tower' ? 18 : 6});
    }
  }
  for (let i=S.hdQ.length-1;i>=0;i--){
    const q = S.hdQ[i]; q.t -= dt;
    if (q.t<=0){
      S.hdQ.splice(i,1);
      const f = fixtures().find(x=>x.id===q.id);
      spawnFixture(S, f);
      if (f && f.kind==='tower') fx(S,{t:'blast', x:HIDEOUT.TOWER.x, y:HIDEOUT.TOWER.y, r:120, col:'#ffd166'});
    }
  }
}
