# Lanebreakers — Patch Notes

Newest first. Every change that a player or a future agent would care about gets
an entry here, in the same commit as the change — see `CLAUDE.md`. Balance
numbers, new content, fixes, UI, netcode: if it changes how the game plays,
looks, or connects, it belongs on this list.

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
