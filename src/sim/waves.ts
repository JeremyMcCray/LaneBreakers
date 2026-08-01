// @ts-nocheck
import {
  BASE_X, CREEP_TICK, LANE_Y, TICK, rnd
} from '../data/world';
import { spawnJungleWave } from './camp';
import { fx, mkEnt } from './create';

export function spawnWave(S){
  S.waveNum++;
  const scale = 1 + S.waveNum*0.045;   // waves out-scale the tower late, so games always resolve
  const n = S.big ? 6 : 4;             // a 2v2 lane needs a bigger wave to feel like a lane
  const OFF = S.big ? [-150, -90, -30, 40, 100, 160] : [-72, 0, 72, -36];
  const RNG = S.big ? [3,5] : [3];
  for (let tm=0; tm<2; tm++){
    for (let i=0;i<n;i++){
      const ranged = RNG.indexOf(i)>=0;
      const off = OFF[i];
      mkEnt(S,{
        type:'creep', kind: ranged?'ranged':'melee', team:tm,
        x: BASE_X[tm] + (tm? 60:-60) * -1 + (i*-14)*(tm?-1:1),
        y: LANE_Y + off, r: ranged?15:18,
        hp: (ranged?330:560)*0.75*scale, maxHp:(ranged?330:560)*0.75*scale,
        dmg: (ranged?27:22)*scale, armor: ranged?0:2,
        range: ranged?480:95, bat: ranged?1.2:0.95, atkCd: rnd(0,.5),
        ms: 250, ranged:ranged, laneOff: off, tid:0
      });
    }
    spawnJungleWave(S, tm);          // cash in any banked jungle charges
  }
  fx(S,{t:'wave'});
}

/* Dota creep targeting, in priority order:
     0  the enemy hero who just attacked one of our heroes (the "pull")
     1  enemy creeps
     2  enemy heroes standing close by
     3  enemy buildings
   Creeps only re-evaluate every CREEP_TICK, which is what makes aggro pulling work. */
