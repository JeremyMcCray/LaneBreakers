// @ts-nocheck
/**
 * Dev sandbox — live balance tuning and a testing ground.
 *
 * `bootDev()` restores whatever you were tuning last session and builds the
 * panel. Open it with F4 (or `lbDev()` from the console).
 *
 * Anything you change here writes straight into the live `HEROES` / world data,
 * so the sim, the HUD tooltips and the hero book all move together. Overrides
 * are a browser-local thing: the Node trainer under `ai/` reads `dist-sim`, so
 * it always sees the numbers actually committed to `src/data/`.
 */
export {
  BASE, overrides, HERO_STATS, AB_FIELDS, WORLD_TUNABLES, ALL_HEROES,
  heroKey, abKey, worldKey, baseValue, liveValue,
  setTuning, resetKey, resetHero, resetAll, tunedCount, isTuned,
  setScaling, scaleArray, applyAll, save, saveNow, load, exportJson, importJson, diffLines
} from './tuning';
export { buildDevPanel, toggleDevPanel, devPanelOpen, devPanelEl } from './panel';

import { G } from '../app/state';
import { addToast } from '../render/fx';
import { load, saveNow } from './tuning';
import { buildDevPanel, toggleDevPanel } from './panel';

export function bootDev(){
  const n = load();                       // re-apply last session's overrides
  G.dev.tuned = n;
  buildDevPanel();
  if (n) addToast(n + ' balance override' + (n === 1 ? '' : 's') + ' active — F4 to review');
  addEventListener('pagehide', saveNow);  // flush the debounced write before a reload
  window.lbDev = toggleDevPanel;
}
