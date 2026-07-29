// @ts-nocheck
import {
  PULL_TIME, XP_RADIUS, armorMult, dist, effArmor, heal, now, rnd
} from '../data/world';
import { cancelWind } from './attack';
import { ent, foesOf, fx, nearbyHeroes, playerOf, teamOf } from './create';
import { addXp, endGame } from './stats';
import { towerShielded } from './tower';

export function damage(S, src, tgt, amount, opt){
  opt = opt || {};
  if (!tgt || tgt.dead || tgt.hp<=0 || S.over) return 0;
  if (tgt.type==='hero' && S.players[tgt.team] && S.players[tgt.team].god) return 0;
  if (opt.ability && warded(S, tgt)) return 0;              // counterspelled
  let dmg = amount;
  if (opt.ability && src && src.amp>0) dmg *= (1 + src.amp);
  if (!opt.pure) dmg *= armorMult(effArmor(tgt));
  if (opt.attack && tgt.block>0) dmg = Math.max(0, dmg - tgt.block);   // Stout Shield
  if (tgt.type==='tower' && towerShielded(S, tgt)) dmg *= 0.15;   // backdoor protection
  if (tgt.illu)     dmg *= (src && src.type==='tower') ? 5 : (tgt.illuTake||1.6);
  if (src && src.illu && tgt.type==='tower') dmg *= (src.illuTower||0.2);  // no backdoor by copy
  if (tgt.markT>0)  dmg *= (1 + tgt.markP);      // Hunter's Mark amplifies everything
  if (tgt.drT>0)    dmg *= (1 - tgt.drP);        // Bulwark
  // on-hit debuffs from items
  if (src){
    if (opt.attack  && src.hcut) { tgt.hcT = 5; tgt.hcP = .55; }   // Reaper's Sigil
    if (opt.ability && src.hcutM){ tgt.hcT = 6; tgt.hcP = .65; }   // Withering Rod
    if (opt.attack  && src.shredOn){ tgt.shredT = 5; tgt.shredV = 5; }
  }
  // shield
  if (tgt.shieldT>0 && tgt.shield>0){
    const abs = Math.min(tgt.shield, dmg);
    tgt.shield -= abs; dmg -= abs;
    fx(S,{t:'shield', x:tgt.x, y:tgt.y});
    if (tgt.shieldRef>0 && src && src.team!==tgt.team && !opt.reflected)
      damage(S, tgt, src, abs*tgt.shieldRef, {pure:true, silent:true, reflected:true});
  }
  // Bloodletting: part of what lands on Shiv is put on account instead of taken now
  if (dmg>0 && tgt.deferPct>0 && !opt.defer){
    const held = dmg * tgt.deferPct;
    tgt.defer = (tgt.defer||0) + held;
    tgt.deferSrc = src ? src.id : 0;
    dmg -= held;
  }
  // rage feeds on violence in both directions
  if (dmg>0){
    if (src && src.rageOn){ src.rage = Math.min(100, (src.rage||0) + dmg/12); src.rageT = 2.5; }
    if (tgt.rageOn){ tgt.rage = Math.min(100, (tgt.rage||0) + dmg/18); tgt.rageT = 2.5; }
  }
  if (dmg<=0) return 0;
  if (src && src.type==='hero'){                 // book-keeping for the post-game screen
    const sp = playerOf(S, src);
    if (sp){ sp.dmgAll += dmg; if (tgt.type==='hero') sp.dmgHero += dmg; }
  }
  tgt.hp -= dmg;
  tgt.hitFlash = .16;
  tgt.salveT = 0;
  if (!opt.silent)
    fx(S,{t:'dmg', x:tgt.x, y:tgt.y+2, r:tgt.r, v:Math.round(dmg),
          c: src && src.type==='hero' ? 1 : 0, ab: !!opt.ability, cr: !!opt.crit});
  // thorns
  if (opt.melee && tgt.thorns>0 && src && !src.dead)
    damage(S, tgt, src, dmg*tgt.thorns, {pure:true, silent:true});
  if (opt.attack && tgt.barbT>0 && src && !src.dead && src.team!==tgt.team){
    damage(S, tgt, src, tgt.barbV, {pure:true, silent:true});
    applySlow(src, .25, 1.2);
  }
  // lifesteal
  if (opt.attack && src && src.ls>0 && !src.dead){
    heal(S, src, dmg*src.ls);
    fx(S,{t:'heal', x:src.x, y:src.y});
  }
  // creep pull — only ATTACKING an enemy hero drags their creeps onto you, as in Dota
  if (opt.attack && src && src.type==='hero' && tgt.type==='hero')
    S.aggro[tgt.team] = {t:PULL_TIME, id:src.id};
  if (tgt.hp<=0) kill(S, src, tgt);
  return dmg;
}

export function kill(S, src, tgt){
  if (tgt.dead) return;
  tgt.dead = true;
  fx(S,{t:'die', x:tgt.x, y:tgt.y, team:tgt.team, big: tgt.type!=='creep'});

  if (tgt.type==='creep' && tgt.pet){
    return;                       // summons are worth no gold and no XP to anyone
  }
  else if (tgt.type==='creep'){
    const deny = src && src.team===tgt.team;
    const enemies = foesOf(S, tgt.team);
    // XP goes to every enemy hero standing nearby, split between them
    const xpAmt = tgt.kind==='ranged' ? 90 : 70;
    const share = nearbyHeroes(S, 1-tgt.team, tgt.x, tgt.y, XP_RADIUS);
    for (const q of share) addXp(S, q, (deny ? xpAmt*.5 : xpAmt) / share.length);
    const base = tgt.kind==='ranged' ? 62 : 48;
    // a killing blow from a hero OR from that hero's summon pays the full bounty
    const claimer = src && (src.type==='hero' || (src.type==='creep' && src.pet)) ? src : null;
    if (claimer){
      const p = S.players[claimer.team];
      if (deny){ p.denies++; p.gold += 22; fx(S,{t:'deny', x:tgt.x, y:tgt.y-40}); }
      else {
        const g = base + Math.round(rnd(-6,6));
        p.cs++; p.gold += g;
        fx(S,{t:'gold', x:tgt.x, y:tgt.y-40, v:g, pet: src.type!=='hero' ? 1:0});
      }
    } else {
      // nobody last hit it and nobody denied it — the lane still pays out, at half rate,
      // split between everyone who could have taken it
      const g = Math.round(base*0.5/enemies.length);
      for (const q of enemies) q.gold += g;
      fx(S,{t:'gold', x:tgt.x, y:tgt.y-40, v:g, passive:1});
    }
  }
  else if (tgt.type==='tower'){
    for (const q of foesOf(S, tgt.team)) q.gold += 400;
    const kt = 1 - tgt.team;
    const worth = S.big ? 3 : 2;              // it scores, and it also ends the match
    S.teamKills[kt] += worth;
    fx(S,{t:'towerdown', x:tgt.x, y:tgt.y, team:kt, v:worth});
    endGame(S, kt, 'tower');
  }
  else if (tgt.type==='hero'){
    const p = playerOf(S, tgt);
    if (!p) return;
    p.deaths++;
    p.respawn = 5 + p.lvl*1.6;
    p.gold = Math.max(0, p.gold - Math.round(14 + p.lvl*6));
    if (src){
      const kt = src.team!==undefined ? src.team : 1-p.team;
      S.teamKills[kt]++;
      const killer = playerOf(S, src) || teamOf(S, kt)[0];
      const bounty = 110 + p.lvl*10;
      if (killer){ killer.kills++; killer.gold += bounty; addXp(S, killer, 150 + p.lvl*20); }
      // everyone else on that team who was in the fight gets a cut
      for (const q of teamOf(S, kt)){
        if (q===killer || !q.hero || q.hero.dead) continue;
        if (dist(q.hero.x, q.hero.y, tgt.x, tgt.y) > 950) continue;
        q.assists++; q.gold += Math.round(bounty*0.5);
        addXp(S, q, (150 + p.lvl*20)*0.6);
      }
      fx(S,{t:'kill', x:tgt.x, y:tgt.y, team:kt});
      if (S.teamKills[kt] >= S.winKills) endGame(S, kt, 'kills');
    }
  }
}

export function applyDot(S, e, dps, t, srcId, stack){
  if (!e || e.dead || e.csT>0) return;
  if (stack) e.dotDps = (e.dotT>0 ? (e.dotDps||0) : 0) + dps;
  else e.dotDps = Math.max(e.dotDps||0, dps);
  e.dotT   = Math.max(e.dotT||0, t);
  e.dotSrc = srcId;
  if (!e.dotTick) e.dotTick = .5;
}
export function tickDot(S, e, dt){
  if (!e.dotT || e.dotT<=0) return;
  e.dotT -= dt;
  e.dotTick = (e.dotTick||.5) - dt;
  if (e.dotTick<=0){
    e.dotTick = .5;
    const src = ent(S,e.dotSrc);
    const dealt = damage(S, src, e, e.dotDps*.5, {ability:true});
    if (src && src.bleedHeal>0 && !src.dead) heal(S, src, dealt*src.bleedHeal);
  }
  if (e.dotT<=0){ e.dotDps=0; e.dotTick=0; }
}
export function applySlow(e, pct, t){
  if (e.colT>0) return;                     // Colossus = slow immune
  if (e.csT>0) return;
  if (pct >= e.slowP || e.slowT<=0){ e.slowP = Math.max(e.slowP, pct); }
  e.slowT = Math.max(e.slowT, t);
}
/* Rooted: you cannot move or blink, but you can still attack and cast. */
/* Blinking out from under a shot loses it: homing projectiles aimed at you are
   deleted and anyone mid-swing at you loses the swing. */
export function disjoint(S, e){
  for (let i=S.projs.length-1;i>=0;i--){
    const pr = S.projs[i];
    if (pr.tid !== e.id) continue;
    if (pr.kind!=='atk' && pr.kind!=='tower') continue;
    fx(S,{t:'disjoint', x:pr.x, y:pr.y});
    S.projs.splice(i,1);
  }
  for (const o of S.ents){
    if (o.dead || o.wTid !== e.id) continue;
    cancelWind(o);
    o.tid = 0;
  }
}
export function applyRoot(S,e,t){
  if (e.type==='tower') return;
  if (e.csT>0) return;
  e.rootT = Math.max(e.rootT||0, t);
  fx(S,{t:'root', x:e.x, y:e.y});
}
/* Silenced: no abilities at all. */
/* A counterspell window eats one spell — damage, disable, everything. */
export function warded(S, e){
  if (!e || !(e.csT>0)) return false;
  fx(S,{t:'counter', x:e.x, y:e.y});
  return true;
}
export function applySilence(S,e,t){
  if (e.type!=='hero') return;
  if (e.csT>0) return;
  e.silT = Math.max(e.silT||0, t);
  fx(S,{t:'silence', x:e.x, y:e.y});
}
export function applyStun(S,e,t){
  if (e.type==='tower') return;
  if (e.csT>0) return;
  e.stun = Math.max(e.stun, t);
  cancelWind(e);
  if (e.type==='hero'){ e.castLock=0; fx(S,{t:'stun', x:e.x, y:e.y}); }
}

/* ------------------------------ creeps ----------------------------- */
