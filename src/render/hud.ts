// @ts-nocheck
import {
  WORLD_W, WORLD_H, LANE_Y, BASE_X, TOWER_X, TEAM_COL, TEAM_COL_DK,
  CLEAVE_R, CLEAVE_ARC, SUDDEN_DEATH, MATCH_LIMIT,
  KILLS_TO_WIN, MAX_LEVEL, SELL_FULL, XP_TABLE, ULT_REQ,
  laneHalf, clamp, dist, rnd
} from '../data/world';
import { HEROES } from '../data/heroes';
import { ITEMS, ITEM_SLOTS, CAT_COL } from '../data/items';
import { previewHit, incomingDps, imminentHits } from '../sim/engine';
import { G } from '../app/state';
import { predictOwn } from '../app/shell';
import { part, ring, line } from './fx';
import { refreshShop } from '../ui/shop';
import { slotUnder } from '../ui/hitTest';
import { cv, ctx, camScale, w2s, ownHeroView, allyViews } from './canvas';
import { fmtTime, rr } from './worldDraw';

export function drawHUD(v, own){
  ctx.setTransform(G.dpr,0,0,G.dpr,0,0);
  const W = innerWidth, H = innerHeight;
  const me = v.ps[G.mySlot];
  const mates = v.ps.filter(q=>q.tm===me.tm && q.sl!==me.sl);
  const foes  = v.ps.filter(q=>q.tm!==me.tm);
  const foe   = foes[0];
  const myKills = v.tk ? v.tk[G.myTeam] : me.k;
  const foeKills = v.tk ? v.tk[1-G.myTeam] : foe.k;
  const myNw  = [me].concat(mates).reduce((a,q)=>a+q.nw, 0);
  const foeNw = foes.reduce((a,q)=>a+q.nw, 0);
  const HD = HEROES[me.hid];
  ctx.textBaseline='middle';

  /* ---------- low-health vignette: a subtle red tint creeping in from the edges ---------- */
  if (own && !me.dead && own.mh>0 && own.h/own.mh < .22){
    const k = clamp(1 - (own.h/own.mh)/.22, 0, 1);        // deeper red the lower you are
    const pulse = .6 + .4*Math.sin(G.time*4.2);
    const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*.30, W/2, H/2, Math.max(W,H)*.62);
    vg.addColorStop(0, 'rgba(255,40,40,0)');
    vg.addColorStop(1, 'rgba(255,30,30,'+(0.14 + 0.22*k*pulse).toFixed(3)+')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- top bar ---------- */
  ctx.fillStyle='#0b111ccc'; rr(W/2-152, 8, 304, 44, 10); ctx.fill();
  ctx.strokeStyle='#233049'; ctx.lineWidth=1; ctx.stroke();
  ctx.textAlign='center';
  if (v.md==='hideout'){
    // the warm-up room has no score and no clock — just say what this place is
    ctx.fillStyle='#ffd9a0'; ctx.font='800 15px Segoe UI'; ctx.fillText('⛺ THE HIDEOUT', W/2, 22);
    ctx.fillStyle='#8b9ab4'; ctx.font='600 10.5px Segoe UI';
    ctx.fillText('warm up — the match starts when everyone is ready', W/2, 42);
  } else {
  const left = MATCH_LIMIT - v.t;
  if (left < SUDDEN_DEATH){
    ctx.fillStyle = Math.floor(G.time*2)%2 ? '#ff5f5f' : '#ff9b4a';
    ctx.font='800 11px Segoe UI';
    ctx.fillText('SUDDEN DEATH — '+fmtTime(Math.max(0,left))+'  ('+(myNw>foeNw?'you lead':'you trail')+')', W/2, 42);
  } else {
    ctx.fillStyle='#8b9ab4'; ctx.font='600 11px Segoe UI';
    ctx.fillText('NEXT WAVE '+Math.ceil(v.wt)+'s', W/2, 42);
  }
  // banked jungle charges — reinforcements riding out with the next wave
  if (v.cc){
    const my = (v.cc[G.myTeam]||[]).length, foe = (v.cc[1-G.myTeam]||[]).length;
    if (my || foe){
      ctx.font='700 11px Segoe UI';
      if (my){ ctx.fillStyle='#9be15d'; ctx.textAlign='right';
               ctx.fillText('⚑'+my, W/2-160, 42); }
      if (foe){ ctx.fillStyle='#ff9b6b'; ctx.textAlign='left';
                ctx.fillText('⚑'+foe, W/2+160, 42); }
      ctx.textAlign='center';
    }
  }
  ctx.fillStyle='#dfe7f5'; ctx.font='800 20px Segoe UI'; ctx.fillText(fmtTime(v.t), W/2, 24);
  ctx.font='800 20px Segoe UI';
  ctx.fillStyle=TEAM_COL[G.myTeam]; ctx.textAlign='right'; ctx.fillText(myKills, W/2-40, 24);
  ctx.fillStyle=TEAM_COL[1-G.myTeam]; ctx.textAlign='left'; ctx.fillText(foeKills, W/2+40, 24);
  ctx.fillStyle='#5a6885'; ctx.textAlign='center'; ctx.font='700 12px Segoe UI';
  ctx.fillText('SCORE / '+(v.wk||KILLS_TO_WIN), W/2, 24);
  }

  /* ---------- top-left stats ---------- */
  ctx.textAlign='left';
  ctx.fillStyle='#0b111ccc'; rr(12, 8, 190, 74, 10); ctx.fill(); ctx.strokeStyle='#233049'; ctx.stroke();
  ctx.fillStyle='#ffcc55'; ctx.font='800 20px Segoe UI'; ctx.fillText(me.gold+'g', 24, 28);
  ctx.fillStyle='#8b9ab4'; ctx.font='600 12px Segoe UI';
  ctx.fillText('LAST HITS '+me.cs+'   DENIES '+me.dn, 24, 50);
  ctx.fillText('K/D/A  '+me.k+' / '+me.d+' / '+(me.as||0)+
               (foes.length ? '     vs '+foes.map(q=>HEROES[q.hid].name+' L'+q.lvl).join(', ') : ''), 24, 68);

  /* ---------- bottom bar ---------- */
  const BY = H-96;
  ctx.fillStyle='#0b111cdd'; rr(0, BY, W, 96, 0); ctx.fill();
  ctx.strokeStyle='#233049'; ctx.beginPath(); ctx.moveTo(0,BY); ctx.lineTo(W,BY); ctx.stroke();

  // hero block — kept clear of the ability row, and clamped on narrow windows
  const hx = Math.max(10, W/2 - 430);
  ctx.save();
  ctx.fillStyle=HD.col2; ctx.beginPath(); ctx.arc(hx+34, BY+48, 30, 0, 7); ctx.fill();
  ctx.strokeStyle=HD.col; ctx.lineWidth=3; ctx.stroke();
  ctx.fillStyle=HD.col; ctx.font='800 16px Segoe UI'; ctx.textAlign='center';
  ctx.fillText(HD.name.slice(0,3), hx+34, BY+48);
  ctx.fillStyle='#ffcc55'; ctx.beginPath(); ctx.arc(hx+58, BY+72, 14, 0, 7); ctx.fill();
  ctx.fillStyle='#1a1408'; ctx.font='800 14px Segoe UI'; ctx.fillText(me.lvl, hx+58, BY+72);
  // the Ascendant Scepter — a hero carrying it wears the mark
  if (me.items.some(i=>i.id==='scepter')){
    ctx.fillStyle='#ffcc55'; ctx.font='800 15px Segoe UI';
    ctx.fillText('⚜', hx+10, BY+24);
  }
  ctx.restore();
  // bars
  const bx = hx+76, bw = Math.max(150, Math.min(214, (W/2-146) - (hx+76)));
  const hpF = own? clamp(own.h/own.mh,0,1):0, mpF = own? clamp(own.mp/own.mmp,0,1):0;
  ctx.fillStyle='#1a0f0f'; rr(bx, BY+22, bw, 17, 4); ctx.fill();
  ctx.fillStyle='#3ddc84'; rr(bx, BY+22, bw*hpF, 17, 4); ctx.fill();
  if (me.defer>0 && own){                       // damage still on account
    const dF = clamp(me.defer/own.mh, 0, hpF);
    ctx.fillStyle='#8a2b2b';
    rr(bx + bw*(hpF-dF), BY+22, bw*dF, 17, 4); ctx.fill();
  }
  ctx.fillStyle='#0d1830'; rr(bx, BY+42, bw, 11, 4); ctx.fill();
  ctx.fillStyle='#4a8ede'; rr(bx, BY+42, bw*mpF, 11, 4); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='700 11px Segoe UI'; ctx.textAlign='center';
  if (own){
    ctx.fillText(Math.round(own.h)+' / '+Math.round(own.mh), bx+bw/2, BY+31);
    ctx.fillText(Math.round(own.mp)+' / '+Math.round(own.mmp), bx+bw/2, BY+48);
  }
  // xp bar
  const xpPrev = XP_TABLE[me.lvl]||0, xpNext = XP_TABLE[me.lvl+1]||me.xp;
  const xpF = me.lvl>=MAX_LEVEL ? 1 : clamp((me.xp-xpPrev)/Math.max(1,xpNext-xpPrev),0,1);
  ctx.fillStyle='#231a06'; rr(bx, BY+58, bw, 7, 3); ctx.fill();
  ctx.fillStyle='#ffcc55'; rr(bx, BY+58, bw*xpF, 7, 3); ctx.fill();
  ctx.fillStyle='#8b9ab4'; ctx.font='600 10px Segoe UI'; ctx.textAlign='left';
  ctx.fillText('DMG '+me.dmg+'   AS '+me.aps.toFixed(2)+'/s   ARM '+me.arm+'   MS '+me.ms, bx, BY+76);

  // abilities
  G.hud.ab = [];
  const aw=62, gap=9, tot=4*aw+3*gap, ax=W/2-tot/2, ay=BY+18;
  for (let i=0;i<4;i++){
    const A = HD.abilities[i], lv = me.sk[i], cd = me.cds[i];
    const x = ax+i*(aw+gap);
    G.hud.ab.push({x, y:ay, w:aw, h:aw, i});
    ctx.fillStyle = lv>0 ? '#1c2740' : '#141a26';
    rr(x, ay, aw, aw, 8); ctx.fill();
    ctx.strokeStyle = lv>0 ? HD.col : '#233049'; ctx.lineWidth=2; ctx.stroke();
    ctx.textAlign='center';
    ctx.fillStyle = lv>0 ? HD.col : '#3d4863';
    ctx.font='800 26px Segoe UI'; ctx.fillText(A.key, x+aw/2, ay+27);
    ctx.fillStyle='#8b9ab4'; ctx.font='600 9px Segoe UI';
    ctx.fillText(A.name.length>13?A.name.slice(0,12)+'…':A.name, x+aw/2, ay+46);
    // level pips
    const maxL = A.ult?3:4, pw=(aw-14)/maxL;
    for (let k=0;k<maxL;k++){
      ctx.fillStyle = k<lv ? '#ffcc55' : '#2a3448';
      ctx.fillRect(x+7+k*pw+1, ay+aw-9, pw-2, 4);
    }
    if (A.passive){
      ctx.fillStyle='#5ef0c8'; ctx.font='700 8px Segoe UI';
      ctx.fillText('PASSIVE', x+aw/2, ay+aw-16);
    }
    if (A.charges && lv>0){
      const held = me.chg[i], mx = A.charges;
      const pw = (aw-12)/mx;
      for (let k=0;k<mx;k++){                       // one pip per charge
        const px = x+6+k*pw;
        ctx.fillStyle = k<held ? '#5ef0c8' : '#2a3448';
        rr(px+1, ay+4, pw-3, 4, 2); ctx.fill();
      }
      // and a sliver filling toward the next one
      if (held < mx && me.chgM[i]>0){
        const prog = clamp(1 - me.chgT[i]/me.chgM[i], 0, 1);
        ctx.fillStyle='#1a2233'; rr(x+6, ay+11, aw-12, 3, 1.5); ctx.fill();
        ctx.fillStyle='#5ef0c899'; rr(x+6, ay+11, (aw-12)*prog, 3, 1.5); ctx.fill();
        ctx.fillStyle='#5ef0c8'; ctx.font='700 8px Segoe UI'; ctx.textAlign='right';
        ctx.fillText(me.chgT[i].toFixed(1)+'s', x+aw-6, ay+aw-6);
        ctx.textAlign='center';
      }
    }
    // cooldown
    if (A.charges && lv>0 && me.chg[i]<=0){
      ctx.fillStyle='#000000b0'; rr(x,ay,aw,aw,8); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='800 20px Segoe UI';
      ctx.fillText(me.chgT[i]>=10?Math.ceil(me.chgT[i]):me.chgT[i].toFixed(1), x+aw/2, ay+aw/2);
    } else if (cd>0 && !A.passive && !A.charges){
      ctx.fillStyle='#000000b0'; rr(x,ay,aw,aw,8); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='800 20px Segoe UI';
      ctx.fillText(cd>=10?Math.ceil(cd):cd.toFixed(1), x+aw/2, ay+aw/2);
    } else if (lv>0 && own && own.mp < A.mana[lv-1]){
      ctx.fillStyle='#0d1830a0'; rr(x,ay,aw,aw,8); ctx.fill();
    }
    // upgrade badge
    const canLvl = me.pts>0 && lv<maxL && (!A.ult || me.lvl>=ULT_REQ[lv]);
    if (canLvl){
      ctx.fillStyle='#5ef0c8'; ctx.beginPath(); ctx.arc(x+aw-6, ay+6, 10, 0, 7); ctx.fill();
      ctx.fillStyle='#06231c'; ctx.font='900 15px Segoe UI'; ctx.fillText('+', x+aw-6, ay+7);
    }
  }
  const hoverAb = G.hud.ab.find(b => G.mouse.x >= b.x && G.mouse.x <= b.x+b.w && G.mouse.y >= b.y && G.mouse.y <= b.y+b.h);
  if (hoverAb && own){
    const A = HD.abilities[hoverAb.i], lv = me.sk[hoverAb.i];
    if (lv > 0 && A.cast === 'point' && A.range){
      const [sx, sy] = w2s(own.x, own.y);
      const ox = sx / G.dpr, oy = sy / G.dpr;
      const or = A.range * camScale() / G.dpr;
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = 'rgba(94,240,200,0.12)';
      ctx.beginPath(); ctx.arc(ox, oy, or, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(94,240,200,0.75)'; ctx.lineWidth = 2;
      ctx.setLineDash([10,10]);
      ctx.beginPath(); ctx.arc(ox, oy, or, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
  // ability tooltip on hover is rendered after the item row so it stays on top

  // items
  G.hud.items = [];
  const iw=46, ig=6, iy=BY+18;
  const ix = Math.min(W/2+165, W - 14 - (ITEM_SLOTS*(iw+ig)-ig));
  const dragTo = G.drag && G.drag.moved ? slotUnder(G.drag.x, G.drag.y) : -1;
  for (let i=0;i<ITEM_SLOTS;i++){
    const x=ix+i*(iw+ig), it=(G.drag && G.drag.moved && G.drag.from===i) ? null : me.items[i];
    G.hud.items.push({x, y:iy, w:iw, h:iw, i});
    if (dragTo===i && G.drag.from!==i){
      ctx.fillStyle='#5ef0c822'; rr(x-2, iy-2, iw+4, iw+4, 8); ctx.fill();
      ctx.strokeStyle='#5ef0c8'; ctx.lineWidth=2; ctx.stroke();
    }
    const DC = it ? (CAT_COL[ITEMS[it.id].cat]||'#c8d4ea') : null;
    ctx.fillStyle = it? DC+'22':'#12172099';
    rr(x, iy, iw, iw, 7); ctx.fill();
    ctx.strokeStyle = it? DC:'#1e2739'; ctx.lineWidth=2; ctx.stroke();
    ctx.textAlign='center';
    if (it){
      const D=ITEMS[it.id];
      ctx.fillStyle = DC;
      ctx.font='800 15px Segoe UI'; ctx.fillText(D.name.slice(0,2).toUpperCase(), x+iw/2, iy+18);
      ctx.fillStyle='#8b9ab4'; ctx.font='600 8px Segoe UI';
      ctx.fillText(D.name.slice(0,9), x+iw/2, iy+34);
      if (D.active){
        ctx.fillStyle = it.cd>0 ? '#ff5f5f' : '#5ef0c8';
        ctx.beginPath(); ctx.arc(x+7, iy+7, 3, 0, 7); ctx.fill();
      }
      if (it.cd>0){
        ctx.fillStyle='#000000b0'; rr(x,iy,iw,iw,7); ctx.fill();
        const cdFrac = D.cd > 0 ? clamp(it.cd / D.cd, 0, 1) : 1;
        if (D.active && D.cd > 0){
          ctx.strokeStyle='#ff5f5f'; ctx.lineWidth=3;
          ctx.beginPath(); ctx.arc(x+iw/2, iy+iw/2, iw/2-5, -Math.PI/2, -Math.PI/2 + Math.PI*2*cdFrac);
          ctx.stroke();
        }
        ctx.fillStyle='#fff'; ctx.font='800 15px Segoe UI'; ctx.fillText(Math.ceil(it.cd), x+iw/2, iy+iw/2);
      }
      if (G.shopOpen){
        const fresh = (v.t - (it.b||0)) <= SELL_FULL;
        const refund = Math.round(ITEMS[it.id].cost * (fresh?1:0.6));
        ctx.fillStyle='#1a0f0fdd'; rr(x,iy,iw,iw,7); ctx.fill();
        ctx.strokeStyle='#ff5f5f'; ctx.lineWidth=2; ctx.stroke();
        ctx.fillStyle='#ff8a8a'; ctx.font='800 10px Segoe UI'; ctx.fillText('SELL', x+iw/2, iy+17);
        ctx.fillStyle= fresh? '#ffcc55':'#c9a34a'; ctx.font='800 12px Segoe UI';
        ctx.fillText(refund+'g', x+iw/2, iy+32);
      }
    }
    ctx.fillStyle='#4a5670'; ctx.font='600 9px Segoe UI';
    ctx.fillText(i+1, x+iw-8, iy+iw-7);
  }
  // pending deliveries
  if (me.pend.length){
    ctx.textAlign='left'; ctx.fillStyle='#5ef0c8'; ctx.font='700 11px Segoe UI';
    me.pend.forEach((q,k)=>{
      ctx.fillText('↓ '+ITEMS[q.id].name+'  '+q.t.toFixed(1)+'s', ix, BY-12-k*15);
    });
  }
  ctx.textAlign='center';
  ctx.fillStyle='#8b9ab4'; ctx.font='600 11px Segoe UI';
  ctx.fillText('[B] SHOP  ·  drag to reorder  ·  [F1] HELP', ix+ (ITEM_SLOTS*(iw+ig))/2 , BY+82);
  // the item currently in hand
  if (G.drag && G.drag.moved){
    const it = me.items[G.drag.from];
    if (it){
      const D = ITEMS[it.id], DC = CAT_COL[D.cat]||'#c8d4ea';
      const x = G.drag.x-iw/2, y = G.drag.y-iw/2;
      ctx.globalAlpha=.9;
      ctx.fillStyle = DC+'33'; rr(x, y, iw, iw, 7); ctx.fill();
      ctx.strokeStyle = DC; ctx.lineWidth=2; ctx.stroke();
      ctx.textAlign='center'; ctx.fillStyle=DC; ctx.font='800 15px Segoe UI';
      ctx.fillText(D.name.slice(0,2).toUpperCase(), x+iw/2, y+18);
      ctx.fillStyle='#c8d4ea'; ctx.font='600 8px Segoe UI';
      ctx.fillText(D.name.slice(0,9), x+iw/2, y+34);
      ctx.globalAlpha=1;
    }
  }

  if (hoverAb){
    const A = HD.abilities[hoverAb.i], lv = Math.max(1, me.sk[hoverAb.i]);
    let txt = A.desc.replace('%d', A.val[lv-1]);
    if (A.val2) txt = txt.replace('%p', A.val2[lv-1]);   // a second scaling number in the text
    const w2=330, h2=76;
    let x2 = clamp(hoverAb.x + 31 - w2/2, 8, W-w2-8);
    let y2 = hoverAb.y - h2 - 12;
    if (y2 < 8) y2 = hoverAb.y + hoverAb.h + 12;
    y2 = clamp(y2, 8, H-h2-8);
    ctx.fillStyle='#0b111cf2'; rr(x2,y2,w2,h2,8); ctx.fill();
    ctx.strokeStyle='#233049'; ctx.lineWidth=1; ctx.stroke();
    ctx.textAlign='left'; ctx.fillStyle=HD.col; ctx.font='800 14px Segoe UI';
    ctx.fillText(A.name+'  ['+A.key+']', x2+12, y2+18);
    ctx.fillStyle='#8b9ab4'; ctx.font='600 11px Segoe UI';
    ctx.fillText(A.passive ? 'Passive    Lv '+me.sk[hoverAb.i]
                           : 'Mana '+A.mana[lv-1]+'    Cooldown '+A.cd[lv-1]+'s    Lv '+me.sk[hoverAb.i],
                 x2+12, y2+36);
    ctx.fillStyle='#dfe7f5'; ctx.font='600 11.5px Segoe UI';
    wrapText(txt, x2+12, y2+54, w2-24, 15);
  }

  /* ---------- your teammate ---------- */
  if (mates.length){
    let ay = 92;
    for (const q of mates){
      const QH = HEROES[q.hid];
      const qe = v.e.find(e=>e.ty===0 && e.sl===q.sl);
      ctx.fillStyle='#0b111ccc'; rr(12, ay, 190, 54, 9); ctx.fill();
      ctx.strokeStyle= q.dead? '#5a2a2a' : '#233049'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=QH.col2; ctx.beginPath(); ctx.arc(30, ay+20, 13, 0, 7); ctx.fill();
      ctx.strokeStyle=QH.col; ctx.lineWidth=2; ctx.stroke();
      ctx.textAlign='center'; ctx.fillStyle=QH.col; ctx.font='800 9px Segoe UI';
      ctx.fillText(QH.name.slice(0,3), 30, ay+20);
      ctx.textAlign='left'; ctx.fillStyle='#c8d4ea'; ctx.font='700 11px Segoe UI';
      ctx.fillText(QH.name+'  L'+q.lvl, 50, ay+13);
      if (q.dead){
        ctx.fillStyle='#ff5f5f'; ctx.font='700 11px Segoe UI';
        ctx.fillText('respawning '+Math.ceil(q.rs)+'s', 50, ay+30);
      } else if (qe){
        const bw2=140;
        ctx.fillStyle='#1a0f0f'; rr(50, ay+22, bw2, 8, 3); ctx.fill();
        ctx.fillStyle='#3ddc84'; rr(50, ay+22, bw2*clamp(qe.h/qe.mh,0,1), 8, 3); ctx.fill();
        ctx.fillStyle='#0d1830'; rr(50, ay+33, bw2, 5, 2); ctx.fill();
        ctx.fillStyle='#4a8ede'; rr(50, ay+33, bw2*clamp(qe.mp/Math.max(1,qe.mmp),0,1), 5, 2); ctx.fill();
      }
      // their items, tiny
      for (let i=0;i<ITEM_SLOTS;i++){
        const it=q.items[i], x=50+i*15;
        const DC = it ? (CAT_COL[ITEMS[it.id].cat]||'#c8d4ea') : null;
        ctx.fillStyle = it? DC : '#1a2233';
        ctx.fillRect(x, ay+42, 12, 7);
      }
      ay += 60;
    }
  }

  /* ---------- what the enemy is carrying ---------- */
  if (foes.length){
    const ew=34, eg=4, tot=ITEM_SLOTS*(ew+eg)-eg, ex=W-14-tot;
    let ey=60;
    ctx.textAlign='right'; ctx.fillStyle='#5a6885'; ctx.font='700 9px Segoe UI';
    ctx.fillText('ENEMY ITEMS  ·  '+foeNw+'g NET WORTH', W-14, ey-8);
    for (const q of foes){
      if (foes.length>1){
        ctx.textAlign='right'; ctx.fillStyle=TEAM_COL[1-G.myTeam]; ctx.font='700 9px Segoe UI';
        ctx.fillText(HEROES[q.hid].name+'  L'+q.lvl+(q.dead? '  ·  dead '+Math.ceil(q.rs)+'s':''), ex-8, ey+ew/2);
      }
      for (let i=0;i<ITEM_SLOTS;i++){
        const x=ex+i*(ew+eg), it=q.items[i];
        const DC = it ? (CAT_COL[ITEMS[it.id].cat]||'#c8d4ea') : null;
        ctx.fillStyle = it? DC+'22' : '#0b111c99';
        rr(x, ey, ew, ew, 6); ctx.fill();
        ctx.strokeStyle = it? DC : '#1e2739'; ctx.lineWidth=1.5; ctx.stroke();
        if (it){
          const D=ITEMS[it.id];
          ctx.textAlign='center'; ctx.fillStyle=DC; ctx.font='800 12px Segoe UI';
          ctx.fillText(D.name.slice(0,2).toUpperCase(), x+ew/2, ey+13);
          ctx.fillStyle='#8b9ab4'; ctx.font='600 6.5px Segoe UI';
          ctx.fillText(D.name.slice(0,10), x+ew/2, ey+25);
        }
      }
      if (q.pend.length){
        ctx.textAlign='right'; ctx.fillStyle='#ff9b4a'; ctx.font='700 9px Segoe UI';
        ctx.fillText('incoming: '+q.pend.map(z=>ITEMS[z.id].name).join(', '), W-14, ey+ew+10);
        ey += 13;
      }
      ey += ew + 8;
    }
  }

  /* ---------- dead overlay ---------- */
  if (me.dead){
    ctx.fillStyle='#ff5f5f'; ctx.font='900 46px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('RESPAWNING', W/2, H/2-30);
    ctx.fillStyle='#dfe7f5'; ctx.font='900 60px Segoe UI';
    ctx.fillText(Math.ceil(me.rs), W/2, H/2+30);
  }
  if (G.aMode){
    ctx.fillStyle='#ff9b4a'; ctx.font='800 14px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('ATTACK-MOVE — click a location', W/2, BY-18);
  }
  ctx.textAlign='right'; ctx.font='600 10px Segoe UI';
  ctx.fillStyle = G.smart? '#5ef0c8aa' : '#8b9ab4aa';
  ctx.fillText((G.smart?'SMART':'LEGACY')+' ATTACK CLICK  [F2]', W-14, BY-14);
  if (own && (own.st&32768) && !me.dead){
    ctx.fillStyle = Math.floor(G.time*4)%2 ? '#ff5f5f' : '#ff9b4a';
    ctx.font='800 15px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('âš   THE TOWER IS TARGETING YOU', W/2, BY-40);
  }
  if (G.order.type==='attack' && G.order.au && !me.dead){
    ctx.fillStyle='#5ef0c8'; ctx.font='800 12px Segoe UI'; ctx.textAlign='center';
    ctx.fillText('AUTO-ATTACKING', W/2, BY-18);
  }
  if (G.shopOpen && (G.frame=(G.frame||0)+1)%8===0) refreshShop(v);
}
export function wrapText(txt,x,y,maxW,lh){
  const words=txt.split(' '); let line='', yy=y;
  for (const w of words){
    const t=line+w+' ';
    if (ctx.measureText(t).width > maxW){ ctx.fillText(line,x,yy); line=w+' '; yy+=lh; }
    else line=t;
  }
  ctx.fillText(line,x,yy);
}

