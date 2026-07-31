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
     desc:'Mark the enemy HERO nearest the cursor for 6s — they take +%d% damage from everything.',
     val:[15,20,25,30]},
    {key:'E', name:'Sidestep', cast:'point', range:400, blink:true, mana:[45,45,45,45], cd:[13,11,9,7],
     desc:'Roll a short distance and gain +%d% attack speed for 3s.', val:[50,70,90,110]},
    {key:'R', name:'Deadshot', cast:'point', range:1500, ult:true, mana:[125,150,175], cd:[50,42,34],
     desc:'A cross-lane shot dealing %d damage to the first thing it strikes.',
     val:[340,510,680]}
  ]
},
vhal:{
  id:'vhal', name:'VHAL', title:'The Broodmother', col:'#b78cff', col2:'#4b2f7a',
  desc:'She never fights alone. The brood is her damage, her wave clear and her body count — every spell she owns makes, moves, or feeds it.',
  hp:560, hpg:84, mp:360, mpg:52, dmg:43, dmgg:4.4, arm:2, armg:.34,
  ms:318, range:545, bat:1.05, ranged:true, projSpeed:1050,
  abilities:[
    {key:'Q', name:'Spawn Brood', cast:'self', mana:[70,75,80,85], cd:[16,15,14,13],
     desc:'Split off %d spawnlings for 20s. They fight, they push, and they pay the enemy nothing when they die.',
     val:[2,3,4,5]},
    {key:'W', name:'Unleash', cast:'point', range:800, mana:[55,60,65,70], cd:[13,12,11,10],
     desc:'The whole brood tears to the cursor at once, attacking %d% faster with 40% lifesteal for 5s. Everything they land on is slowed 30%.',
     val:[60,90,120,150]},
    {key:'E', name:'Symbiosis', passive:true, grants:'symbiosis', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: every spawnling is built out of Vhal herself, inheriting %d% of her attack damage and a quarter as much of her maximum health. While one still lives she gains 5 armor and 10 health regen.',
     val:[20,28,36,44]},
    {key:'R', name:'Hive Ascendant', cast:'self', ult:true, mana:[150,175,200], cd:[85,75,65],
     desc:'For 16s Vhal becomes a hive: a spawnling crawls out every 2s, the brood deals +%d% damage, and every enemy creep that dies within 550 of her gets back up on her side. Eight at once, no more.',
     val:[40,70,100]}
  ]
},
ash:{
  id:'ash', name:'ASH', title:'The Emberlord', col:'#ffb347', col2:'#8a4a1f',
  desc:'Nothing he throws kills on its own. He sets EMBERS on everything, lets them eat, and blows them out all at once — and anything that dies still burning passes the fire on.',
  hp:560, hpg:82, mp:380, mpg:54, dmg:44, dmgg:4.5, arm:2, armg:.32,
  ms:325, range:560, bat:1.02, ranged:true, projSpeed:1150,
  abilities:[
    {key:'Q', name:'Cinderbolt', cast:'point', range:820, charges:3, mana:[35,40,45,50], cd:[6,5.4,4.8,4.2],
     desc:'A bolt for %d damage that sets 2 EMBERS alight. Holds three charges — the whole hand primes a target instantly.',
     val:[55,90,125,160]},
    {key:'W', name:'Wildfire', passive:true, grants:'wildfire', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: your EMBERS stack six deep instead of three and each burns for %d damage per second. Anything that dies still burning throws its embers to the nearest enemy within 350.',
     val:[7,10,13,16]},
    {key:'E', name:'Conflagrate', cast:'point', range:700, mana:[60,65,70,75], cd:[11,10,9,8],
     desc:'Blow out every EMBER within 300 at once — each one consumed deals %d damage. Anything not yet burning catches 2 embers instead.',
     val:[32,50,68,86]},
    {key:'R', name:'Firestorm', cast:'point', range:800, ult:true, mana:[160,185,210], cd:[75,65,55],
     desc:'A storm rages over a 380 radius for 6s: %d damage per second, a fresh EMBER every half second, and while it burns no ember inside can go out.',
     val:[45,70,95]}
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
     desc:'Plant a banner for 10s. Allied creeps AND heroes near it gain +%d damage, +4 armor and +40 move speed.',
     val:[10,16,22,28]},
    {key:'E', name:'Deploy Turret', cast:'point', range:460, mana:[70,75,80,85], cd:[22,20,18,16],
     desc:'Build an immobile turret for 14s that shoots enemies for %d damage, plus 40% of his attack damage. Its health and armor scale with his.', val:[26,38,50,62]},
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
},
liora:{
  id:'liora', name:'LIORA', title:'The Lifebinder', col:'#8affd4', col2:'#1f7a5a',
  desc:'A radiant support who keeps her side standing through every trade. Deadliest with an ally to protect — every spell can also be turned on herself.',
  hp:560, hpg:84, mp:400, mpg:56, dmg:42, dmgg:4.3, arm:2.5, armg:.34,
  ms:322, range:560, bat:1.04, ranged:true, projSpeed:1150,
  abilities:[
    {key:'Q', name:'Searing Light', cast:'point', range:800, mana:[50,55,60,65], cd:[6,5.4,4.8,4.2],
     desc:'A lance of light dealing %d damage and slowing by 25% for 1.5s.', val:[100,160,220,280]},
    {key:'W', name:'Mending Wave', cast:'point', range:700, mana:[60,65,70,75], cd:[12,11,10,9],
     desc:'Heal the most wounded allied hero near the cursor for %d. With no ally in reach it mends Liora instead.',
     val:[120,190,260,330]},
    {key:'E', name:'Guardian Sigil', cast:'point', range:700, mana:[55,55,55,55], cd:[15,13.5,12,10.5],
     desc:'Shield the allied hero nearest the cursor (or yourself) for %d for 3s, granting 20% move speed.',
     val:[110,180,250,320]},
    {key:'R', name:'Sanctuary', cast:'point', range:600, ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Consecrate the ground for 5s: allied heroes inside heal %d per second and enemies inside are slowed 30%.',
     val:[90,130,170]}
  ]
},
drex:{
  id:'drex', name:'DREX', title:'The Demolitionist', col:'#ff7a3c', col2:'#7a3312',
  desc:'A ranged bomber who owns the ground he has already decided to blow up. Everything he does is telegraphed — and devastating.',
  hp:580, hpg:86, mp:360, mpg:50, dmg:44, dmgg:4.5, arm:2.5, armg:.34,
  ms:318, range:540, bat:1.06, ranged:true, projSpeed:1000,
  abilities:[
    {key:'Q', name:'Sticky Bomb', cast:'point', range:760, mana:[55,60,65,70], cd:[8,7.2,6.4,5.6],
     desc:'Lob a bomb that detonates after 0.9s for %d damage, slowing everything hit by 30%.',
     val:[110,175,240,305]},
    {key:'W', name:'Cluster Mine', cast:'point', range:600, mana:[45,50,55,60], cd:[13,12,11,10],
     desc:'Bury a mine for 40s. It arms in 1s and detonates on ANY enemy for %d damage and a 40% slow. Three can be armed at once.',
     val:[90,150,210,270]},
    {key:'E', name:'Blast Off', cast:'point', range:440, blink:true, mana:[50,50,50,50], cd:[14,12.5,11,9.5],
     desc:'Rocket-jump to the cursor — the launch blast deals %d damage to everything left behind.',
     val:[80,130,180,230]},
    {key:'R', name:'Carpet Bombing', cast:'point', range:900, ult:true, mana:[160,185,210], cd:[80,70,60],
     desc:'Call in four bombs that march from Drex toward the cursor, each detonating for %d damage.',
     val:[180,270,360]}
  ]
},
ronin:{
  id:'ronin', name:'RONIN', title:'The Maskbearer', col:'#ff9ec4', col2:'#7a2340',
  desc:'A masked blademaster. Spin through the spells that were meant to stop you, then take the fight apart one blink at a time.',
  hp:640, hpg:96, mp:270, mpg:34, dmg:50, dmgg:5.4, arm:3, armg:.42,
  ms:330, range:145, bat:0.95, ranged:false,
  abilities:[
    {key:'Q', name:'Bladefury', cast:'self', mana:[60,70,80,90], cd:[20,18,16,14],
     desc:'Whirl for 3s, dealing %d damage per second within 260. You cannot swing while spinning — but nothing magical can touch you.',
     val:[55,85,115,145]},
    {key:'W', name:'Healing Ward', cast:'point', range:600, mana:[70,75,80,85], cd:[26,24,22,20],
     desc:'Plant a fragile ward for 9s. Allied heroes within 340 of it heal %d health per second. It can be killed.',
     val:[20,30,40,50]},
    {key:'E', name:'Blade Dance', passive:true, grants:'crit', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: %d% of your attacks land as a critical strike for 190% damage.',
     val:[15,22,29,36]},
    {key:'R', name:'Omnislash', cast:'point', range:400, ult:true, mana:[150,175,200], cd:[70,60,50],
     desc:'Leap onto the enemy nearest the cursor and cut six times for %d each, blinking between everything within 420. Untouchable until the last strike lands.',
     val:[60,85,110]}
  ]
},
zaal:{
  id:'zaal', name:'ZAAL', title:'The Skyfather', col:'#9fd8ff', col2:'#2a4d7a',
  desc:'A storm with a temper. Nothing he throws can miss, and every spell he casts bleeds the whole lane a little.',
  hp:520, hpg:76, mp:430, mpg:60, dmg:40, dmgg:4.0, arm:2, armg:.28,
  ms:315, range:550, bat:1.10, ranged:true, projSpeed:1100,
  abilities:[
    {key:'Q', name:'Arc Lightning', cast:'point', range:800, mana:[40,45,50,55], cd:[5,4.5,4,3.5],
     desc:'A bolt that leaps between up to 5 enemies for %d damage, losing 22% of its bite with every jump.',
     val:[65,100,135,170]},
    {key:'W', name:'Lightning Bolt', cast:'point', range:850, mana:[75,85,95,105], cd:[10,9,8,7],
     desc:'The sky marks the ground for 0.5s, then a bolt lands for %d damage and a 0.7s stun in a 260 radius.',
     val:[130,205,280,355]},
    {key:'E', name:'Static Field', passive:true, grants:'static', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: every spell Zaal casts tears %d% of the CURRENT health out of every enemy within 700.',
     val:[4,5.5,7,8.5]},
    {key:'R', name:"Thundergod's Wrath", cast:'self', ult:true, mana:[175,200,225], cd:[95,85,75],
     desc:'Strike every enemy hero on the map for %d damage, wherever they are hiding.',
     val:[300,450,600]}
  ]
},
jarak:{
  id:'jarak', name:'JARAK', title:'The Frenzied', col:'#7be0a4', col2:'#1f6b45',
  desc:'A duellist who gets faster the longer he stays on one throat. Pick a target and never let go of it.',
  hp:650, hpg:98, mp:250, mpg:32, dmg:49, dmgg:5.3, arm:3, armg:.42,
  ms:330, range:150, bat:0.98, ranged:false,
  abilities:[
    {key:'Q', name:'Whirling Axes', cast:'point', range:700, mana:[50,55,60,65], cd:[11,10,9,8],
     desc:'Fling three axes in a spread, each dealing %d damage and slowing by 30% for 2s.',
     val:[80,125,170,215]},
    {key:'W', name:'Fervor', passive:true, grants:'fervor', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: every blow landed on the SAME target grants +%d% attack speed, stacking four times. Switch targets and it is gone.',
     val:[16,23,30,37]},
    {key:'E', name:"Berserker's Rage", cast:'self', mana:[45,50,55,60], cd:[18,16,14,12],
     desc:'For 8s gain %d armor and 20% move speed, and Fervor stacks twice as fast, up to eight.',
     val:[5,8,11,14]},
    {key:'R', name:'Battle Trance', cast:'self', ult:true, mana:[125,150,175], cd:[70,60,50],
     desc:'For 7s you and every ally within 700 gain +%d% attack speed and 30% lifesteal.',
     val:[70,100,130]}
  ]
},
stryg:{
  id:'stryg', name:'STRYG', title:'The Bloodhound', col:'#ff5f7a', col2:'#6b1226',
  desc:'A hunter who feeds on the lane itself. Every last hit puts him back on his feet, and nothing he has opened up can run away from him.',
  hp:600, hpg:92, mp:290, mpg:40, dmg:48, dmgg:5.1, arm:3, armg:.38,
  ms:340, range:145, bat:1.00, ranged:false,
  abilities:[
    {key:'Q', name:'Blood Rite', cast:'point', range:800, mana:[60,70,80,90], cd:[13,12,11,10],
     desc:'Sanctify the ground. After 1.2s it erupts for %d damage and silences enemy heroes for 3s.',
     val:[95,155,215,275]},
    {key:'W', name:'Bloodrage', cast:'self', mana:[30,35,40,45], cd:[12,11,10,9],
     desc:'For 8s everything you deal hits %d% harder — and everything you take hits 20% harder.',
     val:[25,35,45,55]},
    {key:'E', name:'Thirst', passive:true, grants:'thirst', mana:[0,0,0,0], cd:[0,0,0,0],
     desc:'Passive: every creep you last hit or deny restores %d health. A hero kill restores five times as much.',
     val:[30,45,60,75]},
    {key:'R', name:'Rupture', cast:'point', range:750, ult:true, mana:[125,150,175], cd:[65,55,45],
     desc:'The enemy hero nearest the cursor bleeds for 6s, taking %d pure damage for every 100 units they move. Standing still costs nothing.',
     val:[12,18,24]}
  ]
},
vosk:{
  id:'vosk', name:'VOSK', title:'The Tormented', col:'#c58aff', col2:'#4a2170',
  desc:'A walking siege engine. Everything near him is already dying — he only decides how fast.',
  hp:570, hpg:86, mp:400, mpg:56, dmg:43, dmgg:4.3, arm:2.5, armg:.32,
  ms:320, range:550, bat:1.05, ranged:true, projSpeed:1100,
  abilities:[
    {key:'Q', name:'Split Earth', cast:'point', range:800, mana:[60,70,80,90], cd:[13,12,11,10],
     desc:'The ground cracks after 0.55s for %d damage and a 1.4s stun in a 240 radius.',
     val:[100,160,220,280]},
    {key:'W', name:'Diabolic Edict', cast:'self', mana:[65,75,85,95], cd:[18,17,16,15],
     desc:'For 8s, sixteen explosions burst out of Vosk, each striking one enemy within 340 for %d damage.',
     val:[22,36,50,64]},
    {key:'E', name:'Lightning Storm', cast:'point', range:800, mana:[55,60,65,70], cd:[8,7,6,5],
     desc:'A storm bolt that leaps between up to 4 enemies for %d damage, slowing each by 50% for 1s.',
     val:[80,125,170,215]},
    {key:'R', name:'Pulse Nova', cast:'self', ult:true, mana:[150,175,200], cd:[80,70,60],
     desc:'For 12s a nova bursts out of Vosk every 0.8s for %d damage within 340. Each pulse costs 22 mana and it stops the moment you run dry.',
     val:[85,125,165]}
  ]
}};
export const HERO_IDS = Object.keys(HEROES);

