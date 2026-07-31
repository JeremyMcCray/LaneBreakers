# Lanebreakers — canonical project brief for AI agents

This file is the **single source of truth** for agents working in this repo. It is
auto-loaded by Claude Code every session; Cursor loads it via
`.cursor/rules/Project Overview.mdc`, which just points here. When the facts below
drift from the code, **fix this file in the same commit** — the whole project is
built with LLMs, and a stale brief costs more than a missing one.

## What this is

A browser mid-lane MOBA: 1v1 or 2v2 on a single lane, creep waves, one tower per
side, fountain bases, item shop, 21 heroes, classic + neural bots, practice /
online (P2P, no server) / tournament. Vite + TypeScript, Canvas 2D for the world,
light DOM for menus/shop. No React. Most files start with `// @ts-nocheck` — match
that; don't start a typing crusade.

Human docs: `README.md` (setup, day-to-day), `DESKTOP.md` (Electron/Steam
packaging), `PATCHNOTES.md` (player-facing change log — mandatory, see rule 7).

## Golden rules

1. **One ruleset.** All combat/ability math lives in `src/sim/`. The browser game,
   the classic bot, and the Node trainer all run the same code. Never duplicate
   sim math elsewhere.
2. **The sim is headless.** Nothing in `src/sim/` (or `src/data/` it reads) may
   touch `document`, `window`, or canvas. `npm run smoke` proves it.
3. **Right layer.** Numbers/data → `data/`. Rules → `sim/`. Drawing → `render/`.
   Sound → `audio/`. Menus/DOM → `ui/`. Modes/netcode → `app/`. Bots → `ai/`.
4. **Never hand-edit `dist-sim/`** — regenerate with `npm run build:sim`.
5. **Scoped changes.** No drive-by refactors. Keep new files modular; never
   collapse the game back toward one mega-file.
6. **Test the layer you touched** (see "Testing" below) before calling work done.
7. **Every change gets a patch note.** Add an entry to `PATCHNOTES.md` (newest
   first, same commit) for anything a player or a future agent would care about:
   new content, balance numbers, fixes, UI, netcode. Write it player-facing;
   implementation detail belongs in the commit message, not the note.

## Commands

```bash
npm run dev              # local play at http://localhost:5173
npm run build            # tsc + vite → dist/ (also = build:pages, GitHub Pages)
npm run build:release    # single-file HTML → dist-release/
npm run build:sim        # Node trainer bundle → dist-sim/  (REQUIRED after sim/data changes, before training)
npm run desktop:dist     # Electron packages → dist-desktop/  (see DESKTOP.md)

npm run smoke            # headless sim sanity
npm run smoke:heroes     # per-hero kit assertions + roster completeness
npm run smoke:scepter    # every hero's Ascendant Scepter upgrade, with/without
npm run smoke:netclient  # a real 2v2 online client through match end (stub DOM)
npm run smoke:endstats   # post-game stats panel
npm run smoke:sandbox    # dev-sandbox live tuning against the real sim
npm run smoke:neural     # neural runtime loads and plays
npm run smoke:parity     # module surface used by trainer/tools still exists
npm run bake:brains      # refresh src/ai/neural/brains/baked.json
```

## Layout — where to edit what

```
src/
  data/     world.ts (constants + live tunables), heroes.ts (21 kits + scepter upgrades), items.ts
  sim/      headless rules: create, step, hero, creep, tower, attack, combat,
            abilities, zones, projectiles, shop, stats, snapshot, commands, waves
  ai/       bot.ts (classic), neural/ (runtime, train UI, baked brains)
  app/      state.ts (G), shell.ts (loop/beginMatch), netplay.ts, lobbyUi.ts,
            tournament.ts, boot.ts, persistence.ts, online.ts (barrel)
  render/   canvas.ts, worldDraw.ts (entities/zones/badges), hud.ts, fx.ts, view.ts, devOverlay.ts
  audio/    sfx.ts — procedural WebAudio; sim fx events → sounds, no asset files
  ui/       menus, shop panel, books (hero/item), endCard, matchStats, input
  dev/      F4 sandbox — live balance tuning, time control, dummies
tools/      smoke-*.mjs tests + build scripts     ai/ (repo root)  Node trainer
```

Import the sim via `src/sim` (or `src/sim/engine`, same barrel).

## Current game facts (verify here before quoting numbers)

- 21 heroes (`HERO_IDS`), 4 abilities each (R = ult, ranks 3, others 4).
  Ult unlock levels `ULT_REQ = [6,9,12]`, `MAX_LEVEL = 12`.
- Win: **2 points in 1v1, 4 in 2v2** (hero kill = 1); the tower falling ends the
  match outright. 15-min cap (`MATCH_LIMIT`), then kills → net worth → last hits.
- Economy: `START_GOLD 420`, passive 2.2 g/s, courier delay 5 s, 6 item slots,
  full refund within 10 s of purchase.
- Items build component → upgrade (`from` + `recipe`); cost auto-derived.
  **Ascendant Scepter (2200 g)** is the capstone — see below.
- Most gameplay constants in `world.ts` are `export let` + `setWorldTunable` so
  the F4 sandbox can retune them live. Treat as constants when reading; don't
  convert them to `const`.

## Sim architecture

- `newSim(picks, mode)` → state `S`; `simStep(S, dt)` at 60 Hz. Step order:
  waves/gold/cooldowns/deliveries → `heroTimers` → non-hero timers/dots/embers →
  `heroThink` → creep/tower think → projectiles → zones → collision separation → cull.
- Player commands go through `applyCmd(S, slot, cmd)` (`sim/commands.ts`) — both
  local input and net clients.
- **`damage(S, src, tgt, amount, opt)`** is the only way to hurt things. It
  handles amp, armor, shields, reflect, illusion multipliers, lifesteal, aggro,
  kill(). `opt`: `{attack, ability, melee, pure, crit, tag, silent, ...}`.
- **Damage attribution**: every blow carries a tag (`S.tag`, or `opt.tag`) for
  the post-game breakdown. Ability slots are `'a0'..'a3'`, items `'i:<itemId>'`
  (auto-labeled from `ITEMS`). Casts stamp their tag onto projectiles/zones they
  spawn; zone/dot steppers re-raise it when the damage lands later.
- **Status effects**: `applyStun/applySlow/applyRoot/applySilence/applyDot`
  (`combat.ts`). Silence is hero-only. `e.csT>0` = counterspell window eats the
  effect. Timers decay in `heroTimers` (heroes) and `step.ts` (everything else) —
  a new timed field must be added to one of those decay lists.
- **Passive abilities** use `grants:` in heroes.ts, wired in `updateHeroStats`
  (`stats.ts`) — the stat pass runs every tick, so items and buffs compose there.
- **Zones** (`zones.ts`): ground effects with a `kind` switch (bomb, mine, trap,
  quake, firestorm, strike, omni, nova, sanct, hive, ...). **Projectiles**
  (`projectiles.ts`): homing `atk`/`tower` vs free-flying ability shots with
  flags (pierce, pull, slow, stun, emb, twin, grow...).
- **FX pipeline**: sim emits `fx(S, {t:'name', ...})` → buffered → rendered by
  the `spawnFx` switch in `render/fx.ts` **and** sounded by the `fxSound` switch
  in `audio/sfx.ts`. A new fx type needs a case in **both** (unknown types are
  silently ignored — nothing crashes, nothing shows).
- **Snapshots** (`snapshot.ts`): `buildSnapshot(S)` is the wire format and the
  render view. Unit status travels as bit flags in `e.st` (1 stun, 2 slow,
  4 shield, 2048 root, 4096 silence, 8192 counterspell, 32768 tower-targeting,
  8388608 rupture; hero-specific bits ≥ 65536 — full list in snapshot.ts).
  **Keep snapshots lean** — they go out 20×/s. Heavy post-game data (breakdowns,
  graph series, event log) rides only on the final snapshot and is thinned/capped
  there. Anything a client *must* receive gets its own tiny message instead
  (see netplay).

## The Ascendant Scepter (per-hero "Aghs" upgrades)

- One item (`items.ts: scepter`, 2200 g) unlocks a unique upgrade per hero.
- Data: `HEROES[id].scepter = {name, desc}` in `heroes.ts` — shown automatically
  in the shop tooltip, the hero book (⚜ card), and the HUD (⚜ on the portrait).
- Sim: `updateHeroStats` sets `e.aghs` from item possession; every effect is
  gated on `e.aghs` at the point where that hero's mechanic lives (cast switch in
  `abilities.ts`, on-hit in `attack.ts`, projectile flags, zone flags, kill/damage
  hooks in `combat.ts`, stat-level in `stats.ts`). Tag scepter-sourced damage
  `'i:scepter'`.
- `npm run smoke:scepter` asserts every hero's upgrade fires (and doesn't without
  the item). A new hero **must** get a scepter block + a check there.

## Netplay (peer-to-peer, host-authoritative)

- Host runs the sim; clients send commands and interpolate snapshots
  (`app/shell.ts` loop, `app/netplay.ts` transport — PeerJS quick-play codes,
  plus a legacy manual copy-paste path for 1v1).
- Message kinds through `onNetMsg`: `hello, team, ready, tpick, c` (client→host),
  `welcome, lobby, tour, start, s` (snapshot), `over` (host→client).
- **End-of-match protocol** (hard-won — don't regress it): the moment `S.over`
  flips, the host broadcasts a tiny reliable `{k:'over', w, hw}`; clients raise
  the end card from that alone. The heavyweight final snapshot (breakdowns,
  thinned series, capped events) upgrades the stats panel when it lands
  (`refreshEndStats`), and the host stops rebroadcasting it after ~2 s. All
  client-side end-card paths are wrapped so one bad effect or stats bug can
  never eat the VICTORY/DEFEAT screen — errors log with an `[LB]` prefix.
- 1v1 games decide seats by slot; seats can switch teams — always resolve team
  via `teamOfSlot`, never `slot % 2` directly.

## Rendering & UI conventions

- World draw: `render/worldDraw.ts` (`drawEntity` per unit type, `hpBar`,
  `emberPips`, `debuffBadges`). **Debuff badges (stun/silence/slow/root/rupture
  icons) draw on heroes only — deliberately OFF for creeps** (user decision:
  a slowed wave wearing icons is noise). Creeps keep subtle tints.
- HUD: `render/hud.ts` — ability row, item slots, tooltips, teammate/enemy strips.
- F1 help panel is **hidden by default**; F1 toggles. The version on the main
  menu comes from `package.json` via the vite `define` (`__APP_VERSION__`) —
  bump `version` there when shipping.
- Menus/shop/books are plain DOM built by string templates in `ui/` — follow the
  existing style (no frameworks).

## Dev sandbox (F4) — constraints it imposes

- It writes straight into `HEROES` and the tunable half of `world.ts` at runtime;
  overrides are localStorage-only. Keep `world.ts` tunables as `export let` with
  `setWorldTunable`.
- `p.devFree` (free cast) and `e.dummy` (inert target) are read in `abilities.ts`,
  `creep.ts`, `step.ts` — cheap guards, not a second ruleset. Don't remove them.
- Debug commands (`dbg`) live in `sim/commands.ts`; run `npm run smoke:sandbox`
  after touching sandbox, tunables, or the dbg block.

## AI

- **Classic bot** — `src/ai/bot.ts` (`botThink`). `BOT_BUILD` and `BOT_SKILL`
  must cover **every** hero id (smoke:heroes enforces it). All builds save for
  the Scepter mid-late.
- **Neural** — `src/ai/neural/` (brains JSON `format: lanebreaker-brain-2`; bump
  the format only when inputs change, then retrain). In-browser TRAIN UI reads
  recipes from `ai/recipes.json` **only** — never recreate a copy under `src/`.
- **Node trainer** — repo-root `ai/` loads `dist-sim/index.cjs` via `ai/engine.js`.
  After sim/data changes: `npm run build:sim` → train → `npm run bake:brains`.
  The GitHub Actions workflow (`.github/workflows/train-ai.yml`) depends on the
  `build:sim` step — never remove it.

## Recipes for common expansions

- **New hero**: entry in `heroes.ts` (stats, 4 abilities with `%d` descs +
  val arrays, `scepter:{name,desc}`) → cast cases `'<id>0'..'<id>3'` in
  `abilities.ts` (passives via `grants` in `stats.ts`) → `BOT_BUILD` entry →
  scepter effect + `smoke:scepter` block → optionally a silhouette in
  `heroPath` (worldDraw). `smoke:heroes` roster checks catch missing pieces.
- **New item**: `ITEMS` entry + `itemStats` case in `items.ts`; actives also need
  a branch in `sim/shop.ts useItem`. Consider bot builds.
- **New fx**: emit in sim, then add a case in `render/fx.ts spawnFx` **and**
  `audio/sfx.ts fxSound` (+ a `BANK` sound and a `GAP` throttle if chatty).
- **New timed debuff**: apply-helper in `combat.ts`, decay in `heroTimers` +
  `step.ts`, `st` bit in `snapshot.ts`, visual in `worldDraw` (badge for heroes),
  clear on respawn in `hero.ts`.
- **New net message**: handler in `onNetMsg`, send via `netBroadcast`/`netSendTo`.
  Essential-for-client info = its own small reliable message, never a field
  buried in a fat snapshot.
- **New smoke test**: copy a `tools/smoke-*.mjs` (they run via vite-node against
  `src/` directly, no build needed), add an npm script. `smoke-netclient.mjs`
  contains a reusable stub-DOM harness for client-side code.

## Testing bar

| You touched…              | Run at minimum                                      |
|---------------------------|-----------------------------------------------------|
| `sim/` or `data/`         | `smoke`, `smoke:heroes`, `smoke:scepter`, `build`, `build:sim` |
| netplay / end-of-match    | `smoke:netclient`                                   |
| stats panel / end card    | `smoke:endstats`                                    |
| dev sandbox / tunables    | `smoke:sandbox`                                     |
| anything                  | `npm run build` (tsc + vite must stay green)        |

For **visual** verification, the game can be driven headless: `playwright-core`
is a devDependency (uses system Edge via `channel:'msedge'`, no browser
download). `window.startPractice(mode)` and `window.dbg('maxsk'|'free'|'dummy'|...)`
are exposed for scripting, and page-side `await import('/src/app/state.ts')`
reaches live module state on the dev server. Take a screenshot and actually look
at it.
