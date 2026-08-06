// @ts-nocheck
import { TEAM_COL, KILLS_TO_WIN } from '../data/world';
import { HEROES } from '../data/heroes';
import { G } from '../app/state';
import { fmtTime } from '../render/view';
import { tourFinish, canRematch } from '../app/online';
import { recordMatch } from '../app/persistence';
import { renderMatchStats, resetMatchStats } from './matchStats';
import { playSfx } from '../audio/sfx';

export function showEnd(winner){
  G.endShown = true;
  // the card itself goes up FIRST — sound, history, tournaments and the stats
  // panel are all extras, and none of them is allowed to keep VICTORY/DEFEAT
  // off the screen if it hits a bug (online clients live and die by this)
  const win = winner===G.myTeam;
  document.getElementById('endTitle').textContent = win? 'VICTORY':'DEFEAT';
  document.getElementById('endTitle').style.color = win? '#5ef0c8':'#ff5f5f';
  document.getElementById('endcard').classList.remove('hide');
  try{ playSfx(win ? 'victory' : 'defeat'); }catch(e){}
  try{ recordMatch(G.view, winner); }catch(e){}
  try{ if (G.tour && G.tour.on) tourFinish(winner); }
  catch(err){ console.error('[LB] tournament finish failed:', err); }
  const v = G.view || G.latest;
  const me = v && v.ps ? v.ps[G.mySlot] : null;
  const reason = {tower:'the tower fell', kills:'reached '+(v&&v.wk||KILLS_TO_WIN)+' points',
                  time:'decided on score at the time limit'}[v&&v.hw] || '';
  document.getElementById('endSub').textContent =
    (v? (v.md||'1v1').toUpperCase()+' · '+fmtTime(v.t)+' match':'') + (reason? ' — '+reason : '') +
    (G.tour && G.tour.on && G.tour.score ? '  ·  series '+G.tour.score[0]+'–'+G.tour.score[1] : '');
  G.endHadDetail = false;
  try{ refreshEndStats(); }
  catch(err){
    console.error('[LB] end-of-match stats failed — please report this stack:', err);
    const box = document.getElementById('endStats');
    if (box) box.innerHTML = '<div class="note">The stats panel hit an error — '+
      'press F12 and send us the red text so we can fix it.</div>';
  }
  // Rematch only makes sense for a practice match — a lobby or a tournament
  // series has its own route back
  const again = document.getElementById('btnRematch');
  if (again) again.classList.toggle('hide', !canRematch());
  // a three second cooling-off period so nobody fat-fingers their way out of the lobby
  const leave = document.getElementById('btnLeave');
  const cont  = document.getElementById('btnContinue');
  if (leave){
    leave.disabled = true; cont.disabled = true;
    if (again) again.disabled = true;
    let left = 3;
    leave.textContent = 'Leave ('+left+')';
    const tick = setInterval(()=>{
      left--;
      if (left>0){ leave.textContent = 'Leave ('+left+')'; return; }
      clearInterval(tick);
      leave.disabled = false; cont.disabled = false;
      if (again) again.disabled = false;
      leave.textContent = 'Leave';
    }, 1000);
  }
  document.getElementById('endcard').classList.remove('hide');
}

/* The scoreboard + stats panel. Split out of showEnd so it can run AGAIN when
   the heavyweight final snapshot arrives after the verdict did — the card shows
   whatever it has, and upgrades itself to the full breakdown when it lands. */
export function refreshEndStats(){
  const v = G.view || G.latest;
  const me = v && v.ps ? v.ps[G.mySlot] : null;
  if (!me || !v) return;
  // the breakdown and the graphs only ride in on the final snapshot — prefer the
  // rawest one we hold, since the interpolated view can still be a frame behind
  const detail = (G.latest && G.latest.ps && G.latest.ps.some(p=>p.dby)) ? G.latest : v;
  G.endHadDetail = !!(detail.ps && detail.ps.some(p=>p.dby));
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
    '<td>'+Math.round(q.dtk||0).toLocaleString()+'</td>'+
    '<td>'+(q.hl||0).toLocaleString()+'</td>'+
    '<td><b>'+q.nw.toLocaleString()+'g</b></td></tr>').join('');
  const summary =
    '<table class="stab etbl"><tr><th>Player</th><th>K / D / A</th><th>Lvl</th><th>CS</th>'+
    '<th>Deny</th><th>Hero dmg</th><th>Taken</th><th>Healed</th><th>Net worth</th></tr>'+rows+'</table>';
  resetMatchStats();
  renderMatchStats(detail, summary);
}

