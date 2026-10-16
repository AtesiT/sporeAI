
/* ============================================================================
   7b. THE PLAYER — an entity that carries an evolving genome
   ----------------------------------------------------------------------------
   The player's form is `stage.vis` merged with every visual patch granted by
   the choices taken so far, so the body visibly accumulates 20 decisions.
   ========================================================================== */
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 6);
    this.kind = 'player';
    this.stageId = CFG.START_STAGE;
    this.stage = STAGES[this.stageId];
    this.dna = 0;
    this.hp = 10; this.maxHp = 10;
    this.stam = 100; this.maxStam = 100;
    this.traits = new Set();
    this.visPatches = [];
    this.vis = null;
    this.nodeIndex = 0;
    this.evolutions = 0;
    this.iframe = 0;
    this.grace = 0;
    this.bursting = false;
    this.burstCd = 0;
    this.sonarT = 0;
    this.sonarRing = null;
    this.tailPhase = 0;
    this.lastKiller = null;
    this.lineage = [];
    this.filterT = 0;
    this.recompute();
    this.hp = this.maxHp;
  }

  /** Rebuild derived stats + visual spec from stage base, deltas and traits. */
  recompute(deltas) {
    const s = this.stage;
    const d = deltas || this.statDeltas || {};
    this.statDeltas = d;
    const b = s.st;
    let r = b.r + (d.r || 0), hp = b.hp + (d.hp || 0), speed = b.speed + (d.speed || 0);
    let sense = b.sense + (d.sense || 0), melee = b.melee + (d.melee || 0);
    let armor = b.armor + (d.armor || 0), regen = b.regen + (d.regen || 0);
    let stam = b.stam + (d.stam || 0), dnaRate = b.dnaRate + (d.dnaRate || 0);
    let burst = 1 + (d.burst || 0);
    let intake = 1, dnaMul = 1;

    for (const t of this.traits) {
      switch (t) {
        case 'photo':     dnaRate += 0.75; break;
        case 'chemo':     dnaRate += 0.55; break;
        case 'symbio':    dnaRate += 0.6; break;
        case 'mito':      stam *= 1.3; break;
        case 'phago':     intake *= 1.22; break;
        case 'armor':     armor += 2.5; hp *= 1.08; break;
        case 'swift':     speed *= 1.08; break;
        case 'thorns':    break;                       // handled on bite
        case 'venom':     melee *= 1.12; break;
        case 'colonial':  dnaMul *= 1.08; break;
        case 'dnamul':    dnaMul *= 1.25; break;
        case 'filter':    dnaRate += 0.9; intake *= 1.1; break;
        case 'buoy':      stam *= 1.15; break;
        case 'crawl':     speed *= 1.03; regen += 0.3; break;
        case 'tissue':    hp *= 1.1; break;
        case 'brain':     sense *= 1.18; break;
        case 'seg':       hp *= 1.12; break;
        case 'noto':      speed *= 1.06; break;
        case 'latline':   sense *= 1.3; break;
        case 'jaw':       melee *= 1.25; break;
        case 'drain':     break;                       // handled on damage
        case 'agile':     speed *= 1.05; this.turn = 1.35; break;
        case 'electro':   sense *= 1.45; break;
        case 'endotherm': speed *= 1.1; regen += 0.6; break;
        case 'lung':      stam *= 1.6; break;
        case 'burst':     burst += 0.25; break;
        case 'jet':       burst += 0.55; stam *= 0.8; break;
        case 'giant':     r *= 1.08; hp *= 1.15; speed *= 0.95; break;
        case 'deep':      sense *= 1.1; break;
        case 'glow':      break;                       // render only
        case 'echo':      sense *= 1.8; break;
        case 'baleen':    intake *= 1.6; dnaRate += 1.2; break;
        case 'blubber':   regen += 1.6; armor += 3; break;
        case 'school':    sense *= 1.2; break;
        case 'ambush':    burst += 0.3; break;
        case 'regen':     regen += 1.4; break;
        case 'osmo':      regen += 0.8; break;
      }
    }
    this.r = r;
    this.maxHp = Math.max(4, Math.round(hp));
    // The player is the apex animal of its own size class: 1.4x the stat so a
    // healthy lead over fleeing prey is always possible (prey are damped below).
    this.speed = Math.max(24, speed * 1.4);
    this.sense = sense;
    this.melee = melee;
    this.armor = armor;
    this.regen = regen;
    this.maxStam = Math.max(40, stam);
    this.dnaRate = dnaRate;
    this.burstMul = CFG.BURST_MUL * burst;
    this.intake = intake;
    this.dnaMul = dnaMul;
    this.drag = 0.965 + clamp(r / 4000, 0, 0.012);
    // Acceleration is a per-second blend rate toward the wanted velocity, and
    // drag removes ~21%/s, so a small accel silently caps you at ~78% of your
    // own speed stat. These values reach ~97% within a second at every size:
    // a bacterium snaps to direction, a whale takes a moment to turn.
    this.accel = clamp(900 / Math.max(8, r), 4.5, 26);
    this.turn = this.turn || 1;

    // ---- build the visual spec: stage base + every patch earned ----------
    const v = Object.assign({}, s.vis);
    for (const p of this.visPatches) {
      for (const k in p) {
        if (k === 'organelles') continue;
        v[k] = p[k];
      }
    }
    let org = (s.vis.organelles || []).slice();
    for (const p of this.visPatches) if (p.organelles) org = org.concat(p.organelles);
    // traits add their own visible organelles / features
    for (const t of this.traits) {
      const info = TRAIT_INFO[t];
      if (!info || !info.render) continue;
      const rk = info.render;
      if (['chloroplast','granule','mito','vacuole','macronuc','brain'].indexOf(rk) >= 0) {
        if (org.indexOf(rk) < 0) org.push(rk);
      } else if (rk === 'cilia') v.cilia = Math.max(v.cilia || 0, 1);
      else if (rk === 'plates') v.plates = Math.max(v.plates || 0, 1);
      else if (rk === 'spikes') v.spikes = Math.max(v.spikes || 0, 1);
      else if (rk === 'cells') v.cells = Math.max(v.cells || 0, 6);
      else if (rk === 'teeth') v.teeth = Math.max(v.teeth || 0, 1), v.mouth = v.mouth || 'jawed';
      else if (rk === 'rakers') v.rakers = 1, v.mouth = v.mouth || 'wide';
      else if (rk === 'glow') v.glow = 1;
      else if (rk === 'girth') v.girth = Math.max(v.girth || 0, 1);
      else if (rk === 'grooves') v.grooves = Math.max(v.grooves || 0, 1);
      else if (rk === 'segs') v.segs = Math.max(v.segs || 0, 8);
      else if (rk === 'notochord') v.notochord = 1;
      else if (rk === 'stripes') v.stripes = Math.max(v.stripes || 0, 1);
      else if (rk === 'ampullae') v.ampullae = 1;
      else if (rk === 'melon') v.melon = 1;
      else if (rk === 'baleen') v.mouth = 'baleen', v.grooves = Math.max(v.grooves || 0, 1);
      else if (rk === 'jet') v.jet = 1;
      else if (rk === 'armor') v.armor = Math.max(v.armor || 0, 1);
      else if (rk === 'rete' || rk === 'lung' || rk === 'lobe' || rk === 'latline' || rk === 'fins') { /* subtle */ }
    }
    if (org.length > 7) org = org.slice(-7);
    v.organelles = org;
    v.eyes = v.eyes || (this.nodeIndex >= 8 ? 2 : 0);
    this.vis = v;
  }

  /** Install a stage (used on new game, evolving, and respawning). */
  setStage(id, opts) {
    this.stageId = id;
    this.stage = STAGES[id];
    this.nodeIndex = STAGE_DEPTH[id] || 0;
    this.recompute(opts && opts.deltas ? opts.deltas : {});
    if (!opts || opts.heal !== false) { this.hp = this.maxHp; this.stam = this.maxStam; }
  }

  /** Apply an evolution choice. */
  evolve(choice) {
    const d = Object.assign({}, this.statDeltas);
    if (choice.st) for (const k in choice.st) d[k] = (d[k] || 0) + choice.st[k];
    this.statDeltas = d;
    if (choice.tr) choice.tr.forEach(t => this.traits.add(t));
    if (choice.vis) this.visPatches.push(choice.vis);
    this.evolutions++;
    this.lineage.push({ from: this.stageId, key: choice.k, to: choice.to });
    this.setStage(choice.to, { deltas: d });
    return this.stage;
  }

  nextCost() {
    if (this.stage.final) return Infinity;
    return Math.min(...this.stage.ch.map(c => c.cost));
  }
  canEvolve() { return !this.stage.final && this.dna >= this.nextCost(); }

  /** Mean spec.dna of the prey that actually spawn at this gape: the
      richness scale that `dnaFor` normalises against. Cached per stage. */
  localMeanDna() {
    if (this._lmd !== undefined && this._lmdKey === this.stageId) return this._lmd;
    const lo = this.r * CFG.EAT_RATIO * 0.34, hi = this.r * CFG.EAT_RATIO * 0.95;
    let tot = 0, w = 0;
    for (const z of ZONES) {
      const rw = World.tableFor(z.tables.prey, lo, hi);
      for (const [id, ww] of rw) { tot += EDIBLES[id].dna * ww; w += ww; }
    }
    this._lmdKey = this.stageId;
    return this._lmd = w > 0 ? tot / w : 1;
  }

  /**
   * DNA awarded for a meal, in units of "one typical meal at this stage".
   *
   *   yield = typicalDna(stage, depth)          <- stageCost / 33, depth-tuned
   *           * (spec.dna / localMeanDna)^0.55  <- relative richness, so a
   *                                                squid beats a copepod but
   *                                                neither breaks the curve
   *           * bodyFactor                      <- shared with the spawner
   *           * DNA_FOOD_MUL if it is a particle
   *           / (intake * dnaMul)                 <- build-independent
   */
  dnaFor(target) {
    const unit = World.typicalDna(this.stageId, this.nodeIndex, this.y);
    const body = World.bodyFactor(target.spec || target, this.r, target.r);
    const rel = Math.max(0.02, target.dna) / this.localMeanDna();
    // A floor on relative richness: a bacterium's diet really is uniformly
    // sparse, and punishing it for that made the opening stages take three
    // times as long as every later one.
    const rich = Math.pow(Math.max(0.55, rel), CFG.DNA_BIG_MEAL_POW);
    // Drifting particles are the entire diet of a bacterium and irrelevant to
    // anything with jaws: their value falls off as the body outgrows them, so
    // a whale cannot vacuum the ocean into an evolution.
    const mul = target.beh === 'drift'
      ? CFG.DNA_FOOD_MUL * clamp(24 / Math.max(6, this.r), 0.03, 1)
      : 1;
    // Hunting yield is normalised against our own intake/dnaMul so that one
    // average mouthful is always worth one unit of the current stage, whatever
    // build we have taken. Those traits still pay, but through the channels
    // that suit them: filter feeding and photosynthesis harvest DNA passively
    // (dnaRate), and phagocytosis makes short work of anything we bite.
    const build = Math.max(0.05, this.intake * this.dnaMul);
    return Math.max(0.02, unit * rich * body * mul / build);
  }

  update(dt, input, game) {
    // --- timers ---
    if (this.iframe > 0) this.iframe -= dt;
    if (this.grace > 0) this.grace -= dt;
    if (this.burstCd > 0) this.burstCd -= dt;

    // --- passive DNA (photosynthesis / chemosynthesis / filter feeding) ---
    if (this.dnaRate > 0) {
      let mul = 1;
      if (this.traits.has('photo') && !this.traits.has('chemo')) {
        const z = zoneAt(this.y);
        mul = clamp(z.light * 1.4, 0.08, 1);        // photosynthesis needs light
      }
      const gain = this.dnaRate * mul * dt *
                   World.typicalDna(this.stageId, this.nodeIndex, this.y) * CFG.DNA_PASSIVE_MUL;
      this.dna += gain; game.stats.dnaEarned += gain; game.stats.passiveDna += gain;
    }

    // --- desired velocity: swim toward the cursor ---
    const dx = input.wx - this.x, dy = input.wy - this.y;
    const d = Math.hypot(dx, dy);
    let sp = this.speed;
    // burst
    const wantBurst = input.burst && this.stam > 1 && this.burstCd <= 0;
    this.bursting = wantBurst && d > Math.max(CFG.DEADZONE, this.r * 0.45);
    if (wantBurst) {
      sp *= this.burstMul;
      this.stam = Math.max(0, this.stam - CFG.STAM_DRAIN * dt);
      if (this.stam <= 0) this.burstCd = 0.9;
      if (Math.random() < dt * 26) game.spawnParticle(this.x - Math.cos(this.ang) * this.r,
        this.y - Math.sin(this.ang) * this.r, rnd(-24, 24), rnd(-24, 24), rnd(0.25, 0.6),
        rnd(0.6, 1.6) * this.r * 0.06, [190, 70, 84], 0.5);
    } else {
      this.stam = Math.min(this.maxStam, this.stam + CFG.STAM_REGEN * dt);
    }
    // Dead zone: how close to the cursor we stop pushing. It MUST stay below
    // feeding contact distance, or a cursor parked on a snack can never close
    // the last few units and the animal starves with food in front of it.
    // Contact happens at r + e.r + reach, i.e. 1.06r for a particle and up to
    // 1.88r for the biggest bite the gape allows — so a dead zone of ~0.45r
    // keeps every meal reachable at bacterium scale and at whale scale alike.
    const dz = Math.max(3, this.r * 0.45);
    let wx = 0, wy = 0;
    if (d > dz) { wx = dx / d * sp; wy = dy / d * sp; }
    this.integrate(dt, wx, wy, this.accel * (this.traits.has('agile') ? 1.3 : 1), this.drag);

    // facing + body wave
    const v = Math.hypot(this.vx, this.vy);
    if (v > 2) this.ang = angLerp(this.ang, Math.atan2(this.vy, this.vx), clamp(dt * 6 * this.turn, 0, 1));
    const beat = this.vis && (this.vis.arch === 'fish' || this.vis.arch === 'giant' || this.vis.arch === 'worm') ? 5.5 : 2.6;
    this.tailPhase += dt * (beat + v / Math.max(8, this.r) * 1.5);

    // --- vitality regeneration ---
    if (this.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt * (this.maxHp / 120 + 0.4));
    }

    // --- echolocation ping ---
    if (this.traits.has('echo') || this.traits.has('electro')) {
      this.sonarT -= dt;
      if (this.sonarT <= 0) {
        this.sonarT = this.traits.has('echo') ? 2.6 : 4.5;
        this.sonarRing = { r: this.r, max: this.sense, t: 0 };
        Sound.sonar();
      }
    }
    if (this.sonarRing) {
      this.sonarRing.t += dt;
      this.sonarRing.r += dt * this.sense * 1.5;
      if (this.sonarRing.r > this.sonarRing.max) this.sonarRing = null;
    }
  }

  /** Take a bite. Returns the damage actually applied. */
  damage(amount, from, game) {
    if (this.iframe > 0 || this.grace > 0) return 0;
    const applied = Math.max(1, amount - this.armor * 0.9);
    this.hp -= applied;
    this.iframe = CFG.IFRAMES;
    this.lastKiller = from ? from.name || from.specId : 'the ocean';
    // thorns / cnidocytes hurt the attacker back
    if (this.traits.has('thorns') && from && from.hurt) {
      from.hurt(applied * 0.55, this.x, this.y);
      game.spawnBurst(from.x, from.y, 6, [46, 70, 66]);
    }
    // knockback
    if (from) {
      const a = Math.atan2(this.y - from.y, this.x - from.x);
      this.vx += Math.cos(a) * this.speed * 0.85;
      this.vy += Math.sin(a) * this.speed * 0.85;
    }
    game.shake(clamp(applied / this.maxHp * 26, 3, 22));
    game.spawnBurst(this.x, this.y, 10, [354, 62, 66]);
    Sound.damage();
    return applied;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
}

/** Longest path length from the start node — the "N / 20" progress figure. */
const STAGE_DEPTH = (() => {
  const memo = {};
  const walk = (id, seen) => {
    if (memo[id] !== undefined) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const n = STAGES[id];
    let best = 0;
    if (n.ch) for (const c of n.ch) best = Math.max(best, 1 + walk(c.to, seen));
    seen.delete(id);
    return memo[id] = best;
  };
  // depth of a node = longest path from start to it
  const out = {};
  const assign = (id, d, seen) => {
    if (seen.has(id)) return;
    seen.add(id);
    out[id] = Math.max(out[id] || 0, d);
    const n = STAGES[id];
    if (n.ch) for (const c of n.ch) assign(c.to, d + 1, seen);
    seen.delete(id);
  };
  assign(CFG.START_STAGE, 0, new Set());
  walk(CFG.START_STAGE, new Set());
  out.SPINE = memo[CFG.START_STAGE];
  return out;
})();

/* ============================================================================
   7c. PARTICLES + FLOATERS (pooled)
   ========================================================================== */
const FX = {
  parts: [],
  floats: [],
  rings: [],
  maxParts: 420,

  spawn(x, y, vx, vy, life, size, col, alpha = 1, glow = false) {
    if (this.parts.length >= this.maxParts) this.parts.shift();
    this.parts.push({ x, y, vx, vy, life, maxLife: life, size, col, alpha, glow });
  },
  burst(x, y, n, col, spd = 90, size = 2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = rnd(spd * 0.3, spd);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, rnd(0.3, 0.85), rnd(size * 0.5, size * 1.5),
                 col, 0.9);
    }
  },
  float(x, y, text, col = '#8ef2c0', size = 13) {
    if (this.floats.length > 40) this.floats.shift();
    this.floats.push({ x, y, text, col, size, t: 0, life: 1.25, vy: -34 });
  },
  ring(x, y, r0, r1, life, col, w = 2) {
    this.rings.push({ x, y, r: r0, r1, t: 0, life, col, w });
  },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.94, dt * 60); p.vy *= Math.pow(0.94, dt * 60);
      p.vy += 4 * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.life) { this.floats.splice(i, 1); continue; }
      f.y += f.vy * dt; f.vy *= Math.pow(0.94, dt * 60);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.life) { this.rings.splice(i, 1); continue; }
      r.r = lerp(r.r, r.r1, dt * 4);
    }
  },
};

/* ============================================================================
   8a. CAMERA
   ========================================================================== */
const Camera = {
  x: 0, y: 0, zoom: 0.6, shakeAmt: 0, shakeT: 0, tx: 0, ty: 0, tzoom: 0.6,
  reset(x, y, r) {
    this.x = x; this.y = y;
    this.tzoom = this.zoom = clamp(CFG.CAM_K / r, CFG.CAM_MIN, CFG.CAM_MAX);
    this.shakeAmt = 0;
  },
  follow(p, mx, my, dt) {
    this.tzoom = clamp(CFG.CAM_K / p.r, CFG.CAM_MIN, CFG.CAM_MAX);
    this.zoom = lerp(this.zoom, this.tzoom, clamp(dt * 1.6, 0, 1));
    // look slightly toward the cursor so you can see what you are swimming at
    const look = 1 / this.zoom * CFG.CAM_LOOKAHEAD;
    this.tx = p.x + clamp(mx - p.x, -look, look);
    this.ty = p.y + clamp(my - p.y, -look, look);
    const k = clamp(dt * CFG.CAM_LERP, 0, 1);
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty, k);
    if (this.shakeAmt > 0) {
      this.shakeT += dt * 42;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 34);
    }
  },
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); },
  get ox() { return this.shakeAmt > 0 ? Math.sin(this.shakeT * 1.7) * this.shakeAmt / this.zoom : 0; },
  get oy() { return this.shakeAmt > 0 ? Math.cos(this.shakeT * 2.3) * this.shakeAmt / this.zoom : 0; },
};
