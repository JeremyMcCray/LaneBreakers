# Lanebreakers — Patch Notes

Newest first. Every change that a player or a future agent would care about gets
an entry here, in the same commit as the change — see `CLAUDE.md`. Balance
numbers, new content, fixes, UI, netcode: if it changes how the game plays,
looks, or connects, it belongs on this list.

---

## 2026-07-31 · v0.1.0

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
