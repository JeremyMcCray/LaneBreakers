// @ts-nocheck
import {
  GOLD_PER_SEC, MATCH_LIMIT, WAVE_INTERVAL, clamp, clampToLane
} from '../data/world';
import { HEROES } from '../data/heroes';
import { releaseAttack } from './attack';
import { tickDot, tickEmber } from './combat';
import { fx } from './create';
import { stepCamps } from './camp';
import { creepThink } from './creep';
import { heroThink, heroTimers } from './hero';
import { stepHideout } from './hideout';
import { stepProjectiles } from './projectiles';
import { deliver } from './shop';
import { SERIES_TICK, addGold, endGame, sampleSeries, timeWinner } from './stats';
import { towerThink } from './tower';
import { spawnWave } from './waves';
import { stepZones } from './zones';

export function simStep(S,dt){
  S.t += dt; S.tick++;
  if (S.over) return;
  // the hideout has no clock and no waves — it lasts until the real match starts
  if (!S.hideout && S.t >= MATCH_LIMIT){ endGame(S, timeWinner(S), 'time'); return; }
  for (let i=0;i<2;i++){ const a=S.aggro[i]; if (a){ a.t-=dt; if (a.t<=0) S.aggro[i]=null; } }
  for (let i=0;i<2;i++){ const a=S.towerAggro[i]; if (a){ a.t-=dt; if (a.t<=0) S.towerAggro[i]=null; } }
  if (!S.hideout){
    S.waveT -= dt;
    if (S.waveT<=0){ spawnWave(S); S.waveT = WAVE_INTERVAL; }
  }

  S.seriesT -= dt;
  if (S.seriesT<=0){ S.seriesT += SERIES_TICK; sampleSeries(S); }
  for (const p of S.players){
    addGold(p, GOLD_PER_SEC*dt*(S.fastGold?14:1));
    for (let i=0;i<4;i++) if (p.cds[i]>0) p.cds[i]=Math.max(0,p.cds[i]-dt);
    // charge abilities refill one at a time
    for (let i=0;i<4;i++){
      const A = HEROES[p.heroId].abilities[i];
      if (!A.charges || p.sk[i]<=0 || p.chg[i]>=A.charges) continue;
      p.chgT[i] -= dt;
      if (p.chgT[i]<=0){
        p.chg[i]++;
        if (p.chg[i] < A.charges){
          p.chgT[i] = A.cd[p.sk[i]-1] * (1 - ((p.hero&&p.hero.cdr)||0));
          p.chgM[i] = p.chgT[i];
        } else { p.chgT[i] = 0; p.chgM[i] = 0; }
      }
    }
    for (const it of p.items) if (it.cd>0) it.cd=Math.max(0,it.cd-dt);
    for (let i=p.pending.length-1;i>=0;i--){
      p.pending[i].t -= dt;
      if (p.pending[i].t<=0){ deliver(S,p,p.pending[i]); p.pending.splice(i,1); }
    }
    heroTimers(S,p,dt);
  }
  for (const e of S.ents){
    if (e.type==='hero') continue;
    if (e.stun>0) e.stun=Math.max(0,e.stun-dt);
    if (e.slowT>0){ e.slowT-=dt; if (e.slowT<=0) e.slowP=0; }
    if (e.markT>0) e.markT-=dt;
    if (e.hcT>0) e.hcT-=dt;
    if (e.mbT>0) e.mbT-=dt;
    if (e.rootT>0) e.rootT-=dt;
    if (e.shredT>0) e.shredT-=dt;
    if (e.hasteT>0){ e.hasteT-=dt; if (e.hasteT<=0){ if (e.baseAps) e.aps = e.baseAps; e.ls = 0; } }
    if (e.drT>0)   e.drT-=dt;
    if (e.fbT>0){ e.fbT-=dt; if (e.fbT<=0) e.fbN=0; }   // Frostbite thaws
    if (e.fbCd>0) e.fbCd-=dt;
    if (e.doorCd>0) e.doorCd-=dt;
    if (e.shovedT>0) e.shovedT-=dt;
    if (e.batT>0) e.batT-=dt;      // Siege Bolt's batted creep stops blinking

    if (e.hitFlash>0) e.hitFlash-=dt;
    if (e.swing>0) e.swing-=dt;
    if (e.type!=='tower' && e.atkCd>0) e.atkCd = Math.max(0, e.atkCd - dt);
    if (e.type==='creep' && e.bdmg!==undefined){
      if (e.buffT>0){ e.buffT-=dt; e.dmg=e.bdmg+e.buffDmg; e.armor=e.barm+e.buffArm; e.ms=e.bms+e.buffMs; }
      else { e.dmg=e.bdmg; e.armor=e.barm; e.ms=e.bms; e.buffDmg=e.buffArm=e.buffMs=0; }
    }
    if (e.windT>0 && e.stun<=0){ e.windT-=dt; if (e.windT<=0){ e.windT=0; releaseAttack(S,e); } }
    tickDot(S,e,dt);
    tickEmber(S,e,dt);
    if (e.ttl!==undefined){ e.ttl-=dt; if (e.ttl<=0 && !e.dead){ e.dead=true; fx(S,{t:'die', x:e.x, y:e.y, team:e.team}); } }
    // dev sandbox dummy on regen — it heals back so you can read a sustained DPS
    if (e.dummy && e.dmyRegen>0 && e.hp<e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.dmyRegen*dt);
    e.moving=false;
  }
  for (const p of S.players) heroThink(S,p,dt);
  for (const e of S.ents){
    if (e.dead) continue;
    if (e.type==='creep'){ if (!e.neutral) creepThink(S,e,dt); }   // neutrals think in stepCamps
    else if (e.type==='tower') towerThink(S,e,dt);
  }
  stepCamps(S,dt);
  if (S.hideout) stepHideout(S,dt);
  stepProjectiles(S,dt);
  stepZones(S,dt);
  separate(S);
  for (let i=S.ents.length-1;i>=0;i--){
    const e=S.ents[i];
    if (e.dead && e.type!=='hero') S.ents.splice(i,1);
  }
}
export function separate(S){
  const list = S.ents.filter(e=>!e.dead && e.type!=='tower');
  for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++){
    const a=list[i], b=list[j];
    const dx=b.x-a.x, dy=b.y-a.y; let d=Math.hypot(dx,dy);
    // creeps keep an extra body-width between them so you can click one on purpose
    const pad = (a.type==='creep' && b.type==='creep') ? 14 : 0;
    const min=a.r+b.r+pad;
    if (d<min && d>0.001){
      const push=(min-d)/2*0.62;
      a.x-=dx/d*push; a.y-=dy/d*push;
      b.x+=dx/d*push; b.y+=dy/d*push;
      clampToLane(a); clampToLane(b);
    }
  }
  // keep units out of towers
  for (const e of list) for (const tw of S.ents){
    if (tw.type!=='tower'||tw.dead) continue;
    const dx=e.x-tw.x, dy=e.y-tw.y; const d=Math.hypot(dx,dy)||1;
    const min=tw.r+e.r;
    if (d<min){ e.x=tw.x+dx/d*min; e.y=tw.y+dy/d*min; clampToLane(e); }
  }
}
