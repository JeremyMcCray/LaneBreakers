# Desktop shipping (itch today, Steam later)

The game stays a **Vite web build**. Electron (and later Steam) is only a shell that loads `dist/`. No second game rewrite.

## Targets

| Target | Command | Output |
|--------|---------|--------|
| Browser / GitHub Pages | `npm run build:pages` | `dist/` |
| Single-file download | `npm run build:release` | `dist-release/` |
| Desktop (itch / Steam) | `npm run desktop:dist` | `dist-desktop/` |

## Local desktop play

```bash
npm install
npm run desktop:dev          # Vite + Electron (hot reload)
# or
npm run build && npm run desktop        # production dist/ in Electron
```

## itch.io — ship today

1. **Build Windows packages**
   ```bash
   npm run desktop:dist
   ```
   Produces under `dist-desktop/`:
   - `Lanebreakers <version>.exe` — portable (no installer; good for itch “download & run”)
   - `Lanebreakers Setup <version>.exe` — NSIS installer
   - `.zip` — unpacked folder (also fine for itch)

2. **Create the itch page** (if needed): game page → Edit → **Distribute this project** → create a channel (e.g. `windows`).

3. **Upload**
   - Web UI: upload the **portable `.exe`** or the **`.zip`** to the Windows channel, mark as **This file is a game for Windows**.
   - Or [butler](https://itch.io/docs/butler/):
     ```bash
     butler push "dist-desktop/Lanebreakers 0.1.0.exe" yourname/lanebreakers:windows
     # or push the zip / win-unpacked folder
     butler push dist-desktop/win-unpacked yourname/lanebreakers:windows
     ```

4. **Channel tips**
   - Prefer **one** primary Windows build (portable *or* zip) so players aren’t confused.
   - Set minimum requirements loosely (any recent 64-bit Windows; GPU with Canvas 2D).
   - Optional: also upload `dist-release/*.html` as a “browser / offline HTML” extra file — not required.

5. **Icon (optional but nicer)**  
   Drop a square PNG (≥256×256, ideally 512) at `build/icon.png`, then re-run `npm run desktop:dist`. electron-builder will pick it up for the exe icon.

## What Electron does *not* change

- Sim, heroes, AI, netplay code paths stay in `src/`.
- PeerJS still loads from the **npm** bundle first (CDN only as browser fallback). Offline practice works with no network.
- WebRTC online play may need firewall allowances; same as browser Chromium.

`window.lanebreakersDesktop` is set in the Electron preload (`isDesktop`, `platform`, versions) if you ever need desktop-only UI tweaks. Browser builds leave it undefined.

---

## Steam — eventual plan (no rewrite)

Same Vite `dist/` + Electron shell. Steam is **distribution + optional SDK**, not a new engine.

### Phase A — store presence (when ready)

1. Steamworks partner account + app ID.
2. Ship the **same** `electron-builder` Windows (and later Mac/Linux) artifacts via SteamPipe depots.
3. Add `steam_appid.txt` next to the exe for local testing (dev only; don’t ship a fake id to players).
4. Store page, capsules, build branches (`default`, `beta`).

### Phase B — Steamworks integration (optional, incremental)

Keep integrations behind a thin adapter so the game never imports Steam APIs from `sim/`:

```
electron/steam/   (or a small npm wrapper)
  - init / shutdown
  - achievements
  - cloud remote storage ↔ map from persistence.ts
  - overlay / rich presence
```

Suggested approach:

| Feature | Approach |
|---------|----------|
| Achievements | Fire from existing end-of-match / milestone hooks in `app/` only |
| Cloud saves | Mirror `localStorage` history (or export JSON) via IPC → Steam Cloud |
| Overlay | Works automatically with Steam overlay + Electron if launched via Steam |
| DRM / ownership | Steam API ownership check in main process; fail soft offline |

Libraries to evaluate later: official Steamworks + a maintained Node/Electron bridge (e.g. `steamworks.js` / Greenworks successors). Pin one; don’t put Steam calls in `src/sim/`.

### Phase C — multi-depot

- Depot 1: Windows x64 (primary)
- Depot 2/3: Mac / Linux when you enable those electron-builder targets
- Launch option: start `Lanebreakers.exe` (or platform binary)

### What *not* to do for Steam

- Do **not** fork a second game codebase “for Electron/Steam.”
- Do **not** move combat rules into C++/native for store acceptance — Steam does not require that.
- Do **not** block shipping itch on Steamworks; itch can go out with the portable build immediately.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank window after pack | Confirm `dist/index.html` exists before `electron-builder`; `desktop:dist` runs `build` first |
| Assets 404 | `vite.config.ts` must keep `base: './'` |
| Peer / online fails offline | Expected for matchmaking; practice/bots need no net |
| Huge download | Electron ships Chromium (~100MB+). Tauri is a future size optimization using the same `dist/` |
