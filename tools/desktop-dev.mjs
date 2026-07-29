/**
 * Dev desktop: start Vite, wait until ready, then open Electron against it.
 * Ctrl+C / closing the window tears down both.
 */
import { spawn } from "child_process";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = 5173;
const url = `http://${host}:${port}`;

function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Vite did not become ready at ${url}`));
          return;
        }
        setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

const vite = spawn(
  "npx",
  ["vite", "--host", host, "--port", String(port), "--strictPort"],
  { cwd: root, stdio: "inherit", shell: true },
);

let electronProc = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electronProc && !electronProc.killed) electronProc.kill();
  if (vite && !vite.killed) vite.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  await waitForServer();
  electronProc = spawn("npx", ["electron", "."], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, LB_DEV_SERVER: url },
  });
  electronProc.on("exit", (code) => shutdown(code ?? 0));
  vite.on("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });
} catch (err) {
  console.error(err);
  shutdown(1);
}
