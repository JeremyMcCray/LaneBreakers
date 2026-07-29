// @ts-nocheck
import {
  MAX_LEVEL, ULT_REQ, XP_TABLE, heal
} from '../data/world';
import { HEROES } from '../data/heroes';
import { castAbility } from './abilities';
import { ent, fx } from './create';
import { buyItem, moveItem, sellItem, useItem } from './shop';
import { addXp } from './stats';

export function applyCmd(S, slot, c){
  const p = S.players[slot];
  if (!p || S.over) return;
  const team = p.team;
  switch(c.a){
    case 'move':   p.order={type:'move', x:c.x, y:c.y}; break;
    case 'amove':  p.order={type:'amove', x:c.x, y:c.y, sm:c.sm?1:0}; break;
    case 'attack': {
      const tg = ent(S,c.id);
      // you may only deny your own creeps once they drop below half health
      if (tg && tg.team===team && !(tg.type==='creep' && tg.hp/tg.maxHp < .5)) break;
      p.order={type:'attack', tid:c.id, au:c.au?1:0};
      break; }
    case 'hold':   p.order={type:'hold'}; break;
    case 'stop':   p.order={type:'stop'}; break;
    case 'cast':   castAbility(S,p,c.s,c.x,c.y); break;
    case 'skill': {
      const i=c.s, A=HEROES[p.heroId].abilities[i];
      const max = A.ult?3:4;
      if (p.points>0 && p.sk[i]<max && (!A.ult || p.lvl>=ULT_REQ[p.sk[i]])){
        p.sk[i]++; p.points--;
        if (A.charges && p.sk[i]===1) p.chg[i] = A.charges;   // arrive with a full magazine
      }
      break; }
    case 'buy':    buyItem(S,p,c.id); break;
    case 'sell':   sellItem(S,p,c.slot); break;
    case 'swap':   moveItem(S,p,c.i,c.j); break;
    case 'dbg': {
      const h = p.hero;
      switch(c.w){
        case 'gold':   p.gold += 1000; break;
        case 'gold5':  p.gold += 5000; break;
        case 'lvl':    addXp(S,p, Math.max(1,(XP_TABLE[Math.min(MAX_LEVEL,p.lvl+1)]||0) - p.xp)); break;
        case 'lvlmax': addXp(S,p, XP_TABLE[MAX_LEVEL]); break;
        case 'pts':    p.points++; break;
        case 'cd':     p.cds=[0,0,0,0]; for (const it of p.items) it.cd=0; break;
        case 'heal':   if (h){ h.hp=h.maxHp; h.mp=h.maxMp; } break;
        case 'god':    p.god = !p.god; break;
        case 'wave':   S.waveT = 0.05; break;
        case 'clear':
          for (const o of S.ents) if (o.type==='creep' && !o.dead){
            o.dead = true; fx(S,{t:'die', x:o.x, y:o.y, team:o.team});
          }
          break;
        case 'fast':   S.fastGold = !S.fastGold; break;
      }
      break; }
    case 'use':    useItem(S,p,c.slot,c.x,c.y); break;
  }
}
