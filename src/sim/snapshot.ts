// @ts-nocheck
import {
  heal
} from '../data/world';
import { imminentHits, incomingDps, previewHit } from './attack';
import { damage } from './combat';
import { netWorth } from './stats';

/* Evenly resample a per-player series down to a wire-friendly size. The
   post-game charts only need the shape; first and last rows are always kept. */
function thinSeries(rows){
  const MAX = 120;
  if (!rows || rows.length <= MAX) return rows;
  const out = [];
  const step = (rows.length - 1) / (MAX - 1);
  for (let i = 0; i < MAX; i++) out.push(rows[Math.round(i * step)]);
  return out;
}

export function buildSnapshot(S, forTeam){
  if (forTeam===undefined) forTeam = 0;
  const ents=[];
  const heroes = S.players.map(p=>p.hero);
  const towerAim = {};                       // id -> the tower currently aiming at it
  const ST_STUN = 1, ST_SLOW = 2, ST_SHIELD = 4, ST_COL = 8, ST_MOVING = 16,
        ST_HITFLASH = 32, ST_SWING = 64, ST_MARK = 128, ST_DR = 256, ST_DOT = 512,
        ST_WIND = 1024, ST_ROOT = 2048, ST_SIL = 4096, ST_CS = 8192, ST_BD = 16384,
        ST_TOWER = 32768, ST_VEX_BLADESTORM = 65536, ST_VEX_RIPOSTE = 131072,
        ST_JARAK_UNDYING = 262144, ST_SVAAR_ULT = 524288,
        ST_SPIN = 1048576, ST_INVULN = 2097152, ST_BLOODRAGE = 4194304, ST_RUPTURE = 8388608,
        ST_BLIND = 16777216,
        ST_BANNER = 33554432,  // Corvick's Warbanner rally — creeps and heroes both can carry it
        ST_BARBS = 67108864,   // Thorne's Barbed Hide — the thorn ring the attacker must read
        ST_SIEGE = 134217728,  // Corvick's Warmarch — anchored siege platform
        ST_JARAK_CHANNEL = 268435456,  // Frenzied Charge — the wind-up the opponent gets to read
        ST_BATTED = 536870912,  // Siege Bolt — a creep about to be (or being) batted down the lane
        ST_JARAK_RANGED = 1073741824;  // Fervor's thrown-axe grip — which stance he is holding
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
      il:e.illu?1:0, tu:e.turret?1:0, wa:e.ward?1:0, br:e.brood?1:0, im:imm, dm:e.dummy?1:0,
      eb:e.embN||0, ng:e.neutral?1:0, jg:e.jungle||0, rn:e.raN||0,
      st:(e.stun>0?ST_STUN:0)|(e.slowT>0?ST_SLOW:0)|(e.shieldT>0&&e.shield>0?ST_SHIELD:0)|(e.colT>0?ST_COL:0)|(e.moving?ST_MOVING:0)|((e.hitFlash>0)?ST_HITFLASH:0)|((e.swing>0)?ST_SWING:0)|((e.markT>0)?ST_MARK:0)|((e.drT>0)?ST_DR:0)|((e.dotT>0)?ST_DOT:0)|((e.windT>0)?ST_WIND:0)|((e.rootT>0)?ST_ROOT:0)|((e.silT>0)?ST_SIL:0)|((e.csT>0)?ST_CS:0)|((e.bd>0)?ST_BD:0)|(towerAim[e.id]?ST_TOWER:0)|((e.heroId==='vex'&&e.asT>0)?ST_VEX_BLADESTORM:0)|((e.heroId==='vex'&&e.shieldT>0&&e.shield>0)?ST_VEX_RIPOSTE:0)|((e.heroId==='jarak'&&e.undyT>0)?ST_JARAK_UNDYING:0)|((e.heroId==='jarak'&&e.chanT>0)?ST_JARAK_CHANNEL:0)|((e.heroId==='svaar'&&(e.gsT>0||e.cryN>0))?ST_SVAAR_ULT:0)|((e.spinT>0)?ST_SPIN:0)|((e.invT>0)?ST_INVULN:0)|((e.brT>0)?ST_BLOODRAGE:0)|((e.rupT>0)?ST_RUPTURE:0)|((e.blindT>0)?ST_BLIND:0)|(((e.buffT>0)||(e.banT>0))?ST_BANNER:0)|((e.barbT>0)?ST_BARBS:0)|((e.heroId==='orrin'&&e.wmT>0)?ST_SIEGE:0)|((e.batT>0)?ST_BATTED:0)|((e.heroId==='jarak'&&e.stanceR)?ST_JARAK_RANGED:0),
      hi:e.heroId, sl:isHero?e.slot:-1,
      fv:isHero?(e.fervN||0):0, fvm:isHero?(e.fervMax||0):0,
      mp:isHero?Math.round(e.mp):0, mmp:isHero?Math.round(e.maxMp):0,
      acd:isHero?Math.max(0,Math.round(e.atkCd*100)/100):0,
      wd:isHero?Math.max(0,Math.round((e.windT||0)*100)/100):0,
      aiv:isHero?Math.round((1/(e.aps||1))*100)/100:0,
      ct:isHero?(e.curTid||0):0, rng:(isHero||e.type==='tower')?e.range:0,
      rg:isHero?Math.round(e.rage||0):0,
      // channel progress 0..1 (Frenzied Charge) — drives the wind-up ring
      ch:(isHero&&e.chanT>0&&e.chanMax>0)?Math.round((1-e.chanT/e.chanMax)*100)/100:0});
  }
  // the post-game breakdown and graphs ride along on the final snapshot only —
  // they are far too big to send twenty times a second. Even then the series is
  // thinned and the event log capped: a long 2v2 must never turn the final
  // snapshot into a message big enough to choke a client's data channel.
  const ps = S.players.map(p=>Object.assign(S.over ? {
    dby:p.dmgBy, hby:p.dmgHeroBy, tby:p.takenBy,
    dtk:Math.round(p.dmgTaken), ge:Math.round(p.goldEarned),
    sr:thinSeries(p.series), ev:p.events.slice(-150)
  } : {}, {
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
    aps:Math.round(p.hero.aps*100)/100,
    // everything that multiplies this hero's ability damage before it leaves him,
    // so the HUD can show real numbers in the ability tooltip
    sp:Math.round((1+(p.hero.amp||0)) * (p.hero.brT>0 ? 1+(p.hero.brP||0) : 1) * 1000)/1000
  }));

  return {k:'s', t:Math.round(S.t*100)/100, e:ents,
    p:S.projs.map(q=>({i:q.i||q.id, x:Math.round(q.x), y:Math.round(q.y), a:Math.round((q.a||0)*100)/100,
      kd:q.kind, tm:q.team, r:q.r, c:q.col})),
    z:S.zones.map(q=>({kd:q.kind, x:Math.round(q.x), y:Math.round(q.y), r:q.r,
      t:Math.round(q.t*100)/100, tm:q.team, c:q.col||'',
      mt:q.mt===undefined?0:Math.round(q.mt*100)/100,
      ox:q.ox===undefined?0:Math.round(q.ox), oy:q.oy===undefined?0:Math.round(q.oy),
      tx:q.tx===undefined?0:Math.round(q.tx), ty:q.ty===undefined?0:Math.round(q.ty)})),
    ps:ps, tk:S.teamKills.slice(), md:S.mode, wk:S.winKills,
    cs:(S.campSides||[]).slice(), cc:(S.campCharges||[[],[]]).map(a=>a.slice()),
    w:S.winner, ov:S.over, hw:S.how||'', wt:Math.round(S.waveT*10)/10, f:null};
}
