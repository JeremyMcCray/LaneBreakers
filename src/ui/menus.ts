// @ts-nocheck
import { HEROES, HERO_IDS } from '../data/heroes';
import { G } from '../app/state';
import { addToast } from '../render/fx';
import {
  Net, netSendCmd, lobbySeat, broadcastLobby, renderLobby, hostInit, myLobbySlot
} from '../app/online';
import { lbTrainOpen } from '../ai/neural/train';
import { renderStats } from '../app/persistence';
import { renderItemBook, renderHeroBook } from './books';

export function showScreen(id){
  for (const s of ['scrHero','scrStats','scrHeroBook','scrItems','scrDraft','scrQuick','scrTrain'])
    document.getElementById(s).classList.toggle('hide', s!==id);
  if (id==='scrStats') renderStats();
  if (id==='scrItems') renderItemBook();
  if (id==='scrHeroBook') renderHeroBook();
  if (id==='scrTrain') lbTrainOpen();
}
export function copyBox(id){
  const el=document.getElementById(id); el.select();
  navigator.clipboard ? navigator.clipboard.writeText(el.value) : document.execCommand('copy');
  addToast('Copied to clipboard');
}
export function toggleHelpMenu(){
  const el=document.getElementById('menuHelp');
  if (el) el.innerHTML = '';
}
export function buildHeroMenu(){
  const box=document.getElementById('heroList');
  box.innerHTML='';
  for (const id of HERO_IDS){
    const h=HEROES[id];
    const d=document.createElement('div');
    d.className='hero'+(id===G.pick?' sel':'');
    d.dataset.id=id;
    const abs = h.abilities.map(a=>'<b>'+a.key+'</b> '+a.name).join('<br>');
    d.innerHTML =
      '<div class="portrait" style="background:linear-gradient(135deg,'+h.col2+','+h.col+'33)"></div>'+
      '<div class="ti">'+h.title+'</div>'+
      '<div class="nm" style="color:'+h.col+'">'+h.name+'</div>'+
      '<div class="ds">'+h.desc+'</div>'+
      '<div class="ab">'+abs+'</div>';
    d.onclick=()=>{
      G.pick=id; G.randomLocked=false;
      for (const el of box.children) el.classList.toggle('sel', el.dataset.id===id);
      if (G.lobby){                              // tell the room what you switched to
        const seat = lobbySeat(myLobbySlot());
        if (seat){ seat.hero = id; seat.rand = 0; }
        if (Net.mode==='host') broadcastLobby(); else if (Net.open) netSendCmd({k:'hello', h:id, nm:G.name});
        renderLobby();
      }
    };
    box.appendChild(d);
  }
}
/* Random is a mystery box — the roll happens now, but nobody at the pick screen
   (you included) learns which hero it is until the match actually starts. */
export function randomHero(){
  let id = G.pick;
  while (id===G.pick && HERO_IDS.length>1) id = HERO_IDS[Math.floor(Math.random()*HERO_IDS.length)];
  G.pick = id; G.randomLocked = true;
  const box = document.getElementById('heroList');
  if (box) for (const el of box.children) el.classList.remove('sel');
  if (G.lobby){
    const seat = lobbySeat(myLobbySlot());
    if (seat){ seat.hero = id; seat.rand = 1; }
    if (Net.mode==='host') broadcastLobby(); else if (Net.open) netSendCmd({k:'hello', h:id, nm:G.name, r:1});
    renderLobby();
  }
  addToast('Random hero locked in — you\'ll meet them when the match starts');
}

