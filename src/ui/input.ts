// @ts-nocheck
import { dist } from '../data/world';
import { G } from '../app/state';
import { cmd } from '../app/shell';
import { addToast } from '../render/fx';
import { s2w, w2s, camScale, ownHeroView, cv } from '../render/view';
import { slotUnder } from './hitTest';
import { toggleShop } from './shop';
import { toggleSfxMute } from '../audio/sfx';

export function entUnder(px,py){
  const v=G.view; if(!v) return null;
  const [wx,wy]=s2w(px,py);
  let best=null, bd=1e9;
  for (const e of v.e){
    const d=dist(wx,wy,e.x,e.y);
    const pad = e.ty===0 ? 32 : 17;        // heroes are easier to grab than they are to hit
    if (d < e.r+pad && d<bd){ bd=d; best=e; }
  }
  return best;
}
/* allied creeps can be targeted to drop tower agro, even when they are not denyable */
export function attackable(e){
  if (!e) return false;
  if (e.tm!==G.myTeam) return true;
  return e.ty===1;                         // own creep, for deny or agro-drop
}
/* SMART LAST HIT — grab whatever sits nearest the cursor, not nearest the hero.
   In legacy mode only a unit directly under the cursor counts. */
export function pickTarget(px,py,grab){
  const v=G.view; if(!v) return null;
  const [wx,wy]=s2w(px,py);
  const own = ownHeroView(v);
  grab = grab||0;
  let best=null, bd=1e9;
  for (const e of v.e){
    if (e.i===(own&&own.i)) continue;
    if (!attackable(e)) continue;
    const d = dist(wx,wy,e.x,e.y);
    // denying your own creep demands the cursor actually be on it — no grab radius
    const ally = e.tm===G.myTeam;
    if (d > e.r + (ally ? 8 : (e.ty===0 ? 30 : 14) + grab)) continue;
    // heroes and creeps compete purely on how close they are to the cursor;
    // only towers are pushed down the list so you never siege by accident
    const sc = (e.ty===2 ? 1200 : 0) + d;
    if (sc<bd){ bd=sc; best=e; }
  }
  return best;
}
// no browser context menu anywhere (end card, menus, HUD...) — except text fields, where right-click paste matters
document.addEventListener('contextmenu', e=>{
  const t = e.target;
  if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA')) return;
  e.preventDefault();
});
cv.addEventListener('mousemove', e=>{
  G.mouse.x=e.clientX; G.mouse.y=e.clientY;
  const [wx,wy]=s2w(e.clientX,e.clientY); G.mouse.wx=wx; G.mouse.wy=wy;
  if (G.drag){
    G.drag.x=e.clientX; G.drag.y=e.clientY;
    if (Math.hypot(e.clientX-G.drag.sx, e.clientY-G.drag.sy) > 6) G.drag.moved = true;
  }
});
addEventListener('mouseup', e=>{
  if (G.paused || !G.started) return;
  if (!G.drag) return;
  const d = G.drag; G.drag = null;
  if (e.button!==0) return;
  const to = slotUnder(e.clientX, e.clientY);
  if (d.moved && to>=0 && to!==d.from){ cmd({a:'swap', i:d.from, j:to}); return; }
  if (d.moved) return;                    // dragged off into space — do nothing
  const [wx,wy]=s2w(e.clientX,e.clientY);
  if (G.shopOpen) cmd({a:'sell', slot:d.from});   // shop open = the slots are sell buttons
  else cmd({a:'use', slot:d.from, x:wx, y:wy});
});
cv.addEventListener('mousedown', e=>{
  if (!G.started || G.paused) return;
  const [wx,wy]=s2w(e.clientX,e.clientY);
  if (e.button===2){
    // right click is plain move — unless you clicked squarely on something
    G.aMode=false;
    const u = entUnder(e.clientX, e.clientY);
    if (u && attackable(u) && u.i!==(ownHeroView(G.view)||{}).i) return issue({a:'attack', id:u.i});
    issue({a:'move', x:wx, y:wy});
  } else if (e.button===0){
    // HUD hit tests
    const mx=e.clientX, my=e.clientY;
    for (const b of G.hud.ab)
      if (mx>=b.x&&mx<=b.x+b.w&&my>=b.y&&my<=b.y+b.h){ cmd({a:'skill', s:b.i}); return; }
    // pressing an item slot begins a drag; a press without movement is still a click
    for (const b of G.hud.items)
      if (mx>=b.x&&mx<=b.x+b.w&&my>=b.y&&my<=b.y+b.h){
        G.drag = {from:b.i, x:mx, y:my, sx:mx, sy:my, moved:false};
        return;
      }
    if (G.aMode){
      G.aMode=false;
      // SMART: the attack click takes whatever is closest to the cursor.
      // LEGACY: it is a plain attack-move and the hero picks the closest thing to itself.
      if (G.smart){
        const t = pickTarget(e.clientX, e.clientY, 420);
        if (t) return issue({a:'attack', id:t.i, au:1});
      }
      issue({a:'amove', x:wx, y:wy, sm:0});
    }
  }
});
export function issue(c){ c.at=G.time; cmd(c); }
export function dbg(w){ cmd({a:'dbg', w:w}); addToast('debug: '+w); }

addEventListener('keydown', e=>{
  if (!G.started){ return; }
  if (e.target && (e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT'||
                   e.target.tagName==='SELECT')) return;
  // the dev sandbox owns its own keys — never cast a spell into it
  if (e.target && e.target.closest && e.target.closest('#devpanel')) return;
  const k = e.key.toLowerCase();
  if (k==='p'){ e.preventDefault(); G.paused=!G.paused; addToast(G.paused?'Paused':'Resumed'); return; }
  if (G.paused) return;
  const abKeys = {q:0, w:1, e:2, r:3};
  if (k in abKeys){
    if (e.ctrlKey) return;                    // never fight browser shortcuts like Ctrl+W
    e.preventDefault();
    if (e.shiftKey) cmd({a:'skill', s:abKeys[k]});
    else cmd({a:'cast', s:abKeys[k], x:G.mouse.wx, y:G.mouse.wy});
    return;
  }
  if (k>='1' && k<='6'){ cmd({a:'use', slot:+k-1, x:G.mouse.wx, y:G.mouse.wy}); return; }
  if (k==='a'){ G.aMode=true; return; }
  if (k==='s'){ issue({a:'stop'}); G.aMode=false; return; }
  if (k==='h'){ issue({a:'hold'}); return; }
  if (k==='b'){ toggleShop(); return; }
  if (k==='m'){ addToast(toggleSfxMute() ? 'Sound muted' : 'Sound on'); return; }
  if (k===' '){ e.preventDefault(); const o=ownHeroView(G.view); if(o) G.cam.x=o.x; return; }
  if (e.key==='F1'){ e.preventDefault(); document.getElementById('help').classList.toggle('hide'); return; }
  if (e.key==='F3'){ e.preventDefault();
    G.debugOpen=!G.debugOpen;
    document.getElementById('debug').classList.toggle('hide', !G.debugOpen); return; }
  if (e.key==='F2'){ e.preventDefault(); G.smart=!G.smart;
    addToast('Attack click: '+(G.smart?'SMART — takes the unit nearest your cursor':'LEGACY — plain attack-move')); return; }
  if (k==='escape'){ G.aMode=false; toggleShop(false); return; }
});

