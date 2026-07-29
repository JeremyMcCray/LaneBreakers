// @ts-nocheck
/**
 * Sim-focused headless API for Node trainers (Phase 5 bridge).
 * Avoids importing DOM/UI modules so vite-node can load this cleanly.
 * Full monolith export list (net/lobby/UI) remains available in the browser bundle.
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
export { Store, recordMatch, statsFor, history, saveHistory } from './app/persistence';
export {
  tourNew, tourPicksPerTeam, tourDraftTeam, tourDraftDone, tourTaken, tourDraft,
  tourNeedPick, tourBench, tourField, tourResult, tourPicks
} from './app/tournament';
