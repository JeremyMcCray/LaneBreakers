// @ts-nocheck
/* Post-game breakdown + graphs: play real matches, then render the actual panels
   through a DOM shim and check the markup that comes out. Catches the things that
   silently ruin a chart — NaN in a path, undefined labels, percentages that do not
   add up, series that never made it into the payload. */
import { newSim, simStep, buildSnapshot, endGame, timeWinner } from "../src/sim/engine.ts";
import { botThink } from "../src/ai/bot.ts";
import { HEROES } from "../src/data/heroes.ts";

/* ---- minimal DOM so the real render path runs unchanged ---- */
const made = [];
function el() {
  const e = {
    innerHTML: "", dataset: {}, style: {}, className: "",
    querySelectorAll: () => [], querySelector: () => el(),
    addEventListener() {}, appendChild() {},
  };
  made.push(e); return e;
}
const stats = el();
globalThis.document = {
  getElementById: id => (id === "endStats" ? stats : el()),
  createElement: el, querySelector: () => el(), querySelectorAll: () => [],
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { renderMatchStats, resetMatchStats, tagLabel } = await import("../src/ui/matchStats.ts");
const { G } = await import("../src/app/state.ts");

const TICK = 1 / 60;
let fails = 0;
const ok = (name, cond, detail) => { if (!cond) fails++; console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); };

function play(a, b, mode) {
  const picks = mode === "2v2"
    ? [{ h: a, tm: 0 }, { h: b, tm: 1 }, { h: "gruk", tm: 0 }, { h: "zaal", tm: 1 }]
    : [{ h: a, tm: 0 }, { h: b, tm: 1 }];
  const S = newSim(picks, mode || "1v1");
  S.noFx = true;
  while (!S.over && S.t < 420) { for (const p of S.players) botThink(S, p, TICK); simStep(S, TICK); }
  // a match that outruns the bench ends the way the real time limit ends it
  if (!S.over) endGame(S, timeWinner(S), "time");
  return S;
}

/* every number that lands in an SVG geometry attribute must be finite */
function svgNumbersFinite(html) {
  const bad = [];
  for (const m of html.matchAll(/\sd="([^"]+)"/g))
    for (const n of m[1].match(/-?\d*\.?\d+(e[-+]?\d+)?/gi) || [])
      if (!Number.isFinite(+n)) bad.push(n);
  for (const attr of ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "width", "height"])
    for (const m of html.matchAll(new RegExp('\\s' + attr + '="([^"]*)"', "g")))
      if (m[1] && !/^-?\d*\.?\d+%?$/.test(m[1]) && !Number.isFinite(+m[1])) bad.push(attr + "=" + m[1]);
  return bad;
}
function render(v, tab) {
  resetMatchStats();
  renderMatchStats(v, "<table class='stab etbl'><tr><td>summary</td></tr></table>", tab);
  return stats.innerHTML;
}

console.log("\n== payload — the final snapshot carries the detail, mid-game ones do not ==");
{
  const S = play("ash", "vhal");
  const fin = buildSnapshot(S, 0);
  ok("final snapshot has per-source damage", fin.ps.every(p => p.dby), "");
  ok("final snapshot has a series", fin.ps.every(p => p.sr && p.sr.length > 2), `${fin.ps[0].sr.length} samples`);
  ok("final snapshot has events", fin.ps.some(p => p.ev && p.ev.length), `${fin.ps[0].ev.length} events`);
  ok("series rows are all 10 wide", fin.ps.every(p => p.sr.every(r => r.length === 10)), "");
  ok("series time is monotonic", fin.ps.every(p => p.sr.every((r, i, a) => !i || r[0] >= a[i - 1][0])), "");
  ok("cumulative totals never go backwards",
     fin.ps.every(p => p.sr.every((r, i, a) => !i || (r[1] >= a[i - 1][1] && r[4] >= a[i - 1][4] && r[6] >= a[i - 1][6]))), "");

  const S2 = newSim([{ h: "vex", tm: 0 }, { h: "sable", tm: 1 }], "1v1");
  S2.noFx = true;
  for (let i = 0; i < 60 * 90; i++) { for (const p of S2.players) botThink(S2, p, TICK); simStep(S2, TICK); }
  const mid = buildSnapshot(S2, 0);
  const midBytes = JSON.stringify(mid).length;
  ok("mid-game snapshot stays lean", !mid.ps[0].sr && !mid.ps[0].dby && midBytes < 9000, `${midBytes} bytes`);
}

console.log("\n== attribution — every point of damage is accounted for ==");
{
  for (const [a, b] of [["ash", "vhal"], ["zaal", "ronin"], ["orrin", "nix"], ["shiv", "svaar"]]) {
    const S = play(a, b);
    for (const p of S.players) {
      const tagged = Object.values(p.dmgBy).reduce((x, y) => x + y, 0);
      ok(`${p.heroId}: tagged total matches dmgAll`, Math.abs(tagged - p.dmgAll) < 1,
         `${Math.round(tagged)} vs ${Math.round(p.dmgAll)}`);
      const heroTagged = Object.values(p.dmgHeroBy).reduce((x, y) => x + y, 0);
      ok(`${p.heroId}: hero-damage tags match dmgHero`, Math.abs(heroTagged - p.dmgHero) < 1,
         `${Math.round(heroTagged)} vs ${Math.round(p.dmgHero)}`);
      const unknown = Object.keys(p.dmgBy).filter(k => k === "other" || k === "abil");
      ok(`${p.heroId}: nothing fell through to a generic bucket`, unknown.length === 0, unknown.join(",") || "clean");
    }
    // damage taken on one side is damage dealt to heroes from the other
    const taken = S.players.reduce((x, p) => x + p.dmgTaken, 0);
    const dealtToHeroes = S.players.reduce((x, p) => x + p.dmgHero, 0);
    ok(`${a} vs ${b}: taken reconciles with hero damage dealt`, taken >= dealtToHeroes - 1,
       `taken ${Math.round(taken)} >= dealt ${Math.round(dealtToHeroes)} (rest is creeps/towers)`);
  }
}

console.log("\n== labels — every tag resolves to something a human reads ==");
{
  const S = play("ash", "vhal");
  const fin = buildSnapshot(S, 0);
  const bad = [];
  for (const p of fin.ps) {
    for (const k of Object.keys(p.dby)) {
      const L = tagLabel(p.hid, k);
      if (!L || L === k && !/^[A-Z]/.test(L)) bad.push(p.hid + ":" + k + "->" + L);
    }
    for (const k of Object.keys(p.tby)) {
      const tag = k.slice(k.indexOf("|") + 1);
      const slot = +k.slice(0, k.indexOf("|"));
      if (!Number.isInteger(slot)) bad.push("bad blame key " + k);
      const owner = fin.ps.find(q => q.sl === slot);
      const L = tagLabel(owner ? owner.hid : "vex", tag);
      if (!L) bad.push("no label for " + k);
    }
  }
  ok("all damage tags resolve", bad.length === 0, bad.join(", ") || "clean");
  ok("ability tags become ability names", tagLabel("ash", "a0") === "Q · Cinderbolt", tagLabel("ash", "a0"));
  ok("item tags become item names", tagLabel("ash", "i:bomb") === "Arcane Bomb", tagLabel("ash", "i:bomb"));
  ok("plain tags stay readable", tagLabel("ash", "ember") === "Embers", tagLabel("ash", "ember"));
}

console.log("\n== markup — the panels render clean for 1v1 and 2v2 ==");
{
  for (const mode of ["1v1", "2v2"]) {
    const S = play("ash", "vhal", mode);
    const v = buildSnapshot(S, 0);
    G.mySlot = 0; G.myTeam = 0;
    const all = ["sum", "dmg", "time"].map(t => render(v, t)).join("");
    ok(mode + ": no undefined/NaN leaked into the markup",
       !/undefined|NaN|\[object/.test(all), (all.match(/undefined|NaN|\[object \w+/g) || []).slice(0, 3).join(","));
    const badNums = svgNumbersFinite(all);
    ok(mode + ": every SVG coordinate is finite", badNums.length === 0, badNums.slice(0, 4).join(",") || "clean");
    ok(mode + ": tab bar is present", /class="etabs"/.test(all), "");
  }
}

console.log("\n== panels render with the real data, tab by tab ==");
{
  const S = play("zaal", "ronin");
  const v = buildSnapshot(S, 0);
  G.mySlot = 0; G.myTeam = 0;
  const dmg = render(v, "dmg");
  ok("damage pane lists per-ability rows", /Arc Lightning/.test(dmg), "");
  ok("damage pane shows percentages", /class="dpct"/.test(dmg), "");
  ok("damage pane has a player selector", /class="dtab/.test(dmg), "");
  ok("damage pane names who hurt you", /class="dsub"/.test(dmg), "");

  const tl = render(v, "time");
  const charts = (tl.match(/class="chart"/g) || []).length;
  ok("timeline draws six single-measure charts", charts === 6, `${charts} charts`);
  ok("every chart has a polyline path", (tl.match(/class="cln"/g) || []).length >= 6 * 2, "");
  ok("legend is present", /class="clegend"/.test(tl), "");
  ok("purchase rail is present", /class="brail"/.test(tl), "");
  ok("rail pins carry a hover title", /class="brtrack"[\s\S]*?title="/.test(tl), "");
  ok("charts carry a crosshair layer", (tl.match(/class="ccross"/g) || []).length === 6, "");
  ok("no dual-axis: one measure per figure",
     (tl.match(/data-key="/g) || []).length === 6 &&
     new Set((tl.match(/data-key="(\d+)"/g) || [])).size === 6, "");

  // geometry: nothing may be plotted outside the 340x132 viewBox
  const CW = 340, CH = 132, out = [];
  for (const m of tl.matchAll(/\sd="([^"]+)"/g)) {
    const nums = (m[1].match(/-?\d+(\.\d+)?/g) || []).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      if (nums[i] < -0.5 || nums[i] > CW + 0.5) out.push("x=" + nums[i]);
      if (nums[i + 1] < -0.5 || nums[i + 1] > CH + 0.5) out.push("y=" + nums[i + 1]);
    }
  }
  ok("every plotted point sits inside the viewBox", out.length === 0, out.slice(0, 4).join(",") || "clean");

  // palette discipline: never more series than validated categorical slots
  const S4 = play("ash", "vhal", "2v2");
  const v4 = buildSnapshot(S4, 0);
  const tl4 = render(v4, "time");
  const hues = new Set((tl4.match(/class="cln" d="[^"]*" stroke="(#[0-9a-f]{6})"/g) || [])
    .map(s => s.slice(-8, -1)));
  ok("2v2 uses at most the four validated slots", hues.size <= 4, [...hues].join(",") + ` (${hues.size})`);
  ok("legend names every series in 2v2", (tl4.match(/class="clegend"[\s\S]*?<\/div>/)[0].match(/<span>/g) || []).length >= 4, "");
}

console.log(fails === 0 ? "\nALL CHECKS PASSED" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
