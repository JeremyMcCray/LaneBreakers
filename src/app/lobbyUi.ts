// @ts-nocheck
/* Lobby roster + tournament draft UI (parity port). */
import { HEROES, HERO_IDS } from '../data/heroes';
import { TEAM_COL } from '../data/world';
import { G, SLOT_TEAM } from './state';
import { beginMatch, teamOfSlot } from './shell';
import { addToast } from '../render/fx';
import { showScreen } from '../ui/menus';
import { toggleShop } from '../ui/shop';
import { heroSheet } from '../ui/books';
import {
  Net, netSendCmd, netSendTo, netBroadcast
} from './netplay';
import {
  tourNew, tourDraft, tourField, tourPicks, tourResult,
  tourDraftTeam, tourTaken, tourBench, tourNeedPick, tourPicksPerTeam
} from './tournament';

export function lobbyCap(){ return (G.lobby && G.lobby.mode==='2v2') ? 4 : 2; }
export function newLobby(mode){
  return {mode:mode||'1v1', slots:[{slot:0, team:0, hero:G.pick, name:G.name, ready:false, here:true}]};
}
export function lobbySeat(sl){
  if (!G.lobby) return null;
  return G.lobby.slots.find(x=>x.slot===sl) || null;
}
export function lobbyFreeSlot(){
  for (let i=1;i<lobbyCap();i++) if (!lobbySeat(i)) return i;
  return -1;
}
/* how many seats each side holds, and whether that is a legal line-up */
export function lobbyTeamCount(t){
  return G.lobby ? G.lobby.slots.filter(x=>(x.team!==undefined?x.team:SLOT_TEAM(x.slot))===t).length : 0;
}
export function lobbyBalanced(){
  const need = lobbyCap()/2;
  return lobbyTeamCount(0)===need && lobbyTeamCount(1)===need;
}
export function lobbySwitchTeam(){
  if (!Net.open || !G.lobby) return;
  const seat = lobbySeat(G.mySlot);
  if (!seat) return;
  seat.team = 1 - (seat.team!==undefined ? seat.team : SLOT_TEAM(seat.slot));
  seat.ready = false;
  if (Net.mode==='host'){ broadcastLobby(); renderLobby(); }
  else netSendCmd({k:'team', t:seat.team});
  renderLobby();
}
export function lobbyReadyCount(){
  return G.lobby ? G.lobby.slots.filter(x=>x.ready).length : 0;
}
export function lobbyFull(){ return G.lobby && G.lobby.slots.length === lobbyCap(); }
export function broadcastTour(){
  if (Net.mode!=='host' || !G.tour) return;
  netBroadcast({k:'tour', T:G.tour});
}
export function myTourTeam(){ return teamOfSlot(G.mySlot); }
/* start a tournament from the lobby (host only) */
export function startTournament(){
  if (Net.mode!=='host' || !G.lobby) return;
  if (!lobbyFull()){ addToast('Every seat has to be filled first'); return; }
  const lives = parseInt(document.getElementById('tourLives').value, 10) || 3;
  G.tour = tourNew(G.lobby.mode, lives);
  broadcastTour();
  showScreen('scrDraft'); renderTour();
}
export function tourClick(hero){
  if (!G.tour) return;
  const team = myTourTeam();
  if (G.tour.phase==='draft'){
    if (tourDraftTeam(G.tour)!==team) return;
    if (Net.mode==='host'){ if (tourDraft(G.tour, team, hero)){ broadcastTour(); renderTour(); } }
    else netSendCmd({k:'tpick', h:hero});
  } else if (G.tour.phase==='pick'){
    if (!tourNeedPick(G.tour, team)) return;
    if (Net.mode==='host'){ if (tourField(G.tour, team, hero)){ broadcastTour(); renderTour(); } }
    else netSendCmd({k:'tpick', h:hero});
  }
}
/* host: kick off the next game of the series */
export function tourStartGame(){
  if (Net.mode!=='host' || !G.tour || G.tour.phase!=='ready') return;
  const nameFor = sl => { const seat = lobbySeat(sl); return (seat && seat.name) || ('Player '+(sl+1)); };
  const picks = tourPicks(G.tour, nameFor, teamOfSlot);
  const mode = G.tour.mode;
  const mid = 'm'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e6).toString(36);
  G.matchId = mid;
  G.tour.phase = 'playing';
  broadcastTour();
  for (const c of Net.peers) netSendTo(c, {k:'start', picks:picks, mode:mode, slot:c.slot, mid:mid});
  beginMatch('host', picks, 0, mode);
}
/* host: a tournament game just ended */
export function tourFinish(winner){
  if (Net.mode!=='host' || !G.tour || G.tour.phase!=='playing') return;
  tourResult(G.tour, winner);
  broadcastTour();
}
export function broadcastLobby(){
  if (Net.mode!=='host' || !G.lobby) return;
  netBroadcast({k:'lobby', mode:G.lobby.mode, slots:G.lobby.slots});
}
/* the roster panel that both sides look at while waiting */
export function renderLobby(){
  const el = document.getElementById('lobbyStatus');
  if (!el) return;
  if (!G.lobby){ el.innerHTML=''; return; }
  const cap = lobbyCap();
  let rows = '';
  for (let i=0;i<cap;i++){
    const seat = lobbySeat(i);
    const tm = seat && seat.team!==undefined ? seat.team : SLOT_TEAM(i);
    const col = TEAM_COL[tm];
    const who = seat ? (i===G.mySlot ? (G.name||'YOU') : (seat.name || 'Player '+(i+1))) : 'waiting…';
    const hero = seat ? HEROES[seat.hero].name : '—';
    const rdy = seat && seat.ready ? '<b style="color:var(--acc)">READY</b>' : '<span style="color:#4a5670">not ready</span>';
    rows += '<div class="seat'+(seat?'':' empty')+(i===G.mySlot?' me':'')+'">'+
              '<span class="tm" style="background:'+col+'"></span>'+
              '<span class="wh">'+who+'</span>'+
              '<span class="hr" style="color:'+(seat?HEROES[seat.hero].col:'#3d4863')+'">'+hero+'</span>'+
              '<span class="rd">'+rdy+'</span>'+
              (i===G.mySlot ? '<button class="swap" onclick="lobbySwitchTeam()">Switch side</button>' : '')+
            '</div>';
  }
  const tourBtn = Net.mode==='host'
    ? '<div class="modesel" style="margin-top:6px">'+
      '<span style="color:var(--dim);font-size:12px">Tournament &mdash; heroes drafted, losers eliminated:</span>'+
      '<select id="tourLives" class="modedd" style="width:auto;margin:0">'+
        [3,5,7].map(n=>'<option value="'+n+'">'+n+' lives</option>').join('')+
      '</select>'+
      '<button onclick="startTournament()">Start Tournament</button></div>'
    : '';
  const modeBtns = Net.mode==='host'
    ? '<div class="modesel">'+
      ['1v1','2v2'].map(m=>'<button class="'+(G.lobby.mode===m?'pri':'')+'" onclick="lobbySetMode(\''+m+'\')">'+m.toUpperCase()+'</button>').join('')+
      '</div>'
    : '<div class="modesel"><span style="color:var(--dim);font-size:12px">Mode: <b>'+G.lobby.mode.toUpperCase()+'</b> (host decides)</span></div>';
  el.innerHTML = modeBtns + tourBtn + '<div class="roster">'+rows+'</div>' +
    '<div style="margin-top:8px;color:var(--dim)">'+
      (!lobbyFull()
        ? 'Waiting for '+(cap-G.lobby.slots.length)+' more player(s). Share your code.'
        : !lobbyBalanced()
          ? '<b style="color:var(--red)">Uneven sides — '+lobbyTeamCount(0)+' v '+lobbyTeamCount(1)+
            '. Somebody has to switch before the match can start.</b>'
          : lobbyReadyCount()+' / '+cap+' ready — the match starts when everyone is.')+
    '</div>';
}
export function lobbySetMode(m){
  if (Net.mode!=='host' || !G.lobby) return;
  G.lobby.mode = m;
  // shrinking the lobby drops anyone who no longer has a seat
  if (m==='1v1') G.lobby.slots = G.lobby.slots.filter(x=>x.slot<2);
  for (const x of G.lobby.slots) x.ready = false;
  broadcastLobby(); renderLobby();
}
export function setLobbyStatus(t){
  const el=document.getElementById('lobbyStatus');
  if (el && !G.lobby) el.textContent = t;
}
export function returnToLobby(){
  document.getElementById('endcard').classList.add('hide');
  document.getElementById('help').classList.add('hide');
  toggleShop(false);
  G.started=false; G.mode=null; G.S=null; G.view=null; G.latest=null; G.buf=[];
  G.endShown=false; G.order={type:'stop'}; G.pred.init=false; G.aMode=false;
  G.parts=[]; G.nums=[]; G.rings=[]; G.lines=[];
  document.getElementById('overlay').classList.remove('hide');
  if (G.tour && G.tour.on){                 // a series is running — go back to the draft board
    showScreen('scrDraft');
    renderTour();
    return;
  }
  showScreen('scrHero');
  const inLobby = Net.open && G.lobby;
  document.getElementById('rowLocal').classList.toggle('hide', inLobby);
  document.getElementById('rowLobby').classList.toggle('hide', !inLobby);
  if (inLobby){
    for (const x of G.lobby.slots) x.ready = false;
    document.getElementById('btnReady').disabled = false;
    if (Net.mode==='host') broadcastLobby();
    renderLobby();
  }
}
export function lobbyReady(){
  if (!Net.open || !G.lobby) return;
  const seat = lobbySeat(G.mySlot);
  if (seat){ seat.hero = G.pick; seat.ready = true; }
  document.getElementById('btnReady').disabled = true;
  if (Net.mode==='client') netSendCmd({k:'ready', h:G.pick, nm:G.name});
  else { broadcastLobby(); tryStartMatch(); }
  renderLobby();
}
/* the host starts the moment every seat is filled and every player has readied */
export function tryStartMatch(){
  if (Net.mode!=='host' || !G.lobby) return;
  if (!lobbyFull()) return;
  if (G.lobby.slots.some(x=>!x.ready)) return;
  if (!lobbyBalanced()){ addToast('The teams are uneven — somebody has to switch'); return; }
  const cap = lobbyCap();
  const picks = [];
  for (let i=0;i<cap;i++){
    const seat = lobbySeat(i);
    picks.push({h: seat ? seat.hero : HERO_IDS[0],
                tm: seat && seat.team!==undefined ? seat.team : SLOT_TEAM(i),
                nm: seat ? (seat.name || ('Player '+(i+1))) : ('Player '+(i+1))});
  }
  const mode = G.lobby.mode;
  const mid = 'm'+Date.now().toString(36)+'-'+Math.floor(Math.random()*1e6).toString(36);
  G.matchId = mid;
  for (const c of Net.peers) netSendTo(c, {k:'start', picks:picks, mode:mode, slot:c.slot, mid:mid});
  for (const x of G.lobby.slots) x.ready = false;
  beginMatch('host', picks, 0, mode);
}

export function renderTour(){
  const T = G.tour;
  if (!T) return;
  const myT = myTourTeam();
  const head = document.getElementById('tourHead');
  const onClock = T.phase==='draft' ? tourDraftTeam(T) : -1;
  head.innerHTML =
    '<h2 style="margin-top:0">Tournament &mdash; '+T.mode.toUpperCase()+
      ' &middot; game '+T.game+'</h2>'+
    '<div class="sub" style="margin:0 0 4px">'+
      (T.turn===0 ? '<span style="color:'+TEAM_COL[T.first||0]+'">'+
                    ((T.first||0)===myT ? 'You won the toss — you draft first. ' : 'They won the toss and draft first. ')+
                    '</span>' : '')+
      '<span style="color:'+TEAM_COL[0]+';font-weight:800">'+T.score[0]+'</span> &ndash; '+
      '<span style="color:'+TEAM_COL[1]+';font-weight:800">'+T.score[1]+'</span>'+
      ' &nbsp;·&nbsp; lose a game and the hero you lost with is gone for good</div>';

  // both pools
  const pools = document.getElementById('tourPools');
  pools.innerHTML = [0,1].map(tm=>{
    const live = T.pool[tm], dead = T.dead[tm];
    const chips = live.map(h=>'<span class="hchip'+(T.cur[tm].indexOf(h)>=0?' live':'')+
                      '" style="color:'+HEROES[h].col+'">'+HEROES[h].name+'</span>').join('')+
                  dead.map(h=>'<span class="hchip out">'+HEROES[h].name+'</span>').join('');
    return '<div class="tpool" style="border-color:'+TEAM_COL[tm]+'55">'+
      '<div class="th" style="color:'+TEAM_COL[tm]+'">'+
        (tm===myT ? 'YOUR SIDE' : 'THEIR SIDE')+
        '<span class="lives">'+live.length+' left'+(dead.length? ' · '+dead.length+' lost':'')+'</span></div>'+
      '<div class="hs">'+(chips||'<span class="lives">nothing drafted yet</span>')+'</div></div>';
  }).join('');

  const prompt = document.getElementById('tourPrompt');
  const grid = document.getElementById('tourGrid');
  const row = document.getElementById('tourRow');
  const sheet = document.getElementById('tourSheet');
  grid.innerHTML=''; row.innerHTML='';
  sheet.innerHTML = '<div class="sheethint">Hover any hero to read its full kit.</div>';

  const mkCard = (h, disabled, onclick)=>{
    const d = document.createElement('div');
    d.className = 'tcard'+(disabled?' gone':'');
    d.style.borderLeftColor = HEROES[h].col;
    d.innerHTML = '<div class="tn" style="color:'+HEROES[h].col+'">'+HEROES[h].name+'</div>'+
                  '<div class="tt">'+HEROES[h].title.replace(/^The /,'')+'</div>';
    if (!disabled && onclick) d.onclick = onclick; else d.classList.add('idle');
    d.onmouseenter = ()=>{ document.getElementById('tourSheet').innerHTML = heroSheet(h); };
    grid.appendChild(d);
  };

  if (T.phase==='draft'){
    const taken = tourTaken(T);
    const mine = onClock===myT;
    prompt.innerHTML = mine
      ? '<b style="color:var(--acc)">Your pick.</b> Taking a hero also takes it away from them &mdash; '+
        'pick '+(tourPicksPerTeam(T)*2 - T.turn)+' of '+(tourPicksPerTeam(T)*2)+'.'
      : 'Waiting for the other side to draft&hellip;';
    for (const h of HERO_IDS) mkCard(h, taken.indexOf(h)>=0 || !mine, ()=>tourClick(h));
  }
  else if (T.phase==='pick'){
    const need = tourNeedPick(T, myT);
    prompt.innerHTML = need
      ? '<b style="color:var(--acc)">Choose the hero you are bringing out.</b>'+
        (T.teamSize>1 ? ' Your side needs '+(T.teamSize-T.cur[myT].length)+' more.' : '')
      : 'Locked in. Waiting for the other side&hellip;';
    for (const h of tourBench(T, myT)) mkCard(h, !need, ()=>tourClick(h));
    if (!tourBench(T, myT).length) prompt.innerHTML = 'Your heroes are all committed.';
  }
  else if (T.phase==='ready'){
    prompt.innerHTML = 'Both sides are set. '+
      [0,1].map(tm=>'<span style="color:'+TEAM_COL[tm]+'">'+
        T.cur[tm].map(h=>HEROES[h].name).join(' + ')+'</span>').join(' vs ');
    if (Net.mode==='host'){
      const b = document.createElement('button');
      b.className='pri'; b.textContent='Start game '+T.game;
      b.onclick = tourStartGame; row.appendChild(b);
    } else {
      prompt.innerHTML += '<br>Waiting for the host to start the game&hellip;';
    }
  }
  else if (T.phase==='playing'){
    prompt.innerHTML = 'Game '+T.game+' in progress&hellip;';
  }
  else if (T.phase==='over'){
    const won = T.champion===myT;
    head.innerHTML += '<div class="tbanner" style="color:'+(won?'var(--acc)':'var(--red)')+'">'+
      (won? 'TOURNAMENT WON':'TOURNAMENT LOST')+'</div>';
    prompt.innerHTML = 'Final score '+T.score[0]+' &ndash; '+T.score[1]+
      '. '+(won?'They':'You')+' ran out of heroes.';
    if (Net.mode==='host'){
      const b = document.createElement('button');
      b.className='pri'; b.textContent='Back to lobby';
      b.onclick = ()=>{ G.tour=null; broadcastTour(); returnToLobby(); };
      row.appendChild(b);
    }
  }
  const back = document.createElement('button');
  back.textContent = 'Leave';
  back.onclick = ()=>location.reload();
  row.appendChild(back);
}
