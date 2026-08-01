// @ts-nocheck
/* Jungle camp variants. Every member of a camp is one of these; last-hitting a
   member banks one charge of that variant for your team, cashed in as an extra
   creep on your next wave. Each variant helps end the game a different way —
   n is the pack size (1–8). Colors feed the renderer so packs read at a glance. */

export const CAMP_VARIANTS = {
  swarm: {                                    // eight gnashing teeth — raw push mass
    name:'Gnasher Swarm', n:8,
    hp:120, dmg:13, armor:0, ms:345, range:70, bat:0.7, r:11, ranged:false,
    bounty:12, xp:16, col:'#9be15d', col2:'#2e4a17',
  },
  brute: {                                    // one huge cleaving wall of moss
    name:'Mosshide Brute', n:1,
    hp:1500, dmg:72, armor:4, ms:225, range:110, bat:1.25, r:30, ranged:false,
    cleave:0.55,                              // splashes its swings like a hero cleave
    bounty:120, xp:130, col:'#6fae5a', col2:'#27351c',
  },
  storm: {                                    // shamans that throw sky-bolts (mini Zeus)
    name:'Storm Shaman', n:2,
    hp:500, dmg:28, armor:0, ms:260, range:430, bat:1.4, r:17, ranged:true,
    bolt:{cd:3.5, dmg:65, r:520},             // random enemy unit near it, every cd
    bounty:55, xp:60, col:'#7fd4ff', col2:'#173a52',
  },
  mender: {                                   // a grove of pulsing healers
    name:'Grove Mender', n:3,
    hp:420, dmg:20, armor:1, ms:250, range:90, bat:1.1, r:16, ranged:false,
    pulse:{cd:2.5, heal:35, r:240},           // AoE heal for its side (not towers)
    bounty:45, xp:50, col:'#ff9ad5', col2:'#4a2138',
  },
  ram: {                                      // armored siege beasts — tower killers
    name:'Barrow Ram', n:2,
    hp:820, dmg:44, armor:6, ms:235, range:150, bat:1.5, r:22, ranged:false,
    siege:2.5,                                // damage multiplier against towers
    bounty:70, xp:75, col:'#d9cfa8', col2:'#4a4433',
  },
};
export const CAMP_IDS = Object.keys(CAMP_VARIANTS);
