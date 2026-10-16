
/* ============================================================================
   4. SOUND ENGINE — everything synthesised, no audio files
   ----------------------------------------------------------------------------
   Lazy AudioContext (created on the first user gesture to satisfy autoplay
   policies). A tiny algorithmic reverb (synthesised impulse response) gives
   the ocean a sense of volume. Ambient bed = looping brown noise through a
   moving lowpass + a 55 Hz drone; its brightness falls as you descend.
   ========================================================================== */
const Sound = {
  ctx:null, master:null, wet:null, dry:null, ready:false, muted:false,
  amb:null, ambFilter:null, drone:null, droneGain:null, noiseBuf:null,
  bubbleTimer:0, lastDepthT:0,

  /** Create the graph. Safe to call repeatedly; no-ops if unsupported. */
  init() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); } catch (e) { return false; }
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : CFG.MASTER;
    // gentle limiter so stacked SFX never clip
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 8;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master.connect(comp); comp.connect(c.destination);

    this.dry = c.createGain(); this.dry.gain.value = 1; this.dry.connect(this.master);
    this.wet = c.createGain(); this.wet.gain.value = 1; this.wet.connect(this.master);
    const conv = c.createConvolver(); conv.buffer = this._impulse(2.6, 2.4);
    conv.connect(this.wet);
    this.revSend = c.createGain(); this.revSend.gain.value = 1; this.revSend.connect(conv);

    this.noiseBuf = this._noise(2.5, 'brown');
    this.ready = true;
    return true;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : CFG.MASTER, this.ctx.currentTime, 0.05);
    return this.muted;
  },

  /* ---- buffers ---------------------------------------------------------- */
  _noise(dur, type) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  },
  /** Synthesised exponentially-decaying noise = a plausible small-space reverb. */
  _impulse(dur, decay) {
    const c = this.ctx, rate = c.sampleRate, n = Math.floor(rate * dur);
    const buf = c.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.3);
      }
    }
    return buf;
  },

  /* ---- primitives ------------------------------------------------------- */
  /** One-shot oscillator voice. */
  tone(o) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 !== undefined) {
      if (o.exp !== false) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + o.dur);
      else osc.frequency.linearRampToValueAtTime(o.f1, t0 + o.dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.2), t0 + (o.atk || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    if (o.hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = o.hp; node.connect(f); node = f; }
    node.connect(g); g.connect(this.dry);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revSend); }
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  },
  /** One-shot filtered noise burst. */
  noiseBurst(o) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 900, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    f.Q.value = o.q === undefined ? 1.1 : o.q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain || 0.15), t0 + (o.atk || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(this.dry);
    if (o.rev) { const s = c.createGain(); s.gain.value = o.rev; g.connect(s); s.connect(this.revSend); }
    src.start(t0, Math.random() * 2); src.stop(t0 + o.dur + 0.05);
  },

  /* ---- ambient bed ------------------------------------------------------ */
  startAmbient() {
    if (!this.init() || this.amb) return;
    const c = this.ctx;
    // brown-noise water
    this.amb = c.createBufferSource(); this.amb.buffer = this.noiseBuf; this.amb.loop = true;
    this.ambFilter = c.createBiquadFilter(); this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = 620; this.ambFilter.Q.value = 0.7;
    const ambG = c.createGain(); ambG.gain.value = 0.30;
    this.ambGain = ambG;
    this.amb.connect(this.ambFilter); this.ambFilter.connect(ambG); ambG.connect(this.dry);
    const rs = c.createGain(); rs.gain.value = 0.5; ambG.connect(rs); rs.connect(this.revSend);
    this.amb.start(0, Math.random() * 2);
    // slow filter LFO = shifting water movement
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.055;
    const lfoG = c.createGain(); lfoG.gain.value = 190;
    lfo.connect(lfoG); lfoG.connect(this.ambFilter.frequency); lfo.start();
    this.lfo = lfo;
    // deep drone
    this.drone = c.createOscillator(); this.drone.type = 'sine'; this.drone.frequency.value = 55;
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0.055;
    this.drone.connect(this.droneGain); this.droneGain.connect(this.dry);
    this.drone.start();
    // second, slightly detuned drone for a beating, alive quality
    this.drone2 = c.createOscillator(); this.drone2.type = 'sine'; this.drone2.frequency.value = 55.7;
    const d2g = c.createGain(); d2g.gain.value = 0.035;
    this.drone2.connect(d2g); d2g.connect(this.dry); this.drone2.start();
  },
  /** Called each frame with normalised depth 0..1 — darker water = darker sound. */
  setDepth(t) {
    if (!this.ready || Math.abs(t - this.lastDepthT) < 0.01) return;
    this.lastDepthT = t;
    const now = this.ctx.currentTime;
    this.ambFilter.frequency.setTargetAtTime(lerp(660, 150, t), now, 0.8);
    this.ambGain.gain.setTargetAtTime(lerp(0.30, 0.40, t), now, 0.8);
    this.droneGain.gain.setTargetAtTime(lerp(0.05, 0.13, t), now, 0.8);
    this.drone.frequency.setTargetAtTime(lerp(55, 38, t), now, 1.2);
  },
  bubble() {
    if (!this.ready || this.muted) return;
    const f = rnd(160, 420);
    this.tone({ type:'sine', f0:f, f1:f * rnd(2.1, 3.4), dur:rnd(0.05, 0.13), gain:rnd(0.012, 0.05),
                lp:2600, rev:0.35, exp:true });
  },
  /** Ambient bubbles + occasional deep creaks, driven from the game loop. */
  ambientTick(dt, depthT) {
    if (!this.ready || this.muted) return;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      this.bubbleTimer = rnd(0.5, 3.2);
      const n = rndInt(1, 4);
      for (let i = 0; i < n; i++) this.bubble();
    }
    this.creakTimer = (this.creakTimer || 0) - dt;
    if (this.creakTimer <= 0) {
      this.creakTimer = rnd(6, 18);
      if (depthT > 0.25) {   // pressure creaks in the deep
        this.tone({ type:'sine', f0:rnd(70,130), f1:rnd(40,70), dur:rnd(1.4,2.8), gain:0.035, rev:0.6 });
      }
    }
  },

  /* ---- game SFX --------------------------------------------------------- */
  /** Gulp. `size` 0..1 scales pitch down for bigger meals. */
  eat(size = 0.3) {
    const s = clamp(size, 0, 1);
    this.tone({ type:'sine', f0:lerp(420, 120, s), f1:lerp(150, 52, s), dur:lerp(0.09, 0.2, s),
                gain:lerp(0.10, 0.26, s), atk:0.006, rev:0.15 });
    this.noiseBurst({ type:'bandpass', f0:lerp(1800, 500, s), f1:lerp(600, 180, s), q:1.4,
                      dur:0.09, gain:lerp(0.05, 0.13, s), rev:0.1 });
    // the little upward "swallow" tail
    this.tone({ type:'triangle', f0:lerp(300,110,s), f1:lerp(520,200,s), dur:0.11, delay:0.055,
                gain:0.06, rev:0.2 });
  },
  crunch() {   // armoured / big meal
    this.noiseBurst({ type:'bandpass', f0:2200, f1:400, q:2.2, dur:0.16, gain:0.16, rev:0.2 });
    this.tone({ type:'square', f0:130, f1:60, dur:0.12, gain:0.10, lp:900 });
  },
  damage() {
    this.tone({ type:'square', f0:96, f1:44, dur:0.22, gain:0.20, lp:520, rev:0.2 });
    this.noiseBurst({ type:'lowpass', f0:1400, f1:220, dur:0.20, gain:0.16 });
  },
  hurtSmall() {
    this.tone({ type:'triangle', f0:220, f1:120, dur:0.11, gain:0.09, lp:1400 });
  },
  evolve() {
    // rising arpeggio C-E-G-B-D over a swelling noise wash
    const base = 261.63, ratios = [1, 1.2599, 1.4983, 1.8877, 2.5198, 3.0];
    ratios.forEach((r, i) => {
      this.tone({ type:'triangle', f0:base * r, dur:1.05, delay:i * 0.085, gain:0.13, atk:0.02, rev:0.55 });
      this.tone({ type:'sine', f0:base * r * 2, dur:0.7, delay:i * 0.085 + 0.01, gain:0.045, rev:0.5 });
    });
    this.noiseBurst({ type:'bandpass', f0:300, f1:5200, q:0.7, dur:0.9, gain:0.10, atk:0.4, rev:0.5 });
    this.tone({ type:'sine', f0:65.4, f1:130.8, dur:1.2, gain:0.14, rev:0.4 });
  },
  death() {
    this.tone({ type:'sawtooth', f0:320, f1:48, dur:0.95, gain:0.20, lp:1600, rev:0.5 });
    this.tone({ type:'sine', f0:233, f1:58, dur:1.15, gain:0.15, rev:0.55 });
    this.tone({ type:'sine', f0:220, f1:55, dur:1.15, gain:0.12, delay:0.06, rev:0.55 });
    this.noiseBurst({ type:'lowpass', f0:900, f1:90, dur:1.1, gain:0.13, rev:0.5 });
  },
  victory() {
    // I - V - vi - IV in C, then a rising melody
    const chords = [[261.6,329.6,392.0],[196.0,246.9,293.7],[220.0,261.6,329.6],[174.6,220.0,261.6]];
    chords.forEach((ch, i) => ch.forEach(f => {
      this.tone({ type:'triangle', f0:f, dur:1.15, delay:i * 0.62, gain:0.085, atk:0.05, rev:0.65 });
      this.tone({ type:'sine', f0:f / 2, dur:1.15, delay:i * 0.62, gain:0.06, atk:0.05, rev:0.5 });
    }));
    const mel = [523.3, 659.3, 784.0, 1046.5, 1318.5];
    mel.forEach((f, i) => this.tone({ type:'sine', f0:f, dur:0.55, delay:2.5 + i * 0.16, gain:0.10, rev:0.7 }));
    this.noiseBurst({ type:'bandpass', f0:400, f1:6000, q:0.6, dur:2.4, gain:0.06, atk:1.2, rev:0.7 });
  },
  sonar() {
    this.tone({ type:'sine', f0:1500, f1:2600, dur:0.09, gain:0.07, rev:0.5 });
    this.tone({ type:'sine', f0:900, f1:1700, dur:0.16, delay:0.10, gain:0.045, rev:0.6 });
  },
  burst() { this.noiseBurst({ type:'bandpass', f0:520, f1:1700, q:0.9, dur:0.24, gain:0.06, rev:0.25 }); },
  ui(up = true) {
    this.tone({ type:'sine', f0:up ? 720 : 480, f1:up ? 1080 : 340, dur:0.075, gain:0.055, rev:0.2 });
  },
  ready_() { this.tone({ type:'sine', f0:880, f1:1320, dur:0.14, gain:0.06, rev:0.4 }); },
  pressure() { this.tone({ type:'sine', f0:70, f1:52, dur:0.6, gain:0.10, rev:0.4 }); },
};
