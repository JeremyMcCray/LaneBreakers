// @ts-nocheck
/* World constants & lane geometry */

/* ---------------------------- constants ---------------------------- */
export const WORLD_W = 3400, WORLD_H = 900;
export const LANE_Y = 450;
export let LANE_HALF = 175;            // half-height of the lane — team modes play on wider ones
export let LANE_FLARE = 300;           // how far it opens out at the fountains
export function setLaneMode(m){
  LANE_HALF  = m==='3v3' ? 310 : m==='2v2' ? 258 : 175;
  LANE_FLARE = m==='3v3' ? 430 : m==='2v2' ? 380 : 300;
  /* decor invalidated by render when lane mode changes */
}
export const BASE_X = [180, WORLD_W - 180];          // fountains
export const TOWER_X = [760, WORLD_W - 760];         // towers

/* ---------------------------- jungle camps -------------------------- */
/* Two walkable pockets bulge off the lane at mid-map — north (side 0) and
   south (side 1). A camp side is only "open" (walkable + drawn + spawning)
   when the sim turns it on: one random side in 1v1, both in 2v2. */
export const CAMP_X = WORLD_W / 2;
export const CAMP_R = 150;                            // pocket radius
export let CAMP_OPEN = [false, false];
export function setCampsOpen(sides){
  CAMP_OPEN = [false, false];
  if (sides) for (const s of sides) if (s===0 || s===1) CAMP_OPEN[s] = true;
}
/* pocket centre for a side — hugs the lane edge, but never leaves the world */
export function campY(s){
  return s===0 ? Math.max(CAMP_R + 6, LANE_Y - LANE_HALF - CAMP_R*0.55)
               : Math.min(WORLD_H - CAMP_R - 6, LANE_Y + LANE_HALF + CAMP_R*0.55);
}
/* is this point close enough to an open camp to bother with its neutrals? */
export function nearCamp(x, y, pad){
  for (let s=0; s<2; s++){
    if (!CAMP_OPEN[s]) continue;
    if (Math.hypot(x-CAMP_X, y-campY(s)) < CAMP_R + (pad||0)) return true;
  }
  return false;
}
/* ------------------------------ hideout ----------------------------- */
/* The pre-game warm-up room (sim mode 'hideout') — players hang out here
   while an online lobby fills. The sim fixtures (sim/hideout.ts) and the
   cozy render dressing (render/worldDraw.ts drawHideout) both anchor to
   these coordinates, so keep them in one place. */
export const HIDEOUT = {
  FIRE:   {x:470,  y:LANE_Y+168},                     // campfire nook by the fountain
  SIGN:   {x:578,  y:LANE_Y+88},                      // wooden 'THE HIDEOUT' sign
  DUMMIES:[{x:640, y:LANE_Y-118},{x:764, y:LANE_Y-144},{x:886, y:LANE_Y-112}],
  MOVERS: [{y:LANE_Y+82,  x1:600, x2:1080, ms:170},   // patrolling dummies — skillshot practice
           {y:LANE_Y+148, x1:650, x2:1190, ms:255}],
  TOWER:  {x:2520, y:LANE_Y+92},                      // practice tower, moved farther from the camp cluster
  LIGHTS: {x1:360, x2:1010, y:LANE_Y-198}             // lantern string over the dummy range
};

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
export let KILLS_TO_WIN = 2;        // 1v1 — two deaths and you lose; team modes use their own caps
export let KILLS_TO_WIN_2V2 = 4;
export let KILLS_TO_WIN_3V3 = 6;
export let MATCH_LIMIT = 900;         // 15 min hard cap — decided on kills, then net worth
export let SUDDEN_DEATH = 120;        // warning window before the cap
export let MAX_LEVEL = 15;    // 15 skill points = every ability at full rank (4+4+4+3)
export let BUY_DELAY = 5;             // courier delivery seconds
export let SELL_FULL = 10;            // seconds an item can be sold back at full price
export let START_GOLD = 420;
export let GOLD_PER_SEC = 2.2;
export let CAMP_FIRST = 120;          // first jungle camp spawn (s)
export let CAMP_RESPAWN = 90;         // respawn check cadence — only refills an EMPTY camp

export const XP_TABLE = [0,0,180,400,650,940,1280,1680,2150,2700,3340,4080,4930,5900,7000,8250];
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
/* Is this point on legal ground? `pad` widens every boundary by that many
   pixels — callers that test something which only sits near a unit (a
   projectile, drawn lifted off its owner) pass a pad so standing flush
   against a wall does not put it out of bounds. */
export function walkable(x,y,pad){
  const p = pad || 0;
  if (x < 46-p || x > WORLD_W-46+p) return false;
  if (Math.abs(y - LANE_Y) < laneHalf(x) - 10 + p) return true;
  const s = y < LANE_Y ? 0 : 1;
  return CAMP_OPEN[s] && dist(x, y, CAMP_X, campY(s)) < CAMP_R - 10 + p;
}
export function clampToLane(e){
  e.x = clamp(e.x, 46, WORLD_W-46);
  const h = laneHalf(e.x) - 10;
  if (Math.abs(e.y - LANE_Y) <= h) return;
  // off the lane — an open camp pocket is also legal ground
  const s = e.y < LANE_Y ? 0 : 1;
  if (CAMP_OPEN[s]){
    const cy = campY(s), R = CAMP_R - 10;
    const d = dist(e.x, e.y, CAMP_X, cy);
    if (d <= R) return;
    // outside everything: snap to whichever valid edge is closer — the pocket
    // rim or the lane edge (the pocket overlaps the lane, so there is no gap)
    const rimx = CAMP_X + (e.x-CAMP_X)/(d||1)*R, rimy = cy + (e.y-cy)/(d||1)*R;
    const laneEdge = s===0 ? LANE_Y-h : LANE_Y+h;
    if (dist(e.x, e.y, rimx, rimy) < Math.abs(e.y - laneEdge)){
      e.x = rimx; e.y = rimy; return;
    }
  }
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
  {k:'MAX_LEVEL',       label:'Max hero level',       min:1,   max:15,   step:1,   live:true},
  {k:'KILLS_TO_WIN',    label:'Kills to win (1v1)',   min:1,   max:30,   step:1,   live:false},
  {k:'KILLS_TO_WIN_2V2',label:'Kills to win (2v2)',   min:1,   max:30,   step:1,   live:false},
  {k:'KILLS_TO_WIN_3V3',label:'Kills to win (3v3)',   min:1,   max:30,   step:1,   live:false},
  {k:'MATCH_LIMIT',     label:'Match time cap (s)',   min:60,  max:3600, step:30,  live:true},
  {k:'SUDDEN_DEATH',    label:'Sudden-death window',  min:0,   max:600,  step:10,  live:true},
  {k:'CREEP_ACQ',       label:'Creep acquire range',  min:50,  max:1600, step:10,  live:true},
  {k:'CREEP_TICK',      label:'Creep retarget (s)',   min:.05, max:3,    step:.05, live:true},
  {k:'PULL_TIME',       label:'Creep aggro pull (s)', min:0,   max:12,   step:.25, live:true},
  {k:'AUTO_ACQ',        label:'Hero auto-acquire',    min:100, max:2000, step:10,  live:true},
  {k:'CLEAVE_R',        label:'Cleave radius',        min:20,  max:700,  step:5,   live:true},
  {k:'CLEAVE_ARC',      label:'Cleave half-angle',    min:.1,  max:3.14, step:.05, live:true},
  {k:'BUY_DELAY',       label:'Courier delay (s)',    min:0,   max:30,   step:.5,  live:true},
  {k:'SELL_FULL',       label:'Full-refund window',   min:0,   max:120,  step:1,   live:true},
  {k:'CAMP_FIRST',      label:'First jungle camp (s)',min:5,   max:600,  step:5,   live:false},
  {k:'CAMP_RESPAWN',    label:'Camp respawn (s)',     min:10,  max:600,  step:5,   live:true}
];
const WORLD_READ = {
  CREEP_ACQ:()=>CREEP_ACQ, AUTO_ACQ:()=>AUTO_ACQ, CLEAVE_R:()=>CLEAVE_R, CLEAVE_ARC:()=>CLEAVE_ARC,
  CREEP_TICK:()=>CREEP_TICK, PULL_TIME:()=>PULL_TIME, WAVE_INTERVAL:()=>WAVE_INTERVAL,
  FIRST_WAVE:()=>FIRST_WAVE, XP_RADIUS:()=>XP_RADIUS, KILLS_TO_WIN:()=>KILLS_TO_WIN,
  KILLS_TO_WIN_2V2:()=>KILLS_TO_WIN_2V2, KILLS_TO_WIN_3V3:()=>KILLS_TO_WIN_3V3,
  MATCH_LIMIT:()=>MATCH_LIMIT, SUDDEN_DEATH:()=>SUDDEN_DEATH,
  MAX_LEVEL:()=>MAX_LEVEL, BUY_DELAY:()=>BUY_DELAY, SELL_FULL:()=>SELL_FULL,
  START_GOLD:()=>START_GOLD, GOLD_PER_SEC:()=>GOLD_PER_SEC,
  CAMP_FIRST:()=>CAMP_FIRST, CAMP_RESPAWN:()=>CAMP_RESPAWN
};
const WORLD_WRITE = {
  CREEP_ACQ:v=>CREEP_ACQ=v, AUTO_ACQ:v=>AUTO_ACQ=v, CLEAVE_R:v=>CLEAVE_R=v, CLEAVE_ARC:v=>CLEAVE_ARC=v,
  CREEP_TICK:v=>CREEP_TICK=v, PULL_TIME:v=>PULL_TIME=v, WAVE_INTERVAL:v=>WAVE_INTERVAL=v,
  FIRST_WAVE:v=>FIRST_WAVE=v, XP_RADIUS:v=>XP_RADIUS=v, KILLS_TO_WIN:v=>KILLS_TO_WIN=v,
  KILLS_TO_WIN_2V2:v=>KILLS_TO_WIN_2V2=v, KILLS_TO_WIN_3V3:v=>KILLS_TO_WIN_3V3=v,
  MATCH_LIMIT:v=>MATCH_LIMIT=v, SUDDEN_DEATH:v=>SUDDEN_DEATH=v,
  // MAX_LEVEL indexes XP_TABLE — never let it point past the end
  MAX_LEVEL:v=>MAX_LEVEL=clamp(Math.round(v), 1, XP_TABLE.length-1),
  BUY_DELAY:v=>BUY_DELAY=v, SELL_FULL:v=>SELL_FULL=v,
  START_GOLD:v=>START_GOLD=v, GOLD_PER_SEC:v=>GOLD_PER_SEC=v,
  CAMP_FIRST:v=>CAMP_FIRST=v, CAMP_RESPAWN:v=>CAMP_RESPAWN=v
};
export function getWorldTunable(k){ const f = WORLD_READ[k]; return f ? f() : undefined; }
export function setWorldTunable(k, v){
  const f = WORLD_WRITE[k];
  if (f && isFinite(v)) f(+v);
  return getWorldTunable(k);
}

