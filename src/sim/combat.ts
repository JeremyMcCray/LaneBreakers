// @ts-nocheck
import {
  PULL_TIME, XP_RADIUS, armorMult, dist, effArmor, heal, now, rnd
} from '../data/world';
import { HEROES } from '../data/heroes';
import { CAMP_VARIANTS } from '../data/camps';
import { cancelWind } from './attack';
import { ent, foesOf, fx, nearbyHeroes, playerOf, spawnBrood, teamOf } from './create';
import { addGold, addXp, endGame, logEvent } from './stats';
import { towerShielded } from './tower';

/* ---------------------- damage attribution ------------------------- */
/* Every blow gets a tag saying what threw it, so the post-game screen can break a
   match down by source. Most tags ride in on S.tag — castAbility sets it for the
   whole cast and stamps it onto any projectile or zone the cast leaves behind, and
   the steppers re-raise it when those land later. opt.tag beats it for the nested
   calls (thorns, reflect) that fire from inside another blow. */
const bump = (o,k,v)=>{ o[k] = (o[k]||0) + v; };
export function ownerPlayer(S, e){
  if (!e) return null;
  if (e.type==='hero') return playerOf(S, e);
  if (e.oslot!==undefined && S.players[e.oslot]) return S.players[e.oslot];
  return null;
}
export function damageTag(S, src, opt){
  if (src){
    if (src.type==='tower') return 'tower';
    if (src.type==='creep' && !src.pet) return 'creep';
  }
  let t = opt.tag || S.tag;
  if (!t) t = opt.attack ? 'atk' : (opt.ability ? 'abil' : 'other');
  if (src && src.type==='creep' && src.pet && (t==='atk' || t==='abil' || t==='cleave')) t = 'summon';
  return t;
}
/* who to blame, from the victim's side: "<slot>|<tag>", slot -1 for the neutral map.
   opt.blame carries the shooter's slot on a projectile that outlived its owner. */
export function blameKey(S, src, tag, opt){
  const p = ownerPlayer(S, src);
  const slot = p ? p.slot : (opt && opt.blame>=0 ? opt.blame : -1);
  return slot + '|' + tag;
}
export function damage(S, src, tgt, amount, opt){
  opt = opt || {};
  if (!tgt || tgt.dead || tgt.hp<=0 || S.over) return 0;
  if (tgt.type==='hero'){ const gp = playerOf(S, tgt); if (gp && gp.god) return 0; }
  if (tgt.invT>0) return 0;                                 // untouchable — Omnislash
  if (opt.ability && warded(S, tgt)){                       // counterspelled
    parry(S, tgt, src, opt);
    return 0;
  }
  // Lightning Rod — a HERO's attack on a planted Zaal is turned aside and paid
  // for. Creep and tower fire still lands: a wave is what punishes him for rooting.
  if (opt.attack && tgt.parryT>0 && src && src.type==='hero' && src.team!==tgt.team){
    parry(S, tgt, src, opt);
    return 0;
  }
  // Healing Ward: spells slide straight off it, and every right click by an enemy
  // HERO takes exactly one of its hit points — no armor, no amplifiers, no splash.
  // Creeps, summons and towers cannot touch it at all.
  if (tgt.ward){
    if (!opt.attack || !src || src.type!=='hero') return 0;
    tgt.hp -= 1; tgt.hitFlash = .16;
    fx(S,{t:'dmg', x:tgt.x, y:tgt.y+2, r:tgt.r, v:1, c: src && src.type==='hero' ? 1 : 0});
    if (tgt.hp<=0) kill(S, src, tgt);
    return 1;
  }
  let dmg = amount;
  if (opt.ability && src && src.amp>0) dmg *= (1 + src.amp);
  if (src && src.brT>0) dmg *= (1 + src.brP);               // Bloodrage — everything hits harder
  // Lacerate — the Drifter tears harder into what is already bleeding from Bloodtrail
  if (src && src.lacer>0 && tgt.dotT>0 && tgt.dotSrc===src.id){
    dmg *= (1 + src.lacer);
    fx(S,{t:'lacerate', x:tgt.x, y:tgt.y});
  }
  // Pitch Black: Drift deals 20% more damage to night-blind targets
  if (src && src.heroId==='drift' && src.aghs && tgt.blindT>0) dmg *= 1.2;
  // creeps shrug off 30% of ability damage (pure cuts through; player summons are hero extensions)
  if (opt.ability && !opt.pure && tgt.type==='creep' && !tgt.pet) dmg *= 0.70;
  if (!opt.pure) dmg *= armorMult(effArmor(tgt));
  if (opt.attack && tgt.block>0 && Math.random()<0.6)                  // Stout Shield — 60% proc
    dmg = Math.max(0, dmg - tgt.block);
  if (tgt.type==='tower' && towerShielded(S, tgt)) dmg *= 0.15;   // backdoor protection
  if (tgt.illu)     dmg *= (src && src.type==='tower') ? 5 : (tgt.illuTake||1.6);
  if (src && src.illu && tgt.type==='tower') dmg *= (src.illuTower||0.1);  // no backdoor by copy
  if (src && src.brood && tgt.type==='tower') dmg *= 0.5;   // spawnlings chew stone slowly
  if (tgt.markT>0)  dmg *= (1 + tgt.markP);      // Hunter's Mark amplifies everything
  if (tgt.vulT>0)   dmg *= (1 + tgt.vulP);       // Bloodrage
  if (tgt.drT>0)    dmg *= (1 - tgt.drP);        // Bulwark
  // on-hit debuffs from items
  if (src){
    if (opt.attack  && src.hcut) { tgt.hcT = 5; tgt.hcP = .55; }   // Reaper's Sigil
    if (opt.ability && src.hcutM){ tgt.hcT = 6; tgt.hcP = .65; }   // Withering Rod
    if (opt.attack  && src.shredOn){ tgt.shredT = 5; tgt.shredV = 5; }
  }
  // Reactive Armor — every attack that lands on Timbersaw plates him further
  if (opt.attack && tgt.reactOn && src && src.team!==tgt.team){
    const before = tgt.raN||0;
    tgt.raN = Math.min(8, before + 1);
    tgt.raT = 12;
    if (tgt.raN>before) fx(S,{t:'plate', x:tgt.x, y:tgt.y, n:tgt.raN});
  }
  // shield
  if (tgt.shieldT>0 && tgt.shield>0){
    const abs = Math.min(tgt.shield, dmg);
    tgt.shield -= abs; dmg -= abs;
    fx(S,{t:'shield', x:tgt.x, y:tgt.y});
    if (tgt.shieldRef>0 && src && src.team!==tgt.team && !opt.reflected)
      damage(S, tgt, src, abs*tgt.shieldRef, {pure:true, silent:true, reflected:true, tag:'reflect'});
  }
  // Bloodletting: part of what lands on Shiv is put on account instead of taken now
  if (dmg>0 && tgt.deferPct>0 && !opt.defer){
    const held = dmg * tgt.deferPct;
    tgt.defer = (tgt.defer||0) + held;
    tgt.deferSrc = src ? src.id : 0;
    dmg -= held;
  }
  // Rage feeds on violence in both directions — including a creep wave, so farming
  // still builds it. Only a hero on the other end of the blow SUSTAINS it though:
  // rageT is what holds off the drain, and creeps never refresh it.
  if (dmg>0){
    if (src && src.rageOn){
      src.rage = Math.min(100, (src.rage||0) + dmg/12);
      if (tgt.type==='hero') src.rageT = 2.5;
    }
    if (tgt.rageOn){
      tgt.rage = Math.min(100, (tgt.rage||0) + dmg/18);
      if (src && src.type==='hero') tgt.rageT = 2.5;
    }
  }
  if (dmg<=0) return 0;
  // book-keeping for the post-game screen — a summon's work counts for its owner
  {
    const tag = damageTag(S, src, opt);
    const sp = ownerPlayer(S, src);
    if (sp){
      sp.dmgAll += dmg; bump(sp.dmgBy, tag, dmg);
      if (tgt.type==='hero'){ sp.dmgHero += dmg; bump(sp.dmgHeroBy, tag, dmg); }
    }
    if (tgt.type==='hero'){
      const tp = playerOf(S, tgt);
      if (tp){ tp.dmgTaken += dmg; bump(tp.takenBy, blameKey(S, src, tag, opt), dmg); }
    }
  }
  tgt.hp -= dmg;
  tgt.hitFlash = .16;
  tgt.salveT = 0;
  // Deep Freeze — Ilva's ability damage stacks Frostbite; the fourth stack
  // freezes the victim solid. A thawed target is immune for a few seconds.
  if (opt.ability && !opt.fb && src && src.frostTouch && tgt.type!=='tower' &&
      tgt.team!==src.team && !(tgt.fbCd>0) && tgt.hp>0){
    tgt.fbN = (tgt.fbN||0) + 1; tgt.fbT = 4;
    fx(S,{t:'disjoint', x:tgt.x, y:tgt.y});
    if (tgt.fbN>=4){
      tgt.fbN = 0; tgt.fbT = 0; tgt.fbCd = 3;
      fx(S,{t:'blast', x:tgt.x, y:tgt.y, r:90, col:'#bfe9ff'});
      applyStun(S, tgt, 1.1);
      damage(S, src, tgt, 100 + (tgt.maxHp||0)*0.06, {ability:true, fb:1, tag:'i:scepter'});
    }
  }
  if (!opt.silent)
    fx(S,{t:'dmg', x:tgt.x, y:tgt.y+2, r:tgt.r, v:Math.round(dmg),
          c: src && src.type==='hero' ? 1 : 0, ab: !!opt.ability, cr: !!opt.crit});
  if (opt.crit) fx(S,{t:'crit', x:tgt.x, y:tgt.y-4});
  // thorns
  if (opt.melee && tgt.thorns>0 && src && !src.dead)
    damage(S, tgt, src, dmg*tgt.thorns, {pure:true, silent:true, tag:'thorns'});
  if (opt.attack && tgt.barbT>0 && src && !src.dead && src.team!==tgt.team){
    damage(S, tgt, src, tgt.barbV, {pure:true, silent:true, tag:'barbs'});
    applySlow(src, .25, 1.2);
  }
  // lifesteal — buildings are not blood
  if (opt.attack && tgt.type!=='tower' && src && src.ls>0 && !src.dead){
    heal(S, src, dmg*src.ls);
    fx(S,{t:'heal', x:src.x, y:src.y});
  }
  // spell lifesteal (Soulweave) — ability damage feeds the caster; creeps are thin blood
  if (opt.ability && tgt.type!=='tower' && src && src.sls>0 && !src.dead && src.team!==tgt.team){
    heal(S, src, dmg*src.sls*(tgt.type==='hero' ? 1 : 1/3));
    if (tgt.type==='hero') fx(S,{t:'heal', x:src.x, y:src.y});
  }
  // creep pull — only ATTACKING an enemy hero drags their creeps onto you, as in Dota
  if (opt.attack && src && src.type==='hero' && tgt.type==='hero')
    S.aggro[tgt.team] = {t:PULL_TIME, id:src.id};
  // allied creep attacks can pull enemy tower agro onto that creep, like in Dota
  if (opt.attack && src && src.type==='hero' && tgt.type==='creep' && tgt.team===src.team)
    S.towerAggro[1-src.team] = {t:0.75, id:tgt.id};
  if (tgt.hp<=0) kill(S, src, tgt);
  return dmg;
}

/* What one Thirst payout is worth right now: the flat rank value plus a slice of the
   hero's own pool, so a late-game health bar does not make the passive irrelevant. */
export function thirstAmount(e){
  return (e.thirst||0) + (e.maxHp||0) * (e.thirstPct||0);
}

export function kill(S, src, tgt){
  if (tgt.dead) return;
  tgt.dead = true;
  fx(S,{t:'die', x:tgt.x, y:tgt.y, team:tgt.team, big: tgt.type!=='creep'});
  spreadEmber(S, tgt);            // Wildfire jumps off the corpse before anything else
  // Lacerate — anything that dies still bleeding from Bloodtrail feeds the Drifter
  if (tgt.dotT>0 && tgt.dotSrc){
    const ds = ent(S, tgt.dotSrc);
    if (ds && !ds.dead && ds.lacer>0){
      heal(S, ds, 90);
      fx(S,{t:'thirst', x:ds.x, y:ds.y, v:90});
    }
  }
  // From the Ashes — a hero that dies still burning erupts into a free Firestorm
  if (tgt.type==='hero' && tgt.embN>0){
    const asrc = ent(S, tgt.embSrc);
    if (asrc && !asrc.dead && asrc.aghs && asrc.heroId==='ash'){
      const q = playerOf(S, asrc);
      const lv = q && q.sk[3]>0 ? q.sk[3] : 1;
      S.zones.push({id:S.nextId++, kind:'firestorm', team:asrc.team, x:tgt.x, y:tgt.y,
        r:240, t:4, dps:HEROES.ash.abilities[3].val[lv-1], src:asrc.id,
        tickT:0, embT:0, tag:'i:scepter'});
      fx(S,{t:'blast', x:tgt.x, y:tgt.y, r:240, col:'#ff8a4a'});
    }
  }

  if (tgt.type==='creep' && tgt.pet){
    // Virulent Brood — Vhal's spawnlings are packed with venom and burst on death
    if (tgt.brood && tgt.oslot!==undefined){
      const q = S.players[tgt.oslot], h = q && q.hero;
      if (h && !h.dead && h.aghs){
        const prev = S.tag; S.tag = 'i:scepter';
        fx(S,{t:'blast', x:tgt.x, y:tgt.y, r:160, col:'#b78cff'});
        for (const o of S.ents){
          if (o.dead || o.team===tgt.team || o.type==='tower') continue;
          if (dist(o.x,o.y,tgt.x,tgt.y) > 160 + o.r) continue;
          damage(S, h, o, 40 + (h.maxHp||0)*0.05, {ability:true});
          if (!o.dead) applySlow(o, .30, 1.5);
        }
        S.tag = prev;
      }
    }
    return;                       // summons are worth no gold and no XP to anyone
  }
  else if (tgt.type==='creep' && tgt.neutral){
    // jungle camp member: the last hit pays its bounty AND banks a charge —
    // that exact creep type marches with the killer team's next wave
    const V = CAMP_VARIANTS[tgt.jungle] || {bounty:20, xp:20};
    const claimer = src && (src.type==='hero' || (src.type==='creep' && src.pet)) ? src : null;
    const p = claimer ? (claimer.type==='hero' ? playerOf(S, claimer)
            : (claimer.oslot!==undefined ? S.players[claimer.oslot] : null)) : null;
    if (p){
      p.cs++; addGold(p, V.bounty);
      fx(S,{t:'gold', x:tgt.x, y:tgt.y-40, v:V.bounty, pet: claimer.type!=='hero' ? 1:0});
      for (const q of nearbyHeroes(S, p.team, tgt.x, tgt.y, XP_RADIUS)){
        addXp(S, q, V.xp);
        if (q!==p){ addGold(q, V.bounty); fx(S,{t:'gold', x:q.hero.x, y:q.hero.y-40, v:V.bounty, passive:1}); }
      }
      S.campCharges[p.team].push(tgt.jungle);
      fx(S,{t:'jcharge', x:tgt.x, y:tgt.y-58, team:p.team, jg:tgt.jungle});
      if (claimer.type==='hero' && claimer.thirst>0 && !claimer.dead){
        const got = heal(S, claimer, thirstAmount(claimer));
        if (got>0) fx(S,{t:'thirst', x:claimer.x, y:claimer.y, v:Math.round(got)});
      }
    }
    return;
  }
  else if (tgt.type==='creep'){
    const deny = src && src.team===tgt.team;
    // XP goes in FULL to every enemy hero standing nearby — never split,
    // so a 2v2 lane levels at the same pace as a 1v1 lane; the 3v3 wave is
    // twice the creeps, so per-creep XP is trimmed like the bounty below
    const xpAmt = (tgt.kind==='ranged' ? 90 : 70) * (S.mode==='3v3' ? 0.65 : 1);
    const share = nearbyHeroes(S, 1-tgt.team, tgt.x, tgt.y, XP_RADIUS);
    for (const q of share) addXp(S, q, deny ? xpAmt*.5 : xpAmt);
    // the 3v3 lane spawns twice the creeps of 1v1 — the bounty is trimmed so
    // total farm income doesn't run away with the bigger wave
    const base = (tgt.kind==='ranged' ? 62 : 48) * (S.mode==='3v3' ? 0.65 : 1);
    // a killing blow from a hero OR from that hero's summon pays the full bounty —
    // credited to the player who actually landed it, not to a team index
    const claimer = src && (src.type==='hero' || (src.type==='creep' && src.pet)) ? src : null;
    if (claimer){
      const p = claimer.type==='hero' ? playerOf(S, claimer)
              : (claimer.oslot!==undefined ? S.players[claimer.oslot] : teamOf(S, claimer.team)[0]);
      if (p && deny){ p.denies++; addGold(p, 22); fx(S,{t:'deny', x:tgt.x, y:tgt.y-40}); }
      else if (p){
        const g = Math.round(base + rnd(-6,6));
        p.cs++; addGold(p, g);
        fx(S,{t:'gold', x:tgt.x, y:tgt.y-40, v:g, pet: src.type!=='hero' ? 1:0});
        // like XP and kill bounties, the lane pays teammates in FULL — a 2v2
        // player farms at 1v1 pace, and losing the CS race costs no gold
        for (const q of nearbyHeroes(S, p.team, tgt.x, tgt.y, XP_RADIUS)){
          if (q===p) continue;
          addGold(q, g);
          fx(S,{t:'gold', x:q.hero.x, y:q.hero.y-40, v:g, passive:1});
        }
      }
      // Thirst: the lane itself keeps him standing — flat, plus a slice of the pool
      if (claimer.type==='hero' && claimer.thirst>0 && !claimer.dead){
        const got = heal(S, claimer, thirstAmount(claimer));
        if (got>0) fx(S,{t:'thirst', x:claimer.x, y:claimer.y, v:Math.round(got)});
      }
    } else {
      // nobody last hit it and nobody denied it — the lane still pays out at half
      // rate, in FULL to everyone who could have taken it (no splitting). "Could
      // have taken it" means standing in XP range — not idling at the fountain
      const g = Math.round(base*0.5);
      for (const q of nearbyHeroes(S, 1-tgt.team, tgt.x, tgt.y, XP_RADIUS)) addGold(q, g);
      fx(S,{t:'gold', x:tgt.x, y:tgt.y-40, v:g, passive:1});
    }
    // Hive Ascendant: a corpse inside the hive gets straight back up on her side
    for (const z of S.zones){
      if (z.kind!=='hive' || z.team===tgt.team) continue;
      if (dist(z.x,z.y,tgt.x,tgt.y) > z.rr) continue;
      const q = S.players[z.slot];
      if (!q || !q.hero || q.hero.dead) break;
      let n = 0;
      for (const o of S.ents) if (!o.dead && o.brood && o.owner===q.hero.id) n++;
      if (n < z.cap){
        spawnBrood(S, q, tgt.x, tgt.y, 20);
        fx(S,{t:'raise', x:tgt.x, y:tgt.y});
      }
      break;
    }
  }
  else if (tgt.type==='tower'){
    for (const q of foesOf(S, tgt.team)) addGold(q, 400);
    const kt = 1 - tgt.team;
    if (S.hideout){
      // practice tower — pays the bounty, scores nothing, and stepHideout rebuilds it
      fx(S,{t:'towerdown', x:tgt.x, y:tgt.y, team:kt, v:0});
      return;
    }
    const worth = S.winKills;                 // it scores, and it also ends the match
    S.teamKills[kt] += worth;
    fx(S,{t:'towerdown', x:tgt.x, y:tgt.y, team:kt, v:worth});
    endGame(S, kt, 'tower');
  }
  else if (tgt.type==='hero'){
    const p = playerOf(S, tgt);
    if (!p) return;
    p.deaths++;
    p.respawn = 5 + p.lvl*1.2;
    // dying costs time, never gold — a gold tax only digs the losing player deeper
    if (src){
      const kt = src.team!==undefined ? src.team : 1-p.team;
      S.teamKills[kt]++;
      const killer = ownerPlayer(S, src) || teamOf(S, kt)[0];
      const bounty = 110 + p.lvl*10;
      if (killer){
        killer.kills++; addGold(killer, bounty); addXp(S, killer, 150 + p.lvl*20);
        logEvent(S, killer, 'kill', p.heroId);
      }
      logEvent(S, p, 'death', killer ? killer.heroId : '');
      // everyone else on that team who was in the fight gets a cut
      for (const q of teamOf(S, kt)){
        if (q===killer || !q.hero || q.hero.dead) continue;
        if (dist(q.hero.x, q.hero.y, tgt.x, tgt.y) > 950) continue;
        q.assists++; addGold(q, bounty);            // full cut — 2v2 pays like 1v1
        addXp(S, q, 150 + p.lvl*20);
      }
      if (src.type==='hero' && src.thirst>0 && !src.dead){
        const got = heal(S, src, thirstAmount(src)*5);
        if (got>0) fx(S,{t:'thirst', x:src.x, y:src.y, v:Math.round(got)});
      }
      fx(S,{t:'kill', x:tgt.x, y:tgt.y, team:kt});
      if (S.teamKills[kt] >= S.winKills) endGame(S, kt, 'kills');
    }
  }
}

/* ------------------------------ embers ----------------------------- */
/* Ash's EMBERS: a stack that burns and can be blown out for burst.
   Every one of his abilities either adds stacks or cashes them in. 
   Cap, per-stack damage and spread all come off whoever lit them. */
export function addEmber(S, e, n, src){
  if (!e || !src || e.dead || e.type==='tower' || e.csT>0) return;
  const cap = src.embCap || 3;
  e.embN     = Math.min(cap, (e.embN||0) + n);
  e.embCapV  = cap;
  e.embDps   = src.embPow || 5;
  e.embSpread= !!src.embSpread;
  e.embSrc   = src.id;
  e.embT     = 8;                              // any fresh ember relights the whole stack
  if (!(e.embTick>0)) e.embTick = .5;
  fx(S,{t:'ember', x:e.x, y:e.y, v:e.embN});
}
export function clearEmber(e){
  e.embN=0; e.embT=0; e.embDps=0; e.embTick=0; e.embSpread=false; e.embHold=0;
}
export function tickEmber(S, e, dt){
  if (!(e.embT>0)) return;
  if (e.embHold>0) e.embHold -= dt;            // inside a Firestorm nothing goes out
  else e.embT -= dt;
  e.embTick = (e.embTick||.5) - dt;
  if (e.embTick<=0){
    e.embTick = .5;
    const prev = S.tag; S.tag = 'ember';
    damage(S, ent(S,e.embSrc), e, (e.embN||0)*(e.embDps||0)*.5, {ability:true});
    S.tag = prev;
  }
  if (e.embT<=0) clearEmber(e);
}
/* Wildfire — a corpse throws whatever was still burning on it to the next body over. */
export function spreadEmber(S, from){
  if (!(from.embN>0) || !from.embSpread) return;
  let best=null, bd=350;
  for (const o of S.ents){
    if (o.dead || o===from || o.team!==from.team || o.type==='tower') continue;
    const d = dist(o.x,o.y,from.x,from.y);
    if (d<bd){ bd=d; best=o; }
  }
  if (!best) return;
  best.embN     = Math.min(from.embCapV||6, (best.embN||0) + from.embN);
  best.embCapV  = from.embCapV||6;
  best.embDps   = from.embDps;
  best.embSpread= true;
  best.embSrc   = from.embSrc;
  best.embT     = 8;
  if (!(best.embTick>0)) best.embTick = .5;
  fx(S,{t:'emberjump', x:from.x, y:from.y, x2:best.x, y2:best.y});
}
export function applyDot(S, e, dps, t, srcId, stack){
  if (!e || e.dead || e.csT>0) return;
  if (stack) e.dotDps = (e.dotT>0 ? (e.dotDps||0) : 0) + dps;
  else e.dotDps = Math.max(e.dotDps||0, dps);
  e.dotT   = Math.max(e.dotT||0, t);
  e.dotSrc = srcId;
  e.dotTag = S.tag || 'dot';                   // remember what lit it, for the breakdown
  if (!e.dotTick) e.dotTick = .5;
}
export function tickDot(S, e, dt){
  if (!e.dotT || e.dotT<=0) return;
  e.dotT -= dt;
  e.dotTick = (e.dotTick||.5) - dt;
  if (e.dotTick<=0){
    e.dotTick = .5;
    const src = ent(S,e.dotSrc);
    const prev = S.tag; S.tag = e.dotTag || 'dot';
    const dealt = damage(S, src, e, e.dotDps*.5, {ability:true});
    S.tag = prev;
    if (src && src.bleedHeal>0 && !src.dead) heal(S, src, dealt*src.bleedHeal);
  }
  if (e.dotT<=0){ e.dotDps=0; e.dotTick=0; }
}
/* Rupture: Damage is charged per 80 units
   travelled and banked so the floating numbers do not turn into a stream. */
export function tickRupture(S, e, dt){
  if (!(e.rupT>0)) return;
  e.rupT -= dt;
  const lx = e.rupLx===undefined ? e.x : e.rupLx;
  const ly = e.rupLy===undefined ? e.y : e.rupLy;
  const moved = dist(e.x, e.y, lx, ly);
  e.rupLx = e.x; e.rupLy = e.y;
  if (moved > 1 && !e.dead){
    const amt = moved/80 * (e.rupV||0);
    damage(S, ent(S,e.rupSrc), e, amt, {pure:true, silent:true, tag:'a3'});
    e.rupBank = (e.rupBank||0) + amt;
    if (e.rupBank >= 18){
      fx(S,{t:'dmg', x:e.x, y:e.y+2, r:e.r, v:Math.round(e.rupBank), ab:1});
      fx(S,{t:'bleed', x:e.x, y:e.y});
      e.rupBank = 0;
    }
  }
  if (e.rupT<=0){ e.rupT=0; e.rupV=0; e.rupBank=0; e.rupLx=undefined; e.rupLy=undefined; }
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
  // a long immunity (Bladefury) eats a spell every frame — only flash for some of them
  if (!(e.wardFxT>0)){ fx(S,{t:'counter', x:e.x, y:e.y}); e.wardFxT = 0.25; }
  return true;
}
/* Lightning Rod: while Zaal is planted, whatever an enemy hero throws at him is
   turned aside and the thrower eats it instead. `opt.parried` marks the shock
   itself so two planted heroes cannot bounce it back and forth forever. */
export function parry(S, def, src, opt){
  if (!(def.parryT>0) || !src || src.dead || src.type!=='hero' || src.team===def.team) return;
  if (opt && opt.parried) return;
  const prev = S.tag; S.tag = 'a2';
  fx(S,{t:'counter', x:def.x, y:def.y});
  fx(S,{t:'chain', x:def.x, y:def.y-8, x2:src.x, y2:src.y-8, col:'#9fd8ff'});
  damage(S, def, src, def.parryV||0, {ability:true, parried:true});
  applyStun(S, src, 0.5);
  S.tag = prev;
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
