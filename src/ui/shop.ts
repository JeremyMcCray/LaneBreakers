// @ts-nocheck
import { ITEMS, ITEM_IDS, ITEM_CATS, CAT_COL } from '../data/items';
import { HEROES } from '../data/heroes';
import { buyPlan } from '../sim/engine';
import { G } from '../app/state';
import { cmd } from '../app/shell';
import { playSfx } from '../audio/sfx';

export const SHOP_HINT = 'Hover an item for details. Components on the left build into the upgrades on the right.';
export function shopInfo(id){
  const box = document.getElementById('shopInfo');
  if (!id){ box.innerHTML = '<span style="color:#4a5670">'+SHOP_HINT+'</span>'; return; }
  const it = ITEMS[id];
  const me = G.view ? G.view.ps[G.mySlot] : null;
  const plan = me ? buyPlan({items:me.items, pending:me.pend}, id) : {cost:it.cost};
  const price = plan.cost < it.cost
    ? '<b style="color:var(--acc)">'+plan.cost+'g</b> <span style="color:#4a5670">for you · '+it.cost+'g full</span>'
    : '<b style="color:var(--gold)">'+it.cost+'g</b>';
  let build = '';
  if (it.from)
    build = '<br><span style="color:#5a6885">↳ '+
            it.from.map(f=>ITEMS[f].name+' ('+ITEMS[f].cost+'g)').join(' + ')+
            ' + '+it.recipe+'g recipe</span>';
  const into = ITEM_IDS.filter(o=>(ITEMS[o].from||[]).indexOf(id)>=0);
  if (into.length)
    build += '<br><span style="color:#5a6885">↑ builds into '+into.map(o=>ITEMS[o].name).join(', ')+'</span>';
  // the Scepter is a different item for every hero — show what it does for YOURS
  let sc = '';
  if (id==='scepter' && me){
    const H = HEROES[me.hid];
    if (H && H.scepter)
      sc = '<br><b style="color:'+H.col+'">'+H.name+' — '+H.scepter.name+':</b> '+H.scepter.desc;
  }
  box.innerHTML = '<b style="color:'+CAT_COL[it.cat]+';font-size:13px">'+it.name+'</b>  '+price+
                  '<br>'+it.d+sc+build;
}
export function buildShopUI(){
  const board = document.getElementById('shopBoard');
  board.innerHTML='';
  for (const [cat, label] of ITEM_CATS){
    const ids = ITEM_IDS.filter(id=>ITEMS[id].cat===cat)
                        .sort((a,b)=>ITEMS[a].cost-ITEMS[b].cost);
    const col = document.createElement('div');
    const h = document.createElement('div');
    h.className='ch'; h.style.color = CAT_COL[cat]; h.textContent = label;
    col.appendChild(h);
    for (const id of ids){
      const it=ITEMS[id];
      const d=document.createElement('div');
      d.className='chip'; d.dataset.id=id;
      d.style.borderLeftColor = CAT_COL[cat];
      d.innerHTML = '<span class="cn">'+it.name+'</span><span class="cc">'+it.cost+'</span>';
      d.onclick = ()=>{ playSfx(d.classList.contains('poor') ? 'error' : 'buy'); cmd({a:'buy', id:id}); };
      d.onmouseenter = ()=> shopInfo(id);
      col.appendChild(d);
    }
    board.appendChild(col);
  }
  board.onmouseleave = ()=> shopInfo(null);
  shopInfo(null);
}
export function refreshShop(v){
  const me = v.ps[G.mySlot];
  document.getElementById('shopGold').textContent = me.gold+'g';
  const owned = new Set([...me.items.map(i=>i.id), ...me.pend.map(i=>i.id)]);
  const bag = {items:me.items, pending:me.pend};
  for (const el of document.querySelectorAll('#shopBoard .chip')){
    const id = el.dataset.id, it = ITEMS[id];
    const plan = buyPlan(bag, id);
    el.classList.toggle('poor', me.gold < plan.cost);
    el.classList.toggle('owned', owned.has(id) && !it.consume);
    el.classList.toggle('deal', plan.cost < it.cost);
    el.querySelector('.cc').textContent = plan.cost < it.cost ? plan.cost : it.cost;
  }
}
export function toggleShop(on){
  const was = G.shopOpen;
  G.shopOpen = on===undefined ? !G.shopOpen : on;
  document.getElementById('shop').classList.toggle('hide', !G.shopOpen);
  if (G.shopOpen && !was) playSfx('click');
  if (G.shopOpen && G.view) refreshShop(G.view);
}

