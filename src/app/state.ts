// @ts-nocheck
/** Client shell state (replaces monolith G). */
export const G = {
  pick:'vex', mode:null, myTeam:0, mySlot:0, gameMode:'1v1', S:null, started:false, view:null, latest:null,
  buf:[], netFx:[], acc:0, sendAcc:0, last:0, endShown:false,
  order:{type:'stop'}, pred:{x:0,y:0,init:false},
  cam:{x:0,y:0}, shake:0, parts:[], nums:[], rings:[], lines:[], toasts:[],
  mouse:{x:0,y:0,wx:0,wy:0}, aMode:false, shopOpen:false, helpOpen:true,
  hoverId:0, time:0, dpr:1, cw:0, ch:0, smart:true, drag:null,
  lobby:null,
  name:'', matchId:null, recorded:null, tour:null
};
export const SLOT_TEAM = sl => sl % 2;
