// @ts-nocheck
export const HEROES = {
vex:{
  id:'vex', name:'VEX', title:'The Bladedancer', col:'#8fe3ff', col2:'#2b6d8f',
  desc:'A melee duellist who closes gaps instantly and deletes wounded targets.',
  hp:620, hpg:95, mp:280, mpg:38, dmg:48, dmgg:5.0, arm:3, armg:.4,
  ms:335, range:135, bat:0.90, ranged:false,
  abilities:[
    {key:'Q', name:'Blink Slash', cast:'point', range:430, blink:true, mana:[60,60,60,60], cd:[9,8,7,6],
     desc:'Dash to the cursor, slashing all enemies on arrival for %d damage.',
     val:[90,150,210,270]},
    {key:'W', name:'Bladestorm', cast:'self', mana:[55,60,65,70], cd:[14,13,12,11],
     desc:'For 5s gain +%d% attack speed and 30% lifesteal.', val:[80,110,140,170]},
    {key:'E', name:'Riposte', cast:'self', mana:[50,50,50,50], cd:[16,14,12,10],
     desc:'Shield absorbing %d damage for 3s. Reflects 60% of what it absorbs.',
     val:[110,185,260,335]},
    {key:'R', name:'Execute', cast:'point', range:280, ult:true, mana:[150,175,200], cd:[55,45,35],
     desc:'Strike the nearest enemy for %d damage — doubled below 30% HP.',
     val:[300,460,620]}
  ]
},
ilva:{
  id:'ilva', name:'ILVA', title:'The Frostcaller', col:'#a9d8ff', col2:'#3b5fa8',
  desc:'A ranged control mage. Poke, slow, and lock the enemy down for the kill.',
  hp:540, hpg:80, mp:390, mpg:56, dmg:42, dmgg:4.2, arm:2, armg:.3,
  ms:318, range:570, bat:1.05, ranged:true, projSpeed:1250,
  abilities:[
    {key:'Q', name:'Frost Bolt', cast:'point', range:800, mana:[50,55,60,65], cd:[5,4.4,3.8,3.2],
     desc:'Launch a bolt dealing %d damage and slowing 40% for 2s.', val:[100,165,230,295]},
    {key:'W', name:'Rime Nova', cast:'self', mana:[70,75,80,85], cd:[12,11,10,9],
     desc:'Burst of ice around you: %d damage and 45% slow for 2.5s.', val:[80,130,180,230]},
    {key:'E', name:'Frost Step', cast:'point', range:460, blink:true, mana:[45,45,45,45], cd:[15,13,11,9],
     desc:'Blink to the cursor, leaving a frozen patch that slows 35% for 4s. Grants +%d% move speed for 2s.',
     val:[20,26,32,38]},
    {key:'R', name:'Absolute Zero', cast:'point', range:850, ult:true, mana:[175,200,225], cd:[65,55,45],
     desc:'After 0.65s, shatter a wide area for %d damage and a 1.4s stun.',
     val:[320,470,620]}
  ]
},
gruk:{
  id:'gruk', name:'GRUK', title:'The Stonewarden', col:'#ffcf8f', col2:'#8a5a2b',
  desc:'A durable bruiser with a long-range stun and a monstrous late-game ultimate.',
  hp:730, hpg:110, mp:260, mpg:34, dmg:50, dmgg:5.4, arm:4, armg:.5,
  ms:318, range:145, bat:1.10, ranged:false,
  abilities:[
    {key:'Q', name:'Boulder Toss', cast:'point', range:760, mana:[55,60,65,70], cd:[10,9,8,7],
     desc:'Hurl a boulder for %d damage and a 1.2s stun.', val:[110,170,230,290]},
    {key:'W', name:'Stone Skin', cast:'self', mana:[45,45,45,45], cd:[16,14,12,10],
     desc:'For 6s gain %d armor and regenerate 4% max HP per second.', val:[6,9,12,15]},
    {key:'E', name:'Quake', cast:'self', mana:[60,65,70,75], cd:[13,12,11,10],
     desc:'The ground shakes for 3s: %d damage per second and 35% slow nearby.',
     val:[45,75,105,135]},
    {key:'R', name:'Colossus', cast:'self', ult:true, mana:[150,175,200], cd:[80,70,60],
     desc:'For 12s gain %d max HP (healed), +40 attack damage and slow immunity.',
     val:[450,750,1050]}
  ]
},
brann:{
  id:'brann', name:'BRANN', title:'The Ironhook', col:'#ff9b6a', col2:'#8a3b1f',
  desc:'A grappler. Land the hook from across the lane and the fight is already decided.',
  hp:700, hpg:104, mp:270, mpg:36, dmg:50, dmgg:5.4, arm:3.5, armg:.45,
  ms:322, range:140, bat:1.05, ranged:false,
  abilities:[
    {key:'Q', name:'Iron Hook', cast:'point', range:920, mana:[60,65,70,75], cd:[11,10,9,8],
     desc:'Fire a hook that deals %d damage and drags the first enemy it hits to you.',
     val:[100,160,220,280]},
    {key:'W', name:'Rend', cast:'self', mana:[40,45,50,55], cd:[13,12,11,10],
     desc:'For 6s your attacks deal +%d bonus damage and slow the target by 25%.',
     val:[14,24,34,44]},
    {key:'E', name:'Bulwark', cast:'self', mana:[50,50,50,50], cd:[17,15,13,11],
     desc:'For 4s take %d% less damage and slow enemies within 260 by 30%.',
     val:[25,35,45,55]},
    {key:'R', name:'Terminus', cast:'self', ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Slam the ground for %d damage and a 1.5s stun in a wide radius.',
     val:[280,430,580]}
  ]
},
sable:{
  id:'sable', name:'SABLE', title:'The Deadeye', col:'#c9f06a', col2:'#5a7a26',
  desc:'The longest attack range in the game. Out-range, out-trade, execute from safety.',
  hp:530, hpg:78, mp:300, mpg:40, dmg:44, dmgg:4.8, arm:2, armg:.32,
  ms:325, range:640, bat:1.00, ranged:true, projSpeed:1500,
  abilities:[
    {key:'Q', name:'Piercing Shot', cast:'point', range:950, mana:[45,50,55,60], cd:[6,5.2,4.4,3.6],
     desc:'A bolt that pierces everything in its path for %d damage, losing 30% of its power with every target it passes through.',
     val:[90,150,210,270]},
    {key:'W', name:"Hunter's Mark", cast:'point', range:750, mana:[40,45,50,55], cd:[14,13,12,11],
     desc:'Mark the enemy nearest the cursor for 6s — they take +%d% damage from everything.',
     val:[15,20,25,30]},
    {key:'E', name:'Sidestep', cast:'point', range:400, blink:true, mana:[45,45,45,45], cd:[13,11,9,7],
     desc:'Roll a short distance and gain +%d% attack speed for 3s.', val:[50,70,90,110]},
    {key:'R', name:'Deadshot', cast:'point', range:1500, ult:true, mana:[125,150,175], cd:[50,42,34],
     desc:'A cross-lane shot dealing %d damage to the first thing it strikes.',
     val:[340,510,680]}
  ]
},
vhal:{
  id:'vhal', name:'VHAL', title:'The Plaguebinder', col:'#b78cff', col2:'#4b2f7a',
  desc:'A summoner who rots the lane. The swarm pushes the wave while he poisons from range.',
  hp:560, hpg:84, mp:360, mpg:52, dmg:43, dmgg:4.4, arm:2, armg:.34,
  ms:318, range:545, bat:1.05, ranged:true, projSpeed:1050,
  abilities:[
    {key:'Q', name:'Corrosive Bolt', cast:'point', range:820, mana:[45,50,55,60], cd:[5,4.5,4,3.5],
     desc:'A bolt dealing %d damage, then that much again as poison over 4s.',
     val:[70,115,160,205]},
    {key:'W', name:'Swarm', cast:'self', mana:[75,85,95,105], cd:[22,20,18,16],
     desc:'Summon %d spawnlings for 14s. They fight, push, and give the enemy no gold.',
     val:[2,3,4,5]},
    {key:'E', name:'Miasma', cast:'point', range:680, mana:[60,65,70,75], cd:[14,13,12,11],
     desc:'A cloud for 4s dealing %d damage per second and slowing by 30%.',
     val:[40,65,90,115]},
    {key:'R', name:'Contagion', cast:'point', range:780, ult:true, mana:[150,175,200], cd:[65,55,45],
     desc:'Detonate a plague for %d damage that infects everything within 330.',
     val:[300,450,600]}
  ]
},
ash:{
  id:'ash', name:'ASH', title:'The Emberlord', col:'#ffb347', col2:'#8a4a1f',
  desc:'A ranged pyromancer. Stack burns, own the ground with fire, finish with a meteor.',
  hp:550, hpg:82, mp:380, mpg:54, dmg:44, dmgg:4.5, arm:2, armg:.32,
  ms:320, range:560, bat:1.02, ranged:true, projSpeed:1150,
  abilities:[
    {key:'Q', name:'Fireball', cast:'point', range:820, mana:[50,55,60,65], cd:[6,5.4,4.8,4.2],
     desc:'Hurl a fireball for %d damage plus 40% of that again as burn over 3s.',
     val:[90,145,200,255]},
    {key:'W', name:'Cinder Shell', cast:'self', mana:[60,65,70,75], cd:[14,13,12,11],
     desc:'For 5s gain 4 armor and scorch nearby enemies for %d damage per second.',
     val:[30,50,70,90]},
    {key:'E', name:'Blazing Trail', cast:'point', range:440, blink:true, mana:[50,50,50,50], cd:[15,13,11,9],
     desc:'Blink to the cursor, leaving a firefield behind that burns for %d damage per second.',
     val:[35,55,75,95]},
    {key:'R', name:'Meteor', cast:'point', range:800, ult:true, mana:[160,185,210], cd:[70,60,50],
     desc:'After 0.65s a meteor crashes down for %d damage and ignites everything hit.',
     val:[320,480,640]}
  ]
},
mara:{
  id:'mara', name:'MARA', title:'The Dawnshield', col:'#ffe9a8', col2:'#8a7a2b',
  desc:'A holy bruiser who heals through every trade and grinds out long fights.',
  hp:690, hpg:102, mp:300, mpg:42, dmg:49, dmgg:5.1, arm:4, armg:.45,
  ms:325, range:140, bat:1.00, ranged:false,
  abilities:[
    {key:'Q', name:'Holy Smite', cast:'point', range:620, mana:[50,55,60,65], cd:[8,7,6,5],
     desc:'Smite the enemy nearest the cursor for %d damage, healing for 60% of the damage dealt.',
     val:[90,150,210,270]},
    {key:'W', name:'Consecration', cast:'point', range:500, mana:[65,70,75,80], cd:[15,14,13,12],
     desc:'Sanctify the ground for 4s: enemies take %d damage per second and are slowed 20%, while Mara heals inside it.',
     val:[35,55,75,95]},
    {key:'E', name:'Aegis', cast:'self', mana:[50,50,50,50], cd:[16,14,12,10],
     desc:'Shield absorbing %d damage for 3s. Purges slows and grants brief move speed.',
     val:[120,200,280,360]},
    {key:'R', name:'Judgement', cast:'self', ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Slam a wide area for %d damage and a 1.1s stun, healing Mara 70 HP per enemy struck.',
     val:[280,430,580]}
  ]
},
orrin:{
  id:'orrin', name:'ORRIN', title:'The Siegewright', col:'#e0c477', col2:'#6b5420',
  desc:'A siege engineer. Empower the wave, out-push the lane, and take the tower instead of the kills.',
  hp:600, hpg:88, mp:340, mpg:48, dmg:46, dmgg:4.6, arm:3, armg:.36,
  ms:320, range:575, bat:1.05, ranged:true, projSpeed:1200,
  abilities:[
    {key:'Q', name:'Siege Bolt', cast:'point', range:800, mana:[50,55,60,65], cd:[7,6.3,5.6,4.9],
     desc:'A heavy bolt dealing %d damage — and 80% more to towers.', val:[95,150,205,260]},
    {key:'W', name:'War Banner', cast:'point', range:520, mana:[60,65,70,75], cd:[20,18,16,14],
     desc:'Plant a banner for 10s. Allied creeps near it gain +%d damage, +4 armor and +40 move speed.',
     val:[10,16,22,28]},
    {key:'E', name:'Deploy Turret', cast:'point', range:460, mana:[70,75,80,85], cd:[22,20,18,16],
     desc:'Build an immobile turret for 14s that shoots enemies for %d damage.', val:[26,38,50,62]},
    {key:'R', name:'Warmarch', cast:'self', ult:true, mana:[150,175,200], cd:[80,70,60],
     desc:'For 15s every allied creep is healed to full and gains +%d damage, +6 armor and +60 move speed.',
     val:[24,40,56]}
  ]
},
nix:{
  id:'nix', name:'NIX', title:'The Mirrorborn', col:'#ff7fd0', col2:'#7a2b63',
  desc:'A trickster who fights beside copies of herself. Nothing your opponent sees is guaranteed to be real.',
  hp:620, hpg:92, mp:300, mpg:40, dmg:47, dmgg:5.0, arm:3, armg:.38,
  ms:330, range:145, bat:0.95, ranged:false,
  abilities:[
    {key:'Q', name:'Mirror Image', cast:'self', mana:[60,70,80,90], cd:[16,14,12,10],
     desc:'Create 2 illusions for 16s that deal %d% of your damage and attack whatever you attack. Towers tear them apart.',
     val:[26,34,42,50]},
    {key:'W', name:'Displace', cast:'point', range:750, blink:true, mana:[40,40,40,40], cd:[10,9,8,7],
     desc:'Swap places with the illusion nearest the cursor — or blink 300 if you have none. +%d% move speed for 2s.',
     val:[20,26,32,38]},
    {key:'E', name:'Phantom Strike', cast:'point', range:500, blink:true, mana:[50,55,60,65], cd:[12,11,10,9],
     desc:'Blink to the cursor and slash for %d damage. Your illusions blink to you and gain 60% attack speed.',
     val:[90,145,200,255]},
    {key:'R', name:'Grand Illusion', cast:'self', ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Create 3 superior illusions for 20s dealing %d% of your damage, and gain 25% move speed for 6s.',
     val:[60,75,90]}
  ]
},
thorne:{
  id:'thorne', name:'THORNE', title:'The Bramblewarden', col:'#7fdc6a', col2:'#2f6b2a',
  desc:'A zoner who makes half the lane unsafe. Set the ground against your opponent and punish every step.',
  hp:700, hpg:104, mp:320, mpg:44, dmg:48, dmgg:5.0, arm:4, armg:.48,
  ms:320, range:150, bat:1.05, ranged:false,
  abilities:[
    {key:'Q', name:'Bramble Trap', cast:'point', range:620, mana:[50,55,60,65], cd:[11,10,9,8],
     desc:'Plant a hidden-in-plain-sight trap for 45s. The first enemy hero to step near takes %d damage and is rooted for 1.5s. Three can be armed at once.',
     val:[110,175,240,305]},
    {key:'W', name:'Barbed Hide', cast:'self', mana:[45,50,55,60], cd:[15,14,13,12],
     desc:'For 6s anything that attacks you takes %d damage and is slowed 25%.',
     val:[30,50,70,90]},
    {key:'E', name:'Overgrowth', cast:'point', range:520, mana:[60,65,70,75], cd:[14,13,12,11],
     desc:'A thicket for 5s dealing %d damage per second and slowing by 45%.',
     val:[40,65,90,115]},
    {key:'R', name:'Verdant Prison', cast:'point', range:700, ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Roots everything within 330 for 2s and deals %d damage over the duration.',
     val:[300,450,600]}
  ]
},
krell:{
  id:'krell', name:'KRELL', title:'The Voidsinger', col:'#6ce0e8', col2:'#1f6b72',
  desc:'A caster who shuts other casters down. Silence the answer, drain the mana, delete the reply.',
  hp:545, hpg:80, mp:400, mpg:58, dmg:42, dmgg:4.3, arm:2, armg:.30,
  ms:318, range:560, bat:1.05, ranged:true, projSpeed:1200,
  abilities:[
    {key:'Q', name:'Void Bolt', cast:'point', range:820, mana:[50,55,60,65], cd:[7,6.2,5.4,4.6],
     desc:'A bolt dealing %d damage and silencing for 2s.', val:[95,155,215,275]},
    {key:'W', name:'Mana Rift', cast:'self', mana:[60,70,80,90], cd:[16,15,14,13],
     desc:'Burn up to %d mana from every enemy within 360 and deal that much damage. Krell keeps half the mana.',
     val:[90,140,190,240]},
    {key:'E', name:'Nullify', cast:'point', range:640, mana:[55,60,65,70], cd:[15,14,13,12],
     desc:'Strip every buff from the enemy nearest the cursor and deal %d damage.',
     val:[100,160,220,280]},
    {key:'R', name:'Silence the Song', cast:'point', range:700, ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'%d damage in a 380 radius and a 3s silence.', val:[290,440,590]}
  ]
},
shiv:{
  id:'shiv', name:'SHIV', title:'The Bleeder', col:'#ff6b6b', col2:'#7a1f2b',
  desc:'A knife fighter who wins on bleed. Open the wound, keep it open, then finish anything that limps away.',
  hp:620, hpg:94, mp:290, mpg:40, dmg:49, dmgg:5.1, arm:3, armg:.40,
  ms:335, range:145, bat:0.92, ranged:false,
  abilities:[
    {key:'Q', name:'Serrated Knives', cast:'point', range:760, charges:3, mana:[35,40,45,50], cd:[7,6,5,4],
     desc:'Throw a knife for %d damage and a stacking 5s bleed. Holds three charges — at FULL RAGE you throw all three at once.',
     val:[60,100,140,180]},
    {key:'W', name:'Bloodletting', cast:'self', mana:[40,45,50,55], cd:[14,13,12,11],
     desc:'PASSIVE: %d% of the damage you take is deferred and bleeds off you slowly instead of landing at once. ACTIVE: clear half of whatever is still pending — all of it at FULL RAGE.',
     val:[22,30,38,46]},
    {key:'E', name:'Slice and Dice', cast:'point', range:480, blink:true, mana:[50,55,60,65], cd:[12,11,10,9],
     desc:'Dash through, cutting everyone on the way for %d damage. At FULL RAGE a ghost of you repeats the cut a second later — every creep it catches shaves 1s off this cooldown, 3s for a hero.',
     val:[80,130,180,230]},
    {key:'R', name:'Killing Blow', cast:'point', range:640, ult:true, mana:[100,125,150], cd:[50,42,34],
     desc:'Wind up for 0.55s, then dash. The first enemy in the path takes %d damage, tripled below 35% HP. The wind-up is visible, so it can be dodged.',
     val:[170,265,360]}
  ]
},
svaar:{
  id:'svaar', name:'SVAAR', title:'The Rogue Knight', col:'#8fb8ff', col2:'#2b4a8a',
  desc:'A giant with a giant sword. Everything in the arc dies at once, and the ultimate turns every swing into a wrecking ball.',
  hp:730, hpg:112, mp:280, mpg:38, dmg:52, dmgg:5.6, arm:4, armg:.50,
  ms:322, range:150, bat:1.10, ranged:false,
  abilities:[
    {key:'Q', name:'Storm Hammer', cast:'point', range:780, mana:[55,60,65,70], cd:[11,10,9,8],
     desc:'Hurl a warhammer for %d damage and a 1.4s stun.', val:[100,160,220,280]},
    {key:'W', name:'Warcry', cast:'self', mana:[45,50,55,60], cd:[18,16,14,12],
     desc:'You and every ally within 700 gain %d armor and 20% move speed for 8s.',
     val:[5,8,11,14]},
    {key:'E', name:'Great Cleave', passive:true, grants:'cleave', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: your attacks splash %d% of their damage to everything in a short arc.',
     val:[15,23,31,40]},
    {key:'R', name:"God's Strength", cast:'self', ult:true, mana:[125,150,175], cd:[80,70,60],
     desc:'For 20s your attack damage is increased by %d%.', val:[60,90,120]}
  ]
}};
export const HERO_IDS = Object.keys(HEROES);

