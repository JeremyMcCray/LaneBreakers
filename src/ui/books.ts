// @ts-nocheck
import { HEROES, HERO_IDS } from '../data/heroes';
import { ITEMS, ITEM_IDS, ITEM_CATS, CAT_COL } from '../data/items';
import { G } from '../app/state';

/* One ability, written out at every rank so you can read a hero cold. */
export function abilityCard(A){
  const ranks = A.val.map((v,i)=>'<span class="rk">'+(i+1)+'</span> '+v).join('  ');
  const meta = A.passive ? 'passive'
    : (A.charges ? A.charges+' charges · ' : '') +
      'mana ' + A.mana.join('/') + ' · cd ' + A.cd.join('/') + 's' +
      (A.range ? ' · range '+A.range : '') + (A.blink ? ' · blink' : '');
  return '<div class="abrow">'+
    '<div class="abk">'+A.key+'</div>'+
    '<div class="abbody">'+
      '<div class="abname">'+A.name+(A.ult?' <span class="ult">ULTIMATE</span>':'')+'</div>'+
      '<div class="abmeta">'+meta+'</div>'+
      '<div class="abdesc">'+A.desc.replace('%d','<b>'+A.val[0]+'</b>')+'</div>'+
      '<div class="abranks">'+ranks+'</div>'+
    '</div></div>';
}
export function heroSheet(id){
  const h = HEROES[id];
  if (!h) return '';
  const st = [
    ['Health', h.hp+' +'+h.hpg+'/lvl'],
    ['Mana', h.mp+' +'+h.mpg+'/lvl'],
    ['Damage', h.dmg+' +'+h.dmgg+'/lvl'],
    ['Armor', h.arm+' +'+h.armg+'/lvl'],
    ['Move', h.ms],
    ['Attack', (h.ranged?'ranged ':'melee ')+h.range+' · '+h.bat+'s']
  ].map(([k,v])=>'<div class="hstat"><span>'+k+'</span><b>'+v+'</b></div>').join('');
  return '<div class="hsheet">'+
    '<div class="hshead">'+
      '<div class="hsname" style="color:'+h.col+'">'+h.name+'</div>'+
      '<div class="hstitle">'+h.title+'</div>'+
      '<div class="hsdesc">'+h.desc+'</div>'+
    '</div>'+
    '<div class="hstats">'+st+'</div>'+
    h.abilities.map(abilityCard).join('')+
  '</div>';
}
export function renderItemBook(){
  const box = document.getElementById('itemBody');
  if (!box) return;
  box.innerHTML = ITEM_CATS.map(([cat,label])=>{
    const ids = ITEM_IDS.filter(id=>ITEMS[id].cat===cat).sort((a,b)=>ITEMS[a].cost-ITEMS[b].cost);
    const rows = ids.map(id=>{
      const it = ITEMS[id];
      const from = it.from ? it.from.map(f=>ITEMS[f].name).join(' + ')+' + '+it.recipe+'g' : '—';
      const into = ITEM_IDS.filter(o=>(ITEMS[o].from||[]).indexOf(id)>=0)
                           .map(o=>ITEMS[o].name).join(', ') || '—';
      return '<tr><td><b style="color:'+CAT_COL[cat]+'">'+it.name+'</b></td>'+
             '<td style="color:var(--gold);text-align:right">'+it.cost+'g</td>'+
             '<td>'+it.d+'</td><td style="color:#5a6885">'+from+'</td>'+
             '<td style="color:#5a6885">'+into+'</td></tr>';
    }).join('');
    return '<h3 style="color:'+CAT_COL[cat]+'">'+label+'</h3>'+
      '<table class="stab"><tr><th>Item</th><th style="text-align:right">Cost</th>'+
      '<th>Effect</th><th>Builds from</th><th>Builds into</th></tr>'+rows+'</table>';
  }).join('');
}
export function renderHeroBook(sel){
  const list = document.getElementById('heroBookList');
  const body = document.getElementById('heroBookBody');
  if (!list) return;
  G.bookPick = sel || G.bookPick || HERO_IDS[0];
  list.innerHTML = HERO_IDS.map(id=>
    '<div class="bkrow'+(id===G.bookPick?' on':'')+'" style="border-left-color:'+HEROES[id].col+'" '+
    'onclick="renderHeroBook(\''+id+'\')">'+
    '<b style="color:'+HEROES[id].col+'">'+HEROES[id].name+'</b>'+
    '<span>'+HEROES[id].title.replace(/^The /,'')+'</span></div>').join('');
  body.innerHTML = heroSheet(G.bookPick);
}

