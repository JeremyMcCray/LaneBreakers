/* =====================================================================
   NEURAL AI RUNTIME  —  injected into lanebreaker.html by ai/bake.js
   =====================================================================
   Everything below is what lets the game play a TRAINED brain instead of
   the hand-written bot. The brains themselves are produced by ai/train.js
   and pasted into LB_BAKED further down by `node bake.js`.
   ===================================================================== */

/* the handful of game functions the brain reaches into */
const LB_API = {HEROES, ITEMS, TOWER_X, BASE_X, canCast, castAbility, buyItem, useItem, armorMult};

/* ---------------------------------------------------------------------
   Difficulty ladder.

   These are not hand-tuned handicaps. Each tier is a SNAPSHOT of the same
   AI taken at a different point in its training — so "Rookie" is
   literally what the network was like after a few generations, and
   "Brutal" is the finished article. `noise` adds a little extra
   hesitation on the lower tiers: some of the time the bot ignores its own
   judgement and just farms.
   --------------------------------------------------------------------- */
const LB_TIERS = [
  {id:'classic', name:'Classic', src:null, noise:0,
   desc:'The original hand-written bot — currently still the strongest opponent here. No learning involved.'},
  {id:'rookie',  name:'Rookie',  src:'rookie',  noise:0.30,
   desc:'The network very early in training, plus some hesitation. Farms a bit, misreads fights.'},
  {id:'steady',  name:'Steady',  src:'steady',  noise:0.12,
   desc:'A little further along. Last-hits reliably, still shaky about when to commit.'},
  {id:'sharp',   name:'Sharp',   src:'sharp',   noise:0,
   desc:'Later checkpoint, no hesitation. Pressures the tower and takes trades.'},
  {id:'brutal',  name:'Brutal',  src:'brutal',  noise:0,
   desc:'The best brain from the training run that shipped with this build. Beats Rookie comfortably; ' +
        'does not yet beat Classic. Train it longer with ai/train.js and re-bake to move this bar.'}
];

/* cache of deserialized genomes, keyed by name */
const LB_BRAIN_CACHE = {};

function lbListBrains(){
  /* everything selectable: baked tiers, plus any schools baked in, plus
     anything the in-game trainer has saved to this browser */
  const out = [];
  for (const t of LB_TIERS){
    if (t.src && !(LB_BAKED.brains && LB_BAKED.brains[t.src])) continue;   // not baked yet
    out.push({id:t.id, name:t.name, desc:t.desc, kind:'tier'});
  }
  for (const k in (LB_BAKED.schools||{}))
    out.push({id:'school:'+k, name:k.charAt(0).toUpperCase()+k.slice(1),
              desc:(LB_BAKED.schools[k].desc||'A trained school.'), kind:'school'});
  for (const k of lbLocalBrainNames())
    out.push({id:'local:'+k, name:k+' (yours)', desc:'Trained by you in this browser.', kind:'local'});
  return out;
}
function lbLocalBrainNames(){
  const out=[];
  try{
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (k && k.startsWith('lb.brain.')) out.push(k.slice(9));
    }
  }catch(e){}
  return out.sort();
}
function lbGetBrain(id){
  if (!id || id==='classic') return null;
  if (LB_BRAIN_CACHE[id]) return LB_BRAIN_CACHE[id];
  let raw = null;
  if (id.startsWith('local:')){
    try{ raw = JSON.parse(localStorage.getItem('lb.brain.'+id.slice(6))); }catch(e){}
  } else if (id.startsWith('school:')){
    raw = (LB_BAKED.schools||{})[id.slice(7)];
    if (raw) raw = raw.brain;
  } else {
    const t = LB_TIERS.find(x=>x.id===id);
    raw = t && t.src ? (LB_BAKED.brains||{})[t.src] : null;
  }
  if (!raw) return null;
  try{
    const g = LBBrain.deserialize(raw);
    LB_BRAIN_CACHE[id] = g;
    return g;
  }catch(e){ console.warn('bad brain', id, e); return null; }
}
function lbTierNoise(id){
  const t = LB_TIERS.find(x=>x.id===id);
  return t ? (t.noise||0) : 0;
}

/* what the player currently has selected in the menu */
function lbCurrentAiSpec(){
  const id = G.aiTier || 'classic';
  const genome = lbGetBrain(id);
  if (!genome) return null;                       // falls back to the old bot
  return {genome:genome, opts:{noise:lbTierNoise(id)}};
}

/* ---------------------------------------------------------------------
   The one function the game loop calls. Neural if this bot has a brain,
   the original hand-written logic otherwise — so nothing breaks if no
   brains have been trained yet.
   --------------------------------------------------------------------- */
function aiThink(S, p, dt){
  const spec = p.aiSpec;
  if (spec && spec.genome && typeof LBBrain !== 'undefined'){
    LBBrain.think(LB_API, S, p, dt, spec.genome, spec.opts);
  } else {
    botThink(S, p, dt);
  }
}
