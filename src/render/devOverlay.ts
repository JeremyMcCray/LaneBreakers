// @ts-nocheck
/** Dev sandbox world overlays — ability rings, hitboxes, aggro radii. */
import { CREEP_ACQ, AUTO_ACQ, XP_RADIUS } from '../data/world';
import { HEROES } from '../data/heroes';
import { G } from '../app/state';
import { ctx } from './canvas';

const AB_COL = ['#5ef0c8', '#ffcc55', '#ff9ec4', '#ff5f5f'];

function ring(x, y, r, col, dash, w){
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = w || 2;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.restore();
}
function tag(x, y, text, col){
  ctx.save();
  ctx.font = '700 13px Segoe UI';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = '#07090fdd';
  ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = col;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Screen-space badge. Drawn after the HUD, which leaves the DPR transform set.
    Loud on purpose: tuned numbers must never be mistaken for shipped balance. */
export function drawDevBadge(){
  const D = G.dev;
  if (!D) return;
  const bits = [];
  if (D.tuned) bits.push(D.tuned + ' TUNED');
  if (D.frozen) bits.push('FROZEN');
  else if (Math.abs(D.timeScale - 1) > 1e-6) bits.push(D.timeScale + '× SPEED');
  if (D.freezeBots) bits.push('BOTS OFF');
  if (!bits.length) return;
  const text = 'SANDBOX · ' + bits.join(' · ');
  ctx.save();
  ctx.font = '800 10px Segoe UI';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 18;
  ctx.fillStyle = '#2a2140ee';
  ctx.fillRect(14, 42, w, 20);
  ctx.strokeStyle = '#b78cff'; ctx.lineWidth = 1;
  ctx.strokeRect(14.5, 42.5, w - 1, 19);
  ctx.fillStyle = '#d9c4ff';
  ctx.fillText(text, 23, 53);
  ctx.restore();
}

/** Called from render() inside the world transform. */
export function drawDevOverlay(v, own){
  const D = G.dev;
  if (!D || (!D.rings && !D.radii && !D.acq)) return;
  const me = v.ps[G.mySlot];

  if (D.rings && own && me){
    const H = HEROES[me.hid];
    // attack range first so the ability rings draw on top of it
    ring(own.x, own.y, own.rng || H.range, '#8b9ab4', [4, 8], 2);
    tag(own.x, own.y - (own.rng || H.range), 'ATK ' + Math.round(own.rng || H.range), '#8b9ab4');
    for (let i = 0; i < 4; i++){
      const A = H.abilities[i];
      if (!A.range && !A.aoe) continue;
      // stagger the labels around the circle so four abilities stay readable
      const a = -Math.PI / 2 + (i - 1.5) * 0.34;
      if (A.range){
        ring(own.x, own.y, A.range, AB_COL[i], [12, 10], 2);
        tag(own.x + Math.cos(a) * A.range, own.y + Math.sin(a) * A.range,
            A.key + ' ' + Math.round(A.range), AB_COL[i]);
      }
      if (A.aoe){
        // point-cast: show the blast at max range, so you see it where it would actually land.
        // self-cast (no range): it lands on you, so center it on the caster instead.
        const cx = A.range ? own.x + Math.cos(a) * A.range : own.x;
        const cy = A.range ? own.y + Math.sin(a) * A.range : own.y;
        ring(cx, cy, A.aoe, AB_COL[i], [3, 6], 1.5);
        tag(cx, cy + A.aoe + 12, A.key + ' aoe ' + Math.round(A.aoe), AB_COL[i]);
      }
    }
  }
  if (D.acq && own){
    ring(own.x, own.y, AUTO_ACQ, '#4aa8ff', [3, 10], 1.5);
    tag(own.x, own.y + AUTO_ACQ, 'auto-acquire ' + Math.round(AUTO_ACQ), '#4aa8ff');
    ring(own.x, own.y, XP_RADIUS, '#b78cff', [2, 14], 1.5);
    tag(own.x, own.y - XP_RADIUS, 'xp ' + Math.round(XP_RADIUS), '#b78cff');
  }
  if (D.radii){
    for (const e of v.e){
      ring(e.x, e.y, e.r, e.tm === G.myTeam ? '#4aa8ff88' : '#ff5f5f88', null, 1);
      if (e.ty === 1 && !D.acq) continue;
      if (e.ty === 1) ring(e.x, e.y, CREEP_ACQ, '#ff5f5f22', [2, 12], 1);
      if (e.ty === 2 && e.rng) ring(e.x, e.y, e.rng, '#ffcc5566', [6, 8], 1.5);
    }
  }
}
