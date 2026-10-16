
/* ============================================================================
   5b. VISUALS — the vertebrate body, layer systems, sprite cache
   ========================================================================== */

/**
 * Shared fish/whale/shark body. `mass` nudges girth for the giant archetype.
 * Everything derives from r, so the same code draws a 12 mm lancelet and a
 * 30 m blue whale.
 */
Vis.fishBody = function (ctx, v, r, ph, o, mass) {
  const girth = 1 + (v.girth || 0) * 0.17;
  const hw = r * 1.95 * mass;
  const hh = r * (v.arch === 'giant' ? 0.62 : 0.56) * girth * mass;
  const waveAmp = r * (v.tail === 'ribbon' || v.neck ? 0.20 : 0.13) * (v.stiff ? 0.5 : 1);
  const N = 14;
  const pts = bodyWave(N, hw * 2, waveAmp, ph);

  /* --- caudal fin first so the body overlaps its base ----------------- */
  const tail = pts[N - 1], tp = pts[N - 2];
  const tang = Math.atan2(tail.y - tp.y, tail.x - tp.x);
  this.drawTail(ctx, v, r, tail.x, tail.y, tang, ph, o);

  /* --- median + paired fins ------------------------------------------- */
  this.drawFinsBack(ctx, v, r, pts, ph, o, hw, hh);

  /* --- body outline: build the closed silhouette ----------------------- */
  // chordate profile — pointed snout, deepest at ~28%, narrow caudal peduncle
  const halfW = (t, head) => {
    let w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.85);
    if (t < 0.12) w *= 0.35 + t / 0.12 * 0.65;                       // snout taper
    w *= 1 - 0.55 * Math.pow(Math.max(0, (t - 0.72) / 0.28), 1.6);   // peduncle
    return hh * w * head;
  };
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const head = v.head === 'broad' && p.t < 0.2 ? 1.22 : v.head === 'sperm' && p.t < 0.26 ? 1.35 : 1;
    const y = p.y - halfW(p.t, head);
    i ? ctx.lineTo(p.x, y) : ctx.moveTo(p.x, y);
  }
  for (let i = N - 1; i >= 0; i--) {
    const p = pts[i];
    const head = v.head === 'broad' && p.t < 0.2 ? 1.22 : v.head === 'sperm' && p.t < 0.26 ? 1.35 : 1;
    ctx.lineTo(p.x, p.y + halfW(p.t, head));
  }
  ctx.closePath();

  /* --- fill: silhouette, countershading or full colour ---------------- */
  if (v.silhouette) {
    ctx.fillStyle = hsl(v.col[0], v.col[1] * 0.6, Math.max(4, v.col[2] * 0.32), 0.94 * o.alpha);
    ctx.fill();
    ctx.lineWidth = Math.max(0.4, r * 0.02);
    ctx.strokeStyle = hsl(v.col[0], v.col[1], v.col[2] * 0.6, 0.35 * o.alpha);
    ctx.stroke();
    return { hw, hh, pts };
  }
  const g = ctx.createLinearGradient(0, -hh * 1.1, 0, hh * 1.1);
  const top = v.col, bot = v.counter ? v.col2 : shade(v.col, -10, -4);
  g.addColorStop(0, hsl(top[0], top[1], Math.max(6, top[2] - 12), o.alpha));
  g.addColorStop(0.45, hsl(top[0], top[1], top[2], o.alpha));
  g.addColorStop(0.58, hsl(bot[0], bot[1], bot[2], o.alpha));
  g.addColorStop(1, hsl(bot[0], bot[1], Math.min(98, bot[2] + 8), o.alpha));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(0.35, r * 0.035);
  ctx.strokeStyle = hsl(top[0], top[1] + 6, Math.max(5, top[2] - 26), 0.55 * o.alpha);
  ctx.stroke();

  /* --- patterns clipped to the body ----------------------------------- */
  ctx.save(); ctx.clip();
  this.drawPattern(ctx, v, r, ph, o, hw, hh);
  ctx.restore();

  /* --- head furniture, eyes, mouth ------------------------------------ */
  const hx = pts[0].x, hy = pts[0].y;
  this.drawHead(ctx, v, r, ph, o, hx, hy, hw, hh);
  this.mouth(ctx, v, r, hx + r * 0.15, hy + hh * 0.22, o, 0, hw);
  this.eyeCluster(ctx, v, r, hx - hw * 0.06, hy - hh * 0.16, o, 0.85);

  /* --- fins drawn over the body --------------------------------------- */
  this.drawFinsFront(ctx, v, r, pts, ph, o, hw, hh);
  return { hw, hh, pts };
};

/** Dorsal + anal fins, drawn behind the body. */
Vis.drawFinsBack = function (ctx, v, r, pts, ph, o, hw, hh) {
  const finStyle = v.fins || 'full';
  if (finStyle === 'none') return;
  const fc = shade(v.col2, -6, 4);
  const dorsal = v.dorsal || (v.arch === 'giant' ? 'swept' : 'normal');
  const at = (t) => pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];

  if (dorsal !== 'tiny' && finStyle !== 'paddle') {
    const p = at(0.34), sway = Math.sin(ph * 1.6) * r * 0.05;
    if (dorsal === 'tall') {
      ctx.beginPath();
      ctx.moveTo(p.x + hw * 0.16, p.y - hh * 0.72);
      ctx.quadraticCurveTo(p.x - hw * 0.05, p.y - hh * 2.5, p.x - hw * 0.30, p.y - hh * 0.78);
      ctx.closePath();
    } else if (dorsal === 'bump') {
      ctx.beginPath();
      ctx.moveTo(p.x + hw * 0.14, p.y - hh * 0.78);
      ctx.quadraticCurveTo(p.x, p.y - hh * 1.3, p.x - hw * 0.22, p.y - hh * 0.78);
      ctx.closePath();
    } else {   // swept / normal
      ctx.beginPath();
      ctx.moveTo(p.x + hw * 0.14, p.y - hh * 0.8);
      ctx.quadraticCurveTo(p.x - hw * 0.1 + sway, p.y - hh * (dorsal === 'swept' ? 1.9 : 1.5),
                           p.x - hw * 0.34, p.y - hh * 0.62);
      ctx.closePath();
    }
    ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.86 * o.alpha); ctx.fill();
    ctx.lineWidth = Math.max(0.3, r * 0.025);
    ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(6, fc[2] - 20), 0.5 * o.alpha); ctx.stroke();
    if (v.arch !== 'giant' && finStyle === 'shark') {   // small second dorsal
      const q = at(0.66);
      ctx.beginPath();
      ctx.moveTo(q.x + hw * 0.07, q.y - hh * 0.5);
      ctx.quadraticCurveTo(q.x, q.y - hh * 1.1, q.x - hw * 0.12, q.y - hh * 0.42);
      ctx.closePath();
      ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.8 * o.alpha); ctx.fill();
    }
  }
  // anal fin
  if (finStyle !== 'paddle') {
    const q = at(0.62);
    ctx.beginPath();
    ctx.moveTo(q.x + hw * 0.08, q.y + hh * 0.52);
    ctx.quadraticCurveTo(q.x - hw * 0.02, q.y + hh * 1.35, q.x - hw * 0.16, q.y + hh * 0.46);
    ctx.closePath();
    ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.8 * o.alpha); ctx.fill();
  }
  // whale/fluke fore-flippers are drawn in front; paddles (plesiosaur) too
  if (finStyle === 'paddle') {
    for (let s = -1; s <= 1; s += 2) {
      const p = at(0.18);
      ctx.save(); ctx.translate(p.x, p.y + s * hh * 0.5); ctx.rotate(s * 0.35);
      ctx.beginPath(); ctx.ellipse(-r * 0.3, 0, r * 0.85, r * 0.24, 0, 0, TAU);
      ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.92 * o.alpha); ctx.fill();
      ctx.lineWidth = Math.max(0.3, r * 0.03);
      ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(6, fc[2] - 22), 0.5 * o.alpha); ctx.stroke();
      ctx.restore();
    }
  }
};

/** Pectoral / pelvic fins and fluke flippers, drawn over the body. */
Vis.drawFinsFront = function (ctx, v, r, pts, ph, o, hw, hh) {
  const finStyle = v.fins || 'full';
  if (finStyle === 'none') return;
  const fc = shade(v.col2, -2, 6);
  const flap = Math.sin(ph * 2.3) * 0.22;
  if (finStyle === 'whale' || finStyle === 'paddle') {
    const p = pts[Math.round(0.26 * (pts.length - 1))];
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(p.x, p.y + s * hh * 0.35);
      ctx.rotate(s * (0.55 + flap * 0.4));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r * 0.3, s * r * 0.9, -r * 1.05, s * r * 1.05);
      ctx.quadraticCurveTo(-r * 0.5, s * r * 0.25, -r * 0.15, s * r * 0.05);
      ctx.closePath();
      ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.94 * o.alpha); ctx.fill();
      ctx.lineWidth = Math.max(0.3, r * 0.025);
      ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(6, fc[2] - 24), 0.5 * o.alpha); ctx.stroke();
      ctx.restore();
    }
    return;
  }
  if (finStyle === 'lobe') {   // fleshy sarcopterygian lobes
    const p = pts[Math.round(0.28 * (pts.length - 1))];
    for (let s = -1; s <= 1; s += 2) {
      this.tapered(ctx, p.x, p.y + s * hh * 0.5, p.x - r * 0.35, p.y + s * hh * 1.5 + flap * r * 0.4 * s,
                   p.x - r * 0.75, p.y + s * hh * 2.0 + flap * r * 0.8 * s,
                   r * 0.22, r * 0.12, fc, 0.94 * o.alpha);
    }
    return;
  }
  // ray fins: pectoral pair + pelvic pair
  const pec = pts[Math.round(0.22 * (pts.length - 1))];
  for (let s = -1; s <= 1; s += 2) {
    ctx.save();
    ctx.translate(pec.x, pec.y + s * hh * 0.42);
    ctx.rotate(s * (0.35 + flap * 0.5));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.15, s * r * 0.65, -r * 0.72, s * r * 0.72);
    ctx.quadraticCurveTo(-r * 0.35, s * r * 0.2, -r * 0.1, s * r * 0.04);
    ctx.closePath();
    ctx.fillStyle = hsl(fc[0], fc[1], Math.min(94, fc[2] + 6), 0.62 * o.alpha); ctx.fill();
    ctx.lineWidth = Math.max(0.25, r * 0.02);
    ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(6, fc[2] - 20), 0.45 * o.alpha); ctx.stroke();
    // fin rays
    if (o.detail && r > 12) for (let i = 1; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(-r * 0.05, s * r * 0.03);
      ctx.lineTo(-r * 0.66 * (i / 4.6), s * r * 0.66 * (i / 4.4));
      ctx.lineWidth = Math.max(0.2, r * 0.014);
      ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(6, fc[2] - 26), 0.3 * o.alpha); ctx.stroke();
    }
    ctx.restore();
  }
  const pel = pts[Math.round(0.46 * (pts.length - 1))];
  for (let s = -1; s <= 1; s += 2) {
    ctx.save(); ctx.translate(pel.x, pel.y + s * hh * 0.55); ctx.rotate(s * (0.7 - flap * 0.3));
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.1, s * r * 0.42, -r * 0.46, s * r * 0.44);
    ctx.quadraticCurveTo(-r * 0.22, s * r * 0.12, -r * 0.05, s * r * 0.02);
    ctx.closePath();
    ctx.fillStyle = hsl(fc[0], fc[1], fc[2], 0.55 * o.alpha); ctx.fill();
    ctx.restore();
  }
};

/** Caudal fin — the single most diagnostic feature of a swimmer. */
Vis.drawTail = function (ctx, v, r, x, y, ang, ph, o) {
  const t = v.tail || 'fork';
  const fc = shade(v.col2, -4, 4);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI);   // +X now points backward
  const S = r * (v.arch === 'giant' ? 1.05 : 0.9);
  const flap = Math.sin(ph * 2.6) * 0.16;
  const fin = (path, alpha) => {
    ctx.beginPath(); path(); ctx.closePath();
    ctx.fillStyle = hsl(fc[0], fc[1], fc[2], alpha * o.alpha); ctx.fill();
    ctx.lineWidth = Math.max(0.3, r * 0.025);
    ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(5, fc[2] - 22), 0.5 * o.alpha); ctx.stroke();
  };
  if (t === 'fluke') {                     // whale: horizontal flukes, drawn as a wide pair
    fin(() => {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(S * 0.5, -S * 0.15 + flap * S, S * 1.25, -S * 0.55 + flap * S);
      ctx.quadraticCurveTo(S * 0.72, -S * 0.05, S * 0.5, S * 0.06);
      ctx.quadraticCurveTo(S * 0.72, S * 0.05, S * 1.25, S * 0.55 + flap * S);
      ctx.quadraticCurveTo(S * 0.5, S * 0.15 + flap * S, 0, 0);
    }, 0.96);
    ctx.beginPath(); ctx.moveTo(S * 0.25, 0); ctx.lineTo(S * 1.05, 0);
    ctx.lineWidth = Math.max(0.3, r * 0.02);
    ctx.strokeStyle = hsl(fc[0], fc[1], Math.max(5, fc[2] - 26), 0.35 * o.alpha); ctx.stroke();
  } else if (t === 'hetero') {             // shark: asymmetric, upper lobe longer
    fin(() => {
      ctx.moveTo(0, -S * 0.16);
      ctx.quadraticCurveTo(S * 0.75, -S * 1.15 + flap * S, S * 1.35, -S * 1.25 + flap * S);
      ctx.quadraticCurveTo(S * 0.8, -S * 0.35, S * 0.42, -S * 0.02);
      ctx.quadraticCurveTo(S * 0.7, S * 0.35, S * 0.72, S * 0.62 + flap * S);
      ctx.quadraticCurveTo(S * 0.3, S * 0.3, 0, S * 0.16);
    }, 0.95);
  } else if (t === 'crescent') {           // lunate: fastest tail in the ocean
    fin(() => {
      ctx.moveTo(0, -S * 0.14);
      ctx.quadraticCurveTo(S * 0.9, -S * 1.0 + flap * S, S * 1.15, -S * 1.35 + flap * S);
      ctx.quadraticCurveTo(S * 0.62, -S * 0.25, S * 0.5, 0);
      ctx.quadraticCurveTo(S * 0.62, S * 0.25, S * 1.15, S * 1.35 + flap * S);
      ctx.quadraticCurveTo(S * 0.9, S * 1.0 + flap * S, 0, S * 0.14);
    }, 0.95);
  } else if (t === 'fork') {
    fin(() => {
      ctx.moveTo(0, -S * 0.14);
      ctx.quadraticCurveTo(S * 0.7, -S * 0.75 + flap * S, S * 1.1, -S * 0.95 + flap * S);
      ctx.quadraticCurveTo(S * 0.6, -S * 0.1, S * 0.42, 0);
      ctx.quadraticCurveTo(S * 0.6, S * 0.1, S * 1.1, S * 0.95 + flap * S);
      ctx.quadraticCurveTo(S * 0.7, S * 0.75 + flap * S, 0, S * 0.14);
    }, 0.92);
  } else if (t === 'round') {
    fin(() => { ctx.moveTo(0, -S * 0.2);
      ctx.quadraticCurveTo(S * 1.0, -S * 0.72, S * 1.0, 0);
      ctx.quadraticCurveTo(S * 1.0, S * 0.72, 0, S * 0.2); }, 0.9);
  } else if (t === 'ribbon' || t === 'whip') {   // eel / gulper: long ribbon
    fin(() => { ctx.moveTo(0, -S * 0.3);
      ctx.quadraticCurveTo(S * 2.4, -S * 0.22 + flap * S, S * 3.4, 0);
      ctx.quadraticCurveTo(S * 2.4, S * 0.22 + flap * S, 0, S * 0.3); }, 0.85);
  } else if (t === 'short') {
    fin(() => { ctx.moveTo(0, -S * 0.2); ctx.lineTo(S * 0.55, -S * 0.1);
                ctx.lineTo(S * 0.55, S * 0.1); ctx.lineTo(0, S * 0.2); }, 0.9);
  } else {  // continuous median fin (eels, lancelets)
    fin(() => { ctx.moveTo(-S * 0.2, -S * 0.5);
      ctx.quadraticCurveTo(S * 0.8, -S * 0.5, S * 1.2, 0);
      ctx.quadraticCurveTo(S * 0.8, S * 0.5, -S * 0.2, S * 0.5); }, 0.8);
  }
  ctx.restore();
};

/** Snout, bill, melon, blowhole, gill slits, ampullae, lateral line. */
Vis.drawHead = function (ctx, v, r, ph, o, hx, hy, hw, hh) {
  const c = v.col;
  if (v.bill) {   // swordfish rostrum
    ctx.beginPath();
    ctx.moveTo(hx + hw * 0.02, hy - hh * 0.1); ctx.lineTo(hx + r * 1.5, hy - hh * 0.02);
    ctx.lineTo(hx + r * 1.5, hy + hh * 0.06); ctx.lineTo(hx + hw * 0.02, hy + hh * 0.16);
    ctx.closePath();
    ctx.fillStyle = hsl(c[0], c[1] * 0.5, Math.max(8, c[2] - 22), o.alpha); ctx.fill();
  }
  if (v.snout === 'rostral') {   // goblin shark: protruding pre-snout
    ctx.beginPath();
    ctx.moveTo(hx - hw * 0.02, hy - hh * 0.5);
    ctx.quadraticCurveTo(hx + r * 0.85, hy - hh * 0.42, hx + r * 1.0, hy - hh * 0.05);
    ctx.quadraticCurveTo(hx + r * 0.6, hy + hh * 0.1, hx - hw * 0.02, hy + hh * 0.2);
    ctx.closePath();
    ctx.fillStyle = hsl(c[0], c[1], c[2] - 4, 0.95 * o.alpha); ctx.fill();
  }
  if (v.melon) {   // odontocete acoustic forehead
    ctx.beginPath();
    ctx.moveTo(hx - hw * 0.02, hy - hh * 0.85);
    ctx.quadraticCurveTo(hx + r * 0.62, hy - hh * 1.0, hx + r * 0.6, hy + hh * 0.1);
    ctx.quadraticCurveTo(hx + r * 0.2, hy + hh * 0.35, hx - hw * 0.02, hy + hh * 0.25);
    ctx.closePath();
    ctx.fillStyle = hsl(c[0], c[1] * 0.8, Math.min(96, c[2] + 6), 0.9 * o.alpha); ctx.fill();
  }
  // blowhole
  if (v.fins === 'whale' || v.tail === 'fluke') {
    ctx.beginPath(); ctx.ellipse(hx - hw * 0.06, hy - hh * 0.78, r * 0.11, r * 0.045, -0.2, 0, TAU);
    ctx.fillStyle = hsl(c[0], c[1], Math.max(5, c[2] - 34), 0.85 * o.alpha); ctx.fill();
  }
  // gill slits
  if (v.fins === 'shark' || v.mouth === 'disc') {
    const n = v.arch === 'giant' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const x = hx - hw * 0.06 - i * r * 0.13;
      ctx.beginPath();
      ctx.moveTo(x, hy - hh * 0.42); ctx.quadraticCurveTo(x - r * 0.05, hy, x, hy + hh * 0.4);
      ctx.lineWidth = Math.max(0.35, r * 0.03);
      ctx.strokeStyle = hsl(c[0], c[1], Math.max(5, c[2] - 30), 0.5 * o.alpha); ctx.stroke();
    }
  }
  // ampullae of Lorenzini: speckled electroreceptor pores on the snout
  if (v.ampullae && o.detail) {
    const rr = mulberry32(o.seed + 21);
    for (let i = 0; i < 18; i++) {
      ctx.beginPath();
      ctx.arc(hx + rr() * r * 0.5 - r * 0.1, hy + (rr() - 0.5) * hh * 1.1, Math.max(0.3, r * 0.018), 0, TAU);
      ctx.fillStyle = hsl(c[0], c[1], Math.max(5, c[2] - 32), 0.5 * o.alpha); ctx.fill();
    }
  }
  // lateral line
  if (v.latline !== false && o.detail && (v.arch === 'fish' || v.arch === 'giant')) {
    ctx.beginPath();
    ctx.moveTo(hx - hw * 0.2, hy - hh * 0.05);
    ctx.quadraticCurveTo(0, hy - hh * 0.12, -hw * 0.88, hy - hh * 0.02);
    ctx.lineWidth = Math.max(0.3, r * 0.02);
    ctx.strokeStyle = hsl(c[0], c[1], Math.max(5, c[2] - 26), 0.3 * o.alpha); ctx.stroke();
  }
  // orca facial patch + saddle
  if (v.patch) {
    ctx.beginPath();
    ctx.ellipse(hx - hw * 0.05, hy - hh * 0.34, r * 0.24, r * 0.11, -0.3, 0, TAU);
    ctx.fillStyle = hsl(0, 0, 98, 0.95 * o.alpha); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx - hw * 0.12, hy + hh * 0.42, r * 0.2, r * 0.09, 0.2, 0, TAU);
    ctx.fillStyle = hsl(0, 0, 98, 0.9 * o.alpha); ctx.fill();
  }
  if (v.saddle) {
    ctx.beginPath();
    ctx.ellipse(-hw * 0.3, -hh * 0.72, r * 0.34, r * 0.14, -0.1, 0, Math.PI);
    ctx.fillStyle = hsl(0, 0, 96, 0.5 * o.alpha); ctx.fill();
  }
  // plesiosaur neck
  if (v.neck) {
    ctx.beginPath();
    ctx.moveTo(hx - hw * 0.05, hy - hh * 0.5);
    ctx.quadraticCurveTo(hx + r * 1.1, hy - hh * 0.9, hx + r * 1.5, hy - hh * 0.2);
    ctx.quadraticCurveTo(hx + r * 1.05, hy + hh * 0.1, hx - hw * 0.05, hy + hh * 0.5);
    ctx.closePath();
    ctx.fillStyle = hsl(c[0], c[1], c[2], 0.95 * o.alpha); ctx.fill();
  }
};

/** Mouth + teeth. Called by every archetype that has a head end. */
Vis.mouth = function (ctx, v, r, x, y, o, ang, hw) {
  const m = v.mouth || 'none';
  const c = v.col;
  if (m === 'none' && !(v.teeth > 0)) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
  const W = r * (m === 'wide' || m === 'baleen' ? 0.95 : m === 'disc' ? 0.44 : 0.6);
  const dark = hsl(c[0], c[1] * 0.8, Math.max(4, c[2] - 40), 0.85 * o.alpha);
  if (m === 'disc') {          // lamprey sucker
    ctx.beginPath(); ctx.arc(0, 0, W, 0, TAU);
    ctx.fillStyle = hsl(8, 44, 40, 0.8 * o.alpha); ctx.fill();
    ctx.lineWidth = Math.max(0.3, r * 0.05); ctx.strokeStyle = dark; ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * W * 0.55, Math.sin(a) * W * 0.55);
      ctx.lineTo(Math.cos(a) * W * 0.95, Math.sin(a) * W * 0.95);
      ctx.lineWidth = Math.max(0.25, r * 0.035);
      ctx.strokeStyle = hsl(48, 30, 88, 0.7 * o.alpha); ctx.stroke();
    }
  } else if (m === 'baleen') { // baleen whale: open mouth with fringed plates
    ctx.beginPath();
    ctx.moveTo(-W * 0.1, -W * 0.36); ctx.quadraticCurveTo(W * 1.05, -W * 0.1, W * 0.98, W * 0.2);
    ctx.quadraticCurveTo(W * 0.5, W * 0.42, -W * 0.1, W * 0.34); ctx.closePath();
    ctx.fillStyle = hsl(200, 20, 26, 0.8 * o.alpha); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      ctx.beginPath();
      ctx.moveTo(W * (0.05 + t * 0.85), -W * 0.3 + t * W * 0.1);
      ctx.lineTo(W * (0.05 + t * 0.85) + W * 0.05, W * 0.3 - t * W * 0.05);
      ctx.lineWidth = Math.max(0.3, r * 0.028);
      ctx.strokeStyle = hsl(30, 14, 82, 0.75 * o.alpha); ctx.stroke();
    }
  } else {
    // gape line
    ctx.beginPath();
    if (m === 'wide') {
      ctx.moveTo(-W * 0.15, -W * 0.2); ctx.quadraticCurveTo(W * 0.9, -W * 0.12, W, W * 0.18);
      ctx.quadraticCurveTo(W * 0.45, W * 0.42, -W * 0.15, W * 0.24); ctx.closePath();
      ctx.fillStyle = hsl(350, 34, 24, 0.72 * o.alpha); ctx.fill();
    } else {
      ctx.moveTo(-W * 0.4, 0); ctx.quadraticCurveTo(W * 0.4, W * 0.18, W, W * 0.02);
      ctx.lineWidth = Math.max(0.35, r * 0.045); ctx.strokeStyle = dark; ctx.stroke();
    }
    // teeth
    const tn = v.teeth || 0;
    if (tn > 0) {
      const rows = tn;
      for (let i = 0; i < 5 + rows * 3; i++) {
        const t = i / (4 + rows * 3);
        const tx = lerp(-W * 0.3, W * 0.96, t);
        const ty = m === 'wide' ? lerp(-W * 0.16, W * 0.16, t) : W * 0.03 + t * W * 0.1;
        const h = r * (0.06 + rows * 0.035) * (1 - Math.abs(t - 0.5) * 0.5);
        ctx.beginPath();
        ctx.moveTo(tx - h * 0.32, ty); ctx.lineTo(tx, ty + h); ctx.lineTo(tx + h * 0.32, ty);
        ctx.closePath();
        ctx.fillStyle = hsl(48, 22, 94, (0.7 + rows * 0.08) * o.alpha); ctx.fill();
        if (rows >= 3) {   // serration hint on the biggest teeth
          ctx.beginPath(); ctx.moveTo(tx - h * 0.32, ty); ctx.lineTo(tx, ty + h);
          ctx.lineWidth = Math.max(0.2, r * 0.012);
          ctx.strokeStyle = hsl(40, 20, 70, 0.5 * o.alpha); ctx.stroke();
        }
      }
    }
    // gill rakers for filter feeders
    if (v.rakers) {
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        ctx.beginPath();
        ctx.moveTo(lerp(-W * 0.2, W * 0.9, t), -W * 0.16);
        ctx.lineTo(lerp(-W * 0.2, W * 0.9, t), W * 0.24);
        ctx.lineWidth = Math.max(0.25, r * 0.018);
        ctx.strokeStyle = hsl(40, 20, 86, 0.55 * o.alpha); ctx.stroke();
      }
    }
  }
  ctx.restore();
};

/** Camera eyes (vertebrates) or simple eyespots (invertebrates). */
Vis.eyeCluster = function (ctx, v, r, x, y, o, scale) {
  const n = v.eyes || 0;
  if (n <= 0) return;
  scale = scale || 1;
  for (let i = 0; i < n; i++) {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * r * 0.42;
    const ex = x - off * 0.55, ey = y + off * 0.18 - (n > 1 ? r * 0.05 : 0);
    const er = r * (v.arch === 'giant' ? 0.115 : 0.135) * scale;
    if (v.compound) {   // arthropod compound eye
      ctx.beginPath(); ctx.arc(ex, ey, er * 1.25, 0, TAU);
      ctx.fillStyle = hsl(20, 60, 34, 0.95 * o.alpha); ctx.fill();
      if (o.detail && er > 2) for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU;
        ctx.beginPath(); ctx.arc(ex + Math.cos(a) * er * 0.55, ey + Math.sin(a) * er * 0.55, er * 0.3, 0, TAU);
        ctx.fillStyle = hsl(28, 66, 52, 0.5 * o.alpha); ctx.fill();
      }
      continue;
    }
    // sclera
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU);
    ctx.fillStyle = hsl(48, 20, 94, 0.96 * o.alpha); ctx.fill();
    // iris
    ctx.beginPath(); ctx.arc(ex + er * 0.18, ey, er * 0.66, 0, TAU);
    ctx.fillStyle = hsl(v.eyeCol || 205, 52, 34, 0.95 * o.alpha); ctx.fill();
    // pupil
    ctx.beginPath(); ctx.arc(ex + er * 0.22, ey, er * 0.32, 0, TAU);
    ctx.fillStyle = hsl(220, 30, 6, o.alpha); ctx.fill();
    // specular
    ctx.beginPath(); ctx.arc(ex + er * 0.02, ey - er * 0.34, er * 0.2, 0, TAU);
    ctx.fillStyle = `hsla(0 0% 100% / ${0.85 * o.alpha})`; ctx.fill();
    if (o.detail && er > 2.5) {
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU);
      ctx.lineWidth = Math.max(0.25, er * 0.16);
      ctx.strokeStyle = hsl(v.col2[0], v.col2[1], Math.max(5, v.col2[2] - 30), 0.6 * o.alpha); ctx.stroke();
    }
    if (v.glowEye) {
      ctx.beginPath(); ctx.arc(ex, ey, er * 1.8, 0, TAU);
      ctx.fillStyle = `hsla(186 100% 70% / ${0.16 * o.alpha})`; ctx.fill();
    }
  }
};

/** Stripes, spots, plates, photophores, grooves — clipped inside the body. */
Vis.drawPattern = function (ctx, v, r, ph, o, hw, hh) {
  const c = v.col, c2 = v.col2;
  if (v.stripes) {
    const n = v.stripes * 3;
    for (let i = 0; i < n; i++) {
      const x = -hw + (i / n) * hw * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, -hh * 1.4); ctx.quadraticCurveTo(x - hh * 0.4, 0, x - hh * 0.15, hh * 1.4);
      ctx.lineWidth = Math.max(0.5, hh * (0.16 - i % 2 * 0.05));
      ctx.strokeStyle = hsl(c2[0], c2[1], c2[2], 0.3 * o.alpha); ctx.stroke();
    }
  }
  if (v.spots) {
    const rr = mulberry32(o.seed + 17), n = v.spots * 16;
    for (let i = 0; i < n; i++) {
      const x = (rr() - 0.5) * hw * 2, y = (rr() - 0.5) * hh * 2;
      ctx.beginPath(); ctx.arc(x, y, r * (0.045 + rr() * 0.075), 0, TAU);
      ctx.fillStyle = hsl(rr() * 40 + 190, 26, 88, 0.55 * o.alpha); ctx.fill();
    }
  }
  if (v.plates) {
    const n = v.plates * 4;
    for (let i = 0; i < n; i++) {
      const x = -hw * 0.9 + (i / n) * hw * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, -hh * 1.2); ctx.lineTo(x + hw * 0.16, -hh * 1.2);
      ctx.lineTo(x + hw * 0.1, hh * 1.2); ctx.lineTo(x - hw * 0.06, hh * 1.2);
      ctx.closePath();
      ctx.fillStyle = hsl(c2[0], c2[1] * 0.7, Math.max(8, c2[2] - 8), 0.22 * o.alpha); ctx.fill();
      ctx.lineWidth = Math.max(0.3, r * 0.02);
      ctx.strokeStyle = hsl(c2[0], c2[1], Math.max(5, c2[2] - 24), 0.3 * o.alpha); ctx.stroke();
    }
  }
  if (v.scales && o.detail) {
    for (let i = 0; i < 9; i++) for (let j = -2; j <= 2; j++) {
      const x = -hw * 0.75 + i * hw * 0.19, y = j * hh * 0.34 + (i % 2 ? hh * 0.17 : 0);
      ctx.beginPath(); ctx.arc(x, y, hh * 0.19, 0.2, Math.PI - 0.2);
      ctx.lineWidth = Math.max(0.25, r * 0.016);
      ctx.strokeStyle = hsl(c2[0], c2[1], Math.min(96, c2[2] + 12), 0.16 * o.alpha); ctx.stroke();
    }
  }
  if (v.photophores) {
    const n = v.photophores * 7;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = hw * 0.7 - t * hw * 1.7;
      const y = hh * 0.5 * Math.sin(t * 3.4) + hh * 0.35;
      const pulse = 0.55 + 0.45 * Math.sin(ph * 2.4 + i * 1.7);
      ctx.beginPath(); ctx.arc(x, y, r * 0.055, 0, TAU);
      ctx.fillStyle = hsl(186, 100, 76, 0.9 * pulse * o.alpha); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU);
      ctx.fillStyle = hsl(186, 100, 70, 0.16 * pulse * o.alpha); ctx.fill();
    }
  }
  if (v.grooves) {   // baleen whale ventral pleats
    const n = v.grooves * 9;
    for (let i = 0; i < n; i++) {
      const y = -hh * 0.05 + (i / n) * hh * 1.25;
      ctx.beginPath();
      ctx.moveTo(hw * 0.72, y * 0.85); ctx.quadraticCurveTo(-hw * 0.1, y * 1.12, -hw * 0.8, y * 0.9);
      ctx.lineWidth = Math.max(0.35, r * 0.022);
      ctx.strokeStyle = hsl(c2[0], c2[1] * 0.7, Math.max(6, c2[2] - 22), 0.28 * o.alpha); ctx.stroke();
    }
  }
  if (v.notochord && o.detail) {
    ctx.beginPath(); ctx.moveTo(hw * 0.7, -hh * 0.05); ctx.lineTo(-hw * 0.95, -hh * 0.05);
    ctx.lineWidth = Math.max(0.5, r * 0.07);
    ctx.strokeStyle = hsl(52, 40, 78, 0.35 * o.alpha); ctx.stroke();
    // myomere blocks
    for (let i = 0; i < 10; i++) {
      const x = hw * 0.6 - i * hw * 0.17;
      ctx.beginPath(); ctx.moveTo(x, -hh * 0.9); ctx.quadraticCurveTo(x - hh * 0.35, 0, x, hh * 0.9);
      ctx.lineWidth = Math.max(0.3, r * 0.02);
      ctx.strokeStyle = hsl(c2[0], c2[1], Math.max(6, c2[2] - 14), 0.22 * o.alpha); ctx.stroke();
    }
  }
};

/** Flagella, cilia, spikes, tentacles for the single-cell archetypes. */
Vis.drawAppendages = function (ctx, v, r, ph, o, hw, hh) {
  const c2 = v.col2;
  if (v.flag) {
    for (let f = 0; f < v.flag; f++) {
      const side = v.flag === 1 ? 0 : (f ? 1 : -1);
      const len = r * (2.2 + f * 0.4);
      ctx.beginPath();
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = -hw * 0.9 - t * len;
        const y = side * hh * 0.3 + Math.sin(t * 7.5 - ph * 6 + f) * r * 0.3 * t;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineWidth = Math.max(0.35, r * 0.075);
      ctx.strokeStyle = hsl(c2[0], c2[1], Math.min(94, c2[2] + 16), 0.75 * o.alpha);
      ctx.lineCap = 'round'; ctx.stroke();
      // mastigonemes (hairy flagella)
      if (o.detail && r > 9 && v.flag > 1) for (let i = 2; i < steps; i += 3) {
        const t = i / steps;
        const x = -hw * 0.9 - t * len, y = side * hh * 0.3 + Math.sin(t * 7.5 - ph * 6 + f) * r * 0.3 * t;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * 0.05, y - r * 0.18);
        ctx.lineWidth = Math.max(0.2, r * 0.02);
        ctx.strokeStyle = hsl(c2[0], c2[1], c2[2] + 20, 0.35 * o.alpha); ctx.stroke();
      }
    }
  }
  if (v.cilia) {
    const n = v.cilia * 26;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      const x0 = Math.cos(a) * hw * 0.99, y0 = Math.sin(a) * hh * 0.99;
      const beat = Math.sin(ph * 7 + a * 6) * 0.5;
      const L = r * 0.3;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a + beat) * L, y0 + Math.sin(a + beat) * L);
      ctx.lineWidth = Math.max(0.22, r * 0.028);
      ctx.strokeStyle = hsl(c2[0], c2[1], Math.min(95, c2[2] + 22), 0.5 * o.alpha);
      ctx.stroke();
    }
  }
  if (v.spikes) {
    const n = v.spikes * 9;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + ph * 0.05;
      const x0 = Math.cos(a) * hw * 0.95, y0 = Math.sin(a) * hh * 0.95;
      const L = r * (0.28 + (i % 3) * 0.1);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L);
      ctx.lineWidth = Math.max(0.3, r * 0.05);
      ctx.strokeStyle = hsl(12, 52, 62, 0.7 * o.alpha); ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  if (v.pseudopods) {
    for (let i = 0; i < 4; i++) {
      const a = ph * 0.35 + i * TAU / 4;
      const L = r * (0.5 + 0.35 * Math.sin(ph * 0.9 + i * 2));
      this.tapered(ctx, Math.cos(a) * hw * 0.7, Math.sin(a) * hh * 0.7,
                   Math.cos(a + 0.3) * (hw + L * 0.6), Math.sin(a + 0.3) * (hh + L * 0.6),
                   Math.cos(a + 0.5) * (hw + L), Math.sin(a + 0.5) * (hh + L),
                   r * 0.24, r * 0.03, shade(v.col, 4, -2), 0.7 * o.alpha);
    }
  }
  if (v.tentacles && v.arch !== 'medusa' && v.arch !== 'plant') {
    const n = v.tentacles;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const a = lerp(-0.85, 0.85, t);
      const sway = Math.sin(ph * 1.9 + i * 0.8) * r * 0.16;
      const L = r * (1.1 + 0.5 * Math.sin(i * 1.3));
      this.tapered(ctx, hw * 0.6, Math.sin(a) * hh * 0.7,
                   hw * 0.6 + L * 0.55, Math.sin(a) * hh * 0.9 + sway,
                   hw * 0.6 + L, Math.sin(a) * hh * 1.1 + sway * 2.2,
                   r * 0.09, r * 0.015, shade(c2, 8, 8), 0.72 * o.alpha);
    }
  }
  if (v.fleck) {   // amorphous organic debris
    const rr = mulberry32(o.seed + 31);
    for (let i = 0; i < 7; i++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * Math.max(hw, hh) * 0.8;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.06 + rr() * 0.14), 0, TAU);
      ctx.fillStyle = hsl(v.col2[0], v.col2[1], Math.max(8, v.col2[2] - 14), 0.45 * o.alpha);
      ctx.fill();
    }
  }
  if (v.house) {   // larvacean mucus house
    ctx.beginPath(); ctx.ellipse(0, 0, hw * 1.9, hh * 2.1, 0, 0, TAU);
    ctx.strokeStyle = hsl(190, 40, 82, 0.24 * o.alpha);
    ctx.lineWidth = Math.max(0.3, r * 0.03); ctx.stroke();
  }
  if (v.frustule) { /* handled in archDiatom */ }
};

/** Organelles — the "cellular structure" the brief asks for. */
Vis.drawOrganelles = function (ctx, v, r, ph, o, hw, hh, density) {
  const list = v.organelles;
  if (!list || !list.length || !o.detail) return;
  const rr = mulberry32(o.seed + 13);
  const drift = o.animate ? ph : ph * 0;    // animated only for the player
  for (let i = 0; i < list.length; i++) {
    const kind = list[i];
    const x = (rr() - 0.5) * hw * 1.2 * density + Math.sin(drift * 0.3 + i * 2) * hw * 0.05;
    const y = (rr() - 0.5) * hh * 1.2 * density + Math.cos(drift * 0.24 + i * 1.6) * hh * 0.05;
    const s = r * 0.2;
    switch (kind) {
      case 'nucleus': case 'macronuc': {
        const R = s * (kind === 'macronuc' ? 1.5 : 1.25);
        ctx.beginPath(); ctx.arc(x, y, R, 0, TAU);
        const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
        g.addColorStop(0, hsl(268, 34, 84, 0.8 * o.alpha));
        g.addColorStop(1, hsl(272, 40, 56, 0.72 * o.alpha));
        ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = Math.max(0.25, R * 0.12);
        ctx.strokeStyle = hsl(274, 44, 42, 0.6 * o.alpha); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + R * 0.22, y - R * 0.18, R * 0.34, 0, TAU);
        ctx.fillStyle = hsl(280, 40, 40, 0.55 * o.alpha); ctx.fill();   // nucleolus
        break;
      }
      case 'micronuc':
        ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU);
        ctx.fillStyle = hsl(286, 38, 62, 0.8 * o.alpha); ctx.fill(); break;
      case 'mito': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rr() * TAU);
        const R = s * 1.05;
        ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.5, 0, 0, TAU);
        ctx.fillStyle = hsl(18, 62, 62, 0.78 * o.alpha); ctx.fill();
        ctx.lineWidth = Math.max(0.22, R * 0.13);
        ctx.strokeStyle = hsl(10, 58, 42, 0.7 * o.alpha); ctx.stroke();
        for (let k = -2; k <= 2; k++) {   // cristae
          ctx.beginPath(); ctx.moveTo(k * R * 0.32, -R * 0.42);
          ctx.quadraticCurveTo(k * R * 0.32 + R * 0.14, 0, k * R * 0.32, R * 0.42);
          ctx.lineWidth = Math.max(0.2, R * 0.1);
          ctx.strokeStyle = hsl(10, 52, 38, 0.55 * o.alpha); ctx.stroke();
        }
        ctx.restore(); break;
      }
      case 'chloroplast': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rr() * TAU);
        const R = s * 1.0;
        ctx.beginPath(); ctx.ellipse(0, 0, R, R * 0.62, 0, 0, TAU);
        ctx.fillStyle = hsl(104, 54, 46, 0.8 * o.alpha); ctx.fill();
        for (let k = -1; k <= 1; k++) {   // thylakoid stacks (grana)
          ctx.beginPath(); ctx.ellipse(k * R * 0.42, 0, R * 0.16, R * 0.4, 0, 0, TAU);
          ctx.fillStyle = hsl(118, 58, 32, 0.6 * o.alpha); ctx.fill();
        }
        ctx.restore(); break;
      }
      case 'thylakoid': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rr() * TAU);
        for (let k = 0; k < 4; k++) {
          ctx.beginPath(); ctx.ellipse(0, (k - 1.5) * s * 0.28, s * 1.1, s * 0.13, 0, 0, TAU);
          ctx.fillStyle = hsl(140, 50, 40 + k * 4, 0.6 * o.alpha); ctx.fill();
        }
        ctx.restore(); break;
      }
      case 'vacuole': {
        const R = s * (0.8 + rr() * 0.5);
        ctx.beginPath(); ctx.arc(x, y, R, 0, TAU);
        ctx.fillStyle = hsl(196, 60, 74, 0.32 * o.alpha); ctx.fill();
        ctx.lineWidth = Math.max(0.22, R * 0.1);
        ctx.strokeStyle = hsl(196, 62, 86, 0.5 * o.alpha); ctx.stroke();
        ctx.beginPath(); ctx.arc(x - R * 0.3, y - R * 0.3, R * 0.22, 0, TAU);
        ctx.fillStyle = hsl(0, 0, 100, 0.4 * o.alpha); ctx.fill();
        break;
      }
      case 'granule':
        for (let k = 0; k < 3; k++) {
          ctx.beginPath(); ctx.arc(x + (rr() - 0.5) * s, y + (rr() - 0.5) * s, s * 0.22, 0, TAU);
          ctx.fillStyle = hsl(46, 66, 66, 0.7 * o.alpha); ctx.fill();
        }
        break;
      case 'eyespot':
        ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU);
        ctx.fillStyle = hsl(14, 78, 52, 0.85 * o.alpha); ctx.fill(); break;
      case 'brain':
        ctx.beginPath(); ctx.ellipse(x, y, s * 0.9, s * 0.6, 0, 0, TAU);
        ctx.fillStyle = hsl(330, 30, 76, 0.6 * o.alpha); ctx.fill();
        ctx.lineWidth = Math.max(0.2, s * 0.1);
        ctx.strokeStyle = hsl(330, 34, 54, 0.5 * o.alpha); ctx.stroke(); break;
    }
  }
};

/* ============================================================================
   5c. SPRITE CACHE — prerender a spec once, blit it many times
   ========================================================================== */
const Sprites = {
  cache: new Map(),
  cap: 260,
  /** Padding around the body so appendages are not clipped. */
  pad(r) { return r * 2.0 + 6; },
  /** Quantise the radius into buckets so the cache actually hits. */
  bucket(r) { return r < 10 ? Math.round(r * 2) / 2 : r < 40 ? Math.round(r) : Math.round(r / 3) * 3; },
  key(id, r, dim, detail) {
    return id + '|' + this.bucket(r) + '|' + dim.toFixed(2) + '|' + (detail ? 1 : 0);
  },
  get(id, vis, r, dim, detail, seed) {
    const k = this.key(id, r, dim, detail);
    let s = this.cache.get(k);
    if (s) return s;
    if (this.cache.size > this.cap) this.cache.clear();     // simple bounded cache
    const rb = this.bucket(r);
    r = rb;
    const pad = this.pad(r);
    const size = Math.max(8, Math.ceil(pad * 2));
    const maxSide = 320;                                    // clamp huge leviathans
    const sc = size > maxSide ? maxSide / size : 1;
    const cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.ceil(size * sc));
    cv.height = Math.max(8, Math.ceil(size * sc));
    const c = cv.getContext('2d');
    // map sprite space (size×size, centred) onto the canvas
    c.setTransform(sc, 0, 0, sc, cv.width * 0.5, cv.height * 0.5);
    Vis.body(c, vis, r, 0.6, { detail, dim, alpha: 1, seed: seed | 0 });
    s = { cv, size, sc, pad, r };   // r = the reference radius this was drawn at
    this.cache.set(k, s);
    return s;
  },
};

/**
 * THE entry point. Draws one organism in local space, facing +X.
 * opts: { detail, dim (0..1 light available), alpha, seed, glow, animate, phase }
 */
Vis.body = function (ctx, v, r, phase, opts) {
  const o = opts || {};
  o.detail = o.detail === undefined ? r > 4 : o.detail;
  o.dim = o.dim || 0;
  o.alpha = o.alpha === undefined ? 1 : o.alpha;
  o.seed = o.seed || 1;
  if (v.translucent) o.alpha *= 0.68;      // gelatinous / larval transparency

  // Deep water desaturates and darkens everything that is not bioluminescent.
  if (o.dim > 0 && !v.silhouette) {
    v = Object.assign({}, v, {
      col: [v.col[0], v.col[1] * (1 - o.dim * 0.55), v.col[2] * (1 - o.dim * 0.72)],
      col2:[v.col2[0], v.col2[1] * (1 - o.dim * 0.55), v.col2[2] * (1 - o.dim * 0.72)],
    });
  }

  // Bioluminescent halo (deep-zone creatures and photophore bearers)
  if (v.glow || v.photophores) {
    const gr = r * (v.glow ? 2.5 : 1.9);
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, gr);
    const gh = v.glowCol || 186;
    g.addColorStop(0, hsl(gh, 100, 70, 0.30 * o.alpha));
    g.addColorStop(0.4, hsl(gh, 100, 62, 0.10 * o.alpha));
    g.addColorStop(1, hsl(gh, 100, 60, 0));
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fillStyle = g; ctx.fill();
  }

  const box = this.drawArch(ctx, v, r, phase, o) || { hw: r, hh: r };

  // armour over the top of everything
  if (v.armor && !v.silhouette) {
    ctx.save();
    this.blobPath(ctx, box.hw * 1.02, box.hh * 1.02, 24, 0, 0, 0);
    ctx.lineWidth = Math.max(0.5, r * 0.1 * v.armor);
    ctx.strokeStyle = hsl(38, 22, 74, 0.22 * o.alpha);
    ctx.stroke();
    ctx.restore();
  }
  if (!v.silhouette) this.drawAppendages(ctx, v, r, phase, o, box.hw, box.hh);
  return box;
};

/**
 * Draw a cached sprite. `scale` must map the sprite's own pixel space back to
 * world units: scale = (wantedRadius / spriteReferenceRadius) / spr.sc
 */
Vis.blit = function (ctx, spr, x, y, ang, scale) {
  const s = spr.size;
  ctx.save();
  ctx.translate(x, y);
  if (ang) ctx.rotate(ang);
  ctx.scale(scale, scale);
  ctx.drawImage(spr.cv, -s * 0.5, -s * 0.5, s, s);
  ctx.restore();
};
