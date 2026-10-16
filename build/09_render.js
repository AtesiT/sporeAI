
/* ============================================================================
   8b. RENDERER
   ----------------------------------------------------------------------------
   Two-canvas pipeline for the pixel-art look: everything is drawn into an
   internal buffer at ~0.6× the window size, then upscaled once with
   imageSmoothingEnabled = false. The buffer is also cheaper to fill, so the
   style and the performance win are the same decision.
   ========================================================================== */
const R = {
  view: null, vctx: null, buf: null, bctx: null,
  W: 0, H: 0, BW: 0, BH: 0, S: 0.6,
  visible: [],
  rays: [],
  snowSeeded: false,
  quality: 1,          // mirrors World.quality for effects

  init() {
    this.view = document.getElementById('view');
    this.vctx = this.view.getContext('2d', { alpha: false });
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d', { alpha: false });
    for (let i = 0; i < 9; i++) {
      this.rays.push({ x: Math.random(), w: rnd(0.02, 0.09), sp: rnd(0.004, 0.016),
                       a: rnd(0.03, 0.10), ph: Math.random() * TAU });
    }
    this.resize();
  },

  resize() {
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    this.W = w; this.H = h;
    this.view.width = w; this.view.height = h;
    this.view.style.width = w + 'px'; this.view.style.height = h + 'px';
    // pick a downscale that keeps the short side near PIX_TARGET but readable
    const short = Math.min(w, h);
    let s = clamp(CFG.PIX_TARGET / short, CFG.PIX_MIN, CFG.PIX_MAX);
    let bw = Math.round(w * s), bh = Math.round(h * s);
    if (Math.min(bw, bh) < CFG.MIN_SIDE * 0.62) {          // never too chunky on big screens
      const k = (CFG.MIN_SIDE * 0.62) / Math.min(bw, bh);
      s = Math.min(1, s * k); bw = Math.round(w * s); bh = Math.round(h * s);
    }
    this.S = s; this.BW = bw; this.BH = bh;
    this.buf.width = bw; this.buf.height = bh;
    this.vctx.imageSmoothingEnabled = false;
  },

  /* ---- coordinate helpers --------------------------------------------- */
  worldScale() { return this.S * Camera.zoom; },
  viewW() { return this.W / Camera.zoom; },
  viewH() { return this.H / Camera.zoom; },

  applyWorld(c) {
    const k = this.worldScale();
    c.setTransform(k, 0, 0, k, this.BW * 0.5 + (Camera.ox - Camera.x) * k,
                             this.BH * 0.5 + (Camera.oy - Camera.y) * k);
  },
  toScreen(x, y) {
    const k = this.worldScale();
    return { x: this.BW * 0.5 + (x - Camera.x + Camera.ox) * k,
             y: this.BH * 0.5 + (y - Camera.y + Camera.oy) * k };
  },

  /* ---- main entry ------------------------------------------------------ */
  render(game, dt) {
    const c = this.bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawWater(c, game);
    this.applyWorld(c);
    this.drawRays(c, game);
    this.drawEntities(c, game);
    this.drawPlayer(c, game);
    this.drawFx(c, game);
    // screen-space overlays
    c.setTransform(1, 0, 0, 1, 0, 0);
    this.drawSnow(c, game);
    this.drawFloaters(c, game);
    this.drawPressure(c, game);
    this.drawThreatArrows(c, game);
    this.drawVignette(c, game);
    // upscale to the window
    const v = this.vctx;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.imageSmoothingEnabled = false;
    v.drawImage(this.buf, 0, 0, this.BW, this.BH, 0, 0, this.W, this.H);
  },

  /* ---- water column ---------------------------------------------------- */
  drawWater(c, game) {
    const topY = Camera.y - this.viewH() * 0.5, botY = Camera.y + this.viewH() * 0.5;
    const g = c.createLinearGradient(0, 0, 0, this.BH);
    const N = 11;
    for (let i = 0; i <= N; i++) {
      const y = lerp(topY, botY, i / N);
      const z = zoneAt(y), t = clamp(invLerp(z.y0, z.y1, y), 0, 1);
      const mix = mixHsl(z.bg[0], z.bg[1], t);
      g.addColorStop(i / N, hsl(mix[0], mix[1], mix[2]));
    }
    c.fillStyle = g;
    c.fillRect(0, 0, this.BW, this.BH);

    // surface: a bright, wavering boundary when it is in view
    if (topY < CFG.MIN_Y + 260) {
      const sy = this.toScreen(0, CFG.MIN_Y).y;
      const sg = c.createLinearGradient(0, sy - 26, 0, sy + 46);
      sg.addColorStop(0, 'hsla(188 92% 88% / 0.95)');
      sg.addColorStop(0.4, 'hsla(186 88% 76% / 0.45)');
      sg.addColorStop(1, 'hsla(186 80% 70% / 0)');
      c.fillStyle = sg;
      c.fillRect(0, sy - 26, this.BW, 72);
      c.beginPath();
      for (let x = 0; x <= this.BW; x += 6) {
        const wy = sy + Math.sin(x * 0.045 + game.time * 1.7) * 2.2
                      + Math.sin(x * 0.017 - game.time * 1.1) * 1.6;
        x ? c.lineTo(x, wy) : c.moveTo(x, wy);
      }
      c.strokeStyle = 'hsla(190 100% 94% / 0.7)'; c.lineWidth = 2; c.stroke();
    }
    // seafloor
    if (botY > CFG.MAX_DEPTH - 400) {
      const fy = this.toScreen(0, CFG.MAX_DEPTH).y;
      c.fillStyle = 'hsl(240 30% 5%)';
      c.fillRect(0, fy, this.BW, this.BH - fy + 4);
      c.beginPath();
      for (let x = 0; x <= this.BW; x += 8) {
        const wy = fy + Math.sin(x * 0.02) * 6 + Math.sin(x * 0.006 + 2) * 12;
        x ? c.lineTo(x, wy) : c.moveTo(x, wy);
      }
      c.lineTo(this.BW, this.BH); c.lineTo(0, this.BH); c.closePath();
      c.fillStyle = 'hsl(238 26% 7%)'; c.fill();
    }
  },

  /** God-ray shafts, only in the sunlit zone, with a slow sway. */
  drawRays(c, game) {
    const z = zoneAt(Camera.y);
    if (z.rays <= 0 || this.quality < 0.7) return;
    const n = this.quality > 0.9 ? 7 : 4;
    const vw = this.viewW();
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const r = this.rays[i];
      const drift = (r.x + game.time * r.sp * 0.06 + Math.sin(game.time * 0.11 + r.ph) * 0.02) % 1;
      const x = Camera.x - vw * 0.6 + drift * vw * 1.2;
      const w = vw * r.w;
      const topY = CFG.MIN_Y;
      // (world transform is active, so gradient coords are world coords)
      const g = c.createLinearGradient(x, topY, x + w * 5, topY + 2600);
      const a = r.a * z.rays * (0.6 + 0.4 * Math.sin(game.time * 0.6 + r.ph));
      g.addColorStop(0, `hsla(186 100% 88% / ${a})`);
      g.addColorStop(0.55, `hsla(184 96% 80% / ${a * 0.35})`);
      g.addColorStop(1, 'hsla(184 90% 74% / 0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - w, topY);
      c.lineTo(x + w, topY);
      c.lineTo(x + w * 6.2, topY + 2900);
      c.lineTo(x + w * 3.4, topY + 2900);
      c.closePath();
      c.fill();
    }
    c.restore();
  },

  /** Parallax marine snow, drawn in screen space. */
  drawSnow(c, game) {
    const z = zoneAt(Camera.y);
    const dens = z.snow * this.quality;
    if (dens <= 0.02) return;
    const layers = [{ d: 0.35, n: 60, s: 1.0, a: 0.22 },
                    { d: 0.65, n: 42, s: 1.7, a: 0.30 },
                    { d: 1.0, n: 26, s: 2.6, a: 0.38 }];
    c.save();
    for (let li = 0; li < layers.length; li++) {
      const L = layers[li];
      const count = Math.round(L.n * dens);
      const cellW = this.BW / 8, cellH = this.BH / 6;
      for (let i = 0; i < count; i++) {
        const seed = hash2(i * 7 + li * 991, 13);
        const rx = (seed % 1000) / 1000, ry = ((seed >> 10) % 1000) / 1000;
        const px = ((rx * this.BW * 3 - Camera.x * L.d * this.S * Camera.zoom * 0.35) % (this.BW + 20) + this.BW + 20) % (this.BW + 20) - 10;
        const drift = (game.time * (6 + L.d * 10) * L.d + ry * this.BH * 2) % (this.BH + 20);
        const py = (this.BH + 20 - drift) % (this.BH + 20) - 10;
        const sz = L.s * (0.6 + ((seed >> 5) % 100) / 140);
        c.globalAlpha = L.a * (0.5 + 0.5 * Math.sin(game.time * 1.4 + i));
        c.fillStyle = z.light > 0.4 ? '#e8fbff' : '#bfe6ff';
        c.fillRect(px | 0, py | 0, Math.max(1, sz) | 0, Math.max(1, sz) | 0);
        void cellW; void cellH;
      }
    }
    c.restore();
  },

  /** Collect on-screen entities, sorted small → large so big things overlap. */
  collectVisible() {
    const out = this.visible; out.length = 0;
    const hw = this.viewW() * 0.5, hh = this.viewH() * 0.5;
    const x0 = Camera.x - hw - 260, x1 = Camera.x + hw + 260;
    const y0 = Camera.y - hh - 260, y1 = Camera.y + hh + 260;
    const ccx = World.cx(Camera.x), ccy = World.cy(Camera.y);
    const R2 = World.loadR + 1;
    for (let j = -R2; j <= R2; j++) for (let i = -R2; i <= R2; i++) {
      const ch = World.chunks.get(chunkKey(ccx + i, ccy + j));
      if (!ch) continue;
      if (ch.x > x1 || ch.x + CFG.CHUNK < x0 || ch.y > y1 || ch.y + CFG.CHUNK < y0) continue;
      const ents = ch.ents;
      for (let k = 0; k < ents.length; k++) {
        const e = ents[k];
        if (e.dead || e === World.player) continue;
        if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
        out.push(e);
      }
    }
    out.sort((a, b) => a.r - b.r);
    return out;
  },

  drawEntities(c, game) {
    const list = this.collectVisible();
    const k = this.worldScale();
    const dimBase = 1 - zoneAt(Camera.y).light;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const vis = e.vis;
      // darkness: bioluminescent things keep their light
      let dim = dimBase;
      if (vis.glow || vis.photophores) dim *= 0.25;
      if (game.player.traits.has('deep')) dim *= 0.7;
      const screenR = e.r * k;
      const detail = screenR > 5.5 && this.quality > 0.55;
      const alpha = e.leviathan ? 0.82 : 1;
      if (screenR < 1.15) {                     // sub-pixel: cheap dot
        c.globalAlpha = alpha * (1 - dim * 0.4);
        c.fillStyle = hsl(vis.col[0], vis.col[1] * (1 - dim * 0.5), vis.col[2] * (1 - dim * 0.6));
        c.fillRect(e.x - 1, e.y - 1, 2, 2);
        c.globalAlpha = 1;
        continue;
      }
      const spr = Sprites.get(e.specId || 'p', vis, e.r, dim, detail, e.spriteSeed);
      const scale = (e.r / spr.r) / spr.sc;     // map sprite pixels back to world units
      c.globalAlpha = alpha;
      if (e.flash > 0) c.globalAlpha = alpha * 0.85;
      Vis.blit(c, spr, e.x, e.y, e.ang, scale);
      if (e.flash > 0) {                        // damage flash
        c.globalAlpha = clamp(e.flash * 3.4, 0, 0.55);
        c.globalCompositeOperation = 'lighter';
        Vis.blit(c, spr, e.x, e.y, e.ang, scale);
        c.globalCompositeOperation = 'source-over';
      }
      c.globalAlpha = 1;
      // vitality pip on wounded things the player is fighting
      if (e.hp < e.maxHp && e.maxHp > 3 && screenR > 12) {
        const w = e.r * 1.5, hh = Math.max(1.2, e.r * 0.09);
        c.fillStyle = 'hsla(0 0% 0% / .45)';
        c.fillRect(e.x - w * 0.5, e.y - e.r - hh * 3, w, hh);
        c.fillStyle = 'hsl(96 62% 60%)';
        c.fillRect(e.x - w * 0.5, e.y - e.r - hh * 3, w * clamp(e.hp / e.maxHp, 0, 1), hh);
      }
    }
  },

  /** The player is always drawn live so its body wave and organelles animate. */
  drawPlayer(c, game) {
    const p = game.player;
    const dim = Math.max(0, (1 - zoneAt(p.y).light) * (p.traits.has('glow') || p.traits.has('deep') ? 0.3 : 1));
    // a faint halo so the player is never lost in the dark
    const k = this.worldScale();
    if (dim > 0.25 || p.r * k < 5) {
      const gr = p.r * 3.4;
      const g = c.createRadialGradient(p.x, p.y, p.r * 0.4, p.x, p.y, gr);
      g.addColorStop(0, `hsla(186 100% 78% / ${0.16 + dim * 0.16})`);
      g.addColorStop(1, 'hsla(186 100% 70% / 0)');
      c.beginPath(); c.arc(p.x, p.y, gr, 0, TAU); c.fillStyle = g; c.fill();
    }
    // echolocation ring
    if (p.sonarRing) {
      const sr = p.sonarRing;
      c.beginPath(); c.arc(p.x, p.y, sr.r, 0, TAU);
      c.lineWidth = Math.max(1, p.r * 0.05);
      c.strokeStyle = `hsla(186 100% 80% / ${0.4 * (1 - sr.r / sr.max)})`;
      c.stroke();
    }
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.ang);
    // i-frames blink
    const blink = p.iframe > 0 ? (Math.sin(p.iframe * 46) > 0 ? 0.45 : 1) : 1;
    Vis.body(c, p.vis, p.r, p.tailPhase, { detail: true, dim, alpha: blink, seed: 1234, animate: true });
    // burst flare
    if (p.bursting) {
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(-p.r, 0, 0, -p.r, 0, p.r * 2.2);
      g.addColorStop(0, 'hsla(190 100% 82% / .30)');
      g.addColorStop(1, 'hsla(190 100% 70% / 0)');
      c.beginPath(); c.arc(-p.r, 0, p.r * 2.2, 0, TAU); c.fillStyle = g; c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();
    // post-evolution grace pulse
    if (p.grace > 0) {
      c.beginPath(); c.arc(p.x, p.y, p.r * (1.4 + (CFG.POST_EVO_GRACE - p.grace) * 2.4), 0, TAU);
      c.lineWidth = Math.max(1, p.r * 0.06);
      c.strokeStyle = `hsla(150 90% 74% / ${clamp(p.grace / CFG.POST_EVO_GRACE, 0, 1) * 0.5})`;
      c.stroke();
    }
  },

  drawFx(c, game) {
    // particles
    for (let i = 0; i < FX.parts.length; i++) {
      const p = FX.parts[i];
      const a = clamp(p.life / p.maxLife, 0, 1) * p.alpha;
      c.globalAlpha = a;
      c.fillStyle = hsl(p.col[0], p.col[1], p.col[2]);
      const s = Math.max(0.6, p.size);
      c.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    c.globalAlpha = 1;
    // expanding rings (sonar, evolution shockwaves)
    for (let i = 0; i < FX.rings.length; i++) {
      const r = FX.rings[i];
      const t = r.t / r.life;
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU);
      c.lineWidth = r.w * (1 - t) * 3;
      c.strokeStyle = r.col.replace('ALPHA', (1 - t) * 0.7);
      c.stroke();
    }
  },

  drawFloaters(c) {
    if (!FX.floats.length) return;
    c.save();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < FX.floats.length; i++) {
      const f = FX.floats[i];
      const t = f.t / f.life;
      const s = this.toScreen(f.x, f.y);
      const a = t < 0.15 ? t / 0.15 : 1 - Math.pow((t - 0.15) / 0.85, 2);
      c.globalAlpha = clamp(a, 0, 1);
      c.font = `700 ${Math.round(f.size * (0.9 + 0.25 * Math.sin(t * 6)))}px "Trebuchet MS",sans-serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(2,12,20,.85)';
      c.strokeText(f.text, s.x, s.y);
      c.fillStyle = f.col;
      c.fillText(f.text, s.x, s.y);
    }
    c.restore();
    c.globalAlpha = 1;
  },

  /** Pressure barrier: warn and push back when below the depth limit. */
  drawPressure(c, game) {
    const p = game.player;
    const lim = game.depthLimit();
    if (p.y < lim - this.viewH() * 0.5) return;
    const sy = this.toScreen(0, lim).y;
    if (sy > this.BH + 40) return;
    const near = clamp(1 - (sy - this.BH * 0.5) / (this.BH * 0.6), 0, 1);
    c.save();
    const g = c.createLinearGradient(0, sy - 90, 0, sy + 10);
    g.addColorStop(0, 'hsla(8 90% 56% / 0)');
    g.addColorStop(1, `hsla(8 90% 56% / ${0.16 + near * 0.2})`);
    c.fillStyle = g;
    c.fillRect(0, Math.max(0, sy - 90), this.BW, Math.min(this.BH, sy + 10) - Math.max(0, sy - 90));
    c.beginPath();
    for (let x = 0; x <= this.BW; x += 10) {
      const y = sy + Math.sin(x * 0.03 + game.time * 3) * 2;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = `hsla(8 96% 66% / ${0.5 + near * 0.4})`;
    c.lineWidth = 2; c.setLineDash([9, 7]); c.stroke(); c.setLineDash([]);
    c.restore();
  },

  /** Red edge arrows for off-screen hunters — deaths should never feel unfair. */
  drawThreatArrows(c, game) {
    const p = game.player;
    const hw = this.viewW() * 0.5, hh = this.viewH() * 0.5;
    let drawn = 0;
    const list = this.visible;
    for (let i = 0; i < list.length && drawn < 7; i++) {
      const e = list[i];
      if (e.beh !== 'predator' && !e.leviathan) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const inside = Math.abs(dx) < hw && Math.abs(dy) < hh;
      if (inside) continue;
      const d = Math.hypot(dx, dy);
      if (d > Math.max(p.sense * 1.7, hw * 2.4)) continue;
      const a = Math.atan2(dy, dx);
      const m = 26;
      const cxp = this.BW * 0.5 + Math.cos(a) * Math.min(this.BW * 0.5 - m, this.BH * 0.5 - m) * 1.0;
      const cyp = this.BH * 0.5 + Math.sin(a) * Math.min(this.BW * 0.5 - m, this.BH * 0.5 - m) * 0.92;
      const prox = clamp(1 - d / (p.sense * 1.9), 0.15, 1);
      c.save();
      c.translate(cxp, cyp); c.rotate(a);
      c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, -7); c.lineTo(-3.5, 0); c.lineTo(-7, 7); c.closePath();
      c.fillStyle = e.leviathan ? `hsla(280 80% 70% / ${0.35 + prox * 0.5})`
                                : `hsla(6 92% 62% / ${0.35 + prox * 0.55})`;
      c.fill();
      c.restore();
      drawn++;
    }
  },

  drawVignette(c, game) {
    const depthT = game.depthT();
    const g = c.createRadialGradient(this.BW * 0.5, this.BH * 0.5, Math.min(this.BW, this.BH) * 0.32,
                                     this.BW * 0.5, this.BH * 0.5, Math.max(this.BW, this.BH) * 0.78);
    g.addColorStop(0, 'hsla(220 60% 4% / 0)');
    g.addColorStop(1, `hsla(222 66% 3% / ${0.42 + depthT * 0.4})`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.BW, this.BH);
    // low-vitality pulse
    const p = game.player;
    if (p && p.hp / p.maxHp < 0.34) {
      const a = (0.16 + 0.14 * Math.sin(game.time * 5)) * (1 - p.hp / p.maxHp / 0.34);
      const rg = c.createRadialGradient(this.BW * 0.5, this.BH * 0.5, Math.min(this.BW, this.BH) * 0.2,
                                        this.BW * 0.5, this.BH * 0.5, Math.max(this.BW, this.BH) * 0.62);
      rg.addColorStop(0, 'hsla(4 90% 46% / 0)');
      rg.addColorStop(1, `hsla(4 92% 50% / ${a})`);
      c.fillStyle = rg; c.fillRect(0, 0, this.BW, this.BH);
    }
    // evolution flash
    if (game.flash > 0) {
      c.fillStyle = `hsla(150 100% 88% / ${clamp(game.flash, 0, 1) * 0.6})`;
      c.fillRect(0, 0, this.BW, this.BH);
    }
  },
};
