// @ts-nocheck
/* Jungle camps — neutral packs in the two lane-side pockets.
   Cycle: first spawn at CAMP_FIRST, then every CAMP_RESPAWN a camp refills
   ONLY if it is empty. Last-hitting a member banks a charge for your team
   (see combat.kill); spawnWave cashes charges in as extra lane creeps.
   Neutral creeps (team 2) never run creepThink — campThink below keeps them
   leashed to their pocket, and jungleSpecials runs the variant powers for
   both the neutral pack and any converted lane copies. */
import {
  BASE_X, CAMP_R, CAMP_RESPAWN, CAMP_X, LANE_Y, campY, dist, heal, rnd
} from '../data/world';
import { CAMP_IDS, CAMP_VARIANTS } from '../data/camps';
import { attackWith, moveToward } from './attack';
import { damage } from './combat';
import { ent, fx, mkEnt } from './create';

const CAMP_AGGRO = CAMP_R + 20;  // a HERO inside the pocket wakes the pack — waves passing on the lane never do
const CAMP_CHASE = 560;    // once angry they hunt anything this close to home
const CAMP_LEASH = 470;    // a target dragged past this from the anchor is dropped

function mkJungle(S, o, V){
  return mkEnt(S, Object.assign({
    type:'creep', kind: V.ranged?'ranged':'melee',
    hp:V.hp, maxHp:V.hp, dmg:V.dmg, armor:V.armor, ms:V.ms,
    range:V.range, bat:V.bat, r:V.r, ranged:V.ranged,
    cleave:V.cleave||0, siege:V.siege||0,
    atkCd:rnd(0,.5), tid:0, jT:rnd(0.5,2)
  }, o));
}

export function spawnCamp(S, side, forceVariant){
  const vid = forceVariant || CAMP_IDS[Math.floor(Math.random()*CAMP_IDS.length)];
  const V = CAMP_VARIANTS[vid];
  const cy = campY(side);
  for (let i=0;i<V.n;i++){
    const a = i/V.n*Math.PI*2 + rnd(0,.5), rad = V.n>1 ? 34+V.r : 0;
    mkJungle(S, {
      team:2, neutral:true, camp:side, jungle:vid,
      x:CAMP_X + Math.cos(a)*rad, y:cy + Math.sin(a)*rad,
      laneOff:0
    }, V);
  }
  fx(S,{t:'jspawn', x:CAMP_X, y:cy, jg:vid, col:V.col});
  return vid;
}

export function campAlive(S, side){
  for (const e of S.ents) if (!e.dead && e.neutral && e.camp===side) return true;
  return false;
}

/* charges → extra creeps marching with team tm's fresh wave */
export function spawnJungleWave(S, tm){
  const q = S.campCharges && S.campCharges[tm];
  if (!q || !q.length) return;
  const drop = q.splice(0);
  drop.forEach((vid, i)=>{
    const V = CAMP_VARIANTS[vid];
    mkJungle(S, {
      team:tm, jungle:vid,
      x:BASE_X[tm] + (tm?-1:1)*(20 + (i%3)*26), y:LANE_Y + rnd(-90,90),
      laneOff:rnd(-80,80)
    }, V);
  });
  fx(S,{t:'jwave', x:BASE_X[tm]+(tm?-140:140), y:LANE_Y, team:tm, v:drop.length});
}

export function stepCamps(S, dt){
  if (S.campT===undefined) return;             // old saves / trainer states without camps
  S.campT -= dt;
  if (S.campT<=0){
    S.campT = CAMP_RESPAWN;
    for (const s of S.campSides) if (!campAlive(S, s)) spawnCamp(S, s);
  }
  for (const e of S.ents){
    if (e.dead || !e.jungle) continue;
    jungleSpecials(S, e, dt);
    if (e.neutral) campThink(S, e, dt);
  }
}

/* ------------------------- neutral behaviour ------------------------ */
function campThink(S, e, dt){
  if (e.stun>0 || e.windT>0) return;
  const cy = campY(e.camp);
  let tgt = ent(S, e.tid);
  if (tgt && (tgt.dead || dist(tgt.x,tgt.y,CAMP_X,cy) > CAMP_LEASH)){ tgt=null; e.tid=0; }
  e.acqT = (e.acqT||0) - dt;
  if (e.acqT<=0){
    e.acqT = 0.4;
    // angry (already fighting or wounded) packs scan wider than sleeping ones,
    // and a SLEEPING pack only wakes for a hero — never for a passing wave
    const angry = e.tid || e.hp<e.maxHp;
    const wake = angry ? CAMP_CHASE : CAMP_AGGRO;
    let best=null, bd=1e9;
    for (const o of S.ents){
      if (o.dead || o.team===2 || o.type==='tower') continue;
      if (!angry && o.type!=='hero') continue;
      const d = dist(o.x,o.y,CAMP_X,cy);
      if (d > wake) continue;
      const dd = dist(o.x,o.y,e.x,e.y);
      if (dd<bd){ bd=dd; best=o; }
    }
    if (best){ e.tid=best.id; tgt=best; }
  }
  if (tgt){
    const reach = e.range + tgt.r;
    if (dist(e.x,e.y,tgt.x,tgt.y) <= reach) attackWith(S,e,tgt,dt);
    else moveToward(S,e,tgt.x,tgt.y,dt);
  } else {
    // trot home and shake the fight off — an abandoned camp resets to full
    if (dist(e.x,e.y,CAMP_X,cy) > 30+e.r) moveToward(S,e,CAMP_X,cy,dt);
    else if (e.hp < e.maxHp) heal(S, e, e.maxHp*0.25*dt);
  }
}

/* ------------------- variant powers (any team) ---------------------- */
function jungleSpecials(S, e, dt){
  const V = CAMP_VARIANTS[e.jungle];
  if (!V) return;
  if (e.stun>0) return;
  if (V.bolt){
    e.jT -= dt;
    if (e.jT<=0){
      e.jT = V.bolt.cd;
      // a sleeping neutral shaman keeps its thunder to itself
      if (e.neutral && !e.tid) return;
      const foes = [];
      for (const o of S.ents){
        if (o.dead || o.team===e.team || o.type==='tower') continue;
        if (e.neutral && o.team===2) continue;
        if (dist(o.x,o.y,e.x,e.y) <= V.bolt.r) foes.push(o);
      }
      if (foes.length){
        const t = foes[Math.floor(Math.random()*foes.length)];
        fx(S,{t:'jbolt', x:t.x, y:t.y});
        damage(S, e, t, V.bolt.dmg, {ability:true});
      }
    }
  }
  if (V.pulse){
    e.jT -= dt;
    if (e.jT<=0){
      e.jT = V.pulse.cd;
      let did = 0;
      for (const o of S.ents){
        if (o.dead || o.team!==e.team || o.type==='tower') continue;
        if (dist(o.x,o.y,e.x,e.y) > V.pulse.r) continue;
        if (heal(S, o, V.pulse.heal) > 0) did++;
      }
      if (did) fx(S,{t:'jheal', x:e.x, y:e.y, r:V.pulse.r});
    }
  }
}
