// @ts-nocheck
import {
  MAX_LEVEL, ULT_REQ, XP_TABLE, heal
} from '../data/world';
import { HEROES } from '../data/heroes';
import { castAbility } from './abilities';
import { kill } from './combat';
import { ent, fx, spawnPet } from './create';
import { buyItem, moveItem, sellItem, useItem } from './shop';
import { addXp } from './stats';

export function applyCmd(S, slot, c){
  // dev sandbox cheats may be aimed at another seat (c.sl) — everything else is
  // always the sender's own hero. The client only offers cross-seat cheats in practice.
  const p = (c.a==='dbg' && c.sl!==undefined && S.players[c.sl]) ? S.players[c.sl] : S.players[slot];
  if (!p || S.over) return;
  const team = p.team;
  switch(c.a){
    case 'move':   p.order={type:'move', x:c.x, y:c.y}; break;
    case 'amove':  p.order={type:'amove', x:c.x, y:c.y, sm:c.sm?1:0}; break;
    case 'attack': {
      const tg = ent(S,c.id);
      // own creeps can still be used as an agro-drop order, even if they are not denyable
      if (tg && tg.team===team && tg.type!=='creep') break;
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
          for (const o of S.ents) if (o.type==='creep' && !o.dead && !o.dummy){
            o.dead = true; fx(S,{t:'die', x:o.x, y:o.y, team:o.team});
          }
          break;
        case 'fast':   S.fastGold = !S.fastGold; break;
        /* ---- dev sandbox ---- */
        case 'free':   p.devFree = !p.devFree; if (p.devFree) p.cds=[0,0,0,0]; break;
        case 'maxsk':  {
          const H = HEROES[p.heroId];
          for (let i=0;i<4;i++){
            const A = H.abilities[i], max = A.ult?3:4;
            if (p.sk[i] < max){ p.sk[i] = max; if (A.charges) p.chg[i] = A.charges; }
          }
          p.points = 0;
          break; }
        case 'resetsk': p.sk=[0,0,0,0]; p.chg=[0,0,0,0]; p.points=p.lvl; break;
        case 'respawn': p.respawn = 0.05; break;
        // dies without feeding — no bounty, no score, just the respawn timer
        case 'suicide': if (h && !h.dead){ h.hp = 0; kill(S, null, h); } break;
        case 'setgold': p.gold = Math.max(0, c.v||0); break;
        case 'setlvl': {
          const want = Math.max(1, Math.min(MAX_LEVEL, Math.round(c.v||1)));
          if (want > p.lvl) addXp(S, p, XP_TABLE[want] - p.xp);
          break; }
        case 'sethp':  if (h) h.hp = Math.max(1, Math.min(h.maxHp, c.v||h.maxHp)); break;
        case 'setmp':  if (h) h.mp = Math.max(0, Math.min(h.maxMp, c.v||h.maxMp)); break;
        case 'dummy': {
          if (!h) break;
          const face = team ? -1 : 1;
          const hp = Math.max(1, c.v || 20000);
          spawnPet(S, 1-team, h.x + face*300, h.y, undefined, {
            dummy:true, static:true, r:22, dmg:0, range:0, ms:0,
            hp:hp, maxHp:hp, armor:c.arm||0, dmyRegen:c.rg||0
          });
          break; }
        case 'nodummy':
          for (const o of S.ents) if (o.dummy && !o.dead){ o.dead = true; }
          break;
        case 'healdummy':
          for (const o of S.ents) if (o.dummy && !o.dead) o.hp = o.maxHp;
          break;
      }
      break; }
    case 'use':    useItem(S,p,c.slot,c.x,c.y); break;
  }
}
