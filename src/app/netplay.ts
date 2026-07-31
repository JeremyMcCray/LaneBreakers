// @ts-nocheck
/* WebRTC + PeerJS + net message routing (parity port). */
import { HERO_IDS } from '../data/heroes';
import { now } from '../data/world';
import { applyCmd, buildSnapshot } from '../sim/engine';
import { G, SLOT_TEAM } from './state';
import { beginMatch, teamOfSlot } from './shell';
import { spawnFx, addToast } from '../render/fx';
import { showEnd, refreshEndStats } from '../ui/endCard';
import { showScreen } from '../ui/menus';
import {
  newLobby, lobbySeat, lobbyFreeSlot, lobbyCap,
  broadcastLobby, renderLobby, tryStartMatch, broadcastTour, renderTour
} from './lobbyUi';
import { tourDraft, tourField } from './tournament';

export const RTC_CFG = {iceServers:[
  {urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},
  {urls:'stun:global.stun.twilio.com:3478'}
]};
export const Net = {mode:null, pc:null, dcS:null, dcC:null, open:false,
             conn:null,      // client: my single link to the host
             peers:[]};      // host: every connected client, each with its slot

export function encodeSig(desc){
  return btoa(unescape(encodeURIComponent(JSON.stringify({t:desc.type, s:desc.sdp}))))
         .replace(/(.{76})/g,'$1\n');
}
export function decodeSig(txt){
  const o = JSON.parse(decodeURIComponent(escape(atob(txt.replace(/\s+/g,'')))));
  return {type:o.t, sdp:o.s};
}
export function waitIce(pc){
  return new Promise(res=>{
    if (pc.iceGatheringState==='complete') return res();
    const to = setTimeout(res, 3500);
    pc.addEventListener('icegatheringstatechange', ()=>{
      if (pc.iceGatheringState==='complete'){ clearTimeout(to); res(); }
    });
  });
}
export function status(txt, id){ const el=document.getElementById(id||'connStatus'); if(el) el.textContent = txt; }

export async function hostInit(){
  const pc = new RTCPeerConnection(RTC_CFG); Net.pc = pc; Net.mode='host';
  G.mySlot=0; G.myTeam=0; G.lobby = newLobby('1v1');
  G.lobby.slots.push({slot:1, team:1, hero:HERO_IDS[0], name:'Player 2', ready:false, here:true});
  Net.dcS = pc.createDataChannel('state', {ordered:false, maxRetransmits:0});
  Net.dcC = pc.createDataChannel('cmd', {ordered:true});
  Net.dcC.onmessage = ev => onNetMsg(JSON.parse(ev.data), 1);
  Net.dcC.onopen = ()=>{
    Net.open = true;
    status('Channel open — waiting for hero pick…');
    showScreen('scrHero');
    document.getElementById('rowLocal')?.classList.add('hide');
    document.getElementById('rowLobby')?.classList.remove('hide');
    document.getElementById('btnReady').disabled = false;
    broadcastLobby(); renderLobby();
  };
  pc.onconnectionstatechange = ()=>{
    status('Connection: '+pc.connectionState);
    if (pc.connectionState==='failed') status('Connection failed — try again (symmetric NAT may block direct P2P).');
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIce(pc);
  document.getElementById('hostOffer').value = encodeSig(pc.localDescription);
  status('Invite code ready. Send it to your friend.');
}
export async function hostAccept(){
  const txt = document.getElementById('hostAnswer').value.trim();
  if (!txt) return status('Paste the reply code first.');
  try{
    await Net.pc.setRemoteDescription(decodeSig(txt));
    status('Connecting…');
  }catch(err){ status('Bad reply code: '+err.message); }
}
export async function joinGenerate(){
  const txt = document.getElementById('joinOffer').value.trim();
  if (!txt) return status('Paste the invite code first.','connStatus2');
  const pc = new RTCPeerConnection(RTC_CFG); Net.pc = pc; Net.mode='client';
  pc.ondatachannel = ev=>{
    const dc = ev.channel;
    if (dc.label==='state'){ Net.dcS = dc; dc.onmessage = e=>onNetMsg(JSON.parse(e.data)); }
    else {
      Net.dcC = dc; Net.mode='client';
      dc.onmessage = e=>onNetMsg(JSON.parse(e.data));
      dc.onopen = ()=>{
        Net.open=true; G.mySlot=1; G.myTeam=1;
        dc.send(JSON.stringify({k:'hello', h:G.pick}));
        status('Connected — waiting for host…','connStatus2');
        showScreen('scrHero');
        document.getElementById('rowLocal').classList.add('hide');
        document.getElementById('rowLobby').classList.remove('hide');
        document.getElementById('btnReady').disabled = false;
      };
    }
  };
  pc.onconnectionstatechange = ()=>status('Connection: '+pc.connectionState,'connStatus2');
  try{
    await pc.setRemoteDescription(decodeSig(txt));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await waitIce(pc);
    document.getElementById('joinAnswer').value = encodeSig(pc.localDescription);
    status('Reply code ready — send it back to the host.','connStatus2');
  }catch(err){ status('Bad invite code: '+err.message,'connStatus2'); }
}
export function netSendTo(peer, o){
  if (peer && peer.conn && peer.conn.open) peer.conn.send(o);
}
export function netBroadcast(o){
  for (const c of Net.peers) netSendTo(c, o);
  if (Net.dcC && Net.dcC.readyState==='open') Net.dcC.send(JSON.stringify(o));
}
/* Each team gets its own snapshot, so the host builds at most two and fans them out. */
export function netSendStateAll(S){
  const byTeam = [null, null];
  let sent = false;
  const snap = tm => {
    if (!byTeam[tm]){ byTeam[tm] = buildSnapshot(S, tm); byTeam[tm].f = G.netFx; }
    return byTeam[tm];
  };
  for (const c of Net.peers){
    if (!c.conn || !c.conn.open) continue;
    const dc = c.conn.dataChannel;
    if (dc && dc.bufferedAmount > 200000) continue;
    c.conn.send(snap(teamOfSlot(c.slot))); sent = true;
  }
  const dc = Net.dcS;                                 // manual copy-paste path (1v1 only)
  if (dc && dc.readyState==='open' && dc.bufferedAmount < 200000){
    dc.send(JSON.stringify(snap(1))); sent = true;
  }
  if (sent) G.netFx = [];
}
export function netSendCmd(o){
  if (Net.conn){ if (Net.conn.open) Net.conn.send(o); return; }
  const dc = Net.dcC;
  if (dc && dc.readyState==='open') dc.send(JSON.stringify(o));
}

export const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I L O 0 1
export const PEER_PREFIX = 'lanebreaker-v1-';
export function mkCode(){
  let c=''; for (let i=0;i<5;i++) c += CODE_ALPHA[Math.floor(Math.random()*CODE_ALPHA.length)];
  return c;
}
export function setQuickStatus(t){ const el=document.getElementById('quickStatus'); if (el) el.innerHTML = t; }
/* PeerJS: prefer the npm package, then CDN fallbacks if the dynamic import fails. */
export function loadPeerJS(){
  if (window.Peer) return Promise.resolve(true);
  if (Net.peerLoad) return Net.peerLoad;
  Net.peerLoad = (async () => {
    try {
      const mod = await import('peerjs');
      const PeerCtor = mod.Peer || mod.default;
      if (PeerCtor) { window.Peer = PeerCtor; return true; }
    } catch (e) { /* fall through to CDN */ }
    const urls = ['https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js',
                  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
                  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'];
    for (const src of urls) {
      const ok = await new Promise((res) => {
        if (window.Peer) return res(true);
        const sc = document.createElement('script');
        sc.src = src;
        sc.onload = () => res(!!window.Peer);
        sc.onerror = () => res(false);
        document.head.appendChild(sc);
      });
      if (ok) return true;
    }
    return false;
  })();
  return Net.peerLoad;
}
export function wireClientConn(conn){                 // I am a client, this is my link to the host
  Net.conn = conn; Net.mode = 'client';
  conn.on('data', m => onNetMsg(typeof m==='string' ? JSON.parse(m) : m));
  conn.on('open', ()=>{ Net.open = true; netSendCmd({k:'hello', h:G.pick, nm:G.name}); });
  conn.on('close', ()=>{
    Net.open=false; Net.conn=null;
    addToast('Host disconnected');
    setQuickStatus('<b style="color:var(--red)">Host disconnected.</b>');
  });
  conn.on('error', err=> setQuickStatus('Connection error: '+(err&&err.type||err)));
}
export function wireHostConn(conn){                   // I am the host, a player just knocked
  Net.mode = 'host';
  if (!G.lobby) G.lobby = newLobby('1v1');
  const slot = lobbyFreeSlot();
  if (slot < 0){
    conn.on('open', ()=>{ conn.send({k:'full'}); setTimeout(()=>conn.close(), 400); });
    return;
  }
  const peer = {conn:conn, slot:slot};
  Net.peers.push(peer);
  G.lobby.slots.push({slot:slot, team:SLOT_TEAM(slot), hero:HERO_IDS[0],
                      name:'Player '+(slot+1), ready:false, here:true});
  conn.on('data', m => onNetMsg(typeof m==='string' ? JSON.parse(m) : m, slot));
  conn.on('open', ()=>{
    Net.open = true;
    netSendTo(peer, {k:'welcome', slot:slot, team:teamOfSlot(slot), mode:G.lobby.mode});
    broadcastLobby(); renderLobby();
    setQuickStatus('<b style="color:var(--acc)">Player '+(slot+1)+' joined.</b> '+
                   G.lobby.slots.length+' / '+lobbyCap()+' seats filled.');
    showScreen('scrHero');
    document.getElementById('rowLocal').classList.add('hide');
    document.getElementById('rowLobby').classList.remove('hide');
    document.getElementById('btnReady').disabled = false;
  });
  conn.on('close', ()=>{
    Net.peers = Net.peers.filter(c=>c!==peer);
    if (G.lobby) G.lobby.slots = G.lobby.slots.filter(x=>x.slot!==slot);
    addToast('Player '+(slot+1)+' disconnected');
    broadcastLobby(); renderLobby();
  });
  conn.on('error', ()=>{});
}
export async function quickHost(){
  const btn=document.getElementById('btnCreate'); btn.disabled=true;
  Net.mode='host'; Net.peers=[]; G.mySlot=0; G.myTeam=0;
  G.lobby = newLobby(document.getElementById('modeSel').value);
  setQuickStatus('Contacting the relay…');
  const ok = await loadPeerJS();
  if (!ok){ btn.disabled=false;
    return setQuickStatus('<b style="color:var(--red)">Could not reach the relay service.</b> '+
      'Please try again shortly.'); }
  let tries=0;
  const attempt = ()=>{
    const code = mkCode();
    const peer = new Peer(PEER_PREFIX+code.toLowerCase(), {debug:0});
    Net.peer = peer;
    peer.on('open', ()=>{
      const el=document.getElementById('roomCode');
      el.textContent = code; el.classList.remove('hide');
      document.getElementById('btnCopyCode').classList.remove('hide');
      Net.code = code;
      setQuickStatus('Lobby open — send this code to your friend, then wait here.');
    });
    peer.on('connection', conn=> wireHostConn(conn));
    peer.on('error', err=>{
      if (err && err.type==='unavailable-id' && tries++ < 4){ try{peer.destroy();}catch(e){} return attempt(); }
      if (err && err.type==='peer-unavailable') return;
      btn.disabled=false;
      setQuickStatus('<b style="color:var(--red)">Relay error: '+(err&&err.type||err)+'</b> — please try again shortly.');
    });
  };
  attempt();
}
export async function quickJoin(){
  const code = (document.getElementById('joinCode').value||'').trim().toUpperCase();
  if (code.length<5) return setQuickStatus('Enter the 5-character code first.');
  setQuickStatus('Contacting the relay…');
  const ok = await loadPeerJS();
  if (!ok) return setQuickStatus('<b style="color:var(--red)">Could not reach the relay service.</b> '+
    'Please try again shortly.');
  const peer = new Peer({debug:0});
  Net.peer = peer;
  peer.on('open', ()=>{
    setQuickStatus('Found the relay — connecting to lobby '+code+'…');
    const conn = peer.connect(PEER_PREFIX+code.toLowerCase(), {reliable:true, serialization:'json'});
    wireClientConn(conn);
    conn.on('open', ()=>{
      setQuickStatus('<b style="color:var(--acc)">Connected — waiting for the host.</b>');
    });
  });
  peer.on('error', err=>{
    const t = err && err.type;
    if (t==='peer-unavailable')
      setQuickStatus('<b style="color:var(--red)">No lobby with code '+code+'.</b> Check the code and that your friend still has the lobby open.');
    else setQuickStatus('<b style="color:var(--red)">Relay error: '+(t||err)+'</b> — please try again shortly.');
  });
}
export function copyCode(){
  const t = document.getElementById('roomCode').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(t);
  addToast('Code copied: '+t);
}
/* A client putting up the end card. Guarded: whatever breaks inside, the
   players still get told the match is over — and we get a stack to fix. */
function clientShowEnd(w){
  if (G.endShown) return;
  try{ showEnd(w); }
  catch(err){
    console.error('[LB] end card failed — please report this stack:', err);
    addToast('End screen hit an error — press F12 and send us the red text');
    G.endShown = true;
    const ec = document.getElementById('endcard');
    if (ec) ec.classList.remove('hide');
  }
}
export function onNetMsg(m, fromSlot){
  /* ---------- host side ---------- */
  if (m.k==='hello'){                       // a client has arrived and told us its pick
    if (Net.mode!=='host') return;
    const seat = lobbySeat(fromSlot);
    if (seat){ seat.hero = m.h; if (m.nm) seat.name = m.nm; }
    broadcastLobby(); renderLobby();
    return;
  }
  if (m.k==='team'){                        // a client swapped sides
    if (Net.mode!=='host') return;
    const seat = lobbySeat(fromSlot);
    if (seat){ seat.team = m.t ? 1 : 0; seat.ready = false; }
    broadcastLobby(); renderLobby();
    return;
  }
  if (m.k==='ready'){
    if (Net.mode!=='host') return;
    const seat = lobbySeat(fromSlot);
    if (seat){ seat.hero = m.h; if (m.nm) seat.name = m.nm; seat.ready = true; }
    broadcastLobby(); renderLobby();
    tryStartMatch();
    return;
  }
  if (m.k==='tpick'){                       // a client drafted or fielded a hero
    if (Net.mode!=='host' || !G.tour) return;
    const team = teamOfSlot(fromSlot);
    const done = G.tour.phase==='draft' ? tourDraft(G.tour, team, m.h)
                                        : tourField(G.tour, team, m.h);
    if (done){ broadcastTour(); renderTour(); }
    return;
  }
  if (m.k==='c'){                           // a client command
    if (Net.mode==='host' && G.S && fromSlot!==undefined) applyCmd(G.S, fromSlot, m);
    return;
  }
  /* ---------- client side ---------- */
  if (m.k==='welcome'){
    G.mySlot = m.slot; G.myTeam = m.team!==undefined ? m.team : SLOT_TEAM(m.slot);
    Net.open = true;
    showScreen('scrHero');
    document.getElementById('rowLocal').classList.add('hide');
    document.getElementById('rowLobby').classList.remove('hide');
    document.getElementById('btnReady').disabled = false;
    return;
  }
  if (m.k==='tour'){
    G.tour = m.T;
    if (!G.started){ showScreen('scrDraft'); renderTour(); }
    else renderTour();
    return;
  }
  if (m.k==='lobby'){
    G.lobby = {mode:m.mode, slots:m.slots};
    const seat = lobbySeat(G.mySlot);
    if (seat && !seat.ready) document.getElementById('btnReady').disabled = false;
    renderLobby();
    return;
  }
  if (m.k==='start'){
    if (!G.started){ G.matchId = m.mid || null; beginMatch('client', m.picks, m.slot, m.mode); }
    return;
  }
  if (m.k==='over'){                        // the verdict, tiny and on its own
    if (!G.started) return;
    // stamp the outcome onto whatever view we hold so the card can describe it
    for (const view of [G.view, G.latest]){
      if (view){ view.ov = true; view.w = m.w; view.hw = view.hw || m.hw; }
    }
    clientShowEnd(m.w);
    return;
  }
  if (m.k==='s'){                           // snapshot
    if (!G.started) return;
    G.buf.push({rt:now(), v:m});
    if (G.buf.length>28) G.buf.shift();
    // one bad effect must never take the whole message handler down with it —
    // everything after this loop (G.latest, the end card) still has to run
    if (m.f) for (const f of m.f){
      try{ spawnFx(f); }
      catch(err){ console.error('[LB] fx failed:', f && f.t, err); }
    }
    G.latest = m;
    if (m.ov && !G.endShown) clientShowEnd(m.w);
    // the card may have gone up off the tiny 'over' message before the full
    // final snapshot landed — upgrade it to the real breakdown when it does
    else if (m.ov && G.endShown && !G.endHadDetail && m.ps && m.ps.some(p=>p.dby)){
      try{ refreshEndStats(); }
      catch(err){ console.error('[LB] end stats refresh failed:', err); }
    }
    return;
  }
}
