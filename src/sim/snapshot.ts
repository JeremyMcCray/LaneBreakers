// @ts-nocheck
import {
  heal
} from '../data/world';
import { imminentHits, incomingDps, previewHit } from './attack';
import { damage } from './combat';
import { netWorth } from './stats';

export function buildSnapshot(S, forTeam){
  if (forTeam===undefined) forTeam = 0;
  const ents=[];
  const heroes = S.players.map(p=>p.hero);
  const towerAim = {};                       // id -> the tower currently aiming at it
  for (const o of S.ents)
    if (o.type==='tower' && !o.dead && o.tid) towerAim[o.tid] = o.id;
  for (const e of S.ents){
    if (e.dead) continue;
    const isHero = e.type==='hero';
    // per-hit damage each hero would deal to this unit — drives the last-hit preview
    const pv = e.type!=='creep' ? heroes.map(()=>0)
             : heroes.map(h=>Math.round(previewHit(h, e)));
    const inc = e.type==='creep' ? Math.round(incomingDps(S,e)) : 0;
    const imm = e.type==='creep' ? imminentHits(S,e) : null;
    ents.push({i:e.id, ty:isHero?0:(e.type==='creep'?1:2), tm:e.team,
      x:Math.round(e.x*10)/10, y:Math.round(e.y*10)/10, h:Math.round(e.hp), mh:Math.round(e.maxHp),
      r:e.r, fa:Math.round((e.facing||0)*100)/100, pv:pv, ih:inc, pet:e.pet?1:0,
      il:e.illu?1:0, tu:e.turret?1:0, im:imm,
      st:(e.stun>0?1:0)|(e.slowT>0?2:0)|(e.shieldT>0&&e.shield>0?4:0)|(e.colT>0?8:0)|(e.moving?16:0)|((e.hitFlash>0)?32:0)|((e.swing>0)?64:0)|((e.markT>0)?128:0)|((e.drT>0)?256:0)|((e.dotT>0)?512:0)|((e.windT>0)?1024:0)|((e.rootT>0)?2048:0)|((e.silT>0)?4096:0)|((e.csT>0)?8192:0)|((e.bd>0)?16384:0)|(towerAim[e.id]?32768:0),
      hi:e.heroId, sl:isHero?e.slot:-1,
      mp:isHero?Math.round(e.mp):0, mmp:isHero?Math.round(e.maxMp):0,
      acd:isHero?Math.max(0,Math.round(e.atkCd*100)/100):0,
      wd:isHero?Math.max(0,Math.round((e.windT||0)*100)/100):0,
      aiv:isHero?Math.round((1/(e.aps||1))*100)/100:0,
      ct:isHero?(e.curTid||0):0, rng:isHero?e.range:0,
      rg:isHero?Math.round(e.rage||0):0});
  }
  const ps = S.players.map(p=>({
    sl:p.slot, tm:p.team, as:p.assists, nm:p.name,
    lvl:p.lvl, xp:Math.round(p.xp), gold:Math.round(p.gold), pts:p.points,
    sk:p.sk.slice(), cds:p.cds.map(v=>Math.round(v*10)/10),
    chg:p.chg.slice(), chgT:p.chgT.map(v=>Math.round(v*10)/10),
    chgM:p.chgM.slice(),
    rage:Math.round(p.hero.rage||0), defer:Math.round(p.hero.defer||0),
    items:p.items.map(it=>({id:it.id, cd:Math.round(it.cd*10)/10, b:Math.round(it.bought||0)})),
    pend:p.pending.map(q=>({id:q.id, t:Math.round(q.t*10)/10, use:q.use||[]})),
    k:p.kills, d:p.deaths, cs:p.cs, dn:p.denies,
    dh:Math.round(p.dmgHero), da:Math.round(p.dmgAll), hl:Math.round(p.healed),
    rs:Math.max(0,Math.round(p.respawn*10)/10), dead:p.hero.dead, hid:p.heroId, nw:Math.round(netWorth(p)),
    ms:Math.round(p.hero.ms), dmg:Math.round(p.hero.dmg), arm:Math.round(p.hero.armor*10)/10,
    aps:Math.round(p.hero.aps*100)/100
  }));
  return {k:'s', t:Math.round(S.t*100)/100, e:ents,
    p:S.projs.map(q=>({i:q.i||q.id, x:Math.round(q.x), y:Math.round(q.y), a:Math.round((q.a||0)*100)/100,
      kd:q.kind, tm:q.team, r:q.r, c:q.col})),
    z:S.zones.map(q=>({kd:q.kind, x:Math.round(q.x), y:Math.round(q.y), r:q.r,
      t:Math.round(q.t*100)/100, tm:q.team,
      mt:q.mt===undefined?0:Math.round(q.mt*100)/100,
      ox:q.ox===undefined?0:Math.round(q.ox), oy:q.oy===undefined?0:Math.round(q.oy),
      tx:q.tx===undefined?0:Math.round(q.tx), ty:q.ty===undefined?0:Math.round(q.ty)})),
    ps:ps, tk:S.teamKills.slice(), md:S.mode, wk:S.winKills,
    w:S.winner, ov:S.over, hw:S.how||'', wt:Math.round(S.waveT*10)/10, f:null};
}
