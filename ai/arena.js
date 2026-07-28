/* =====================================================================
   arena.js — plays one match, headless, and reports what happened.

   This is the bit that turns "a pile of weights" into "a score". It sets
   up a game, hands each side to whatever controller you name, runs the
   clock at 60 ticks a second until somebody wins, and hands back a row
   of statistics.

   Controllers you can hand it:
     {kind:'nn',   genome}   a neural bot
     {kind:'bot'}            the original hand-written bot from the game
     {kind:'idle'}           does nothing (useful as a sanity baseline)
   ===================================================================== */
'use strict';
const Brain = require('./brain.js');

/* The small set of game functions the brain needs to reach into. */
function makeAPI(game) {
  return {
    HEROES: game.HEROES,
    ITEMS: game.ITEMS,
    TOWER_X: game.TOWER_X,
    BASE_X: game.BASE_X,
    canCast: game.canCast || ((S, p, i) => {
      // canCast is not exported by older builds — fall back to a copy
      const e = p.hero, A = game.HEROES[p.heroId].abilities[i];
      if (!e || e.dead || e.stun > 0 || S.over) return false;
      if (p.sk[i] <= 0 || A.passive) return false;
      if (A.charges) { if ((p.chg[i] || 0) <= 0) return false; }
      else if (p.cds[i] > 0) return false;
      if (e.silT > 0) return false;
      if (A.blink && e.rootT > 0) return false;
      return e.mp >= A.mana[p.sk[i] - 1];
    }),
    castAbility: game.castAbility,
    buyItem: game.buyItem,
    useItem: game.useItem,
    armorMult: game.armorMult
  };
}

const HERO_IDS = g => Object.keys(g.HEROES);

/* ---------------------------------------------------------------------
   runMatch
   --------------------------------------------------------------------- */
function runMatch(game, api, cfg) {
  const seed  = cfg.seed || 1;
  const mode  = cfg.mode || '1v1';
  const agents = cfg.agents;                     // one per slot
  game.__setSeed(seed);

  const picks = cfg.picks.map((h, i) => ({ h, tm: i % 2 }));
  const S = game.newSim(picks, mode);
  /* Nothing is being drawn, so don't build the objects the renderer would
     have eaten. Worth about 20% of training throughput. Requires the fx
     patch that bake.js applies to the game file; harmless without it. */
  S.noFx = true;

  const towerStart = {};
  for (const o of S.ents) if (o.type === 'tower') towerStart[o.team] = o.hp;

  const TICK = 1 / 60;
  const maxT = cfg.maxTime || 900;
  // track how far up the lane each player spends its time — a cheap,
  // surprisingly informative measure of how aggressive a bot really is
  const laneSum = new Array(S.players.length).fill(0);
  const laneN   = new Array(S.players.length).fill(0);
  let sampleAcc = 0;

  while (!S.over && S.t < maxT) {
    for (const p of S.players) {
      const a = agents[p.slot];
      if (!a || a.kind === 'idle') continue;
      if (a.kind === 'bot') game.botThink(S, p, TICK);
      else Brain.think(api, S, p, TICK, a.genome, a.opts);
    }
    game.simStep(S, TICK);
    S.fx.length = 0;                              // nothing renders; don't let it pile up

    sampleAcc += TICK;
    if (sampleAcc >= 0.5) {
      sampleAcc = 0;
      for (const p of S.players) {
        if (!p.hero || p.hero.dead) continue;
        const dir = p.team === 0 ? 1 : -1;
        const my = game.TOWER_X[p.team], fo = game.TOWER_X[1 - p.team];
        laneSum[p.slot] += ((p.hero.x - my) * dir) / Math.abs(fo - my);
        laneN[p.slot]++;
      }
    }
  }

  /* If we stopped the match early on our own time cap, decide it the way
     the game itself decides a match that reaches the clock: kills, then
     net worth, then last hits. Leaving it as a draw was quietly disastrous
     — the win reward would almost never be paid, and the bots would train
     with no idea that winning was the point. */
  if (!S.over) {
    const sum = (t, f) => S.players.filter(p => p.team === t).reduce((a, p) => a + f(p), 0);
    let w;
    if (S.teamKills[0] !== S.teamKills[1]) w = S.teamKills[0] > S.teamKills[1] ? 0 : 1;
    else {
      const na = sum(0, game.netWorth), nb = sum(1, game.netWorth);
      if (Math.abs(na - nb) > 50) w = na > nb ? 0 : 1;
      else {
        const ca = sum(0, p => p.cs), cb = sum(1, p => p.cs);
        w = ca !== cb ? (ca > cb ? 0 : 1) : 0;
      }
    }
    S.winner = w;
    S.over = true;
    S.how = 'timecap';
  }

  const towerDmg = [0, 0];
  const towerAlive = [false, false];
  for (const o of S.ents) {
    if (o.type !== 'tower') continue;
    towerAlive[o.team] = !o.dead;
    // damage dealt TO team o.team's tower is credit for the other team
    towerDmg[1 - o.team] += (towerStart[o.team] - Math.max(0, o.hp));
  }
  for (let t = 0; t < 2; t++) if (!towerAlive[t]) towerDmg[1 - t] = towerStart[t];

  const players = S.players.map(p => {
    const mem = p.nn;
    const macro = mem && mem.macroTime ? mem.macroTime.slice() : new Array(8).fill(0);
    const macroTotal = macro.reduce((a, b) => a + b, 0) || 1;
    return {
      slot: p.slot, team: p.team, heroId: p.heroId,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      cs: p.cs, denies: p.denies, lvl: p.lvl, xp: p.xp,
      gold: p.gold, netWorth: game.netWorth ? game.netWorth(p) : p.gold,
      dmgHero: p.dmgHero, dmgAll: p.dmgAll, healed: p.healed,
      towerDmg: towerDmg[p.team],
      items: p.items.map(i => i.id),
      skills: p.sk.slice(),
      won: S.winner === p.team ? 1 : 0,
      draw: S.winner < 0 ? 1 : 0,
      laneAvg: laneN[p.slot] ? laneSum[p.slot] / laneN[p.slot] : 0,
      macroPct: macro.map(v => v / macroTotal)
    };
  });

  return {
    winner: S.winner, how: S.how || 'time', duration: S.t,
    teamKills: S.teamKills.slice(), players, seed, mode,
    towerDmg
  };
}

/* Fitness lives in brain.js so that the Node trainer and the in-game
   trainer score matches with identical arithmetic. Re-exported here for
   convenience. */
const score = Brain.score;

module.exports = { makeAPI, runMatch, score, HERO_IDS };
