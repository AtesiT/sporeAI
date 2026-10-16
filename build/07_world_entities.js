
/* ============================================================================
   6. WORLD — chunked, deterministic, infinite in X, depth-bounded in Y
   ----------------------------------------------------------------------------
   The ocean is a spatial hash of CHUNK×CHUNK cells. A cell is seeded the first
   time it enters the load radius, from a hash of its coordinates, so returning
   to a depth feels like the same ocean. Cells leaving the unload radius are
   emptied. Density scales with the player's size, so the world "zooms out"
   gracefully from a bacterium's soup of particles to a whale's empty blue.
   ========================================================================== */

/* Density multiplier applied on top of each zone's relative weights.
   Tuned so a loaded region holds a few hundred entities at most. */
const DENSITY = { food: 2.6, prey: 1.25, pred: 0.26, lev: 0.04 };

const World = {
  chunks: new Map(),
  entities: [],
  byId: new Map(),
  nextId: 1,
  loadR: 3,
  quality: 1,                 // adaptive governor, 0.45..1
  player: null,
  time: 0,
  predationBudget: 0,         // rate limit for NPC-on-NPC eating

  reset() {
    this.chunks.clear(); this.entities.length = 0; this.byId.clear();
    this.nextId = 1; this.time = 0;
  },

  /* ---- chunk plumbing -------------------------------------------------- */
  /**
   * Cell size grows with the player, so a 232-unit whale is not streaming 180
   * bacterium-scale cells to cover one screen. Cells stay large enough to hold
   * a believable local ecosystem, and per-chunk density is scaled by cell area
   * so the ocean reads the same at every stage of life.
   */
  chunkSize() {
    const p = this.player;
    return clamp(Math.ceil((p ? p.r : CFG.CHUNK / 70) * 3 / CFG.CHUNK) * CFG.CHUNK,
                 CFG.CHUNK, CFG.CHUNK * 3);
  },
  cx(x) { return Math.floor(x / this.chunkSize()); },
  cy(y) { return Math.floor(y / this.chunkSize()); },

  getChunk(cx, cy, create = false) {
    const k = cx + ',' + cy;
    let c = this.chunks.get(k);
    if (!c && create) {
      const S = this.chunkSize();
      c = { cx, cy, x: cx * S, y: cy * S, ents: [], seeded: false };
      this.chunks.set(k, c);
    }
    return c;
  },

  add(ent, chunk) {
    ent.id = this.nextId++;
    this.entities.push(ent);
    this.byId.set(ent.id, ent);
    const c = chunk || this.getChunk(this.cx(ent.x), this.cy(ent.y), true);
    ent.chunk = c; c.ents.push(ent);
    return ent;
  },

  remove(ent) {
    if (ent.dead) return;
    ent.dead = true;
    if (ent.chunk) {
      const i = ent.chunk.ents.indexOf(ent);
      if (i >= 0) ent.chunk.ents.splice(i, 1);
    }
    const j = this.entities.indexOf(ent);
    if (j >= 0) this.entities.splice(j, 1);
    this.byId.delete(ent.id);
  },

  /** Move an entity between chunk cells when it crosses a boundary. */
  rechunk(ent) {
    const cx = this.cx(ent.x), cy = this.cy(ent.y);
    const c = ent.chunk;
    if (c && c.cx === cx && c.cy === cy) return;
    // never create cells here: an entity that wanders out of the loaded disc
    // simply leaves its old cell, and the unload sweep will collect it
    const nc = this.getChunk(cx, cy, false);
    if (c) { const i = c.ents.indexOf(ent); if (i >= 0) c.ents.splice(i, 1); }
    if (!nc) { ent.chunk = null; return; }
    ent.chunk = nc; nc.ents.push(ent);
  },

  /** Entities whose chunk cell is one of the 3×3 cells around (x,y). */
  nearChunks(x, y) {
    const out = [], cx = this.cx(x), cy = this.cy(y);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const c = this.chunks.get(chunkKey(cx + i, cy + j));
      if (c) out.push(c);
    }
    return out;
  },

  /* ---- streaming ------------------------------------------------------- */
  update(camX, camY, halfW, halfH) {
    const S = this.chunkSize();
    // load radius adapts to how much world is visible, bounded for perf
    const need = Math.max(halfW, halfH) * 1.35 + S;
    this.loadR = clamp(Math.ceil(need / S), 2, 4);
    const ccx = this.cx(camX), ccy = this.cy(camY);

    // 1. drop cells that are far behind us FIRST. Seeding before unloading
    //    leaves the population governor looking at an ocean that is still full
    //    of last position's wildlife, so it spawns nothing and a player who
    //    travels (or is teleported by the test harness) arrives at an empty sea.
    const far = this.loadR + CFG.UNLOAD_R;
    for (const [k, c] of this.chunks) {
      const d = Math.max(Math.abs(c.cx - ccx), Math.abs(c.cy - ccy));
      if (d > far) {
        for (let i = c.ents.length - 1; i >= 0; i--) {
          const e = c.ents[i];
          if (e === this.player) continue;
          if (e.leviathan) { this.rehomeLeviathan(e, camX, camY, S); continue; }
          this.remove(e);
        }
        this.chunks.delete(k);
      }
    }
    // 2. seed newly-visible cells
    for (let j = -this.loadR; j <= this.loadR; j++) {
      for (let i = -this.loadR; i <= this.loadR; i++) {
        const c = this.getChunk(ccx + i, ccy + j, true);
        if (!c.seeded) this.seedChunk(c);
      }
    }
    // 3. leviathans are landmarks, but they must not become a population:
    //    they are exempt from thinning, so an unbounded count would eventually
    //    crowd out every scrap of food in the ocean.
    let lev = 0;
    for (const e of this.entities) if (e.leviathan) lev++;
    if (lev > CFG.MAX_LEVIATHANS) {
      const all = [];
      for (const e of this.entities) if (e.leviathan) all.push(e);
      all.sort((a, b) => dist2(b.x, b.y, camX, camY) - dist2(a.x, a.y, camX, camY));
      for (let i = 0; i < all.length && lev > CFG.MAX_LEVIATHANS; i++) { this.remove(all[i]); lev--; }
    }
    // 4. global population cap: thin the oldest far cells first
    if (this.entities.length > CFG.MAX_ENTITIES * this.quality)
      this.thin(camX, camY, Math.min(Math.max(halfW, halfH) * 1.05, 1500));
  },

  /** Leviathans are landmarks — relocate them instead of deleting them. */
  rehomeLeviathan(e, camX, camY, S) {
    const a = Math.random() * TAU;
    const cell = S || this.chunkSize();
    const d = rnd(cell * 1.2, cell * 2.1);      // stays inside the loaded disc
    e.x = camX + Math.cos(a) * d;
    e.y = clamp(camY + Math.sin(a) * d * 0.4, CFG.MIN_Y + 400, CFG.MAX_DEPTH - 400);
    e.vx = Math.cos(a + Math.PI) * e.speed * 0.4;
    this.rechunk(e);
  },

  /** Hard population cap. Thins from the outside in, and never touches
      anything inside the current view (that would look like popping). */
  thin(camX, camY, keepR) {
    const budget = CFG.MAX_ENTITIES * this.quality;
    const keepR2 = keepR * keepR;
    let removed = 0;
    for (let pass = 0; pass < 3 && this.entities.length > budget; pass++) {
      for (let i = this.entities.length - 1; i >= 0 && this.entities.length > budget; i--) {
        const e = this.entities[i];
        if (e === this.player || e.leviathan) continue;
        if (pass === 0 && e.kind !== 'food') continue;                      // drift food first
        if (pass === 1 && !(e.kind === 'creature' && e.beh === 'prey')) continue;
        if (pass === 2 && !(e.kind === 'creature' && e.beh !== 'prey')) continue;
        if (dist2(e.x, e.y, camX, camY) < keepR2) continue;
        this.remove(e); removed++;
      }
    }
    return removed;
  },

  /**
   * Body-size factor for one meal, normalised against the radius a meal of that
   * kind typically arrives at (see spawn()). The biggest bite the gape allows
   * pays the most and a speck pays least, but the AVERAGE mouthful is 1.0 —
   * which is what keeps "one stage = DNA_MEALS_PER_STAGE mouthfuls" true at
   * every scale. Shared by Player.dnaFor and World.typicalDna so the two can
   * never drift apart.
   */
  bodyFactor(spec, playerR, r) {
    if (spec.beh === 'drift') return clamp(r / (playerR * 0.20), 0.45, 1.3);
    const mid = playerR * CFG.EAT_RATIO * 0.63;        // geometric centre of the prey band
    return clamp(r / mid, 0.60, 1.30);
  },

  /** Cost of the cheapest choice at a node = the price of the next stage. */
  costOf(stageId) {
    const n = STAGES[stageId];
    if (!n || !n.ch) return Infinity;
    let m = Infinity;
    for (const c of n.ch) if (c.cost < m) m = c.cost;
    return m;
  },

  /**
   * DNA value of a TYPICAL meal for this stage and depth.
   *
   *   typical = stageCost / DNA_MEALS_PER_STAGE
   *
   * which is what makes "~33 meals per stage" hold at every one of the 36
   * nodes, from a 12-DNA first decision to a 980-DNA terminal one. It is
   * modulated by the *relative* richness of the prey this depth actually
   * offers, so the deep pays better than the shallows, as designed.
   */
  _refCache: {},
  typicalDna(stageId, nodeIndex, y) {
    const cost = this.costOf(stageId);
    if (!isFinite(cost)) return 0;
    const zi = zoneIndex(y);
    const key = stageId + ':' + zi;
    const cached = this._refCache[key];
    if (cached !== undefined) return cached;

    const r = STAGES[CFG.START_STAGE].st.r * Math.pow(1.0988, nodeIndex);
    const lo = r * CFG.EAT_RATIO * 0.34, hi = r * CFG.EAT_RATIO * 0.95;

    // Weighted mean spec.dna of the prey the spawner will ACTUALLY produce at
    // this scale: same tableFor() reweighting, so expectation matches reality.
    const meanAt = (table) => {
      const rw = this.tableFor(table, lo, hi);
      let tot = 0, w = 0;
      for (const [id, ww] of rw) { tot += EDIBLES[id].dna * ww; w += ww; }
      return w > 0 ? tot / w : 0;
    };
    const local = meanAt(ZONES[zi].tables.prey);
    let all = 0, allN = 0;
    for (const z of ZONES) { const m = meanAt(z.tables.prey); if (m > 0) { all += m; allN++; } }
    const globalMean = allN ? all / allN : 1;
    // deep water pays a premium, but never a penalty: the rising stage cost
    // is already the difficulty curve
    const rel = clamp(local / (globalMean || 1), 0.9, 1.5);

    // The unit is "what one average mouthful is worth", so the expectation has
    // to be taken over the meals the spawner actually produces: the same
    // tableFor() reweighting, the real size band, the real richness spread and
    // the real split between prey and drifting particles. Compute it from
    // anything less and every stage quietly takes two or three times as long.
    const pr = this.player ? this.player.r : r;
    // Mirror spawn() exactly: a body is rescaled into the band, so the radius a
    // meal actually arrives at is bandMid * clamp(bandMid/natural, ...) rather
    // than its natural size. Estimating the expectation from anything else made
    // every meal pay half what the unit assumed.
    const spawnR = (sp, bLo, bHi) => {
      const mid = Math.sqrt(bLo * bHi);
      const nat = (sp.r[0] + sp.r[1]) * 0.5;
      const sc = sp.beh === 'drift'
        ? clamp(pr * 0.2 / nat, 0.45, 9)
        : clamp(mid / nat, 0.42, 4.5);
      return nat * sc;
    };
    const expect = (table, bandLo, bandHi) => {
      const rw = this.tableFor(table, bandLo, bandHi);
      let wsum = 0, acc = 0;
      for (const [id, ww] of rw) {
        const sp = EDIBLES[id];
        const e = ww * this.bodyFactor(sp, pr, spawnR(sp, bandLo, bandHi)) *
                  Math.pow(Math.max(0.02, sp.dna) / globalMean, CFG.DNA_BIG_MEAL_POW) *
                  (sp.beh === 'drift' ? CFG.DNA_FOOD_MUL : 1);
        acc += e; wsum += ww;
      }
      return wsum > 0 ? acc / wsum : 0;
    };
    const ePrey = expect(ZONES[zi].tables.prey, lo, hi);
    const eFood = expect(ZONES[zi].tables.food, lo * 0.4, hi * 0.8);
    const expected = clamp(ePrey * 0.7 + eFood * 0.3, 0.2, 3);

    // How many mouthfuls a stage costs grows with the body taking them, but
    // sub-linearly in r. A flat count let income run away as r^2 (encounter
    // rate is reach x speed and reach is proportional to radius) while costs grew
    // only 1.15x per stage, so DNA snowballed and the second half of the game
    // was instant. A fully linear count over-corrected: past the point where
    // drifting particles stop being food, only scattered prey count and the
    // effective catch rate flattens out. r^0.35 matches what was measured: a
    // couple of dozen mouthfuls as a bacterium, about eighty as a whale, and
    // roughly half a minute of hunting at either end.
    const r0 = STAGES[CFG.START_STAGE].st.r;
    const meals = CFG.DNA_MEALS_PER_STAGE * Math.pow(clamp(r / r0, 1, 40), 0.35);

    return this._refCache[key] = (cost / meals) * rel / expected;
  },

  /**
   * Filter a spawn table down to the species whose natural size suits the
   * player right now, so the ocean always contains food and threats that are
   * relevant at your scale (and so nothing has to be resized 4× to fit).
   */
  tableFor(table, lo, hi) {
    // Re-weight the whole table by how well each species fits the wanted size
    // band. Nothing is excluded (the ocean stays diverse) but well-fitting
    // species dominate, so we rarely have to stretch a body 3x to fit.
    const want = Math.sqrt(lo * hi);
    let bestFit = 0;
    const scored = table.map(pair => {
      const sp = EDIBLES[pair[0]];
      const med = (sp.r[0] + sp.r[1]) * 0.5;
      const nat = clamp(want, sp.r[0], sp.r[1]);
      const fit = nat / med;
      const w = pair[1] * Math.exp(-3.4 * Math.abs(Math.log(fit)));
      if (w > bestFit) bestFit = w;
      return [pair[0], w, fit];
    });
    if (bestFit <= 0) {                       // nothing fits: take the closest
      let bi = 0, bd = Infinity;
      scored.forEach((e, i) => { const d = Math.abs(Math.log(e[2])); if (d < bd) { bd = d; bi = i; } });
      return [[scored[bi][0], 1]];
    }
    return scored.map(e => [e[0], Math.max(0.0001, e[1])]);
  },

  /** Natural-scale factor implied by tableFor's weighting, for one species. */
  fitScale(spec, lo, hi) {
    const want = Math.sqrt(lo * hi);
    const med = (spec.r[0] + spec.r[1]) * 0.5;
    return clamp(want, spec.r[0], spec.r[1]) / med;
  },

  /* ---- deterministic chunk seeding ------------------------------------- */
  seedChunk(c) {
    c.seeded = true;
    const S = this.chunkSize();
    const zone = zoneAt(c.y + S * 0.5);
    const rand = mulberry32(hash2(c.cx, c.cy, 0x9e37));
    const p = this.player;
    const pr = p ? p.r : 6;
    const q = this.quality;
    // A bigger cell covers more water, so it holds proportionally more life —
    // but if the ocean is already crowded we hold back instead of spawning a
    // population that the cap would immediately strip away (which is what
    // used to delete every last food particle at whale scale).
    const area = (S / CFG.CHUNK) * (S / CFG.CHUNK);
    const budget = CFG.MAX_ENTITIES * q;
    const gov = clamp((budget - this.entities.length) / Math.max(1, budget * 0.3), 0, 1);
    const counts = {
      food: zone.dens.food * DENSITY.food * zone.plants * q * area * gov * (0.7 + rand() * 0.6),
      prey: zone.dens.prey * DENSITY.prey * q * area * gov * (0.6 + rand() * 0.8),
      pred: zone.dens.pred * DENSITY.pred * q * area * gov * (0.5 + rand() * 1.0),
      lev:  zone.dens.lev  * DENSITY.lev  * (rand() < 0.5 ? 1 : 0),
    };

    const place = (rx, ry) => ({
      x: c.x + rx * S,
      y: clamp(c.y + ry * S, zone.y0 + 30, Math.min(zone.y1 - 30, CFG.MAX_DEPTH - 30)),
    });

    // --- size-banded spawn tables for this player scale -------------------
    const edibleLo = pr * CFG.EAT_RATIO * 0.34, edibleHi = pr * CFG.EAT_RATIO * 0.95;
    const threatLo = pr * 1.5, threatHi = pr * 3.2;
    const foodTable = this.tableFor(zone.tables.food, edibleLo * 0.4, edibleHi * 0.8);
    const preyTable = this.tableFor(zone.tables.prey, edibleLo, edibleHi);
    const predTable = this.tableFor(zone.tables.pred, threatLo, threatHi);

    // --- FOOD: mostly in clustered patches (currents of particles) --------
    let food = counts.food | 0;
    if (rand() < (counts.food % 1)) food++;
    let placed = 0, guard = 0;
    while (placed < food && guard++ < 200) {
      const patch = rand() < 0.62;
      const n = patch ? 3 + ((rand() * 7) | 0) : 1;
      const base = place(rand(), rand());
      for (let i = 0; i < n && placed < food; i++) {
        const id = pickWeighted(foodTable);
        const spec = EDIBLES[id];
        const spread = patch ? S * 0.14 : 0;
        const pos = patch ? {
          x: base.x + (rand() - 0.5) * spread * 2,
          y: clamp(base.y + (rand() - 0.5) * spread * 2, zone.y0 + 20, zone.y1 - 20),
        } : place(rand(), rand());
        this.spawn(id, spec, pos.x, pos.y, pr, rand);
        placed++;
      }
    }

    // --- PREY --------------------------------------------------------------
    let prey = counts.prey | 0;
    if (rand() < (counts.prey % 1)) prey++;
    for (let i = 0; i < prey; i++) {
      const id = pickWeighted(preyTable);
      const pos = place(rand(), rand());
      this.spawn(id, EDIBLES[id], pos.x, pos.y, pr, rand);
    }

    // --- PREDATORS -------------------------------------------------------- */
    let pred = counts.pred | 0;
    if (rand() < (counts.pred % 1)) pred++;
    for (let i = 0; i < pred; i++) {
      const id = pickWeighted(predTable);
      const pos = place(rand(), rand());
      this.spawn(id, EDIBLES[id], pos.x, pos.y, pr, rand);
    }

    // --- LEVIATHANS ------------------------------------------------------- */
    const lev = counts.lev;
    for (let i = 0; i < lev; i++) {
      const id = pickWeighted(zone.tables.lev);
      const pos = place(rand(), rand());
      this.spawn(id, EDIBLES[id], pos.x, pos.y, pr, rand);
    }
  },

  /**
   * Instantiate one entity from its spec, scaled to the player's current size.
   * Prey stays in the edible band; predators land in the 1.5×–3.2× threat band.
   */
  spawn(id, spec, x, y, playerR, rand) {
    const rNat = (spec.r[0] + spec.r[1]) * 0.5;
    let scale = 1, r = rNat * rnd(spec.r[0] / rNat, spec.r[1] / rNat);
    if (spec.beh === 'prey') {
      // centre the prey band just below what the player can swallow, so there
      // is always substantial food at whatever size you have reached
      const target = playerR * CFG.EAT_RATIO * rnd(0.34, 0.92);
      scale = clamp(target / rNat, 0.42, 4.5);
      r = rNat * scale;
    } else if (spec.beh === 'predator') {
      const target = playerR * rnd(1.55, 3.2);
      scale = clamp(target / rNat, 0.5, 4.5);
      r = target;
    } else if (spec.beh === 'cruise') {
      const target = playerR * rnd(2.6, 4.6);
      scale = clamp(target / rNat, 0.6, 3.2);
      r = target;
    } else {   // drift food: a particle cloud that always reads at your scale
      scale = clamp(playerR * 0.2 / rNat, 0.45, 9);
      r = rNat * scale;
    }
    if (spec.beh === 'drift') {
      const f = new Food(id, spec, x, y, r);
      return this.add(f);
    }
    const c = new Creature(id, spec, x, y, r, scale);
    // Prey are absolutely capped below the player's own speed. Prey stats are
    // authored in absolute units while the player's speed comes from the stage
    // table, so without this a stretched squid (spd 110 x 1.3 scale) can outrun
    // a 130-speed shark and the late ocean becomes unhuntable. Predators are
    // deliberately left uncapped: they are supposed to be able to run you down.
    const ps = this.player ? this.player.speed : 0;
    if (ps > 0) {
      if (spec.beh === 'prey') {
        // Prey must never outrun you, or the ocean is simply uncatchable.
        if (c.speed > ps * 0.82) c.speed = ps * rnd(0.64, 0.82);
      } else if (spec.beh === 'predator' && !c.leviathan) {
        // ...and a predator must never be able to run you down either. The
        // threat is that it costs you time and health to slip past, not that
        // fleeing is mathematically impossible. Leviathans stay untouchable.
        if (c.speed > ps * 0.88) c.speed = ps * rnd(0.74, 0.88);
      }
    }
    return this.add(c);
  },
};

/* ============================================================================
   7. ENTITIES
   ========================================================================== */

let _uid = 1;
class Entity {
  constructor(x, y, r) {
    this.id = 0; this.x = x; this.y = y; this.r = r;
    this.vx = 0; this.vy = 0; this.ang = 0;
    this.dead = false; this.chunk = null;
    this.phase = Math.random() * TAU;
  }
  /** Integrate water physics: thrust toward `want`, then fluid drag. */
  integrate(dt, wantX, wantY, accel, drag) {
    this.vx += (wantX - this.vx) * accel * dt;
    this.vy += (wantY - this.vy) * accel * dt;
    const d = Math.pow(drag, dt * 60);
    this.vx *= d; this.vy *= d;
    this.x += this.vx * dt; this.y += this.vy * dt;
    // world bounds: surface and seafloor
    if (this.y < CFG.MIN_Y + this.r) { this.y = CFG.MIN_Y + this.r; this.vy = Math.abs(this.vy) * 0.3; }
    if (this.y > CFG.MAX_DEPTH - this.r) { this.y = CFG.MAX_DEPTH - this.r; this.vy = -Math.abs(this.vy) * 0.3; }
  }
}

/* ---------------------------------------------------------------------------
   FOOD — drifting particles, anchored plants, carcass falls
   ------------------------------------------------------------------------- */
class Food extends Entity {
  constructor(id, spec, x, y, r) {
    super(x, y, r);
    this.kind = 'food';
    this.specId = id; this.spec = spec; this.vis = spec.vis;
    this.beh = 'drift';
    this.hp = spec.hp; this.maxHp = spec.hp;
    this.dna = spec.dna;
    this.anchor = !!spec.vis.anchor;
    this.leviathan = false;
    const a = Math.random() * TAU;
    const s = this.anchor ? 0 : spec.spd * rnd(0.5, 1.1);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.4 + (this.anchor ? 0 : rnd(1, 5));
    this.wob = Math.random() * TAU;
    this.sway = rnd(0.4, 1.3);
    this.spriteSeed = (Math.random() * 65535) | 0;
  }
  update(dt) {
    this.phase += dt * 1.6;
    if (this.anchor) { this.vx = 0; this.vy = 0; return; }
    // gentle brownian drift + slow sink (marine snow)
    this.wob += dt * this.sway;
    this.vx += Math.cos(this.wob * 0.7) * 3 * dt;
    this.vy += Math.sin(this.wob) * 2.4 * dt + 1.6 * dt;
    const d = Math.pow(0.985, dt * 60);
    this.vx *= d; this.vy *= d;
    const sp = Math.hypot(this.vx, this.vy), max = this.spec.spd * 1.6 + 6;
    if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y > CFG.MAX_DEPTH - this.r) { this.y = CFG.MAX_DEPTH - this.r; this.vy = 0; }
    if (this.y < CFG.MIN_Y + this.r) { this.y = CFG.MIN_Y + this.r; this.vy = 0; }
    this.ang = this.vis.fronds ? 0 : this.wob * 0.2;
  }
}

/* ---------------------------------------------------------------------------
   CREATURE — autonomous prey / predator / leviathan
   ------------------------------------------------------------------------- */
class Creature extends Entity {
  constructor(id, spec, x, y, r, scale) {
    super(x, y, r);
    this.kind = 'creature';
    this.specId = id; this.spec = spec; this.vis = spec.vis;
    this.name = spec.n;
    this.beh = spec.beh;
    this.leviathan = !!spec.leviathan;
    this.scale = scale;
    // 0.8x: the player gets 1.4x its stat, so keeping the wild population a
    // little slower than you is what makes hunting feel like hunting.
    this.speed = spec.spd * 0.8 * (this.leviathan ? 1.25 : clamp(1 / Math.pow(scale, 0.12), 0.72, 1.35));
    // HP grows far more slowly than size: a body stretched 4x to fill the
    // player's gape must not become a 3x-longer fight. The player's bite grows
    // roughly with radius, so a shallow exponent keeps every meal a couple of
    // seconds of chomping at every stage of life.
    this.maxHp = Math.max(1, Math.round(spec.hp * Math.pow(scale, 0.30)));
    this.hp = this.maxHp;
    this.sense = (spec.sense || 200) * clamp(Math.pow(scale, 0.5), 0.6, 2.2);
    this.aggr = spec.aggr || 0;
    this.melee = Math.max(1, this.r * 1.35);
    // A predator's bite is scaled against the player's CURRENT vitality, so no
    // matter how large you grow, being jumped is never a two-hit death. Threat
    // comes from numbers and from being slow, not from one enormous chomp.
    const wp = World.player;
    if (spec.beh === 'predator' && wp && wp.maxHp > 0) {
      const cap = wp.maxHp * 0.20 / 0.62;   // >= 5 bites to kill you, always
      if (this.melee > cap) this.melee = cap;
    }
    this.dna = spec.dna;
    this.drag = this.leviathan ? 0.995 : 0.972;
    this.accel = clamp(760 / Math.max(8, this.r), 3.0, 20);
    // AI state
    this.ai = 'idle';
    this.wanderAng = Math.random() * TAU;
    this.wanderT = rnd(0.6, 2.6);
    this.target = null;
    this.huntT = 0; this.giveUpT = 0;
    this.fleeT = 0;
    this.biteCd = 0;
    this.spriteSeed = (Math.random() * 65535) | 0;
    this.flash = 0;
    if (this.beh === 'cruise') {   // leviathans patrol a horizontal lane
      this.laneY = y;
      this.vx = (Math.random() < 0.5 ? -1 : 1) * this.speed;
      this.ang = this.vx > 0 ? 0 : Math.PI;
    } else {
      const a = Math.random() * TAU;
      this.vx = Math.cos(a) * this.speed * 0.5; this.vy = Math.sin(a) * this.speed * 0.3;
      this.ang = a;
    }
  }

  /** Damage taken; returns true if it died. */
  hurt(dmg, fromX, fromY) {
    if (this.leviathan) return false;
    this.hp -= dmg;
    this.flash = 0.18;
    if (this.hp <= 0) return true;
    // knockback away from the attacker
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.vx += Math.cos(a) * this.speed * 0.5;
    this.vy += Math.sin(a) * this.speed * 0.5;
    this.fleeT = Math.max(this.fleeT, 1.6);
    this.target = null; this.ai = 'flee';
    return false;
  }

  update(dt, world) {
    const p = world.player;
    this.phase += dt * (1.4 + Math.hypot(this.vx, this.vy) / Math.max(6, this.r) * 0.9);
    if (this.flash > 0) this.flash -= dt;
    if (this.biteCd > 0) this.biteCd -= dt;

    /* ---- LEVIATHAN: mindless lane patrol, damages anything it touches ---- */
    if (this.beh === 'cruise') {
      this.y = this.laneY + Math.sin(this.phase * 0.18) * this.r * 1.4;
      this.integrate(dt, this.vx, 0, 0.4, 1);
      this.ang = this.vx > 0 ? 0 : Math.PI;
      return;
    }

    /* ---- sense the neighbourhood (3×3 chunk cells) ---------------------- */
    let threat = null, threatD = Infinity, meal = null, mealD = Infinity;
    const cells = world.nearChunks(this.x, this.y);
    for (let ci = 0; ci < cells.length; ci++) {
      const ents = cells[ci].ents;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        if (e === this || e.dead) continue;
        const d = dist2(this.x, this.y, e.x, e.y);
        if (d > this.sense * this.sense) continue;
        if (e === p) {
          // Anything much smaller than the player, or anything that has just
          // been hurt by the player, treats the player as a threat.
          const fearsPlayer = this.r * 1.5 < p.r || this.fleeT > 0 || this.hp < this.maxHp;
          if (fearsPlayer || p.r * CFG.PREY_FLEE_RATIO < this.r) { if (d < threatD) { threatD = d; threat = e; } }
          else if (this.r * CFG.EAT_RATIO > p.r && this.beh === 'predator') { if (d < mealD) { mealD = d; meal = e; } }
          continue;
        }
        if (e.leviathan) { if (d < threatD) { threatD = d; threat = e; } continue; }
        if (e.r > this.r * CFG.PREY_FLEE_RATIO) { if (d < threatD) { threatD = d; threat = e; } }
        else if (this.r * CFG.EAT_RATIO > e.r && e.kind !== 'food') { if (d < mealD) { mealD = d; meal = e; } }
      }
    }

    /* ---- decide ---------------------------------------------------------- */
    if (this.fleeT > 0) this.fleeT -= dt;
    if (threat && (this.beh === 'prey' || this.fleeT > 0 || this.hp < this.maxHp * 0.4)) {
      this.ai = 'flee'; this.target = threat;
    } else if (this.beh === 'predator' && meal) {
      if (this.giveUpT <= 0) {
        this.ai = 'hunt'; this.target = meal;
        this.huntT += dt;
        // hunt budget: give up and mill about for a while
        if (this.huntT > 3 + (100 - this.aggr) * 0.09) { this.giveUpT = rnd(1.4, 4); this.huntT = 0; this.ai = 'idle'; this.target = null; }
      } else { this.giveUpT -= dt; this.ai = 'idle'; this.target = null; }
    } else {
      this.ai = 'idle'; this.target = null; this.huntT = 0;
    }

    /* ---- steer ----------------------------------------------------------- */
    let wx = 0, wy = 0, mul = 1;
    if (this.ai === 'flee' && this.target) {
      const a = Math.atan2(this.y - this.target.y, this.x - this.target.x);
      wx = Math.cos(a); wy = Math.sin(a); mul = 1.35;
      // bias away from the surface/floor so prey does not corner itself
      if (this.y < CFG.MIN_Y + 220) wy += 0.7;
      if (this.y > CFG.MAX_DEPTH - 220) wy -= 0.7;
    } else if (this.ai === 'hunt' && this.target) {
      const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
      // lead the target slightly
      wx = Math.cos(a); wy = Math.sin(a);
      mul = 1.15 + this.aggr / 240;
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = rnd(1.0, 3.4);
        this.wanderAng += rnd(-1.1, 1.1);
        // stay in a comfortable depth band
        const z = zoneAt(this.y);
        if (this.y < z.y0 + 160) this.wanderAng = Math.abs(this.wanderAng) * 0.5 + 0.4;
        if (this.y > z.y1 - 160) this.wanderAng = -Math.abs(this.wanderAng) * 0.5 - 0.4;
      }
      wx = Math.cos(this.wanderAng) * 0.55; wy = Math.sin(this.wanderAng) * 0.34;
      mul = 0.5;
    }
    const sp = this.speed * mul;
    this.integrate(dt, wx * sp, wy * sp, this.accel, this.drag);
    const v = Math.hypot(this.vx, this.vy);
    if (v > 1) this.ang = angLerp(this.ang, Math.atan2(this.vy, this.vx), clamp(dt * 7, 0, 1));
  }

  /** Contact resolution against the player. Returns an event object or null. */
  touchPlayer(p, dt) {
    const rr = this.r + p.r;
    if (dist2(this.x, this.y, p.x, p.y) > rr * rr) return null;
    const canEatMe = this.r <= p.r * CFG.EAT_RATIO && !this.leviathan;
    const canEatPlayer = p.r <= this.r * CFG.EAT_RATIO;
    if (this.leviathan) {
      return { type:'ram', dmg: this.r * 0.62, from: this };
    }
    if (canEatMe) {
      // the player's jaws do work on contact
      // 16/s: at this rate the player kills a same-scale predator in roughly
      // half the time it takes that predator to kill the player, so fighting is
      // the right call and fleeing is the safe one — at 6 units and at 200.
      const dmg = p.melee * dt * 16;
      if (this.hurt(dmg, p.x, p.y)) return { type:'kill', from: this };
      return { type:'chomp', from: this };
    }
    if (canEatPlayer && this.beh === 'predator' && this.biteCd <= 0) {
      this.biteCd = 0.85;
      return { type:'bite', dmg: Math.max(1.2, this.melee * 0.62), from: this };
    }
    return { type:'bump', from: this };
  }
}
