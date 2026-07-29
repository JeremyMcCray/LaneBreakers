import {
  newSim, Store, history, tourNew, tourDraft, tourDraftDone
} from "../src/headless.ts";
import { LBTrain, lbSimMatch } from "../src/ai/neural/train.ts";

const res = lbSimMatch(["vex", "vex"], [{ kind: "bot" }, { kind: "bot" }], 7, 8);
const T = tourNew("1v1", 2);
tourDraft(T, T.first, "vex");
console.log(
  JSON.stringify({
    train: !!LBTrain && !!res && res.duration > 0,
    store: !!Store,
    hist: Array.isArray(history()),
    tour: T.phase === "draft" && T.turn === 1,
    sim: typeof newSim === "function",
    draftDone: tourDraftDone(T) === false,
  }),
);
