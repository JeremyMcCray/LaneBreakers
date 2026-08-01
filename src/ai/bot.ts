// @ts-nocheck
import { HEROES, HERO_IDS } from '../data/heroes';
import { ITEMS } from '../data/items';
import { TOWER_X, BASE_X, LANE_Y, ULT_REQ, dist, clamp, armorMult } from '../data/world';
import { canCast, castAbility, buyItem, useItem, nearestFoe, foesOf } from '../sim/engine';

/* ============================== BOT AI ============================= */
/* Every build saves for the Ascendant Scepter once its core is online — the
   per-hero upgrade is close to a seventh ability, so the bots want it too. */
export const BOT_BUILD = {
  vex:  ['boots','blade','quick','fang','scepter','plate'],
  ilva: ['boots','arc','blade','vit','scepter','fang'],
  gruk: ['boots','vit','blade','plate','scepter','quick'],
  brann:['boots','vit','blade','scepter','plate','quick'],
  sable:['boots','blade','quick','fang','scepter','arc'],
  vhal: ['boots','blade','arc','sunder','scepter','orb'],   // Symbiosis turns her damage into the brood's
  ash:  ['boots','arc','orb','scepter','vit','wither'],     // pure ability damage now — embers do the work
  mara: ['boots','vit','blade','titan','scepter','quick'],
  orrin:['boots','arc','blade','orb','scepter','quick'],
  nix:  ['boots','blade','quick','fang','scepter','reaver'],
  thorne:['boots','vit','blade','plate','scepter','quick'],
  krell:['boots','arc','orb','scepter','blade','quick'],
  shiv: ['boots','quell','blade','quick','scepter','vit'],
  svaar:['boots','vit','blade','cleaver','scepter','quick'],
  liora:['boots','arc','vit','orb','scepter','quick'],
  drex: ['boots','arc','orb','scepter','vit','quick'],
  ronin:['boots','blade','quick','fang','scepter','reaver'],
  zaal: ['boots','arc','orb','scepter','vit','quick'],
  jarak:['boots','blade','quick','fang','scepter','plate'],
  stryg:['boots','quell','blade','quick','scepter','fang'],
  vosk: ['boots','arc','orb','scepter','vit','quick'],
  dorn: ['boots','vit','blade','plate','scepter','quick'],
  timber:['boots','vit','arc','plate','scepter','orb'],
  drift: ['boots','blade','quick','fang','scepter','reaver']
};
export const BOT_SKILL_DEFAULT = [0,1,2,0,0,3,0,1,1,3,1,2];
export const BOT_SKILL = {};
for (const id of HERO_IDS) BOT_SKILL[id] = BOT_SKILL_DEFAULT;
export function botThink(S,p,dt){
  const e=p.hero; if (S.over) return;
  p.botT = (p.botT||0) - dt;
  // ---- skill points
  while (p.points>0){
    const spent = p.sk.reduce((a,b)=>a+b,0);
    const order = BOT_SKILL[p.heroId];
    let i = order[Math.min(spent, order.length-1)];
    const A = HEROES[p.heroId].abilities[i];
    const max = A.ult?3:4;
    if (p.sk[i]>=max || (A.ult && p.lvl<ULT_REQ[p.sk[i]])){
      let alt=-1;
      for (let j=0;j<4;j++){
        const B=HEROES[p.heroId].abilities[j];
        if (p.sk[j] < (B.ult?3:4) && (!B.ult || p.lvl>=ULT_REQ[p.sk[j]])){ alt=j; break; }
      }
      if (alt<0) break; i=alt;
    }
    p.sk[i]++; p.points--;
  }
  // ---- shopping
  const owned = new Set([...p.items.map(i=>i.id), ...p.pending.map(i=>i.id)]);
  if (e.hp/e.maxHp < .55 && !owned.has('salve') && p.gold>ITEMS.salve.cost+250) buyItem(S,p,'salve');
  for (const id of BOT_BUILD[p.heroId]){
    if (owned.has(id)) continue;
    if (p.gold >= ITEMS[id].cost) buyItem(S,p,id);
    break;
  }
  if (e.dead) return;
  if (p.botT>0) return;
  p.botT = .1;

  const foeP = foesOf(S, p.team).filter(q=>q.hero && !q.hero.dead)
                 .sort((a,b)=>dist(a.hero.x,a.hero.y,p.hero.x,p.hero.y)-dist(b.hero.x,b.hero.y,p.hero.x,p.hero.y))[0]
                 || foesOf(S, p.team)[0];
  const foe = foeP ? foeP.hero : null;
  const dir = p.team===0 ? 1 : -1;            // push direction
  const foeTower = TOWER_X[1-p.team];
  const myTower  = TOWER_X[p.team];
  const hpPct = e.hp/e.maxHp;
  const foeHp = foe && !foe.dead ? foe.hp/foe.maxHp : 1;
  const foeD  = foe && !foe.dead ? dist(e.x,e.y,foe.x,foe.y) : 9999;

  // heal
  const salveIdx = p.items.findIndex(i=>i.id==='salve');
  if (salveIdx>=0 && hpPct<.45 && e.salveT<=0 && foeD>700) useItem(S,p,salveIdx,e.x,e.y);
  const draIdx = p.items.findIndex(i=>i.id==='draught');
  if (draIdx>=0 && e.mp/e.maxMp<.3) useItem(S,p,draIdx,e.x,e.y);

  // retreat
  if (hpPct < .38 && !(foeHp<.22 && foeD<380)){
    p.order = {type:'move', x:BASE_X[p.team], y:LANE_Y};
    return;
  }
  // don't dive
  const limit = foeTower - dir*680;
  const tooDeep = dir>0 ? e.x > limit : e.x < limit;
  if (tooDeep && !(foeHp<.22 && foeD<380)){
    p.order = {type:'move', x: limit - dir*120, y: LANE_Y};
    return;
  }

  // Jarak's grip: axes at range, blade up close — never flip it mid-swing at random
  if (p.heroId==='jarak' && canCast(S,p,1)){
    const wantRanged = foeD > 460;
    if (!!e.stanceR !== wantRanged) castAbility(S,p,1,e.x,e.y);
  }

  // abilities
  const aggressive = foe && !foe.dead && foeD < 700 && (hpPct>.62 || foeHp<.35);
  if (aggressive && Math.random()<.35){
    for (let i=3;i>=0;i--){
      if (p.heroId==='jarak' && i===1) continue;   // handled above, it is a stance not a nuke
      // a deployed Chakram is already working — don't recall it out of reflex
      if (p.heroId==='timber' && i===3 &&
          S.zones.some(z=>(z.kind==='chakram'||z.kind==='chakret') && z.slot===p.slot)) continue;
      if (!canCast(S,p,i)) continue;
      const A = HEROES[p.heroId].abilities[i];
      const need = A.cast==='self' ? 260 : (A.range||400);
      if (foeD > need*0.8) continue;
      if (A.ult && foeHp>.65 && hpPct>.5 && Math.random()<.7) continue;
      let tx=foe.x, ty=foe.y;
      if (p.heroId==='vex' && i===0){ tx=foe.x-Math.cos(foe.facing)*20; ty=foe.y; }
      if (p.heroId==='ilva' && i===2){ tx=e.x-dir*300; ty=LANE_Y; }   // escape blink
      if (p.heroId==='ilva' && i===2 && hpPct>.5) continue;
      castAbility(S,p,i,tx,ty);
      break;
    }
  }

  // last hit / deny
  let lastHit=null, deny=null, creepNear=false, lowFoe=null;
  const swing = e.dmg;
  for (const o of S.ents){
    if (o.dead || o.type!=='creep' || o.neutral) continue;   // the classic bot stays out of the jungle
    const d = dist(e.x,e.y,o.x,o.y);
    const reach = e.range + o.r + e.r*0.4;
    const hit = swing*armorMult(o.armor);
    if (o.team!==p.team){
      if (d < reach+110) creepNear = true;
      // start the swing early — the attack lands after the wind-up, like a real last hit
      if (d < reach && o.hp <= hit*1.9) lastHit = o;
      // otherwise walk toward a creep that is about to become killable
      if (o.hp <= hit*3.5 && (!lowFoe || o.hp < lowFoe.hp)) lowFoe = o;
    } else {
      if (d < reach+20 && o.hp/o.maxHp < .48 && o.hp <= hit*1.9) deny = o;
    }
  }
  if (lastHit){ p.order={type:'attack', tid:lastHit.id}; return; }
  if (lowFoe && dist(e.x,e.y,lowFoe.x,lowFoe.y) > e.range+lowFoe.r){
    p.order={type:'move', x:lowFoe.x - dir*(e.range*0.7), y:lowFoe.y}; return;
  }
  if (deny && Math.random()<.85){ p.order={type:'attack', tid:deny.id}; return; }
  if (aggressive && foeD < e.range+50 && (foeHp<.42 || hpPct>.82)){
    p.order={type:'attack', tid:foe.id}; return;
  }
  // hold the creep line
  let anchor = (myTower+foeTower)/2;
  let allyFront=null;
  for (const o of S.ents){
    if (o.dead||o.type!=='creep'||o.team!==p.team) continue;
    if (!allyFront || (dir>0 ? o.x>allyFront.x : o.x<allyFront.x)) allyFront=o;
  }
  if (allyFront) anchor = allyFront.x - dir*70;
  const jitter = Math.sin(S.t*0.7)*45;
  const px = clamp(anchor, Math.min(myTower,foeTower)+120, Math.max(myTower,foeTower)-120);
  // if creeps are already in range but nothing is killable, hold position and wait for the last hit
  p.order = {type: creepNear ? 'move' : 'amove', x:px, y: LANE_Y + jitter};
}

/*<<<LB_AI_RUNTIME>>>*/
