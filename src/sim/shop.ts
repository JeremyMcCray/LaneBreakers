// @ts-nocheck
import {
  BUY_DELAY, SELL_FULL, clamp, clampToLane, dist
} from '../data/world';
import { ITEMS, ITEM_SLOTS } from '../data/items';
import { disjoint } from './combat';
import { fx } from './create';
import { logEvent, updateHeroStats } from './stats';
import { aoe } from './zones';

export function buyPlan(p, id){
  const it = ITEMS[id];
  if (!it) return null;
  if (!it.from) return {cost: it.cost, use: [], full: it.cost};
  const pool = (p.items||[]).map(x=>({id:x.id, used:false}));
  // pieces already promised to a purchase in transit cannot be spent twice
  for (const q of (p.pending||[])) for (const cid of (q.use||[])){
    const h = pool.find(x=>!x.used && x.id===cid); if (h) h.used = true;
  }
  let cost = it.recipe||0;
  const use = [];
  for (const need of it.from){
    const have = pool.find(x=>!x.used && x.id===need);
    if (have){ have.used = true; use.push(need); }
    else cost += ITEMS[need].cost;
  }
  return {cost: cost, use: use, full: it.cost};
}
export function buyItem(S,p,id){
  const it = ITEMS[id];
  if (!it || S.over) return;
  const plan = buyPlan(p, id);
  if (p.gold < plan.cost) return;
  // the components you hand in give their slots back, so only the net matters
  if (p.items.length + p.pending.length - plan.use.length >= ITEM_SLOTS) return;
  p.gold -= plan.cost;
  p.pending.push({id:id, t:BUY_DELAY, use:plan.use});
  logEvent(S, p, 'item', id);
}
export function deliver(S,p,q){
  for (const cid of (q.use||[])){            // components are consumed on delivery
    const i = p.items.findIndex(x=>x.id===cid);
    if (i>=0) p.items.splice(i,1);
  }
  if (p.items.length >= ITEM_SLOTS){ p.gold += ITEMS[q.id].cost; return; }
  p.items.push({id:q.id, cd:0, bought:S.t});
  updateHeroStats(S,p);
  if (p.hero) fx(S,{t:'deliver', x:p.hero.x, y:p.hero.y, id:q.id, team:p.team});
}
/* Full refund if you are still inside the buyback window, 60% after that. */
export function sellValue(S,p,slot){
  const it = p.items[slot]; if (!it) return 0;
  const def = ITEMS[it.id]; if (!def) return 0;
  const fresh = (S.t - (it.bought||0)) <= SELL_FULL;
  return Math.round(def.cost * (fresh ? 1 : 0.6));
}
export function sellItem(S,p,slot){
  const it = p.items[slot];
  if (!it || S.over) return;
  const refund = sellValue(S,p,slot);
  p.items.splice(slot,1);
  p.gold += refund;
  updateHeroStats(S,p);
  if (p.hero) fx(S,{t:'sell', x:p.hero.x, y:p.hero.y, v:refund, team:p.team});
}
/* Drag an item onto another slot to reorder your inventory. Dropping past the
   end of the list just puts it last. */
export function moveItem(S,p,i,j){
  const n = p.items.length;
  if (i<0 || i>=n) return;
  if (j<0 || j>=ITEM_SLOTS) return;
  const k = Math.min(j, n-1);
  if (i===k) return;
  const [it] = p.items.splice(i,1);
  p.items.splice(k,0,it);
  updateHeroStats(S,p);
}
export function useItem(S,p,slot,tx,ty){
  const it = p.items[slot]; if (!it) return;
  const def = ITEMS[it.id]; if (!def || !def.active) return;
  const e = p.hero; if (!e || e.dead) return;
  // the Purifier is the one thing you can still reach for while stunned — that is the point of it
  if (e.stun>0 && it.id!=='purge') return;
  if (it.cd>0) return;
  if (it.id==='phase'){
    if (e.rootT>0) return;
    const d = dist(e.x,e.y,tx,ty) || 1;
    const r = Math.min(360, d);
    const ox=e.x, oy=e.y;
    e.x += (tx-e.x)/d*r; e.y += (ty-e.y)/d*r; clampToLane(e);
    disjoint(S, e);
    fx(S,{t:'dash', x:ox, y:oy, x2:e.x, y2:e.y, col:'#c9a6ff'});
    it.cd = def.cd;
  } else if (it.id==='salve'){
    e.salveT = 8; p.items.splice(slot,1); updateHeroStats(S,p);
  } else if (it.id==='draught'){
    e.draughtT = 6; p.items.splice(slot,1); updateHeroStats(S,p);
  } else if (it.id==='idol'){
    e.shield = 260; e.shieldT = 3; e.shieldRef = 0;
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#8fe3ff'});
    it.cd = def.cd;
  } else if (it.id==='nulls'){
    e.csT = 0.3;
    fx(S,{t:'counter', x:e.x, y:e.y});
    it.cd = def.cd;
  } else if (it.id==='purge'){
    e.stun=0; e.rootT=0; e.silT=0;
    e.slowT=0; e.slowP=0;
    e.dotT=0; e.dotDps=0; e.dotTick=0;
    e.hcT=0; e.hcP=0; e.shredT=0; e.shredV=0; e.markT=0; e.markP=0;
    fx(S,{t:'purge', x:e.x, y:e.y});
    it.cd = def.cd;
  } else if (it.id==='bomb'){
    const d = dist(e.x,e.y,tx,ty); const R = 700;
    if (d > R){ tx = e.x + (tx-e.x)/d*R; ty = e.y + (ty-e.y)/d*R; }
    fx(S,{t:'blast', x:tx, y:ty, r:300, col:'#a9d8ff'});
    const prev = S.tag; S.tag = 'i:bomb';       // credited to the item, not to a spell
    aoe(S, e.team, tx, ty, 300, 320, e);
    S.tag = prev;
    it.cd = def.cd;
  } else if (it.id==='horn'){
    e.asT = 5; e.asP = Math.max(e.asP, 40);
    e.msT = 5; e.msP = Math.max(e.msP, .25);
    fx(S,{t:'buff', x:e.x, y:e.y, col:'#ffcc55'});
    it.cd = def.cd;
  }
}
