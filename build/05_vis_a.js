
/* ============================================================================
   5. VISUALS — procedural organism renderer
   ----------------------------------------------------------------------------
   One function draws ANY creature from its visual spec:

       Vis.body(ctx, vis, r, phase, opts)

   Local space: origin at the creature's centre of mass, +X = the direction it
   faces. Everything is derived from `r` (radius in world units), so a spec
   renders identically at bacterium scale and at whale scale.

   archetypes : bact, ciliate, euglena, amoeba, blob, colony, sponge, medusa,
                worm, arthro, diatom, plant, fish, giant
   layers     : membrane, cytoplasm+organelles, armour, pattern, appendages,
                head furniture, eyes, glow
   ========================================================================== */
const Vis = {
  /* ---------- tiny drawing helpers ------------------------------------- */
  blobPath(ctx, hw, hh, n, amp, phase, seed) {
    // A closed, gently undulating membrane. `amp` is a fraction of the radius.
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n * TAU;
      const w = 1 + amp * (Math.sin(t * 3 + phase + seed) * 0.6 + Math.sin(t * 5 - phase * 1.3 + seed * 1.7) * 0.4);
      const x = Math.cos(t) * hw * w, y = Math.sin(t) * hh * w;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  },

  /** Fill a path with a cytoplasm gradient + stroke the membrane. */
  paint(ctx, c, c2, hw, hh, lw, alpha = 1) {
    const g = ctx.createRadialGradient(-hw * 0.22, -hh * 0.3, Math.max(0.4, hw * 0.05), 0, 0, Math.max(hw, hh) * 1.15);
    g.addColorStop(0, hsl(c[0], c[1], Math.min(96, c[2] + 20), alpha));
    g.addColorStop(0.55, hsl(c[0], c[1], c[2], alpha));
    g.addColorStop(1, hsl(c2[0], c2[1], Math.max(6, c2[2] - 6), alpha));
    ctx.fillStyle = g; ctx.fill();
    if (lw > 0.15) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = hsl(c2[0], c2[1] + 6, Math.max(8, c2[2] - 16), alpha * 0.95);
      ctx.stroke();
    }
  },

  /** Dorsal highlight — the wet, rounded look. */
  gloss(ctx, hw, hh, alpha) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-hw * 0.18, -hh * 0.46, hw * 0.5, hh * 0.19, -0.16, 0, TAU);
    ctx.fillStyle = `hsla(190 90% 92% / ${0.16 * alpha})`; ctx.fill();
    ctx.restore();
  },

  /** A tapered limb drawn along a quadratic curve. */
  tapered(ctx, x0, y0, cx, cy, x1, y1, w0, w1, col, alpha = 1) {
    const steps = Math.max(3, Math.round(dist(x0, y0, x1, y1) / Math.max(1.2, w0 * 0.9)));
    ctx.beginPath();
    const px = [], py = [], pw = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      px.push(u * u * x0 + 2 * u * t * cx + t * t * x1);
      py.push(u * u * y0 + 2 * u * t * cy + t * t * y1);
      pw.push(lerp(w0, w1, t));
    }
    ctx.moveTo(px[0], py[0] - pw[0] * 0.5);
    for (let i = 1; i <= steps; i++) ctx.lineTo(px[i], py[i] - pw[i] * 0.5);
    for (let i = steps; i >= 0; i--) ctx.lineTo(px[i], py[i] + pw[i] * 0.5);
    ctx.closePath();
    ctx.fillStyle = hsl(col[0], col[1], col[2], alpha); ctx.fill();
  },

  /* =======================================================================
     ARCHETYPES
     ===================================================================== */
  drawArch(ctx, v, r, ph, o) {
    switch (v.arch) {
      case 'bact':    return this.archBact(ctx, v, r, ph, o);
      case 'ciliate': return this.archCiliate(ctx, v, r, ph, o);
      case 'euglena': return this.archEuglena(ctx, v, r, ph, o);
      case 'amoeba':  return this.archAmoeba(ctx, v, r, ph, o);
      case 'blob':    return this.archBlob(ctx, v, r, ph, o);
      case 'colony':  return this.archColony(ctx, v, r, ph, o);
      case 'sponge':  return this.archSponge(ctx, v, r, ph, o);
      case 'medusa':  return this.archMedusa(ctx, v, r, ph, o);
      case 'worm':    return this.archWorm(ctx, v, r, ph, o);
      case 'arthro':  return this.archArthro(ctx, v, r, ph, o);
      case 'diatom':  return this.archDiatom(ctx, v, r, ph, o);
      case 'plant':   return this.archPlant(ctx, v, r, ph, o);
      case 'fish':    return this.archFish(ctx, v, r, ph, o);
      case 'giant':   return this.archGiant(ctx, v, r, ph, o);
      default:        return this.archBlob(ctx, v, r, ph, o);
    }
  },

  /* ---- bacterium: capsule with a nucleoid ----------------------------- */
  archBact(ctx, v, r, ph, o) {
    const rr = mulberry32(o.seed), ar = 1.35 + rr() * 0.5;
    ctx.save(); ctx.rotate((rr() - 0.5) * 0.5);
    const hw = r * ar, hh = r * (0.62 + rr() * 0.12);
    this.blobPath(ctx, hw, hh, 22, o.detail ? 0.045 : 0, ph * 1.2, o.seed % 6.28);
    this.paint(ctx, v.col, v.col2, hw, hh, r * 0.09, o.alpha);
    if (o.detail) {
      // nucleoid: a tangled loop of DNA
      ctx.save();
      ctx.beginPath();
      const n = 26, cx0 = -hw * 0.05;
      for (let i = 0; i <= n; i++) {
        const t = i / n * TAU;
        const x = cx0 + Math.cos(t) * hh * 0.42 + Math.sin(t * 3 + ph) * hh * 0.13;
        const y = Math.sin(t) * hh * 0.34 + Math.cos(t * 2 - ph) * hh * 0.1;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = hsl(v.col[0], v.col[1] + 12, Math.min(94, v.col[2] + 26), 0.75 * o.alpha);
      ctx.lineWidth = Math.max(0.4, r * 0.05); ctx.stroke();
      ctx.restore();
    }
    this.gloss(ctx, hw, hh, o.alpha);
    ctx.restore();
    return { hw, hh };
  },

  /* ---- ciliate: slipper shape, oral groove, macro/micronucleus --------- */
  archCiliate(ctx, v, r, ph, o) {
    const hw = r * 1.5, hh = r * 0.78;
    ctx.beginPath();
    const N = 34;
    for (let i = 0; i <= N; i++) {
      const t = i / N * TAU;
      // asymmetric "paramecium" outline: blunt front, tapered rear, ventral dip
      const taper = 1 - 0.42 * Math.pow(Math.max(0, -Math.cos(t)), 1.6);
      const dip = (Math.sin(t) > 0 ? 0.13 : 0) * Math.sin(t * 2);
      const x = Math.cos(t) * hw * taper;
      const y = Math.sin(t) * hh * (1 - dip) + (o.detail ? Math.sin(t * 3 + ph) * hh * 0.03 : 0);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    this.paint(ctx, v.col, v.col2, hw, hh, r * 0.08, o.alpha);
    if (o.detail) {
      // oral groove
      if (v.oral) {
        ctx.beginPath();
        ctx.moveTo(hw * 0.55, -hh * 0.05);
        ctx.quadraticCurveTo(hw * 0.05, hh * 0.5, -hw * 0.28, hh * 0.18);
        ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(10, v.col2[2] - 22), 0.6 * o.alpha);
        ctx.lineWidth = Math.max(0.5, r * 0.07); ctx.stroke();
      }
      // macronucleus (bean) + micronucleus (dot)
      const drawNuc = (x, y, rx, ry, rot, col, a) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.fillStyle = hsl(col[0], col[1], col[2], a * o.alpha); ctx.fill();
        ctx.strokeStyle = hsl(col[0], col[1], Math.max(8, col[2] - 20), 0.5 * a * o.alpha);
        ctx.lineWidth = Math.max(0.3, r * 0.03); ctx.stroke(); ctx.restore();
      };
      drawNuc(-hw * 0.06, -hh * 0.06 + Math.sin(ph * 0.6) * hh * 0.03, hh * 0.4, hh * 0.27, 0.5,
              shade(v.col2, -8, 8), 0.9);
      if (v.organelles && v.organelles.indexOf('micronuc') >= 0)
        drawNuc(hw * 0.14, hh * 0.16, hh * 0.13, hh * 0.11, 0, shade(v.col2, -16), 0.95);
      this.drawOrganelles(ctx, v, r, ph, o, hw, hh, 0.4);
      // food vacuoles drifting around the cyclosis circuit
      const nv = 3;
      for (let i = 0; i < nv; i++) {
        const t = ph * 0.35 + i / nv * TAU;
        const x = Math.cos(t) * hw * 0.5, y = Math.sin(t) * hh * 0.45;
        ctx.beginPath(); ctx.arc(x, y, r * 0.075, 0, TAU);
        ctx.fillStyle = hsl(90, 30, 46, 0.45 * o.alpha); ctx.fill();
      }
    }
    this.gloss(ctx, hw, hh, o.alpha);
    return { hw, hh };
  },

  /* ---- euglena: spindle with two flagella + eyespot ------------------- */
  archEuglena(ctx, v, r, ph, o) {
    const hw = r * 1.65, hh = r * 0.6;
    ctx.beginPath();
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const t = i / N * TAU;
      const pinch = Math.pow(Math.abs(Math.sin(t)), 0.55);
      const x = Math.cos(t) * hw;
      const y = Math.sin(t) * hh * pinch * (1 + (o.detail ? Math.sin(t * 2 + ph * 1.6) * 0.06 : 0));
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    this.paint(ctx, v.col, v.col2, hw, hh, r * 0.07, o.alpha);
    if (o.detail) {
      // chloroplasts: little green rods with thylakoid stripes
      const rr = mulberry32(o.seed + 7);
      for (let i = 0; i < 7; i++) {
        const x = (rr() - 0.5) * hw * 1.3, y = (rr() - 0.5) * hh * 1.1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rr() * TAU);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.16, r * 0.075, 0, 0, TAU);
        ctx.fillStyle = hsl(104, 56, 44, 0.65 * o.alpha); ctx.fill();
        ctx.strokeStyle = hsl(120, 60, 30, 0.4 * o.alpha);
        ctx.lineWidth = Math.max(0.25, r * 0.02); ctx.stroke();
        ctx.restore();
      }
      // nucleus
      ctx.beginPath(); ctx.arc(-hw * 0.15, hh * 0.05, r * 0.2, 0, TAU);
      ctx.fillStyle = hsl(280, 24, 60, 0.5 * o.alpha); ctx.fill();
      // eyespot (stigma) near the front
      ctx.beginPath(); ctx.arc(hw * 0.52, -hh * 0.22, r * 0.1, 0, TAU);
      ctx.fillStyle = hsl(14, 76, 54, 0.9 * o.alpha); ctx.fill();
    }
    this.gloss(ctx, hw, hh, o.alpha);
    return { hw, hh };
  },

  /* ---- amoeba: flowing lobes with visible organelles ------------------ */
  archAmoeba(ctx, v, r, ph, o) {
    const N = 44, lobes = 5;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N * TAU;
      // pseudopods: travelling waves of extension around the margin
      const ext = 1 + 0.3 * Math.pow(Math.max(0, Math.sin(t * lobes * 0.5 - ph * 1.1)), 3)
                    + 0.1 * Math.sin(t * 7 + ph * 0.8);
      const x = Math.cos(t) * r * ext, y = Math.sin(t) * r * ext * 0.92;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    this.paint(ctx, v.col, v.col2, r, r, r * 0.07, o.alpha * 0.94);
    if (o.detail) {
      // ectoplasm / endoplasm boundary
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N * TAU;
        const ext = 1 + 0.2 * Math.sin(t * 3 - ph * 0.9);
        const x = Math.cos(t) * r * 0.7 * ext, y = Math.sin(t) * r * 0.66 * ext;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = hsl(v.col[0], v.col[1], Math.min(94, v.col[2] + 14), 0.28 * o.alpha);
      ctx.lineWidth = Math.max(0.4, r * 0.04); ctx.stroke();
      this.drawOrganelles(ctx, v, r, ph, o, r, r, 0.62);
    }
    this.gloss(ctx, r * 0.9, r * 0.9, o.alpha * 0.7);
    return { hw: r * 1.25, hh: r * 1.2 };
  },

  /* ---- generic blob (placozoa, soft lumps) ---------------------------- */
  archBlob(ctx, v, r, ph, o) {
    const flat = v.flat ? 0.42 : 0.86;
    const hw = r * (v.flat ? 1.5 : 1.15), hh = r * flat;
    this.blobPath(ctx, hw, hh, 30, o.detail ? 0.09 : 0, ph * 0.9, o.seed % 6.28);
    this.paint(ctx, v.col, v.col2, hw, hh, r * 0.07, o.alpha * (v.translucent ? 0.62 : 1));
    if (o.detail) this.drawOrganelles(ctx, v, r, ph, o, hw, hh, 0.55);
    this.gloss(ctx, hw, hh, o.alpha);
    return { hw, hh };
  },

  /* ---- colony: many cells in a matrix, optionally hollow (Volvox) ------ */
  archColony(ctx, v, r, ph, o) {
    const n = v.cells || 8;
    const cc = v.cellCol || shade(v.col, 8, 6);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = hsl(v.col[0], v.col[1] * 0.5, v.col[2], (v.hollow ? 0.14 : 0.4) * o.alpha);
    ctx.fill();
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(10, v.col2[2] - 12), 0.55 * o.alpha);
    ctx.stroke();
    const rr = mulberry32(o.seed + 3);
    if (v.chain) {  // salp / siphonophore style: cells in a row
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * r * 0.62;
        const wob = Math.sin(ph * 1.4 + i * 0.7) * r * 0.08;
        ctx.beginPath(); ctx.ellipse(x, wob, r * 0.36, r * 0.46, 0, 0, TAU);
        ctx.fillStyle = hsl(cc[0], cc[1], cc[2] + (i % 2 ? 6 : 0), 0.72 * o.alpha); ctx.fill();
        ctx.strokeStyle = hsl(cc[0], cc[1], Math.max(8, cc[2] - 22), 0.4 * o.alpha);
        ctx.lineWidth = Math.max(0.3, r * 0.035); ctx.stroke();
      }
      return { hw: n * r * 0.34, hh: r * 0.6 };
    }
    if (v.chambers) {  // foraminiferan: spiral chambers
      for (let i = 0; i < n; i++) {
        const t = i / n * 3.2, rad = r * (0.28 + 0.72 * (i / n));
        const x = Math.cos(t) * rad * 0.5, y = Math.sin(t) * rad * 0.5;
        ctx.beginPath(); ctx.arc(x, y, r * (0.2 + 0.3 * (1 - i / n)), 0, TAU);
        ctx.fillStyle = hsl(cc[0], cc[1], cc[2], 0.8 * o.alpha); ctx.fill();
        ctx.strokeStyle = hsl(cc[0], cc[1], Math.max(8, cc[2] - 24), 0.5 * o.alpha);
        ctx.lineWidth = Math.max(0.3, r * 0.04); ctx.stroke();
      }
      return { hw: r, hh: r };
    }
    for (let i = 0; i < n; i++) {
      // Fibonacci-ish even scatter, or an even ring for hollow colonies
      let x, y;
      if (v.hollow) { const a = i / n * TAU + ph * 0.25; x = Math.cos(a) * r * 0.86; y = Math.sin(a) * r * 0.86; }
      else { const a = rr() * TAU, d = Math.sqrt(rr()) * r * 0.82; x = Math.cos(a) * d; y = Math.sin(a) * d; }
      const cr = r * (v.hollow ? 0.14 : (0.16 + rr() * 0.16));
      ctx.beginPath(); ctx.arc(x, y, cr, 0, TAU);
      ctx.fillStyle = hsl(cc[0], cc[1], cc[2], 0.85 * o.alpha); ctx.fill();
      ctx.strokeStyle = hsl(cc[0], cc[1], Math.max(8, cc[2] - 26), 0.45 * o.alpha);
      ctx.lineWidth = Math.max(0.25, cr * 0.22); ctx.stroke();
      if (o.detail && cr > r * 0.13) {   // each cell has its own nucleus
        ctx.beginPath(); ctx.arc(x + cr * 0.18, y - cr * 0.14, cr * 0.32, 0, TAU);
        ctx.fillStyle = hsl(cc[0] + 40, cc[1], Math.min(94, cc[2] + 22), 0.6 * o.alpha); ctx.fill();
      }
    }
    return { hw: r, hh: r };
  },

  /* ---- sponge: lumpy asymmetrical body with pores + osculum ------------ */
  archSponge(ctx, v, r, ph, o) {
    const rr = mulberry32(o.seed + 11);
    this.blobPath(ctx, r * 1.2, r, 26, 0.22, ph * 0.4, o.seed % 6.28);
    this.paint(ctx, v.col, v.col2, r, r, r * 0.08, o.alpha);
    // lobes
    for (let i = 0; i < 4; i++) {
      const a = rr() * TAU, d = r * (0.4 + rr() * 0.45);
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.3 + rr() * 0.3), 0, TAU);
      ctx.fillStyle = hsl(v.col[0], v.col[1], v.col[2] + 6, 0.7 * o.alpha); ctx.fill();
    }
    // ostia (intake pores) + osculum (big outflow)
    for (let i = 0; i < 16; i++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * r * 0.92;
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.035 + rr() * 0.035), 0, TAU);
      ctx.fillStyle = hsl(v.col2[0], v.col2[1], Math.max(6, v.col2[2] - 26), 0.65 * o.alpha); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(r * 0.12, -r * 0.1, r * 0.26, 0, TAU);
    ctx.fillStyle = hsl(v.col2[0], v.col2[1], Math.max(6, v.col2[2] - 32), 0.8 * o.alpha); ctx.fill();
    return { hw: r * 1.2, hh: r };
  },

  /* ---- medusa: bell, oral arms, tentacles, comb rows ------------------- */
  archMedusa(ctx, v, r, ph, o) {
    const beat = Math.sin(ph * 2.1), hh = r * (0.78 + beat * 0.1), hw = r * (1.0 - beat * 0.07);
    // tentacles trail behind (drawn first, so the bell overlaps them)
    const tn = v.tentacles || 8;
    const tc = shade(v.col2, 6, -6);
    for (let i = 0; i < tn; i++) {
      const t = tn === 1 ? 0.5 : i / (tn - 1);
      const x0 = -hw * 0.72 + t * hw * 1.44 * 0.0 - hw * 0.1 + (t - 0.5) * hw * 1.5;
      const len = r * (1.5 + 1.1 * Math.sin(t * 3.1 + 1)) * (v.chain ? 1.8 : 1);
      const sway = Math.sin(ph * 1.7 + i * 0.9) * r * 0.28;
      this.tapered(ctx, x0 * 0.6, hh * 0.55, x0 * 0.4 + sway * 0.4, hh * 0.55 + len * 0.5,
                   x0 * 0.2 + sway, hh * 0.55 + len, r * 0.055, r * 0.012, tc, 0.62 * o.alpha);
    }
    // bell
    ctx.beginPath();
    ctx.moveTo(-hw, hh * 0.42);
    ctx.bezierCurveTo(-hw, -hh * 1.35, hw, -hh * 1.35, hw, hh * 0.42);
    ctx.bezierCurveTo(hw * 0.5, hh * 0.78, -hw * 0.5, hh * 0.78, -hw, hh * 0.42);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -hh, 0, hh * 0.7);
    g.addColorStop(0, hsl(v.col[0], v.col[1], Math.min(96, v.col[2] + 16), (v.translucent ? 0.62 : 0.94) * o.alpha));
    g.addColorStop(1, hsl(v.col2[0], v.col2[1], v.col2[2], (v.translucent ? 0.4 : 0.85) * o.alpha));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = r * 0.06;
    ctx.strokeStyle = hsl(v.col2[0], v.col2[1] + 8, Math.max(10, v.col2[2] - 18), 0.5 * o.alpha);
    ctx.stroke();
    // radial canals + gonads
    if (o.detail) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, 0, hw, hh, 0, 0, TAU); ctx.clip();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -hh * 0.1);
        ctx.quadraticCurveTo((i - 1.5) * hw * 0.5, -hh * 0.5, (i - 1.5) * hw * 0.72, hh * 0.3);
        ctx.strokeStyle = hsl(v.col[0] + 30, v.col[1], Math.min(94, v.col[2] + 24), 0.4 * o.alpha);
        ctx.lineWidth = Math.max(0.4, r * 0.045); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, hh * 0.06, hw * 0.2, hh * 0.2, 0, 0, TAU);
      ctx.fillStyle = hsl(v.col2[0] + 20, v.col2[1], Math.min(94, v.col2[2] + 20), 0.5 * o.alpha);
      ctx.fill(); ctx.restore();
    }
    // ctenophore comb rows: iridescent diffracting bands
    if (v.ctene) {
      for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 6; i++) {
        const y = -hh * 0.5 + i * hh * 0.22;
        const hue = (ph * 60 + i * 40) % 360;
        ctx.beginPath(); ctx.ellipse(s * hw * 0.62, y, r * 0.07, r * 0.1, 0, 0, TAU);
        ctx.fillStyle = hsl(hue, 80, 74, 0.55 * o.alpha); ctx.fill();
      }
    }
    // oral arms
    if (v.oralArms) for (let i = 0; i < v.oralArms; i++) {
      const x0 = (i - (v.oralArms - 1) / 2) * hw * 0.34;
      const sway = Math.sin(ph * 1.4 + i) * r * 0.2;
      this.tapered(ctx, x0, hh * 0.6, x0 + sway * 0.5, hh * 0.6 + r * 0.5, x0 + sway, hh * 0.6 + r * 0.95,
                   r * 0.1, r * 0.02, shade(v.col, -6, 8), 0.6 * o.alpha);
    }
    // dumbo octopus "ears"
    if (v.earfin) for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.ellipse(-hw * 0.2, s * hh * 0.7, hw * 0.42, hh * 0.3, s * 0.5, 0, TAU);
      ctx.fillStyle = hsl(v.col2[0], v.col2[1], v.col2[2] + 6, 0.55 * o.alpha); ctx.fill();
    }
    // squid-style mantle + web
    if (v.mantle) {
      ctx.beginPath();
      ctx.moveTo(hw * 0.5, -hh * 0.55);
      ctx.quadraticCurveTo(hw * 1.7, 0, hw * 0.5, hh * 0.55);
      ctx.closePath();
      ctx.fillStyle = hsl(v.col[0], v.col[1], v.col[2] - 4, 0.8 * o.alpha); ctx.fill();
    }
    if (v.web) {
      ctx.beginPath(); ctx.moveTo(0, hh * 0.4);
      ctx.lineTo(-hw * 1.1, hh * 2.2); ctx.lineTo(hw * 1.1, hh * 2.2); ctx.closePath();
      ctx.fillStyle = hsl(v.col2[0], v.col2[1], v.col2[2], 0.2 * o.alpha); ctx.fill();
    }
    return { hw, hh };
  },

  /* ---- worm / annelid: segmented chain that follows a body wave -------- */
  archWorm(ctx, v, r, ph, o) {
    const segs = Math.max(1, v.segs || 8);
    const len = r * 2.5, hh = r * (v.flat ? 0.5 : 0.62);
    const pts = bodyWave(segs + 1, len, r * 0.16 * (v.flat ? 0.4 : 1), ph);
    // tube dwelling first (behind everything)
    if (v.tube) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-len * 0.62, -hh * 1.5); ctx.lineTo(len * 0.1, -hh * 1.2);
      ctx.lineTo(len * 0.1, hh * 1.2); ctx.lineTo(-len * 0.62, hh * 1.5); ctx.closePath();
      ctx.fillStyle = hsl(30, 22, 52, 0.75 * o.alpha); ctx.fill();
      ctx.strokeStyle = hsl(24, 26, 34, 0.6 * o.alpha); ctx.lineWidth = Math.max(0.4, r * 0.08); ctx.stroke();
      ctx.restore();
    }
    // parapodia / legs under the segments
    if (v.parapodia || v.legs) {
      const ln = v.legs || segs;
      for (let i = 1; i < ln; i++) {
        const p = pts[Math.min(pts.length - 1, i)];
        const sw = Math.sin(ph * 3 + i * 0.8) * r * 0.18;
        for (let s = -1; s <= 1; s += 2) {
          this.tapered(ctx, p.x, p.y, p.x - r * 0.2, p.y + s * hh * 1.2 + sw, p.x - r * 0.35,
                       p.y + s * hh * 1.9 + sw * 1.6, r * 0.09, r * 0.02,
                       shade(v.col2, 4, 6), 0.6 * o.alpha);
        }
      }
    }
    // the body itself, segment by segment
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i], t = i / (pts.length - 1);
      const w = hh * (0.45 + 0.75 * Math.sin(Math.PI * Math.pow(t, 0.72))) * (1 - t * 0.35);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 1.25, w, p.ang, 0, TAU);
      const l = v.col[2] + (i % 2 ? 5 : -3);
      ctx.fillStyle = hsl(v.col[0], v.col[1], clamp(l, 6, 94), o.alpha * (v.translucent ? 0.7 : 1));
      ctx.fill();
      if (o.detail && w > 1.6) {
        ctx.lineWidth = Math.max(0.3, w * 0.16);
        ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 18), 0.5 * o.alpha);
        ctx.stroke();
      }
      if (v.chaetae || v.spikes) {
        for (let s = -1; s <= 1; s += 2) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + s * w * 0.8);
          ctx.lineTo(p.x - w * 0.5, p.y + s * w * 1.7);
          ctx.lineWidth = Math.max(0.3, w * 0.14);
          ctx.strokeStyle = hsl(16, 60, 58, 0.6 * o.alpha); ctx.stroke();
        }
      }
    }
    // fan crown (tubeworm radioles)
    if (v.fan) {
      const fx = pts[0].x, fy = pts[0].y;
      for (let i = 0; i < 12; i++) {
        const a = -0.9 + i / 11 * 1.8;
        this.tapered(ctx, fx, fy, fx + Math.cos(a) * r * 0.8, fy + Math.sin(a) * r * 0.9,
                     fx + Math.cos(a + Math.sin(ph + i) * 0.1) * r * 1.4, fy + Math.sin(a) * r * 1.5,
                     r * 0.07, r * 0.02, [348, 62, 62], 0.7 * o.alpha);
      }
    }
    this.eyeCluster(ctx, v, r, pts[0].x + r * 0.3, pts[0].y, o, 0.5);
    this.mouth(ctx, v, r, pts[0].x + r * 0.72, pts[0].y, o, pts[0].ang);
    return { hw: len * 0.55, hh: hh * 1.2 };
  },

  /* ---- arthropod: segmented carapace, shell spiral, limbs, jet --------- */
  archArthro(ctx, v, r, ph, o) {
    if (v.shell) {   // ammonoid / nautilus: logarithmic spiral shell
      ctx.save();
      const cx = -r * 0.15, turns = 2.35;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= 90; i++) {
          const t = i / 90, a = t * turns * TAU;
          const rad = r * 0.16 * Math.pow(1.36, t * turns * 2.0);
          const x = cx + Math.cos(a) * rad, y = Math.sin(a) * rad * 0.98;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        if (pass === 0) {
          ctx.lineWidth = r * 0.5; ctx.strokeStyle = hsl(v.col[0], v.col[1], v.col[2], 0.92 * o.alpha);
          ctx.lineCap = 'round'; ctx.stroke();
        } else {
          ctx.lineWidth = r * 0.05; ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 20), 0.6 * o.alpha);
          ctx.stroke();
        }
      }
      // septa lines
      for (let i = 3; i < 16; i++) {
        const t = i / 16, a = t * turns * TAU;
        const rad = r * 0.16 * Math.pow(1.36, t * turns * 2.0);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rad, Math.sin(a) * rad * 0.98, rad * 0.44, a + 1.2, a + 5.1);
        ctx.lineWidth = Math.max(0.3, r * 0.03);
        ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 26), 0.35 * o.alpha);
        ctx.stroke();
      }
      ctx.restore();
      // head + eyes + tentacles poking out of the aperture
      const hx = r * 0.92;
      ctx.beginPath(); ctx.ellipse(hx, 0, r * 0.42, r * 0.46, 0, 0, TAU);
      ctx.fillStyle = hsl(v.col2[0], v.col2[1] + 8, v.col2[2] + 8, 0.95 * o.alpha); ctx.fill();
      const tn = v.tentacles || 8;
      for (let i = 0; i < tn; i++) {
        const t = tn === 1 ? 0.5 : i / (tn - 1);
        const sw = Math.sin(ph * 2 + i * 0.7) * r * 0.14;
        this.tapered(ctx, hx + r * 0.2, (t - 0.5) * r * 0.8, hx + r * 0.8, (t - 0.5) * r * 1.3 + sw,
                     hx + r * 1.35, (t - 0.5) * r * 1.7 + sw * 2, r * 0.07, r * 0.015,
                     shade(v.col2, 10, 8), 0.8 * o.alpha);
      }
      this.eyeCluster(ctx, v, r, hx + r * 0.16, -r * 0.12, o, 0.7);
      return { hw: r * 1.7, hh: r };
    }
    // generic crustacean / insect-grade body
    const segs = v.segs || 6;
    const len = r * 2.3;
    const pts = bodyWave(segs, len, r * 0.08, ph);
    // abdomen
    for (let i = pts.length - 1; i >= 1; i--) {
      const p = pts[i], t = i / (pts.length - 1);
      const w = r * (0.72 - t * 0.4);
      ctx.beginPath(); ctx.ellipse(p.x, p.y, w * 1.2, w, p.ang, 0, TAU);
      ctx.fillStyle = hsl(v.col[0], v.col[1], v.col[2] - t * 8, (v.translucent ? 0.66 : 0.95) * o.alpha);
      ctx.fill();
      ctx.lineWidth = Math.max(0.3, w * 0.14);
      ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 20), 0.5 * o.alpha);
      ctx.stroke();
    }
    // carapace
    ctx.beginPath();
    ctx.moveTo(pts[0].x + r * 0.5, 0);
    ctx.bezierCurveTo(pts[0].x + r * 0.3, -r * 0.75, -r * 0.5, -r * 0.8, -r * 0.85, 0);
    ctx.bezierCurveTo(-r * 0.5, r * 0.8, pts[0].x + r * 0.3, r * 0.75, pts[0].x + r * 0.5, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r * 0.8, 0, r * 0.8);
    g.addColorStop(0, hsl(v.col[0], v.col[1], Math.min(94, v.col[2] + 14), 0.95 * o.alpha));
    g.addColorStop(1, hsl(v.col2[0], v.col2[1], v.col2[2], 0.95 * o.alpha));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = r * 0.06;
    ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 22), 0.6 * o.alpha); ctx.stroke();
    // limbs
    const ln = v.legs || 5;
    for (let i = 0; i < ln; i++) {
      const p = pts[Math.min(pts.length - 1, 1 + Math.floor(i * (pts.length - 2) / ln))];
      for (let s = -1; s <= 1; s += 2) {
        const sw = Math.sin(ph * 4 + i * 1.1 + (s > 0 ? 1.6 : 0)) * r * 0.16;
        this.tapered(ctx, p.x, p.y + s * r * 0.2, p.x - r * 0.1, p.y + s * r * 0.85 + sw,
                     p.x - r * 0.35, p.y + s * r * 1.25 + sw * 1.7,
                     r * 0.075, r * 0.015, shade(v.col, -12, 6), 0.72 * o.alpha);
      }
    }
    // antennae / raptorial club
    if (v.antenna) for (let s = -1; s <= 1; s += 2) {
      this.tapered(ctx, r * 0.85, s * r * 0.2, r * 1.5, s * r * 0.6 + Math.sin(ph * 2 + s) * r * 0.1,
                   r * 1.9, s * r * 0.95 + Math.sin(ph * 2 + s) * r * 0.2, r * 0.05, r * 0.012,
                   shade(v.col, -8), 0.7 * o.alpha);
    }
    if (v.club) for (let s = -1; s <= 1; s += 2) {
      const sw = Math.sin(ph * 3 + s) * 0.35;
      this.tapered(ctx, r * 0.7, s * r * 0.25, r * 1.3, s * r * 0.5, r * 1.7, s * r * 0.62 + sw * r * 0.2,
                   r * 0.1, r * 0.14, [8, 62, 52], 0.9 * o.alpha);
    }
    if (v.jet) {
      ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.2); ctx.lineTo(-r * 1.5, 0); ctx.lineTo(-r * 0.8, r * 0.2);
      ctx.closePath(); ctx.fillStyle = hsl(v.col2[0], v.col2[1], v.col2[2] + 10, 0.7 * o.alpha); ctx.fill();
    }
    this.eyeCluster(ctx, v, r, r * 0.5, -r * 0.22, o, 0.7);
    return { hw: r * 1.5, hh: r * 0.9 };
  },

  /* ---- diatom / coccolithophore: mineral frustule --------------------- */
  archDiatom(ctx, v, r, ph, o) {
    const rr = mulberry32(o.seed + 5), sides = 6 + ((rr() * 3) | 0);
    ctx.save(); ctx.rotate(rr() * TAU);
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU;
      const rad = r * (1 + (i % 2 ? 0.06 : -0.06));
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad * 0.72;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    this.paint(ctx, v.col, v.col2, r, r * 0.72, r * 0.09, o.alpha * 0.9);
    if (o.detail) {
      // striae: the characteristic engraved rows
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, i * r * 0.16); ctx.lineTo(r * 0.9, i * r * 0.16);
        ctx.lineWidth = Math.max(0.25, r * 0.03);
        ctx.strokeStyle = hsl(v.col[0], v.col[1], Math.max(10, v.col[2] - 24), 0.28 * o.alpha);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.32, r * 0.2, 0, 0, TAU);
      ctx.fillStyle = hsl(96, 48, 46, 0.5 * o.alpha); ctx.fill();   // chloroplast
    }
    ctx.restore();
    return { hw: r, hh: r * 0.72 };
  },

  /* ---- plant: anchored fronds, coral polyps, vent mats ---------------- */
  archPlant(ctx, v, r, ph, o) {
    if (v.tentacles) {   // coral polyp
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU);
      this.paint(ctx, v.col, v.col2, r * 0.62, r * 0.62, r * 0.08, o.alpha);
      const tn = v.tentacles;
      for (let i = 0; i < tn; i++) {
        const a = i / tn * TAU + Math.sin(ph * 0.8) * 0.12;
        this.tapered(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5,
                     Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1 + Math.sin(ph + i) * r * 0.12,
                     Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5 + Math.sin(ph * 1.3 + i) * r * 0.2,
                     r * 0.11, r * 0.02, shade(v.col2, 12, 10), 0.85 * o.alpha);
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU);
      ctx.fillStyle = hsl(48, 70, 66, 0.7 * o.alpha); ctx.fill();
      return { hw: r * 1.5, hh: r * 1.5 };
    }
    // frond-based producer (kelp, seagrass, vent mat)
    const fn = v.fronds || 3;
    const rr = mulberry32(o.seed + 9);
    for (let i = 0; i < fn; i++) {
      const a = -Math.PI / 2 + (i - (fn - 1) / 2) * 0.42 + (rr() - 0.5) * 0.2;
      const len = r * (1.6 + rr() * 1.2);
      const sway = Math.sin(ph * 0.9 + i * 1.3) * r * 0.35;
      this.tapered(ctx, 0, r * 0.5, Math.cos(a) * len * 0.5 + sway * 0.5, Math.sin(a) * len * 0.5,
                   Math.cos(a) * len + sway, Math.sin(a) * len, r * 0.24, r * 0.05,
                   i % 2 ? v.col : v.col2, 0.9 * o.alpha);
    }
    if (v.anchor) {   // holdfast
      ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 0.34, r * 0.2, 0, 0, TAU);
      ctx.fillStyle = hsl(v.col2[0], v.col2[1] * 0.6, Math.max(8, v.col2[2] - 18), 0.9 * o.alpha); ctx.fill();
    }
    return { hw: r * 1.4, hh: r * 1.6 };
  },

  /* ---- fish: the vertebrate workhorse --------------------------------- */
  archFish(ctx, v, r, ph, o) {
    return this.fishBody(ctx, v, r, ph, o, 1);
  },

  /* ---- giant: same code path as fish with more mass, flukes, blowholes */
  archGiant(ctx, v, r, ph, o) {
    return this.fishBody(ctx, v, r, ph, o, 1.18);
  },
};

/** Sample points along a travelling body wave (used by worms, fish, eels). */
function bodyWave(n, len, amp, ph) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    const x = len * 0.5 - t * len;
    const y = Math.sin(t * 3.6 - ph) * amp * t * (0.35 + t);
    pts.push({ x, y, t, ang: 0 });
  }
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    pts[i].ang = Math.atan2(b.y - a.y, b.x - a.x);
  }
  return pts;
}
