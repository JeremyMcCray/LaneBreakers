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
import { ent, fx, mkEnt, nearbyHeroes, playerOf, spawnBrood, spawnPet } from './create';
import { damage, kill, addEmber, applyDot, applySlow, applyRoot, applySilence, applyStun,
         clearEmber, disjoint, warded } from './combat';
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
  // everything this cast does — now, or later out of a projectile or zone it leaves
  // behind — is booked against this ability slot on the post-game breakdown
  const slotTag = 'a'+i, projMark = S.projs.length, zoneMark = S.zones.length;
  S.tag = slotTag;
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
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ff9b4a'});
    fx(S,{t:'blast', x:e.x, y:e.y, r:140, col:'#ff9b4a'});
    break;
  case 'vex2':
    e.shield=V; e.shieldT=3; e.shieldRef=.6;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#8fe3ff'});
    fx(S,{t:'counter', x:e.x, y:e.y});
    break;
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
    fx(S,{t:'quake', x:e.x, y:e.y, r:220});
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
    let tg=null, bd=340;                     // heroes only — creeps cannot soak the mark
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type!=='hero') continue;
      const d = dist(o.x,o.y,tx,ty);
      if (d<bd){ bd=d; tg=o; }
    }
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
    for (let n=0;n<V;n++){
      const a = (n/V)*Math.PI*2 + rnd(0,1);
      spawnBrood(S, p, e.x+Math.cos(a)*54, e.y+Math.sin(a)*54, 20);
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:130, col:'#b78cff'});
    break; }
  case 'vhal1': {
    const brood = broodOf(S, e);
    fx(S,{t:'blast', x:tx, y:ty, r:200, col:'#c9a6ff'});
    for (const o of brood){
      const px=o.x, py=o.y;
      const a2 = Math.random()*Math.PI*2;
      o.x = tx + Math.cos(a2)*rnd(16,86); o.y = ty + Math.sin(a2)*rnd(16,86);
      clampToLane(o);
      o.aps = (o.baseAps || 1/0.9) * (1 + V/100);
      o.ls = .40; o.hasteT = 5;
      o.tid = 0; o.acqT = 0; o.leashX = undefined;   // re-acquire wherever they land
      fx(S,{t:'dash', x:px, y:py, x2:o.x, y2:o.y, col:'#b78cff'});
    }
    aoe(S, e.team, tx, ty, 200, 0, e, o=> applySlow(o,.30,2));
    break; }
  case 'vhal2': break;                         // Symbiosis is passive
  case 'vhal3':
    e.hiveT = 16; e.hiveP = V/100;
    addZone(S,{kind:'hive', team:e.team, follow:e.id, x:e.x, y:e.y, r:550, rr:550,
      t:16, iv:2, tickT:2, cap:8, slot:p.slot});
    fx(S,{t:'blast', x:e.x, y:e.y, r:300, col:'#c9a6ff'});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#b78cff'});
    break;
  /* ---- ASH ---- */
  case 'ash0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1150, vy:Math.sin(a)*1150, life:820/1150, dmg:V, src:e.id, r:17,
      emb:2, col:'#ffb347'});
    break; }
  case 'ash1': break;                          // Wildfire is passive
  case 'ash2': {
    fx(S,{t:'blast', x:tx, y:ty, r:300, col:'#ff8a4a'});
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type==='tower') continue;
      if (dist(o.x,o.y,tx,ty) > 300 + o.r) continue;
      const n = o.embN||0;
      if (n>0){
        fx(S,{t:'detonate', x:o.x, y:o.y, v:n});
        clearEmber(o);
        damage(S, e, o, V*n, {ability:true});
      } else {
        addEmber(S, o, 2, e);                  // nothing to blow out — light them instead
      }
    }
    break; }
  case 'ash3':
    addZone(S,{kind:'firestorm', team:e.team, x:tx, y:ty, r:380, t:6,
      dps:V, src:e.id, tickT:0, embT:0});
    fx(S,{t:'blast', x:tx, y:ty, r:380, col:'#ff8a4a'});
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
    const thp = 320 + Math.round(e.maxHp*0.25);          // the turret is built from Orrin's stats
    const t2 = spawnPet(S, e.team, tx, ty, 14, {static:true, ranged:true, r:15,
      hp:thp, maxHp:thp, dmg:V + Math.round(e.dmg*0.4), armor:2 + Math.round(e.armor*0.5),
      range:520, bat:1.1, ms:0, turret:true, oslot:p.slot});
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
      addZone(S,{kind:'echo', team:e.team, x:fromX, y:fromY, r:120, t:0.5,
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
  /* ---- LIORA ---- */
  case 'liora0': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    S.projs.push({id:S.nextId++, kind:'bolt', team:e.team, x:e.x, y:e.y-8,
      vx:Math.cos(a)*1150, vy:Math.sin(a)*1150, life:800/1150, dmg:V, src:e.id, r:16,
      slow:{p:.25,t:1.5}, col:'#8affd4'});
    break; }
  case 'liora1': {
    let tg=null, worst=1.01;                     // the most wounded ally near the cursor
    for (const q of S.players){
      if (q.team!==e.team || !q.hero || q.hero.dead) continue;
      if (dist(q.hero.x,q.hero.y,tx,ty) > 340) continue;
      const f2 = q.hero.hp/q.hero.maxHp;
      if (f2 < worst){ worst=f2; tg=q.hero; }
    }
    if (!tg) tg = e;
    heal(S, tg, V);
    fx(S,{t:'heal', x:tg.x, y:tg.y});
    fx(S,{t:'buff', x:tg.x, y:tg.y, col:'#8affd4'});
    break; }
  case 'liora2': {
    let tg=null, bd=340;
    for (const q of S.players){
      if (q.team!==e.team || !q.hero || q.hero.dead) continue;
      const d = dist(q.hero.x,q.hero.y,tx,ty);
      if (d<bd){ bd=d; tg=q.hero; }
    }
    if (!tg) tg = e;
    tg.shield=V; tg.shieldT=3; tg.shieldRef=0;
    tg.msT=2; tg.msP=Math.max(tg.msP||0,.20);
    fx(S,{t:'buff', x:tg.x, y:tg.y, col:'#bffff0'});
    break; }
  case 'liora3':
    addZone(S,{kind:'sanct', team:e.team, x:tx, y:ty, r:300, t:5, hps:V, src:e.id, tickT:0});
    fx(S,{t:'blast', x:tx, y:ty, r:300, col:'#8affd4'});
    break;
  /* ---- DREX ---- */
  case 'drex0':
    addZone(S,{kind:'bomb', team:e.team, x:tx, y:ty, r:200, t:.9, mt:.9, dmg:V, src:e.id});
    fx(S,{t:'telegraph', x:tx, y:ty, r:200, life:.9, col:'#ff7a3c'});
    break;
  case 'drex1': {
    const mines = S.zones.filter(z=>z.kind==='mine' && z.team===e.team);
    if (mines.length>=3) S.zones.splice(S.zones.indexOf(mines[0]),1);   // oldest one goes
    addZone(S,{kind:'mine', team:e.team, x:tx, y:ty, r:110, t:40, arm:1, dmg:V, src:e.id});
    fx(S,{t:'buff', x:tx, y:ty, col:'#ff7a3c'});
    break; }
  case 'drex2': {
    const ox=e.x, oy=e.y;
    e.x=tx; e.y=ty; clampToLane(e);
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#ff7a3c'});
    fx(S,{t:'blast', x:ox, y:oy, r:180, col:'#ff7a3c'});
    aoe(S, e.team, ox, oy, 180, V, e);
    break; }
  case 'drex3': {
    const a = Math.atan2(ty-e.y, tx-e.x);
    for (let n=0;n<4;n++){
      const d2 = 220 + n*200;
      const bx2 = e.x + Math.cos(a)*d2, by2 = e.y + Math.sin(a)*d2;
      const fuse = .55 + n*.22;
      addZone(S,{kind:'bomb', team:e.team, x:bx2, y:by2, r:170, t:fuse, mt:fuse, dmg:V, src:e.id});
      fx(S,{t:'telegraph', x:bx2, y:by2, r:170, life:fuse, col:'#ff7a3c'});
    }
    break; }
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
  /* ---- RONIN ---- */
  case 'ronin0':
    e.spinT = 3;
    e.csT = Math.max(e.csT||0, 3);              // spinning through everything magical
    addZone(S,{kind:'spin', team:e.team, follow:e.id, x:e.x, y:e.y, r:260, t:3,
      dps:V, slow:0, src:e.id, tickT:0});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ff9ec4'});
    break;
  case 'ronin1': {
    const w = spawnPet(S, e.team, tx, ty, 9, {static:true, ward:true, r:11,
      hp:70, maxHp:70, dmg:0, armor:0, range:0, bat:9, ms:0});
    addZone(S,{kind:'hward', team:e.team, follow:w.id, x:w.x, y:w.y, r:340, t:9,
      hps:V, tickT:0});
    fx(S,{t:'buff', x:w.x, y:w.y, col:'#8affd4'});
    break; }
  case 'ronin2': break;                        // Blade Dance is passive
  case 'ronin3': {
    const tg = nearestFoe(S, e.team, tx, ty, 340);
    if (tg){
      e.castLock = 2.1; e.invT = 2.2;
      addZone(S,{kind:'omni', team:e.team, x:e.x, y:e.y, ax:tg.x, ay:tg.y, r:420,
        t:2.2, n:6, iv:0.3, tickT:0, dmg:V, px:e.x, py:e.y, slot:p.slot});
      fx(S,{t:'blast', x:tg.x, y:tg.y, r:120, col:'#ffd9e8'});
    }
    break; }
  /* ---- ZAAL ---- */
  case 'zaal0':
    chainLightning(S, e, tx, ty, V, 5, .22, 480, '#9fd8ff');
    break;
  case 'zaal1':
    addZone(S,{kind:'strike', team:e.team, x:tx, y:ty, r:260, t:.5, mt:.5,
      dmg:V, stun:0.7, bolt:1, src:e.id, col:'#cfe9ff'});
    fx(S,{t:'telegraph', x:tx, y:ty, r:260, life:.5, col:'#9fd8ff'});
    break;
  case 'zaal2': break;                         // Static Field is passive
  case 'zaal3': {
    for (const q of S.players){
      if (q.team===e.team || !q.hero || q.hero.dead) continue;
      fx(S,{t:'lightning', x:q.hero.x, y:q.hero.y, r:140, col:'#cfe9ff'});
      damage(S, e, q.hero, V, {ability:true});
    }
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#9fd8ff'});
    break; }
  /* ---- JARAK ---- */
  case 'jarak0': {
    const a0 = Math.atan2(ty-e.y, tx-e.x);
    for (const off of [-0.20, 0, 0.20]){
      const a = a0 + off;
      S.projs.push({id:S.nextId++, kind:'axe', team:e.team, x:e.x, y:e.y-8,
        vx:Math.cos(a)*1250, vy:Math.sin(a)*1250, life:700/1250, dmg:V, src:e.id, r:15,
        slow:{p:.30,t:2}, col:'#7be0a4'});
    }
    break; }
  case 'jarak1': break;                        // Fervor is passive
  case 'jarak2':
    e.armT=8; e.armB=V; e.msT=8; e.msP=.20; e.bzT=8;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#7be0a4'});
    fx(S,{t:'blast', x:e.x, y:e.y, r:150, col:'#7be0a4'});
    break;
  case 'jarak3': {
    for (const q of S.players){
      if (q.team!==e.team || !q.hero || q.hero.dead) continue;
      if (dist(q.hero.x, q.hero.y, e.x, e.y) > 700) continue;
      q.hero.asT = 7; q.hero.asP = Math.max(q.hero.asP||0, V);
      q.hero.lsT = 7; q.hero.lsP = Math.max(q.hero.lsP||0, .30);
      fx(S,{t:'buff', x:q.hero.x, y:q.hero.y, col:'#7be0a4'});
    }
    fx(S,{t:'blast', x:e.x, y:e.y, r:700, col:'#7be0a4'});
    break; }
  /* ---- STRYG ---- */
  case 'stryg0':
    addZone(S,{kind:'strike', team:e.team, x:tx, y:ty, r:280, t:1.2, mt:1.2,
      dmg:V, sil:3, src:e.id, col:'#ff5f7a'});
    fx(S,{t:'telegraph', x:tx, y:ty, r:280, life:1.2, col:'#ff5f7a'});
    break;
  case 'stryg1':
    e.brT=8; e.brP=V/100; e.vulT=8; e.vulP=.20;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ff5f7a'});
    break;
  case 'stryg2': break;                        // Thirst is passive
  case 'stryg3': {
    let tg=null, bd=360;                       // heroes only — creeps cannot be ruptured
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type!=='hero') continue;
      const d = dist(o.x,o.y,tx,ty);
      if (d<bd){ bd=d; tg=o; }
    }
    if (tg && !warded(S, tg)){
      tg.rupT=6; tg.rupV=V; tg.rupSrc=e.id;
      tg.rupLx=tg.x; tg.rupLy=tg.y; tg.rupBank=0;
      fx(S,{t:'rupture', x:tg.x, y:tg.y});
    }
    break; }
  /* ---- VOSK ---- */
  case 'vosk0':
    addZone(S,{kind:'strike', team:e.team, x:tx, y:ty, r:240, t:.55, mt:.55,
      dmg:V, stun:1.4, src:e.id, col:'#c58aff'});
    fx(S,{t:'telegraph', x:tx, y:ty, r:240, life:.55, col:'#c58aff'});
    break;
  case 'vosk1':
    addZone(S,{kind:'edict', team:e.team, follow:e.id, x:e.x, y:e.y, r:340, t:8,
      iv:0.5, tickT:0.5, dmg:V, src:e.id});
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#c58aff'});
    break;
  case 'vosk2':
    chainLightning(S, e, tx, ty, V, 4, .18, 460, '#d8b0ff', o=> applySlow(o,.50,1));
    break;
  case 'vosk3':
    addZone(S,{kind:'nova', team:e.team, follow:e.id, x:e.x, y:e.y, r:340, t:12,
      iv:0.8, tickT:0.05, dmg:V, cost:22, slot:p.slot});
    fx(S,{t:'blast', x:e.x, y:e.y, r:340, col:'#c58aff'});
    break;
  }
  for (let n=projMark; n<S.projs.length; n++) if (!S.projs[n].tag) S.projs[n].tag = slotTag;
  for (let n=zoneMark; n<S.zones.length; n++) if (!S.zones[n].tag) S.zones[n].tag = slotTag;
  // Zaal's Static Field bleeds everything nearby every single time he casts
  if (H.id==='zaal' && p.sk[2]>0){
    const pct = H.abilities[2].val[p.sk[2]-1]/100;
    let n2 = 0;
    S.tag = 'a2';                                // the field, not the spell that set it off
    for (const o of S.ents){
      if (o.dead || o.team===e.team || o.type==='tower') continue;
      if (dist(o.x,o.y,e.x,e.y) > 700) continue;
      damage(S, e, o, o.hp*pct, {ability:true});
      n2++;
    }
    if (n2) fx(S,{t:'static', x:e.x, y:e.y, r:700});
  }
  S.tag = null;
  if (A.blink && (e.x!==wasX || e.y!==wasY)) disjoint(S, e);
}
/* A bolt that leaps from body to body, losing power with every jump.
   The first arc reaches out from the cast point; every one after it from the last body hit. */
export function chainLightning(S, src, x, y, dmg, jumps, fall, jumpR, col, onHit){
  const seen = [];
  let fromX = src.x, fromY = src.y - 8;
  let cx = x, cy = y, cur = dmg, n = 0;
  for (let k=0; k<jumps; k++){
    let best=null, bd = k===0 ? 320 : jumpR;
    for (const o of S.ents){
      if (o.dead || o.team===src.team || o.type==='tower') continue;
      if (seen.indexOf(o.id)>=0) continue;
      const d = dist(o.x,o.y,cx,cy);
      if (d<bd){ bd=d; best=o; }
    }
    if (!best) break;
    seen.push(best.id);
    fx(S,{t:'chain', x:fromX, y:fromY, x2:best.x, y2:best.y-6, col:col});
    fromX = best.x; fromY = best.y-6;
    cx = best.x; cy = best.y;
    damage(S, src, best, cur, {ability:true});
    if (onHit && !best.dead) onHit(best);
    cur *= (1 - fall);
    n++;
  }
  if (!n) fx(S,{t:'chain', x:src.x, y:src.y-8, x2:x, y2:y, col:col});
  return n;
}
/* Every spawnling still answering to this hero. */
export function broodOf(S, e){
  const out = [];
  for (const o of S.ents) if (!o.dead && o.brood && o.owner===e.id) out.push(o);
  return out;
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
    illu:true, heroId:p.heroId, owner:h.id, oslot:p.slot, r:h.r*0.9,
    hp:hp, maxHp:hp,
    dmg:Math.round(h.dmg*pct), armor:Math.max(0, h.armor*0.5),
    range:h.range, bat:HEROES[p.heroId].bat, ranged:h.ranged, ms:h.ms,
    illuTake: sc.take, illuTower: sc.tower
  });
  e.aps = h.aps*sc.aps; e.baseAps = e.aps;
  return e;
}
