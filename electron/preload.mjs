/**
 * Preload — expose a tiny desktop flag to the renderer.
 * Game code stays browser-compatible; optional desktop tweaks can check window.lanebreakersDesktop.
 */
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("lanebreakersDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
