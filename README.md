# Lanebreakers

A modular **Vite + TypeScript** build of the mid-lane MOBA formerly shipped as a single `lanebreaker-ai.html` file.

Same game — practice, online, tournament, TRAIN UI, classic bot, neural AI — split into normal source files so you can find and change things without hunting through one giant HTML.

The Node AI trainer lives in **`ai/`** in this repo. It loads **this** project's headless sim (`dist-sim/`), not an HTML scrape. GitHub Actions workflows under `.github/workflows/` train in the background the same way as before.

---

## Quick start (play locally)

```bash
cd LaneBreakers
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). That is the full game in the browser.

Requirements: **Node.js 18+** and a modern Chrome/Edge/Firefox.

---

## What lives where

```
LaneBreakers/
  index.html              Page shell (canvas + menu DOM)
  package.json            npm scripts
  vite.config.ts          Dev server + Pages / single-file builds
  Open AI panel.cmd       Double-click → local AI control panel

  src/
    main.ts               Entry — loads CSS and boots the client
    data/                 Numbers and definitions (no game loop)
      world.ts            Map size, economy, win conditions, lane helpers
      heroes.ts           All 14 heroes + ability text/stats
      items.ts            Shop catalog + categories
    sim/                  ★ Headless rules — pure match logic, no DOM
      create.ts           newSim, spawn heroes
      step.ts             simStep (one tick of the world)
      combat.ts           Damage, kills, CC, healing
      abilities.ts        castAbility / canCast (every hero kit)
      commands.ts         applyCmd (move / attack / cast / shop / level)
      snapshot.ts         buildSnapshot (fogged view for netplay)
      …                   creeps, waves, towers, shop, projectiles, zones
    ai/
      bot.ts              Classic hand-written bot
      neural/             Brains, runtime, in-browser TRAIN UI, baked.json
    app/                  Match shell, menus wiring, multiplayer
      client.ts / boot.ts Startup + window globals for onclick handlers
      shell.ts            beginMatch, practice, host game loop
      state.ts            G — client session state
      netplay.ts          WebRTC + PeerJS + message routing
      lobbyUi.ts          Lobby roster + tournament draft screens
      online.ts           Re-exports net + lobby (import from here)
      tournament.ts       Draft / lives / field logic
      persistence.ts      LocalStorage history + stats
    render/               Canvas draw (world, HUD, FX)
    audio/                Procedural WebAudio sfx (no asset files); fx events → sounds
    ui/                   DOM panels (shop, menus, books, input, end card)
    styles/               CSS split by area; game.css imports the rest
    headless.ts           Exports used by Node (sim + a few app helpers)
    node-sim.ts           Bundle entry for the trainer

  dist/                   Multi-file web build (GitHub Pages)
  dist-release/           One self-contained .html (GitHub Releases)
  dist-sim/               CommonJS sim for Node training  ← build with build:sim
  dist-desktop/           Electron packages for itch / Steam  ← desktop:dist
  electron/               Thin Electron main + preload (loads dist/)
  DESKTOP.md              itch upload + Steam eventual plan

  tools/                  Smoke tests + bake / sim / desktop-dev bundlers
  ai/                     Node trainer (train / versus / lab / panel) + brains
                          recipes.json is the single recipe source of truth
  .github/workflows/      Train Lanebreaker AI (GitHub Actions)
```

### Mental model

| Layer | Job | Edit when you want to… |
|-------|-----|------------------------|
| `data/` | Static definitions | Change gold, win kills, hero stats, items |
| `sim/` | Authoritative match rules | Change combat, abilities, waves, shop timing |
| `ai/` | Opponents + TRAIN | Tweak classic bot or neural runtime |
| `app/` | Modes + networking | Touch lobby, online, tournament, match start |
| `render/` + `ui/` + `styles/` | Look and feel | HUD, menus, shop panel, canvas art |
| `dist-sim/` | Trainer copy of `sim/` | **Never edit by hand** — regenerate (below) |

Host (or local practice) runs `simStep`. Online clients receive `buildSnapshot` packets and interpolate.

---

## Everyday commands

| Command | What it does | When to use it |
|---------|--------------|----------------|
| `npm run dev` | Hot-reload dev server | Day-to-day playing / editing |
| `npm run build` / `build:pages` | Typecheck + write `dist/` | Deploy to **GitHub Pages** (share a URL) |
| `npm run build:release` | Typecheck + one HTML in `dist-release/` | **GitHub Release** — friends download and open in Chrome |
| `npm run desktop:dev` | Vite + Electron window | Day-to-day desktop testing |
| `npm run desktop:dist` | Vite build + electron-builder | **itch / Steam** Windows packages in `dist-desktop/` |
| `npm run preview` | Serve the last `dist/` locally | Check the Pages build before uploading |
| `npm run build:sim` | Bundle headless rules → `dist-sim/` | **Before any Node training** (see below) |
| `npm run bake:brains` | Copy trained brains → `src/ai/neural/brains/baked.json` | After training, so the browser game gets new brains |
| `npm run smoke` | Tiny headless match | Sanity-check the sim after rule changes |
| `npm run smoke:neural` | Neural path smoke | Sanity-check AI wiring |
| `npm run smoke:parity` | Tour / store / train exports | Quick “did I break the app APIs?” check |
| `npm run smoke:sandbox` | Dev-sandbox tuning against the real sim | After touching `src/dev/`, `src/data/world.ts` or the `dbg` commands |

---

## Dev sandbox — **F4**

A testing ground for balance work. Press **F4** anywhere (menu or mid-match) — or run `lbDev()` in the console.

Everything the sim knows about a hero is re-read from `src/data/heroes.ts` on the tick or the cast that needs it, so the sandbox just writes into that live object. **Change a number and the next cast uses it** — no reload, no restart. The HUD tooltips and the hero book follow along, because they read the same data.

| Tab | What you can change |
|-----|---------------------|
| **Abilities** | Cast range, charges, and the per-rank **value / cooldown / mana** tables for all four spells, on any of the 21 heroes |
| **Hero** | Base HP / mana / damage / armor and their per-level growth, move speed, attack range, base attack time, projectile speed |
| **World** | Wave interval, passive gold, XP radius, max level, kills to win, creep aggro ranges, cleave cone, courier delay, match cap |
| **Sandbox** | Time scale (0.05×–4×), freeze + frame step, freeze bots, training dummies, cheats, range overlays, a live DPS readout |
| **Changes** | Everything that differs from the shipped numbers, with copy / download / load / reset |

**Spell scaling** — each per-rank row has a `ramp` tool (*start* + *per rank* rewrites `100 · 160 · 220 · 280`) and ±% buttons that always scale from the **shipped** value, so clicking `+25%` twice is still +25%.

**Time control** — `[` halve speed, `=` double it, `\` freeze, `]` step one tick. Freezing plus 0.1× is how you read a wind-up frame by frame. The host of an online match always runs at 1×; the netcode assumes real time on both ends.

**Training dummies** — an inert enemy with the HP, armor and regen you ask for. It never moves, never swings, and pays no gold or XP. Clear the creeps and freeze the bots first for a clean DPS reading.

### Things to know

- Overrides live in **localStorage**, so a tuned session survives a reload. A purple **SANDBOX · n TUNED** badge sits on the HUD whenever any are live — tuned numbers must never be mistaken for shipped balance.
- Nothing here writes to disk. When you like a number, **Changes → Copy JSON** and put the real value into `src/data/`.
- The Node trainer under `ai/` reads `dist-sim`, so it only ever sees numbers actually committed to `src/data/`. The in-browser TRAIN screen shares the live objects and *will* train against your overrides — reset before you trust a brain.
- Item stats are not tunable: `itemStats()` is a hardcoded switch rather than data, so there is nothing to override. Item **costs** are data and could be added later.

---

## Shipping builds

Three outputs, same codebase:

1. **GitHub Pages** — `npm run build:pages` → publish the **`dist/`** folder.  
   `base` is `./` so it works from a project subpath or root. To wire Actions later, see the “How to enable GitHub Pages” section in `.cursor/rules/Project Overview.mdc` (build command, artifact path, sample workflow).

2. **Single-file Release** — `npm run build:release` → grab the HTML from `dist-release/`.  
   Same idea as the old double-clickable file: one download, open in the browser.

3. **Desktop (itch / Steam)** — `npm run desktop:dist` → Windows portable/installer/zip under **`dist-desktop/`**.  
   Dev: `npm run desktop:dev`. Full itch upload steps and the Steam roadmap: **[`DESKTOP.md`](./DESKTOP.md)**.

---

## AI trainer (`ai/`)

The Node trainer lives in **`ai/`** in this same repo (`train.js`, `versus.js`, `lab.js`, the panel, …). It loads game rules through `ai/engine.js` → **`dist-sim/index.cjs`**.

**Recipes:** edit only `ai/recipes.json`. The in-browser TRAIN screen imports that same file (no second copy under `src/`).

**Control panel:** double-click **`Open AI panel.cmd`** at the repo root (or `node ai/panel.js`).

### Local workflow

```bash
# 1. After any change under src/sim/ (or data/ the sim imports):
npm run build:sim

# 2. Train:
cd ai
node train.js
# or: node versus.js / node lab.js / node panel.js

# 3. Put champions into the browser game:
cd ..
npm run bake:brains
```

`ai/bake.js` can still patch an old HTML game file if one is present, and also writes `src/ai/neural/brains/baked.json`. For the Vite game alone, `npm run bake:brains` is enough.

### Overrides (optional)

| Env var | Meaning |
|---------|---------|
| `LB_SIM` | Absolute path to `index.cjs` if auto-discovery fails |
| `LB_HTML` | Path to `lanebreaker*.html` for **bake.js only** (not used for training) |

There is no HTML scrape / `vm` sandbox. If `dist-sim` is missing, `engine.js` tells you to run `npm run build:sim`.

Full trainer docs: [`ai/README.md`](./ai/README.md).

---

## GitHub Actions (background training)

Same idea as Jeremy’s original workflows: train on GitHub’s runners, cache progress, download artifacts.

Workflow: **Train Lanebreaker AI** — `.github/workflows/train-ai.yml`

**How to run:** Actions → *Train Lanebreaker AI* → Run workflow. Pick recipes, hours, etc.

Each job:

1. `npm ci` + `npm run build:sim` (so the modular ruleset is present)
2. Verifies `ai/engine.js` can `loadGame()`
3. Runs `ai/supervise.js` (same as before)
4. Uploads `ai/brains/<recipe>` as an artifact; optionally commits / bakes `baked.json`

On a public repo this stays free/unmetered within GitHub’s limits (jobs die around 6 hours — keep `hours` ≤ 5.5).

---

## “I want to change X”

| Goal | Start here |
|------|------------|
| Hero stats or ability text | `src/data/heroes.ts` |
| Ability behavior | `src/sim/abilities.ts` |
| Items / prices | `src/data/items.ts` |
| Map, gold/sec, kills to win | `src/data/world.ts` |
| Creep waves / towers / combat | `src/sim/waves.ts`, `tower.ts`, `combat.ts` |
| Classic bot builds | `src/ai/bot.ts` |
| Neural opponent / TRAIN screen | `src/ai/neural/` |
| Online / lobby / PeerJS | `src/app/netplay.ts`, `lobbyUi.ts` |
| Tournament draft rules | `src/app/tournament.ts` |
| Canvas look | `src/render/` |
| Menus / shop UI / CSS | `src/ui/`, `src/styles/` |
| Dev sandbox / live tuning | `src/dev/` |

After sim or data changes that affect training: run **`npm run build:sim`** before the next Node train.

---

## Smoke tests after big edits

```bash
npm run smoke
npm run smoke:neural
npm run smoke:parity
npm run smoke:sandbox
npm run build          # also catches TypeScript errors
```

If those pass, the core loop, AI path, and app exports are still wired.

---

## Notes for maintainers

- Prefer **modules over one file** — keep new logic in the right folder (`sim` vs `ui` vs `app`).
- `sim/` should stay free of `document` / canvas so the trainer and browser share one ruleset.
- Many files still use `// @ts-nocheck` from the mechanical port; tightening types is optional cleanup, not required for play.
- `abilities.ts` is still one large switch (same as the old HTML). Splitting per hero is fine later; do it carefully and re-smoke.
- PeerJS loads from npm first, with CDN fallbacks if the import fails.
- Fitness recipes: **`ai/recipes.json` only**.
