// @ts-nocheck
import { TEAM_COL, KILLS_TO_WIN } from '../data/world';
import { HEROES } from '../data/heroes';
import { G } from '../app/state';
import { fmtTime } from '../render/view';
import { tourFinish } from '../app/online';
import { recordMatch } from '../app/persistence';

export function showEnd(winner){
  G.endShown = true;
  try{ recordMatch(G.view, winner); }catch(e){}
  if (G.tour && G.tour.on) tourFinish(winner);
  const win = winner===G.myTeam;
  document.getElementById('endTitle').textContent = win? 'VICTORY':'DEFEAT';
  document.getElementById('endTitle').style.color = win? '#5ef0c8':'#ff5f5f';
  const v=G.view;
  const me = v? v.ps[G.mySlot] : null;
  const reason = {tower:'the tower fell', kills:'reached '+(v&&v.wk||KILLS_TO_WIN)+' points',
                  time:'decided on score at the time limit'}[v&&v.hw] || '';
  document.getElementById('endSub').textContent =
    (v? (v.md||'1v1').toUpperCase()+' · '+fmtTime(v.t)+' match':'') + (reason? ' — '+reason : '') +
    (G.tour && G.tour.on ? '  ·  series '+G.tour.score[0]+'–'+G.tour.score[1] : '');
  if (me && v){
    const order = v.ps.slice().sort((a,b)=> (a.tm===G.myTeam?0:1)-(b.tm===G.myTeam?0:1) || a.sl-b.sl);
    const rows = order.map(q=>
      '<tr class="'+(q.sl===G.mySlot?'mine':'')+'">'+
      '<td style="border-left:3px solid '+TEAM_COL[q.tm]+';padding-left:9px">'+
        '<b>'+(q.nm||('Player '+(q.sl+1)))+'</b>'+(q.sl===G.mySlot?' <span style="color:var(--acc)">(you)</span>':'')+
        '<br><span style="color:'+HEROES[q.hid].col+';font-size:10px">'+HEROES[q.hid].name+'</span></td>'+
      '<td><b>'+q.k+' / '+q.d+' / '+(q.as||0)+'</b></td>'+
      '<td>'+q.lvl+'</td>'+
      '<td>'+q.cs+'</td>'+
      '<td>'+q.dn+'</td>'+
      '<td>'+(q.dh||0).toLocaleString()+'</td>'+
      '<td>'+(q.hl||0).toLocaleString()+'</td>'+
      '<td><b>'+q.nw.toLocaleString()+'g</b></td></tr>').join('');
    document.getElementById('endStats').innerHTML =
      '<table class="etab"><tr><th>Player</th><th>K / D / A</th><th>Lvl</th><th>CS</th>'+
      '<th>Deny</th><th>Hero dmg</th><th>Healed</th><th>Net worth</th></tr>'+rows+'</table>';
  }
  // a three second cooling-off period so nobody fat-fingers their way out of the lobby
  const leave = document.getElementById('btnLeave');
  const cont  = document.getElementById('btnContinue');
  if (leave){
    leave.disabled = true; cont.disabled = true;
    let left = 3;
    leave.textContent = 'Leave ('+left+')';
    const tick = setInterval(()=>{
      left--;
      if (left>0){ leave.textContent = 'Leave ('+left+')'; return; }
      clearInterval(tick);
      leave.disabled = false; cont.disabled = false;
      leave.textContent = 'Leave';
    }, 1000);
  }
  document.getElementById('endcard').classList.remove('hide');
}

