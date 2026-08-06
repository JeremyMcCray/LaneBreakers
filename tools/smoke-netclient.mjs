// @ts-nocheck
/* Net-client smoke: act as a REAL 2v2 online client through the end of a match —
   JSON-roundtripped snapshots (as PeerJS would deliver them), spawnFx for every
   effect, full render() each frame, then the end card and every stats tab.
   Any client-side throw fails the run with its stack. */
const ctxStub = new Proxy({}, {
  get(t, k){
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient')
      return () => ({ addColorStop(){} });
    return () => {};
  },
  set(){ return true; },
});
const elStub = () => new Proxy({
    getContext(){ return ctxStub; },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    style: new Proxy({}, { set(){ return true; }, get(){ return ''; } }),
    dataset: {},
    querySelectorAll(){ return []; },
    querySelector(){ return elStub(); },
    appendChild(){},
    addEventListener(){},
    remove(){},
    getBoundingClientRect(){ return {left:0,top:0,width:100,height:100}; },
  }, {
    get(t, k){ return t[k]; },
    set(t, k, v){ t[k] = v; return true; },
  });
const els = new Map();
globalThis.document = {
  getElementById(id){ if (!els.has(id)) els.set(id, elStub()); return els.get(id); },
  createElement(){ return elStub(); },
  addEventListener(){},
  head: elStub(), body: elStub(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.navigator = {};
globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
globalThis.requestAnimationFrame = () => 0;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.devicePixelRatio = 1;

const { newSim, simStep, buildSnapshot } = await import("../src/sim/engine.ts");
const { botThink } = await import("../src/ai/bot.ts");
const { G } = await import("../src/app/state.ts");
const { spawnFx } = await import("../src/render/fx.ts");
const { render } = await import("../src/render/view.ts");
const { showEnd } = await import("../src/ui/endCard.ts");
const { renderMatchStats } = await import("../src/ui/matchStats.ts");
const { onNetMsg } = await import("../src/app/netplay.ts");

const TICK = 1/60;
let failed = 0;

function clientFrame(S, mySlot){
  // exactly what a non-host does per frame: parse snapshot, fx, view, render
  const raw = buildSnapshot(S, 1);
  raw.f = S.fx;                                   // netFx ride-along
  const m = JSON.parse(JSON.stringify(raw));
  try {
    if (m.f) for (const f of m.f) spawnFx(f);
    G.view = m; G.latest = m;
    render(TICK);
    if (m.ov && G.endShown === false) showEnd(m.w);
  } catch (err){
    failed++;
    console.log('CLIENT FRAME THREW (slot '+mySlot+', t='+m.t+', ov='+m.ov+'):');
    console.log(err.stack.split('\n').slice(0, 8).join('\n'));
    return false;
  }
  return true;
}

async function runMatch(label, endBy){
  console.log('\n== ' + label + ' ==');
  const S = newSim([
    {h:'vex', tm:0}, {h:'sable', tm:1}, {h:'gruk', tm:0}, {h:'sable', tm:1},
  ], '2v2');
  S.fastGold = true;
  // be client slot 1 (team 1)
  G.mode = 'client'; G.started = true; G.endShown = false; G.paused = false;
  G.mySlot = 1; G.myTeam = 1; G.tour = null; G.shopOpen = false;
  G.hud = { ab: [], items: [] };
  G.cw = 1600; G.ch = 900; G.dpr = 1;
  G.parts = []; G.nums = []; G.rings = []; G.lines = [];
  G.buf = []; G.view = null; G.latest = null;
  G.cam = {x:0, y:0}; G.pred = {init:false};
  let ticks = 0, overFrames = 0;
  while (ticks < 60*60*20 && overFrames < 90){
    for (const p of S.players) botThink(S, p, TICK);
    simStep(S, TICK);
    if (endBy === 'tower' && S.t > 60 && !S.over)
      for (const e of S.ents) if (e.type === 'tower' && e.team === 0) e.hp = Math.min(e.hp, 30);
    if (ticks % 3 === 0){                        // 20 Hz snapshots, like the wire
      if (!clientFrame(S, 1)) return;
      // keep exercising frames after the end too — hosts keep broadcasting
      if (S.over) overFrames++;
    }
    S.fx = [];
    ticks++;
  }
  console.log('over =', S.over, 'how =', S.how, 't =', Math.round(S.t) + 's',
              ' endShown =', G.endShown, ' frames-after-end =', overFrames);
  // poke the stats tabs like a player would
  for (const tab of ['dmg','time','sum']){
    try { renderMatchStats(G.latest, '<i>s</i>', tab); }
    catch (err){ failed++; console.log('TAB '+tab+' THREW:', err.stack.split('\n').slice(0,6).join('\n')); }
  }
}

await runMatch('2v2 ended by kills', 'kills');
await runMatch('2v2 ended by tower fall', 'tower');

/* The wire dies at the worst moment: the heavyweight final snapshot never
   arrives, only the tiny {k:'over'} verdict does. The card must still go up,
   and it must upgrade itself when a late final snapshot straggles in. */
console.log('\n== degraded wire: only the tiny over-message survives ==');
{
  const S = newSim([
    {h:'vex', tm:0}, {h:'sable', tm:1}, {h:'gruk', tm:0}, {h:'sable', tm:1},
  ], '2v2');
  S.noFx = true; S.fastGold = true;
  G.mode = 'client'; G.started = true; G.endShown = false; G.paused = false;
  G.mySlot = 1; G.myTeam = 1; G.tour = null; G.shopOpen = false;
  G.hud = { ab: [], items: [] };
  G.cw = 1600; G.ch = 900; G.dpr = 1;
  G.parts = []; G.nums = []; G.rings = []; G.lines = [];
  G.buf = []; G.view = null; G.latest = null; G.endHadDetail = false;
  G.cam = {x:0, y:0}; G.pred = {init:false};
  let preOver = null, ticks = 0;
  while (!S.over && ticks < 60*60*20){
    for (const p of S.players) botThink(S, p, TICK);
    simStep(S, TICK); S.fx = [];
    if (!S.over && ticks % 3 === 0) preOver = JSON.parse(JSON.stringify(buildSnapshot(S, 1)));
    ticks++;
  }
  try {
    onNetMsg({ k:'s', ...preOver });               // last mid-match snapshot lands…
    G.view = G.latest;
    onNetMsg({ k:'over', w:S.winner, hw:S.how }); // …then only the verdict survives
    if (!G.endShown) { failed++; console.log('FAIL: over-message alone did not raise the end card'); }
    else if (G.endHadDetail) { failed++; console.log('FAIL: detail flag set without a final snapshot'); }
    else console.log('end card raised from the tiny over-message alone: OK');
    const fin = JSON.parse(JSON.stringify(buildSnapshot(S, 1))); fin.f = [];
    onNetMsg({ k:'s', ...fin });                   // the fat snapshot finally arrives
    if (!G.endHadDetail) { failed++; console.log('FAIL: late final snapshot did not upgrade the stats'); }
    else console.log('late final snapshot upgraded the stats panel: OK');
  } catch (err){
    failed++;
    console.log('DEGRADED-WIRE PATH THREW:', err.stack.split('\n').slice(0,8).join('\n'));
  }
}
console.log(failed ? '\n' + failed + ' CLIENT CRASH(ES) REPRODUCED' : '\nNO CLIENT CRASH REPRODUCED');
process.exit(failed ? 1 : 0);
