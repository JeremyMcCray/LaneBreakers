// @ts-nocheck
/**
 * Live balance tuning for the dev sandbox.
 *
 * Everything the sim reads about a hero comes out of `HEROES` on the tick or the
 * cast that needs it — `updateHeroStats` re-reads it every frame, `castAbility`
 * re-reads it every cast, and the HUD re-reads it every draw. So writing into
 * that object is all it takes to see a number change land in real time.
 *
 * This module owns:
 *   - BASE, an untouched snapshot taken before anything is applied
 *   - the override map (what you changed, and to what)
 *   - apply / reset / persist / export
 *
 * Nothing here is imported by `src/sim/`. Overrides live in localStorage and are
 * reapplied at boot, so a tuned session survives a reload — the panel shows a
 * loud badge whenever any are live so you never mistake it for real balance.
 */
import { HEROES, HERO_IDS } from '../data/heroes';
import { WORLD_TUNABLES, getWorldTunable, setWorldTunable } from '../data/world';

const KEY = 'lb.dev.tuning';

/* Pristine values, captured before a single override is applied. */
export const BASE = JSON.parse(JSON.stringify(HEROES));
const BASE_WORLD = {};
for (const t of WORLD_TUNABLES) BASE_WORLD[t.k] = getWorldTunable(t.k);

/** key -> number. Keys are  h.<hero>.<stat> | h.<hero>.a<i>.<field>[.<rank>] | w.<KEY> */
export let overrides = {};

/* ------------------------------ schema ----------------------------- */
/* What the panel is allowed to touch, and the sane range for each. `max` is a
   slider bound, not a hard cap — you can always type a bigger number. */
export const HERO_STATS = [
  {k:'hp',        label:'Base HP',           min:100, max:2000, step:5},
  {k:'hpg',       label:'HP per level',      min:0,   max:300,  step:1},
  {k:'mp',        label:'Base mana',         min:0,   max:1200, step:5},
  {k:'mpg',       label:'Mana per level',    min:0,   max:200,  step:1},
  {k:'dmg',       label:'Base damage',       min:0,   max:300,  step:1},
  {k:'dmgg',      label:'Damage per level',  min:0,   max:40,   step:.1},
  {k:'arm',       label:'Base armor',        min:-10, max:40,   step:.1},
  {k:'armg',      label:'Armor per level',   min:0,   max:5,    step:.01},
  {k:'ms',        label:'Move speed',        min:100, max:800,  step:1},
  {k:'range',     label:'Attack range',      min:60,  max:1600, step:5},
  {k:'bat',       label:'Base attack time',  min:.15, max:3,    step:.01},
  {k:'projSpeed', label:'Projectile speed',  min:200, max:4000, step:25, opt:true}
];
/* Ability fields. `arr` ones are per-rank; the rest are single numbers. */
export const AB_FIELDS = [
  {k:'range',   label:'Cast range', min:0, max:2000, step:10, opt:true},
  {k:'aoe',     label:'AOE radius', min:0, max:900,  step:10, opt:true},
  {k:'charges', label:'Charges',    min:1, max:9,    step:1,  opt:true},
  {k:'val',     label:'Value',      arr:true, min:0, max:1200, step:1},
  {k:'val2',    label:'Value 2',    arr:true, min:0, max:400,  step:1, opt:true},
  {k:'cd',      label:'Cooldown',   arr:true, min:0, max:180,  step:.5},
  {k:'mana',    label:'Mana cost',  arr:true, min:0, max:600,  step:5}
];
export { WORLD_TUNABLES };

/* ------------------------------ keys ------------------------------- */
export const heroKey = (h, stat) => 'h.' + h + '.' + stat;
export const abKey   = (h, i, field, rank) =>
  'h.' + h + '.a' + i + '.' + field + (rank === undefined ? '' : '.' + rank);
export const worldKey = k => 'w.' + k;

/** The shipped value behind a key — what `Reset` puts back. */
export function baseValue(key){
  const s = key.split('.');
  if (s[0] === 'w') return BASE_WORLD[s[1]];
  const H = BASE[s[1]];
  if (!H) return undefined;
  if (s[2][0] !== 'a' || isNaN(+s[2].slice(1))) return H[s[2]];
  const A = H.abilities[+s[2].slice(1)];
  if (!A) return undefined;
  return s[4] === undefined ? A[s[3]] : (A[s[3]] || [])[+s[4]];
}
/** The value in force right now. */
export function liveValue(key){
  const s = key.split('.');
  if (s[0] === 'w') return getWorldTunable(s[1]);
  const H = HEROES[s[1]];
  if (!H) return undefined;
  if (s[2][0] !== 'a' || isNaN(+s[2].slice(1))) return H[s[2]];
  const A = H.abilities[+s[2].slice(1)];
  if (!A) return undefined;
  return s[4] === undefined ? A[s[3]] : (A[s[3]] || [])[+s[4]];
}

/* ------------------------------ writing ---------------------------- */
function write(key, v){
  const s = key.split('.');
  if (s[0] === 'w'){ setWorldTunable(s[1], v); return; }
  const H = HEROES[s[1]];
  if (!H) return;
  if (s[2][0] !== 'a' || isNaN(+s[2].slice(1))){ H[s[2]] = v; return; }
  const A = H.abilities[+s[2].slice(1)];
  if (!A) return;
  if (s[4] === undefined) A[s[3]] = v;
  else if (Array.isArray(A[s[3]])) A[s[3]][+s[4]] = v;
}

/** Set one value live. Passing the base value back clears the override. */
export function setTuning(key, v){
  v = +v;
  if (!isFinite(v)) return;
  const base = baseValue(key);
  write(key, v);
  if (Math.abs(v - base) < 1e-9) delete overrides[key];
  else overrides[key] = v;
  save();
}
export function resetKey(key){
  write(key, baseValue(key));
  delete overrides[key];
  save();
}
export function resetHero(id){
  for (const k of Object.keys(overrides)) if (k.startsWith('h.' + id + '.')) resetKey(k);
}
export function resetAll(){
  for (const k of Object.keys(overrides)) resetKey(k);
}
export const tunedCount = () => Object.keys(overrides).length;
export const isTuned = key => overrides[key] !== undefined;

/* Rewrite a whole rank array from a start value and a per-rank step.
   This is the "spell scaling" knob: 100 / +60 gives 100 · 160 · 220 · 280. */
export function setScaling(hero, i, field, start, step){
  const arr = HEROES[hero].abilities[i][field];
  if (!Array.isArray(arr)) return;
  for (let r = 0; r < arr.length; r++)
    setTuning(abKey(hero, i, field, r), round(start + step * r));
}
/** Multiply every rank of an array field by `m`. */
export function scaleArray(hero, i, field, m){
  const arr = HEROES[hero].abilities[i][field];
  if (!Array.isArray(arr)) return;
  const base = BASE[hero].abilities[i][field];
  for (let r = 0; r < arr.length; r++)
    setTuning(abKey(hero, i, field, r), round(base[r] * m));
}
const round = v => Math.round(v * 100) / 100;

/* --------------------------- persistence --------------------------- */
export function applyAll(){
  for (const k in overrides) write(k, overrides[k]);
}
/* Dragging a slider fires setTuning on every frame; the write itself can wait. */
let saveT = 0;
export function save(){
  if (saveT) return;
  saveT = setTimeout(() => { saveT = 0; saveNow(); }, 250);
}
export function saveNow(){
  try {
    if (tunedCount()) localStorage.setItem(KEY, JSON.stringify(overrides));
    else localStorage.removeItem(KEY);
  } catch (e) { /* private browsing — tuning just will not survive a reload */ }
}
export function load(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const o = JSON.parse(raw);
    for (const k in o) if (isFinite(+o[k]) && baseValue(k) !== undefined) overrides[k] = +o[k];
  } catch (e) { overrides = {}; }
  applyAll();
  return tunedCount();
}

/* ----------------------------- export ------------------------------ */
/** The override map, for sharing or for checking into the repo. */
export function exportJson(){
  return JSON.stringify({format:'lanebreaker-tuning-1', at:new Date().toISOString(),
                         values:overrides}, null, 2);
}
export function importJson(text){
  const o = JSON.parse(text);
  const vals = o && o.values ? o.values : o;
  resetAll();
  let n = 0;
  for (const k in vals) if (baseValue(k) !== undefined){ setTuning(k, vals[k]); n++; }
  return n;
}
/** Human-readable list of everything that differs from the shipped numbers. */
export function diffLines(){
  const out = [];
  for (const key of Object.keys(overrides).sort()){
    const s = key.split('.');
    let what;
    if (s[0] === 'w') what = s[1];
    else {
      const H = HEROES[s[1]];
      if (s[2][0] === 'a' && !isNaN(+s[2].slice(1))){
        const A = H.abilities[+s[2].slice(1)];
        what = H.name + ' ' + A.key + ' ' + A.name + ' · ' + s[3] +
               (s[4] === undefined ? '' : ' rank ' + (+s[4] + 1));
      } else what = H.name + ' · ' + s[2];
    }
    out.push({key, what, base:baseValue(key), now:overrides[key]});
  }
  return out;
}

/* Every hero id, for the picker. */
export const ALL_HEROES = HERO_IDS;
