// @ts-nocheck
/** UI barrel — shop, input, menus, books, end card. */
export {
  SHOP_HINT, shopInfo, buildShopUI, refreshShop, toggleShop
} from './shop';
export {
  entUnder, attackable, pickTarget, issue, dbg
} from './input';
export { slotUnder } from './hitTest';
export { showEnd } from './endCard';
export { abilityCard, heroSheet, renderItemBook, renderHeroBook } from './books';
export { showScreen, copyBox, toggleHelpMenu, buildHeroMenu, randomHero, markRandomButton } from './menus';

// Side-effect: register canvas/keyboard listeners
import './input';
