// @ts-nocheck
/* World constants & lane geometry */

/* ---------------------------- constants ---------------------------- */
export const WORLD_W = 3400, WORLD_H = 900;
export const LANE_Y = 450;
export let LANE_HALF = 175;            // half-height of the lane — 2v2 plays on a wider one
export let LANE_FLARE = 300;           // how far it opens out at the fountains
export function setLaneMode(m){
  LANE_HALF  = m==='2v2' ? 258 : 175;
  LANE_FLARE = m==='2v2' ? 380 : 300;
  /* decor invalidated by render when lane mode changes */
}
export const BASE_X = [180, WORLD_W - 180];          // fountains
export const TOWER_X = [760, WORLD_W - 760];         // towers
export const TICK = 1 / 60;
export const SNAP_HZ = 20;
export const INTERP_MS = 90;

/* The block below is `let` rather than `const` purely so the dev sandbox
   (src/dev/) can retune it live — see setWorldTunable at the bottom of this file.
   Nothing in the game writes these; treat them as constants when reading. */
export let CREEP_ACQ  = 520;          // creep target acquisition range
export let AUTO_ACQ   = 660;          // how far an auto-attacking hero looks for its next target
export let CLEAVE_R   = 185;          // splash radius of a cleaving swing
export let CLEAVE_ARC = 0.85;         // half-angle of the cleave cone, in radians
export let CREEP_TICK = 0.5;          // creeps re-evaluate their target twice a second
export let PULL_TIME  = 3.0;          // how long attacking a hero drags creep aggro
export let WAVE_INTERVAL = 25;        // seconds between creep waves
export let FIRST_WAVE = 6;
export let XP_RADIUS = 900;
export let KILLS_TO_WIN = 2;        // 1v1 — two deaths and you lose; 2v2 uses KILLS_TO_WIN_2V2
export let KILLS_TO_WIN_2V2 = 4;
export let MATCH_LIMIT = 900;         // 15 min hard cap — decided on kills, then net worth
export let SUDDEN_DEATH = 120;        // warning window before the cap
export let MAX_LEVEL = 12;
export let BUY_DELAY = 5;             // courier delivery seconds
export let SELL_FULL = 10;            // seconds an item can be sold back at full price
export let START_GOLD = 420;
export let GOLD_PER_SEC = 2.2;

export const XP_TABLE = [0,0,180,420,700,1040,1450,1930,2490,3120,3830,4630,5520];
export const ULT_REQ  = [6,9,12];

export const TEAM_COL = ['#4aa8ff', '#ff5f5f'];
export const TEAM_COL_DK = ['#1c4c7d', '#7d2626'];

/* ------------------------------ math ------------------------------- */
export const clamp = (v,a,b)=> v<a?a:(v>b?b:v);
export const lerp  = (a,b,t)=> a+(b-a)*t;
export const dist  = (a,b,c,d)=> Math.hypot(a-c,b-d);
export const dist2 = (a,b,c,d)=>{const x=a-c,y=b-d;return x*x+y*y;};
export const rnd   = (a,b)=> a+Math.random()*(b-a);
export const now   = ()=> performance.now();

/* lane half-height at a given x (wider inside the bases) */
export function laneHalf(x){
  const edge = 470;
  if (x < edge)          return lerp(LANE_FLARE, LANE_HALF, x/edge);
  if (x > WORLD_W-edge)  return lerp(LANE_FLARE, LANE_HALF, (WORLD_W-x)/edge);
  return LANE_HALF;
}
export function walkable(x,y){
  if (x < 46 || x > WORLD_W-46) return false;
  return Math.abs(y - LANE_Y) < laneHalf(x) - 10;
}
export function clampToLane(e){
  e.x = clamp(e.x, 46, WORLD_W-46);
  const h = laneHalf(e.x) - 10;
  e.y = clamp(e.y, LANE_Y-h, LANE_Y+h);
}
/* armor after any shred effects — everything that computes damage goes through this */
export function effArmor(e){ return (e.armor||0) - (e.shredT>0 ? (e.shredV||0) : 0); }
/* healing funnelled through one place so heal-cut items can bite */
export function heal(S, e, amt){
  if (!e || e.dead || amt<=0) return 0;
  if (e.hcT>0) amt *= (1 - e.hcP);
  const before = e.hp;
  e.hp = Math.min(e.maxHp, e.hp + amt);
  const done = e.hp - before;
  if (done>0 && e.type==='hero' && S.players){
    for (const q of S.players) if (q.hero===e){ q.healed += done; break; }
  }
  return done;
}
export function armorMult(a){
  const k = 0.055*a;
  return a>=0 ? 1 - k/(1+k) : 2 - Math.pow(0.94, -a);
}

/* ------------------------ live-tunable constants -------------------- */
/* Read/write hooks for the dev sandbox. `live:false` means the value is only
   consulted when a match is created, so a change lands on the NEXT match. */
export const WORLD_TUNABLES = [
  {k:'GOLD_PER_SEC',    label:'Passive gold / sec',   min:0,   max:20,   step:.1,  live:true},
  {k:'START_GOLD',      label:'Starting gold',        min:0,   max:6000, step:10,  live:false},
  {k:'WAVE_INTERVAL',   label:'Seconds between waves',min:3,   max:90,   step:1,   live:true},
  {k:'FIRST_WAVE',      label:'First wave at',        min:0,   max:60,   step:1,   live:false},
  {k:'XP_RADIUS',       label:'XP share radius',      min:100, max:3400, step:25,  live:true},
  {k:'MAX_LEVEL',       label:'Max hero level',       min:1,   max:12,   step:1,   live:true},
  {k:'KILLS_TO_WIN',    label:'Kills to win (1v1)',   min:1,   max:30,   step:1,   live:false},
  {k:'KILLS_TO_WIN_2V2',label:'Kills to win (2v2)',   min:1,   max:30,   step:1,   live:false},
  {k:'MATCH_LIMIT',     label:'Match time cap (s)',   min:60,  max:3600, step:30,  live:true},
  {k:'SUDDEN_DEATH',    label:'Sudden-death window',  min:0,   max:600,  step:10,  live:true},
  {k:'CREEP_ACQ',       label:'Creep acquire range',  min:50,  max:1600, step:10,  live:true},
  {k:'CREEP_TICK',      label:'Creep retarget (s)',   min:.05, max:3,    step:.05, live:true},
  {k:'PULL_TIME',       label:'Creep aggro pull (s)', min:0,   max:12,   step:.25, live:true},
  {k:'AUTO_ACQ',        label:'Hero auto-acquire',    min:100, max:2000, step:10,  live:true},
  {k:'CLEAVE_R',        label:'Cleave radius',        min:20,  max:700,  step:5,   live:true},
  {k:'CLEAVE_ARC',      label:'Cleave half-angle',    min:.1,  max:3.14, step:.05, live:true},
  {k:'BUY_DELAY',       label:'Courier delay (s)',    min:0,   max:30,   step:.5,  live:true},
  {k:'SELL_FULL',       label:'Full-refund window',   min:0,   max:120,  step:1,   live:true}
];
const WORLD_READ = {
  CREEP_ACQ:()=>CREEP_ACQ, AUTO_ACQ:()=>AUTO_ACQ, CLEAVE_R:()=>CLEAVE_R, CLEAVE_ARC:()=>CLEAVE_ARC,
  CREEP_TICK:()=>CREEP_TICK, PULL_TIME:()=>PULL_TIME, WAVE_INTERVAL:()=>WAVE_INTERVAL,
  FIRST_WAVE:()=>FIRST_WAVE, XP_RADIUS:()=>XP_RADIUS, KILLS_TO_WIN:()=>KILLS_TO_WIN,
  KILLS_TO_WIN_2V2:()=>KILLS_TO_WIN_2V2, MATCH_LIMIT:()=>MATCH_LIMIT, SUDDEN_DEATH:()=>SUDDEN_DEATH,
  MAX_LEVEL:()=>MAX_LEVEL, BUY_DELAY:()=>BUY_DELAY, SELL_FULL:()=>SELL_FULL,
  START_GOLD:()=>START_GOLD, GOLD_PER_SEC:()=>GOLD_PER_SEC
};
const WORLD_WRITE = {
  CREEP_ACQ:v=>CREEP_ACQ=v, AUTO_ACQ:v=>AUTO_ACQ=v, CLEAVE_R:v=>CLEAVE_R=v, CLEAVE_ARC:v=>CLEAVE_ARC=v,
  CREEP_TICK:v=>CREEP_TICK=v, PULL_TIME:v=>PULL_TIME=v, WAVE_INTERVAL:v=>WAVE_INTERVAL=v,
  FIRST_WAVE:v=>FIRST_WAVE=v, XP_RADIUS:v=>XP_RADIUS=v, KILLS_TO_WIN:v=>KILLS_TO_WIN=v,
  KILLS_TO_WIN_2V2:v=>KILLS_TO_WIN_2V2=v, MATCH_LIMIT:v=>MATCH_LIMIT=v, SUDDEN_DEATH:v=>SUDDEN_DEATH=v,
  // MAX_LEVEL indexes XP_TABLE — never let it point past the end
  MAX_LEVEL:v=>MAX_LEVEL=clamp(Math.round(v), 1, XP_TABLE.length-1),
  BUY_DELAY:v=>BUY_DELAY=v, SELL_FULL:v=>SELL_FULL=v,
  START_GOLD:v=>START_GOLD=v, GOLD_PER_SEC:v=>GOLD_PER_SEC=v
};
export function getWorldTunable(k){ const f = WORLD_READ[k]; return f ? f() : undefined; }
export function setWorldTunable(k, v){
  const f = WORLD_WRITE[k];
  if (f && isFinite(v)) f(+v);
  return getWorldTunable(k);
}

