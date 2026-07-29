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

export const CREEP_ACQ  = 520;        // creep target acquisition range
export const AUTO_ACQ   = 660;        // how far an auto-attacking hero looks for its next target
export const CLEAVE_R   = 185;        // splash radius of a cleaving swing
export const CLEAVE_ARC = 0.85;       // half-angle of the cleave cone, in radians
export const CREEP_TICK = 0.5;        // creeps re-evaluate their target twice a second
export const PULL_TIME  = 3.0;        // how long attacking a hero drags creep aggro
export const WAVE_INTERVAL = 25;      // seconds between creep waves
export const FIRST_WAVE = 6;
export const XP_RADIUS = 900;
export const KILLS_TO_WIN = 2;      // 1v1 — two deaths and you lose; 2v2 uses KILLS_TO_WIN_2V2
export const KILLS_TO_WIN_2V2 = 4;
export const MATCH_LIMIT = 900;       // 15 min hard cap — decided on kills, then net worth
export const SUDDEN_DEATH = 120;      // warning window before the cap
export const MAX_LEVEL = 12;
export const BUY_DELAY = 5;           // courier delivery seconds
export const SELL_FULL = 10;          // seconds an item can be sold back at full price
export const START_GOLD = 420;
export const GOLD_PER_SEC = 2.2;

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

