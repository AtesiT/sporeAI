'use strict';
/* ============================================================================
   THALASSA — From Bacterium to Leviathan
   A single-file 2D evolution game. Procedural graphics, procedural audio,
   no external assets or libraries.

   ARCHITECTURE (sections are marked with ===== banners =====)
     0  CONFIG + MATH/RNG UTILITIES
     1  EVOLUTION GRAPH (data-driven, 30 nodes)
     2  CREATURE / FOOD SPECS (data-driven)
     3  ZONES (depth biomes)
     4  SOUND ENGINE (WebAudio, 100% synthesised)
     5  VISUALS: procedural body renderer + sprite cache
     6  WORLD: chunk hash, deterministic seeding, spatial queries
     7  ENTITIES: Food, Creature, Player, particles
     8  CAMERA + RENDERER
     9  UI (DOM)
    10  GAME state machine + loop + input
   ========================================================================== */

/* ============================================================================
   0. CONFIG + UTILITIES
   ========================================================================== */
const CFG = {
  // --- world -------------------------------------------------------------
  CHUNK: 420,               // world units per chunk cell
  MAX_DEPTH: 26000,         // bottom of the ocean (world y)
  MIN_Y: -260,              // sea surface
  LOAD_R: 1,                // chunks loaded around the camera (radius in cells)
  UNLOAD_R: 3,              // chunks beyond this are discarded

  // --- player ------------------------------------------------------------
  START_STAGE: 'c01_luca',
  RESPAWN_DNA_KEEP: 0.4,    // fraction of unspent DNA kept on death
  IFRAMES: 1.05,            // invulnerability seconds after a bite
  POST_EVO_GRACE: 3.2,      // "scare pulse" after evolving: predators scatter
  BURST_MUL: 1.72,
  STAM_DRAIN: 34,
  STAM_REGEN: 23,
  DEADZONE: 14,             // world units around the cursor where thrust stops
                            // (floored; scaled by body size in Player.update)

  // --- eating / DNA ------------------------------------------------------
  EAT_RATIO: 0.82,          // you can swallow prey whose r <= yourR * EAT_RATIO
  PREY_FLEE_RATIO: 1.22,    // prey flees anything this much bigger than itself
  /* DNA economy -------------------------------------------------------
     A meal is worth  refDNA(stage) * spec.dna * bodyFactor, where refDNA is
     derived from the zone's own prey table (see World.refDNA) and bodyFactor
     compares the meal to what is typical for your size. Because refDNA grows
     geometrically with the stage index at almost exactly the rate that
     evolution costs do, every stage needs a similar number of meals no matter
     whether you are 12 µm or 12 m. */
  DNA_MEALS_PER_STAGE: 30,  // mouthfuls per stage at the SMALLEST body size;
                            // a typical meal is worth 1/33 of the stage cost
  DNA_BIG_MEAL_POW: 0.55,   // how much a rich prey out-pays a lean one
  DNA_FOOD_MUL: 1.00,       // drifting particle vs. a proper meal
  DNA_PASSIVE_MUL: 0.35,    // photosynthesis / filter feeding tops you up

  // --- camera ------------------------------------------------------------
  CAM_K: 66,                // zoom = CAM_K / r  (r in world units)
  CAM_MIN: 0.052,
  CAM_MAX: 1.25,
  CAM_LERP: 4.2,
  CAM_LOOKAHEAD: 0.16,      // fraction of screen the cursor pulls the camera

  // --- pixel-art render buffer -------------------------------------------
  MIN_SIDE: 760,            // internal buffer never smaller than this (short side)
  PIX_MIN: 0.5,             // tightest downscale (most pixelated)
  PIX_MAX: 0.68,            // loosest downscale
  PIX_TARGET: 900,          // buffer short side we aim for

  // --- performance governor ----------------------------------------------
  MAX_ENTITIES: 460,
  MAX_LEVIATHANS: 9,        // landmarks, not a population
  FPS_LOW: 46,
  FPS_HIGH: 57,

  // --- audio -------------------------------------------------------------
  MASTER: 0.5,
};

/* ---- math helpers ---- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (v - a) / (b - a || 1);
const smoothstep = t => t * t * (3 - 2 * t);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const angLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};
const sign = Math.sign;
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
/** Weighted pick from a table of [id, weight] pairs. */
function pickWeighted(table) {
  let tot = 0;
  for (let i = 0; i < table.length; i++) tot += table[i][1];
  let r = Math.random() * tot;
  for (let i = 0; i < table.length; i++) { r -= table[i][1]; if (r <= 0) return table[i][0]; }
  return table[table.length - 1][0];
}

/* ---- deterministic RNG (mulberry32) + spatial hash ---- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const chunkKey = (cx, cy) => cx + ',' + cy;

/* ---- colour helpers (we work in hsl strings for compactness) ---- */
const hsl = (h, s, l, a = 1) => a >= 1 ? `hsl(${h|0} ${s|0}% ${l|0}%)` : `hsla(${h|0} ${s|0}% ${l|0}% / ${a})`;
function mixHsl(c1, c2, t) {   // c = [h,s,l]
  let dh = ((c2[0] - c1[0] + 540) % 360) - 180;
  return [c1[0] + dh * t, lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
const shade = (c, dl, ds = 0) => [c[0], clamp(c[1] + ds, 0, 100), clamp(c[2] + dl, 0, 100)];

/* ---- small object pools (avoid GC churn) ---- */
class Pool {
  constructor(factory, reset) { this.f = factory; this.r = reset; this.free = []; }
  get() { return this.free.length ? this.free.pop() : this.f(); }
  put(o) { if (this.free.length < 600) { this.r && this.r(o); this.free.push(o); } }
}
