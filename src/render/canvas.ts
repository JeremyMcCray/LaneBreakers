// @ts-nocheck
import { G } from '../app/state';
import { WORLD_W, LANE_Y, laneHalf } from '../data/world';

export const cv = document.getElementById('cv');
export const ctx = cv.getContext('2d');
export let DECOR = null;
export function makeDecor(){
  let s = 1337;
  const rr = ()=> (s = (s*1664525+1013904223)>>>0) / 4294967296;
  const d = [];
  for (let x=60; x<WORLD_W-60; x+=52){
    const h = laneHalf(x);
    for (const sgn of [-1,1]){
      const base = LANE_Y + sgn*h;
      for (let k=0;k<3;k++){
        d.push({x:x+rr()*40-20, y:base + sgn*(14+k*46+rr()*22), r:9+rr()*17, t: rr()<.35?1:0, sh:rr()});
      }
    }
  }
  return d;
}
export function resize(){
  G.dpr = Math.min(2, window.devicePixelRatio||1);
  G.cw = cv.width = Math.floor(innerWidth*G.dpr);
  G.ch = cv.height = Math.floor(innerHeight*G.dpr);
  cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
}
addEventListener('resize', resize); resize();

export function camScale(){ return Math.min(G.cw/1520, G.ch/860); }
export function w2s(x,y){
  const s = camScale();
  return [ (x-G.cam.x)*s + G.cw/2, (y-G.cam.y)*s + G.ch/2 ];
}
export function s2w(px,py){
  const s = camScale();
  return [ (px*G.dpr - G.cw/2)/s + G.cam.x, (py*G.dpr - G.ch/2)/s + G.cam.y ];
}
export function ownHeroView(v){
  for (const e of v.e) if (e.ty===0 && e.sl===G.mySlot) return e;
  return null;
}
export function allyViews(v){    // living teammates, excluding me
  return v.e.filter(e=>e.ty===0 && e.tm===G.myTeam && e.sl!==G.mySlot);
}
export function ensureDecor(){
  if (!DECOR) DECOR = makeDecor();
  return DECOR;
}

