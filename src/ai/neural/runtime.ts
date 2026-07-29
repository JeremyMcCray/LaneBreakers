// @ts-nocheck
/**
 * Neural AI runtime — port of ../Lanebreakers/ai/inject/runtime.js
 * Brains load from baked.json (extracted from lanebreaker-ai.html via bake.js).
 */
import { HEROES } from "../../data/heroes";
import { ITEMS } from "../../data/items";
import { TOWER_X, BASE_X, armorMult } from "../../data/world";
import { canCast, castAbility } from "../../sim/abilities";
import { buyItem, useItem } from "../../sim/shop";
import { botThink } from "../bot";
import * as LBBrain from "./brain";
import baked from "./brains/baked.json";
import { G } from "../../app/state";
import { Store } from "../../app/persistence";

export const LB_API = {
  HEROES,
  ITEMS,
  TOWER_X,
  BASE_X,
  canCast,
  castAbility,
  buyItem,
  useItem,
  armorMult,
};

export const LB_BAKED = baked;

/** Difficulty ladder — snapshots along one training run, not handicaps. */
export const LB_TIERS = [
  {
    id: "classic",
    name: "Classic",
    src: null,
    noise: 0,
    desc: "The original hand-written bot — currently still the strongest opponent here. No learning involved.",
  },
  {
    id: "rookie",
    name: "Rookie",
    src: "rookie",
    noise: 0.3,
    desc: "The network very early in training, plus some hesitation. Farms a bit, misreads fights.",
  },
  {
    id: "steady",
    name: "Steady",
    src: "steady",
    noise: 0.12,
    desc: "A little further along. Last-hits reliably, still shaky about when to commit.",
  },
  {
    id: "sharp",
    name: "Sharp",
    src: "sharp",
    noise: 0,
    desc: "Later checkpoint, no hesitation. Pressures the tower and takes trades.",
  },
  {
    id: "brutal",
    name: "Brutal",
    src: "brutal",
    noise: 0,
    desc:
      "The best brain from the training run that shipped with this build. Beats Rookie comfortably; " +
      "does not yet beat Classic. Train longer and re-bake to move this bar.",
  },
];

export const LB_BRAIN_CACHE = {};

export function lbListBrains() {
  const out = [];
  for (const t of LB_TIERS) {
    if (t.src && !(LB_BAKED.brains && LB_BAKED.brains[t.src])) continue;
    out.push({ id: t.id, name: t.name, desc: t.desc, kind: "tier" });
  }
  for (const k in LB_BAKED.schools || {}) {
    out.push({
      id: "school:" + k,
      name: k.charAt(0).toUpperCase() + k.slice(1),
      desc: (LB_BAKED.schools[k].desc || "A trained school."),
      kind: "school",
    });
  }
  for (const k of lbLocalBrainNames()) {
    out.push({
      id: "local:" + k,
      name: k + " (yours)",
      desc: "Trained by you in this browser.",
      kind: "local",
    });
  }
  return out;
}

export function lbLocalBrainNames() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("lb.brain.")) out.push(k.slice(9));
    }
  } catch {
    /* ignore */
  }
  return out.sort();
}

export function lbGetBrain(id) {
  if (!id || id === "classic") return null;
  if (LB_BRAIN_CACHE[id]) return LB_BRAIN_CACHE[id];
  let raw = null;
  if (id.startsWith("local:")) {
    try {
      raw = JSON.parse(localStorage.getItem("lb.brain." + id.slice(6)));
    } catch {
      /* ignore */
    }
  } else if (id.startsWith("school:")) {
    raw = (LB_BAKED.schools || {})[id.slice(7)];
    if (raw) raw = raw.brain;
  } else {
    const t = LB_TIERS.find((x) => x.id === id);
    raw = t && t.src ? (LB_BAKED.brains || {})[t.src] : null;
  }
  if (!raw) return null;
  try {
    const g = LBBrain.deserialize(raw);
    LB_BRAIN_CACHE[id] = g;
    return g;
  } catch (e) {
    console.warn("bad brain", id, e);
    return null;
  }
}

export function lbTierNoise(id) {
  const t = LB_TIERS.find((x) => x.id === id);
  return t ? t.noise || 0 : 0;
}

export function lbCurrentAiSpec() {
  const id = G.aiTier || "classic";
  const genome = lbGetBrain(id);
  if (!genome) return null;
  return { genome, opts: { noise: lbTierNoise(id) } };
}

/** Game loop entry: neural when a genome is attached, else classic bot. */
export function aiThink(S, p, dt) {
  const spec = p.aiSpec;
  if (spec && spec.genome) {
    LBBrain.think(LB_API, S, p, dt, spec.genome, spec.opts);
  } else {
    botThink(S, p, dt);
  }
}

export function lbSetAiTier(v) {
  G.aiTier = v || "classic";
  Store.set("lb.aiTier", G.aiTier);
  lbAiDesc();
}

export function lbBuildAiSelect() {
  const sel = document.getElementById("aiTier");
  if (!sel) return;
  const cur = G.aiTier || Store.get("lb.aiTier", "classic");
  G.aiTier = cur;
  const list = lbListBrains();
  sel.innerHTML = list
    .map(
      (b) =>
        `<option value="${b.id}"${b.id === cur ? " selected" : ""}>${b.name}</option>`,
    )
    .join("");
  sel.onchange = () => lbSetAiTier(sel.value);
  lbAiDesc();
}

export function lbAiDesc() {
  const el = document.getElementById("aiTierDesc");
  if (!el) return;
  const id = G.aiTier || "classic";
  const hit = lbListBrains().find((b) => b.id === id);
  el.textContent = hit
    ? hit.desc
    : "Classic hand-coded bot.";
}

export { LBBrain };
