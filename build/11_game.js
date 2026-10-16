
/* ============================================================================
   10. INPUT
   ========================================================================== */
const Input = {
  sx: 0, sy: 0,          // cursor in CSS pixels
  wx: 0, wy: 0,          // cursor in world units
  burst: false,
  has: false,

  init() {
    const move = (cx, cy) => {
      this.sx = cx; this.sy = cy; this.has = true;
      const k = R.worldScale();
      this.wx = (cx * R.S - R.BW * 0.5) / k + Camera.x - Camera.ox;
      this.wy = (cy * R.S - R.BH * 0.5) / k + Camera.y - Camera.oy;
    };
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY), { passive: true });
    window.addEventListener('mousedown', e => {
      move(e.clientX, e.clientY);
      if (e.button === 2) this.burst = true;
      if (e.button === 0) Game.onClick(e);
    });
    window.addEventListener('mouseup', e => { if (e.button === 2) this.burst = false; });
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('touchstart', e => {
      const t = e.touches[0]; move(t.clientX, t.clientY); this.burst = true;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      const t = e.touches[0]; move(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchend', () => { this.burst = false; }, { passive: true });

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === ' ' || e.code === 'Space') { this.burst = true; e.preventDefault(); }
      else if (k === 'e') Game.onEvolveKey();
      else if (k === 'escape' || k === 'p') Game.onPauseKey();
      else if (k === 'm') { Sound.init(); const m = Sound.toggleMute(); UI.setMuteLabel(m);
                            UI.toast(m ? 'Sound off' : 'Sound on', 1100); }
      else if (k === '1' || k === '2' || k === '3') Game.onNumberKey(+k - 1);
      else if (k === 'r' && Game.state === 'DEAD') Game.respawn();
    });
    window.addEventListener('keyup', e => {
      if (e.key === ' ' || e.code === 'Space') this.burst = false;
    });
    window.addEventListener('resize', () => R.resize());
    window.addEventListener('blur', () => { if (Game.state === 'PLAYING') Game.setState('PAUSED'); });
  },
};

/* ============================================================================
   11. GAME — state machine, simulation step, collisions, progression
   ========================================================================== */
const Game = {
  state: 'TITLE',          // TITLE | PLAYING | EVOLVING | PAUSED | DEAD | VICTORY
  player: null,
  time: 0,
  flash: 0,
  fps: 60,
  fpsAvg: 60,
  lowStreak: 0, highStreak: 0,
  pressureToastT: 0,
  raf: 0,
  stats: null,

  /* ---------------------------------------------------------------- boot */
  init() {
    R.init();
    UI.init(this);
    Input.init();
    this.stats = this.blankStats();
    // A demo world drifts behind the title screen.
    World.reset();
    this.player = new Player(0, 900);
    World.player = this.player;
    this.player.setStage(CFG.START_STAGE, {});
    this.checkpoint = this.makeCheckpoint();
    Camera.reset(this.player.x, this.player.y, 46);
    Input.wx = this.player.x; Input.wy = this.player.y;
    this.setState('TITLE');
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  },

  blankStats() {
    return { time:0, eaten:0, dnaEarned:0, kills:0, evolutions:0, deaths:0,
             deepest:0, passiveDna:0, mealsByStage:{} };
  },

  /* ------------------------------------------------------- state machine */
  setState(s) {
    const prev = this.state;
    this.state = s;
    switch (s) {
      case 'TITLE':
        UI.show('title'); UI.el.hud.classList.remove('on');
        Sound.suspend();
        break;
      case 'PLAYING':
        UI.hideAll(); UI.el.hud.classList.add('on');
        Sound.init(); Sound.resume(); Sound.startAmbient();
        break;
      case 'EVOLVING':
        UI.buildEvolution(this);
        Sound.ui(true);
        break;
      case 'PAUSED':
        UI.show('pause'); Sound.suspend();
        break;
      case 'DEAD':
        UI.showDeath(this); Sound.suspend();
        break;
      case 'VICTORY':
        UI.showVictory(this); Sound.victory();
        break;
    }
    if (prev === 'EVOLVING' && s === 'PLAYING') UI.previews.length = 0;
  },

  /* ---------------------------------------------------------- new game */
  newGame() {
    World.reset();
    Sprites.cache.clear();
    FX.parts.length = 0; FX.floats.length = 0; FX.rings.length = 0;
    this.stats = this.blankStats();
    this.time = 0; this.flash = 0;
    this.player = new Player(rnd(-400, 400), 620);
    World.player = this.player;
    this.player.setStage(CFG.START_STAGE, {});
    this.player.lineage = [];
    this.player.dna = 0;
    this.checkpoint = this.makeCheckpoint();
    Camera.reset(this.player.x, this.player.y, this.player.r);
    Input.wx = this.player.x; Input.wy = this.player.y - 40;
    this.setState('PLAYING');
    UI.toast('You are LUCA — the last universal common ancestor. Eat. Grow. Decide.', 4200);
    Sound.setDepth(0);
  },

  makeCheckpoint() {
    const p = this.player;
    return {
      stageId: p.stageId,
      deltas: Object.assign({}, p.statDeltas),
      patches: p.visPatches.slice(),
      traits: new Set(p.traits),
      nodeIndex: p.nodeIndex,
      lineage: p.lineage.slice(),
      evolutions: p.evolutions,
    };
  },

  respawn() {
    const cp = this.checkpoint, p = this.player;
    // clear threats around the respawn point so you do not die instantly
    const nx = rnd(-300, 300), ny = clamp(500 + rnd(0, 400), CFG.MIN_Y + 200, this.depthLimitFor(cp) - 300);
    for (let i = World.entities.length - 1; i >= 0; i--) {
      const e = World.entities[i];
      if (e === p) continue;
      if (e.beh === 'predator' || e.leviathan) World.remove(e);
    }
    p.traits = new Set(cp.traits);
    p.visPatches = cp.patches.slice();
    p.evolutions = cp.evolutions;
    p.lineage = cp.lineage.slice();
    p.statDeltas = cp.deltas;
    p.setStage(cp.stageId, { deltas: cp.deltas });
    p.hp = p.maxHp; p.stam = p.maxStam;
    p.dna = p.dna * CFG.RESPAWN_DNA_KEEP;
    p.x = nx; p.y = ny; p.vx = 0; p.vy = 0;
    p.iframe = 2.2; p.grace = CFG.POST_EVO_GRACE + 1.5;
    p.lastKiller = null;
    World.reset();
    Sprites.cache.clear();
    p.x = nx; p.y = ny;
    World.add(p, World.getChunk(World.cx(nx), World.cy(ny), true));
    Camera.reset(nx, ny, p.r);
    this.stats.deaths++;
    this.setState('PLAYING');
    UI.toast('Checkpoint — ' + p.stage.name, 2600);
    FX.ring(nx, ny, p.r, p.r * 9, 1.1, 'hsla(150 90% 74% / ALPHA)', 2);
  },

  /* -------------------------------------------------------------- depth */
  depthLimit() { return clamp(this.player.r * 108, 2400, CFG.MAX_DEPTH - 40); },
  depthLimitFor(cp) { return clamp(STAGES[cp.stageId].st.r * 108, 2400, CFG.MAX_DEPTH - 40); },
  depthT() { return clamp(this.player.y / CFG.MAX_DEPTH, 0, 1); },

  /* ------------------------------------------------------------- evolve */
  onEvolveKey() {
    if (this.state === 'PLAYING') this.openEvolution();
    else if (this.state === 'EVOLVING') this.setState('PLAYING');
  },
  onPauseKey() {
    if (this.state === 'PLAYING') this.setState('PAUSED');
    else if (this.state === 'PAUSED') this.setState('PLAYING');
    else if (this.state === 'EVOLVING') this.setState('PLAYING');
  },
  onNumberKey(i) {
    if (this.state !== 'EVOLVING') return;
    const c = this.player.stage.ch[i];
    if (c) this.chooseEvolution(c);
  },
  onClick() { /* reserved for future in-world interactions */ },
  openEvolution() {
    if (this.state !== 'PLAYING' && this.state !== 'PAUSED') return;
    if (this.player.stage.final) { UI.toast('You are already the apex. Keep swimming.', 2000); return; }
    if (!this.player.canEvolve()) {
      Sound.hurtSmall();
      const need = Math.ceil(this.player.nextCost() - this.player.dna);
      UI.toast('Not enough DNA — ' + need.toLocaleString('en-US') + ' more required', 1600);
      return;
    }
    this.setState('EVOLVING');
  },

  chooseEvolution(choice) {
    const p = this.player;
    if (this.state !== 'EVOLVING') return;
    if (p.dna < choice.cost) { Sound.hurtSmall(); UI.toast('Not enough DNA', 1400); return; }
    p.dna -= choice.cost;
    const before = p.r;
    const stage = p.evolve(choice);
    this.stats.evolutions = p.evolutions;
    this.checkpoint = this.makeCheckpoint();
    // feedback
    Sound.evolve();
    this.flash = 1;
    Camera.shake(6 + (p.r - before) * 0.05);
    FX.ring(p.x, p.y, p.r * 0.7, p.r * 12, 1.3, 'hsla(152 96% 74% / ALPHA)', 3);
    FX.ring(p.x, p.y, p.r * 0.4, p.r * 7.5, 0.9, 'hsla(186 100% 82% / ALPHA)', 2);
    FX.burst(p.x, p.y, 34, [150, 80, 70], 200, p.r * 0.1);
    for (let i = 0; i < 14; i++) FX.float(p.x + rnd(-p.r, p.r), p.y + rnd(-p.r, p.r), '✦', '#8ef2c0', 15);
    // the shockwave scatters everything that was hunting you
    for (const e of World.entities) {
      if (e === p || e.leviathan || e.beh !== 'predator') continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < p.sense * 1.7) {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.vx += Math.cos(a) * e.speed * 2.2; e.vy += Math.sin(a) * e.speed * 2.2;
        e.fleeT = 4.5; e.ai = 'flee'; e.target = p; e.giveUpT = 4;
      }
    }
    Camera.tzoom = clamp(CFG.CAM_K / p.r, CFG.CAM_MIN, CFG.CAM_MAX);
    p.grace = CFG.POST_EVO_GRACE;
    p.iframe = Math.max(p.iframe, 1.1);

    // The world is seeded relative to your size, so a body that has just
    // changed scale needs a fresh ocean. The evolution flash covers the cut,
    // and it reads correctly: you are now a different animal in a different
    // size class of sea.
    World.reset();
    Sprites.cache.clear();
    World.add(p, World.getChunk(World.cx(p.x), World.cy(p.y), true));

    if (stage.final) {
      this.setState('VICTORY');
    } else {
      this.setState('PLAYING');
      UI.toast(stage.name + ' — ' + stage.latin, 3600);
    }
  },

  continueAfterWin() {
    this.setState('PLAYING');
    UI.toast('Free swim — the ocean is yours.', 3000);
  },

  /* ---------------------------------------------------------- utilities */
  shake(a) { Camera.shake(a); },
  spawnParticle(x, y, vx, vy, life, size, col, a) { FX.spawn(x, y, vx, vy, life, size, col, a); },
  spawnBurst(x, y, n, col) { FX.burst(x, y, n, col); },

  awardDNA(amount, x, y, label) {
    const p = this.player;
    p.dna += amount;
    this.stats.dnaEarned += amount;
    if (amount >= 0.9) {
      FX.float(x, y, '+' + (amount >= 100 ? Math.round(amount) : amount.toFixed(1)),
               '#8ef2c0', clamp(11 + amount * 0.14, 11, 21));
    }
    void label;
  },

  /* ============================================================== FRAME */
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    dt = Math.min(dt, 0.05);              // clamp after a tab-switch stall
    this.time += dt;

    // rolling fps + adaptive quality governor
    const inst = 1 / Math.max(dt, 1e-4);
    this.fpsAvg = this.fpsAvg * 0.92 + inst * 0.08;
    this.fps = this.fpsAvg;
    if (this.state === 'PLAYING') {
      if (this.fpsAvg < CFG.FPS_LOW) { this.lowStreak += dt; this.highStreak = 0; }
      else if (this.fpsAvg > CFG.FPS_HIGH) { this.highStreak += dt; this.lowStreak = 0; }
      else { this.lowStreak = 0; this.highStreak = 0; }
      if (this.lowStreak > 1.4 && World.quality > 0.45) {
        World.quality = Math.max(0.45, World.quality - 0.15);
        R.quality = World.quality; this.lowStreak = 0;
      } else if (this.highStreak > 5 && World.quality < 1) {
        World.quality = Math.min(1, World.quality + 0.1);
        R.quality = World.quality; this.highStreak = 0;
      }
    }

    switch (this.state) {
      case 'PLAYING':  this.step(dt); break;
      case 'TITLE':    this.stepTitle(dt); break;
      case 'EVOLVING': UI.renderPreviews(this.time); FX.update(dt * 0.2); break;
      case 'VICTORY':  UI.renderPortrait(this.time); FX.update(dt * 0.35); break;
      case 'DEAD':     FX.update(dt * 0.5); break;
      case 'PAUSED':   break;
    }

    R.render(this, dt);
    if (this.state === 'PLAYING' || this.state === 'EVOLVING') UI.updateHud(this, now);
  },

  /** Idle ocean behind the title screen. */
  stepTitle(dt) {
    const p = this.player;
    p.y = 900 + Math.sin(this.time * 0.35) * 180;
    p.x = Math.sin(this.time * 0.11) * 620;
    p.tailPhase += dt * 2.4;
    Camera.x = p.x; Camera.y = p.y;
    Camera.zoom = lerp(Camera.zoom, 0.11, dt * 0.8);
    World.update(p.x, p.y, R.viewW() * 0.5, R.viewH() * 0.5);
    this.stepEntities(dt, false);
    FX.update(dt);
  },

  /* ============================================================ SIM STEP */
  step(dt) {
    const p = this.player;
    this.stats.time += dt;
    this.stats.deepest = Math.max(this.stats.deepest, p.y);
    if (p.r > (this.stats.maxR || 0)) this.stats.maxR = p.r;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);

    p.update(dt, Input, this);
    Camera.follow(p, Input.wx, Input.wy, dt);
    World.update(Camera.x, Camera.y, R.viewW() * 0.5, R.viewH() * 0.5);
    this.stepEntities(dt, true);
    this.collide(dt);
    this.depthGate(dt);
    FX.update(dt);

    // audio follows the depth
    Sound.setDepth(this.depthT());
    Sound.ambientTick(dt, this.depthT());

    // a nudge the first time evolution becomes available at each stage
    if (p.canEvolve() && !this._evoHint) {
      this._evoHint = true;
      Sound.ready_();
      UI.toast('DNA threshold reached — press E to open the evolution panel', 3200);
    } else if (!p.canEvolve() && this._evoHint && p.dna < p.nextCost() * 0.5) {
      this._evoHint = false;
    }
  },

  stepEntities(dt, withPlayer) {
    const ents = World.entities;
    const w = World;
    w.predationBudget = Math.max(0, w.predationBudget - dt);
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      if (e === World.player) { w.rechunk(e); continue; }
      e.update(dt, w);
      w.rechunk(e);
      // NPC predation: keeps the ocean looking alive, rate-limited for perf
      if (withPlayer && e.beh === 'predator' && w.predationBudget <= 0 && e.ai === 'hunt' && e.target &&
          e.target !== World.player && !e.target.leviathan) {
        const rr = e.r * CFG.EAT_RATIO;
        if (e.target.r < rr && dist2(e.x, e.y, e.target.x, e.target.y) < (e.r + e.target.r) ** 2) {
          FX.burst(e.target.x, e.target.y, 5, [e.vis.col[0], 40, 60], 60, e.target.r * 0.12);
          w.remove(e.target);
          w.predationBudget = 0.18;
        }
      }
    }
  },

  /* ---------------------------------------------------------- collisions */
  collide(dt) {
    const p = this.player;
    const cells = World.nearChunks(p.x, p.y);
    // Feeding reach: jaws, cilia and filter fringes all work slightly outside
    // the body outline. This is the encounter radius for eating, so it matters
    // a great deal more than it looks — at 1.06r a bacterium sweeps only ~2400
    // square units per second and starves in a well-stocked ocean.
    const reach = p.r * 1.30;
    for (let ci = 0; ci < cells.length; ci++) {
      const ents = cells[ci].ents;
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i];
        if (e === p || e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + reach;
        if (dx * dx + dy * dy > rr * rr) continue;

        // Leviathans are scenery with teeth: never edible, never farmed.
        if (e.leviathan) {
          if (p.iframe <= 0 && dist2(p.x, p.y, e.x, e.y) < (e.r * 0.9 + p.r) ** 2) {
            const applied = p.damage(e.r * 0.62, e, this);
            if (applied > 0) {
              FX.float(p.x, p.y - p.r * 1.4, '−' + Math.round(applied), '#ff9d8f', 17);
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              p.vx += Math.cos(a) * p.speed * 2.6; p.vy += Math.sin(a) * p.speed * 2.6;
              if (p.hp <= 0) { this.die(e); return; }
            }
          }
          continue;
        }

        /* ---- FOOD ---- */
        if (e.kind === 'food') {
          if (e.r <= p.r * CFG.EAT_RATIO) {
            const gain = p.dnaFor(e);
            this.awardDNA(gain, e.x, e.y);
            this.stats.eaten++;
            FX.burst(e.x, e.y, e.r > p.r * 0.35 ? 7 : 3,
                     [e.vis.col[0], e.vis.col[1], Math.min(90, e.vis.col[2] + 12)],
                     40 + p.r, Math.max(0.8, e.r * 0.14));
            World.remove(e);
            if (Math.random() < (e.r > p.r * 0.4 ? 1 : 0.3)) Sound.eat(clamp(e.r / (p.r * 1.2), 0, 1));
          } else if (e.anchor) {
            // too big to swallow and rooted: bump off it
            const d = Math.max(0.001, Math.hypot(dx, dy));
            p.vx += dx / d * p.speed * 0.25; p.vy += dy / d * p.speed * 0.25;
          }
          continue;
        }

        /* ---- CREATURES ---- */
        const ev = e.touchPlayer(p, dt);
        if (!ev) continue;
        switch (ev.type) {
          case 'kill': {
            const gain = p.dnaFor(e);
            this.awardDNA(gain, e.x, e.y);
            this.stats.eaten++; this.stats.kills++;
            FX.burst(e.x, e.y, 18, [e.vis.col[0], e.vis.col[1], e.vis.col[2] + 12], 130, Math.max(1.2, e.r * 0.1));
            FX.ring(e.x, e.y, e.r * 0.4, e.r * 3.2, 0.5, 'hsla(96 80% 70% / ALPHA)', 2);
            World.remove(e);
            Sound.eat(clamp(e.r / (p.r * 1.4), 0.2, 1));
            if (e.r > p.r * 0.6) Sound.crunch();
            break;
          }
          case 'chomp': {
            if (p.traits.has('drain')) p.heal(p.melee * dt * 1.6);
            if (Math.random() < dt * 9) {
              FX.burst(e.x + (p.x - e.x) * 0.3, e.y + (p.y - e.y) * 0.3, 2,
                       [e.vis.col[0], 50, 60], 50, Math.max(0.7, e.r * 0.06));
            }
            if (Math.random() < dt * 3.5) Sound.eat(clamp(e.r / (p.r * 1.4), 0, 0.7));
            break;
          }
          case 'bite': {
            const applied = p.damage(ev.dmg, e, this);
            if (applied > 0) {
              FX.float(p.x, p.y - p.r * 1.4, '−' + Math.round(applied), '#ff9d8f', 14);
              if (p.hp <= 0) { this.die(e); return; }
            }
            break;
          }
          case 'ram': {
            if (p.iframe <= 0) {
              const applied = p.damage(ev.dmg, e, this);
              if (applied > 0) {
                FX.float(p.x, p.y - p.r * 1.4, '−' + Math.round(applied), '#ff9d8f', 16);
                if (p.hp <= 0) { this.die(e); return; }
              }
              // a leviathan swat sends you flying
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              p.vx += Math.cos(a) * p.speed * 2.4; p.vy += Math.sin(a) * p.speed * 2.4;
            }
            break;
          }
          case 'bump': {
            const d = Math.max(0.001, Math.hypot(dx, dy));
            const push = (rr - d) * 6;
            p.vx -= dx / d * push * dt * 6; p.vy -= dy / d * push * dt * 6;
            e.vx += dx / d * push * dt * 3; e.vy += dy / d * push * dt * 3;
            break;
          }
        }
      }
    }
  },

  /** Pressure barrier: you cannot dive deeper than your body allows. */
  depthGate(dt) {
    const p = this.player;
    const lim = this.depthLimit();
    if (p.y > lim) {
      const over = (p.y - lim) / 400;
      p.vy -= (60 + over * 320) * dt;
      p.y = Math.min(p.y, lim + 130);
      this.pressureToastT -= dt;
      if (this.pressureToastT <= 0) {
        this.pressureToastT = 5;
        Sound.pressure();
        UI.toast('Crushing pressure — your body plan cannot go deeper. Evolve first.', 2800);
      }
      if (Math.random() < dt * 20) {
        FX.spawn(p.x + rnd(-p.r, p.r), p.y + p.r * 0.6, rnd(-20, 20), rnd(10, 50), rnd(0.3, 0.7),
                 rnd(1, 2.4), [200, 60, 80], 0.5);
      }
    }
    if (p.y < CFG.MIN_Y + p.r * 0.8) { p.y = CFG.MIN_Y + p.r * 0.8; p.vy = Math.abs(p.vy) * 0.2; }
  },

  die(killer) {
    const p = this.player;
    p.hp = 0;
    Sound.death();
    Camera.shake(20);
    FX.burst(p.x, p.y, 46, [p.vis.col[0], p.vis.col[1], p.vis.col[2] + 10], 210, Math.max(1.2, p.r * 0.09));
    FX.ring(p.x, p.y, p.r * 0.3, p.r * 8, 1.2, 'hsla(4 90% 62% / ALPHA)', 3);
    p.lastKiller = killer ? (killer.name || (killer.spec && killer.spec.n) || 'the ocean') : 'the ocean';
    this.setState('DEAD');
  },
};

/* ============================================================================
   12. BOOT
   ========================================================================== */
window.addEventListener('error', (e) => {
  // Never fail silently: show the error on screen so it can be reported.
  try {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99;background:#300;color:#fbb;' +
                      'font:12px monospace;padding:8px 12px;border-radius:8px;max-width:80vw;white-space:pre-wrap';
    d.textContent = 'Error: ' + (e.message || e.error) + '\n' + (e.filename || '') + ':' + e.lineno;
    document.body.appendChild(d);
  } catch (_) { /* noop */ }
});

function boot() {
  Game.init();
  // First gesture anywhere unlocks audio (browser autoplay policy).
  const unlock = () => {
    Sound.init(); Sound.resume();
    if (Game.state === 'PLAYING') Sound.startAmbient();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/* Small debug/automation hook: lets tests and the console inspect the sim
   without polluting the engine with globals everywhere. */
window.__THALASSA = { Game, World, R, UI, FX, Camera, Input, Sound, Vis, Sprites,
                      STAGES, EDIBLES, ZONES, STAGE_DEPTH, CFG, TRAIT_INFO };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
