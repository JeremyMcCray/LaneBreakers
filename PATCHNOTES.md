# Lanebreakers — Patch Notes

Newest first. Every change that a player or a future agent would care about gets
an entry here, in the same commit as the change — see `CLAUDE.md`. Balance
numbers, new content, fixes, UI, netcode: if it changes how the game plays,
looks, or connects, it belongs on this list.

---

## 2026-08-02 · v0.6.2

### UI
- **Ability tooltips are readable now.** The hover tooltip on your ability row
  used to be a fixed-size box, so longer spell descriptions spilled out the
  bottom and bled into the HUD behind it. The box now sizes itself to fit the
  full description, the text is slightly larger, and the tooltip casts a
  shadow so it stands apart from the ability row underneath.
- **Item and ability names are no longer chopped mid-word.** HUD item slots
  (yours and the enemy's strip) now show the full item name on up to two
  lines — "Ascendant Scepter" instead of "Ascendant" — and anything that
  still can't fit gets a proper "…" instead of a silent cut. Ability names
  under the Q/W/E/R row get the same treatment. Slot numbers moved to the
  top-right corner of each item slot to make room.

## 2026-08-01 · v0.6.1

### Fixes
- **Match History works again.** The screen crashed (and showed nothing) if
  your saved history contained a hero that has since left the roster — e.g.
  games with Liora, who was replaced by Geist. Old records now render fine,
  listing the departed hero as "LIORA (retired)". Imported histories from
  other game versions get the same treatment.

## 2026-08-01 · v0.6.0

### New jungle camps — three new variants join the spawn pool
- **Frostfen Howler** (pack of 2) — rime-wolves whose every bite slows the
  target by 20% for 1.5s. Bank them and your wave gets chasers that keep
  fleeing heroes in reach. 50g bounty each.
- **Bogfang Spitter** (pack of 3) — ranged lobbers whose hits smear on a
  poison (12 damage/s for 3s, refreshed by every hit). Marching with your
  wave they wear heroes down from the back line. 45g bounty each.
- **Gilded Scarab** (lone) — a skittering treasure that never fights back:
  once wounded it flees around the pocket rim, so bring a slow, a ranged
  hit, or a friend to corner it. Pays a fat **250g** bounty (to every
  nearby teammate, as always) — and its banked charge marches out as a
  fast, armored decoy that soaks tower fire.



### Balance pass — heroes
- **Brann** — Iron Hook flies slower (1400 → 1100 speed). Same 920 reach, but
  there's a real window to sidestep it now.
- **Gruk** — Quake's radius now grows with rank: 210/240/270/300 (was a flat
  300). Stone Skin's regeneration now scales too: 2.5/3/3.5/4% max HP per
  second (was a flat 4%). The scepter's Walking Mountain quake uses the
  radius of the rank you've skilled.
- **Thorne** — Overgrowth slows by 35% (down from 45%) and its radius now
  grows with rank: 170/190/210/230 (was a flat 230). Wild Growth still
  spreads +130 on top of whatever radius you cast it at.
- **Shiv** — the FULL RAGE triple-knife volley can no longer dump all three
  knives into the same hero: each hero eats at most one knife per volley,
  the rest fly past (creeps still block knives as before).
- **Drift** — Twin Rakes reach reduced to 280 (from 320).
- **Jarak** — trades 20% attack speed away overall, but the melee blade grip
  now grants +35% attack speed (net +15% in melee, -20% while throwing axes).
- **Vhal** — the brood joins her focus: spawnlings within 200 of whatever
  Vhal is attacking switch to that target. Spawnlings further away keep
  pushing as before.

### Balance pass — items & lane
- **Stout Shield / Buckler** — damage block is no longer guaranteed: it now
  triggers on 60% of attacks (24 / 10 damage blocked when it does).
- **Quelling Blade / Whetstone** — bonus creep damage no longer applies to
  denies (your own creeps). Last-hit previews reflect this.
- **Lane creeps** — slightly larger hitboxes (melee 18 → 20, ranged 15 → 17),
  so clicking and skillshots connect a touch more honestly.

## 2026-08-01 · v0.5.0

### The Hideout — waiting for a match is no longer a menu
Online lobbies now drop you into a cozy warm-up room while the seats fill.
The moment you host or join a quick-play lobby you're in it, hero in hand.
- **A practice range**: three straw training dummies (they regrow their health,
  and stand back up a few seconds after you flatten one) plus two **moving
  dummies** pacing patrol runs — skillshot practice that actually moves. Slows,
  roots and stuns genuinely affect them.
- **Both jungle camps are open** on a fast cycle (first packs ~10s, quick
  refills), so you can rehearse pulls and last hits for real gold and XP.
- **A practice tower** stands off to the side. It fights back, it can be
  destroyed (full 400g bounty), and it rebuilds itself shortly after — no
  backdoor protection in here, hit it as hard as you like.
- Nothing in the room can end a match: no waves, no score, no clock.
- A floating **Hideout panel** keeps the lobby with you: room code (host),
  live roster with ready states, Switch side, and the **Ready** button. The
  real match starts the instant everyone readies — the room simply vanishes.
- **Hero & lobby** on the panel takes you back to the menu to change hero or
  mode (or start a tournament); a **⛺ Warm-up Hideout** button in the lobby
  row brings you back in.
- Set dressing: a campfire with log seats, a lantern string over the range,
  drifting fireflies and a wooden sign. Get comfy.
- Debug (F3) and the sandbox work in the Hideout — it's a practice space.

## 2026-07-31 · v0.4.0

### New hero — GEIST, the Pale Countess (replaces Liora)
Liora has left the roster. In her place: an undying noblewoman who spends her
own blood like coin.
- **Q · Essence Bomb** — a vitality blast (240 radius) that costs her 7% of her
  max health to throw.
- **W · Life Drain** — a crimson tether that drains the victim for 4s and heals
  Geist for every point it deals. Breaks past 700 range.
- **E · Malice** — a cursing bolt: the victim takes 12/16/20/24% more damage
  from ALL sources for 5s.
- **R · Soul Exchange** — swap health PERCENTAGES with the enemy hero nearest
  the cursor. The victim cannot be left below 30/25/20%.
- **⚜ Blood Dividend** — Essence Bomb refunds its whole health cost (plus 60
  per hero) whenever it damages an enemy hero.

### Drift — full rework
The gold-robbing trophy hunter is gone; the man is now a stalker in the dark.
- **Q · Twin Rakes** — both claws slash the arc in front of him (320 reach) for
  magic damage; targets in the closest 30% of the reach also take melee damage
  scaling with his attack damage (60–105%).
- **W · Bloodtrail** — a hooked blade that makes the victim bleed 10/14/18/22%
  of their max health over 5s. While the wound is open, RECAST to teleport to
  it — free, from anywhere.
- **E · Lacerate** (passive) — his attacks and abilities hit 12/16/20/24%
  harder on targets bleeding from Bloodtrail; a bleeding enemy that dies feeds
  him 90 health.
- **R · Blackout** — every enemy hero goes night-blind for 5/6.5/8s: their
  screen goes dark beyond 180 units of their own hero. (Bots are not fooled —
  they never used their eyes.)
- **⚜ Pitch Black** (replaces Grand Larceny) — Blackout also slows its victims
  25% for its duration, and Drift deals +20% to the night-blind.

### New item — Soulweave (1070g, magic)
- Ember Shard + Vitality Band + 520g recipe. +10% ability damage, +140 HP, and
  SPELL LIFESTEAL: your abilities heal you for 18% of the damage they deal to
  enemies (one third as much from creeps). Towers don't bleed.

### Timber — Reactive Armor toned down
- Armor per plate 0.7/1.0/1.3/1.6 → **0.5/0.8/1.1/1.4**, regen per plate
  1.2 → **1.0**, max plates 10 → **8**. He still wants you swinging at him —
  he just no longer becomes a building about it.

---

## 2026-07-31 · v0.3.5

### Economy — free gold for standing around, fixed
- **Creeps that died with no last hit were paying their half-bounty to every
  enemy player on the map** — including players dead or idling at the fountain.
  Now only heroes standing in XP range collect. All modes, but 3v3's 8-creep
  waves made it a firehose: an AFK 3v3 player was banking ~1,400 bonus gold
  every 5 minutes.

### 3v3
- **Creep XP reduced by 35%**, matching the existing gold trim — the double-size
  wave no longer out-levels the other modes.
- **Tower buffed: 3000 → 3300 HP, 165 → 175 damage.**

### Tournament
- **A fielded hero now goes to the player who clicked it.** Heroes used to be
  dealt out in draft order, so in 2v2/3v3 you could click one hero and find
  yourself playing your teammate's. Each seat now fields exactly one hero,
  and the prompt shows when you personally are locked in.

### Menus
- **The History button on the end card now opens Match History** — it used to
  dump you on the hero-pick screen instead.
- **Random Hero is now a mystery box**: the roll is hidden from you *and* the
  lobby (everyone sees "??? (random)") until the match starts.

---

## 2026-07-31 · v0.3.4

### Stryg — Rupture buffed
- **Rupture now charges its damage every 80 units moved** (was 100) — a 25%
  damage increase against anyone who runs, and the bleed numbers tick up more
  often so the wound reads as the threat it is.
- The **Open Wounds** scepter attack-bleed keeps its "50 units run" value at
  the new rate, so it gets the same 25% buff.

---

## 2026-07-31 · v0.3.3

### Rename
- **ORRIN is now CORVICK.** Same Siegewright, same kit — only the name changed.
  (Internal id stays `orrin`, so bot builds, saves and trained brains are
  unaffected.)

---

## 2026-07-31 · v0.3.2

### Creeps & lane economy
- **Creeps now resist 30% of ability damage** (lane creeps and jungle neutrals;
  pure damage cuts through, player summons are unaffected). Right clicks still
  hit full — clearing waves with spells alone is slower.
- **3v3: gold from lane creeps reduced by 35%** — the 8-creep wave was paying
  out far more farm than the other modes.
- **3v3: lane creeps have 15% more health**, so the wider lane's waves don't
  evaporate to incidental damage.

### Jungle
- **Camps refill every 90s** (down from 120s) once cleared. First spawn is
  still at 2:00.

### Orrin — Siege Bolt falloff
- The bolt now **loses 30% of its power for every creep it touches**, like
  Sable's Piercing Shot: each allied creep mended weakens the remaining heal,
  and each enemy creep punched through weakens the remaining damage (including
  the slam a hurled creep deals to a hero).

---

## 2026-07-31 · v0.3.1

### Orrin — Siege Bolt reworked
- The bolt now **punches through the enemy creep line** instead of stopping on
  the first creep. Damage, cost, cooldown and the 80% tower bonus are unchanged.
- **Allied creeps in its path are healed** for half the bolt's damage
  (once per creep per bolt).
- **Enemy lane creeps are hurled backward** (~170 units). A creep flung into an
  enemy hero stops there and slams them for half the bolt's damage — standing
  behind your own wave is no longer free. Heroes and towers still stop the bolt
  itself; jungle neutrals are not shoved.

---

## 2026-07-31 · v0.3.0

### New mode — 3v3
- **3v3 is playable everywhere**: Practice (you + 5 bots), online quick-play
  lobbies (6 seats), and tournaments (3 heroes fielded per side).
- The 3v3 lane is wider than 2v2's, creep waves grow to 8 a side (3 ranged),
  and both jungle pockets are open, just like 2v2.
- **First to 6 points wins** (tower fall still ends the match outright). The
  tower is tougher (3000 HP) and hits harder (165) to survive the bigger lane.
- Teams spawn on three fountain rows so nobody stacks on top of a teammate.
- The F4 sandbox gets a "Kills to win (3v3)" tunable.

### Fixes
- Tournament lives are now capped so the draft can never demand more heroes
  than the roster holds (a 2v2 tournament at 7 lives used to deadlock the
  draft board — it now quietly plays at 6).
- Switching between lane widths between matches no longer leaves the old
  mode's rocks and trees sitting inside (or floating outside) the new lane.

---

## 2026-07-31 · v0.2.2

### UI
- The browser right-click menu can no longer pop up anywhere in the game — the
  end-of-match screen (and every other menu/overlay) now suppresses it like the
  battlefield and shop already did. Text fields still allow it so you can
  right-click-paste connection codes.

---

## 2026-07-31 · v0.2.1

### Economy — 2v2 gold now pays like 1v1
- **Creep bounties are shared**: the last hit still pays the killer in full, and
  now every teammate standing nearby (same radius as XP) receives the same
  bounty too. This was the one income stream that wasn't team-shared — XP, kill
  bounties and tower gold already paid everyone — and it's why one player per
  team always ended up much poorer. Losing the last-hit race to your own
  teammate no longer costs you gold. Jungle camp bounties share the same way.
- **Dying no longer costs gold.** Death already costs respawn time; the gold
  tax only dug the losing player deeper.

### Jungle camps
- Sleeping camps no longer wake when a creep wave brushes past the pocket —
  a pack only stirs when a hero actually steps into its camp (or hits it).
  Once angered it still fights anything nearby until it leashes home.

---

## 2026-07-31 · v0.2.0

### New mechanic — Jungle Camps
- Two creep camps flank the lane at mid-map: one pocket carved off the north
  edge, one off the south. **1v1 uses one side (picked at random each match);
  2v2 opens both.**
- The first camp spawns at **2:00**, and every 2 minutes after that a camp
  refills — **only if it is empty**. Neutrals guard their pocket: wake them and
  they fight, drag them too far and they trot home and heal back to full.
- **Last hits matter**: whoever lands the killing blow on a jungle creep earns
  gold + XP *and banks a charge for their team* — that exact creep type spawns
  again **on your side, with your next wave**. The ⚑ counter by the top bar
  shows charges waiting on each side.
- Five camp variants, each pushing toward the end of the game its own way, each
  with its own look and sound:
  - **Gnasher Swarm** (×8) — a flood of fast, fragile biters. Raw wave mass.
  - **Mosshide Brute** (×1) — a huge cleaving wall of moss. Walks through waves.
  - **Storm Shaman** (×2) — hurls a sky-bolt at a random nearby enemy every few
    seconds (a smaller, greener Zeus).
  - **Grove Mender** (×3) — pulses an AoE heal over its side. Keeps a push alive.
  - **Barrow Ram** (×2) — armored siege beasts that hit towers 2.5× harder.
- Lane creeps and the classic bot ignore the camps; A-move only picks neutrals
  up when you're standing at the camp, so laning never drags you into the
  jungle by accident.
- Sandbox: `First jungle camp (s)` and `Camp respawn (s)` are tunable in F4.

---

## 2026-07-31 · v0.1.0

### UI
- Right-clicking inside the shop panel no longer opens the browser context menu.

### New hero — TIMBER, The Timbersaw
- A close-range spell zoner in saw armor. Get near him and everything spins:
  - **Q · Whirling Death** — the saws spin out around him: damage + a slow to
    everything within 275.
  - **W · Timber Chain** — fire a chain and reel himself to the cursor, sawing
    everything along the way.
  - **E · Reactive Armor** (passive) — every enemy attack that lands on him is
    another armor plate (+armor and +regen per stack, up to 10 for 12 s).
    Hitting Timbersaw is how you lose to Timbersaw.
  - **R · Chakram** — hurl the great blade to a point where it spins, grinding
    and slowing everything within 180. It stays as long as he feeds it mana;
    press R again to recall it and it saws everything on the way home. The
    cooldown only starts when the blade returns.
  - **Scepter · Second Chakram** — he built another one. Two blades in the
    field; the recall brings both home.

### New hero — DRIFT, The Drifter
- A vagabond closer built for this game's race to 2 points (4 in 2v2): the
  weakest hero in the game until his first kill, then a permanent snowball.
  - **Q · Stickup** — a thrown knife that also robs heroes of gold, straight
    into his pocket.
  - **W · Slip** — untouchable for 0.75 s, slows purged, and a burst of speed.
    His only way out — until he's strong enough to stop leaving.
  - **E · Trophies** (passive) — every enemy hero kill is permanent: +damage and
    +70 max HP, forever. Until his first trophy he is HUNGRY (everything he
    deals hits 12% weaker). Cash Out kills count as two trophies.
  - **R · Cash Out** — lunge onto the mark and collect: big damage, +25% more
    per trophy held. This is the blade that ends matches.
  - **Scepter · Grand Larceny** — takedowns permanently STEAL 8 attack damage
    from the victim; they lose it for the rest of the match and he swings it.

### New hero — DORN, The Doorman
- A melee bruiser built around displacement and one very literal portal:
  - **Q · Revolving Door** — swing the great door in a wide arc: damage, a 260
    shove, and a slow.
  - **W · Baggage Check** — a thrown suitcase that clamps on; a beat later the
    luggage is recalled, dragging its holder 320 units to Dorn.
  - **E · Service Door** — a pair of doors, one at his feet, one at the cursor
    (up to 9 s). Allied heroes step into either and out the other. One pair at
    a time, and standing on the mat won't bounce you back.
  - **R · The Grand Door** — seize the enemy hero and show them out: escorted
    through his Service Doors to the far side (dazed on arrival) if a pair
    stands, or hurled 450 units back toward their own base if not. His door
    placement is the ult's aim.
  - **Scepter · Off the Guest List** — his doors stop checking credentials: any
    enemy knocked, yanked or blasted into a Service Door is pulled through and
    dumped out the far side, slowed. Q-shove into a door is now a mini-ult.

### Meta
- **Patch notes are now mandatory.** Every change ships with an entry in this
  file — and yes, this rule is the first patch note. :p
- Added `CLAUDE.md` — the canonical, always-loaded project brief for AI agents.
  The old `.cursor/rules` overview now just points at it.

### New — the Ascendant Scepter
- New capstone item (2200 g): +220 HP, +220 mana, +2 mana regen, +16 damage,
  +10% ability damage — and a **unique upgrade for every one of the 21 heroes**
  (Vex's Execute resets on kills, Mara cheats death, Orrin's turrets grow legs,
  Drex's explosions knock people away, and 17 more). Read yours in the hero book
  (⚜ card) or by hovering the item in the shop.
- Bots know about it and save for it mid-late game.

### Netplay
- **Fixed: non-host players froze at the moment a 2v2 was won and never saw the
  end card.** The winner now travels as its own tiny reliable message, the end
  card no longer depends on the heavyweight final snapshot (stats fill in when
  it lands), the final payload is slimmed, and every client-side end-screen path
  is hardened so one error can never eat the VICTORY/DEFEAT screen.

### UI / UX
- **Debuff badges**: bold, readable icons above heroes for stun, silence, slow,
  root, and rupture (ember-pip style). Deliberately heroes-only — creep waves
  stay clean.
- **Rupture** is much louder: pulsing arcs and a blood trail while the victim
  runs, a flashing RUPTURED warning, and a wet bleed sound each time it charges.
- Version number on the main menu (from package.json, injected at build).
- F1 help panel no longer opens automatically at match start; F1 toggles it and
  the HUD hints at it.
