// @ts-nocheck
import { HEROES, HERO_IDS } from '../data/heroes';
import { G } from '../app/state';
import { addToast } from '../render/fx';
import {
  Net, netSendCmd, lobbySeat, broadcastLobby, renderLobby, hostInit
} from '../app/online';
import { lbTrainOpen } from '../ai/neural/train';
import { renderStats } from '../app/persistence';
import { renderItemBook, renderHeroBook } from './books';

export function showScreen(id){
  for (const s of ['scrHero','scrStats','scrHeroBook','scrItems','scrDraft','scrQuick','scrHost','scrJoin','scrTrain'])
    document.getElementById(s).classList.toggle('hide', s!==id);
  if (id==='scrHost' && !Net.pc) hostInit();
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
  el.innerHTML = el.innerHTML ? '' :
    '<b>RMB</b> move / attack &nbsp;·&nbsp; <b>A + LMB</b> attack-move &nbsp;·&nbsp; <b>S</b> stop &nbsp;·&nbsp; <b>H</b> hold<br>'+
    '<b>Q W E R</b> cast &nbsp;·&nbsp; <b>Shift+Q/W/E/R</b> (or click the <b>+</b>) level an ability<br>'+
    '<b>1–6</b> use item &nbsp;·&nbsp; <b>B</b> shop &nbsp;·&nbsp; <b>Space</b> recenter &nbsp;·&nbsp; <b>F1</b> controls panel<br><br>'+
    'Score 2 points to win (4 in 2v2) — two deaths in 1v1 and you have lost. '+
    'Destroying the enemy tower wins outright at any score. '+
    'Towers only take 15% damage unless your creeps are with you. '+
    'A creep pays full gold only to a killing blow — '+
    'half of it leaks to the enemy if it dies to anything else, and none at all if you deny it. '+
    'and you can deny your own creeps under 50% HP to halve the XP your opponent gets.';
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
      G.pick=id;
      for (const el of box.children) el.classList.toggle('sel', el.dataset.id===id);
      if (Net.open && G.lobby){                 // tell the room what you switched to
        const seat = lobbySeat(G.mySlot);
        if (seat) seat.hero = id;
        if (Net.mode==='host') broadcastLobby(); else netSendCmd({k:'hello', h:id, nm:G.name});
        renderLobby();
      }
    };
    box.appendChild(d);
  }
}

