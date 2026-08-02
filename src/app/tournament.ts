// @ts-nocheck
/** Tournament draft / lives / field rules (DOM-free). */
import { HEROES } from '../data/heroes';

export function tourNew(mode, lives){
  const teamSize = mode==='3v3' ? 3 : mode==='2v2' ? 2 : 1;
  // both teams draft lives×teamSize heroes from one shared pool — cap lives so
  // the draft can never ask for more heroes than the roster holds
  lives = Math.min(lives, Math.floor(Object.keys(HEROES).length / (teamSize*2)));
  return {on:true, mode:mode, teamSize:teamSize, lives:lives,
          pool:[[],[]], dead:[[],[]], cur:[[],[]], curSlot:[[],[]], score:[0,0],
          first: Math.random()<0.5 ? 0 : 1,          // coin toss for first pick
          game:1, phase:'draft', turn:0, champion:-1};
}
export function tourPicksPerTeam(T){ return T.lives * T.teamSize; }
export function tourDraftTeam(T){ return ((((T.turn+1)>>1) % 2) ^ (T.first||0)); }   // snake 1-2-2-1, random opener
export function tourDraftDone(T){ return T.turn >= tourPicksPerTeam(T)*2; }
export function tourTaken(T){ return T.pool[0].concat(T.pool[1]); }
export function tourDraft(T, team, hero){
  if (!T || T.phase!=='draft') return false;
  if (tourDraftTeam(T) !== team) return false;
  if (!HEROES[hero] || tourTaken(T).indexOf(hero) >= 0) return false;
  T.pool[team].push(hero);
  T.turn++;
  if (tourDraftDone(T)) T.phase = 'pick';
  return true;
}
export function tourNeedPick(T, team){ return T.cur[team].length < T.teamSize; }
export function tourBench(T, team){ return T.pool[team].filter(h=>T.cur[team].indexOf(h) < 0); }
/* has this seat already fielded a hero for the coming game? */
export function tourSlotPicked(T, team, slot){
  return !!(T && T.curSlot && T.curSlot[team].indexOf(slot) >= 0);
}
export function tourField(T, team, hero, slot){
  if (!T || T.phase!=='pick') return false;
  if (!tourNeedPick(T, team)) return false;
  if (T.pool[team].indexOf(hero) < 0) return false;
  if (T.cur[team].indexOf(hero) >= 0) return false;
  T.curSlot = T.curSlot || [[],[]];
  // each seat fields exactly one hero — the one they clicked is the one they play
  if (slot!==undefined && tourSlotPicked(T, team, slot)) return false;
  T.cur[team].push(hero);
  T.curSlot[team].push(slot!==undefined ? slot : -1);
  if (!tourNeedPick(T,0) && !tourNeedPick(T,1)) T.phase = 'ready';
  return true;
}
/* The winners keep what they are holding. The losers bury theirs. */
export function tourResult(T, winTeam){
  if (!T || T.phase==='over') return T;
  const lose = 1 - winTeam;
  T.score[winTeam]++;
  for (const h of T.cur[lose]){
    T.dead[lose].push(h);
    const i = T.pool[lose].indexOf(h);
    if (i>=0) T.pool[lose].splice(i,1);
  }
  T.cur[lose] = [];
  if (T.curSlot) T.curSlot[lose] = [];   // the losers pick fresh; winners keep seat↔hero
  T.game++;
  if (T.pool[lose].length < T.teamSize){ T.phase = 'over'; T.champion = winTeam; }
  else T.phase = 'pick';
  return T;
}
/* Turn the fielded heroes into a picks array the simulation understands.
   A hero goes to the seat that fielded it; anything unclaimed (old saves,
   host picking for a bot) falls back to draft order. */
export function tourPicks(T, nameFor, teamFor){
  const picks = [], cap = T.teamSize*2, curSlot = T.curSlot || [[],[]];
  const used = [T.cur[0].map(()=>false), T.cur[1].map(()=>false)];
  const heroFor = (sl, tm)=>{
    let i = curSlot[tm].indexOf(sl);                       // the one this seat clicked
    if (i<0 || used[tm][i]) i = used[tm].indexOf(false);   // else next unclaimed
    used[tm][i] = true;
    return T.cur[tm][i];
  };
  for (let sl=0; sl<cap; sl++){
    const tm = teamFor ? teamFor(sl) : (sl % 2);
    picks.push({h: heroFor(sl, tm), tm: tm,
                nm: nameFor ? nameFor(sl) : ('Player '+(sl+1))});
  }
  return picks;
}
