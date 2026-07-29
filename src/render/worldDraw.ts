// @ts-nocheck
import {
  WORLD_W, WORLD_H, LANE_Y, BASE_X, TOWER_X, TEAM_COL, TEAM_COL_DK,
  CLEAVE_R, CLEAVE_ARC, SUDDEN_DEATH, MATCH_LIMIT, AUTO_ACQ,
  laneHalf, clamp, dist, rnd, lerp
} from '../data/world';
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { previewHit, incomingDps, imminentHits } from '../sim/engine';
import { G } from '../app/state';
import { predictOwn } from '../app/shell';
import { part, ring, line } from './fx';
import { cv, ctx, camScale, w2s, ownHeroView, DECOR } from './canvas';

export function drawTerrain(){
  const x0 = G.cam.x - G.cw/camScale()/2 - 80, x1 = G.cam.x + G.cw/camScale()/2 + 80;
  // cliffs
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(x0, LANE_Y-1000, x1-x0, 2000);
  // lane floor
  ctx.beginPath();
  ctx.moveTo(0, LANE_Y-laneHalf(0));
  for (let x=0;x<=WORLD_W;x+=40) ctx.lineTo(x, LANE_Y-laneHalf(x));
  for (let x=WORLD_W;x>=0;x-=40) ctx.lineTo(x, LANE_Y+laneHalf(x));
  ctx.closePath();
  const g = ctx.createLinearGradient(0,LANE_Y-300,0,LANE_Y+300);
  g.addColorStop(0,'#141c2b'); g.addColorStop(.5,'#1a2434'); g.addColorStop(1,'#141c2b');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#2a3a4a'; ctx.lineWidth = 3; ctx.stroke();

  // centre path
  ctx.strokeStyle = '#22304a'; ctx.lineWidth = 66; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(BASE_X[0], LANE_Y); ctx.lineTo(BASE_X[1], LANE_Y); ctx.stroke();
  ctx.strokeStyle = '#1b2740'; ctx.lineWidth = 2;
  for (let x=200;x<WORLD_W;x+=200){
    if (x<x0-100||x>x1+100) continue;
    ctx.beginPath(); ctx.moveTo(x, LANE_Y-laneHalf(x)); ctx.lineTo(x, LANE_Y+laneHalf(x)); ctx.stroke();
  }
  // decor
  for (const d of DECOR){
    if (d.x<x0||d.x>x1) continue;
    ctx.globalAlpha = .85;
    if (d.t){ ctx.fillStyle = '#101826'; ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,7); ctx.fill();
              ctx.fillStyle='#172233'; ctx.beginPath(); ctx.arc(d.x-d.r*.2,d.y-d.r*.2,d.r*.65,0,7); ctx.fill(); }
    else { ctx.fillStyle='#0d1420'; ctx.beginPath(); ctx.arc(d.x,d.y,d.r*.8,0,7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  // fountains
  for (let tm=0;tm<2;tm++){
    const bx=BASE_X[tm];
    if (bx<x0-400||bx>x1+400) continue;
    ctx.save();
    ctx.globalAlpha=.16; ctx.fillStyle=TEAM_COL[tm];
    ctx.beginPath(); ctx.arc(bx,LANE_Y,330,0,7); ctx.fill();
    ctx.globalAlpha=.5; ctx.strokeStyle=TEAM_COL[tm]; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(bx,LANE_Y,330,0,7); ctx.stroke();
    ctx.restore();
    ctx.fillStyle=TEAM_COL_DK[tm];
    ctx.beginPath(); ctx.arc(bx,LANE_Y,52,0,7); ctx.fill();
    ctx.strokeStyle=TEAM_COL[tm]; ctx.lineWidth=4; ctx.stroke();
    ctx.fillStyle=TEAM_COL[tm]; ctx.globalAlpha=.6+.25*Math.sin(G.time*3);
    ctx.beginPath(); ctx.arc(bx,LANE_Y,26,0,7); ctx.fill(); ctx.globalAlpha=1;
  }
}

export function drawZones(v){
  for (const z of v.z){
    ctx.save();
    if (z.kd==='frost'){ ctx.fillStyle='#7fd4ff20'; ctx.strokeStyle='#7fd4ff70'; }
    else if (z.kd==='quake'){ ctx.fillStyle='#d8a66a22'; ctx.strokeStyle='#d8a66a80'; }
    else if (z.kd==='fire'){ ctx.fillStyle='#ff8a4a22'; ctx.strokeStyle='#ff8a4a80'; }
    else if (z.kd==='banner'){ ctx.fillStyle='#e0c47718'; ctx.strokeStyle='#e0c47780'; }
    else if (z.kd==='thicket'){ ctx.fillStyle='#7fdc6a20'; ctx.strokeStyle='#7fdc6a80'; }
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
    else if (z.kd==='light'){ ctx.fillStyle='#ffe9a81e'; ctx.strokeStyle='#ffe9a880'; }
    else if (z.kd==='meteor'){ ctx.fillStyle='#ff8a4a26'; ctx.strokeStyle='#ff8a4aaa'; }
    else { ctx.fillStyle='#bfe9ff26'; ctx.strokeStyle='#bfe9ffaa'; }
    ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(z.x,z.y,z.r,0,7); ctx.fill(); ctx.stroke();
    if (z.kd==='azero' || z.kd==='meteor'){
      ctx.beginPath(); ctx.arc(z.x,z.y,z.r*(1-z.t/0.65),0,7); ctx.strokeStyle='#ffffffcc'; ctx.stroke();
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
  else if (hi==='ilva'){ ctx.moveTo(r,0); ctx.lineTo(0,r*.85); ctx.lineTo(-r*.9,0); ctx.lineTo(0,-r*.85); }
  else if (hi==='brann'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.2,r*.95); ctx.lineTo(-r*.85,r*.5);
                          ctx.lineTo(-r*.85,-r*.5); ctx.lineTo(r*.2,-r*.95); }
  else if (hi==='sable'){ ctx.moveTo(r*1.25,0); ctx.lineTo(-r*.3,r*.6); ctx.lineTo(-r*.9,0); ctx.lineTo(-r*.3,-r*.6); }
  else if (hi==='ash'){ ctx.moveTo(r*1.1,0); ctx.lineTo(0,r*.75); ctx.lineTo(-r*.8,r*.4);
                        ctx.lineTo(-r*.45,0); ctx.lineTo(-r*.8,-r*.4); ctx.lineTo(0,-r*.75); }
  else if (hi==='mara'){ ctx.moveTo(r*1.05,0); ctx.lineTo(r*.25,r*.9); ctx.lineTo(-r*.8,r*.55);
                         ctx.lineTo(-r*.8,-r*.55); ctx.lineTo(r*.25,-r*.9); }
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
  else if (hi==='krell'){ ctx.moveTo(r*1.15,0); ctx.lineTo(r*.15,r*.6); ctx.lineTo(-r*.95,r*.45);
                          ctx.lineTo(-r*.55,0); ctx.lineTo(-r*.95,-r*.45); ctx.lineTo(r*.15,-r*.6); }
  else if (hi==='nix'){ ctx.moveTo(r*1.2,0); ctx.lineTo(0,r*.7); ctx.lineTo(-r*.5,r*.35);
                        ctx.lineTo(-r*1.0,0); ctx.lineTo(-r*.5,-r*.35); ctx.lineTo(0,-r*.7); }
  else if (hi==='vhal'){ for(let i=0;i<3;i++){const a=i/3*Math.PI*2;
                          const q=[Math.cos(a)*r*1.05, Math.sin(a)*r*1.05];
                          i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  else { for(let i=0;i<6;i++){const a=i/6*Math.PI*2; const q=[Math.cos(a)*r,Math.sin(a)*r];
          i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} }
  ctx.closePath();
}
export function drawEntity(e, v, own){
  const mine = e.tm===G.myTeam;
  const col = TEAM_COL[e.tm], dk = TEAM_COL_DK[e.tm];
  ctx.save();
  if (e.ty===2){ // tower
    ctx.fillStyle='#00000055'; ctx.beginPath(); ctx.ellipse(e.x,e.y+16,e.r*1.1,e.r*.45,0,0,7); ctx.fill();
    ctx.fillStyle=dk; ctx.strokeStyle=col; ctx.lineWidth=4;
    ctx.beginPath();
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2-Math.PI/2; const p=[e.x+Math.cos(a)*e.r, e.y+Math.sin(a)*e.r];
      i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle=col; ctx.globalAlpha=.55+.3*Math.sin(G.time*2.2);
    ctx.beginPath(); ctx.arc(e.x,e.y-6,15,0,7); ctx.fill(); ctx.globalAlpha=1;
    // range circle
    ctx.strokeStyle = mine? '#4aa8ff22':'#ff5f5f26'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(e.x,e.y,720,0,7); ctx.stroke();
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
    } else if (e.tu){                            // turret
      ctx.beginPath(); ctx.rect(-e.r*.7,-e.r*.7,e.r*1.4,e.r*1.4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle=col; ctx.fillRect(e.r*.3,-2.5, e.r*1.1, 5);
    } else {
      ctx.beginPath();
      if (e.pet){ ctx.moveTo(e.r,0); ctx.lineTo(-e.r*.6,e.r*.9); ctx.lineTo(-e.r*.2,0); ctx.lineTo(-e.r*.6,-e.r*.9); }
      else if (e.r<17){ ctx.moveTo(e.r,0); ctx.lineTo(-e.r*.8,e.r*.85); ctx.lineTo(-e.r*.8,-e.r*.85); }
      else { ctx.rect(-e.r*.8,-e.r*.8,e.r*1.6,e.r*1.6); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // facing nub
    ctx.fillStyle='#ffffffcc';
    ctx.beginPath(); ctx.arc(e.r*.75, 0, 2.6, 0, 7); ctx.fill();
    ctx.restore();
    if (e.st&2){ ctx.fillStyle='#7fd4ff44'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,7); ctx.fill(); }
    if (e.st&512){ ctx.fillStyle='#b78cff44'; ctx.beginPath(); ctx.arc(e.x,e.y,e.r+5,0,7); ctx.fill(); }
    if (e.st&128){ ctx.strokeStyle='#c9f06a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+9,0,7); ctx.stroke(); }
    hpBar(e, Math.max(46, e.r*2.9), 8, 15, {preview:prev, hpText:prev>0});
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
  ctx.fillStyle = flash ? '#ffffff' : H.col;
  ctx.strokeStyle = H.col2; ctx.lineWidth=3;
  heroPath(e.hi, e.r);
  ctx.fill(); ctx.stroke();
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
  ctx.fillStyle = mine? '#dfe7f5':'#ffc9c9';
  ctx.font = '700 13px Segoe UI, sans-serif'; ctx.textAlign='center';
  ctx.lineWidth=3; ctx.strokeStyle='#000a';
  ctx.strokeText(H.name, e.x, e.y-e.r-40);
  ctx.fillText(H.name, e.x, e.y-e.r-40);
}

export function drawProjectiles(v){
  for (const q of v.p){
    ctx.save(); ctx.translate(q.x,q.y); ctx.rotate(q.a||0);
    if (q.kd==='atk'){ ctx.fillStyle=TEAM_COL[q.tm];
      ctx.beginPath(); ctx.ellipse(0,0,10,4,0,0,7); ctx.fill(); }
    else if (q.kd==='tower'){ ctx.fillStyle='#ffd28a'; ctx.shadowColor='#ffb347'; ctx.shadowBlur=14;
      ctx.beginPath(); ctx.arc(0,0,8,0,7); ctx.fill(); }
    else { ctx.fillStyle=q.c||'#fff'; ctx.shadowColor=q.c||'#fff'; ctx.shadowBlur=16;
      ctx.beginPath(); ctx.ellipse(0,0,q.r*1.2,q.r*.7,0,0,7); ctx.fill(); }
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
    ctx.globalAlpha=l.life/l.max; ctx.strokeStyle=l.col; ctx.lineWidth=7; ctx.lineCap='round';
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

