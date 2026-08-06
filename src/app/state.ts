// @ts-nocheck
/** Client shell state (replaces monolith G). */
export const G = {
  /* randomLocked = this pick came out of the mystery box and is still hidden.
     randomMode = you chose Random as a preference — it survives the match, so
     coming back to the lobby rolls you a fresh hero instead of re-picking the
     one you happened to get last game. */
  pick:'vex', randomLocked:false, randomMode:false, mode:null, myTeam:0, mySlot:0, gameMode:'1v1', S:null, started:false, paused:false, view:null, latest:null,
  buf:[], netFx:[], acc:0, sendAcc:0, last:0, endShown:false,
  order:{type:'stop'}, pred:{x:0,y:0,init:false},
  cam:{x:0,y:0}, shake:0, parts:[], nums:[], rings:[], lines:[], toasts:[],
  mouse:{x:0,y:0,wx:0,wy:0}, aMode:false, shopOpen:false, helpOpen:false,
  hoverId:0, time:0, dpr:1, cw:0, ch:0, smart:true, drag:null,
  lobby:null, matchCount:0,
  /* pre-game warm-up room: null, or {slot, team} — the real lobby seat parked
     while the hideout sim runs the local player as slot 0 / team 0 */
  hideout:null,
  name:'', matchId:null, recorded:null, tour:null,
  /* dev sandbox — see src/dev/. Lives here so the render/step paths can read it
     without importing the sandbox itself. */
  dev:{
    open:false, timeScale:1, frozen:false, stepReq:0, freezeBots:false,
    rings:false, radii:false, acq:false, tuned:0
  }
};
export const SLOT_TEAM = sl => sl % 2;
