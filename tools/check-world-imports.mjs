import fs from "fs";
import path from "path";

const world = fs.readFileSync("src/data/world.ts", "utf8");
const exported = [...world.matchAll(/export (?:const|let|function) (\w+)/g)].map((m) => m[1]);

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

for (const f of walk("src")) {
  if (f.replace(/\\/g, "/").endsWith("data/world.ts")) continue;
  const s = fs.readFileSync(f, "utf8");
  const imported = new Set();
  for (const b of s.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](?:\.\.\/)+data\/world['"]/gs)) {
    for (const part of b[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n) imported.add(n);
    }
  }
  const body = s.replace(/import[\s\S]*?from\s*['"][^'"]+['"];?/g, "");
  const missing = exported.filter(
    (name) => name.length > 2 && new RegExp(`\\b${name}\\b`).test(body) && !imported.has(name),
  );
  if (missing.length) console.log(f + ": " + missing.join(", "));
}
