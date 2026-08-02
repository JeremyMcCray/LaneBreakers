// @ts-nocheck
/** Render barrel — canvas helpers, world draw, HUD, main render(). */
export {
  cv, ctx, DECOR, makeDecor, ensureDecor, resize, camScale, w2s, s2w, ownHeroView, allyViews
} from './canvas';
export {
  drawTerrain, drawZones, hpBar, previewFor, heroPath, drawEntity,
  drawProjectiles, drawFxWorld, drawTowerAim, drawTargetReticle, drawOrderMarker,
  rr, fmtTime
} from './worldDraw';
export { drawHUD, wrapText } from './hud';
export { drawDevOverlay, drawDevBadge } from './devOverlay';

import { G } from '../app/state';
import { BASE_X, LANE_Y, WORLD_W, clamp, rnd, lerp, setCampsOpen } from '../data/world';
import { predictOwn } from '../app/shell';
import {
  cv, ctx, ensureDecor, camScale, ownHeroView, w2s
} from './canvas';
import {
  drawTerrain, drawHideout, drawZones, drawEntity, drawProjectiles, drawFxWorld,
  drawTowerAim, drawTargetReticle, drawOrderMarker
} from './worldDraw';
import { drawHUD } from './hud';
import { drawDevOverlay, drawDevBadge } from './devOverlay';

export function render(dt){
  const v = G.view; if (!v) return;
  {   // Shiv at full rage sees who is inside the Killing Blow window
    const me = v.ps[G.mySlot];
    G.execMark = !!(me && me.hid==='shiv' && me.rage>=100 && me.sk[3]>0);
  }
  ensureDecor();
  if (v.cs) setCampsOpen(v.cs);      // clients learn the open camp pockets from the wire
  const s = camScale();

  // ---- camera
  let own = ownHeroView(v);
  let ox = own?own.x:BASE_X[G.myTeam], oy = own?own.y:LANE_Y;
  if (G.mode==='client'){ const p = predictOwn(v, dt); if (p && own){ ox=p.x; oy=p.y; own = {...own, x:p.x, y:p.y}; } }
  const visW = G.cw/s, visH = G.ch/s;
  const tx = visW>=WORLD_W ? WORLD_W/2 : clamp(ox, visW/2, WORLD_W-visW/2);
  G.cam.x = lerp(G.cam.x, tx, Math.min(1, dt*9));
  G.cam.y = LANE_Y;
  G.shake = Math.max(0, G.shake - dt*46);
  const shx = rnd(-1,1)*G.shake, shy = rnd(-1,1)*G.shake;

  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = '#05070c'; ctx.fillRect(0,0,G.cw,G.ch);
  ctx.save();
  ctx.translate(G.cw/2 + shx*G.dpr, G.ch/2 + shy*G.dpr);
  ctx.scale(s,s);
  ctx.translate(-G.cam.x, -G.cam.y);

  drawTerrain();
  if (v.md==='hideout') drawHideout();   // cozy warm-up dressing under the action
  drawZones(v);
  drawTargetReticle(v, own);
  drawTowerAim(v);
  const ents = v.e.slice().sort((a,b)=>a.y-b.y);
  for (const e of ents){
    if (own && e.i===own.i) drawEntity(own, v, own); else drawEntity(e, v, own);
  }
  drawProjectiles(v);
  drawFxWorld(dt);
  if (own) drawOrderMarker();
  drawDevOverlay(v, own);
  ctx.restore();
  // Blackout — while MY hero is night-blind, the world past 180 units is simply gone.
  // Drawn in screen space over the world, under the HUD, so the interface stays usable.
  if (own && (own.st & 16777216)){
    const [px, py] = w2s(own.x, own.y);
    const r = 180*s;
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,10,0.94)';
    ctx.beginPath();
    ctx.rect(0, 0, G.cw, G.ch);
    ctx.arc(px, py, r, 0, 7);
    ctx.fill('evenodd');
    const grad = ctx.createRadialGradient(px, py, r*0.55, px, py, r);
    grad.addColorStop(0, 'rgba(3,5,10,0)');
    grad.addColorStop(1, 'rgba(3,5,10,0.94)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b0b8d833'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.stroke();
    ctx.restore();
  }
  drawHUD(v, own);
  drawDevBadge();
}
