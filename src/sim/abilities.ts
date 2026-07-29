// @ts-nocheck
/**
 * Hero ability casting (parity port of the monolith switch).
 *
 * Layout in this file:
 *   - abilityLevel / canCast           — shared gates
 *   - castAbility                      — giant switch(heroId + slot)
 *   - helpers (enraged, sliceAndDice, illuScale, …)
 *
 * Phase 6 follow-up: split castAbility into per-hero modules registered
 * in a map — do not change numbers/order while doing that.
 */
import {
  LANE_Y, clamp, dist, dist2, clampToLane, heal, rnd
} from '../data/world';
import { HEROES } from '../data/heroes';
import { ent, fx, mkEnt, nearbyHeroes, playerOf, spawnPet } from './create';
import { damage, kill, applyDot, applySlow, applyRoot, applySilence, applyStun, disjoint, warded } from './combat';
import { addZone, aoe, nearestFoe } from './zones';
import { updateHeroStats } from './stats';
import { cancelWind } from './attack';

export function abilityLevel(p,i){ return p.sk[i]; }
export function canCast(S,p,i){
  const e=p.hero, A=HEROES[p.heroId].abilities[i];
  if (!e || e.dead || e.stun>0 || S.over) return false;
  if (p.sk[i]<=0) return false;
  if (A.passive) return false;                  // nothing to cast — it is always on
  if (A.charges){ if ((p.chg[i]||0) <= 0) return false; }
  else if (p.cds[i]>0) return false;
  if (e.silT>0) return false;                   // silenced
  if (A.blink && e.rootT>0) return false;       // rooted feet cannot blink
  if (e.mp < A.mana[p.sk[i]-1]) return false;
  return true;
}
export function castAbility(S,p,i,tx,ty){
  if (!canCast(S,p,i)) return;
  const e=p.hero, H=HEROES[p.heroId], A=H.abilities[i], l=p.sk[i], V=A.val[l-1];
  e.mp -= A.mana[l-1];
  if (A.charges){
    p.chg[i]--;
    if (!(p.chgT[i]>0)){
      p.chgT[i] = A.cd[l-1] * (1 - (e.cdr||0));
      p.chgM[i] = p.chgT[i];
    }
  } else {
    p.cds[i] = A.cd[l-1] * (1 - (e.cdr||0));
  }
  e.castLock = .16;
  cancelWind(e);
  p.lastCastAt = S.t;
  // clamp point targets to ability range
  if (A.cast==='point' && A.range){
    const d = dist(e.x,e.y,tx,ty);
    if (d > A.range){ tx = e.x + (tx-e.x)/d*A.range; ty = e.y + (ty-e.y)/d*A.range; }
  }
  e.facing = Math.atan2(ty-e.y, tx-e.x);
  fx(S,{t:'cast', x:e.x, y:e.y, col:H.col});
  const K = H.id + i;
  const wasX = e.x, wasY = e.y;
  switch(K){
  /* ---- VEX ---- */
  case 'vex0': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:H.col});
    fx(S,{t:'blast', x:e.x, y:e.y, r:150, col:'#bff3ff'});
    aoe(S, e.team, e.x, e.y, 150, V, e);
    break; }
  case 'vex1':
    e.asT=5; e.asP=V; e.lsT=5; e.lsP=.30;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ff9b4a'}); break;
  case 'vex2':
    e.shield=V; e.shieldT=3; e.shieldRef=.6;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#8fe3ff'}); break;
  case 'vex3': {
    const tg = nearestFoe(S, e.team, tx, ty, 280);
    if (tg){
      const lethal = tg.hp/ (tg.maxHp||1) < .30;
      fx(S,{t:'exec', x:tg.x, y:tg.y});
      damage(S, e, tg, V*(lethal?2:1), {ability:true});
    }
    break; }
  /* ---- ILVA ---- */
  case 'ilva0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1150, vy:Math.sin(a)*1150, life:800/1150, dmg:V, src:e.id, r:16,
      slow:{p:.40,t:2}, col:'#9fe6ff'});
    break; }
  case 'ilva1':
    fx(S,{t:'blast', x:e.x, y:e.y, r:270, col:'#a9d8ff'});
    aoe(S, e.team, e.x, e.y, 270, V, e, o=> applySlow(o,.45,2.5));
    break;
  case 'ilva2': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    e.msT=2; e.msP=V/100;
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#a9d8ff'});
    addZone(S,{kind:'frost', team:e.team, x:ox, y:oy, r:175, t:4, slow:.35});
    break; }
  case 'ilva3':
    addZone(S,{kind:'azero', team:e.team, x:tx, y:ty, r:300, t:.65, dmg:V, src:e.id});
    fx(S,{t:'telegraph', x:tx, y:ty, r:300, life:.65, col:'#7fd4ff'});
    break;
  /* ---- GRUK ---- */
  case 'gruk0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'boulder', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1000, vy:Math.sin(a)*1000, life:760/1000, dmg:V, src:e.id, r:26,
      stun:1.2, col:'#d8a66a'});
    break; }
  case 'gruk1':
    e.armT=6; e.armB=V; e.regT=6; e.regP=.04;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ffcf8f'}); break;
  case 'gruk2':
    addZone(S,{kind:'quake', team:e.team, follow:e.id, x:e.x, y:e.y, r:300, t:3,
      dps:V, slow:.35, src:e.id, tickT:0});
    break;
  case 'gruk3': {
    e.colT=12; e.bonusHp=V; e.bonusDmg=40; e.slowT=0;
    updateHeroStats(S,p);
    e.hp = Math.min(e.maxHp, e.hp + V);
    fx(S,{t:'blast', x:e.x, y:e.y, r:220, col:'#ffb45a'});
    break; }
  /* ---- BRANN ---- */
  case 'brann0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'hook', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1400, vy:Math.sin(a)*1400, life:920/1400, dmg:V, src:e.id, r:22,
      pull:true, col:'#ff9b6a'});
    break; }
  case 'brann1':
    e.rendT=6; e.rendV=V;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ff9b6a'}); break;
  case 'brann2':
    e.drT=4; e.drP=V/100;
    addZone(S,{kind:'frost', team:e.team, follow:e.id, x:e.x, y:e.y, r:260, t:4, slow:.30});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ffcf8f'}); break;
  case 'brann3':
    fx(S,{t:'blast', x:e.x, y:e.y, r:380, col:'#ff9b6a'});
    aoe(S, e.team, e.x, e.y, 380, V, e, o=>{ applyStun(S,o,1.5); });
    break;
  /* ---- SABLE ---- */
  case 'sable0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'pierce', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1500, vy:Math.sin(a)*1500, life:950/1500, dmg:V, src:e.id, r:20,
      pierce:true, fall:.30, hits:[], col:'#c9f06a'});
    break; }
  case 'sable1': {
    const tg = nearestFoe(S, e.team, tx, ty, 260);
    if (tg){ tg.markT=6; tg.markP=V/100; fx(S,{t:'mark', x:tg.x, y:tg.y}); }
    break; }
  case 'sable2': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    e.asT=3; e.asP=V;
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#c9f06a'});
    break; }
  case 'sable3': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'deadshot', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*2600, vy:Math.sin(a)*2600, life:1500/2600, dmg:V, src:e.id, r:22,
      col:'#eaffb0'});
    fx(S,{t:'dash', x:e.x, y:e.y, x2:tx, y2:ty, col:'#eaffb0'});
    break; }
  /* ---- VHAL ---- */
  case 'vhal0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1050, vy:Math.sin(a)*1050, life:820/1050, dmg:V, src:e.id, r:16,
      dot:{dps:V/4, t:4}, col:'#b78cff'});
    break; }
  case 'vhal1': {
    for (let n=0;n<V;n++){
      const a = (n/V)*Math.PI*2;
      spawnPet(S, e.team, e.x+Math.cos(a)*54, e.y+Math.sin(a)*54, 14);
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:120, col:'#b78cff'});
    break; }
  case 'vhal2':
    addZone(S,{kind:'miasma', team:e.team, x:tx, y:ty, r:240, t:4,
      dps:V, slow:.30, src:e.id, tickT:0});
    break;
  case 'vhal3':
    fx(S,{t:'blast', x:tx, y:ty, r:330, col:'#c9a6ff'});
    aoe(S, e.team, tx, ty, 330, V, e, o=>{ applyDot(S, o, V*0.12, 4, e.id); });
    break;
  /* ---- ASH ---- */
  case 'ash0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1150, vy:Math.sin(a)*1150, life:820/1150, dmg:V, src:e.id, r:17,
      dot:{dps:V*0.13, t:3}, col:'#ffb347'});
    break; }
  case 'ash1':
    e.armT=5; e.armB=4;
    addZone(S,{kind:'fire', team:e.team, follow:e.id, x:e.x, y:e.y, r:240, t:5,
      dps:V, slow:0, src:e.id, tickT:0});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ffb347'});
    break;
  case 'ash2': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    e.msT=2; e.msP=.15;
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#ffb347'});
    addZone(S,{kind:'fire', team:e.team, x:ox, y:oy, r:190, t:4, dps:V, slow:0, src:e.id, tickT:0});
    break; }
  case 'ash3':
    addZone(S,{kind:'meteor', team:e.team, x:tx, y:ty, r:280, t:.65, dmg:V, src:e.id});
    fx(S,{t:'telegraph', x:tx, y:ty, r:280, life:.65, col:'#ffb347'});
    break;
  /* ---- MARA ---- */
  case 'mara0': {
    const tg = nearestFoe(S, e.team, tx, ty, 300);
    if (tg){
      fx(S,{t:'blast', x:tg.x, y:tg.y, r:70, col:'#ffe9a8'});
      const dealt = damage(S, e, tg, V, {ability:true});
      heal(S, e, dealt*.6);
      fx(S,{t:'heal', x:e.x, y:e.y});
    }
    break; }
  case 'mara1':
    addZone(S,{kind:'light', team:e.team, x:tx, y:ty, r:220, t:4,
      dps:V, slow:.20, src:e.id, tickT:0});
    break;
  case 'mara2':
    e.shield=V; e.shieldT=3; e.shieldRef=0;
    e.slowT=0; e.slowP=0; e.msT=2; e.msP=.15;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ffe9a8'});
    break;
  case 'mara3': {
    fx(S,{t:'blast', x:e.x, y:e.y, r:340, col:'#ffe9a8'});
    const n = aoe(S, e.team, e.x, e.y, 340, V, e, o=>{ applyStun(S,o,1.1); });
    if (n>0){ heal(S, e, 70*n); fx(S,{t:'heal', x:e.x, y:e.y}); }
    break; }
  /* ---- ORRIN ---- */
  case 'orrin0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'siege', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1250, vy:Math.sin(a)*1250, life:800/1250, dmg:V, src:e.id, r:20,
      siege:true, twr:1.8, col:'#e0c477'});
    break; }
  case 'orrin1':
    addZone(S,{kind:'banner', team:e.team, x:tx, y:ty, r:300, t:10,
      bd:V, ba:4, bm:40, src:e.id, tickT:0});
    fx(S,{t:'buff', x:tx, y:ty, col:'#e0c477'});
    break;
  case 'orrin2': {
    const t2 = spawnPet(S, e.team, tx, ty, 14, {static:true, ranged:true, r:15,
      hp:320, maxHp:320, dmg:V, armor:2, range:520, bat:1.1, ms:0, turret:true});
    fx(S,{t:'blast', x:t2.x, y:t2.y, r:90, col:'#e0c477'});
    break; }
  case 'orrin3': {
    let n=0;
    for (const o of S.ents){
      if (o.dead || o.team!==e.team || o.type!=='creep') continue;
      o.hp = o.maxHp;
      o.buffT = 15; o.buffDmg = V; o.buffArm = 6; o.buffMs = 60;
      n++;
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:260, col:'#ffd98a'});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#e0c477'});
    break; }
  /* ---- NIX ---- */
  case 'nix0': {
    for (let n=0;n<2;n++){
      const a2 = (n/2)*Math.PI*2 + rnd(0,1);
      spawnIllusion(S, p, e.x+Math.cos(a2)*46, e.y+Math.sin(a2)*46, 16, V/100, l, false);
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:110, col:'#ff7fd0'});
    break; }
  case 'nix1': {
    let bestI=null, bd=1e9;
    for (const o of S.ents){
      if (o.dead || !o.illu || o.team!==e.team) continue;
      const d = dist(o.x,o.y,tx,ty);
      if (d<bd){ bd=d; bestI=o; }
    }
    const ox=e.x, oy=e.y;
    if (bestI){
      e.x=bestI.x; e.y=bestI.y; bestI.x=ox; bestI.y=oy;
      clampToLane(e); clampToLane(bestI);
      fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#ff7fd0'});
    } else {
      const d = dist(e.x,e.y,tx,ty)||1, r2 = Math.min(300,d);
      e.x += (tx-e.x)/d*r2; e.y += (ty-e.y)/d*r2; clampToLane(e);
      fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#ff7fd0'});
    }
    e.msT=2; e.msP=V/100;
    break; }
  case 'nix2': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#ff7fd0'});
    fx(S,{t:'blast', x:e.x, y:e.y, r:160, col:'#ffb0e4'});
    aoe(S, e.team, e.x, e.y, 160, V, e);
    for (const o of S.ents){
      if (o.dead || !o.illu || o.team!==e.team) continue;
      const a2 = Math.random()*Math.PI*2;
      const px2=o.x, py2=o.y;
      o.x = e.x + Math.cos(a2)*60; o.y = e.y + Math.sin(a2)*60; clampToLane(o);
      o.aps = (o.baseAps||o.aps)*1.6; o.hasteT = 4;
      fx(S,{t:'dash', x:px2, y:py2, x2:o.x, y2:o.y, col:'#ff7fd0'});
    }
    break; }
  /* ---- SHIV ---- */
  case 'shiv0': {
    const a0 = Math.atan2(ty-e.y, tx-e.x);
    const fan = enraged(e) ? [-0.17, 0, 0.17] : [0];   // full rage throws the whole hand
    for (const off of fan){
      const a = a0 + off;
      S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
        vx:Math.cos(a)*1400, vy:Math.sin(a)*1400, life:760/1400, dmg:V, src:e.id, r:13,
        dot:{dps:V*0.16, t:5, stack:true}, col:'#ff8f8f'});
    }
    break; }
  case 'shiv1': {
    const clear = (e.defer||0) * (enraged(e) ? 1 : 0.5);
    e.defer = Math.max(0, (e.defer||0) - clear);
    fx(S,{t:'bloodlet', x:e.x, y:e.y, v:Math.round(clear)});
    break; }
  case 'shiv2': {
    const wasEnraged = enraged(e);
    const fromX = e.x, fromY = e.y;            // where the dash STARTED — the echo retraces this
    sliceAndDice(S, p, fromX, fromY, tx, ty, V, false);
    if (wasEnraged)
      addZone(S,{kind:'echo', team:e.team, x:fromX, y:fromY, r:120, t:1,
                 ox:fromX, oy:fromY, tx:e.x, ty:e.y, dmg:V, src:e.id, slot:p.slot});
    break; }
  case 'shiv3':
    // a visible wind-up, then a dash — the target has half a second to move
    e.castLock = 0.55;
    addZone(S,{kind:'killingblow', team:e.team, x:e.x, y:e.y, r:60, t:0.55,
               ox:e.x, oy:e.y, tx:tx, ty:ty, dmg:V, src:e.id, slot:p.slot});
    fx(S,{t:'windup', x:e.x, y:e.y, x2:tx, y2:ty});
    break;
  /* ---- SVAAR ---- */
  case 'svaar0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'boulder', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1150, vy:Math.sin(a)*1150, life:780/1150, dmg:V, src:e.id, r:24,
      stun:1.4, col:'#8fb8ff'});
    break; }
  case 'svaar1': {
    for (const q of S.players){
      if (q.team!==e.team || !q.hero || q.hero.dead) continue;
      if (dist(q.hero.x, q.hero.y, e.x, e.y) > 700) continue;
      q.hero.armT = 8; q.hero.armB = V;
      q.hero.msT = 8; q.hero.msP = .20;
      fx(S,{t:'buff', x:q.hero.x, y:q.hero.y, col:'#8fb8ff'});
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:700, col:'#8fb8ff'});
    break; }
  case 'svaar2': break;                        // Great Cleave is passive
  case 'svaar3':
    e.gsT = 20; e.gsP = V/100;
    updateHeroStats(S,p);
    fx(S,{t:'blast', x:e.x, y:e.y, r:240, col:'#bcd4ff'});
    break;
  /* ---- THORNE ---- */
  case 'thorne0': {
    const mine = S.zones.filter(z=>z.kind==='trap' && z.team===e.team);
    if (mine.length>=3) S.zones.splice(S.zones.indexOf(mine[0]),1);   // oldest one goes
    addZone(S,{kind:'trap', team:e.team, x:tx, y:ty, r:130, t:45, arm:1, dmg:V, src:e.id});
    fx(S,{t:'buff', x:tx, y:ty, col:'#7fdc6a'});
    break; }
  case 'thorne1':
    e.barbT = 6; e.barbV = V;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#7fdc6a'});
    break;
  case 'thorne2':
    addZone(S,{kind:'thicket', team:e.team, x:tx, y:ty, r:230, t:5,
      dps:V, slow:.45, src:e.id, tickT:0});
    break;
  case 'thorne3':
    fx(S,{t:'blast', x:tx, y:ty, r:330, col:'#7fdc6a'});
    aoe(S, e.team, tx, ty, 330, 0, e, o=>{ applyRoot(S,o,2); applyDot(S,o,V/2,2,e.id); });
    break;
  /* ---- KRELL ---- */
  case 'krell0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1250, vy:Math.sin(a)*1250, life:820/1250, dmg:V, src:e.id, r:16,
      sil:2, col:'#6ce0e8'});
    break; }
  case 'krell1': {
    let drained = 0;
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type==='tower') continue;
      if (dist(o.x,o.y,e.x,e.y) > 360) continue;
      let take;
      if (o.maxMp>0){ take = Math.min(o.mp||0, V); o.mp = Math.max(0, (o.mp||0) - take); }
      else take = V*0.5;                       // creeps have no mana pool to burn
      drained += take;
      damage(S, e, o, take, {ability:true});
    }
    e.mp = Math.min(e.maxMp, e.mp + drained*0.5);
    fx(S,{t:'blast', x:e.x, y:e.y, r:360, col:'#6ce0e8'});
    break; }
  case 'krell2': {
    const tg = nearestFoe(S, e.team, tx, ty, 320);
    if (tg){
      tg.shield=0; tg.shieldT=0; tg.shieldRef=0;
      tg.asT=0; tg.lsT=0; tg.msT=0; tg.armT=0; tg.regT=0;
      tg.drT=0; tg.rendT=0; tg.barbT=0; tg.hasteT=0;
      if (tg.colT>0) tg.colT = 0.01;           // expires next tick and drops the bonus HP
      fx(S,{t:'blast', x:tg.x, y:tg.y, r:130, col:'#6ce0e8'});
      damage(S, e, tg, V, {ability:true});
    }
    break; }
  case 'krell3':
    fx(S,{t:'blast', x:tx, y:ty, r:380, col:'#6ce0e8'});
    aoe(S, e.team, tx, ty, 380, V, e, o=>{ applySilence(S,o,3); });
    break;
  case 'nix3': {
    for (let n=0;n<3;n++){
      const a2 = (n/3)*Math.PI*2;
      spawnIllusion(S, p, e.x+Math.cos(a2)*54, e.y+Math.sin(a2)*54, 20, V/100, l, true);
    }
    e.msT=6; e.msP=.25;
    fx(S,{t:'blast', x:e.x, y:e.y, r:150, col:'#ff7fd0'});
    break; }
  }
  if (A.blink && (e.x!==wasX || e.y!==wasY)) disjoint(S, e);
}
/* Full rage: Shiv's abilities all get their second gear. */
export function enraged(e){ return !!(e && e.rageOn && e.rage>=100); }
/* The dash itself, shared by the cast and by the rage echo. */
export function sliceAndDice(S, p, ox, oy, tx, ty, V, isEcho){
  const e = p.hero;
  let hits = 0;
  if (!isEcho){
    if (e.dead) return 0;
    e.x = tx; e.y = ty; clampToLane(e);
    tx = e.x; ty = e.y;
  }
  fx(S,{t:'dash', x:ox, y:oy, x2:tx, y2:ty, col: isEcho ? '#ff6b6b88' : '#ff6b6b'});
  const len2 = Math.max(1, (tx-ox)*(tx-ox) + (ty-oy)*(ty-oy));
  for (const o of S.ents){
    if (o.dead || o.team===e.team || o.type==='tower') continue;
    const t2 = clamp(((o.x-ox)*(tx-ox) + (o.y-oy)*(ty-oy)) / len2, 0, 1);
    const px = ox + (tx-ox)*t2, py = oy + (ty-oy)*t2;
    if (dist(px,py,o.x,o.y) > 120 + o.r) continue;
    damage(S, e, o, V, {ability:true});
    // the echo pays its own way by shortening the cooldown
    if (isEcho && !o.dead) hits += (o.type==='hero' ? 3 : 1);
    else if (isEcho) hits += (o.type==='hero' ? 3 : 1);
  }
  if (isEcho && hits>0){
    p.cds[2] = Math.max(0, p.cds[2] - hits);
    fx(S,{t:'cdcut', x:e.x, y:e.y, v:hits});
  }
  return hits;
}
/* an illusion copies the hero's look and a fraction of its damage, and dies to a stiff breeze */
/* An illusion inherits Nix's current damage, attack speed, armor and health pool,
   so it keeps scaling as she buys items and levels up. */
/* Illusions scale on every axis with the rank of the ability that made them:
   health, attack speed, how much punishment they soak, and how little they do to towers. */
export function illuScale(lvl, ult){
  return {
    hp:    ult ? 0.62 + 0.06*lvl : 0.42 + 0.06*lvl,   // .68–.80  /  .48–.66
    aps:   ult ? 0.80 + 0.05*lvl : 0.65 + 0.05*lvl,   // .85–.95  /  .70–.85
    take:  ult ? 1.75 - 0.15*lvl : 2.05 - 0.15*lvl,   // 1.60–1.30 / 1.90–1.45
    tower: [0.20,0.22,0.24,0.26][Math.min(3,lvl-1)]    // 20% – 26% damage to buildings
  };
}
export function spawnIllusion(S, p, x, y, ttl, pct, lvl, ult){
  const h = p.hero;
  const sc = illuScale(lvl||1, !!ult);
  const hp = Math.round(h.maxHp*sc.hp);
  const e = spawnPet(S, p.team, x, y, ttl, {
    illu:true, heroId:p.heroId, owner:h.id, r:h.r*0.9,
    hp:hp, maxHp:hp,
    dmg:Math.round(h.dmg*pct), armor:Math.max(0, h.armor*0.5),
    range:h.range, bat:HEROES[p.heroId].bat, ranged:h.ranged, ms:h.ms,
    illuTake: sc.take, illuTower: sc.tower
  });
  e.aps = h.aps*sc.aps; e.baseAps = e.aps;
  return e;
}
