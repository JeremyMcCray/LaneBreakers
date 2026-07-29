// @ts-nocheck
import {
  BASE_X, LANE_Y, dist, heal
} from '../data/world';
import { attackWith, autoNext, cancelWind, moveToward, releaseAttack } from './attack';
import { damage, kill, tickDot } from './combat';
import { ent, fx } from './create';
import { updateHeroStats } from './stats';

export function heroThink(S,p,dt){
  const e = p.hero;
  if (e.dead){
    p.respawn -= dt;
    if (p.respawn<=0){
      e.dead=false; e.x=BASE_X[p.team]; e.y=LANE_Y + (p.slot>1 ? 60 : -60)*(S.players.length>2?1:0);
      e.stun=0; e.slowT=0; e.shieldT=0; e.colT=0; e.bonusHp=0; e.bonusDmg=0; e.windT=0; e.wTid=0;
      e.rootT=0; e.silT=0; e.barbT=0; e.defer=0; e.rage=0;
      updateHeroStats(S,p);
      e.hp=e.maxHp; e.mp=e.maxMp;
      p.order={type:'stop'};
      fx(S,{t:'respawn', x:e.x, y:e.y, team:p.team});
    }
    return;
  }
  e.moving = false;
  if (e.stun>0 || e.castLock>0) return;
  const o = p.order;
  if (o.type==='move' || o.type==='stop') e.curTid = 0;
  if (e.windT>0){
    if (o.type==='move' || o.type==='stop') cancelWind(e);
    else return;                              // committed to the swing until it lands
  }
  if (o.type==='attack'){
    let tg = ent(S,o.tid);
    if (!tg || tg.dead){
      // an A-click is an ongoing order: roll straight onto the next thing in reach
      const nxt = o.au ? autoNext(S,e) : null;
      if (!nxt){ p.order={type:'stop'}; e.curTid=0; return; }
      o.tid = nxt.id; tg = nxt;
    }
    e.curTid = tg.id;
    const reach = e.range + tg.r + e.r*0.4;
    if (dist(e.x,e.y,tg.x,tg.y) <= reach) attackWith(S,e,tg,dt);
    else moveToward(S,e,tg.x,tg.y,dt);
  }
  else if (o.type==='amove' || o.type==='hold'){
    const acqR = o.type==='hold' ? (e.range+e.r) : 640;
    const smart = o.type==='amove' && o.sm;
    let best=null, bd=1e9;
    for (const t of S.ents){
      if (t.dead || t.team===e.team) continue;
      const d = dist(e.x,e.y,t.x,t.y);
      if (d>acqR) continue;
      const pri = t.type==='creep'?0:(t.type==='hero'?1:2);   // creeps first — heroes need a manual order
      // smart mode ranks by nearness to where you clicked, not to the hero
      const sc = pri*5000 + (smart ? dist(o.x,o.y,t.x,t.y) : d);
      if (sc<bd){ bd=sc; best=t; }
    }
    e.curTid = best ? best.id : 0;
    if (best){
      const reach = e.range + best.r + e.r*0.4;
      if (dist(e.x,e.y,best.x,best.y) <= reach) attackWith(S,e,best,dt);
      else if (o.type!=='hold') moveToward(S,e,best.x,best.y,dt);
      else e.facing = Math.atan2(best.y-e.y, best.x-e.x);
    } else if (o.type==='amove'){
      if (!moveToward(S,e,o.x,o.y,dt)) p.order={type:'stop'};
    }
  }
  else if (o.type==='move'){
    if (!moveToward(S,e,o.x,o.y,dt)) p.order={type:'stop'};
  }
}

export function heroTimers(S,p,dt){
  const e=p.hero;
  const dec = k => { if (e[k]>0) e[k]=Math.max(0, e[k]-dt); };
  ['stun','slowT','shieldT','asT','lsT','msT','armT','regT','salveT','draughtT',
   'castLock','hitFlash','swing','drT','markT','rendT','hcT','shredT',
   'rootT','silT','barbT','bleedT','gsT','csT'].forEach(dec);
  tickDot(S,e,dt);
  if (e.colT>0){ e.colT-=dt; if (e.colT<=0){ e.bonusHp=0; e.bonusDmg=0; } }
  if (e.bleedT<=0){ e.bleedV=0; e.bleedHeal=0; }
  if (e.gsT<=0) e.gsP=0;
  // deferred damage bleeds off the account, and can still kill you
  if (e.defer>0 && !e.dead){
    const take = Math.min(e.defer, (e.defer/2.2 + 2) * dt);
    e.defer -= take;
    e.hp -= take;
    if (e.defer < 0.5) e.defer = 0;
    if (e.hp<=0) kill(S, ent(S,e.deferSrc), e);
  }
  // rage drains once the fighting stops
  if (e.rageOn){
    if (e.rageT>0) e.rageT -= dt;
    else if (e.rage>0) e.rage = Math.max(0, e.rage - 8*dt);
  }
  if (e.slowT<=0) e.slowP=0;
  updateHeroStats(S,p);
  if (e.dead) return;
  if (e.atkCd>0) e.atkCd = Math.max(0, e.atkCd - dt);
  if (e.windT>0 && e.stun<=0){
    e.windT -= dt;
    if (e.windT<=0){ e.windT=0; releaseAttack(S,e); }
  }
  // regen
  let hpr = 2.6 + 0.35*p.lvl + (e.hpr||0);
  if (e.regT>0) hpr += e.maxHp*e.regP;
  if (e.salveT>0) hpr += 50;
  let mpr = 1.1 + 0.16*p.lvl + (e.mpr||0);
  if (e.draughtT>0) mpr += 43;
  // fountain
  const dBase = dist(e.x,e.y,BASE_X[p.team],LANE_Y);
  if (dBase < 330){ hpr += e.maxHp*0.10; mpr += e.maxMp*0.09; }
  const dFoe = dist(e.x,e.y,BASE_X[1-p.team],LANE_Y);
  if (dFoe < 380) damage(S, null, e, 260*dt, {pure:true, silent:true});
  heal(S, e, hpr*dt);
  e.mp = Math.min(e.maxMp, e.mp + mpr*dt);
}
