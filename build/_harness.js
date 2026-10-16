/* =============================================================================
   Headless verification harness.
   There is no browser binary available in this sandbox, so this file builds a
   faithful-enough DOM + Canvas2D + WebAudio environment and then RUNS THE REAL
   GAME CODE: boot, title, a full 20-stage playthrough, evolution panels,
   victory, death/respawn, depth sweeps and a resize. Any exception, NaN
   coordinate or bad colour string is reported.
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------------------------------------------------------- reporting */
const problems = [];
const note = m => problems.push(m);
let ctxCalls = 0, gradientCalls = 0, audioNodes = 0;

/* ------------------------------------------------------------- fake canvas */
const PROPS = new Set(['fillStyle','strokeStyle','lineWidth','globalAlpha','font','textAlign',
  'textBaseline','globalCompositeOperation','filter','lineCap','lineJoin','miterLimit',
  'shadowBlur','shadowColor','imageSmoothingEnabled','canvas']);

function checkColor(k, v) {
  if (typeof v === 'string' && (v.includes('NaN') || v.includes('undefined') || v.includes('Infinity')))
    note('bad ' + k + ': ' + v);
}
function checkNums(fn, args) {
  ctxCalls++;
  for (const a of args) if (typeof a === 'number' && !isFinite(a)) { note('non-finite arg in ctx.' + fn + '(' + args.join(',') + ')'); return; }
}
function makeGradient(kind) {
  gradientCalls++;
  return { addColorStop(o, c) {
    if (!isFinite(o)) note(kind + ' stop offset not finite: ' + o);
    if (o < 0 || o > 1) note(kind + ' stop offset out of range: ' + o);
    checkColor(kind + ' stop colour', c);
  } };
}
function makeCtx(cv) {
  const store = {};
  const target = {
    canvas: cv,
    save(...a){checkNums('save',a);}, restore(...a){checkNums('restore',a);},
    beginPath(...a){checkNums('beginPath',a);}, closePath(...a){checkNums('closePath',a);},
    moveTo(...a){checkNums('moveTo',a);}, lineTo(...a){checkNums('lineTo',a);},
    quadraticCurveTo(...a){checkNums('quadraticCurveTo',a);}, bezierCurveTo(...a){checkNums('bezierCurveTo',a);},
    arc(...a){checkNums('arc',a);}, ellipse(...a){checkNums('ellipse',a);}, rect(...a){checkNums('rect',a);},
    fill(...a){checkNums('fill',a);}, stroke(...a){checkNums('stroke',a);}, clip(...a){checkNums('clip',a);},
    fillRect(...a){checkNums('fillRect',a);}, strokeRect(...a){checkNums('strokeRect',a);},
    clearRect(...a){checkNums('clearRect',a);},
    fillText(t,...a){checkNums('fillText',a); if(String(t).includes('NaN')||String(t).includes('undefined')) note('bad fillText: '+t);},
    strokeText(t,...a){checkNums('strokeText',a); if(String(t).includes('NaN')||String(t).includes('undefined')) note('bad strokeText: '+t);},
    measureText(t){ return { width: String(t).length * 6 }; },
    translate(...a){checkNums('translate',a);}, rotate(...a){checkNums('rotate',a);},
    scale(...a){checkNums('scale',a);}, setTransform(...a){checkNums('setTransform',a);},
    transform(...a){checkNums('transform',a);}, resetTransform(){},
    drawImage(img,...a){ checkNums('drawImage',a);
      if (!img || typeof img !== 'object') note('drawImage with bad source'); },
    createLinearGradient(...a){ checkNums('createLinearGradient',a); return makeGradient('linearGradient'); },
    createRadialGradient(...a){ checkNums('createRadialGradient',a);
      if (a[2] < 0 || a[5] < 0) note('negative gradient radius'); return makeGradient('radialGradient'); },
    createPattern(){ return null; },
    getImageData(x,y,w,h){ return { data:new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)), width:w|0, height:h|0 }; },
    putImageData(){}, createImageData(w,h){ return { data:new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)), width:w|0, height:h|0 }; },
    setLineDash(a){ if(!Array.isArray(a)) note('setLineDash non-array'); },
    getLineDash(){ return []; },
    isPointInPath(){ return false; },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (PROPS.has(k)) return store[k];
      return undefined;
    },
    set(t, k, v) {
      if (k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') checkColor(k, v);
      if ((k === 'lineWidth' || k === 'globalAlpha' || k === 'miterLimit' || k === 'shadowBlur') && !isFinite(v))
        note('non-finite ' + k + ' = ' + v);
      if (k === 'globalAlpha' && (v < 0 || v > 1)) note('globalAlpha out of range: ' + v);
      if (k === 'lineWidth' && v < 0) note('negative lineWidth: ' + v);
      store[k] = v; return true;
    }
  });
}

/* --------------------------------------------------------------- fake DOM */
let idSeq = 0;
class ClassList {
  constructor(el){ this.el = el; this.set = new Set(); }
  add(c){ this.set.add(c); this.el._syncClass(); }
  remove(c){ this.set.delete(c); this.el._syncClass(); }
  toggle(c, on){ const has = this.set.has(c); const want = on === undefined ? !has : !!on;
    if (want) this.set.add(c); else this.set.delete(c); this.el._syncClass(); return want; }
  contains(c){ return this.set.has(c); }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.uid = ++idSeq;
    this.children = []; this.parentNode = null;
    this._attrs = {}; this._text = ''; this._html = '';
    this.style = new Proxy({}, { set(t,k,v){ t[k]=v; return true; }, get(t,k){ return t[k] === undefined ? '' : t[k]; } });
    this.classList = new ClassList(this);
    this._listeners = {};
    this.width = 300; this.height = 150;
    this._ctx = null;
    this.title = '';
  }
  _syncClass(){ this._attrs.class = [...this.classList.set].join(' '); }
  getContext(type) {
    if (type !== '2d') return null;
    if (!this._ctx) this._ctx = makeCtx(this);
    return this._ctx;
  }
  appendChild(c) { if (!c) { note('appendChild(null)'); return c; } c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i,1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { const l = this._listeners[t]; if (l) { const i = l.indexOf(fn); if (i>=0) l.splice(i,1); } }
  dispatch(t, ev) { (this._listeners[t] || []).forEach(fn => fn(Object.assign({ type:t, preventDefault(){}, stopPropagation(){} }, ev))); }
  setAttribute(k,v){ this._attrs[k]=v; }
  getAttribute(k){ return this._attrs[k]; }
  querySelector(sel) { return findBySelector(this, sel); }
  querySelectorAll(sel) { const out=[]; collectBySelector(this, sel, out); return out; }
  get textContent(){ return this._text; }
  set textContent(v){ this._text = String(v); this.children.length = 0; }
  get innerHTML(){ return this._html; }
  set innerHTML(v){ this._html = String(v); if (String(v) === '') this.children.length = 0;
    if (String(v).includes('undefined') || String(v).includes('NaN')) note('innerHTML contains junk: ' + String(v).slice(0,120)); }
  get firstChild(){ return this.children[0] || null; }
}
function collectBySelector(root, sel, out) {
  for (const c of root.children) {
    if (sel.startsWith('.') ? c.classList.contains(sel.slice(1)) : c.tagName === sel.toUpperCase()) out.push(c);
    collectBySelector(c, sel, out);
  }
}
function findBySelector(root, sel) { const out = []; collectBySelector(root, sel, out); return out[0] || null; }

/* Build the elements the HTML defines, by id. */
const IDS = ['view','ui','hud','hudTop','stageTag','stageName','stageLat','stageIdx','dnaRow','dnaIcon',
  'dnaVal','dnaRate','evoBtn','bars','hpFill','stFill','traits','depth','depthTxt','depthStrip','depthMark',
  'depthLimit','zoneTxt','help','fpsQ','toast','title','evo','evoHead','evoTitle','evoSub','cards','evoFoot',
  'evoDna','btnEvoClose','dead','deadWhy','deadFine','btnRespawn','win','winPortrait','winName','winSci',
  'winMsg','lineage','btnKeep','btnAgain','pause','btnResume','btnStart','btnMute'];
const byId = {};
const body = new El('body');
IDS.forEach(id => { const e = new El(id === 'view' || id === 'winPortrait' ? 'canvas' : 'div'); e.id = id; byId[id] = e; body.appendChild(e); });
// the stats grids live inside #dead and #win
const deadStats = new El('div'); deadStats.classList.add('statsGrid'); byId.dead.appendChild(deadStats);
const winStats = new El('div'); winStats.classList.add('statsGrid'); byId.win.appendChild(winStats);
byId.dead.parentElement = body;

const document = {
  readyState: 'complete',
  body,
  documentElement: new El('html'),
  createElement: t => new El(t),
  createElementNS: (ns, t) => new El(t),
  getElementById: id => byId[id] || null,
  querySelector: sel => findBySelector(body, sel),
  querySelectorAll: sel => { const o=[]; collectBySelector(body, sel, o); return o; },
  addEventListener(t, fn){ (this._l = this._l || {})[t] = (this._l[t]||[]).concat(fn); },
  removeEventListener(){},
  dispatch(t, ev){ ((this._l||{})[t]||[]).forEach(f => f(ev || { type:t })); },
};

/* ------------------------------------------------------------ fake WebAudio */
function param(v = 0) {
  return { value: v,
    setValueAtTime(x, t){ chk('setValueAtTime', x, t); return this; },
    linearRampToValueAtTime(x, t){ chk('linearRamp', x, t); return this; },
    exponentialRampToValueAtTime(x, t){ chk('expRamp', x, t); if (x === 0) note('exponentialRamp to 0'); return this; },
    setTargetAtTime(x, t, c){ chk('setTarget', x, t); return this; },
    cancelScheduledValues(){ return this; } };
}
function chk(what, ...vals) { for (const v of vals) if (typeof v === 'number' && !isFinite(v)) note('audio ' + what + ' non-finite: ' + v); }
class ANode { constructor(){ audioNodes++; this.numberOfInputs=1; this.numberOfOutputs=1; }
  connect(d){ if (!d) note('audio connect(undefined)'); return d; } disconnect(){} }
class AParamNode extends ANode { constructor(){ super(); } }
const audioCtx = {
  state: 'running', sampleRate: 48000, currentTime: 0,
  destination: new ANode(),
  resume(){ this.state='running'; return Promise.resolve(); },
  suspend(){ this.state='suspended'; return Promise.resolve(); },
  createGain(){ const n=new AParamNode(); n.gain=param(1); return n; },
  createOscillator(){ const n=new AParamNode(); n.frequency=param(440); n.detune=param(0); n.type='sine';
    n.start=(t)=>chk('osc.start',t); n.stop=(t)=>chk('osc.stop',t); return n; },
  createBiquadFilter(){ const n=new AParamNode(); n.frequency=param(350); n.Q=param(1); n.gain=param(0); n.type='lowpass'; return n; },
  createBufferSource(){ const n=new AParamNode(); n.buffer=null; n.loop=false; n.playbackRate=param(1);
    n.start=(t,o)=>chk('src.start',t,o); n.stop=(t)=>chk('src.stop',t); return n; },
  createConvolver(){ const n=new ANode(); n.buffer=null; return n; },
  createDynamicsCompressor(){ const n=new ANode();
    n.threshold=param(-24); n.knee=param(30); n.ratio=param(12); n.attack=param(0.003); n.release=param(0.25); return n; },
  createBuffer(ch, len, rate){
    if (!(len > 0)) note('createBuffer with length ' + len);
    const data = []; for (let i=0;i<ch;i++) data.push(new Float32Array(Math.max(1,len)));
    return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len/rate,
             getChannelData: i => data[i] || data[0] };
  },
  createWaveShaper(){ return new ANode(); },
  createStereoPanner(){ const n=new AParamNode(); n.pan=param(0); return n; },
};
function AudioContextStub(){ return audioCtx; }

/* ------------------------------------------------------------------ window */
let nowMs = 0;
const rafQueue = [];
const windowObj = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  document, AudioContext: AudioContextStub, webkitAudioContext: AudioContextStub,
  requestAnimationFrame(fn){ rafQueue.push(fn); return rafQueue.length; },
  cancelAnimationFrame(){},
  addEventListener(t, fn){ (this._l = this._l || {})[t] = ((this._l[t])||[]).concat(fn); },
  removeEventListener(t, fn){ const l=(this._l||{})[t]; if(l){const i=l.indexOf(fn); if(i>=0)l.splice(i,1);} },
  dispatch(t, ev){ ((this._l||{})[t]||[]).forEach(f => f(Object.assign({type:t,preventDefault(){}}, ev))); },
  performance: { now: () => nowMs },
  setTimeout: (fn, ms) => setTimeout(fn, 0),
  clearTimeout: id => clearTimeout(id),
  console,
};
windowObj.window = windowObj;

/* -------------------------------------------------------------- run the game */
const bundlePath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(bundlePath, 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('could not extract <script> from index.html'); process.exit(2); }
const js = m[1];

const sandbox = Object.assign(Object.create(null), {
  window: windowObj, document, console, performance: windowObj.performance,
  requestAnimationFrame: windowObj.requestAnimationFrame.bind(windowObj),
  cancelAnimationFrame: () => {},
  setTimeout: (fn) => { try { fn(); } catch (e) { note('setTimeout callback threw: ' + e.message); } return 0; },
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, WeakMap, Proxy, Reflect,
  isFinite, isNaN, parseInt, parseFloat, undefined, NaN, Infinity,
  Error, TypeError, RangeError, Symbol, Promise, RegExp, Function,
  Float32Array, Uint8ClampedArray, Uint8Array, Int32Array, ArrayBuffer,
  AudioContext: AudioContextStub, webkitAudioContext: AudioContextStub,
});
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

let frameCount = 0;
function pump(frames, dtMs = 16.7) {
  for (let i = 0; i < frames; i++) {
    nowMs += dtMs;
    const q = rafQueue.splice(0, rafQueue.length);
    if (!q.length) { note('requestAnimationFrame queue empty at frame ' + frameCount); return; }
    for (const fn of q) {
      const t0 = process.hrtime.bigint();
      try { fn(nowMs); } catch (e) { note('FRAME ' + frameCount + ' THREW: ' + (e && e.stack ? e.stack.split('\n').slice(0,3).join(' | ') : e)); throw e; }
      const t1 = process.hrtime.bigint();
      frameTimes.push(Number(t1 - t0) / 1e6);
    }
    frameCount++;
    audioCtx.currentTime = nowMs / 1000;
  }
}
const frameTimes = [];

try {
  vm.runInContext(js, sandbox, { filename: 'index.html<script>' });
} catch (e) {
  console.error('BUNDLE THREW ON LOAD:', e.stack);
  process.exit(1);
}

const G = windowObj.__THALASSA || sandbox.__THALASSA;
if (!G) { console.error('game did not expose __THALASSA'); process.exit(1); }

console.log('loaded. nodes=%d edibles=%d zones=%d spine=%d', Object.keys(G.STAGES).length,
            Object.keys(G.EDIBLES).length, G.ZONES.length, G.STAGE_DEPTH.SPINE);

/* ---- 1. boot + title ---- */
pump(30);
console.log('state after boot:', G.Game.state);
if (G.Game.state !== 'TITLE') note('expected TITLE state, got ' + G.Game.state);

/* ---- 2. start a new game ---- */
G.Game.newGame();
pump(10);
if (G.Game.state !== 'PLAYING') note('expected PLAYING after newGame, got ' + G.Game.state);
if (!G.World.entities.length) note('world spawned no entities');

/* ---- 3. simulate play: hunt the nearest edible, 900 frames (~15 s) ---- */
/**
 * A stand-in for a competent human player: run from anything that can eat us,
 * otherwise swim at the most DNA per second of travel. It must not chase
 * rooted plants it cannot swallow, and it must not fixate on a big meal across
 * the map while edible particles drift past its nose.
 */
/**
 * A stand-in for a competent human player: run from anything that can eat us
 * once we are hurt, otherwise swim at the most DNA per second of travel. It
 * must not chase rooted plants it cannot swallow, and it must not fixate on a
 * big meal across the map while edible particles drift past its nose.
 */
/** Meals eaten across every hunt() call, surviving respawn() (which blanks
    Game.stats). This is the number the checks should read. */
let eatenTotal = 0, _prevEaten = 0;
function hunt(frames) {
  for (let i = 0; i < frames; i++) {
    const p = G.Game.player;
    const gape = p.r * G.CFG.EAT_RATIO;

    // Only something actually coming for us counts as a threat. Treating every
    // predator inside seven body-radii as lethal made the hunter flee for its
    // whole life at large scale — straight into the next predator.
    let threat = null, td = Infinity;
    for (const e of G.World.entities) {
      if (!e.kind || e.kind !== 'creature') continue;
      if (p.r > e.r * G.CFG.EAT_RATIO && !e.leviathan) continue;   // edible: not a threat
      const hunting = e.leviathan ? true : (e.ai === 'hunt' && e.target === p);
      if (!hunting) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < td) { td = d; threat = e; }
    }
    if (threat && td > p.r * 9) threat = null;        // it gave up: ignore it
    let best = null, bs = -Infinity;
    if (!threat || p.hp > p.maxHp * 0.55) {
      for (const e of G.World.entities) {
        if (!e.kind || e.kind === 'player' || e.leviathan) continue;
        if (e.r > gape) continue;
        if (e.anchor && e.r > gape * 0.6) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 4000) continue;
        const s = p.dnaFor(e) * 3 - d * 0.07;
        if (s > bs) { bs = s; best = e; }
      }
    }
    if (threat && (!best || p.hp < p.maxHp * 0.55)) {
      const a = Math.atan2(p.y - threat.y, p.x - threat.x);
      G.Input.wx = p.x + Math.cos(a) * 900; G.Input.wy = p.y + Math.sin(a) * 900;
      G.Input.burst = true;
    } else if (best) {
      G.Input.wx = best.x; G.Input.wy = best.y; G.Input.burst = false;
    } else {
      G.Input.wx = p.x + 420; G.Input.wy = p.y + Math.sin(i * 0.05) * 260; G.Input.burst = false;
    }
    pump(1);
    const st = G.Game.stats;
    if (st.eaten >= _prevEaten) eatenTotal += st.eaten - _prevEaten;
    _prevEaten = st.eaten;
    if (G.Game.state === 'DEAD') { G.Game.respawn(); pump(2); _prevEaten = G.Game.stats.eaten; }
  }
}
hunt(900);
const s1 = { entities: G.World.entities.length, chunks: G.World.chunks.size, eaten: eatenTotal,
             dna: +G.Game.player.dna.toFixed(1), sprites: G.Sprites.cache.size,
             playerR: +G.Game.player.r.toFixed(1), quality: G.World.quality };
console.log('after 900 frames of hunting:', JSON.stringify(s1));
if (s1.eaten === 0) note('player ate nothing in 900 frames while chasing food');

/** Get back into a live game: a dead player must be respawned (which restores
    vitality and the checkpoint), never just flipped back to PLAYING — that
    leaves hp <= 0 and the next frame kills it again. */
function revive() {
  if (G.Game.state === 'DEAD') { G.Game.respawn(); pump(3); }
  if (G.Game.state !== 'PLAYING') G.Game.setState('PLAYING');
  if (G.Game.player.hp <= 0) { G.Game.player.hp = G.Game.player.maxHp; }
}

/* ---- 3b. ECONOMY PROBE: meals and seconds required at every stage ----
   Each row is a controlled experiment, not a playthrough: we pin the player to
   one stage, park it at the depth the pressure gate would force it to, and let
   the hunter run. `stats` is re-blanked by respawn(), so meals are accumulated
   per pump rather than read at the end. */
const econ = [];
let econDeaths = 0;
for (const id in G.STAGES) {
  if (G.STAGES[id].final) continue;
  G.Game.newGame(); pump(3);
  const stageDepth = () => Math.min(G.CFG.MAX_DEPTH - 600, Math.max(700, G.Game.player.r * 62));
  const pin = () => {
    const q = G.Game.player;
    q.traits = new Set(); q.visPatches = []; q.statDeltas = {};
    q.setStage(id, { deltas: {} });
    // every row must start from full vitality: leftover damage from the
    // previous row made the hunter spend the whole run fleeing
    q.dna = 0; q.y = stageDepth();
    q.hp = q.maxHp; q.stam = q.maxStam; q.iframe = 1.0; q.grace = 0;
    // fresh ocean at the new scale, exactly as a real evolution does
    G.World.reset(); G.Sprites.cache.clear();
    G.World.add(q, G.World.getChunk(G.World.cx(q.x), G.World.cy(q.y), true));
    G.Camera.reset(q.x, q.y, q.r);
    return q;
  };
  let pp = pin();
  if (G.Game.state !== 'PLAYING') G.Game.setState('PLAYING');
  G.World.reset(); G.Sprites.cache.clear();
  G.World.add(pp, G.World.getChunk(G.World.cx(pp.x), G.World.cy(pp.y), true));
  pump(8);
  const cost = G.World.costOf(id);
  const t0 = G.Game.stats.time, d0 = econDeaths;
  let f = 0, meals = 0, prevEaten = G.Game.stats.eaten, dna = 0;
  while (dna < cost && f < 9000) {
    hunt(30); f += 30;
    const st = G.Game.stats;
    if (st.eaten >= prevEaten) meals += st.eaten - prevEaten;
    prevEaten = st.eaten;
    // the game auto-respawns, which restores the CHECKPOINT (c01) rather than
    // the stage under test, so re-pin whenever either state or stage slipped
    if (G.Game.state !== 'PLAYING' || G.Game.player.stageId !== id) {
      econDeaths++;
      revive();
      pin();
      prevEaten = G.Game.stats.eaten;
    }
    dna = G.Game.player.dna;
    if (process.env.DBG && id === 'c02_photo' && f % 300 === 0)
      console.log('    [dbg] f=' + f + ' state=' + G.Game.state + ' stage=' + G.Game.player.stageId +
                  ' r=' + G.Game.player.r.toFixed(0) + ' dna=' + dna.toFixed(1) +
                  ' evo=' + G.Game.player.evolutions + ' hp=' + G.Game.player.hp.toFixed(0) +
                  ' meals=' + meals + ' y=' + Math.round(G.Game.player.y));
  }
  const cp = G.Game.player;
  econ.push({ stage: id, r: Math.round(cp.r), cost: Math.round(cost), meals,
              perMeal: meals ? +(dna / meals).toFixed(2) : 0,
              unit: +G.World.typicalDna(cp.stageId, cp.nodeIndex, cp.y).toFixed(2),
              sec: +(G.Game.stats.time - t0).toFixed(1), frames: f,
              deaths: econDeaths - d0, timedOut: dna < cost });
}
const totalSec = econ.reduce((a, b) => a + b.sec, 0);
const totalMeals = econ.reduce((a, b) => a + b.meals, 0);
console.log('\nECONOMY (meals + seconds to afford each stage, hunting optimally):');
econ.forEach(e => console.log('  ' + e.stage.padEnd(16) + ' r=' + String(e.r).padStart(4) +
  ' cost=' + String(e.cost).padStart(5) + ' meals=' + String(e.meals).padStart(4) +
  ' dna/meal=' + String(e.perMeal).padStart(6) + ' unit=' + String(e.unit).padStart(6) +
  ' sec=' + String(e.sec).padStart(6) + (e.timedOut ? '  <<< TIMED OUT' : '')));
console.log('  TOTAL: ' + totalMeals + ' meals, ' + Math.round(totalSec) + 's (' +
  (totalSec / 60).toFixed(1) + ' min) optimal play; deaths during probe: ' + econDeaths);
const slow = econ.filter(e => e.sec > 60);
if (slow.length) console.log('  (diagnostic) stages slower than 60s: ' + slow.map(e => e.stage + '=' + e.sec + 's').join(', '));
if (econ.some(e => e.timedOut)) console.log('  (diagnostic) ' + econ.filter(e => e.timedOut).length +
  ' stage(s) not affordable inside the 150s probe cap: ' + econ.filter(e => e.timedOut).map(e => e.stage).join(', '));
G.Game.newGame(); pump(10);

/* ---- 4. evolution panel + choose ---- */
G.Game.player.dna = 1e9;
G.Game.openEvolution();
pump(2);
if (G.Game.state !== 'EVOLVING') note('openEvolution did not enter EVOLVING state');
const cardCount = G.UI.el.cards.children.length;
console.log('evolution cards rendered:', cardCount);
if (cardCount !== 3) note('expected 3 evolution cards, got ' + cardCount);
pump(20);   // preview animation
const nodeBefore = G.Game.player.stageId;
G.Game.chooseEvolution(G.Game.player.stage.ch[0]);
pump(30);
console.log('evolved:', nodeBefore, '->', G.Game.player.stageId, '| r=' + G.Game.player.r.toFixed(1),
            '| state=' + G.Game.state);
if (G.Game.player.stageId === nodeBefore) note('chooseEvolution did not change stage');

/* ---- 5. full playthrough to a final form, hunting between evolutions ---- */
G.Game.newGame(); pump(5);
const route = [];
for (let i = 0; i < 30; i++) {
  const p = G.Game.player;
  if (p.stage.final) break;
  hunt(45);
  revive();
  G.Game.player.dna = G.Game.player.nextCost() + 1;
  G.Game.openEvolution();
  pump(3);
  if (G.Game.state !== 'EVOLVING') { note('openEvolution refused from state ' + G.Game.state); break; }
  // pick the choice that advances furthest, preferring a FINAL form once available
  const node = G.Game.player.stage;
  let best = node.ch[0], bd = -1;
  for (const c of node.ch) {
    const d = G.STAGES[c.to].final ? 9999 : (G.STAGE_DEPTH[c.to] || 0);
    if (d > bd) { bd = d; best = c; }
  }
  const rBefore = G.Game.player.r;
  G.Game.player.dna = Math.max(G.Game.player.dna, best.cost + 1);   // afford the card we pick
  G.Game.chooseEvolution(best);
  pump(6);
  if (G.Game.player.r === rBefore && !G.STAGES[best.to].final)
    note('chooseEvolution did not grow the player at ' + best.to);
  route.push({ i: i + 1, to: best.to, name: G.STAGES[best.to].name, r: Math.round(G.Game.player.r),
               hp: Math.round(G.Game.player.maxHp), spd: Math.round(G.Game.player.speed),
               traits: G.Game.player.traits.size });
  if (G.Game.state === 'VICTORY') break;
  if (G.Game.state !== 'PLAYING') { note('unexpected state after evolution: ' + G.Game.state); break; }
}
/* ---- 3c. PACE: a full playthrough that has to EARN every point of DNA ----
   The mechanical playthrough above grants DNA so it can test the evolution
   chain; this one does not, so it measures how long the game actually takes.
   A scripted bot is a lower bound on a human, who hunts far more efficiently. */
G.Game.newGame(); pump(5);
const pace = [];
let paceDeaths = 0, paceFrames = 0;
for (let i = 0; i < 30; i++) {
  const p = G.Game.player;
  if (p.stage.final) break;
  // aim at the card we are going to pick: nextCost() is the CHEAPEST choice,
  // and stopping there leaves the deepest branch unaffordable
  const node0 = p.stage;
  let pick = node0.ch[0], pd = -1;
  for (const c of node0.ch) {
    const d = G.STAGES[c.to].final ? 9999 : (G.STAGE_DEPTH[c.to] || 0);
    if (d > pd) { pd = d; pick = c; }
  }
  const cost = pick.cost, t0 = G.Game.stats.time, d0 = paceDeaths;
  let f = 0;
  while (G.Game.player.dna < cost && f < 9000) {
    hunt(30); f += 30;
    if (G.Game.state === 'DEAD') { paceDeaths++; revive(); }
  }
  paceFrames += f;
  if (process.env.DBG) {
    const q = G.Game.player;
    console.log('    [pace-end] ' + q.stageId + ' dna=' + q.dna.toFixed(1) + '/' + cost +
      ' meals=' + G.Game.stats.eaten + ' earned=' + G.Game.stats.dnaEarned.toFixed(1) +
      ' passive=' + (G.Game.stats.passiveDna||0).toFixed(1) + ' dnaRate=' + (q.dnaRate||0).toFixed(2) +
      ' unit=' + G.World.typicalDna(q.stageId,q.nodeIndex,q.y).toFixed(2) +
      ' deaths=' + (paceDeaths-d0) + ' traits=[' + [...q.traits].join(',') + ']');
    console.log('    [pace] ' + q.stageId + ' r=' + q.r.toFixed(0) + ' dnaRate=' + (q.dnaRate||0).toFixed(2) +
      ' intake=' + q.intake.toFixed(2) + ' dnaMul=' + (q.dnaMul||0).toFixed(2) +
      ' unit=' + G.World.typicalDna(q.stageId, q.nodeIndex, q.y).toFixed(2) +
      ' passive/s=' + ((q.dnaRate||0) * G.World.typicalDna(q.stageId,q.nodeIndex,q.y) * G.CFG.DNA_PASSIVE_MUL).toFixed(1) +
      ' traits=[' + [...q.traits].join(',') + ']');
  }
  pace.push({ i: i + 1, stage: G.Game.player.stageId, cost: Math.round(cost),
              meals: G.Game.stats.eaten, sec: +(G.Game.stats.time - t0).toFixed(1),
              frames: f, deaths: paceDeaths - d0, starved: G.Game.player.dna < cost });
  if (G.Game.player.dna < cost) { note('PACE: could not afford ' + G.Game.player.stageId +
    ' (got ' + G.Game.player.dna.toFixed(0) + '/' + Math.round(cost) + ' in ' + (f / 60).toFixed(0) + 's)'); break; }
  revive();
  G.Game.openEvolution(); pump(3);
  if (G.Game.state !== 'EVOLVING') { note('PACE: openEvolution refused'); break; }
  const best = pick;
  const dnaBefore = G.Game.player.dna, stageBefore = G.Game.player.stageId;
  G.Game.chooseEvolution(best);
  if (process.env.DBG) console.log('    [pace] ' + stageBefore + ' -> ' + G.Game.player.stageId +
    ' state=' + G.Game.state + ' dna ' + dnaBefore.toFixed(0) + '->' + G.Game.player.dna.toFixed(0) +
    ' cost=' + best.cost + ' to=' + best.to);
  pump(6);
  if (G.Game.state === 'VICTORY') break;
  if (G.Game.state === 'DEAD') { paceDeaths++; revive(); continue; }
  if (G.Game.state !== 'PLAYING') { note('PACE: unexpected state ' + G.Game.state); break; }
}
console.log('\nPACE (earned DNA, scripted bot = lower bound on a human):');
pace.forEach(e => console.log('  ' + String(e.i).padStart(2) + '. ' + e.stage.padEnd(17) +
  ' cost=' + String(e.cost).padStart(4) + ' meals=' + String(e.meals).padStart(4) +
  ' sec=' + String(e.sec).padStart(6) + (e.deaths ? ' deaths=' + e.deaths : '') +
  (e.starved ? '  <<< STARVED' : '')));
console.log('  PACE TOTAL: ' + (paceFrames / 60).toFixed(0) + 's (' + (paceFrames / 3600).toFixed(1) +
  ' min) for ' + pace.length + ' evolutions, ' + paceDeaths + ' deaths, state=' + G.Game.state);

console.log('\nplaythrough (' + route.length + ' evolutions):');
route.forEach(r => console.log('  ' + String(r.i).padStart(2) + '. ' + r.name.padEnd(28) +
  ' r=' + String(r.r).padStart(4) + ' hp=' + String(r.hp).padStart(5) +
  ' spd=' + String(r.spd).padStart(4) + ' traits=' + r.traits));
console.log('final state:', G.Game.state, '| stage:', G.Game.player.stageId,
            '| final=' + !!G.Game.player.stage.final);
if (G.Game.state !== 'VICTORY') note('playthrough did not reach VICTORY (state=' + G.Game.state + ')');
pump(60);   // victory portrait animation

/* ---- 6. keep swimming after victory ---- */
G.Game.continueAfterWin();
pump(30);
if (G.Game.state !== 'PLAYING') note('continueAfterWin did not return to PLAYING');

/* ---- 7. death + respawn ---- */
const cpStage = G.Game.checkpoint.stageId;
G.Game.player.hp = 1;
G.Game.die({ name: 'Test Leviathan' });
pump(5);
if (G.Game.state !== 'DEAD') note('die() did not enter DEAD state');
const dnaBefore = G.Game.player.dna;
G.Game.respawn();
pump(40);
console.log('death/respawn: stage kept=' + (G.Game.player.stageId === cpStage) +
            ' dna kept=' + (G.Game.player.dna / Math.max(1, dnaBefore)).toFixed(2) +
            ' hp=' + Math.round(G.Game.player.hp) + '/' + G.Game.player.maxHp +
            ' deaths=' + G.Game.stats.deaths);
if (G.Game.state !== 'PLAYING') note('respawn did not return to PLAYING');
if (G.Game.player.hp <= 0) note('respawned with no vitality');

/* ---- 8. depth sweep: every zone ---- */
const depths = [];
for (const y of [300, 2000, 5000, 8000, 12000, 16000, 20000, 25500]) {
  G.Game.player.y = y; G.Game.player.x = 0;
  hunt(50);
  depths.push({ y, zone: (G.ZONES.find(z => y < z.y1) || G.ZONES[3]).id, ents: G.World.entities.length,
                light: (G.ZONES.find(z => y < z.y1) || G.ZONES[3]).light });
}
console.log('depth sweep:', JSON.stringify(depths));

/* ---- 9. pressure gate ---- */
G.Game.player.y = G.CFG.MAX_DEPTH;
pump(60);
const lim = G.Game.depthLimit();
console.log('pressure gate: limit=' + Math.round(lim) + ' playerY=' + Math.round(G.Game.player.y));
if (G.Game.player.y > lim + 200) note('pressure barrier failed to hold the player (y=' +
  Math.round(G.Game.player.y) + ' limit=' + Math.round(lim) + ')');

/* ---- 10. pause / resume / mute ---- */
G.Game.setState('PAUSED'); pump(5);
G.Game.setState('PLAYING'); pump(5);
windowObj.__THALASSA.Sound.toggleMute(); pump(5);
windowObj.__THALASSA.Sound.toggleMute(); pump(5);
console.log('pause+mute cycle ok, state=' + G.Game.state);

/* ---- 11. resize ---- */
windowObj.innerWidth = 1920; windowObj.innerHeight = 1080;
G.R.resize(); pump(20);
console.log('resize 1920x1080 -> buffer ' + G.R.BW + 'x' + G.R.BH + ' (S=' + G.R.S.toFixed(3) + ')');
windowObj.innerWidth = 420; windowObj.innerHeight = 780;
G.R.resize(); pump(20);
console.log('resize 420x780  -> buffer ' + G.R.BW + 'x' + G.R.BH + ' (S=' + G.R.S.toFixed(3) + ')');
windowObj.innerWidth = 1280; windowObj.innerHeight = 800; G.R.resize(); pump(10);

/* ---- 12. walk EVERY node and render every choice-preview ---- */
let visited = 0, previewCount = 0;
const seen = new Set();
(function walk(id) {
  if (seen.has(id)) return;
  seen.add(id); visited++;
  const p = G.Game.player;
  p.traits = new Set(); p.visPatches = []; p.statDeltas = {};
  p.setStage(id, { deltas: {} });
  for (const k of ['r','maxHp','speed','sense','melee','armor','regen','maxStam','dnaRate'])
    if (!isFinite(p[k])) note('node ' + id + ' produced non-finite ' + k + ' = ' + p[k]);
  const cv = document.createElement('canvas'); cv.width = 300; cv.height = 112;
  const c = cv.getContext('2d');
  try { G.Vis.body(c, p.vis, p.r, 1.4, { detail:true, dim:0.5, alpha:1, seed:visited, animate:true }); }
  catch (e) { note('node ' + id + ' body render threw: ' + e.message); }
  const node = G.STAGES[id];
  if (node.ch) for (const ch of node.ch) {
    const tgt = G.STAGES[ch.to];
    if (!tgt) { note(id + ' -> missing node ' + ch.to); continue; }
    const merged = Object.assign({}, p.vis, tgt.vis);
    try { G.Vis.body(c, merged, tgt.st.r, 2.2, { detail:true, dim:0, alpha:1, seed:previewCount+1, animate:true }); }
    catch (e) { note('preview ' + id + '->' + ch.to + ' threw: ' + e.message); }
    previewCount++;
    walk(ch.to);
  }
})('c01_luca');
console.log('graph walk: visited ' + visited + '/' + Object.keys(G.STAGES).length +
            ' nodes, rendered ' + previewCount + ' choice previews');

/* ---- 13. every creature spec at many sizes and darkness levels ---- */
let passes = 0;
for (const id in G.EDIBLES) {
  const spec = G.EDIBLES[id];
  for (const r of [spec.r[0], (spec.r[0]+spec.r[1])/2, spec.r[1], spec.r[1]*3]) {
    for (const detail of [false, true]) for (const dim of [0, 0.5, 0.95]) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      G.Vis.body(cv.getContext('2d'), spec.vis, r, passes * 0.7, { detail, dim, alpha:1, seed:passes+3, animate:detail });
      passes++;
    }
  }
}
console.log('bestiary render passes:', passes);

/* ---- 14. performance profile ---- */
G.Game.newGame(); pump(20); hunt(200);
frameTimes.length = 0;
hunt(400);
const sorted = frameTimes.slice().sort((a,b)=>a-b);
const pct = q => sorted[Math.min(sorted.length-1, Math.floor(sorted.length*q))];
console.log('\nframe time over ' + sorted.length + ' frames (ms): median=' + pct(0.5).toFixed(2) +
            ' p95=' + pct(0.95).toFixed(2) + ' max=' + sorted[sorted.length-1].toFixed(2));
console.log('entities=' + G.World.entities.length + ' chunks=' + G.World.chunks.size +
            ' sprites=' + G.Sprites.cache.size + ' ctxCalls=' + ctxCalls +
            ' gradients=' + gradientCalls + ' audioNodes=' + audioNodes);

console.log('\n=== PROBLEMS (' + problems.length + ') ===');
const uniq = [...new Set(problems)];
uniq.slice(0, 40).forEach(p => console.log('  ' + p));
if (!uniq.length) console.log('  none');
process.exit(uniq.length ? 1 : 0);
