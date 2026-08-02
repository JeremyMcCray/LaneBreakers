// @ts-nocheck
/* Tournament draft/field rules: a fielded hero belongs to the seat that clicked it,
   one pick per seat, losers refield after a loss, and the legacy slot-less path
   still fills every seat. */
import { tourNew, tourDraft, tourDraftTeam, tourField, tourPicks, tourResult, tourSlotPicked } from "../src/app/tournament.ts";
import { HERO_IDS } from "../src/data/heroes.ts";

const teamOfSlot = (sl) => sl % 2;
const T = tourNew("3v3", 3);
T.first = 0;
// draft alternating from the roster
let i = 0;
while (T.phase === "draft") {
  const tm = tourDraftTeam(T);
  if (!tourDraft(T, tm, HERO_IDS[i])) throw new Error("draft refused " + HERO_IDS[i]);
  i++;
}
// slots 0,2,4 = team 0; 1,3,5 = team 1. Field in scrambled seat order.
const want = {};
for (const sl of [4, 1, 0, 5, 2, 3]) {
  const tm = teamOfSlot(sl);
  const hero = T.pool[tm].find((h) => T.cur[tm].indexOf(h) < 0);
  if (!tourField(T, tm, hero, sl)) throw new Error("field refused for slot " + sl);
  want[sl] = hero;
}
if (T.phase !== "ready") throw new Error("phase should be ready, is " + T.phase);
// double-pick must be refused
if (tourField(T, 0, T.pool[0][5], 4)) throw new Error("slot 4 fielded twice");
if (!tourSlotPicked(T, 0, 4)) throw new Error("tourSlotPicked wrong");
let picks = tourPicks(T, null, teamOfSlot);
for (let sl = 0; sl < 6; sl++)
  if (picks[sl].h !== want[sl]) throw new Error("slot " + sl + " got " + picks[sl].h + " wanted " + want[sl]);

// team 1 loses: their curSlot clears, winners keep theirs; losers refield
tourResult(T, 0);
if (T.curSlot[1].length !== 0 || T.curSlot[0].length !== 3) throw new Error("curSlot reset wrong");
for (const sl of [3, 5, 1]) {
  const tm = 1;
  const hero = T.pool[tm].find((h) => T.cur[tm].indexOf(h) < 0);
  if (!tourField(T, tm, hero, sl)) throw new Error("refield refused for slot " + sl);
  want[sl] = hero;
}
picks = tourPicks(T, null, teamOfSlot);
for (let sl = 0; sl < 6; sl++)
  if (picks[sl].h !== want[sl]) throw new Error("game2 slot " + sl + " got " + picks[sl].h + " wanted " + want[sl]);

// legacy path: no slot given still fills every seat
const L = tourNew("2v2", 3);
L.first = 0;
i = 0;
while (L.phase === "draft") { tourDraft(L, tourDraftTeam(L), HERO_IDS[i]); i++; }
for (const tm of [0, 1]) { tourField(L, tm, L.pool[tm][0]); tourField(L, tm, L.pool[tm][1]); }
const lp = tourPicks(L, null, teamOfSlot);
if (lp.some((p) => !p.h)) throw new Error("legacy picks left a hole: " + JSON.stringify(lp));

console.log("tournament seat-assignment OK");
