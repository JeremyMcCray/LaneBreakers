// @ts-nocheck
/* The pre-game Hideout — while an online lobby fills, each player warms up in
   a local practice room (sim mode 'hideout') instead of staring at a roster:
   dummies, patrolling dummies, both jungle camps and a practice tower. A
   floating panel keeps the room code, roster and Ready button on screen; the
   moment the real match starts the hideout tears itself down.

   The hideout sim always runs the local player as slot 0 / team 0 — the real
   lobby seat is parked in G.hideout and restored on exit. Anything lobby-
   related must resolve the seat through myLobbySlot() (lobbyUi), never
   G.mySlot, while the hideout is up. */
import { G } from './state';
import { beginMatch } from './shell';
import { renderLobby } from './lobbyUi';
import { addToast } from '../render/fx';
import { showScreen, toggleShop } from '../ui/panels';

export function enterHideout(){
  if (G.hideout || G.started) return;
  // park the seat only AFTER beginMatch — its own hideout guard would
  // immediately tear us down again if G.hideout were already set
  const seat = {slot:G.mySlot, team:G.myTeam};
  beginMatch('local', [{h:G.pick, tm:0, nm:G.name||'You'}], 0, 'hideout');
  G.hideout = seat;
  const pn = document.getElementById('hideoutPanel');
  if (pn) pn.classList.remove('hide');
  renderLobby();
  addToast('Welcome to the Hideout — warm up, the match starts when everyone is ready');
}

/* toMatch: true when a real match is about to begin — beginMatch redoes the
   UI itself, so only the sim and the seat need putting back. */
export function exitHideout(toMatch){
  if (!G.hideout) return;
  const seat = G.hideout;
  G.hideout = null;
  G.mySlot = seat.slot; G.myTeam = seat.team;
  const pn = document.getElementById('hideoutPanel');
  if (pn) pn.classList.add('hide');
  G.started=false; G.mode=null; G.S=null; G.view=null; G.latest=null; G.buf=[];
  G.order={type:'stop'}; G.pred.init=false; G.aMode=false;
  G.parts=[]; G.nums=[]; G.rings=[]; G.lines=[];
  if (toMatch) return;
  toggleShop(false);
  document.getElementById('help').classList.add('hide');
  document.getElementById('debug').classList.add('hide');
  document.getElementById('overlay').classList.remove('hide');
  showScreen('scrHero');
  document.getElementById('rowLocal').classList.add('hide');
  document.getElementById('rowLobby').classList.remove('hide');
  renderLobby();
}
