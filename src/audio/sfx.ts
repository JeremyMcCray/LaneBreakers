// @ts-nocheck
/** Procedural sound engine — pure WebAudio, no asset files, so every ship target
    (Pages, single-file HTML, Electron) gets sound for free. Everything is built
    from oscillators and one shared noise buffer at play time.

    Reads/writes its own localStorage key directly instead of app/persistence —
    importing persistence here would create a cycle (persistence → render/fx → audio). */
import { G } from '../app/state';

const KEY = 'lb.sound';
const cfg = { vol: .7, mute: false };
try {
  const s = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (s){ if (typeof s.vol === 'number') cfg.vol = Math.max(0, Math.min(1, s.vol)); cfg.mute = !!s.mute; }
} catch(e){}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(cfg)); }catch(e){} }

let AC = null, master = null, noiseBuf = null;
const lastAt = {};              // per-sound retrigger clamp
let winT = 0, winN = 0;         // global new-voice budget per 100ms window

function ensure(){
  if (!AC){
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    AC = new Ctor();
    master = AC.createGain();
    applyVol();
    // a gentle limiter so a teamfight's stacked booms don't clip into fuzz
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 9;
    comp.attack.value = .003; comp.release.value = .22;
    master.connect(comp); comp.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
  }
  if (AC.state === 'suspended') AC.resume().catch(()=>{});
  return AC;
}
function applyVol(){ if (master) master.gain.value = cfg.mute ? 0 : cfg.vol*cfg.vol; }

/* The context can only start from a user gesture (autoplay policy), and the
   browser may re-suspend it when the tab sleeps — so keep the listeners alive. */
export function initAudio(){
  const kick = ()=> ensure();
  addEventListener('pointerdown', kick, {passive:true});
  addEventListener('keydown', kick);
}

export function sfxVolume(){ return cfg.vol; }
export function sfxMuted(){ return cfg.mute; }
export function setSfxVolume(v){ cfg.vol = Math.max(0, Math.min(1, v)); if (cfg.vol > 0) cfg.mute = false; applyVol(); save(); }
export function setSfxMuted(m){ cfg.mute = !!m; applyVol(); save(); }
export function toggleSfxMute(){ setSfxMuted(!cfg.mute); return cfg.mute; }

/* ------------------------------ primitives ------------------------------ */
const rr = (a,b)=> a + Math.random()*(b-a);
function route(g, pan){
  if (pan && AC.createStereoPanner){
    const p = AC.createStereoPanner();
    p.pan.value = Math.max(-.8, Math.min(.8, pan));
    g.connect(p); p.connect(master);
  } else g.connect(master);
}
/* o: f, f2 (slide target), type, a, d, v, pan */
function tone(t0, o){
  const s = AC.createOscillator();
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(Math.max(20, o.f), t0);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + (o.d || .2));
  const g = AC.createGain(), a = o.a || .004, d = o.d || .2;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.v, t0 + a);
  g.gain.exponentialRampToValueAtTime(.0008, t0 + a + d);
  s.connect(g); route(g, o.pan);
  s.start(t0); s.stop(t0 + a + d + .05);
}
/* o: d, v, lp, lp2 (filter sweep target), hp, q, a, pan */
function noise(t0, o){
  const s = AC.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  let n = s;
  if (o.lp){
    const f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = o.q || .7;
    f.frequency.setValueAtTime(o.lp, t0);
    if (o.lp2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.lp2), t0 + o.d);
    n.connect(f); n = f;
  }
  if (o.hp){
    const f = AC.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = o.hp;
    n.connect(f); n = f;
  }
  const g = AC.createGain(), a = o.a || .003, d = o.d || .2;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.v, t0 + a);
  g.gain.exponentialRampToValueAtTime(.0008, t0 + a + d);
  n.connect(g); route(g, o.pan);
  s.start(t0, Math.random()); s.stop(t0 + a + d + .05);
}

/* ------------------------------ sound bank ------------------------------ */
/* Every entry: (t, v, pan, pit) — v is 0..1 loudness after spatial falloff,
   pit is a small random pitch factor so repeats never sound machine-gunned. */
const BANK = {
  // combat surface
  dmg:      (t,v,pan,pit)=>{ tone(t,{f:230*pit, f2:95, type:'triangle', d:.055, v:.13*v, pan});
                             noise(t,{d:.03, v:.07*v, hp:2200, pan}); },
  hit:      (t,v,pan,pit)=>{ noise(t,{d:.05, v:.2*v, hp:1800, pan});
                             tone(t,{f:190*pit, f2:80, type:'triangle', d:.07, v:.26*v, pan}); },
  slash:    (t,v,pan,pit)=>{ noise(t,{d:.09, v:.14*v, lp:2600*pit, lp2:700, pan}); },
  cleave:   (t,v,pan,pit)=>{ noise(t,{d:.15, v:.26*v, lp:1900*pit, lp2:480, pan});
                             tone(t,{f:150*pit, f2:70, type:'triangle', d:.12, v:.2*v, pan}); },
  cast:     (t,v,pan,pit)=>{ tone(t,{f:480*pit, f2:940, d:.13, v:.17*v, pan}); },
  dash:     (t,v,pan,pit)=>{ noise(t,{d:.2, v:.2*v, lp:520, lp2:2400*pit, pan});
                             tone(t,{f:260*pit, f2:540, d:.16, v:.08*v, pan}); },
  windup:   (t,v,pan,pit)=>{ tone(t,{f:180*pit, f2:330, type:'sawtooth', d:.3, v:.06*v, pan}); },

  // deaths / kills
  die:      (t,v,pan,pit)=>{ tone(t,{f:150*pit, f2:55, type:'triangle', d:.18, v:.32*v, pan});
                             noise(t,{d:.12, v:.16*v, lp:700, pan}); },
  diebig:   (t,v,pan,pit)=>{ tone(t,{f:110*pit, f2:38, d:.5, v:.55*v, pan});
                             noise(t,{d:.4, v:.35*v, lp:520, lp2:120, pan});
                             noise(t,{d:.08, v:.18*v, hp:1200, pan}); },
  kill:     (t,v,pan,pit)=>{ tone(t,{f:90, f2:40, d:.55, v:.6*v});
                             noise(t,{d:.35, v:.4*v, lp:900, lp2:200});
                             tone(t+.05,{f:523, f2:784, type:'triangle', d:.3, v:.2*v}); },
  slain:    (t,v,pan,pit)=>{ tone(t,{f:90, f2:40, d:.55, v:.6*v});
                             noise(t,{d:.35, v:.4*v, lp:900, lp2:200});
                             tone(t+.05,{f:300, f2:90, type:'sawtooth', d:.5, v:.14*v}); },
  exec:     (t,v,pan,pit)=>{ tone(t,{f:220*pit, f2:55, type:'sawtooth', d:.3, v:.4*v, pan});
                             noise(t,{d:.25, v:.3*v, lp:1000, lp2:220, pan});
                             noise(t,{d:.04, v:.2*v, hp:2500, pan}); },

  // spells / effects
  blast:    (t,v,pan,pit)=>{ tone(t,{f:150*pit, f2:45, d:.3, v:.5*v, pan});
                             noise(t,{d:.3, v:.35*v, lp:1400, lp2:280, pan}); },
  nova:     (t,v,pan,pit)=>{ tone(t,{f:150*pit, f2:45, d:.3, v:.45*v, pan});
                             noise(t,{d:.3, v:.3*v, lp:1400, lp2:280, pan});
                             tone(t,{f:1200*pit, f2:400, d:.28, v:.16*v, pan}); },
  quake:    (t,v,pan,pit)=>{ noise(t,{d:.5, v:.4*v, lp:260, pan});
                             tone(t,{f:62*pit, f2:34, d:.5, v:.35*v, pan}); },
  rupture:  (t,v,pan,pit)=>{ noise(t,{d:.3, v:.4*v, lp:800, lp2:180, pan});
                             tone(t,{f:130*pit, f2:48, d:.3, v:.4*v, pan}); },
  stun:     (t,v,pan,pit)=>{ tone(t,{f:620*pit, type:'square', d:.16, v:.1*v, pan});
                             tone(t,{f:875*pit, type:'square', d:.2, v:.08*v, pan});
                             noise(t,{d:.035, v:.12*v, hp:2500, pan}); },
  root:     (t,v,pan,pit)=>{ noise(t,{d:.26, v:.24*v, lp:420, pan});
                             tone(t,{f:180*pit, f2:85, d:.24, v:.2*v, pan}); },
  silence:  (t,v,pan,pit)=>{ tone(t,{f:1100*pit, f2:320, d:.3, v:.16*v, pan}); },
  shield:   (t,v,pan,pit)=>{ tone(t,{f:980*pit, d:.18, v:.13*v, pan});
                             tone(t,{f:1960*pit, d:.12, v:.06*v, pan}); },
  heal:     (t,v,pan,pit)=>{ tone(t,{f:660*pit, d:.2, v:.08*v, pan});
                             tone(t+.06,{f:990*pit, d:.24, v:.07*v, pan}); },
  buff:     (t,v,pan,pit)=>{ tone(t,{f:700*pit, f2:1050, d:.24, v:.13*v, pan}); },
  zap:      (t,v,pan,pit)=>{ tone(t,{f:900*pit, f2:180, type:'sawtooth', d:.12, v:.15*v, pan});
                             noise(t,{d:.04, v:.08*v, hp:2000, pan}); },
  counter:  (t,v,pan,pit)=>{ tone(t,{f:1320*pit, type:'square', d:.1, v:.14*v, pan});
                             tone(t+.02,{f:1980*pit, type:'square', d:.12, v:.09*v, pan});
                             noise(t,{d:.03, v:.1*v, hp:4000, pan}); },
  chain:    (t,v,pan,pit)=>{ noise(t,{d:.03, v:.16*v, hp:2600, pan});
                             noise(t+.04,{d:.03, v:.13*v, hp:3000, pan});
                             noise(t+.09,{d:.03, v:.1*v, hp:2400, pan});
                             tone(t,{f:1500*pit, f2:250, type:'sawtooth', d:.12, v:.11*v, pan}); },
  lightning:(t,v,pan,pit)=>{ noise(t,{d:.05, v:.35*v, hp:3000, pan});
                             tone(t,{f:1800*pit, f2:150, type:'sawtooth', d:.1, v:.14*v, pan});
                             noise(t+.05,{d:.85, v:.45*v, lp:500, lp2:110, pan});
                             tone(t+.05,{f:70, f2:42, d:.7, v:.25*v, pan}); },
  static:   (t,v,pan,pit)=>{ noise(t,{d:.16, v:.09*v, hp:2200, pan}); },
  raise:    (t,v,pan,pit)=>{ tone(t,{f:140*pit, f2:290, type:'sawtooth', d:.45, v:.16*v, pan});
                             noise(t,{d:.4, v:.12*v, lp:500, pan}); },
  emberjump:(t,v,pan,pit)=>{ noise(t,{d:.08, v:.1*v, hp:1200, pan});
                             tone(t,{f:500*pit, f2:900, d:.1, v:.06*v, pan}); },
  bloodlet: (t,v,pan,pit)=>{ tone(t,{f:500*pit, f2:200, d:.2, v:.13*v, pan});
                             noise(t,{d:.15, v:.1*v, lp:600, pan}); },
  // a wet tear — Rupture charging its toll while the victim keeps running
  bleed:    (t,v,pan,pit)=>{ noise(t,{d:.12, v:.14*v, lp:650, pan});
                             tone(t,{f:230*pit, f2:90, d:.15, v:.11*v, pan}); },
  thirst:   (t,v,pan,pit)=>{ tone(t,{f:320*pit, f2:140, d:.18, v:.1*v, pan}); },
  mark:     (t,v,pan,pit)=>{ tone(t,{f:1050*pit, d:.1, v:.1*v, pan}); },
  cdcut:    (t,v,pan,pit)=>{ tone(t,{f:1400*pit, f2:1900, d:.08, v:.1*v, pan}); },
  respawn:  (t,v,pan,pit)=>{ tone(t,{f:440, f2:880, d:.35, v:.15*v, pan});
                             tone(t+.08,{f:660, f2:1320, d:.3, v:.1*v, pan});
                             noise(t,{d:.3, v:.05*v, hp:1500, pan}); },

  // jungle camps — every variant event reads differently by ear
  jspawn:   (t,v,pan,pit)=>{ tone(t,{f:130*pit, f2:65, type:'sawtooth', d:.5, v:.22*v, pan});   // low guttural horn
                             tone(t+.12,{f:98*pit, f2:60, type:'sawtooth', d:.4, v:.16*v, pan});
                             noise(t,{d:.35, v:.14*v, lp:600, lp2:150, pan}); },
  jbolt:    (t,v,pan,pit)=>{ noise(t,{d:.04, v:.25*v, hp:3400, pan});                           // snappier, brighter than Zeus
                             tone(t,{f:2400*pit, f2:300, type:'sawtooth', d:.09, v:.13*v, pan});
                             tone(t+.03,{f:120, f2:60, d:.28, v:.16*v, pan}); },
  jheal:    (t,v,pan,pit)=>{ tone(t,{f:520*pit, d:.16, v:.09*v, pan});                          // warm rising triad
                             tone(t+.07,{f:655*pit, d:.18, v:.08*v, pan});
                             tone(t+.14,{f:780*pit, d:.26, v:.07*v, pan}); },
  jcharge:  (t,v,pan,pit)=>{ tone(t,{f:392, type:'triangle', d:.09, v:.16*v, pan});             // war-drum two-note
                             tone(t+.08,{f:587, type:'triangle', d:.2, v:.15*v, pan});
                             noise(t,{d:.06, v:.08*v, lp:900, pan}); },
  jwave:    (t,v,pan,pit)=>{ tone(t,{f:196, f2:392, type:'sawtooth', d:.35, v:.12*v, pan});     // marching horn swell
                             tone(t+.1,{f:294, f2:440, type:'triangle', d:.3, v:.1*v, pan}); },

  // towers
  towerfire:(t,v,pan,pit)=>{ tone(t,{f:240*pit, f2:110, d:.12, v:.18*v, pan});
                             noise(t,{d:.07, v:.1*v, lp:800, pan}); },
  towerdown:(t,v,pan,pit)=>{ tone(t,{f:75, f2:28, d:1.1, v:.7*v});
                             noise(t,{d:1.2, v:.6*v, lp:350, lp2:90});
                             noise(t,{d:.18, v:.28*v, lp:1600});
                             noise(t+.25,{d:.15, v:.2*v, lp:1200}); },

  // economy / UI
  gold:     (t,v,pan,pit)=>{ tone(t,{f:1568*pit, type:'triangle', d:.06, v:.15*v, pan});
                             tone(t+.05,{f:2093*pit, type:'triangle', d:.09, v:.12*v, pan}); },
  deny:     (t,v,pan,pit)=>{ tone(t,{f:260*pit, type:'square', d:.05, v:.1*v, pan});
                             noise(t,{d:.03, v:.06*v, hp:3000, pan}); },
  lvlup:    (t,v,pan,pit)=>{ tone(t,{f:523, type:'triangle', d:.12, v:.18*v, pan});
                             tone(t+.08,{f:659, type:'triangle', d:.12, v:.18*v, pan});
                             tone(t+.16,{f:784, type:'triangle', d:.3, v:.2*v, pan}); },
  buy:      (t,v)=>{ tone(t,{f:780, type:'triangle', d:.08, v:.18*v});
                     tone(t+.07,{f:1170, type:'triangle', d:.14, v:.16*v}); },
  sell:     (t,v)=>{ tone(t,{f:1170, type:'triangle', d:.08, v:.14*v});
                     tone(t+.07,{f:780, type:'triangle', d:.12, v:.13*v}); },
  deliver:  (t,v,pan)=>{ tone(t,{f:520, f2:260, d:.06, v:.16*v, pan});
                         tone(t+.05,{f:1040, type:'triangle', d:.15, v:.13*v, pan}); },
  click:    (t,v)=>{ tone(t,{f:1900, type:'square', d:.025, v:.05*v}); },
  error:    (t,v)=>{ tone(t,{f:150, type:'square', d:.15, v:.08*v});
                     tone(t,{f:157, type:'square', d:.15, v:.08*v}); },

  // match end
  victory:  (t,v)=>{ [523,659,784,1046].forEach((f,i)=>
                       tone(t+i*.12,{f, type:'triangle', d:i===3?.6:.16, v:.2*v}));
                     noise(t+.36,{d:.5, v:.04*v, hp:2000}); },
  defeat:   (t,v)=>{ [392,311,261,196].forEach((f,i)=>
                       tone(t+i*.18,{f, d:i===3?.8:.22, v:.16*v}));
                     tone(t,{f:65, d:1, v:.15*v}); },
};

/* chatty events get a longer per-name retrigger gap (seconds) */
const GAP = { dmg:.07, hit:.06, slash:.07, cleave:.09, die:.05, gold:.11, deny:.09,
              towerfire:.1, chain:.06, static:.12, emberjump:.09,
              thirst:.14, cast:.05, dash:.07, windup:.25, bleed:.22,
              jbolt:.15, jheal:.35, jcharge:.2 };

export function playSfx(name, opt){
  if (cfg.mute || cfg.vol <= 0) return;
  if (!ensure() || AC.state !== 'running') return;
  const fn = BANK[name]; if (!fn) return;
  const t = AC.currentTime;
  const gap = (opt && opt.gap) || GAP[name] || .05;
  if (lastAt[name] && t - lastAt[name] < gap) return;
  if (t - winT > .1){ winT = t; winN = 0; }
  if (++winN > 14) return;                       // teamfight cap — drop, don't stack
  const v = opt && opt.vol !== undefined ? opt.vol : 1;
  if (v <= .02) return;
  lastAt[name] = t;
  try{ fn(t + .001, v, (opt && opt.pan) || 0, 1 + rr(-.05, .05)); }catch(e){}
}

/* positional: quieter with distance from the camera, panned toward its side */
export function sfxAt(name, x, y, opt){
  const dx = x - G.cam.x, dy = y - G.cam.y;
  const d = Math.hypot(dx, dy), AUD = 1600;
  if (d > AUD) return;
  const fall = d < 420 ? 1 : 1 - (d - 420)/(AUD - 420);
  playSfx(name, {...(opt || {}), vol: ((opt && opt.vol) || 1)*fall*fall, pan: dx/1100});
}

/* -------- the one map from sim fx events to sounds (spawnFx calls this) -------- */
export function fxSound(f){
  switch(f.t){
    case 'dmg':      sfxAt('dmg', f.x, f.y, {vol: f.cr ? 1.6 : (f.ab ? 1.1 : .8)}); break;
    case 'hit':      sfxAt('hit', f.x, f.y); break;
    case 'slash':    sfxAt('slash', f.x, f.y); break;
    case 'cleave':   sfxAt('cleave', f.x, f.y); break;
    case 'cast':     sfxAt('cast', f.x, f.y); break;
    case 'dash':     sfxAt('dash', f.x, f.y); break;
    case 'echodash': sfxAt('dash', f.x, f.y, {vol:1.2}); break;
    case 'windup':   sfxAt('windup', f.x, f.y); break;
    case 'die':      sfxAt(f.big ? 'diebig' : 'die', f.x, f.y); break;
    case 'kill':     playSfx(f.team === G.myTeam ? 'kill' : 'slain'); break;
    case 'exec':     sfxAt('exec', f.x, f.y); break;
    case 'blast':    sfxAt('blast', f.x, f.y, {vol: Math.min(1, .5 + (f.r || 100)/300)}); break;
    case 'nova':     sfxAt('nova', f.x, f.y); break;
    case 'detonate': sfxAt('blast', f.x, f.y, {vol: Math.min(1, .5 + (f.v || 1)*.15)}); break;
    case 'quake':    sfxAt('quake', f.x, f.y); break;
    case 'rupture':  sfxAt('rupture', f.x, f.y); break;
    case 'stun':     sfxAt('stun', f.x, f.y); break;
    case 'root':     sfxAt('root', f.x, f.y); break;
    case 'silence':  sfxAt('silence', f.x, f.y); break;
    case 'shield':   sfxAt('shield', f.x, f.y); break;
    case 'heal':     sfxAt('heal', f.x, f.y); break;
    case 'buff':     sfxAt('buff', f.x, f.y); break;
    case 'disjoint':
    case 'purge':    sfxAt('zap', f.x, f.y); break;
    case 'counter':  sfxAt('counter', f.x, f.y); break;
    case 'chain':    sfxAt('chain', f.x, f.y); break;
    case 'lightning':sfxAt('lightning', f.x, f.y); break;
    case 'static':   sfxAt('static', f.x, f.y); break;
    case 'raise':    sfxAt('raise', f.x, f.y); break;
    case 'emberjump':sfxAt('emberjump', f.x2, f.y2); break;
    case 'bloodlet': sfxAt('bloodlet', f.x, f.y); break;
    case 'bleed':    sfxAt('bleed', f.x, f.y); break;
    case 'thirst':   sfxAt('thirst', f.x, f.y); break;
    case 'mark':     sfxAt('mark', f.x, f.y); break;
    case 'cdcut':    sfxAt('cdcut', f.x, f.y); break;
    case 'respawn':  sfxAt('respawn', f.x, f.y); break;
    case 'twrfire':  sfxAt('towerfire', f.x, f.y); break;
    case 'jspawn':   sfxAt('jspawn', f.x, f.y); break;
    case 'jbolt':    sfxAt('jbolt', f.x, f.y); break;
    case 'jheal':    sfxAt('jheal', f.x, f.y); break;
    case 'jcharge':  sfxAt('jcharge', f.x, f.y, {vol: f.team===G.myTeam ? 1.2 : .7}); break;
    case 'jwave':    sfxAt('jwave', f.x, f.y); break;
    case 'towerdown':playSfx('towerdown'); break;
    case 'gold':     if (!f.passive) sfxAt('gold', f.x, f.y); break;
    case 'deny':     sfxAt('deny', f.x, f.y); break;
    case 'lvlup':    sfxAt('lvlup', f.x, f.y); break;
    case 'sell':     if (f.team === G.myTeam) playSfx('sell'); break;
    case 'deliver':  if (f.team === G.myTeam) sfxAt('deliver', f.x, f.y); break;
  }
}
