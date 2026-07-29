// @ts-nocheck
import { G } from '../app/state';

/** Which inventory HUD slot contains screen point (mx, my). */
export function slotUnder(mx, my) {
  if (!G.hud || !G.hud.items) return -1;
  for (const b of G.hud.items)
    if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) return b.i;
  return -1;
}
