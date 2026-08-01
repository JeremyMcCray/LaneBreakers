// @ts-nocheck
import {
  BASE_X, LANE_Y, TICK, SNAP_HZ, INTERP_MS, setLaneMode, clamp, lerp, dist, now
} from '../data/world';
import { HERO_IDS } from '../data/heroes';
import { newSim, simStep, applyCmd, buildSnapshot } from '../sim/engine';
import { aiThink, lbCurrentAiSpec } from '../ai/neural/runtime';
import { G, SLOT_TEAM } from './state';
import { netSendCmd, netBroadcast, lobbySeat, netSendStateAll } from './online';
import { spawnFx } from '../render/fx';
import { render } from '../render/view';
import { toggleShop, buildShopUI } from '../ui/panels';
import { showEnd } from '../ui/panels';

/* A seat can be moved to the other side, so always ask rather than assuming. */
export function teamOfSlot(sl){
  if (G.S && G.S.players[sl]) return G.S.players[sl].team;
  const seat = lobbySeat(sl);
  return seat && seat.team!==undefined ? seat.team : SLOT_TEAM(sl);
}

export function beginMatch(mode, picks, mySlot, gameMode){
  G.mode = mode;
  G.mySlot = mySlot||0;
  G.myTeam = (picks[G.mySlot] && picks[G.mySlot].tm!==undefined) ? picks[G.mySlot].tm : (G.mySlot % 2);
  G.gameMode = gameMode || (picks.length>4 ? '3v3' : picks.length>2 ? '2v2' : '1v1');
  setLaneMode(G.gameMode);
  G.started = true;
  G.paused = false;
  G.matchCount = (G.matchCount||0) + 1;
  G.endShown = false; G.overMsg = false; G.endHadDetail = false;
  G.view = null; G.latest = null; G.buf = []; G.netFx = [];
  G.acc = 0; G.sendAcc = 0;
  G.order = {type:'stop'}; G.aMode = false; G.hoverId = 0; G.drag = null;
  G.parts = []; G.nums = []; G.rings = []; G.lines = []; G.shake = 0;
  toggleShop(false);
  G.debugOpen=false;
  G.dev.frozen=false; G.dev.stepReq=0;      // never start a match paused mid-tick
  document.getElementById('debug').classList.add('hide');
  document.getElementById('endcard').classList.add('hide');
  if (mode!=='client'){
    G.S = newSim(picks, G.gameMode);
    if (mode==='local'){
      const _spec = lbCurrentAiSpec();
      for (const q of G.S.players) if (q.slot!==G.mySlot){ q.bot = true; q.aiSpec = _spec; }
    }
  }
  document.getElementById('overlay').classList.add('hide');
  document.getElementById('help').classList.add('hide');   // F1 opens it on demand
  G.cam.x = BASE_X[G.myTeam]; G.cam.y = LANE_Y;
  G.pred.init = false;
  G.last = now();
  buildShopUI();
  if (!G.loopOn){ G.loopOn = true; requestAnimationFrame(loop); }
}
export function otherHero(k){ return HERO_IDS[(HERO_IDS.indexOf(G.pick)+1+k)%HERO_IDS.length]; }
export function startPractice(mode){
  const perTeam = mode==='3v3' ? 3 : mode==='2v2' ? 2 : 1;
  const picks = [{h:G.pick, tm:0}];
  for (let i=1; i<perTeam*2; i++) picks.push({h:otherHero(i-1), tm:i%2});
  beginMatch('local', picks, 0, mode||'1v1');
}

export function cmd(c){
  if (c.a==='move'||c.a==='amove'||c.a==='attack'||c.a==='hold'||c.a==='stop') G.order = {...c, type:c.a};
  if (G.mode==='client'){ c.k='c'; netSendCmd(c); }
  else applyCmd(G.S, G.mySlot, c);
}

/* ------------------------ client interpolation --------------------- */
export function interpolatedView(){
  const target = now() - INTERP_MS;
  const b = G.buf;
  if (!b.length) return null;
  let a=null, c=null;
  for (let i=b.length-1;i>=0;i--){
    if (b[i].rt <= target){ a=b[i]; c=b[i+1]||null; break; }
  }
  if (!a){ a=b[0]; c=b[1]||null; }
  if (!c) return a.v;
  const span = c.rt-a.rt || 1;
  const t = clamp((target-a.rt)/span, 0, 1);
  const map = new Map();
  for (const e of c.v.e) map.set(e.i, e);
  const ents = a.v.e.map(e=>{
    const n = map.get(e.i);
    if (!n) return e;
    return {...e, x:lerp(e.x,n.x,t), y:lerp(e.y,n.y,t), h:lerp(e.h,n.h,t),
            fa: Math.abs(n.fa-e.fa)>3 ? n.fa : lerp(e.fa,n.fa,t)};
  });
  const pmap = new Map(); for (const q of c.v.p) pmap.set(q.i,q);
  const projs = a.v.p.map(q=>{ const n=pmap.get(q.i); return n?{...q,x:lerp(q.x,n.x,t),y:lerp(q.y,n.y,t)}:q; });
  return {...c.v, e:ents, p:projs, ps:c.v.ps};
}

/* --------------------------- prediction ---------------------------- */
export function predictOwn(view, dt){
  const ps = view.ps[G.mySlot];
  let srv = null;
  for (const e of (G.latest? G.latest.e : view.e)) if (e.ty===0 && e.sl===G.mySlot) srv=e;
  if (!srv || ps.dead){ G.pred.init=false; return null; }
  if (!G.pred.init){ G.pred.x=srv.x; G.pred.y=srv.y; G.pred.init=true; }
  const o = G.order, sp = ps.ms;
  let tx=null, ty=null;
  if (o.type==='move' || o.type==='amove'){ tx=o.x; ty=o.y; }
  else if (o.type==='attack'){
    for (const e of view.e) if (e.i===o.tid){
      const d = dist(G.pred.x,G.pred.y,e.x,e.y);
      if (d > 80) { tx=e.x; ty=e.y; }
    }
  }
  if (tx!==null){
    const dx=tx-G.pred.x, dy=ty-G.pred.y, d=Math.hypot(dx,dy);
    if (d>3){ const s=Math.min(d, sp*dt); G.pred.x+=dx/d*s; G.pred.y+=dy/d*s; }
  }
  const err = dist(G.pred.x,G.pred.y,srv.x,srv.y);
  if (err > 200){ G.pred.x=srv.x; G.pred.y=srv.y; }
  else { G.pred.x = lerp(G.pred.x, srv.x, Math.min(1, dt*7)); G.pred.y = lerp(G.pred.y, srv.y, Math.min(1, dt*7)); }
  return G.pred;
}

/* ============================= MAIN LOOP =========================== */
export function loop(ts){
  requestAnimationFrame(loop);
  const t = now();
  let dt = (t - G.last)/1000; G.last = t;
  dt = Math.min(dt, .1);

  if (!G.paused){
    G.time += dt;

    if (G.mode!=='client' && G.S){
      const S = G.S;
      const D = G.dev;
      // dev sandbox owns the clock: frozen runs only the ticks you ask for,
      // otherwise time flows at timeScale. Online host stays at 1× — the
      // netcode assumes real time on both ends.
      const scale = (G.mode==='host') ? 1 : (D.timeScale||1);
      const frozen = D.frozen && G.mode!=='host';
      let steps = 0, budget = 6;
      if (frozen){
        budget = Math.min(60, D.stepReq);
        D.stepReq = 0;
        G.acc = budget * TICK;
      } else {
        G.acc += dt * scale;
        budget = scale > 1 ? 40 : 6;
      }
      while (G.acc >= TICK && steps < budget){
        G.acc -= TICK; steps++;
        for (const bp of S.players) if (bp.bot && !D.freezeBots) aiThink(S, bp, TICK);
        simStep(S, TICK);
      }
      if (frozen) G.acc = 0;
      for (const f of S.fx){ spawnFx(f); G.netFx.push(f); }
      S.fx = [];
      if (G.netFx.length > 90) G.netFx = G.netFx.slice(-90);
      G.view = buildSnapshot(S, G.myTeam); G.view.f = null;
      if (S.over && !G.endShown) showEnd(S.winner);
      // the verdict travels as its own tiny reliable message the moment the game
      // ends — a client's end card must never hinge on the heavyweight final
      // snapshot surviving the trip
      if (G.mode==='host' && S.over && !G.overMsg){
        G.overMsg = true;
        netBroadcast({k:'over', w:S.winner, hw:S.how||''});
      }
      if (G.mode==='host'){
        G.sendAcc += dt;
        if (G.sendAcc >= 1/SNAP_HZ){
          G.sendAcc = 0;
          // the final snapshot hauls the whole post-game payload (breakdowns,
          // graphs, events) — repeat it for a couple of seconds so every client
          // has it on the reliable channel, then stop hammering their tabs
          if (!S.over) G.overSent = 0;
          if (!S.over || (G.overSent = (G.overSent||0)+1) <= 40) netSendStateAll(S);
        }
      }
    } else if (G.mode==='client'){
      G.view = interpolatedView();
    }
  }
  if (G.view) render(G.paused ? 0 : dt);
}

