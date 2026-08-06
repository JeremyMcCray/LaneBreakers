// @ts-nocheck
import {
  WORLD_W, WORLD_H, LANE_Y, BASE_X, TOWER_X, TEAM_COL, TEAM_COL_DK,
  CLEAVE_R, CLEAVE_ARC, SUDDEN_DEATH, MATCH_LIMIT, AUTO_ACQ,
  CAMP_OPEN, CAMP_X, CAMP_R, campY, HIDEOUT,
  laneHalf, clamp, dist, rnd, lerp
} from '../data/world';
import { HEROES } from '../data/heroes';
import { CAMP_VARIANTS } from '../data/camps';
import { ITEMS } from '../data/items';
import { previewHit, incomingDps, imminentHits } from '../sim/engine';
import { G } from '../app/state';
import { predictOwn } from '../app/shell';
import { part, ring, line } from './fx';
import { cv, ctx, camScale, w2s, ownHeroView } from './canvas';

export { drawTerrain } from './terrain';

/* mix two #rrggbb colors; t=0 gives a, t=1 gives b */
export function mixCol(a, b, t){
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa>>16)&255) + (((pb>>16)&255) - ((pa>>16)&255))*t);
  const g = Math.round(((pa>>8)&255)  + (((pb>>8)&255)  - ((pa>>8)&255))*t);
  const bl= Math.round((pa&255)       + ((pb&255)       - (pa&255))*t);
  return '#'+((1<<24)|(r<<16)|(g<<8)|bl).toString(16).slice(1);
}

/* ------------- the pre-game hideout — cozy set dressing --------------- */
/* Pure decoration in world space (mode 'hideout' only): a campfire nook with
   log seats, a lantern string over the dummy range, drifting fireflies and a
   wooden sign. Anchored to data/world.ts HIDEOUT so it hugs the sim fixtures. */
export function drawHideout(){
  const t = G.time;
  const F = HIDEOUT.FIRE, L = HIDEOUT.LIGHTS, SG = HIDEOUT.SIGN;

  // ---- rug + log seats around the fire
  ctx.save();
  ctx.fillStyle='#33202a'; ctx.strokeStyle='#553646'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.ellipse(F.x, F.y, 96, 58, 0, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#482e3c'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.ellipse(F.x, F.y, 72, 42, 0, 0, 7); ctx.stroke();
  for (let k=0;k<3;k++){
    const a = -0.55 + k*1.15, lx = F.x + Math.cos(a)*78, ly = F.y + Math.sin(a)*48;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(a + Math.PI/2);
    ctx.fillStyle='#4a3423'; ctx.strokeStyle='#6a4a2c'; ctx.lineWidth=2;
    rr(-17, -6, 34, 12, 5); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // ---- stone ring + flames
  ctx.fillStyle='#3d4450';
  for (let k=0;k<7;k++){
    const a = k/7*Math.PI*2;
    ctx.beginPath(); ctx.arc(F.x+Math.cos(a)*20, F.y+Math.sin(a)*13, 4.6, 0, 7); ctx.fill();
  }
  const flick = 1 + 0.13*Math.sin(t*11) + 0.07*Math.sin(t*23+1.7);
  ctx.globalCompositeOperation='lighter';
  const glow = ctx.createRadialGradient(F.x, F.y-6, 6, F.x, F.y-6, 300*flick);
  glow.addColorStop(0, 'rgba(255,170,80,0.32)');
  glow.addColorStop(0.4, 'rgba(255,140,60,0.10)');
  glow.addColorStop(1, 'rgba(255,120,50,0)');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(F.x, F.y-6, 300*flick, 0, 7); ctx.fill();
  for (let k=0;k<3;k++){                                  // three licking tongues of flame
    const w = (11-k*3)*flick, h = (26-k*6)*flick, sway = Math.sin(t*(6+k*2.3)+k)*3;
    ctx.fillStyle = ['#ff8c3a','#ffb35a','#ffe9a8'][k];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(F.x-w, F.y);
    ctx.quadraticCurveTo(F.x-w*0.6, F.y-h*0.55, F.x+sway, F.y-h);
    ctx.quadraticCurveTo(F.x+w*0.6, F.y-h*0.55, F.x+w, F.y);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let k=0;k<6;k++){                                  // sparks drifting up
    const ph = (t*0.55 + k*0.167) % 1;
    const sx = F.x + Math.sin(t*1.8 + k*2.6)*(6+ph*16), sy = F.y - 8 - ph*64;
    ctx.globalAlpha = (1-ph)*0.7;
    ctx.fillStyle = k%2 ? '#ffd9a0' : '#ff9b4a';
    ctx.beginPath(); ctx.arc(sx, sy, 1.6+(1-ph), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation='source-over';

  // ---- lantern string over the dummy range
  const poles = [ {x:L.x1, y:L.y}, {x:L.x2, y:L.y} ];
  ctx.strokeStyle='#4a3a28'; ctx.lineWidth=5; ctx.lineCap='round';
  for (const p of poles){
    ctx.beginPath(); ctx.moveTo(p.x, p.y+64); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  ctx.strokeStyle='#2c2620'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(L.x1, L.y);
  ctx.quadraticCurveTo((L.x1+L.x2)/2, L.y+34, L.x2, L.y);
  ctx.stroke();
  const N = 7;
  for (let k=1;k<N;k++){
    const s = k/N, omt = 1-s;
    // point on the quadratic + a light sway
    const bx = omt*omt*L.x1 + 2*omt*s*(L.x1+L.x2)/2 + s*s*L.x2;
    const by = omt*omt*L.y + 2*omt*s*(L.y+34) + s*s*L.y + 7 + Math.sin(t*1.4+k)*1.5;
    const pulse = 0.72 + 0.28*Math.sin(t*2.1 + k*1.9);
    ctx.strokeStyle='#2c2620'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(bx, by-7); ctx.lineTo(bx, by); ctx.stroke();
    ctx.globalCompositeOperation='lighter';
    const lg = ctx.createRadialGradient(bx, by, 1, bx, by, 26);
    lg.addColorStop(0, 'rgba(255,205,120,'+(0.5*pulse).toFixed(3)+')');
    lg.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle=lg; ctx.beginPath(); ctx.arc(bx, by, 26, 0, 7); ctx.fill();
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#ffd9a0'; ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, 7); ctx.fill();
    ctx.strokeStyle='#6a5430'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(bx, by, 4.6, 0, 7); ctx.stroke();
  }

  // ---- painted target rings under the static dummies
  for (const d of HIDEOUT.DUMMIES){
    ctx.strokeStyle='#ffffff14'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(d.x, d.y+12, 34, 15, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle='#ffffff0a';
    ctx.beginPath(); ctx.ellipse(d.x, d.y+12, 52, 23, 0, 0, 7); ctx.stroke();
  }

  // ---- fireflies wandering the nook
  ctx.globalCompositeOperation='lighter';
  for (let k=0;k<12;k++){
    const fx0 = 330 + ((k*173)%1250) + Math.sin(t*0.31+k*1.7)*66;
    const fy0 = LANE_Y + Math.cos(t*0.24+k*2.3)*140 + Math.sin(k*5.1)*30;
    const tw = 0.22 + 0.26*(0.5+0.5*Math.sin(t*1.6+k*4.9));
    ctx.globalAlpha = tw;
    ctx.fillStyle='#d8ffb0';
    ctx.beginPath(); ctx.arc(fx0, fy0, 2, 0, 7); ctx.fill();
    const fg = ctx.createRadialGradient(fx0, fy0, 0.5, fx0, fy0, 11);
    fg.addColorStop(0, 'rgba(200,255,170,0.5)'); fg.addColorStop(1, 'rgba(200,255,170,0)');
    ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(fx0, fy0, 11, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation='source-over';

  // ---- the sign
  ctx.save();
  ctx.translate(SG.x, SG.y); ctx.rotate(-0.045);
  ctx.strokeStyle='#5a3f26'; ctx.lineWidth=5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, -6); ctx.stroke();
  ctx.fillStyle='#6a4a2c'; ctx.strokeStyle='#3d2a18'; ctx.lineWidth=2;
  rr(-46, -30, 92, 26, 5); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#ffd9a0'; ctx.font='800 11px Segoe UI'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('THE HIDEOUT', 0, -17);
  ctx.restore();

  ctx.restore();
}

export function drawZones(v){
  for (const z of v.z){
    ctx.save();
    if (z.kd==='frost'){ ctx.fillStyle='#7fd4ff20'; ctx.strokeStyle='#7fd4ff70'; }
    else if (z.kd==='quake'){                     // Gruk's Quake — the ground itself cracks open
      // the whole patch of earth judders in place — one shared jitter, not per-element,
      // so the ring/cracks/rubble read as ONE shaking piece of ground
      const jx = Math.sin(G.time*31)*2.2, jy = Math.cos(G.time*27)*2.2;
      const cx = z.x+jx, cy = z.y+jy;
      const grd = ctx.createRadialGradient(cx,cy,z.r*0.1,cx,cy,z.r);
      grd.addColorStop(0,'#4a301855'); grd.addColorStop(1,'#4a301800');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,z.r,0,7); ctx.fill();
      ctx.strokeStyle='#d8a66a70'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(cx,cy,z.r,0,7); ctx.stroke();
      // fissures: fixed jagged paths (seeded off the loop index, not time) so they
      // read as cracked ground rather than crawling tendrils — only their ember
      // glow pulses with time
      ctx.lineCap='round';
      const nCr = 8;
      for (let k=0;k<nCr;k++){
        const baseA = k*2.399963;               // golden-angle spread — evenly spaced, never even
        const maxLen = z.r*(0.55+0.42*((k*0.618)%1));
        ctx.beginPath(); ctx.moveTo(cx,cy);
        for (let s=1;s<=4;s++){
          const rr2 = 16+(maxLen-16)*(s/4);
          const a = baseA + Math.sin(k*3.1+s*1.7)*0.32;
          ctx.lineTo(cx+Math.cos(a)*rr2, cy+Math.sin(a)*rr2);
        }
        const glow = 0.35+0.45*(0.5+0.5*Math.sin(G.time*9+k*1.3));
        ctx.strokeStyle = `rgba(255,138,74,${glow.toFixed(2)})`;
        ctx.lineWidth = 2.6; ctx.stroke();
        ctx.strokeStyle = '#2a1c0d99'; ctx.lineWidth = 1; ctx.stroke();
      }
      // rubble chunks hopping in place, each on its own beat
      for (let k=0;k<6;k++){
        const a = k/6*Math.PI*2 + 0.5;
        const rr3 = z.r*(0.35+0.45*((k*0.53)%1));
        const bx = cx+Math.cos(a)*rr3, by = cy+Math.sin(a)*rr3;
        const hop = Math.abs(Math.sin(G.time*8+k*1.9))*6;
        ctx.fillStyle='#00000055';
        ctx.beginPath(); ctx.ellipse(bx,by+4,4,1.6,0,0,7); ctx.fill();
        ctx.fillStyle='#c8945a'; ctx.strokeStyle='#5a3d1e'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(bx,by-hop,3,0,7); ctx.fill(); ctx.stroke();
      }
      ctx.restore(); continue; }
    else if (z.kd==='banner'){                    // Corvick's Warbanner — a planted rally flag
      ctx.fillStyle='#e0c47714'; ctx.strokeStyle='#e0c47770';
      ctx.lineWidth=2; ctx.setLineDash([11,9]); ctx.lineDashOffset=-G.time*10;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle='#5a4520'; ctx.lineWidth=4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(z.x,z.y+8); ctx.lineTo(z.x,z.y-58); ctx.stroke();
      const wave = Math.sin(G.time*3)*5;
      ctx.fillStyle='#e0c477'; ctx.strokeStyle='#6b5420'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y-56);
      ctx.quadraticCurveTo(z.x+26+wave, z.y-50, z.x+42, z.y-40);
      ctx.quadraticCurveTo(z.x+24+wave, z.y-32, z.x, z.y-24);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#00000055'; ctx.beginPath(); ctx.ellipse(z.x,z.y+9,14,5,0,0,7); ctx.fill();
      ctx.restore(); continue; }
    else if (z.kd==='thicket'){                   // Thorne's Wild Growth — thorned vines climbing out
      ctx.fillStyle='#7fdc6a18'; ctx.strokeStyle='#7fdc6a80';
      ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#5fae4a'; ctx.lineCap='round';
      for (let k=0;k<7;k++){
        const a = k/7*Math.PI*2 + k*0.9;
        const rr2 = z.r*(0.3+0.62*((k*0.41+G.time*0.22)%1));
        const vx = z.x+Math.cos(a)*rr2, vy = z.y+Math.sin(a)*rr2;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(z.x+Math.cos(a)*8, z.y+Math.sin(a)*8);
        ctx.quadraticCurveTo(z.x+Math.cos(a+.3)*rr2*.6, z.y+Math.sin(a+.3)*rr2*.6, vx, vy);
        ctx.stroke();
        ctx.fillStyle='#c9f06a';                  // a thorn tip at the end of each vine
        ctx.beginPath(); ctx.arc(vx, vy, 2.4, 0, 7); ctx.fill();
      }
      ctx.restore(); continue; }
    else if (z.kd==='killingblow'){
      ctx.strokeStyle='#ff6b6bcc'; ctx.lineWidth=5; ctx.setLineDash([10,8]);
      ctx.lineDashOffset = -G.time*50;
      ctx.beginPath(); ctx.moveTo(z.ox,z.oy); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle='#ff6b6b'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(z.tx,z.ty, 26+14*(z.t/0.55), 0, 7); ctx.stroke();
      ctx.restore(); continue;
    }
    else if (z.kd==='echo'){
      // the path it will retrace
      ctx.strokeStyle='#ff6b6b66'; ctx.lineWidth=4; ctx.setLineDash([9,8]);
      ctx.lineDashOffset = -G.time*44;
      ctx.beginPath(); ctx.moveTo(z.ox,z.oy); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
      // a ghost of Shiv: stands at the start, then sweeps the line in the last third
      const k = clamp((1 - z.t) / 0.66, 0, 1);
      const ease = k*k*(3-2*k);
      const gx = z.ox + (z.tx-z.ox)*ease, gy = z.oy + (z.ty-z.oy)*ease;
      const ang = Math.atan2(z.ty-z.oy, z.tx-z.ox);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.globalAlpha = 0.30 + 0.35*Math.sin(G.time*10) * (k<1?1:0) + 0.25*k;
      ctx.rotate(ang);
      ctx.fillStyle='#7a1f2b'; ctx.strokeStyle='#ff6b6b'; ctx.lineWidth=3;
      heroPath('shiv', 26); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#ffd9d9';
      ctx.beginPath(); ctx.moveTo(34,0); ctx.lineTo(24,6); ctx.lineTo(24,-6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // a countdown ring at the destination
      ctx.globalAlpha=.8; ctx.strokeStyle='#ff6b6b'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(z.tx, z.ty, 18+16*z.t, 0, 7); ctx.stroke();
      ctx.globalAlpha=1;
      ctx.restore(); continue;
    }
    else if (z.kd==='trap'){
      ctx.fillStyle='#7fdc6a12'; ctx.strokeStyle='#7fdc6a66';
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#7fdc6a'; ctx.lineWidth=2.5;
      for (let k=0;k<6;k++){
        const a=k/6*Math.PI*2 + G.time*0.6;
        ctx.beginPath();
        ctx.moveTo(z.x+Math.cos(a)*13, z.y+Math.sin(a)*13);
        ctx.lineTo(z.x+Math.cos(a)*23, z.y+Math.sin(a)*23);
        ctx.stroke();
      }
      ctx.restore(); continue;
    }
    else if (z.kd==='mine'){
      ctx.fillStyle='#ff7a3c14'; ctx.strokeStyle='#ff7a3c66';
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#ff7a3c'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(z.x,z.y,10,0,7); ctx.stroke();
      const blink = Math.floor(G.time*3)%2;
      if (blink){ ctx.fillStyle='#ff7a3c'; ctx.beginPath(); ctx.arc(z.x,z.y,3.5,0,7); ctx.fill(); }
      ctx.restore(); continue;
    }
    else if (z.kd==='omni'){ ctx.restore(); continue; }   // the slashes speak for themselves
    else if (z.kd==='yank'){ ctx.restore(); continue; }   // the suitcase does its own talking
    else if (z.kd==='arc'){ ctx.restore(); continue; }    // the chain fx is the whole spell
    else if (z.kd==='bat'){                               // Siege Bolt's batted creep
      // during the wind-up, show the line the creep is about to fly down;
      // the blinking creep itself is drawn by drawEntity
      if (z.mt>0){
        ctx.strokeStyle='#ff6b6b88'; ctx.lineWidth=3; ctx.setLineDash([10,8]);
        ctx.lineDashOffset=-G.time*80;
        ctx.beginPath(); ctx.moveTo(z.x,z.y); ctx.lineTo(z.tx,z.ty); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore(); continue;
    }
    else if (z.kd==='charge'){                            // a hero being carried down a line
      ctx.strokeStyle=(z.c||'#8fb8ff')+'88'; ctx.lineWidth=3; ctx.setLineDash([12,9]);
      ctx.lineDashOffset = -G.time*90;
      ctx.beginPath(); ctx.moveTo(z.x,z.y); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
      if (z.c){                       // a colored charge is Vex's Blade Rush — blades whirl around her
        ctx.strokeStyle=z.c; ctx.lineWidth=3;
        for (let k=0;k<3;k++){
          const a = G.time*14 + k/3*Math.PI*2;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r*0.55, a-0.55, a+0.55); ctx.stroke();
        }
      }
      ctx.restore(); continue;
    }
    else if (z.kd==='phantom'){                           // Nix's marked strike — dodge it or eat it
      ctx.strokeStyle='#ff7fd0aa'; ctx.lineWidth=3; ctx.setLineDash([10,8]);
      ctx.lineDashOffset = -G.time*50;
      ctx.beginPath(); ctx.moveTo(z.x,z.y); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#ff7fd018'; ctx.strokeStyle='#ff7fd0aa'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(z.tx,z.ty,z.r,0,7); ctx.fill(); ctx.stroke();
      const k2 = clamp(1 - z.t/(z.mt||0.45), 0, 1);       // fuse ring shrinking toward the blink
      ctx.beginPath(); ctx.arc(z.tx,z.ty,z.r*k2,0,7); ctx.strokeStyle='#ffffffcc'; ctx.stroke();
      ctx.restore(); continue;
    }
    else if (z.kd==='unleash'){                           // Vhal's marked landing — the brood is inbound
      ctx.fillStyle='#b78cff14'; ctx.strokeStyle='#b78cff88';
      ctx.lineWidth=2.5; ctx.setLineDash([9,8]); ctx.lineDashOffset=-G.time*40;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      const k2 = clamp(1 - z.t/(z.mt||0.5), 0, 1);
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r*k2,0,7); ctx.strokeStyle='#ffffffcc'; ctx.stroke();
      ctx.restore(); continue;
    }
    else if (z.kd==='chakout' || z.kd==='chakram' || z.kd==='chakret'){   // Timbersaw's blade, out working
      // the kill zone travels WITH the blade, so you can read where it will bite
      // on the way out and on the way home, not just where it parks
      ctx.fillStyle='#d9886218'; ctx.strokeStyle= z.kd==='chakram' ? '#d9886288' : '#d9886255';
      ctx.lineWidth=2.5; ctx.setLineDash(z.kd==='chakram' ? [] : [9,8]);
      ctx.lineDashOffset = -G.time*40;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.save();
      ctx.translate(z.x,z.y); ctx.rotate(G.time*14);
      ctx.fillStyle='#5a2f1a'; ctx.strokeStyle='#ffd9b0'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(0,0,17,0,7); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#ffd9b0';
      for (let k=0;k<8;k++){                              // saw teeth
        const a=k/8*Math.PI*2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*17, Math.sin(a)*17);
        ctx.lineTo(Math.cos(a+0.18)*26, Math.sin(a+0.18)*26);
        ctx.lineTo(Math.cos(a+0.42)*17, Math.sin(a+0.42)*17);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.restore(); continue;
    }
    else if (z.kd==='doors'){                             // Dorn's Service Doors
      // the corridor between them
      ctx.strokeStyle='#f0e6d244'; ctx.lineWidth=2; ctx.setLineDash([4,11]);
      ctx.lineDashOffset = -G.time*34;
      ctx.beginPath(); ctx.moveTo(z.x,z.y); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
      for (const [dx3,dy3] of [[z.x,z.y],[z.tx,z.ty]]){
        ctx.save();
        ctx.translate(dx3,dy3);
        // welcome mat
        ctx.strokeStyle='#f0e6d266'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.ellipse(0,10,30,11,0,0,7); ctx.stroke();
        // an upright doorway with a glowing opening
        ctx.fillStyle='#7a2b3ad9'; ctx.strokeStyle='#f0e6d2'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.rect(-17,-42,34,48); ctx.fill(); ctx.stroke();
        const gl = .40 + .28*Math.sin(G.time*5 + dx3*0.01);
        ctx.fillStyle='rgba(240,230,210,'+gl.toFixed(2)+')';
        ctx.fillRect(-11,-36,22,38);
        ctx.fillStyle='#7a2b3a';                          // door knob
        ctx.beginPath(); ctx.arc(6,-14,2.6,0,7); ctx.fill();
        ctx.restore();
      }
      ctx.restore(); continue;
    }
    else if (z.kd==='hward'){
      ctx.fillStyle='#8affd416'; ctx.strokeStyle='#8affd470';
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#8affd4'; ctx.lineWidth=2.5;
      for (let k=0;k<4;k++){
        const a=k/4*Math.PI*2 + G.time*1.3;
        ctx.beginPath(); ctx.arc(z.x, z.y, 15, a-0.42, a+0.42); ctx.stroke();
      }
      ctx.fillStyle='#8affd4'; ctx.beginPath(); ctx.arc(z.x,z.y,4,0,7); ctx.fill();
      ctx.restore(); continue;
    }
    else if (z.kd==='spin'){
      ctx.fillStyle='#ff9ec414'; ctx.strokeStyle='#ff9ec470';
      ctx.lineWidth=2; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#ffd9e8'; ctx.lineWidth=3;
      for (let k=0;k<3;k++){
        const a = G.time*9 + k/3*Math.PI*2;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r*0.72, a-0.5, a+0.5); ctx.stroke();
      }
      ctx.restore(); continue;
    }
    else if (z.kd==='hive'){                      // Vhal's reach — corpses inside get back up
      ctx.fillStyle='#b78cff10'; ctx.strokeStyle='#b78cff55';
      ctx.lineWidth=2; ctx.setLineDash([12,10]); ctx.lineDashOffset=-G.time*22;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore(); continue;
    }
    else if (z.kd==='firestorm'){
      ctx.fillStyle='#ff8a4a26'; ctx.strokeStyle='#ff8a4aaa';
      ctx.lineWidth=3; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#ffcc55'; ctx.lineWidth=2;
      for (let k=0;k<5;k++){
        const a = G.time*2.2 + k/5*Math.PI*2;
        const rr2 = z.r*(0.35 + 0.5*((k/5 + G.time*0.4)%1));
        ctx.beginPath(); ctx.arc(z.x, z.y, rr2, a-0.5, a+0.5); ctx.stroke();
      }
      ctx.restore(); continue;
    }
    // Diabolic Edict — a quiet violet field of sparks that pick targets one at a time.
    // Deliberately drawn NOTHING like Pulse Nova below it: dashed, dim, no beat.
    else if (z.kd==='edict'){
      ctx.fillStyle='#7a3ccf10'; ctx.strokeStyle='#9b5cff70';
      ctx.lineWidth=2; ctx.setLineDash([5,9]); ctx.lineDashOffset=-G.time*16;
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#c9a6ff';                     // loose sparks drifting outward
      for (let k=0;k<10;k++){
        const a = k/10*Math.PI*2 + G.time*0.5;
        const rr2 = z.r*(0.30 + 0.68*(((k*0.37) + G.time*0.35)%1));
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(z.x+Math.cos(a)*rr2, z.y+Math.sin(a)*rr2, 2.4, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore(); continue;
    }
    // Pulse Nova — hot magenta, a hard rim and a shockwave on every beat.
    else if (z.kd==='nova'){
      const beat = (G.time % 0.8)/0.8;              // matches the 0.8s pulse interval
      ctx.fillStyle='#ff7ae018'; ctx.strokeStyle='#ff7ae0';
      ctx.lineWidth=4; ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1 - beat;                  // the wave racing out to the rim
      ctx.strokeStyle='#ffd6f4'; ctx.lineWidth=5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r*beat, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle='#ff7ae0aa'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r*0.5, 0, 7); ctx.stroke();
      ctx.restore(); continue;
    }
    else if (z.kd==='strike'){ ctx.fillStyle=(z.c||'#bfe9ff')+'22'; ctx.strokeStyle=(z.c||'#bfe9ff')+'cc'; }
    else if (z.kd==='bomb' || z.kd==='blastoff'){ ctx.fillStyle='#ff7a3c26'; ctx.strokeStyle='#ff7a3caa'; }
    else if (z.kd==='essence'){ ctx.fillStyle='#d8a6ff26'; ctx.strokeStyle='#d8a6ffaa'; }
    else { ctx.fillStyle='#bfe9ff26'; ctx.strokeStyle='#bfe9ffaa'; }
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
    if (z.kd==='azero'){
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r*(1-z.t/0.65),0,7); ctx.strokeStyle='#ffffffcc'; ctx.stroke();
    }
    if (z.kd==='bomb' || z.kd==='strike' || z.kd==='blastoff' || z.kd==='essence'){  // fuse ring shrinking toward the blast
      const k2 = clamp(1 - z.t/(z.mt||0.9), 0, 1);
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r*k2,0,7); ctx.strokeStyle='#ffffffcc'; ctx.stroke();
    }
    if (z.kd==='blastoff'){                   // the arc he is about to fly along
      ctx.strokeStyle='#ff7a3c88'; ctx.lineWidth=2; ctx.setLineDash([9,7]);
      ctx.beginPath(); ctx.moveTo(z.x,z.y); ctx.lineTo(z.tx,z.ty); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

/* Health bar with a last-hit preview: the segment your next attack will remove is
   drawn as a bright ghost, and the whole bar turns gold when that attack would kill. */
export function hpBar(e, w, h, yoff, opt){
  opt = opt || {};
  const x=e.x-w/2, y=e.y-e.r-yoff;
  const f = clamp(e.h/e.mh,0,1);
  const mine = e.tm===G.myTeam;
  const prev = opt.preview || 0;
  const doomed = prev>0 && e.doomed;
  const lethal = prev>0 && !doomed && prev >= e.pred;

  ctx.fillStyle='#000000cc'; ctx.fillRect(x-2,y-2,w+4,h+4);      // heavy outline for readability
  ctx.fillStyle='#20242e';   ctx.fillRect(x,y,w,h);
  ctx.fillStyle = lethal ? '#ffcc55' : (mine ? '#3ddc84' : '#ff5f5f');
  ctx.fillRect(x,y,w*f,h);

  if (prev>0){
    const pf = clamp(prev/e.mh, 0, f);
    ctx.fillStyle = lethal ? '#fff6d0' : (doomed ? '#8b9ab4cc' : '#ffffffcc');
    ctx.fillRect(x + w*(f-pf), y, w*pf, h);
    ctx.fillStyle = '#00000066';
    ctx.fillRect(x + w*(f-pf) - 1, y, 1.5, h);
    // tick showing where incoming damage will drag the bar before your hit lands
    if (!lethal && e.pred < e.h){
      const px2 = x + w*clamp(e.pred/e.mh, 0, 1);
      ctx.fillStyle = '#ff5f5fcc'; ctx.fillRect(px2-1, y-2, 2, h+4);
    }
  }
  // segment ticks every 250 HP so you can read the bar at a glance
  const seg = e.mh>1200 ? 500 : 250;
  ctx.fillStyle='#00000070';
  for (let v=seg; v<e.mh; v+=seg) ctx.fillRect(x + w*(v/e.mh), y, 1, h);
  ctx.strokeStyle='#000000aa'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);

  if (opt.hpText){
    ctx.textAlign='center'; ctx.font='800 12px Segoe UI';
    ctx.lineWidth=3; ctx.strokeStyle='#000c';
    ctx.strokeText(Math.ceil(e.h), e.x, y-7);
    ctx.fillStyle = lethal ? '#ffcc55' : '#e6edf9';
    ctx.fillText(Math.ceil(e.h), e.x, y-7);
  }
  if (lethal){
    // gold chevron — "this one dies to your next hit"
    const yy = y - (opt.hpText?22:9) + Math.sin(G.time*11)*1.6;
    ctx.fillStyle='#ffcc55';
    ctx.beginPath(); ctx.moveTo(e.x, yy+7); ctx.lineTo(e.x-7, yy-2); ctx.lineTo(e.x+7, yy-2);
    ctx.closePath(); ctx.fill();
  } else if (doomed){
    // hollow grey chevron — it dies before your blow arrives, don't bother
    const yy = y - (opt.hpText?22:9);
    ctx.strokeStyle='#8b9ab4'; ctx.lineWidth=1.6;
    ctx.beginPath(); ctx.moveTo(e.x, yy+7); ctx.lineTo(e.x-7, yy-2); ctx.lineTo(e.x+7, yy-2);
    ctx.closePath(); ctx.stroke();
  }
}

/* how much my next attack would take off this unit, if it is in range */
/* How much HP this creep will have at the instant MY blow lands, and how much
   that blow will take off. Everything already in the air is subtracted first, so
   the gold arrow only appears when the last hit is actually yours. */
export function previewFor(e, own){
  e.pred = e.h; e.doomed = false;
  if (!own || e.ty!==1 || !e.pv) return 0;
  const d = dist(own.x, own.y, e.x, e.y);
  const reach = own.rng + e.r + own.r*0.4 + 12;
  if (d > reach) return 0;
  if (e.tm===G.myTeam && e.h/e.mh >= .5) return 0;   // can't deny above 50%
  const H = HEROES[own.hi] || {};
  // time until my hit connects: remaining swing cooldown + wind-up + flight
  const wind = own.wd>0 ? own.wd : clamp(0.18*(own.aiv||1), 0.06, 0.20);
  const eta = (own.acd||0) + wind + (H.projSpeed ? d/H.projSpeed : 0);
  let before = 0;
  for (const h of (e.im||[])) if (h[1]/100 < eta) before += h[0];
  before += (e.ih||0) * Math.max(0, eta - 0.45);     // sustained chip beyond the listed blows
  e.pred = e.h - before;
  e.doomed = e.pred <= 0;                            // someone else gets it first
  return e.pv[G.mySlot] || 0;
}
/* the silhouette for a hero id, centred on the origin and facing +x */
export function heroPath(hi, r){
  ctx.beginPath();
  if (hi==='vex'){ ctx.moveTo(r*1.15,0); ctx.lineTo(-r*.55,r*.9); ctx.lineTo(-r*.15,0); ctx.lineTo(-r*.55,-r*.9); }
  else if (hi==='brann'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.2,r*.95); ctx.lineTo(-r*.85,r*.5);
                          ctx.lineTo(-r*.85,-r*.5); ctx.lineTo(r*.2,-r*.95); }
  else if (hi==='sable'){ ctx.moveTo(r*1.25,0); ctx.lineTo(-r*.3,r*.6); ctx.lineTo(-r*.9,0); ctx.lineTo(-r*.3,-r*.6); }
  else if (hi==='ash'){ ctx.moveTo(r*1.1,0); ctx.lineTo(0,r*.75); ctx.lineTo(-r*.8,r*.4);
                        ctx.lineTo(-r*.45,0); ctx.lineTo(-r*.8,-r*.4); ctx.lineTo(0,-r*.75); }
  else if (hi==='orrin'){ ctx.moveTo(r*1.1,0); ctx.lineTo(r*.35,r*.55); ctx.lineTo(-r*.35,r*.95);
                          ctx.lineTo(-r*.95,0); ctx.lineTo(-r*.35,-r*.95); ctx.lineTo(r*.35,-r*.55); }
  else if (hi==='shiv'){ ctx.moveTo(r*1.25,0); ctx.lineTo(r*.1,r*.42); ctx.lineTo(-r*.55,r*.9);
                         ctx.lineTo(-r*.4,0); ctx.lineTo(-r*.55,-r*.9); ctx.lineTo(r*.1,-r*.42); }
  else if (hi==='svaar'){ ctx.moveTo(r*1.15,0); ctx.lineTo(r*.4,r*.75); ctx.lineTo(-r*.45,r*1.0);
                          ctx.lineTo(-r*.9,0); ctx.lineTo(-r*.45,-r*1.0); ctx.lineTo(r*.4,-r*.75); }
  else if (hi==='thorne'){ for(let i=0;i<8;i++){const a=i/8*Math.PI*2;
                             const rr2 = i%2 ? r*0.62 : r*1.12;
                             const q=[Math.cos(a)*rr2, Math.sin(a)*rr2];
                             i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  else if (hi==='nix'){ ctx.moveTo(r*1.2,0); ctx.lineTo(0,r*.7); ctx.lineTo(-r*.5,r*.35);
                        ctx.lineTo(-r*1.0,0); ctx.lineTo(-r*.5,-r*.35); ctx.lineTo(0,-r*.7); }
  else if (hi==='vhal'){ for(let i=0;i<3;i++){const a=i/3*Math.PI*2;
                          const q=[Math.cos(a)*r*1.05, Math.sin(a)*r*1.05];
                          i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  else if (hi==='geist'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.15,r*.5); ctx.lineTo(-r*.55,r*.9);
                          ctx.lineTo(-r*.85,0); ctx.lineTo(-r*.55,-r*.9); ctx.lineTo(r*.15,-r*.5); }  // a hooded countess, trailing her shroud
  else if (hi==='drex'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.45,r*.8); ctx.lineTo(-r*.7,r*.75);
                         ctx.lineTo(-r*.95,0); ctx.lineTo(-r*.7,-r*.75); ctx.lineTo(r*.45,-r*.8); }
  else if (hi==='ronin'){ ctx.moveTo(r*1.3,0); ctx.lineTo(r*.15,r*.5); ctx.lineTo(-r*.75,r*.7);
                          ctx.lineTo(-r*.45,0); ctx.lineTo(-r*.75,-r*.7); ctx.lineTo(r*.15,-r*.5); }
  else if (hi==='zaal'){ ctx.moveTo(r*1.15,0); ctx.lineTo(r*.1,r*.35); ctx.lineTo(r*.4,r*.62);
                         ctx.lineTo(-r*.9,r*.8); ctx.lineTo(-r*.3,r*.12); ctx.lineTo(-r*.85,-r*.15);
                         ctx.lineTo(-r*.2,-r*.78); ctx.lineTo(r*.35,-r*.5); }
  else if (hi==='jarak'){ ctx.moveTo(r*1.1,0); ctx.lineTo(r*.3,r*.5); ctx.lineTo(r*.55,r*1.05);
                          ctx.lineTo(-r*.5,r*.8); ctx.lineTo(-r*.95,0); ctx.lineTo(-r*.5,-r*.8);
                          ctx.lineTo(r*.55,-r*1.05); ctx.lineTo(r*.3,-r*.5); }
  else if (hi==='stryg'){ ctx.moveTo(r*1.3,0); ctx.lineTo(r*.35,r*.35); ctx.lineTo(r*.1,r*.9);
                          ctx.lineTo(-r*.6,r*.55); ctx.lineTo(-r*.85,0); ctx.lineTo(-r*.6,-r*.55);
                          ctx.lineTo(r*.1,-r*.9); ctx.lineTo(r*.35,-r*.35); }
  else if (hi==='vosk'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.15,r*.4); ctx.lineTo(r*.5,r*1.1);
                         ctx.lineTo(-r*.35,r*.6); ctx.lineTo(-r*1.05,r*.25); ctx.lineTo(-r*.6,0);
                         ctx.lineTo(-r*1.05,-r*.25); ctx.lineTo(-r*.35,-r*.6); ctx.lineTo(r*.5,-r*1.1);
                         ctx.lineTo(r*.15,-r*.4); }
  else if (hi==='dorn'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.6,r*.85); ctx.lineTo(-r*.85,r*.85);
                         ctx.lineTo(-r*.85,-r*.85); ctx.lineTo(r*.6,-r*.85); }   // a door, carried like a shield
  else if (hi==='timber'){ for(let i=0;i<10;i++){const a=i/10*Math.PI*2;         // a sawblade on legs
                             const rr2 = i%2 ? r*0.72 : r*1.1;
                             const q=[Math.cos(a)*rr2, Math.sin(a)*rr2];
                             i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  else if (hi==='drift'){ ctx.moveTo(r*1.25,0); ctx.lineTo(r*.05,r*.5); ctx.lineTo(-r*.75,r*.85);
                          ctx.lineTo(-r*.35,0); ctx.lineTo(-r*.75,-r*.85); ctx.lineTo(r*.05,-r*.5); }  // a long knife drifting forward
  else { for(let i=0;i<6;i++){const a=i/6*Math.PI*2; const q=[Math.cos(a)*r,Math.sin(a)*r];
          i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  ctx.closePath();
}
/* Burning stacks. Ash's whole kit is "ramp then cash in", so the count has to be
   readable from across the lane — one flame per ember, brighter as it fills up. */
export function emberPips(e){
  const n = e.eb||0;
  if (n<=0) return;
  const w = 8, y = e.y - e.r - (e.ty===0 ? 56 : 27);
  const x0 = e.x - (n*w)/2;
  ctx.save();
  for (let k=0;k<n;k++){
    const cx = x0 + k*w + w/2, f = Math.sin(G.time*9 + k*0.7);
    ctx.fillStyle = k>=5 ? '#fff0c0' : (k%2 ? '#ffcc55' : '#ff7a3c');
    ctx.beginPath();
    ctx.moveTo(cx, y - 5 - f*0.9);
    ctx.lineTo(cx + 3.1, y + 3);
    ctx.lineTo(cx - 3.1, y + 3);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/* Reactive Armor — Timbersaw's plating, one steel segment per stack (max 8),
   in the same row as the ember pips so it reads the same way at a glance. */
export function armorPips(e){
  const n = e.rn||0;
  if (n<=0) return;
  const w = 9, y = e.y - e.r - 68;
  const x0 = e.x - (n*w)/2;
  ctx.save();
  for (let k=0;k<n;k++){
    const cx = x0 + k*w + w/2;
    ctx.fillStyle = '#9fb0c4'; ctx.strokeStyle = '#48576c'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.rect(cx-3.4, y-4, 6.8, 8); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
/* Corvick's Warbanner rally — a gold glow on the body of anything (hero or
   creep) standing in the banner. It sits on the unit rather than floating
   above it, so a whole rallied wave reads as one warm mass instead of a row
   of icons. */
export function bannerAura(e){
  if (!(e.st&33554432)) return;
  const pulse = .5 + .5*Math.sin(G.time*3 + (e.i||0));
  ctx.save();
  ctx.fillStyle = '#e0c47726';
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r+5, 0, 7); ctx.fill();
  ctx.globalAlpha = .40 + .30*pulse;
  ctx.strokeStyle = '#e0c477'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(e.x, e.y, e.r+2, 0, 7); ctx.stroke();
  ctx.restore();
}
/* Debuff badges — same philosophy as the ember pips: what is WRONG with a unit
   must be readable from across the lane. One bold icon per debuff, in a row
   above everything else the unit is showing. The old tints and rings stay as
   reinforcement; these are the part you can actually read mid-fight. */
export function debuffBadges(e){
  const list = [];
  if (e.st&1)                list.push('stun');
  if (e.st&4096)             list.push('sil');
  if ((e.st&2) && !(e.st&1)) list.push('slow');   // a stunned unit is not "slowed"
  if (e.st&2048)             list.push('root');
  if (e.st&8388608)          list.push('rup');
  if (e.st&16777216)         list.push('blind');
  if (!list.length) return;
  const y = e.y - e.r - (e.ty===0 ? 76 : 44);
  const w = 21, x0 = e.x - ((list.length-1)*w)/2;
  const RING = {stun:'#ffe066', sil:'#6ce0e8', slow:'#9fdcff', root:'#7fdc6a', rup:'#ff2f4f', blind:'#b0b8d8'};
  ctx.save();
  ctx.lineCap = 'round';
  list.forEach((k, i)=>{
    const cx = x0 + i*w;
    const pulse = 1 + 0.10*Math.sin(G.time*8 + i*1.7);
    ctx.fillStyle = '#07090fd8';
    ctx.strokeStyle = RING[k]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, y, 9.5*pulse, 0, 7); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2.2;
    if (k==='stun'){                              // a spinning four-point star
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      for (let p=0;p<8;p++){
        const a = G.time*4 + p*Math.PI/4, r2 = p%2 ? 2.6 : 6.2;
        const px = cx + Math.cos(a)*r2, py = y + Math.sin(a)*r2;
        p ? ctx.lineTo(px,py) : ctx.moveTo(px,py);
      }
      ctx.closePath(); ctx.fill();
    } else if (k==='sil'){                        // a struck-through mouth
      ctx.strokeStyle = '#6ce0e8';
      ctx.beginPath(); ctx.arc(cx, y, 4.6, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx-6.5, y+6.5); ctx.lineTo(cx+6.5, y-6.5); ctx.stroke();
    } else if (k==='slow'){                       // a snowflake
      ctx.strokeStyle = '#9fdcff';
      for (let s=0;s<3;s++){
        const a = s*Math.PI/3 + Math.PI/6;
        ctx.beginPath();
        ctx.moveTo(cx-Math.cos(a)*6, y-Math.sin(a)*6);
        ctx.lineTo(cx+Math.cos(a)*6, y+Math.sin(a)*6);
        ctx.stroke();
      }
    } else if (k==='root'){                       // a sprouting root
      ctx.strokeStyle = '#7fdc6a';
      ctx.beginPath(); ctx.moveTo(cx, y+6); ctx.lineTo(cx, y-4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y+1); ctx.lineTo(cx-4.5, y-4.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y+1); ctx.lineTo(cx+4.5, y-4.5); ctx.stroke();
    } else if (k==='rup'){                        // a blood drop
      ctx.fillStyle = '#ff2f4f';
      ctx.beginPath();
      ctx.moveTo(cx, y-6);
      ctx.quadraticCurveTo(cx+4.6, y+1.5, cx, y+5.6);
      ctx.quadraticCurveTo(cx-4.6, y+1.5, cx, y-6);
      ctx.fill();
    } else if (k==='blind'){                      // a struck-through eye
      ctx.strokeStyle = '#b0b8d8';
      ctx.beginPath();
      ctx.moveTo(cx-6, y); ctx.quadraticCurveTo(cx, y-5.5, cx+6, y);
      ctx.quadraticCurveTo(cx, y+5.5, cx-6, y);
      ctx.stroke();
      ctx.fillStyle = '#b0b8d8';
      ctx.beginPath(); ctx.arc(cx, y, 1.9, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx-6.5, y+6.5); ctx.lineTo(cx+6.5, y-6.5); ctx.stroke();
    }
  });
  ctx.restore();
}
export function drawEntity(e, v, own){
  const mine = e.tm===G.myTeam;
  // neutrals (team 2) wear jungle gold; converted jungle creeps keep team colors
  const col = TEAM_COL[e.tm] || '#d8b45a', dk = TEAM_COL_DK[e.tm] || '#4a3d1d';
  ctx.save();
  if (e.ty===2){ // tower — a round stone keep with a war-crystal burning at its heart
    ctx.fillStyle='#00000066'; ctx.beginPath(); ctx.ellipse(e.x+6,e.y+18,e.r*1.25,e.r*.5,0,0,7); ctx.fill();
    // footing
    ctx.fillStyle='#1a212b'; ctx.strokeStyle='#0d1218'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+9,0,7); ctx.fill(); ctx.stroke();
    // wall, lit from the upper-left
    const wall = ctx.createRadialGradient(e.x-e.r*.35, e.y-e.r*.35, e.r*.2, e.x, e.y, e.r*1.25);
    wall.addColorStop(0, '#4d5a6e'); wall.addColorStop(.6, '#333e4e'); wall.addColorStop(1, '#232c39');
    ctx.fillStyle=wall; ctx.strokeStyle=col; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,7); ctx.fill(); ctx.stroke();
    // masonry courses
    ctx.strokeStyle='#161d27'; ctx.lineWidth=1.5; ctx.globalAlpha=.8;
    for (const rr2 of [e.r*.62, e.r*.84]){
      ctx.beginPath(); ctx.arc(e.x,e.y,rr2,0,7); ctx.stroke();
    }
    for (let k=0;k<12;k++){
      const a = k/12*Math.PI*2 + .26;
      ctx.beginPath();
      ctx.moveTo(e.x+Math.cos(a)*e.r*.62, e.y+Math.sin(a)*e.r*.62);
      ctx.lineTo(e.x+Math.cos(a)*e.r*.84, e.y+Math.sin(a)*e.r*.84);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    // crenellated parapet
    for (let k=0;k<8;k++){
      const a = k/8*Math.PI*2 + Math.PI/8;
      ctx.save();
      ctx.translate(e.x+Math.cos(a)*(e.r-3), e.y+Math.sin(a)*(e.r-3));
      ctx.rotate(a);
      ctx.fillStyle='#415063'; ctx.strokeStyle='#141a24'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.rect(-4.5,-6,9,12); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // inner court
    ctx.fillStyle='#131a23';
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r*.5,0,7); ctx.fill();
    // the war-crystal, hovering and pulsing
    const bob = Math.sin(G.time*2.4+e.i)*2.2, gy = e.y-6+bob;
    const pulse = .55+.3*Math.sin(G.time*2.2);
    const gl = ctx.createRadialGradient(e.x, gy, 3, e.x, gy, 34);
    gl.addColorStop(0, col+'88'); gl.addColorStop(1, col+'00');
    ctx.fillStyle=gl; ctx.globalAlpha=pulse+.2;
    ctx.beginPath(); ctx.arc(e.x, gy, 34, 0, 7); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=col; ctx.strokeStyle='#ffffff99'; ctx.lineWidth=1.5;
    ctx.beginPath();
    ctx.moveTo(e.x, gy-15); ctx.lineTo(e.x+9, gy); ctx.lineTo(e.x, gy+15); ctx.lineTo(e.x-9, gy);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ffffff'; ctx.globalAlpha=.8;
    ctx.beginPath(); ctx.moveTo(e.x, gy-15); ctx.lineTo(e.x+9, gy); ctx.lineTo(e.x, gy-1);
    ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
    // the war-banner streaming off the parapet
    {
      const fx0 = e.x + e.r*.72, fy0 = e.y - e.r*.72;
      ctx.strokeStyle='#5a4526'; ctx.lineWidth=3; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(fx0, fy0+6); ctx.lineTo(fx0, fy0-26); ctx.stroke();
      ctx.lineCap='butt';
      const wave = Math.sin(G.time*3.2 + e.i)*4;
      ctx.fillStyle=col; ctx.strokeStyle=dk; ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(fx0, fy0-25);
      ctx.quadraticCurveTo(fx0+16+wave, fy0-21, fx0+27, fy0-14);
      ctx.quadraticCurveTo(fx0+15+wave, fy0-9, fx0, fy0-5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // range circle
    const towerRange = e.rng || e.range || 720;
    ctx.strokeStyle = mine? '#4aa8ff22':'#ff5f5f26'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y,towerRange,0,7); ctx.stroke();
    if (e.st&16384){                          // backdoor-protected
      ctx.strokeStyle='#ffd166aa'; ctx.lineWidth=3; ctx.setLineDash([7,9]);
      ctx.lineDashOffset = -G.time*16;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+14,0,7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle='#ffd166'; ctx.font='700 9px Segoe UI'; ctx.textAlign='center';
      ctx.fillText('PROTECTED', e.x, e.y-e.r-26);
    }
    hpBar(e, 116, 9, 34);
    ctx.restore(); return;
  }
  const flash = (e.st&32)!==0;
  // full-rage Shiv burns
  if (e.ty===0 && e.hi==='shiv' && e.rg>=100){
    const pulse = 1 + 0.10*Math.sin(G.time*9);
    const gr = ctx.createRadialGradient(e.x, e.y, e.r*0.4, e.x, e.y, (e.r+30)*pulse);
    gr.addColorStop(0, '#ff6b6b00');
    gr.addColorStop(0.55, '#ff4a4a3a');
    gr.addColorStop(1, '#ffd16600');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(e.x, e.y, (e.r+30)*pulse, 0, 7); ctx.fill();
    ctx.strokeStyle = Math.floor(G.time*10)%2 ? '#ff6b6baa' : '#ffd166aa';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, (e.r+13)*pulse, 0, 7); ctx.stroke();
    // embers curling off him
    if (Math.random() < .55)
      part(e.x + rnd(-e.r*.8, e.r*.8), e.y + rnd(-4, e.r*.5),
           Math.random()<.5 ? '#ff6b6b' : '#ffd166', 1, 42, .55, 2.8, 55);
  }
  ctx.fillStyle='#00000055'; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.r*.55,e.r*.95,e.r*.4,0,0,7); ctx.fill();

  if (e.ty===1){ // creep
    const prev = previewFor(e, own);
    const HI = e.il ? (HEROES[e.hi]||HEROES.vex) : null;
    ctx.translate(e.x,e.y); ctx.rotate(e.fa);
    ctx.fillStyle = flash? '#fff' : dk; ctx.strokeStyle=col; ctx.lineWidth=3;
    if (e.il){                                   // illusion — wears the hero's silhouette
      ctx.globalAlpha = .82;
      ctx.fillStyle = flash? '#fff' : HI.col2; ctx.strokeStyle = HI.col;
      heroPath(e.hi, e.r); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (e.dm){                            // training dummy — straw man on a post
      ctx.rotate(-e.fa);                         // it stands upright whichever way it "faces"
      ctx.strokeStyle='#6a4a2c'; ctx.lineWidth=5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(0, e.r*1.05); ctx.lineTo(0, -e.r*0.45); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-e.r*0.95, -e.r*0.12); ctx.lineTo(e.r*0.95, -e.r*0.12); ctx.stroke();
      ctx.fillStyle = flash? '#fff' : '#c9a86a'; ctx.strokeStyle='#8a6a3c'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.ellipse(0, e.r*0.18, e.r*0.55, e.r*0.72, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -e.r*0.72, e.r*0.38, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#7a2626'; ctx.lineWidth=2;    // stitched target cross on the chest
      ctx.beginPath(); ctx.moveTo(-5, e.r*0.02); ctx.lineTo(5, e.r*0.34);
      ctx.moveTo(5, e.r*0.02); ctx.lineTo(-5, e.r*0.34); ctx.stroke();
      ctx.rotate(e.fa);
    } else if (e.tu){                            // turret
      ctx.beginPath(); ctx.rect(-e.r*.7,-e.r*.7,e.r*1.4,e.r*1.4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle=col; ctx.fillRect(e.r*.3,-2.5, e.r*1.1, 5);
    } else if (e.wa){                            // healing ward — a green cross, worth shooting
      ctx.rotate(-e.fa);                         // it has no facing, so keep the cross upright
      ctx.fillStyle = flash? '#fff' : '#1f7a5a'; ctx.strokeStyle='#8affd4'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(0,0,e.r,0,7); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#8affd4';
      ctx.fillRect(-e.r*.62,-e.r*.22, e.r*1.24, e.r*.44);
      ctx.fillRect(-e.r*.22,-e.r*.62, e.r*.44, e.r*1.24);
      ctx.rotate(e.fa);                          // back onto the shared transform
    } else if (e.jg && CAMP_VARIANTS[e.jg]){     // jungle creep — each variant its own body
      const V = CAMP_VARIANTS[e.jg];
      ctx.fillStyle = flash? '#fff' : V.col2;
      ctx.strokeStyle = e.ng ? V.col : col;      // converted ones wear their team's outline
      ctx.lineWidth = 3;
      if (e.jg==='swarm'){                       // spiky darting wedge
        ctx.beginPath();
        ctx.moveTo(e.r,0); ctx.lineTo(-e.r*.5,e.r*.9); ctx.lineTo(-e.r*.9,0); ctx.lineTo(-e.r*.5,-e.r*.9);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else if (e.jg==='brute'){                // hulking slab with tusks
        ctx.beginPath(); ctx.rect(-e.r*.75,-e.r*.75,e.r*1.5,e.r*1.5); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = V.col; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(e.r*.5,-e.r*.6); ctx.lineTo(e.r*1.15,-e.r*.25); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.r*.5, e.r*.6); ctx.lineTo(e.r*1.15, e.r*.25); ctx.stroke();
      } else if (e.jg==='storm'){                // diamond with a live spark
        ctx.beginPath();
        ctx.moveTo(e.r,0); ctx.lineTo(0,e.r); ctx.lineTo(-e.r,0); ctx.lineTo(0,-e.r);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle='#dff4ff'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-3,-6); ctx.lineTo(2,-1); ctx.lineTo(-2,1); ctx.lineTo(3,6); ctx.stroke();
      } else if (e.jg==='mender'){               // ring of petals, upright
        ctx.rotate(-e.fa);
        ctx.beginPath(); ctx.arc(0,0,e.r*.8,0,7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = V.col;
        for (let k=0;k<5;k++){
          const a = k/5*Math.PI*2 + G.time*.8;
          ctx.beginPath(); ctx.arc(Math.cos(a)*e.r*.75, Math.sin(a)*e.r*.75, 3.4, 0, 7); ctx.fill();
        }
        ctx.rotate(e.fa);
      } else if (e.jg==='howler'){               // lean crescent wolf, frost-fanged
        ctx.beginPath();
        ctx.moveTo(e.r,0); ctx.quadraticCurveTo(-e.r*.2, e.r*1.0, -e.r, e.r*.45);
        ctx.quadraticCurveTo(-e.r*.35, 0, -e.r, -e.r*.45);
        ctx.quadraticCurveTo(-e.r*.2, -e.r*1.0, e.r, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = V.col; ctx.lineWidth = 2;    // frosted fangs
        ctx.beginPath(); ctx.moveTo(e.r*.55,-4); ctx.lineTo(e.r*.95,-2);
        ctx.moveTo(e.r*.55, 4); ctx.lineTo(e.r*.95, 2); ctx.stroke();
      } else if (e.jg==='spitter'){              // squat blob with a dripping nozzle
        ctx.beginPath(); ctx.ellipse(-e.r*.15, 0, e.r*.85, e.r*.7, 0, 0, 7);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = V.col;
        ctx.beginPath(); ctx.rect(e.r*.4, -3.5, e.r*.75, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(e.r*1.2, 3+2*Math.sin(G.time*5), 2.4, 0, 7); ctx.fill();
      } else if (e.jg==='scarab'){               // round gilded beetle, shell agleam
        ctx.beginPath(); ctx.arc(0, 0, e.r*.9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = V.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-e.r*.9, 0); ctx.lineTo(e.r*.9, 0); ctx.stroke();
        ctx.fillStyle = V.col; ctx.globalAlpha = .55+.35*Math.sin(G.time*4);
        ctx.beginPath(); ctx.arc(-e.r*.25, -e.r*.3, 3, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else {                                   // ram — plated shell, horn forward
        ctx.beginPath();
        for (let k=0;k<6;k++){ const a=k/6*Math.PI*2;
          const px=Math.cos(a)*e.r*.85, py=Math.sin(a)*e.r*.85;
          k?ctx.lineTo(px,py):ctx.moveTo(px,py); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = V.col;
        ctx.beginPath(); ctx.moveTo(e.r*1.3,0); ctx.lineTo(e.r*.5,e.r*.35); ctx.lineTo(e.r*.5,-e.r*.35);
        ctx.closePath(); ctx.fill();
      }
    } else if (e.pet){                           // summoned wisp — a spectral dart wrapped in glow
      const halo = ctx.createRadialGradient(0,0,e.r*.2, 0,0, e.r*1.6);
      halo.addColorStop(0, col+'44'); halo.addColorStop(1, col+'00');
      ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,e.r*1.6,0,7); ctx.fill();
      ctx.fillStyle = flash? '#fff' : dk;
      ctx.beginPath();
      ctx.moveTo(e.r,0); ctx.lineTo(-e.r*.6,e.r*.9); ctx.lineTo(-e.r*.2,0); ctx.lineTo(-e.r*.6,-e.r*.9);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#ffffffcc';
      ctx.beginPath(); ctx.arc(e.r*.2, 0, 2.2, 0, 7); ctx.fill();
    } else if (e.r>=19){                         // melee man-at-arms: helm, pauldrons, kite shield
      ctx.fillStyle = flash? '#fff' : dk; ctx.lineWidth=2;
      for (const sgn of [-1,1]){                 // pauldrons peeking past the body
        ctx.beginPath(); ctx.arc(-e.r*.35, sgn*e.r*.6, e.r*.34, 0, 7); ctx.fill(); ctx.stroke();
      }
      ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(-e.r*.08, 0, e.r*.72, 0, 7); ctx.fill(); ctx.stroke();
      // sword resting over the top shoulder
      ctx.strokeStyle='#c9d2df'; ctx.lineWidth=2.2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(e.r*.05, -e.r*.7); ctx.lineTo(e.r*.85, -e.r*1.0); ctx.stroke();
      ctx.lineCap='butt';
      // steel helm with a team crest
      ctx.fillStyle = flash? '#fff' : '#a6b2c6'; ctx.strokeStyle='#39424f'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(-e.r*.14, 0, e.r*.42, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle=col; ctx.lineWidth=2.4;
      ctx.beginPath(); ctx.moveTo(-e.r*.48, 0); ctx.lineTo(e.r*.1, 0); ctx.stroke();
      // kite shield held out front
      ctx.fillStyle = flash? '#fff' : col; ctx.strokeStyle=dk; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r*.98, -.85, .85);
      ctx.arc(0, 0, e.r*.68, .85, -.85, true);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='#ffffff66'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(0, 0, e.r*.84, -.65, .65); ctx.stroke();
    } else {                                     // ranged acolyte: hooded robe, staff, burning orb
      ctx.beginPath();
      ctx.moveTo(e.r*.7,0);
      ctx.quadraticCurveTo(e.r*.2, e.r*.75, -e.r*.35, e.r*.6);
      ctx.quadraticCurveTo(-e.r*1.05, 0, -e.r*.35, -e.r*.6);
      ctx.quadraticCurveTo(e.r*.2, -e.r*.75, e.r*.7, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = flash? '#fff' : mixCol(dk, '#000000', .35);
      ctx.strokeStyle=col; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(e.r*.15, 0, e.r*.42, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#0a0d12';
      ctx.beginPath(); ctx.arc(e.r*.3, 0, e.r*.18, 0, 7); ctx.fill();
      // the staff, orb tipped toward the enemy
      ctx.strokeStyle='#7a5c36'; ctx.lineWidth=2.4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-e.r*.5, e.r*.55); ctx.lineTo(e.r*1.02, e.r*.3); ctx.stroke();
      ctx.lineCap='butt';
      ctx.fillStyle=col+'55';
      ctx.beginPath(); ctx.arc(e.r*1.02, e.r*.3, 5.5, 0, 7); ctx.fill();
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(e.r*1.02, e.r*.3, 3, 0, 7); ctx.fill();
      ctx.fillStyle='#ffffffcc';
      ctx.beginPath(); ctx.arc(e.r*1.02, e.r*.3, 1.3, 0, 7); ctx.fill();
    }
    // facing nub — kept on every creep so travel direction stays readable
    ctx.fillStyle='#ffffffcc';
    ctx.beginPath(); ctx.arc(e.r*.75, 0, 2.6, 0, 7); ctx.fill();
    ctx.restore();
    if (e.st&2){ ctx.fillStyle='#7fd4ff44'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,7); ctx.fill(); }
    if (e.st&512){ ctx.fillStyle='#b78cff44'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+5,0,7); ctx.fill(); }
    if (e.st&128){ ctx.strokeStyle='#c9f06a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+9,0,7); ctx.stroke(); }
    if (e.st&536870912){                        // Siege Bolt — batted: rapid red/white blink
      ctx.fillStyle = (Math.floor(G.time*16)%2) ? '#ff5f5fcc' : '#ffffffdd';
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+2,0,7); ctx.fill();
    }
    bannerAura(e);
    if (e.br){                                  // Symbiosis — the brood carries Vhal's mark
      ctx.strokeStyle='#b78cff'; ctx.lineWidth=2;
      ctx.globalAlpha = .35+.25*Math.sin(G.time*3+e.i);
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+5,0,7); ctx.stroke();
      ctx.globalAlpha=1;
    }
    hpBar(e, Math.max(46, e.r*2.9), 8, 15, {preview:prev, hpText:prev>0});
    emberPips(e);
    // no debuff badges on creeps — a whole slowed wave wearing icons is noise;
    // the subtle tints above are enough. Badges are for heroes only. The
    // Warbanner rally shows the same way: a glow on the body, drawn above.
    return;
  }
  // hero
  const H = HEROES[e.hi] || HEROES.vex;
  const bob = Math.sin(G.time*7 + e.i)* ((e.st&16)?2.5:1);
  ctx.translate(e.x, e.y+bob);
  if (e.st&8){ ctx.scale(1.28,1.28); }

  // ---- ground facing wedge: a bright cone on the floor showing where the hero looks
  ctx.save();
  ctx.rotate(e.fa);
  const wg = ctx.createLinearGradient(0,0,e.r+40,0);
  wg.addColorStop(0, H.col+'00'); wg.addColorStop(1, H.col+'88');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,e.r+40,-0.42,0.42); ctx.closePath(); ctx.fill();
  ctx.restore();

  // selection / team ring — an ally who is not you gets a softer double ring
  ctx.strokeStyle = col; ctx.lineWidth=3; ctx.globalAlpha=.9;
  ctx.beginPath(); ctx.arc(0,0,e.r+7,0,7); ctx.stroke(); ctx.globalAlpha=1;
  if (mine && e.sl!==G.mySlot){
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,0,e.r+11,0,7); ctx.stroke();
  }
  // attack-ready ring (own hero): sweeps around as the swing recharges, snaps white when ready
  if (mine && e.aiv>0){
    const rdy = e.acd<=0;
    const k = rdy ? 1 : clamp(1 - e.acd/e.aiv, 0, 1);
    ctx.strokeStyle = rdy ? '#ffffff' : '#ffcc55';
    ctx.lineWidth = rdy ? 4 : 3;
    ctx.beginPath(); ctx.arc(0,0,e.r+13, -Math.PI/2, -Math.PI/2 + k*Math.PI*2); ctx.stroke();
    if (rdy){ ctx.globalAlpha=.35+.25*Math.sin(G.time*9); ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(0,0,e.r+17,0,7); ctx.stroke(); ctx.globalAlpha=1; }
  }
  ctx.rotate(e.fa);
  if (e.hi==='vex' && (e.st & 65536)){
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = '#ff9b4a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0,0,e.r+16+Math.sin(G.time*10)*3,0,7); ctx.stroke();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0,0,e.r+10,0,7); ctx.stroke();
    for (let i=0;i<6;i++){
      const a = G.time*5 + i*0.9;
      const sx = Math.cos(a)*(e.r+8), sy = Math.sin(a)*(e.r+8);
      const ex = Math.cos(a)*(e.r+24), ey = Math.sin(a)*(e.r+24);
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
    }
    ctx.restore();
  }
  if (e.hi==='vex' && (e.st & 131072)){
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#8fe3ff'; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(0,0,e.r+14,0,7); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0,0,e.r+18,0,7); ctx.stroke();
    ctx.restore();
  }
  if (e.hi==='thorne' && (e.st & 67108864)){
    // Barbed Hide — a rotating ring of thorns, so the attacker can read the reflect
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#7fdc6a88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,e.r+8,0,7); ctx.stroke();
    ctx.strokeStyle = '#7fdc6a'; ctx.lineWidth = 2.4; ctx.lineCap='round';
    for (let k=0;k<10;k++){
      const a = k/10*Math.PI*2 + G.time*1.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*(e.r+8), Math.sin(a)*(e.r+8));
      ctx.lineTo(Math.cos(a)*(e.r+17), Math.sin(a)*(e.r+17));
      ctx.stroke();
    }
    ctx.restore();
  }
  if (e.hi==='jarak' && (e.st & 262144)){           // Undying Rage — he cannot drop below 1 HP
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35*Math.sin(G.time*10);
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0,0,e.r+13,0,7); ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff3cf'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0,0,e.r+19,0,7); ctx.stroke();
    ctx.restore();
  }
  if (e.hi==='gruk' && (e.st & 8)){
    ctx.save();
    const pulse = 0.75 + 0.25*Math.sin(G.time*6);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#ffb45a'; ctx.lineWidth = 3 + pulse*1.2;
    ctx.beginPath(); ctx.arc(0,0,e.r+22+8*pulse,0,7); ctx.stroke();
    ctx.strokeStyle = '#7f4f2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,e.r+12,0,7); ctx.stroke();
    ctx.translate(e.r*0.85, -e.r*0.18);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#8b5e2b'; ctx.strokeStyle = '#ffd7a0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(-5,-28,10,56); ctx.arc(0,-28,5,0,7); ctx.arc(0,28,5,0,7); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#5f3f1d'; ctx.beginPath(); ctx.arc(0,0,8,0,7); ctx.fill();
    ctx.restore();
  }
  const ultActive = e.hi==='svaar' && (e.st & 524288);
  const cBody = ultActive ? '#ff6b6b' : H.col;
  const cDark = ultActive ? '#9c2020' : H.col2;
  // soft magic under-glow in the hero's own color
  const aura = ctx.createRadialGradient(0,0,e.r*.3, 0,0, e.r+16);
  aura.addColorStop(0, cBody+'30'); aura.addColorStop(1, cBody+'00');
  ctx.fillStyle=aura; ctx.beginPath(); ctx.arc(0,0,e.r+16,0,7); ctx.fill();
  // the body — lit from the front, falling into the dark tone at the back
  if (flash){ ctx.fillStyle = ultActive ? '#fff2f2' : '#ffffff'; }
  else {
    const bg = ctx.createRadialGradient(e.r*.35, -e.r*.25, e.r*.15, 0, 0, e.r*1.35);
    bg.addColorStop(0, mixCol(cBody, '#ffffff', .38));
    bg.addColorStop(.45, cBody);
    bg.addColorStop(1, mixCol(cBody, cDark, .75));
    ctx.fillStyle = bg;
  }
  ctx.strokeStyle = cDark; ctx.lineWidth=3;
  heroPath(e.hi, e.r);
  ctx.fill(); ctx.stroke();
  // armor trim — an inner echo of the silhouette
  ctx.strokeStyle = cDark; ctx.globalAlpha = flash ? .25 : .55; ctx.lineWidth=1.5;
  heroPath(e.hi, e.r*.62); ctx.stroke(); ctx.globalAlpha=1;
  if (ultActive){
    ctx.save();
    ctx.globalAlpha = .55;
    ctx.strokeStyle = '#ffb3b3'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(0,0,e.r+16+Math.sin(G.time*8)*2.5,0,7); ctx.stroke();
    ctx.restore();
  }
  // bright forward spike — unambiguous "this is the front"
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(e.r+11,0); ctx.lineTo(e.r-1,6.5); ctx.lineTo(e.r-1,-6.5);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#00000066'; ctx.lineWidth=1; ctx.stroke();
  // weapon flick
  if (e.st&64){ ctx.strokeStyle='#fff'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(0,0,e.r+16,-0.7,0.7); ctx.stroke(); }
  if (e.st&1024){ ctx.strokeStyle='#ffffff77'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,e.r+15, Math.PI-0.55, Math.PI+0.55); ctx.stroke(); }
  ctx.restore();
  // status
  if (e.st&4){ ctx.strokeStyle='#8fe3ffcc'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+14,0,7); ctx.stroke(); }
  if (e.st&2){ ctx.fillStyle='#7fd4ff33'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+6,0,7); ctx.fill(); }
  if (e.st&1){
    ctx.fillStyle='#ffe066';
    for(let i=0;i<3;i++){const a=G.time*6+i*2.1; ctx.beginPath();
      ctx.arc(e.x+Math.cos(a)*20, e.y-e.r-16+Math.sin(a)*7, 4,0,7); ctx.fill();}
  }
  if (e.st&128){ ctx.strokeStyle='#c9f06a'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+20,0,7); ctx.stroke(); }
  if (e.st&256){ ctx.strokeStyle='#ffcf8f'; ctx.lineWidth=4; ctx.globalAlpha=.7;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+10,0,7); ctx.stroke(); ctx.globalAlpha=1; }
  if (e.st&512){ ctx.fillStyle='#b78cff33';
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+8,0,7); ctx.fill(); }
  bannerAura(e);
  if (e.st&2048){                                  // rooted — vines at the feet
    ctx.strokeStyle='#7fdc6a'; ctx.lineWidth=3;
    for (let k=0;k<4;k++){
      const a=k/4*Math.PI*2 + Math.PI/4;
      ctx.beginPath();
      ctx.arc(e.x, e.y+e.r*.35, e.r+6, a-0.38, a+0.38);
      ctx.stroke();
    }
  }
  if (e.st&32768){                                 // a tower has you in its sights
    const pulse = 0.55 + 0.45*Math.sin(G.time*7);
    ctx.strokeStyle='#ff5f5f'; ctx.lineWidth=3; ctx.globalAlpha=pulse;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+22,0,7); ctx.stroke();
    ctx.globalAlpha=pulse*0.9;
    for (let k=0;k<4;k++){                         // four inward-pointing ticks
      const a = k/4*Math.PI*2 + G.time*1.4;
      ctx.beginPath();
      ctx.moveTo(e.x+Math.cos(a)*(e.r+30), e.y+Math.sin(a)*(e.r+30));
      ctx.lineTo(e.x+Math.cos(a)*(e.r+18), e.y+Math.sin(a)*(e.r+18));
      ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  if (e.st&134217728){                             // Warmarch — anchored siege platform
    ctx.strokeStyle='#e0c477'; ctx.lineWidth=4;
    for (let k=0;k<4;k++){                         // four anchor struts braced into the ground
      const a = k/4*Math.PI*2 + Math.PI/4;
      ctx.beginPath();
      ctx.moveTo(e.x+Math.cos(a)*(e.r+2), e.y+Math.sin(a)*(e.r+2));
      ctx.lineTo(e.x+Math.cos(a)*(e.r+16), e.y+Math.sin(a)*(e.r+16));
      ctx.stroke();
    }
    ctx.globalAlpha=.35+.15*Math.sin(G.time*4);
    ctx.strokeStyle='#ffd98a'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+20,0,7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if (e.st&1048576){                               // Bladefury — a ring of moving steel
    ctx.strokeStyle='#ffd9e8'; ctx.lineWidth=3.5;
    for (let k=0;k<4;k++){
      const a = G.time*15 + k*Math.PI/2;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r+17, a-0.5, a+0.5); ctx.stroke();
    }
    ctx.strokeStyle='#ff9ec455'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+28,0,7); ctx.stroke();
  }
  if (e.st&2097152){                               // untouchable — Omnislash
    ctx.globalAlpha=.55+.35*Math.sin(G.time*14);
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=4.5;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+12,0,7); ctx.stroke();
    ctx.globalAlpha=1;
  }
  if (e.st&4194304){                               // Bloodrage
    ctx.globalAlpha=.75; ctx.strokeStyle='#ff5f7a'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+9,0,7); ctx.stroke();
    ctx.globalAlpha=1;
    if (Math.random()<.30)
      part(e.x+rnd(-e.r*.8,e.r*.8), e.y+rnd(-6,e.r*.5), '#ff5f7a', 1, 40, .5, 2.4, 40);
  }
  if (e.st&8388608){                               // ruptured — it only bites while they run
    const running = (e.st&16)!==0;
    const rr2 = e.r + 25 + (running ? Math.sin(G.time*10)*3 : 0);
    ctx.strokeStyle = running ? '#ff2f4f' : '#ff2f4f88';
    ctx.lineWidth = running ? 5 : 3.5;
    for (let k=0;k<3;k++){
      const a = k/3*Math.PI*2 + G.time*2.2;
      ctx.beginPath(); ctx.arc(e.x, e.y, rr2, a-0.30, a+0.30); ctx.stroke();
    }
    // running tears the wound wide open — a blood trail and a warning you can read
    if (running){
      if (Math.random()<.85)
        part(e.x+rnd(-e.r*.5,e.r*.5), e.y+e.r*.4, Math.random()<.7?'#ff2f4f':'#8a1020', 2, 60, .65, 3.2);
      ctx.fillStyle = Math.floor(G.time*6)%2 ? '#ff2f4f' : '#ffb0b0';
      ctx.font='800 10px Segoe UI'; ctx.textAlign='center';
      ctx.fillText('RUPTURED', e.x, e.y-e.r-94);
    }
  }
  if (e.st&8192){                                  // counterspell window
    ctx.strokeStyle='#ffd166'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+16,0,7); ctx.stroke();
    ctx.globalAlpha=.25; ctx.fillStyle='#ffd166';
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r+16,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
  if (e.st&4096){                                  // silenced
    ctx.strokeStyle='#6ce0e8'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(e.x, e.y-e.r-24, 9, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x-6.5, e.y-e.r-30.5); ctx.lineTo(e.x+6.5, e.y-e.r-17.5); ctx.stroke();
  }
  if (e.hi==='jarak' && (e.st&268435456)){         // Frenzied Charge — wind-up progress ring
    const k = clamp(e.ch||0, 0, 1);
    ctx.strokeStyle='#12301f'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r+20, 0, 7); ctx.stroke();
    ctx.strokeStyle = k>=1 ? '#dfffe9' : '#7be0a4'; ctx.lineWidth=5; ctx.lineCap='round';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r+20, -Math.PI/2, -Math.PI/2 + k*Math.PI*2); ctx.stroke();
    ctx.lineCap='butt';
    ctx.fillStyle='#7be0a4'; ctx.font='800 10px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('CHARGING', e.x, e.y-e.r-52);
  }
  hpBar(e, 86, 11, 30);
  if (!mine && G.execMark && e.h/e.mh < .35){
    const r2 = e.r + 26 + Math.sin(G.time*9)*2;
    ctx.strokeStyle='#ffd166'; ctx.lineWidth=3;
    for (let k=0;k<4;k++){
      const a = k*Math.PI/2 + Math.PI/4;
      ctx.beginPath(); ctx.arc(e.x, e.y, r2, a-0.30, a+0.30); ctx.stroke();
    }
    ctx.fillStyle='#ffd166'; ctx.font='800 10px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('EXECUTE', e.x, e.y-e.r-52);
  }
  // mana bar
  if (e.mmp>0){
    const x=e.x-43, y=e.y-e.r-30+13;
    ctx.fillStyle='#000000cc'; ctx.fillRect(x-2,y-1,90,7);
    ctx.fillStyle='#0b1830'; ctx.fillRect(x,y,86,5);
    ctx.fillStyle='#4a8ede'; ctx.fillRect(x,y,86*clamp(e.mp/e.mmp,0,1),5);
  }
  // rage sits with the hero it belongs to
  if (e.hi==='shiv'){
    const full = e.rg>=100;
    const x=e.x-43, y=e.y-e.r-30+20;
    ctx.fillStyle='#000000cc'; ctx.fillRect(x-2,y-1,90,6);
    ctx.fillStyle='#2a0f0f'; ctx.fillRect(x,y,86,4);
    ctx.fillStyle = full ? (Math.floor(G.time*8)%2 ? '#ffd166' : '#ff6b6b') : '#b33a3a';
    ctx.fillRect(x,y,86*clamp(e.rg/100,0,1),4);
    if (full){
      ctx.fillStyle='#ffd166'; ctx.font='800 8px Segoe UI'; ctx.textAlign='center';
      ctx.fillText('FULL RAGE', e.x, y-5);
    }
  }
  // Fervor pips — how deep Jarak is into the target he is already chewing on
  if (e.fvm>0){
    const x=e.x-43, y=e.y-e.r-30+20, pw=86/e.fvm;
    ctx.fillStyle='#000000cc'; ctx.fillRect(x-2,y-1,90,6);
    for (let k=0;k<e.fvm;k++){
      ctx.fillStyle = k<e.fv ? '#7be0a4' : '#12301f';
      ctx.fillRect(x+k*pw+1, y, pw-2, 4);
    }
  }
  // Jarak's grip — a badge beside the bars showing which stance he is holding
  if (e.hi==='jarak'){
    const rangedStance = !!(e.st&1073741824);
    const bx=e.x+54, by=e.y-e.r-24;
    ctx.fillStyle='#000000cc';
    ctx.beginPath(); ctx.arc(bx,by,9,0,7); ctx.fill();
    ctx.strokeStyle='#7be0a4'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(bx,by,9,0,7); ctx.stroke();
    ctx.strokeStyle='#dfffe9'; ctx.lineWidth=2; ctx.lineCap='round';
    if (rangedStance){
      // thrown axe: an arrow flying right
      ctx.beginPath(); ctx.moveTo(bx-5,by); ctx.lineTo(bx+4.5,by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx+1,by-3.5); ctx.lineTo(bx+4.5,by); ctx.lineTo(bx+1,by+3.5); ctx.stroke();
    } else {
      // the blade: a diagonal edge with a short crossguard
      ctx.beginPath(); ctx.moveTo(bx-4,by+4); ctx.lineTo(bx+4.5,by-4.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx-3.6,by+0.4); ctx.lineTo(bx-0.4,by+3.6); ctx.stroke();
    }
    ctx.lineCap='butt';
  }
  ctx.fillStyle = mine? '#dfe7f5':'#ffc9c9';
  ctx.font = '700 13px Segoe UI, sans-serif'; ctx.textAlign='center';
  ctx.lineWidth=3; ctx.strokeStyle='#000a';
  ctx.strokeText(H.name, e.x, e.y-e.r-40);
  ctx.fillText(H.name, e.x, e.y-e.r-40);
  emberPips(e);
  armorPips(e);
  debuffBadges(e);
}

export function drawProjectiles(v){
  for (const q of v.p){
    ctx.save(); ctx.translate(q.x,q.y); ctx.rotate(q.a||0);
    if (q.kd==='atk'){                            // an arrow in flight
      const col = TEAM_COL[q.tm] || '#d8b45a';
      ctx.lineCap='round';
      ctx.strokeStyle=col+'55'; ctx.lineWidth=3;   // speed streak behind it
      ctx.beginPath(); ctx.moveTo(-18,0); ctx.lineTo(-9,0); ctx.stroke();
      ctx.strokeStyle='#c9b08a'; ctx.lineWidth=2;  // the shaft
      ctx.beginPath(); ctx.moveTo(-9,0); ctx.lineTo(7,0); ctx.stroke();
      ctx.fillStyle=col;                           // head
      ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(5,-3.4); ctx.lineTo(5,3.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=1.6;      // fletching
      ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-11.5,-3.2); ctx.moveTo(-8,0); ctx.lineTo(-11.5,3.2); ctx.stroke();
      ctx.lineCap='butt'; }
    else if (q.kd==='tower'){                     // a gout of crystal-fire from the keep
      const tail = ctx.createLinearGradient(-30,0,8,0);
      tail.addColorStop(0,'rgba(255,140,60,0)'); tail.addColorStop(1,'rgba(255,170,90,0.85)');
      ctx.fillStyle=tail;
      ctx.beginPath(); ctx.moveTo(-30,0); ctx.quadraticCurveTo(-8,-6.5,4,-4);
      ctx.lineTo(4,4); ctx.quadraticCurveTo(-8,6.5,-30,0); ctx.closePath(); ctx.fill();
      const halo = ctx.createRadialGradient(2,0,1, 2,0,14);
      halo.addColorStop(0,'rgba(255,210,138,0.9)'); halo.addColorStop(1,'rgba(255,150,60,0)');
      ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(2,0,14,0,7); ctx.fill();
      ctx.fillStyle='#ffd28a'; ctx.beginPath(); ctx.arc(2,0,6,0,7); ctx.fill();
      ctx.fillStyle='#fff6d0'; ctx.beginPath(); ctx.arc(3,0,2.8,0,7); ctx.fill(); }
    else if (q.kd==='chain'){                     // Timbersaw's grapple head, biting forward
      ctx.fillStyle='#d98862'; ctx.strokeStyle='#5a2f1a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(15,0); ctx.lineTo(-7,8); ctx.lineTo(-2,0); ctx.lineTo(-7,-8);
      ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else if (q.kd==='shock'){                     // Gruk's shockwave — a rolling ridge of stone
      ctx.strokeStyle='#d8a66a'; ctx.lineWidth=7; ctx.lineCap='round';
      ctx.shadowColor='#d8a66a'; ctx.shadowBlur=12;
      ctx.beginPath(); ctx.arc(-14,0,q.r,-1.1,1.1); ctx.stroke();
      ctx.strokeStyle='#8a5a2b'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(-22,0,q.r,-0.9,0.9); ctx.stroke(); }
    else {                                        // ability shot — a comet with a streaming tail
      let c2 = q.c||'#ffffff';
      if (c2.length===4) c2 = '#'+c2[1]+c2[1]+c2[2]+c2[2]+c2[3]+c2[3];
      const tail = ctx.createLinearGradient(-q.r*4.2,0,q.r,0);
      tail.addColorStop(0, c2+'00'); tail.addColorStop(1, c2+'aa');
      ctx.fillStyle=tail;
      ctx.beginPath(); ctx.moveTo(-q.r*4.2,0); ctx.lineTo(0,-q.r*.8); ctx.lineTo(0,q.r*.8);
      ctx.closePath(); ctx.fill();
      const halo = ctx.createRadialGradient(0,0,q.r*.3, 0,0, q.r*2.1);
      halo.addColorStop(0, c2+'66'); halo.addColorStop(1, c2+'00');
      ctx.fillStyle=halo; ctx.beginPath(); ctx.arc(0,0,q.r*2.1,0,7); ctx.fill();
      ctx.fillStyle=c2; ctx.beginPath(); ctx.ellipse(0,0,q.r*1.15,q.r*.75,0,0,7); ctx.fill();
      ctx.fillStyle='#ffffff'; ctx.globalAlpha=.85;
      ctx.beginPath(); ctx.arc(q.r*.25,0,q.r*.45,0,7); ctx.fill(); ctx.globalAlpha=1; }
    ctx.restore();
  }
}

export function drawFxWorld(dt){
  for (let i=G.parts.length-1;i>=0;i--){
    const p=G.parts[i]; p.life-=dt;
    if (p.life<=0){ G.parts.splice(i,1); continue; }
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=0.94; p.vy*=0.94;
    ctx.globalAlpha=clamp(p.life/p.max,0,1); ctx.fillStyle=p.col;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
  for (let i=G.rings.length-1;i>=0;i--){
    const r=G.rings[i]; r.life-=dt;
    if (r.life<=0){ G.rings.splice(i,1); continue; }
    const k = 1-r.life/r.max;
    ctx.globalAlpha = r.flat ? .5 : (1-k);
    ctx.strokeStyle=r.col; ctx.lineWidth=r.w;
    ctx.beginPath(); ctx.arc(r.x,r.y, r.flat? r.r : lerp(r.r0,r.r,k), 0,7); ctx.stroke();
  }
  ctx.globalAlpha=1;
  for (let i=G.lines.length-1;i>=0;i--){
    const l=G.lines[i]; l.life-=dt;
    if (l.life<=0){ G.lines.splice(i,1); continue; }
    ctx.globalAlpha=l.life/l.max; ctx.strokeStyle=l.col; ctx.lineWidth=l.w||7; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(l.x,l.y); ctx.lineTo(l.x2,l.y2); ctx.stroke();
  }
  ctx.globalAlpha=1;
  ctx.textAlign='center';
  for (let i=G.nums.length-1;i>=0;i--){
    const n=G.nums[i]; n.life-=dt*1.15;
    if (n.life<=0){ G.nums.splice(i,1); continue; }
    n.y += n.vy*dt; n.vy *= 0.94;
    n.x += (n.vx||0)*dt; n.vx = (n.vx||0)*0.92;
    ctx.globalAlpha=clamp(n.life*1.6,0,1);
    ctx.font='800 '+n.size+'px Segoe UI, sans-serif';
    ctx.lineWidth=4; ctx.strokeStyle='#000c'; ctx.strokeText(n.txt,n.x,n.y);
    ctx.fillStyle=n.col; ctx.fillText(n.txt,n.x,n.y);
  }
  ctx.globalAlpha=1;
}

/* attack-range circle + a bracket around whatever your hero is currently swinging at */
export function drawTowerAim(v){
  for (const t of v.e){
    if (t.ty!==2) continue;
    for (const o of v.e){
      if (o.ty!==0 || !(o.st&32768) || o.tm===t.tm) continue;
      if (dist(t.x,t.y,o.x,o.y) > 780) continue;
      ctx.save();
      ctx.strokeStyle = '#ff5f5f55'; ctx.lineWidth=2; ctx.setLineDash([6,10]);
      ctx.lineDashOffset = -G.time*40;
      ctx.beginPath(); ctx.moveTo(t.x, t.y-30); ctx.lineTo(o.x, o.y); ctx.stroke();
      ctx.restore();
    }
  }
}
export function drawTargetReticle(v, own){
  if (!own) return;
  ctx.save();
  ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 2; ctx.setLineDash([9,11]);
  ctx.beginPath(); ctx.arc(own.x, own.y, own.rng, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  let tgt = null;
  for (const e of v.e) if (e.i===own.ct) tgt = e;
  if (tgt && G.order.type==='attack' && G.order.au){
    ctx.strokeStyle = '#5ef0c855'; ctx.lineWidth = 1.5; ctx.setLineDash([4,8]);
    ctx.beginPath(); ctx.arc(own.x, own.y, AUTO_ACQ, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (tgt){
    const prev = previewFor(tgt, own);
    const lethal = prev>0 && !tgt.doomed && prev >= tgt.pred;
    const r = tgt.r + 11 + Math.sin(G.time*8)*1.5;
    ctx.strokeStyle = lethal ? '#ffcc55' : '#ffffffaa';
    ctx.lineWidth = lethal ? 3.5 : 2.5;
    for (let i=0;i<4;i++){
      const a = i*Math.PI/2 + Math.PI/4;
      ctx.beginPath(); ctx.arc(tgt.x, tgt.y, r, a-0.34, a+0.34); ctx.stroke();
    }
  }
  ctx.restore();
}
export function drawOrderMarker(){
  const o=G.order;
  if ((o.type==='move'||o.type==='amove') && G.time-(o.at||0) < .55){
    const k=(G.time-(o.at||0))/.55;
    ctx.strokeStyle = o.type==='amove'? '#ff9b4a':'#5ef0c8'; ctx.lineWidth=3;
    ctx.globalAlpha=1-k;
    ctx.beginPath(); ctx.arc(o.x,o.y, 10+22*k, 0,7); ctx.stroke();
    ctx.globalAlpha=1;
  }
}


G.hud = {ab:[], items:[]};
export function rr(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
export function fmtTime(t){
  const m=Math.floor(t/60), s=Math.floor(t%60);
  return m+':'+(s<10?'0':'')+s;
}

