/* =====================================================================
   IN-GAME TRAINER  —  injected into lanebreaker.html by ai/bake.js
   =====================================================================
   The same evolution loop as ai/train.js, running inside the browser so
   you can watch the curve climb. It is single-threaded and therefore a
   good deal slower than the Node trainer — use this one to understand
   what is happening, and `node ai/train.js` when you actually want a
   strong bot.

   To keep the page responsive it works in slices: every animation frame
   it runs matches for about 22 milliseconds, then hands control back to
   the browser. Nothing is blocked; you can leave the tab open and come
   back to it.
   ===================================================================== */
const LBTrain = {
  cfg: {recipe:'balanced', pop:20, trials:4, maxTime:240,
        elite:0.25, mutRate:0.18, sigma:0.22, botShare:0.5, fresh:0.06, hofEvery:5},
  state:'idle',           // idle | running | paused | done
  pop:[], hof:[], gen:0, hist:[],
  queue:[], acc:[], stats:[], trials:[],
  matches:0, matchT:0, rate:0, seedCounter:1,

  /* ---------------- lifecycle ---------------- */
  init(){
    this.pop = [];
    const rng = LBBrain.makeRng(0xC0FFEE);
    for (let i=0;i<this.cfg.pop;i++) this.pop.push(LBBrain.randomGenome(LB_API, rng));
    this.hof = []; this.gen = 0; this.hist = []; this.matches = 0; this.matchT = 0;
    this.beginGeneration();
  },
  start(){
    if (!this.pop.length) this.init();
    this.state = 'running';
    this.tickHandle = this.tickHandle || requestAnimationFrame(()=>LBTrain.frame());
    lbTrainUI();
  },
  pause(){ this.state = 'paused'; lbTrainUI(); },
  reset(){ this.state='idle'; this.pop=[]; this.gen=0; this.hist=[]; this.matches=0;
           this.queue=[]; lbTrainUI(); lbTrainDraw(); },

  /* ---------------- one generation ---------------- */
  beginGeneration(){
    const rng = LBBrain.makeRng(0x51EED ^ (this.gen*2654435761));
    const elites = this.pop.slice(0, Math.max(1, Math.floor(this.cfg.pop*this.cfg.elite)));
    this.trials = [];
    for (let i=0;i<this.cfg.trials;i++){
      // mirror matchups a third of the time — same hero on both sides
      // isolates skill from hero balance
      const h1 = HERO_IDS[Math.floor(rng()*HERO_IDS.length)%HERO_IDS.length];
      const h2 = (i%3===0) ? h1 : HERO_IDS[Math.floor(rng()*HERO_IDS.length)%HERO_IDS.length];
      let opp;
      const roll = rng();
      if (roll < this.cfg.botShare || (this.gen===0)) opp = {kind:'bot'};
      else if (this.hof.length && roll < this.cfg.botShare + (1-this.cfg.botShare)/2)
        opp = {kind:'nn', genome:this.hof[Math.floor(rng()*this.hof.length)%this.hof.length]};
      else opp = {kind:'nn', genome:elites[Math.floor(rng()*elites.length)%elites.length]};
      this.trials.push({seed:(this.gen*7919 + i*104729 + 13)>>>0, picks:[h1,h2], opp, side:i%2});
    }
    this.acc   = new Array(this.pop.length).fill(0);
    this.stats = this.pop.map(()=>({wins:0, botWins:0, botGames:0, cs:0, kills:0, deaths:0,
                                    macro:new Array(LBBrain.N_MACRO).fill(0)}));
    this.queue = [];
    for (let g=0; g<this.pop.length; g++)
      for (let t=0; t<this.trials.length; t++) this.queue.push({g,t});
    this.queueTotal = this.queue.length;
  },

  finishGeneration(){
    const n = this.trials.length;
    const order = this.acc.map((v,i)=>({f:v/n, i})).sort((a,b)=>b.f-a.f);
    const best = order[0];
    const bs = this.stats[best.i];
    const mean = this.acc.reduce((a,b)=>a+b,0)/(n*this.pop.length);
    this.hist.push({
      gen:this.gen, best:best.f, mean:mean,
      botWR: bs.botGames ? bs.botWins/bs.botGames : null,
      cs: bs.cs/n, kills: bs.kills/n, deaths: bs.deaths/n,
      macro: bs.macro.map(v=>v/n)
    });
    this.bestGenome = this.pop[best.i];
    this.bestFitness = best.f;

    if (this.gen % this.cfg.hofEvery === 0){
      this.hof.push(LBBrain.cloneGenome(this.bestGenome));
      if (this.hof.length > 10) this.hof.shift();
    }

    /* breed */
    const rng = LBBrain.makeRng(0xBEEF ^ (this.gen*40503));
    const nElite = Math.max(2, Math.floor(this.cfg.pop*this.cfg.elite));
    const nFresh = Math.floor(this.cfg.pop*this.cfg.fresh);
    const next = order.slice(0,nElite).map(o=>LBBrain.cloneGenome(this.pop[o.i]));
    const half = Math.max(2, Math.floor(this.cfg.pop/2));
    const tournament = ()=>{
      let bi=-1, bf=-Infinity;
      for (let k=0;k<3;k++){
        const c = Math.floor(rng()*half)%half;
        if (order[c].f > bf){ bf=order[c].f; bi=order[c].i; }
      }
      return this.pop[bi];
    };
    while (next.length < this.cfg.pop - nFresh){
      const pa=tournament(), pb=tournament();
      let child = rng()<0.65 ? LBBrain.crossover(pa,pb,rng) : LBBrain.cloneGenome(pa);
      next.push(LBBrain.mutate(child, rng, this.cfg.mutRate, this.cfg.sigma));
    }
    while (next.length < this.cfg.pop) next.push(LBBrain.randomGenome(LB_API, rng));

    this.pop = next;
    this.gen++;
    this.beginGeneration();
    lbTrainDraw(); lbTrainUI();
  },

  /* ---------------- the time-sliced worker ---------------- */
  frame(){
    this.tickHandle = requestAnimationFrame(()=>LBTrain.frame());
    if (this.state !== 'running') return;
    const budget = 22;                       // ms of work per frame
    const t0 = performance.now();
    while (performance.now() - t0 < budget){
      if (!this.queue.length){ this.finishGeneration(); break; }
      const job = this.queue.shift();
      this.runOne(job);
      this.matches++;
    }
    const dt = performance.now() - t0;
    this.matchT += dt;
    if (this.matches > 0) this.rate = this.matches / (this.matchT/1000);
    lbTrainUI(true);
  },

  runOne(job){
    const genome = this.pop[job.g];
    const tr = this.trials[job.t];
    const mySlot = tr.side;
    const agents = [];
    for (let s=0;s<2;s++){
      if (s === mySlot) agents[s] = {kind:'nn', genome};
      else agents[s] = tr.opp.kind==='bot' ? {kind:'bot'} : {kind:'nn', genome:tr.opp.genome};
    }
    const res = lbSimMatch(tr.picks, agents, tr.seed, this.cfg.maxTime);
    const me = res.players[mySlot];
    const recipe = LB_RECIPES[this.cfg.recipe] || LB_RECIPES.balanced;
    this.acc[job.g] += LBBrain.score(recipe, me, res, res.players[1-mySlot]);
    const st = this.stats[job.g];
    st.wins += me.won; st.cs += me.cs; st.kills += me.kills; st.deaths += me.deaths;
    if (tr.opp.kind==='bot'){ st.botGames++; st.botWins += me.won; }
    for (let i=0;i<st.macro.length;i++) st.macro[i] += me.macroPct[i];
  }
};

/* ---------------------------------------------------------------------
   Run one match with no rendering. Math.random is swapped for a seeded
   generator so the match is reproducible and two bots can be compared on
   identical luck — then put back exactly as it was.
   --------------------------------------------------------------------- */
function lbSimMatch(picks, agents, seed, maxTime){
  const realRandom = Math.random;
  Math.random = LBBrain.makeRng(seed);
  try{
    const S = newSim(picks.map((h,i)=>({h, tm:i%2})), '1v1');
    S.noFx = true;          // training matches are never drawn — skip the effect objects
    const towerStart = {};
    for (const o of S.ents) if (o.type==='tower') towerStart[o.team] = o.hp;
    const TICK = 1/60;
    const laneSum = [0,0], laneN = [0,0];
    let acc = 0;
    while (!S.over && S.t < maxTime){
      for (const p of S.players){
        const a = agents[p.slot];
        if (!a) continue;
        if (a.kind==='bot') botThink(S,p,TICK);
        else LBBrain.think(LB_API, S, p, TICK, a.genome, null);
      }
      simStep(S, TICK);
      S.fx.length = 0;
      acc += TICK;
      if (acc >= 0.5){
        acc = 0;
        for (const p of S.players){
          if (!p.hero || p.hero.dead) continue;
          const dir = p.team===0?1:-1;
          const my = TOWER_X[p.team], fo = TOWER_X[1-p.team];
          laneSum[p.slot] += ((p.hero.x-my)*dir)/Math.abs(fo-my);
          laneN[p.slot]++;
        }
      }
    }
    /* decide a capped match the way the game decides one that runs out of
       clock — kills, then net worth, then last hits. If we left it a draw,
       the win reward would never be paid and the bots would never learn
       that winning was the point. */
    if (!S.over){
      const sum = (t,f)=>S.players.filter(p=>p.team===t).reduce((a,p)=>a+f(p),0);
      let w;
      if (S.teamKills[0] !== S.teamKills[1]) w = S.teamKills[0] > S.teamKills[1] ? 0 : 1;
      else {
        const na = sum(0,netWorth), nb = sum(1,netWorth);
        if (Math.abs(na-nb) > 50) w = na > nb ? 0 : 1;
        else { const ca=sum(0,p=>p.cs), cb=sum(1,p=>p.cs); w = ca!==cb ? (ca>cb?0:1) : 0; }
      }
      S.winner = w; S.over = true;
    }

    const towerDmg = [0,0];
    for (const o of S.ents){
      if (o.type!=='tower') continue;
      towerDmg[1-o.team] += (towerStart[o.team] - Math.max(0,o.hp));
    }
    const players = S.players.map(p=>{
      const mem = p.nn;
      const macro = mem && mem.macroTime ? mem.macroTime.slice() : new Array(LBBrain.N_MACRO).fill(0);
      const tot = macro.reduce((a,b)=>a+b,0) || 1;
      return {
        slot:p.slot, team:p.team, heroId:p.heroId,
        kills:p.kills, deaths:p.deaths, assists:p.assists,
        cs:p.cs, denies:p.denies, lvl:p.lvl, gold:p.gold, netWorth:netWorth(p),
        dmgHero:p.dmgHero, dmgAll:p.dmgAll, healed:p.healed,
        towerDmg:towerDmg[p.team],
        won: S.winner===p.team ? 1 : 0, draw: S.winner<0 ? 1 : 0,
        laneAvg: laneN[p.slot] ? laneSum[p.slot]/laneN[p.slot] : 0,
        macroPct: macro.map(v=>v/tot)
      };
    });
    return {winner:S.winner, duration:S.t, players};
  } finally {
    Math.random = realRandom;
  }
}

/* ---------------------------------------------------------------------
   The graph
   --------------------------------------------------------------------- */
function lbTrainDraw(){
  const cv = document.getElementById('trainCanvas');
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w*dpr){ cv.width = w*dpr; cv.height = h*dpr; }
  const c = cv.getContext('2d');
  c.setTransform(dpr,0,0,dpr,0,0);
  c.clearRect(0,0,w,h);

  const H = LBTrain.hist;
  const pad = {l:44, r:44, t:14, b:22};
  const gw = w - pad.l - pad.r, gh = h - pad.t - pad.b;

  c.strokeStyle = '#233049'; c.lineWidth = 1;
  c.strokeRect(pad.l, pad.t, gw, gh);
  c.font = '9px ui-monospace, Consolas, monospace';

  if (H.length < 2){
    c.fillStyle = '#4a5670'; c.font='11px inherit';
    c.fillText(LBTrain.state==='running' ? 'running the first generation…'
                                         : 'press START and watch this climb',
               pad.l+12, pad.t+gh/2);
    return;
  }

  let lo = Infinity, hi = -Infinity;
  for (const p of H){ lo = Math.min(lo,p.mean,p.best); hi = Math.max(hi,p.best,p.mean); }
  if (hi-lo < 1) hi = lo+1;
  const pad2 = (hi-lo)*0.08; lo -= pad2; hi += pad2;
  const X = i => pad.l + (i/(H.length-1))*gw;
  const Y = v => pad.t + gh - ((v-lo)/(hi-lo))*gh;

  // gridlines
  c.strokeStyle = '#161e30';
  for (let k=1;k<4;k++){
    const y = pad.t + gh*k/4;
    c.beginPath(); c.moveTo(pad.l,y); c.lineTo(pad.l+gw,y); c.stroke();
  }

  // mean fitness
  c.strokeStyle = '#3d5580'; c.lineWidth = 1.5; c.beginPath();
  H.forEach((p,i)=> i?c.lineTo(X(i),Y(p.mean)):c.moveTo(X(i),Y(p.mean)));
  c.stroke();
  // best fitness
  c.strokeStyle = '#5ef0c8'; c.lineWidth = 2; c.beginPath();
  H.forEach((p,i)=> i?c.lineTo(X(i),Y(p.best)):c.moveTo(X(i),Y(p.best)));
  c.stroke();

  // win rate against the old bot, on its own 0..100% scale
  const wr = H.filter(p=>p.botWR!==null);
  if (wr.length>1){
    c.strokeStyle = '#ffcc55'; c.lineWidth = 1.5; c.setLineDash([3,3]);
    c.beginPath();
    H.forEach((p,i)=>{
      if (p.botWR===null) return;
      const y = pad.t + gh - p.botWR*gh;
      c.lineTo(X(i), y);
    });
    c.stroke(); c.setLineDash([]);
    c.fillStyle='#ffcc55';
    for (let k=0;k<=2;k++){
      const v=k/2; c.fillText(Math.round(v*100)+'%', pad.l+gw+6, pad.t+gh-v*gh+3);
    }
  }
  c.fillStyle = '#4a5670';
  c.fillText(Math.round(hi), 4, pad.t+7);
  c.fillText(Math.round(lo), 4, pad.t+gh);
  c.fillText('gen 0', pad.l, h-6);
  c.fillText('gen '+H[H.length-1].gen, pad.l+gw-34, h-6);

  // legend
  c.fillStyle='#5ef0c8'; c.fillText('■ best', pad.l+8, pad.t+11);
  c.fillStyle='#3d5580'; c.fillText('■ average', pad.l+52, pad.t+11);
  c.fillStyle='#ffcc55'; c.fillText('┈ beats old bot', pad.l+112, pad.t+11);
}

/* ---------------------------------------------------------------------
   The panel
   --------------------------------------------------------------------- */
let _lbUiT = 0;
function lbTrainUI(throttle){
  const t = performance.now();
  if (throttle && t - _lbUiT < 200) return;
  _lbUiT = t;
  const set = (id,v)=>{ const el=document.getElementById(id); if (el) el.textContent = v; };
  const last = LBTrain.hist[LBTrain.hist.length-1];

  set('trainGen', LBTrain.gen);
  set('trainBest', last ? Math.round(last.best) : '—');
  set('trainWR', last && last.botWR!==null ? Math.round(last.botWR*100)+'%' : '—');
  set('trainRate', LBTrain.rate ? LBTrain.rate.toFixed(1) : '—');
  set('trainMatches', LBTrain.matches);
  set('trainCS', last ? last.cs.toFixed(0) : '—');

  const prog = document.getElementById('trainProg');
  if (prog && LBTrain.queueTotal){
    const done = LBTrain.queueTotal - LBTrain.queue.length;
    prog.style.width = Math.round(100*done/LBTrain.queueTotal)+'%';
  }
  const bs = document.getElementById('btnTrainStart');
  if (bs) bs.textContent = LBTrain.state==='running' ? 'Pause' : (LBTrain.gen? 'Resume' : 'Start training');

  const st = document.getElementById('trainStatus');
  if (st){
    if (LBTrain.state==='running')
      st.textContent = 'Generation '+LBTrain.gen+' in progress — '+
        (LBTrain.queueTotal-LBTrain.queue.length)+' / '+LBTrain.queueTotal+' matches played.';
    else if (LBTrain.gen)
      st.textContent = 'Paused after '+LBTrain.gen+' generations. Your progress is kept — press Resume.';
    else
      st.textContent = 'Nothing trained yet.';
  }
  const style = document.getElementById('trainStyle');
  if (style && last){
    const top = last.macro.map((v,i)=>[LBBrain.MACRO_NAMES[i],v])
      .sort((a,b)=>b[1]-a[1]).slice(0,3).filter(x=>x[1]>0.02)
      .map(([n,v])=>n.toLowerCase().replace('_',' ')+' '+Math.round(v*100)+'%').join(' · ');
    style.textContent = top || '—';
  }
}

/* ---------------- buttons ---------------- */
function lbTrainToggle(){
  if (LBTrain.state==='running') LBTrain.pause();
  else LBTrain.start();
}
function lbTrainReset(){
  if (LBTrain.gen && !confirm('Throw away '+LBTrain.gen+' generations of training?')) return;
  LBTrain.reset();
}
function lbTrainSetRecipe(v){
  LBTrain.cfg.recipe = v;
  const d = document.getElementById('trainRecipeDesc');
  if (d) d.textContent = (LB_RECIPES[v] && LB_RECIPES[v].desc) || '';
  if (LBTrain.gen && LBTrain.state!=='idle')
    addToast('Recipe changed — fitness numbers before now are on a different scale');
}
function lbTrainSave(){
  const el = document.getElementById('trainName');
  let name = (el && el.value.trim()) || ('mybot-g'+LBTrain.gen);
  name = name.replace(/[^\w\- ]/g,'').slice(0,24);
  if (!LBTrain.bestGenome) return addToast('Train at least one generation first');
  try{
    localStorage.setItem('lb.brain.'+name,
      JSON.stringify(LBBrain.serialize(LBTrain.bestGenome,
        {recipe:LBTrain.cfg.recipe, gen:LBTrain.gen, fitness:LBTrain.bestFitness,
         trained:new Date().toISOString()})));
    delete LB_BRAIN_CACHE['local:'+name];
    addToast('Saved "'+name+'" — pick it as your practice opponent');
    lbBuildAiSelect();
    lbTrainList();
  }catch(e){ addToast('Could not save: '+e.message); }
}
function lbTrainExport(){
  if (!LBTrain.bestGenome) return addToast('Nothing to export yet');
  const blob = new Blob([JSON.stringify(LBBrain.serialize(LBTrain.bestGenome,
    {recipe:LBTrain.cfg.recipe, gen:LBTrain.gen}))], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lanebreaker-brain-'+LBTrain.cfg.recipe+'-gen'+LBTrain.gen+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function lbTrainImport(input){
  const f = input.files && input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const o = JSON.parse(r.result);
      LBBrain.deserialize(o);                        // throws if malformed
      const name = (f.name.replace(/\.json$/,'')).slice(0,24);
      localStorage.setItem('lb.brain.'+name, JSON.stringify(o));
      addToast('Imported "'+name+'"');
      lbBuildAiSelect(); lbTrainList();
    }catch(e){ addToast('That is not a Lanebreaker brain file'); }
  };
  r.readAsText(f);
  input.value='';
}
function lbTrainPlay(){
  if (!LBTrain.bestGenome) return addToast('Train at least one generation first');
  localStorage.setItem('lb.brain.__current',
    JSON.stringify(LBBrain.serialize(LBTrain.bestGenome, {gen:LBTrain.gen})));
  delete LB_BRAIN_CACHE['local:__current'];
  G.aiTier = 'local:__current';
  Store.set('lb.aiTier', G.aiTier);
  LBTrain.pause();
  startPractice('1v1');
}
function lbTrainList(){
  const box = document.getElementById('trainList'); if (!box) return;
  const names = lbLocalBrainNames().filter(n=>n!=='__current');
  if (!names.length){ box.innerHTML = '<span style="color:#4a5670">No saved brains in this browser yet.</span>'; return; }
  box.innerHTML = names.map(n=>{
    let meta = {};
    try{ meta = JSON.parse(localStorage.getItem('lb.brain.'+n)); }catch(e){}
    return '<div class="seat"><span class="wh">'+n+'</span>'+
           '<span class="hr" style="font-weight:400;color:var(--dim)">'+
           (meta.recipe||'?')+' · gen '+(meta.gen!=null?meta.gen:'?')+'</span>'+
           '<button class="swap" onclick="lbTrainDelete(\''+n+'\')">Delete</button></div>';
  }).join('');
}
function lbTrainDelete(n){
  localStorage.removeItem('lb.brain.'+n);
  delete LB_BRAIN_CACHE['local:'+n];
  lbTrainList(); lbBuildAiSelect();
}

function lbBuildRecipeSelect(){
  const sel = document.getElementById('trainRecipe'); if (!sel) return;
  const keys = Object.keys(LB_RECIPES||{}).filter(k=>k[0]!=='_');
  if (!keys.length){
    // only possible if bake.js ran with an unreadable recipes.json
    sel.innerHTML = '<option>none found</option>';
    const d = document.getElementById('trainRecipeDesc');
    if (d) d.innerHTML = '<b style="color:var(--red)">No recipes were baked into this build.</b> '+
      'Check ai/recipes.json, then run <b>node ai/bake.js</b> again.';
    return;
  }
  if (!keys.includes(LBTrain.cfg.recipe)) LBTrain.cfg.recipe = keys[0];
  sel.innerHTML = keys.map(k=>
    '<option value="'+k+'"'+(k===LBTrain.cfg.recipe?' selected':'')+'>'+k+'</option>').join('');
  lbTrainSetRecipe(sel.value || LBTrain.cfg.recipe);
}
function lbTrainOpen(){
  lbBuildRecipeSelect(); lbTrainList(); lbTrainUI(); lbTrainDraw();
}

/* ---------------- opponent picker on the main menu ---------------- */
function lbBuildAiSelect(){
  const sel = document.getElementById('aiTier'); if (!sel) return;
  const opts = lbListBrains();
  const cur = G.aiTier || 'classic';
  sel.innerHTML = opts.map(o=>
    '<option value="'+o.id+'"'+(o.id===cur?' selected':'')+'>'+o.name+'</option>').join('');
  if (!opts.some(o=>o.id===cur)){ G.aiTier='classic'; sel.value='classic'; }
  lbAiDesc();
}
function lbAiDesc(){
  const sel = document.getElementById('aiTier');
  const d = document.getElementById('aiTierDesc');
  if (!sel || !d) return;
  const o = lbListBrains().find(x=>x.id===sel.value);
  d.textContent = o ? o.desc : '';
}
function lbSetAiTier(v){
  G.aiTier = v;
  Store.set('lb.aiTier', v);
  lbAiDesc();
}
