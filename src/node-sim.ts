// @ts-nocheck
/**
 * Node trainer entry — sim + bot + constants only (no DOM).
 * Bundled to dist-sim/game.cjs for ../Lanebreakers/ai/engine.js.
 */
export {
  newSim, simStep, applyCmd, buildSnapshot,
  canCast, netWorth, damage, ent, castAbility, buyItem,
  sellItem, buyPlan, useItem, sellValue, moveItem,
  disjoint, towerShielded, illuScale, cleaveHit, enraged, sliceAndDice
} from './sim/engine';
export { botThink } from './ai/bot';
export { HEROES, HERO_IDS } from './data/heroes';
export { ITEMS } from './data/items';
export {
  LANE_Y, WORLD_W, MAX_LEVEL, XP_TABLE, TOWER_X, BASE_X,
  armorMult, laneHalf, setLaneMode, heal
} from './data/world';
