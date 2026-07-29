// @ts-nocheck
import { Store, NAME_KEY, exportHistory, importHistory, clearHistory } from './persistence';
import { G } from './state';
import { startPractice } from './shell';
import {
  returnToLobby, lobbyReady, quickHost, quickJoin, hostInit, hostAccept,
  joinGenerate, copyCode, startTournament, lobbySwitchTeam, lobbySetMode,
  tourClick, tourStartGame
} from './online';
import {
  lbSetAiTier, lbAiDesc, lbBuildAiSelect
} from '../ai/neural/runtime';
import {
  lbTrainToggle, lbTrainReset, lbTrainSetRecipe, lbTrainSave,
  lbTrainExport, lbTrainImport, lbTrainPlay, lbTrainDelete
} from '../ai/neural/train';
import { resize } from '../render/view';
import {
  toggleShop, buildShopUI, showScreen, toggleHelpMenu, buildHeroMenu, copyBox, showEnd,
  renderHeroBook, renderItemBook, dbg, randomHero
} from '../ui/panels';

// Side-effect: register DOM input listeners from panels.ts
import '../ui/panels';

export function bindGlobals() {
  Object.assign(window, {
    startPractice, showScreen, toggleShop, toggleHelpMenu, dbg, randomHero,
    returnToLobby, lobbyReady, quickHost, quickJoin, hostInit, hostAccept,
    joinGenerate, copyBox, copyCode, lbSetAiTier, startTournament,
    lobbySwitchTeam, lobbySetMode, tourClick, tourStartGame,
    exportHistory, importHistory, clearHistory, showEnd,
    renderHeroBook, renderItemBook,
    lbTrainToggle, lbTrainReset, lbTrainSetRecipe, lbTrainSave,
    lbTrainExport, lbTrainImport, lbTrainPlay, lbTrainDelete,
  });
}

export function bootClient() {
  bindGlobals();
  resize();
  G.aiTier = Store.get('lb.aiTier', 'classic');
  buildHeroMenu();
  buildShopUI();
  lbAiDesc();
  lbBuildAiSelect();
  const el = document.getElementById('playerName');
  if (el) {
    G.name = Store.get(NAME_KEY, '') || '';
    el.value = G.name;
    el.oninput = () => {
      G.name = el.value.trim().slice(0, 18);
      Store.set(NAME_KEY, G.name);
    };
  }
  // Match original: controls blurb shown by default; Controls button toggles it off/on
  toggleHelpMenu();
}
