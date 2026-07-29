/**
 * Replace common UTF-8→Latin-1 mojibake sequences in src/, index.html, ai/inject.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function fixText(t) {
  return t
    .replace(/\u00e2\u20ac\u201d/g, "\u2014")
    .replace(/\u00e2\u20ac\u201c/g, "\u2013")
    .replace(/\u00e2\u20ac\u00a6/g, "\u2026")
    .replace(/\u00c2\u00b7/g, "\u00b7")
    .replace(/\u00e2\u2020\u2018/g, "\u2191")
    .replace(/\u00e2\u2020\u201c/g, "\u2193")
    .replace(/\u00e2\u00a4\u00b7/g, "\u21b3")
    .split("â€”").join("—")
    .split("â€“").join("–")
    .split("â€¦").join("…")
    .split("Â·").join("·")
    .split("â†‘").join("↑")
    .split("â†“").join("↓")
    .split("â¤·").join("↳");
}

function fixFile(p) {
  const before = fs.readFileSync(p, "utf8");
  const t = fixText(before);
  if (t !== before) {
    fs.writeFileSync(p, t, "utf8");
    console.log("fixed", path.relative(repo, p));
  }
}

function walk(d, re) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p, re);
    else if (re.test(ent.name)) fixFile(p);
  }
}

walk(path.join(repo, "src"), /\.(ts|css)$/);
fixFile(path.join(repo, "index.html"));
walk(path.join(repo, "ai", "inject"), /\.html$/);
console.log("mojibake pass done");
