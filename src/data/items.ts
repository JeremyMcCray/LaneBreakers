// @ts-nocheck
export const ITEMS = {
  /* ---------- consumables ---------- */
  salve:  {name:'Healing Salve', cost:110, cat:'consume', active:true, cd:0, consume:true,
           d:'ACTIVE: heal 400 over 8s — breaks on damage'},
  draught:{name:'Mana Draught',  cost:100, cat:'consume', active:true, cd:0, consume:true,
           d:'ACTIVE: restore 260 mana over 6s'},

  /* ---------- components ---------- */
  gaunt:  {name:'Gauntlet',      cost:180, cat:'comp', d:'+9 attack damage'},
  hide:   {name:'Hide Vest',     cost:200, cat:'comp', d:'+3 armor'},
  band:   {name:'Vitality Band', cost:250, cat:'comp', d:'+140 max HP'},
  crystal:{name:'Mana Crystal',  cost:250, cat:'comp', d:'+130 mana, +1 mana regen'},
  sandal: {name:'Sandals',       cost:250, cat:'comp', d:'+30 move speed'},
  talon:  {name:'Talon',         cost:260, cat:'comp', d:'+16% attack speed'},
  ember:  {name:'Ember Shard',   cost:300, cat:'comp', d:'+7% ability damage'},
  stone:  {name:'Whetstone',     cost:150, cat:'comp', d:'+14 damage to creeps'},
  buckler:{name:'Buckler',       cost:250, cat:'comp', d:'60% chance to block 10 damage from an attack'},

  /* ---------- attack ---------- */
  quell:  {name:'Quelling Blade', cat:'attack', from:['stone','gaunt'],   recipe:120,
           d:'+9 damage, +40 damage to creeps (+20 if ranged)'},
  blade:  {name:'Ravager Blade',  cat:'attack', from:['gaunt','gaunt'],   recipe:240,
           d:'+28 attack damage'},
  quick:  {name:'Quickblade',     cat:'attack', from:['talon','talon'],   recipe:480,
           d:'+60% attack speed'},
  fang:   {name:'Vampiric Fang',  cat:'attack', from:['gaunt','band'],    recipe:470,
           d:'+14 damage, +140 HP, 28% lifesteal'},
  frostb: {name:'Frostbrand',     cat:'attack', from:['crystal','gaunt'], recipe:570,
           d:'+9 damage, +130 mana. Attacks slow by 20% for 1.5s'},
  reap:   {name:"Reaper's Sigil", cat:'attack', from:['gaunt','hide'],    recipe:600,
           d:'+12 damage, +3 armor. Your ATTACKS cut enemy healing and regen by 55% for 5s'},
  sunder: {name:'Sunder Axe',     cat:'attack', from:['blade','gaunt'],   recipe:420,
           d:'+42 damage. Attacks shred 5 armor for 5s'},
  reaver: {name:"Reaver's Edge",  cat:'attack', from:['blade','talon'],   recipe:640,
           d:'+40 damage, +16% attack speed, 25% chance to crit for 190%'},
  cleaver:{name:'Battle Cleaver',  cat:'attack', from:['blade','gaunt'],   recipe:520,
           d:'+32 damage. MELEE: attacks splash 22% damage in a short arc. Ranged heroes get only the damage'},
  bolt:   {name:'Lightning Strike', cat:'attack', from:['gaunt','talon'],  recipe:660,
           d:'+9 damage, +16% attack speed. Your attacks have a 30% chance to call a lightning strike that bounces between up to 4 enemies, dealing 30% of your attack damage to each'},

  /* ---------- defense ---------- */
  stout:  {name:'Stout Shield',  cat:'defense', from:['buckler','hide'], recipe:100,
           d:'60% chance to block 24 damage from an attack, +3 armor'},
  vit:    {name:'Ironheart',     cat:'defense', from:['band','band'],    recipe:250,
           d:'+300 max HP, +6 HP regen'},
  plate:  {name:'Bramble Plate', cat:'defense', from:['hide','hide'],    recipe:500,
           d:'+8 armor, reflects 25% of melee damage'},
  idol:   {name:'Guardian Idol', cat:'defense', from:['band','hide'],    recipe:450, active:true, cd:25,
           d:'+140 HP, +3 armor. ACTIVE: 260 shield for 3s (25s)'},
  titan:  {name:"Titan's Heart", cat:'defense', from:['vit','band'],     recipe:500,
           d:'+560 max HP, +10 HP regen'},

  /* ---------- magic ---------- */
  arc:    {name:'Arcane Sigil',   cat:'magic', from:['crystal','ember'], recipe:230,
           d:'+180 mana, +2.5 mana regen, -12% cooldowns, +7% ability damage'},
  bomb:   {name:'Arcane Bomb',    cat:'magic', from:['ember','crystal'], recipe:900, active:true, cd:24,
           d:'+14% ability damage, +130 mana. ACTIVE: 320 damage in a 300 radius (24s)'},
  orb:    {name:"Sorcerer's Orb", cat:'magic', from:['arc','ember'],     recipe:470,
           d:'+300 mana, +4 mana regen, -18% cooldowns, +22% ability damage'},
  wither: {name:'Withering Rod',  cat:'magic', from:['ember','hide'],    recipe:550,
           d:'+10% ability damage, +3 armor. Your ABILITIES cut enemy healing and regen by 65% for 6s'},
  weave:  {name:'Soulweave',      cat:'magic', from:['ember','band'],    recipe:520,
           d:'+10% ability damage, +140 HP. SPELL LIFESTEAL: your abilities heal you for 18% of the damage they deal to enemies (one third as much from creeps)'},
  prism:  {name:'Occult Prism',   cat:'magic', from:['ember','ember'],   recipe:700,
           d:'+7% ability damage. SPELL CRIT: your damaging abilities have a 25% chance to deal 180% damage'},
  brand:  {name:'Soulfire Brand', cat:'magic', from:['ember','band'],    recipe:600,
           d:'+10% ability damage, +140 HP. Your abilities burn the target for extra damage equal to 4% of its max HP, at most once per second per target. Does not affect towers'},
  crown:  {name:'Archmagus Crown', cat:'magic', from:['orb','ember'],    recipe:300,
           d:'+380 mana, +5 mana regen, -24% cooldowns, +32% ability damage'},
  scepter:{name:'Ascendant Scepter', cat:'magic', from:['band','crystal','ember'], recipe:1400,
           d:'+220 HP, +220 mana, +2 mana regen, +16 damage, +10% ability damage. '+
             'UNIQUE: unlocks your hero’s SCEPTER upgrade — a different power for every hero. '+
             'Open the hero book or hover this in a match to read yours.'},

  /* ---------- utility ---------- */
  boots:  {name:'Swiftboots',  cat:'util', from:['sandal','sandal'],  recipe:0,
           d:'+65 move speed'},
  horn:   {name:'Warhorn',     cat:'util', from:['sandal','talon'],   recipe:640, active:true, cd:40,
           d:'+30 move speed, +16% attack speed. ACTIVE: +25% move and +40% attack speed for 5s (40s)'},
  phase:  {name:'Phase Charm', cat:'util', from:['sandal','crystal'], recipe:750, active:true, cd:20,
           d:'+30 move speed, +130 mana. ACTIVE: blink 360 toward the cursor, disjointing anything aimed at you (20s)'},
  nulls:  {name:'Nullstone',   cat:'util', from:['crystal','hide'],   recipe:700, active:true, cd:15,
           d:'+130 mana, +3 armor. ACTIVE: for 0.3s every spell that hits you is eaten whole (15s)'},
  purge:  {name:'Purifier',    cat:'util', from:['band','crystal'],   recipe:500, active:true, cd:20,
           d:'+140 HP, +130 mana. ACTIVE: strips every debuff off you — stun, root, silence, slow, poison (20s)'}
};
/* an upgrade costs its recipe plus everything it is built from */
(function priceItems(){
  const calc = id => {
    const it = ITEMS[id];
    if (it.cost!==undefined) return it.cost;
    let c = it.recipe||0;
    for (const f of it.from) c += calc(f);
    it.cost = c;
    return c;
  };
  for (const id in ITEMS) calc(id);
})();
export const ITEM_CATS = [['consume','Consumables'],['comp','Components'],['attack','Attack'],
                   ['defense','Defense'],['magic','Magic'],['util','Utility']];
export const CAT_COL = {consume:'#6ef0a0', comp:'#8d9cb8', attack:'#ff8a6a',
                 defense:'#7fc4ff', magic:'#b78cff', util:'#ffd166'};
export const ITEM_IDS = Object.keys(ITEMS);
export const ITEM_SLOTS = 6;

export function itemStats(items){
  const s = {ms:0, dmg:0, hp:0, hpr:0, mp:0, mpr:0, cdr:0, arm:0, thorns:0, ls:0, sls:0, as:0,
             crit:0, chill:0, amp:0, quell:0, block:0, hcut:0, hcutM:0, shred:0, cleave:0, bolt:0,
             scrit:0, mburn:0};
  for (const it of items){
    switch(it.id){
      /* components */
      case 'gaunt':   s.dmg+=9; break;
      case 'hide':    s.arm+=3; break;
      case 'band':    s.hp+=140; break;
      case 'crystal': s.mp+=130; s.mpr+=1; break;
      case 'sandal':  s.ms+=30; break;
      case 'talon':   s.as+=16; break;
      case 'ember':   s.amp+=.07; break;
      case 'stone':   s.quell=Math.max(s.quell,14); break;
      case 'buckler': s.block+=10; break;
      /* attack */
      case 'quell':   s.dmg+=9; s.quell=Math.max(s.quell,40); break;
      case 'blade':   s.dmg+=28; break;
      case 'quick':   s.as+=60; break;
      case 'fang':    s.dmg+=14; s.hp+=140; s.ls+=.28; break;
      case 'frostb':  s.dmg+=9; s.mp+=130; s.chill=1; break;
      case 'reap':    s.dmg+=12; s.arm+=3; s.hcut=1; break;
      case 'sunder':  s.dmg+=42; s.shred=1; break;
      case 'cleaver': s.dmg+=32; s.cleave=Math.max(s.cleave,.22); break;
      case 'reaver':  s.dmg+=40; s.as+=16; s.crit+=.25; break;
      case 'bolt':    s.dmg+=9; s.as+=16; s.bolt=Math.max(s.bolt,.30); break;
      /* defense */
      case 'stout':   s.block+=24; s.arm+=3; break;
      case 'vit':     s.hp+=300; s.hpr+=6; break;
      case 'plate':   s.arm+=8; s.thorns+=.25; break;
      case 'idol':    s.hp+=140; s.arm+=3; break;
      case 'titan':   s.hp+=560; s.hpr+=10; break;
      /* magic */
      case 'arc':     s.mp+=180; s.mpr+=2.5; s.cdr+=.12; s.amp+=.07; break;
      case 'bomb':    s.mp+=130; s.amp+=.14; break;
      case 'orb':     s.mp+=300; s.mpr+=4; s.cdr+=.18; s.amp+=.22; break;
      case 'wither':  s.amp+=.10; s.arm+=3; s.hcutM=1; break;
      case 'weave':   s.amp+=.10; s.hp+=140; s.sls+=.18; break;
      case 'prism':   s.amp+=.07; s.scrit=Math.max(s.scrit,.25); break;
      case 'brand':   s.amp+=.10; s.hp+=140; s.mburn=Math.max(s.mburn,.04); break;
      case 'crown':   s.mp+=380; s.mpr+=5; s.cdr+=.24; s.amp+=.32; break;
      case 'scepter': s.hp+=220; s.mp+=220; s.mpr+=2; s.dmg+=16; s.amp+=.10; break;
      /* utility */
      case 'boots':   s.ms+=65; break;
      case 'horn':    s.ms+=30; s.as+=16; break;
      case 'phase':   s.ms+=30; s.mp+=130; break;
      case 'nulls':   s.mp+=130; s.arm+=3; break;
      case 'purge':   s.hp+=140; s.mp+=130; break;
    }
  }
  return s;
}
