#!/usr/bin/env node
/* =====================================================================
   versus.js — put two brains in a room and see who comes out.

       node versus.js --a balanced --b bot
       node versus.js --a brawler  --b farmer --games 100
       node versus.js --a balanced/gen0000 --b balanced/best
       node versus.js --all                       (round robin, everyone)

   Names resolve like this:
       bot                  the original hand-written bot
       balanced             brains/balanced/best.json
       balanced/gen0050     that checkpoint
       ./some/path.json     that exact file

   Sides swap every other game and both contestants get identical seeds
   and hero matchups, so nobody wins on the coin toss.

   For experiments rather than single fights, see lab.js.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadGame } = require('./engine.js');
const Arena = require('./arena.js');
const Compete = require('./compete.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    a[k] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
  }
  return a;
}
const A = parseArgs(process.argv);
const GAMES   = +(A.games || 40);
const MODE    = A.mode || '1v1';
const MAXTIME = +(A.maxtime || 600);

const game = loadGame();
const api  = Arena.makeAPI(game);
const allHeroes = Object.keys(game.HEROES);
const heroes = A.hero && A.hero !== 'random' ? A.hero.split(',') : null;

function resolve(name) {
  try {
    return Compete.resolveBrain(name);
  } catch (err) {
    console.error('\n  ' + err.message + '\n');
    process.exit(1);
  }
}

const schedule = Compete.buildSchedule(GAMES, { mode: MODE, allHeroes, heroes, seed: 999 });
const opts = { mode: MODE, maxTime: MAXTIME };

function report(A_, B_, r) {
  const w = 34;
  const at = Math.round((r.aw / r.n) * w);
  console.log('');
  console.log('  ' + A_.label + '   vs   ' + B_.label + '     (' + r.n + ' games, ' + MODE + ')');
  console.log('  ' + '─'.repeat(70));
  console.log('  ' + A_.label.padEnd(20).slice(0, 20) + ' ' + String(r.aw).padStart(3) + ' wins  ' +
              '█'.repeat(at) + '░'.repeat(w - at) + '  ' + Compete.pct(r.aw / r.n));
  console.log('  ' + B_.label.padEnd(20).slice(0, 20) + ' ' + String(r.bw).padStart(3) + ' wins  ' +
              '█'.repeat(w - at) + '░'.repeat(at) + '  ' + Compete.pct(r.bw / r.n));
  if (r.draws) console.log('  ' + 'draws'.padEnd(20) + ' ' + String(r.draws).padStart(3));
  console.log('');
  const row = (label, f, dp) =>
    '  ' + label.padEnd(14) + String(r.st.a[f].toFixed(dp === undefined ? 1 : dp)).padStart(9) +
    String(r.st.b[f].toFixed(dp === undefined ? 1 : dp)).padStart(11);
  console.log('  per game'.padEnd(16) + A_.label.slice(0, 9).padStart(9) + B_.label.slice(0, 9).padStart(11));
  ['cs', 'denies', 'kills', 'deaths', 'lvl'].forEach(f => console.log(row(
    { cs: 'last hits', denies: 'denies', kills: 'kills', deaths: 'deaths', lvl: 'level' }[f], f)));
  console.log(row('tower dmg', 'towerDmg', 0));
  console.log(row('lane pos', 'lane', 2));
  console.log('');
  console.log('  ' + A_.label.slice(0, 16).padEnd(17) + 'plays: ' + Compete.styleOf(r.st.a.macro));
  console.log('  ' + B_.label.slice(0, 16).padEnd(17) + 'plays: ' + Compete.styleOf(r.st.b.macro));
  console.log('');
}

if (A.all) {
  const dir = path.join(__dirname, 'brains');
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(d => d[0] !== '_' &&
        fs.existsSync(path.join(dir, d, 'best.json')))
    : [];
  names.push('bot');
  if (names.length < 2) {
    console.error('\n  Need at least two trained brains. Run train.js first.\n');
    process.exit(1);
  }
  const fighters = [];
  for (const n of names) {
    try { fighters.push(Compete.resolveBrain(n)); }
    catch (err) { console.log('  (skipping ' + n + ': ' + err.message.split('\n')[0] + ')'); }
  }
  console.log('\n  ROUND ROBIN — ' + fighters.length + ' contestants, ' + GAMES + ' games per pairing\n');
  const table = Compete.roundRobin(game, api, fighters, schedule, opts, (a, b, r) => {
    console.log('  ' + a.label.padEnd(16) + String(r.aw).padStart(4) + ' - ' +
                String(r.bw).padEnd(4) + ' ' + b.label);
  });
  console.log('\n  STANDINGS');
  console.log('  ' + '─'.repeat(52));
  fighters.map((f, i) => ({ f, ...table[i] })).sort((a, b) => b.rate - a.rate)
    .forEach((r, i) => {
      console.log('  ' + String(i + 1).padStart(2) + '. ' + r.f.label.padEnd(18) +
        String(r.w).padStart(4) + 'W ' + String(r.l).padStart(4) + 'L   ' +
        Compete.pct(r.rate).padStart(5) + '  ' + '█'.repeat(Math.round(r.rate * 20)));
    });
  console.log('');
} else {
  const A_ = resolve(A.a || 'balanced');
  const B_ = resolve(A.b || 'bot');
  report(A_, B_, Compete.duel(game, api, A_, B_, schedule, opts));
}
