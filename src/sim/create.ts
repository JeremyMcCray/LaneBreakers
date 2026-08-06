// @ts-nocheck
import {
  BASE_X, CAMP_FIRST, FIRST_WAVE, KILLS_TO_WIN, KILLS_TO_WIN_2V2, KILLS_TO_WIN_3V3, LANE_Y, START_GOLD, TOWER_X, clamp, clampToLane, dist, heal, rnd, setCampsOpen, setLaneMode
} from '../data/world';
import { HEROES } from '../data/heroes';
import { setupHideout } from './hideout';
import { updateHeroStats } from './stats';

export function newSim(picks, mode){
  picks = picks.map((pk,i)=> typeof pk==='string' ? {h:pk, tm:i%2} : pk);
  mode = mode || (picks.length>4 ? '3v3' : picks.length>2 ? '2v2' : '1v1');
  // 'hideout' — the pre-game warm-up room: 1v1 lane, no waves, no way to end
  const hid = mode==='hideout';
  setLaneMode(hid ? '1v1' : mode);
  const big = !hid && mode!=='1v1';
  const S = {
    t:0, tick:0, nextId:1, ents:[], projs:[], fx:[], zones:[], tag:null, seriesT:0,
    waveT:FIRST_WAVE, waveNum:0, winner:-1, over:false, aggro:[null,null], towerAggro:[null,null],
    mode:mode, big:big, hideout:hid, teamKills:[0,0],
    winKills: hid ? 9999 : mode==='3v3' ? KILLS_TO_WIN_3V3 : big ? KILLS_TO_WIN_2V2 : KILLS_TO_WIN,
    // jungle camps: both pockets in team modes (and the hideout, on a fast
    // first spawn so there is something to practice on), one random side in 1v1
    campT: hid ? 10 : CAMP_FIRST, campSides: (big || hid) ? [0,1] : [Math.random()<.5 ? 0 : 1],
    campCharges:[[],[]],
    players:[]
  };
  setCampsOpen(S.campSides);
  picks.forEach((pk, slot)=>{
    S.players.push({
      slot:slot, team:pk.tm, heroId:pk.h, name: pk.nm || ('Player '+(slot+1)),
      lvl:1, xp:0, gold:START_GOLD, points:1,
      sk:[0,0,0,0], cds:[0,0,0,0], chg:[0,0,0,0], chgT:[0,0,0,0], chgM:[0,0,0,0],
      items:[], pending:[],
      kills:0, deaths:0, assists:0, cs:0, denies:0, respawn:0, hero:null,
      dmgHero:0, dmgAll:0, healed:0, dmgTaken:0, goldEarned:START_GOLD,
      dmgBy:{}, dmgHeroBy:{}, takenBy:{}, series:[], events:[],
      order:{type:'stop', x:0, y:0, tid:0}, lastCastAt:-99
    });
  });
  if (!hid){
    const twrHp = mode==='3v3' ? 3300 : big ? 2300 : 1500;
    const twrDmg = mode==='3v3' ? 175 : big ? 150 : 135;
    for (let tm=0; tm<2; tm++){
      mkEnt(S,{type:'tower', team:tm, x:TOWER_X[tm], y:LANE_Y, r:46,
        hp:twrHp, maxHp:twrHp, armor:9, dmg:twrDmg, range:576, bat:0.95, atkCd:0, ramp:0, tid:0, lockT:0, lockId:0, heroThreatLockT:0});
    }
  }
  for (const p of S.players) spawnHero(S, p);
  if (hid) setupHideout(S);       // dummies, movers and the practice tower
  return S;
}
export function teamOf(S, t){ return S.players.filter(p=>p.team===t); }
export function foesOf(S, t){ return S.players.filter(p=>p.team!==t); }
/* every living enemy hero of team `t` within `r` of a point */
export function nearbyHeroes(S, t, x, y, r){
  return S.players.filter(p=>p.team===t && p.hero && !p.hero.dead &&
                             dist(p.hero.x, p.hero.y, x, y) < r);
}
export function mkEnt(S,o){
  o.id = S.nextId++;
  o.stun = o.stun||0; o.slowT = 0; o.slowP = 0;
  if (o.type==='creep'){                       // remember base stats — War Banner buffs on top
    o.bdmg = o.dmg; o.barm = o.armor; o.bms = o.ms;
    o.buffT = 0; o.buffDmg = 0; o.buffArm = 0; o.buffMs = 0;
  }
  S.ents.push(o); return o;
}
export function ent(S,id){ if(!id) return null; for(const e of S.ents) if(e.id===id) return e; return null; }
export function fx(S,o){ if (S.noFx) return; S.fx.push(o); }   /* headless trainers set noFx */

/* Fountain row for a hero: 1v1 spawns on the lane centre; team modes fan the
   pairs of slots out vertically (2v2: ±60, 3v3: -120/0/+120). */
export function heroHomeY(S, p){
  if (S.players.length<=2) return LANE_Y;
  const teamSize = S.players.length/2;
  return LANE_Y + (p.slot>>1)*120 - (teamSize-1)*60;
}

export function spawnHero(S,p){
  const H = HEROES[p.heroId];
  const e = mkEnt(S,{
    type:'hero', team:p.team, slot:p.slot, heroId:p.heroId,
    x:BASE_X[p.team], y:heroHomeY(S,p), r:26,
    hp:1, maxHp:1, mp:1, maxMp:1, atkCd:0, windT:0, wTid:0, castLock:0, facing:p.team?Math.PI:0,
    shield:0, shieldT:0, shieldRef:0, asT:0, asP:0, lsT:0, lsP:0, msT:0, msP:0,
    armT:0, armB:0, regT:0, regP:0, bonusHp:0, bonusDmg:0, colT:0, towerAgroDropCd:0,
    drT:0, drP:0, markT:0, markP:0, rendT:0, rendV:0, dotT:0, dotDps:0, dotSrc:0,
    salveT:0, draughtT:0, phaseCd:0, prevMaxHp:0, prevMaxMp:0, hitFlash:0, dead:false, curTid:0
  });
  p.hero = e;
  updateHeroStats(S,p,true);
  e.hp = e.maxHp; e.mp = e.maxMp;
  return e;
}

export function playerOf(S, e){
  if (!e) return null;
  for (const p of S.players) if (p.hero===e) return p;
  return null;
}

export function spawnPet(S, team, x, y, ttl, o){
  o = o || {};
  const e = mkEnt(S,Object.assign({type:'creep', kind:'melee', pet:true, team:team, x:x, y:y, r:12,
    hp:180, maxHp:180, dmg:19, armor:0, range:85, bat:0.9, atkCd:rnd(0,.4),
    ms:318, ranged:false, laneOff:rnd(-70,70), tid:0, ttl:ttl}, o));
  clampToLane(e);
  return e;
}

/* Corvick's turrets fire off his spell power rather than his attack damage, so
   caster items carry them and his own weapon does not. V is the rank value. */
export function turretDmg(h, V){
  return Math.round(V * (1 + (h.amp||0)));
}

/* One of Vhal's spawnlings. Symbiosis derives its stats from her own damage and
   health, so her items scale the whole brood. Kept in sync with her by
   updateHeroStats for as long as it lives. */
export function broodStats(h, V){
  return {hp: Math.round((110 + h.maxHp*V/400)*0.25), dmg: Math.round(12 + h.dmg*V/100)};
}
export function symbiosisRank(p){
  const A = HEROES[p.heroId].abilities[2];
  return (A && A.grants==='symbiosis' && p.sk[2]>0) ? A.val[p.sk[2]-1] : 0;
}
export function spawnBrood(S, p, x, y, ttl){
  const h = p.hero;
  const st = broodStats(h, symbiosisRank(p));
  return spawnPet(S, p.team, x, y, ttl, {
    brood:true, owner:h.id, oslot:p.slot, r:13,
    hp:st.hp, maxHp:st.hp, dmg:st.dmg, armor:0,
    range:95, bat:0.9, aps:1/0.9, baseAps:1/0.9, ms:330
  });
}

