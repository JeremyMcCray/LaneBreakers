// @ts-nocheck
import {
  MAX_LEVEL, XP_TABLE
} from '../data/world';
import { HEROES } from '../data/heroes';
import { ITEMS, itemStats } from '../data/items';
import { damage } from './combat';
import { fx, teamOf } from './create';

export function updateHeroStats(S,p,init){
  const e = p.hero, H = HEROES[p.heroId], l = p.lvl, it = itemStats(p.items);
  e.maxHp = H.hp  + H.hpg *(l-1) + it.hp + e.bonusHp;
  e.maxMp = H.mp  + H.mpg *(l-1) + it.mp;
  e.dmg   = H.dmg + H.dmgg*(l-1) + it.dmg + e.bonusDmg;
  e.armor = H.arm + H.armg*(l-1) + it.arm + (e.armT>0 ? e.armB : 0);
  e.ms    = H.ms + it.ms + (e.msT>0 ? H.ms*e.msP : 0);
  e.range = H.range; e.ranged = H.ranged;
  e.aps   = (1 + (it.as + (e.asT>0?e.asP:0))/100) / H.bat;
  e.ls    = it.ls + (e.lsT>0 ? e.lsP : 0);
  e.thorns= it.thorns; e.cdr = it.cdr; e.hpr = it.hpr; e.mpr = it.mpr;
  e.crit = it.crit; e.chill = it.chill; e.amp = it.amp;
  e.block = it.block; e.hcut = it.hcut; e.hcutM = it.hcutM; e.shredOn = it.shred;
  e.cleave = H.ranged ? 0 : it.cleave;          // splash is a melee-only affair
  // passive abilities feed straight into the stat block
  for (let i=0;i<4;i++){
    const A = H.abilities[i];
    if (!A.passive || p.sk[i]<=0) continue;
    if (A.grants==='cleave' && !H.ranged) e.cleave = Math.max(e.cleave, A.val[p.sk[i]-1]/100);
  }
  if (e.banT>0){ e.dmg += e.banDmg||0; e.armor += e.banArm||0; e.ms += e.banMs||0; }  // War Banner
  if (e.gsT>0) e.dmg *= (1 + e.gsP);            // God's Strength
  if (H.id==='shiv'){
    e.rageOn = true;
    e.deferPct = p.sk[1]>0 ? H.abilities[1].val[p.sk[1]-1]/100 : 0;
  }
  e.quell = it.quell * (H.ranged ? 0.5 : 1);
  if (e.slowT>0) e.ms *= (1 - e.slowP);
  if (init){ e.prevMaxHp = e.maxHp; e.prevMaxMp = e.maxMp; return; }
  if (e.maxHp > e.prevMaxHp) e.hp += (e.maxHp - e.prevMaxHp);
  if (e.maxMp > e.prevMaxMp) e.mp += (e.maxMp - e.prevMaxMp);
  e.prevMaxHp = e.maxHp; e.prevMaxMp = e.maxMp;
  e.hp = Math.min(e.hp, e.maxHp); e.mp = Math.min(e.mp, e.maxMp);
}

/* ------------------------------ damage ----------------------------- */

export function netWorth(p){
  let w = p.gold;
  for (const it of p.items)   w += ITEMS[it.id].cost;
  for (const q of p.pending)  w += ITEMS[q.id].cost;
  return w;
}
/* decides a match that hit the time cap: kills, then net worth, then last hits */

export function timeWinner(S){
  const sum = (t, f) => teamOf(S,t).reduce((a,p)=>a+f(p), 0);
  if (S.teamKills[0] !== S.teamKills[1]) return S.teamKills[0] > S.teamKills[1] ? 0 : 1;
  const na = sum(0, netWorth), nb = sum(1, netWorth);
  if (Math.abs(na-nb) > 50) return na > nb ? 0 : 1;
  const ca = sum(0, p=>p.cs), cb = sum(1, p=>p.cs);
  if (ca !== cb) return ca > cb ? 0 : 1;
  return 0;
}

export function endGame(S, team, how){
  if (S.over) return;
  S.over = true; S.winner = team; S.how = how;
  fx(S,{t:'end', team:team});
}

export function addXp(S,p,amt){
  if (p.lvl>=MAX_LEVEL) return;
  p.xp += amt;
  while (p.lvl<MAX_LEVEL && p.xp >= XP_TABLE[p.lvl+1]){
    p.lvl++; p.points++;
    updateHeroStats(S,p);
    if (p.hero){ p.hero.hp = Math.min(p.hero.maxHp, p.hero.hp + 90); fx(S,{t:'lvlup', x:p.hero.x, y:p.hero.y}); }
  }
}

