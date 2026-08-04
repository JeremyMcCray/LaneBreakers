// @ts-nocheck
/* Fantasy terrain renderer.
   The static world — cliff rock, pine forest, mossy lane, cobblestone road,
   arcane sanctums at the bases, jungle groves — is painted ONCE into an
   offscreen texture and blitted every frame. Only living light (crystals,
   rune rings, mist, drifting motes) is drawn per frame on top.
   The texture is rebuilt when the lane mode or open camp sides change. */
import {
  WORLD_W, WORLD_H, LANE_Y, BASE_X, LANE_HALF, TEAM_COL,
  CAMP_OPEN, CAMP_X, CAMP_R, campY, laneHalf, clamp
} from '../data/world';
import { G } from '../app/state';
import { ctx, camScale, ensureDecor } from './canvas';

const TEX = 1.5;                        // texture pixels per world unit
let tex = null, texKey = '';

const seeded = (seed)=>{ let s = seed>>>0;
  return ()=> (s = (s*1664525+1013904223)>>>0) / 4294967296; };

/* ------------------------- static texture ------------------------- */

function lanePath(c){
  c.beginPath();
  c.moveTo(0, LANE_Y-laneHalf(0));
  for (let x=0;x<=WORLD_W;x+=40) c.lineTo(x, LANE_Y-laneHalf(x));
  for (let x=WORLD_W;x>=0;x-=40) c.lineTo(x, LANE_Y+laneHalf(x));
  c.closePath();
}

function paintPine(c, x, y, r, sh){
  // canopy: overlapping blobs, lit from the upper-left
  c.fillStyle='#00000066';
  c.beginPath(); c.ellipse(x+r*0.25, y+r*0.5, r*1.05, r*0.4, 0, 0, 7); c.fill();
  const base = sh<0.35 ? '#122416' : sh<0.7 ? '#152a18' : '#122029';
  const lite = sh<0.35 ? '#26482a' : sh<0.7 ? '#2e5426' : '#254a52';
  for (let k=0;k<3;k++){
    const a = sh*6.28 + k*2.1, rr = r*(1-k*0.18);
    const px = x + Math.cos(a)*r*0.28, py = y + Math.sin(a)*r*0.22;
    c.fillStyle = base;
    c.beginPath(); c.arc(px, py, rr, 0, 7); c.fill();
    c.fillStyle = lite; c.globalAlpha = 0.8;
    c.beginPath(); c.arc(px-rr*0.32, py-rr*0.35, rr*0.55, 0, 7); c.fill();
    c.globalAlpha = 1;
  }
  // moonlit crown
  c.fillStyle='#9fd8c8'; c.globalAlpha=0.16;
  c.beginPath(); c.arc(x-r*0.35, y-r*0.4, r*0.4, 0, 7); c.fill();
  c.globalAlpha=1;
  c.strokeStyle='#0a1409'; c.lineWidth=1.5;
  c.beginPath(); c.arc(x, y, r*1.02, 0, 7); c.stroke();
}

function paintBoulder(c, x, y, r, sh){
  c.fillStyle='#00000055';
  c.beginPath(); c.ellipse(x+r*0.2, y+r*0.4, r*0.95, r*0.4, 0, 0, 7); c.fill();
  const rand = seeded(1+x*7+y*13);
  c.beginPath();
  for (let k=0;k<6;k++){
    const a = k/6*Math.PI*2 + sh, rr = r*(0.75+rand()*0.35);
    const px = x+Math.cos(a)*rr, py = y+Math.sin(a)*rr*0.85;
    k ? c.lineTo(px,py) : c.moveTo(px,py);
  }
  c.closePath();
  c.fillStyle = sh<0.5 ? '#222b37' : '#28323f'; c.fill();
  c.strokeStyle='#131a24'; c.lineWidth=1.5; c.stroke();
  c.fillStyle='#3c4a5d'; c.globalAlpha=0.6;
  c.beginPath(); c.ellipse(x-r*0.3, y-r*0.35, r*0.42, r*0.3, -0.5, 0, 7); c.fill();
  c.globalAlpha=1;
}

function paintShrooms(c, x, y, rand){
  for (let k=0;k<3;k++){
    const sx = x + (rand()-0.5)*26, sy = y + (rand()-0.5)*18, s = 2.4+rand()*2.6;
    const glow = c.createRadialGradient(sx, sy-s, 0.5, sx, sy-s, s*4.5);
    glow.addColorStop(0, 'rgba(140,220,255,0.30)');
    glow.addColorStop(1, 'rgba(140,220,255,0)');
    c.fillStyle = glow;
    c.beginPath(); c.arc(sx, sy-s, s*4.5, 0, 7); c.fill();
    c.strokeStyle='#b9d8c8'; c.lineWidth=1.2;
    c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy-s); c.stroke();
    c.fillStyle = k%2 ? '#79c7e8' : '#8fd4e0';
    c.beginPath(); c.arc(sx, sy-s, s, Math.PI, 0); c.closePath(); c.fill();
  }
}

function paintMonolith(c, x, y, h, tint){
  // a low standing stone with a carved glyph
  c.fillStyle='#00000066';
  c.beginPath(); c.ellipse(x, y+3, h*0.5, h*0.2, 0, 0, 7); c.fill();
  c.beginPath();
  c.moveTo(x-h*0.30, y);
  c.lineTo(x-h*0.24, y-h);
  c.lineTo(x+h*0.10, y-h*1.12);
  c.lineTo(x+h*0.30, y-h*0.2);
  c.lineTo(x+h*0.26, y);
  c.closePath();
  c.fillStyle='#2c3644'; c.fill();
  c.strokeStyle='#141b25'; c.lineWidth=1.5; c.stroke();
  c.strokeStyle='#4a5a70'; c.lineWidth=1;
  c.beginPath(); c.moveTo(x-h*0.22, y-h*0.15); c.lineTo(x-h*0.16, y-h*0.95); c.stroke();
  if (tint){
    c.strokeStyle=tint; c.globalAlpha=0.75; c.lineWidth=1.6; c.lineCap='round';
    c.beginPath();
    c.moveTo(x, y-h*0.85); c.lineTo(x, y-h*0.3);
    c.moveTo(x-h*0.11, y-h*0.68); c.lineTo(x+h*0.11, y-h*0.52);
    c.moveTo(x+h*0.11, y-h*0.68); c.lineTo(x-h*0.11, y-h*0.52);
    c.stroke();
    c.globalAlpha=1; c.lineCap='butt';
  }
}

function paintStatic(){
  const cv2 = document.createElement('canvas');
  cv2.width = Math.ceil(WORLD_W*TEX); cv2.height = Math.ceil(WORLD_H*TEX);
  const c = cv2.getContext('2d');
  c.scale(TEX, TEX);
  const rand = seeded(9241);

  // ---- bedrock
  c.fillStyle='#070b11'; c.fillRect(0,0,WORLD_W,WORLD_H);
  for (let k=0;k<300;k++){
    const x = rand()*WORLD_W, y = rand()*WORLD_H, r = 26+rand()*70;
    c.fillStyle = k%2 ? '#0a0f16' : '#0c1119'; c.globalAlpha=0.5;
    c.beginPath(); c.ellipse(x, y, r, r*0.6, rand()*3, 0, 7); c.fill();
  }
  c.globalAlpha=1;

  // ---- lane floor: moonlit moss and worn grass
  lanePath(c);
  const lg = c.createLinearGradient(0, LANE_Y-320, 0, LANE_Y+320);
  lg.addColorStop(0,   '#152316');
  lg.addColorStop(0.5, '#233722');
  lg.addColorStop(1,   '#152316');
  c.fillStyle = lg; c.fill();

  c.save(); lanePath(c); c.clip();
  // broad meadow variation first, detail patches on top
  for (let k=0;k<90;k++){
    const x = rand()*WORLD_W, y = LANE_Y + (rand()*2-1)*420;
    c.fillStyle = k%3 ? (k%2 ? '#2b4526' : '#1a2e1e') : '#25412f';
    c.globalAlpha=0.22;
    c.beginPath(); c.ellipse(x, y, 60+rand()*130, 30+rand()*60, rand()*3, 0, 7); c.fill();
  }
  const patchCols = ['#2a4423','#1a2c1a','#30491f','#142010','#264a30'];
  for (let k=0;k<520;k++){
    const x = rand()*WORLD_W, y = LANE_Y + (rand()*2-1)*420;
    c.fillStyle = patchCols[k%patchCols.length]; c.globalAlpha=0.34;
    c.beginPath(); c.ellipse(x, y, 12+rand()*34, 8+rand()*18, rand()*3, 0, 7); c.fill();
  }
  c.globalAlpha=1;
  // grass tufts
  c.strokeStyle='#33552c'; c.lineWidth=1.3; c.lineCap='round';
  for (let k=0;k<420;k++){
    const x = rand()*WORLD_W, y = LANE_Y + (rand()*2-1)*420;
    c.globalAlpha = 0.35+rand()*0.3;
    for (let b=0;b<3;b++){
      const a = -Math.PI/2 + (b-1)*0.5 + (rand()-0.5)*0.2, l = 4+rand()*4;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x+Math.cos(a)*l, y+Math.sin(a)*l); c.stroke();
    }
  }
  c.globalAlpha=1; c.lineCap='butt';
  // scattered pale pebbles and gold leaf-fall
  for (let k=0;k<160;k++){
    const x = rand()*WORLD_W, y = LANE_Y + (rand()*2-1)*420;
    c.fillStyle = k%3 ? '#3d4a3a' : '#77683a'; c.globalAlpha=0.4;
    c.beginPath(); c.ellipse(x, y, 1.6+rand()*2, 1.2+rand()*1.4, rand()*3, 0, 7); c.fill();
  }
  c.globalAlpha=1;
  c.restore();

  // ---- the cobblestone road
  const roadY0 = LANE_Y-42, roadH = 84;
  const rg = c.createLinearGradient(0, roadY0, 0, roadY0+roadH);
  rg.addColorStop(0, '#33291c'); rg.addColorStop(0.5, '#413521'); rg.addColorStop(1, '#33291c');
  c.fillStyle = rg;
  c.beginPath(); c.rect(BASE_X[0]-60, roadY0, BASE_X[1]-BASE_X[0]+120, roadH); c.fill();
  // ragged grassy edges eating into the road
  c.fillStyle='#1d2c1c';
  for (let x=BASE_X[0]-40; x<BASE_X[1]+40; x+=34){
    for (const sgn of [-1,1]){
      if (rand()<0.6) continue;
      const y = LANE_Y + sgn*42;
      c.globalAlpha=0.8;
      c.beginPath(); c.ellipse(x+rand()*20, y, 10+rand()*14, 4+rand()*4, 0, 0, 7); c.fill();
    }
  }
  c.globalAlpha=1;
  // cobbles
  const stoneCols = ['#4c4434','#544a38','#463c2d','#3f372b','#50462f'];
  for (let x=BASE_X[0]-30; x<BASE_X[1]+10; x+=27){
    for (let row=0; row<4; row++){
      if (rand()<0.07) continue;                    // a missing stone shows dirt
      const sx = x + (row%2)*13 + (rand()-0.5)*3;
      const sy = roadY0 + 6 + row*19 + (rand()-0.5)*2;
      c.fillStyle = stoneCols[(x/27+row)%5|0];
      c.globalAlpha = 0.85+rand()*0.15;
      c.beginPath();
      const w = 20+rand()*4, h = 14+rand()*3;
      c.moveTo(sx+3, sy); c.arcTo(sx+w, sy, sx+w, sy+h, 5); c.arcTo(sx+w, sy+h, sx, sy+h, 5);
      c.arcTo(sx, sy+h, sx, sy, 5); c.arcTo(sx, sy, sx+w, sy, 5); c.closePath();
      c.fill();
      c.strokeStyle='#241d12'; c.lineWidth=1; c.globalAlpha=0.5; c.stroke();
      c.globalAlpha=1;
    }
  }
  // wheel ruts worn into the stone
  c.strokeStyle='#221a0f'; c.globalAlpha=0.45; c.lineWidth=4;
  for (const off of [-14, 14]){
    c.beginPath(); c.moveTo(BASE_X[0], LANE_Y+off);
    for (let x=BASE_X[0]; x<=BASE_X[1]; x+=120) c.lineTo(x, LANE_Y+off+Math.sin(x*0.013)*3);
    c.stroke();
  }
  c.globalAlpha=1;

  // ---- ancient rune circle at mid-map, worn into the road
  {
    const mx = WORLD_W/2, my = LANE_Y;
    c.strokeStyle='#7fd4ff'; c.globalAlpha=0.14; c.lineWidth=9;
    c.beginPath(); c.arc(mx, my, 118, 0, 7); c.stroke();
    c.globalAlpha=0.10; c.lineWidth=3;
    c.beginPath(); c.arc(mx, my, 96, 0, 7); c.stroke();
    c.globalAlpha=0.16; c.lineWidth=2; c.lineCap='round';
    for (let k=0;k<12;k++){
      const a = k/12*Math.PI*2;
      c.beginPath();
      c.moveTo(mx+Math.cos(a)*104, my+Math.sin(a)*104);
      c.lineTo(mx+Math.cos(a)*130, my+Math.sin(a)*130);
      c.stroke();
    }
    c.lineCap='butt';
    c.globalAlpha=0.12;
    c.beginPath();
    c.moveTo(mx, my-60); c.lineTo(mx+52, my); c.lineTo(mx, my+60); c.lineTo(mx-52, my);
    c.closePath(); c.lineWidth=3; c.stroke();
    c.globalAlpha=1;
  }

  // ---- waymarker stones along the road
  paintMonolith(c, 1230, LANE_Y-52, 30, '#7fd4ff');
  paintMonolith(c, WORLD_W-1230, LANE_Y+64, 30, '#7fd4ff');

  // ---- cliff lip along the lane edges
  for (const sgn of [-1,1]){
    c.strokeStyle='#43556b'; c.lineWidth=3; c.lineCap='round';
    c.beginPath();
    for (let x=0;x<=WORLD_W;x+=26){
      const y = LANE_Y + sgn*(laneHalf(x) + Math.sin(x*0.11)*2.5);
      x ? c.lineTo(x,y) : c.moveTo(x,y);
    }
    c.stroke();
    c.strokeStyle='#000000'; c.globalAlpha=0.30; c.lineWidth=9;
    c.beginPath();
    for (let x=0;x<=WORLD_W;x+=26){
      const y = LANE_Y + sgn*(laneHalf(x) - 5);
      x ? c.lineTo(x,y) : c.moveTo(x,y);
    }
    c.stroke(); c.globalAlpha=1; c.lineCap='butt';
    // rock teeth jutting from the cliff base
    c.fillStyle='#2b394a';
    for (let x=40;x<WORLD_W;x+=90+((x*7)%50)){
      const y = LANE_Y + sgn*(laneHalf(x)+2);
      c.beginPath();
      c.moveTo(x-8, y); c.lineTo(x, y - sgn*9); c.lineTo(x+8, y);
      c.closePath(); c.fill();
    }
  }

  // ---- jungle grove pockets
  for (let s=0;s<2;s++){
    if (!CAMP_OPEN[s]) continue;
    const cy = campY(s);
    c.beginPath(); c.arc(CAMP_X, cy, CAMP_R, 0, 7);
    const gg = c.createRadialGradient(CAMP_X, cy, CAMP_R*0.2, CAMP_X, cy, CAMP_R);
    gg.addColorStop(0, '#1b2f20'); gg.addColorStop(1, '#122117');
    c.fillStyle = gg; c.fill();
    c.strokeStyle='#43556b'; c.lineWidth=3;
    c.beginPath(); c.arc(CAMP_X, cy, CAMP_R, 0, 7); c.stroke();
    // moss mottle
    for (let k=0;k<40;k++){
      const a = rand()*6.28, rr = rand()*CAMP_R*0.9;
      c.fillStyle = k%2 ? '#254531' : '#16281c'; c.globalAlpha=0.35;
      c.beginPath();
      c.ellipse(CAMP_X+Math.cos(a)*rr, cy+Math.sin(a)*rr, 8+rand()*18, 6+rand()*10, rand()*3, 0, 7);
      c.fill();
    }
    c.globalAlpha=1;
    // rim stones
    for (let k=0;k<11;k++){
      const a = k/11*Math.PI*2 + 0.3;
      paintBoulder(c, CAMP_X+Math.cos(a)*(CAMP_R-10), cy+Math.sin(a)*(CAMP_R-10)*0.96, 7+rand()*5, rand());
    }
    paintShrooms(c, CAMP_X-CAMP_R*0.45, cy+CAMP_R*0.3, rand);
    paintShrooms(c, CAMP_X+CAMP_R*0.5, cy-CAMP_R*0.25, rand);
    // the spawn totem — a carved elder stone (its glow is drawn live)
    paintMonolith(c, CAMP_X, cy+10, 26, '#8fd4a0');
  }

  // ---- arcane sanctums at the two bases
  for (let tm=0;tm<2;tm++){
    const bx = BASE_X[tm], col = TEAM_COL[tm];
    // outer ward circle, engraved in the ground
    c.strokeStyle=col; c.globalAlpha=0.10; c.lineWidth=12;
    c.beginPath(); c.arc(bx, LANE_Y, 330, 0, 7); c.stroke();
    c.globalAlpha=1;
    // stone plaza
    const pg = c.createRadialGradient(bx, LANE_Y, 10, bx, LANE_Y, 100);
    pg.addColorStop(0, '#333d4d'); pg.addColorStop(1, '#232c39');
    c.fillStyle=pg;
    c.beginPath(); c.arc(bx, LANE_Y, 96, 0, 7); c.fill();
    c.strokeStyle='#4a5a70'; c.lineWidth=2.5;
    c.beginPath(); c.arc(bx, LANE_Y, 96, 0, 7); c.stroke();
    c.strokeStyle='#182029'; c.lineWidth=1.5;
    for (const rr of [36, 66]){ c.beginPath(); c.arc(bx, LANE_Y, rr, 0, 7); c.stroke(); }
    for (let k=0;k<10;k++){
      const a = k/10*Math.PI*2;
      c.beginPath();
      c.moveTo(bx+Math.cos(a)*36, LANE_Y+Math.sin(a)*36);
      c.lineTo(bx+Math.cos(a)*96, LANE_Y+Math.sin(a)*96);
      c.stroke();
    }
    // inlay glow in the plaza seams
    c.strokeStyle=col; c.globalAlpha=0.22; c.lineWidth=1.5;
    c.beginPath(); c.arc(bx, LANE_Y, 51, 0, 7); c.stroke();
    c.globalAlpha=1;
    // a ring of standing stones guarding the fountain
    for (let k=0;k<6;k++){
      const a = k/6*Math.PI*2 + Math.PI/6;
      const sx = bx+Math.cos(a)*150, sy = LANE_Y+Math.sin(a)*150*0.92;
      paintMonolith(c, sx, sy, 24+((k*7)%3)*4, col);
    }
    // crystal plinth at the heart (the gem itself is alive, drawn per frame)
    c.fillStyle='#1a212c';
    c.beginPath(); c.arc(bx, LANE_Y, 20, 0, 7); c.fill();
    c.strokeStyle='#4a5a70'; c.lineWidth=2;
    c.beginPath(); c.arc(bx, LANE_Y, 20, 0, 7); c.stroke();
  }

  // ---- the forest on the cliffs (painted last so canopies overhang the lip)
  const D = ensureDecor();
  for (const d of D){
    const off = Math.abs(d.y-LANE_Y) - laneHalf(d.x);   // distance past the cliff lip
    const far = clamp(off/150, 0, 1);
    if (d.t){
      paintPine(c, d.x, d.y, d.r*(1.05-far*0.25), d.sh);
    } else if (d.sh < 0.72){
      paintBoulder(c, d.x, d.y, d.r*0.72, d.sh);
    } else {
      // dark shrub
      c.fillStyle = '#0e1a12'; c.globalAlpha=0.9;
      c.beginPath(); c.arc(d.x, d.y, d.r*0.6, 0, 7); c.fill();
      c.fillStyle = '#16301c'; c.globalAlpha=0.5;
      c.beginPath(); c.arc(d.x-d.r*0.2, d.y-d.r*0.2, d.r*0.36, 0, 7); c.fill();
      c.globalAlpha=1;
    }
    if (d.sh>0.93 && off<70) paintShrooms(c, d.x, d.y+d.r*0.5, seeded(d.x*31+d.y));
  }
  // a veil of darkness deepening away from the lane
  const veilN = c.createLinearGradient(0, LANE_Y-LANE_HALF-40, 0, 0);
  veilN.addColorStop(0, 'rgba(4,6,10,0)'); veilN.addColorStop(1, 'rgba(4,6,10,0.62)');
  c.fillStyle=veilN; c.fillRect(0, 0, WORLD_W, LANE_Y-LANE_HALF+40);
  const veilS = c.createLinearGradient(0, LANE_Y+LANE_HALF+40, 0, WORLD_H);
  veilS.addColorStop(0, 'rgba(4,6,10,0)'); veilS.addColorStop(1, 'rgba(4,6,10,0.62)');
  c.fillStyle=veilS; c.fillRect(0, LANE_Y+LANE_HALF-40, WORLD_W, WORLD_H);

  return cv2;
}

/* --------------------------- living light -------------------------- */

function drawFountainLife(tm, x0, x1){
  const bx = BASE_X[tm];
  if (bx<x0-420 || bx>x1+420) return;
  const col = TEAM_COL[tm], t = G.time;
  ctx.save();
  // breathing ward ring — slowly wheeling runic dashes
  ctx.strokeStyle=col; ctx.lineWidth=3;
  ctx.globalAlpha=0.34+0.10*Math.sin(t*1.7+tm);
  ctx.setLineDash([26,38]); ctx.lineDashOffset = t*14*(tm?-1:1);
  ctx.beginPath(); ctx.arc(bx, LANE_Y, 330, 0, 7); ctx.stroke();
  ctx.setLineDash([9,55]); ctx.lineDashOffset = -t*22*(tm?-1:1);
  ctx.globalAlpha=0.20; ctx.lineWidth=7;
  ctx.beginPath(); ctx.arc(bx, LANE_Y, 316, 0, 7); ctx.stroke();
  ctx.setLineDash([]);
  // pooled light
  const pool = ctx.createRadialGradient(bx, LANE_Y, 12, bx, LANE_Y, 180);
  pool.addColorStop(0, col+'30'); pool.addColorStop(1, col+'00');
  ctx.globalAlpha=1; ctx.fillStyle=pool;
  ctx.beginPath(); ctx.arc(bx, LANE_Y, 180, 0, 7); ctx.fill();
  // the hovering heart-crystal
  const bob = Math.sin(t*2.1+tm*2)*3, gy = LANE_Y-16+bob;
  const glow = ctx.createRadialGradient(bx, gy, 4, bx, gy, 52);
  glow.addColorStop(0, col+'66'); glow.addColorStop(1, col+'00');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(bx, gy, 52, 0, 7); ctx.fill();
  ctx.fillStyle=col; ctx.strokeStyle='#ffffff88'; ctx.lineWidth=1.6;
  ctx.beginPath();
  ctx.moveTo(bx, gy-19); ctx.lineTo(bx+11, gy); ctx.lineTo(bx, gy+19); ctx.lineTo(bx-11, gy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#ffffff'; ctx.globalAlpha=0.85;
  ctx.beginPath();
  ctx.moveTo(bx, gy-19); ctx.lineTo(bx+11, gy); ctx.lineTo(bx, gy-2);
  ctx.closePath(); ctx.fill();
  ctx.globalAlpha=1;
  // sparks rising off the crystal
  for (let k=0;k<5;k++){
    const ph = (t*0.5 + k*0.2) % 1;
    const sx = bx + Math.sin(t*1.4+k*2.4)*(8+ph*22);
    ctx.globalAlpha = (1-ph)*0.6;
    ctx.fillStyle = k%2 ? '#ffffff' : col;
    ctx.beginPath(); ctx.arc(sx, gy-6-ph*54, 1.5+(1-ph)*1.2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

export function drawTerrain(){
  ensureDecor();
  const key = LANE_HALF+'|'+(CAMP_OPEN[0]?1:0)+(CAMP_OPEN[1]?1:0);
  if (!tex || texKey!==key){ tex = paintStatic(); texKey = key; }

  const x0 = G.cam.x - G.cw/camScale()/2 - 80, x1 = G.cam.x + G.cw/camScale()/2 + 80;
  // bedrock beyond the painted world
  ctx.fillStyle = '#070b11';
  ctx.fillRect(x0, LANE_Y-1400, x1-x0, 2800);
  // blit only the visible slice of the world texture
  const sx0 = clamp(x0, 0, WORLD_W), sx1 = clamp(x1, 0, WORLD_W);
  if (sx1 > sx0){
    ctx.drawImage(tex, sx0*TEX, 0, (sx1-sx0)*TEX, WORLD_H*TEX, sx0, 0, sx1-sx0, WORLD_H);
  }

  const t = G.time;
  // ---- grove totem glow + drifting spores
  for (let s=0;s<2;s++){
    if (!CAMP_OPEN[s]) continue;
    const cy = campY(s);
    if (CAMP_X < x0-300 || CAMP_X > x1+300) continue;
    const pulse = 0.5+0.5*Math.sin(t*2.2+s*2);
    const gl = ctx.createRadialGradient(CAMP_X, cy-8, 2, CAMP_X, cy-8, 40+14*pulse);
    gl.addColorStop(0, 'rgba(143,212,160,'+(0.24+0.14*pulse).toFixed(3)+')');
    gl.addColorStop(1, 'rgba(143,212,160,0)');
    ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(CAMP_X, cy-8, 40+14*pulse, 0, 7); ctx.fill();
    for (let k=0;k<4;k++){
      const ph = (t*0.22 + k*0.25) % 1;
      const a = k*1.9 + t*0.4;
      ctx.globalAlpha = Math.sin(ph*Math.PI)*0.5;
      ctx.fillStyle='#a8e8b8';
      ctx.beginPath();
      ctx.arc(CAMP_X+Math.cos(a)*(20+ph*70), cy+Math.sin(a)*(14+ph*50)-ph*20, 1.7, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }

  // ---- sanctum life at both bases
  drawFountainLife(0, x0, x1);
  drawFountainLife(1, x0, x1);

  // ---- low mist creeping over the cliffs
  ctx.save();
  ctx.globalCompositeOperation='lighter';
  for (let k=0;k<5;k++){
    const span = x1-x0+1200;
    const mx = x0-600 + (((t*(7+k*2.4) + k*997) % span) + span) % span;
    const my = LANE_Y + (k%2?1:-1)*(laneHalf(clamp(mx,0,WORLD_W)) + 120 + (k*53)%110);
    const mw = 260+(k*83)%180;
    const mg = ctx.createRadialGradient(mx, my, 8, mx, my, mw);
    mg.addColorStop(0, 'rgba(150,170,210,0.040)');
    mg.addColorStop(1, 'rgba(150,170,210,0)');
    ctx.fillStyle=mg;
    ctx.beginPath(); ctx.ellipse(mx, my, mw, mw*0.32, 0, 0, 7); ctx.fill();
  }
  // faint drifting motes over the lane — stray magic in the air
  for (let k=0;k<7;k++){
    const span = x1-x0+400;
    const mx = x0-200 + (((t*(10+k*3.1) + k*1543) % span) + span) % span;
    const my = LANE_Y + Math.sin(t*0.5+k*2.2)*laneHalf(clamp(mx,0,WORLD_W))*0.7;
    const tw = 0.05 + 0.06*(0.5+0.5*Math.sin(t*1.9+k*4.1));
    ctx.globalAlpha=tw;
    ctx.fillStyle = k%2 ? '#ffe6b0' : '#bfe9ff';
    ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, 7); ctx.fill();
    const hg = ctx.createRadialGradient(mx, my, 0.5, mx, my, 10);
    hg.addColorStop(0, 'rgba(255,240,200,0.5)'); hg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(mx, my, 10, 0, 7); ctx.fill();
  }
  ctx.globalAlpha=1;
  ctx.restore();
}
