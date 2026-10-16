
/* ============================================================================
   9. UI — DOM overlays + HUD
   ========================================================================== */
const UI = {
  el: {},
  previews: [],
  lastHud: 0,

  init(game) {
    this.game = game;
    const ids = ['hud','stageName','stageLat','stageIdx','dnaVal','dnaRate','evoBtn','hpFill','stFill',
                 'traits','depthTxt','depthStrip','depthMark','depthLimit','zoneTxt','help','fpsQ','toast',
                 'title','evo','dead','win','pause','cards','evoTitle','evoSub','evoDna','deadWhy','deadFine',
                 'winPortrait','winName','winSci','winMsg','lineage','btnStart','btnMute','btnRespawn',
                 'btnKeep','btnAgain','btnResume','btnEvoClose'];
    ids.forEach(i => this.el[i] = document.getElementById(i));

    this.el.btnStart.addEventListener('click', () => { Sound.init(); Sound.resume(); Sound.startAmbient();
                                                         Sound.ui(); game.newGame(); });
    this.el.btnMute.addEventListener('click', () => {
      Sound.init(); const m = Sound.toggleMute();
      this.el.btnMute.textContent = 'Sound: ' + (m ? 'off' : 'on');
      this.setMuteLabel(m);
    });
    this.el.btnRespawn.addEventListener('click', () => { Sound.ui(); game.respawn(); });
    this.el.btnKeep.addEventListener('click', () => { Sound.ui(); game.continueAfterWin(); });
    this.el.btnAgain.addEventListener('click', () => { Sound.ui(); game.newGame(); });
    this.el.btnResume.addEventListener('click', () => { Sound.ui(); game.setState('PLAYING'); });
    this.el.btnEvoClose.addEventListener('click', () => { Sound.ui(); game.setState('PLAYING'); });
    this.el.evoBtn.addEventListener('click', () => { Sound.ui(); game.openEvolution(); });

    // depth strip: mark the pressure limit
    this.el.depthStrip.style.background =
      'linear-gradient(180deg,' + ZONES.map((z, i) => {
        const c0 = z.bg[0], c1 = z.bg[1];
        const p0 = (i / ZONES.length * 100).toFixed(1), p1 = ((i + 1) / ZONES.length * 100).toFixed(1);
        return `${hsl(c0[0],c0[1],c0[2])} ${p0}%, ${hsl(c1[0],c1[1],c1[2])} ${p1}%`;
      }).join(',') + ')';
  },

  setMuteLabel(m) {
    const b = this.el.btnMute; if (b) b.textContent = 'Sound: ' + (m ? 'off' : 'on');
  },

  show(id) {
    ['title','evo','dead','win','pause'].forEach(s => this.el[s].classList.toggle('on', s === id));
  },
  hideAll() { this.show(null); },

  toast(msg, ms = 2200) {
    const t = this.el.toast;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), ms);
  },

  /* ---- HUD (throttled to ~14 Hz; bars are CSS-transitioned) ------------ */
  updateHud(game, now) {
    if (now - this.lastHud < 70) return;
    this.lastHud = now;
    const p = game.player, e = this.el;
    e.stageName.textContent = p.stage.name;
    e.stageLat.textContent = p.stage.latin + ' · ' + p.stage.era;
    e.stageIdx.textContent = Math.min(p.nodeIndex + 1, STAGE_DEPTH.SPINE) + '/' + STAGE_DEPTH.SPINE;
    e.dnaVal.textContent = Math.floor(p.dna).toLocaleString('en-US');
    const cost = p.nextCost();
    e.dnaRate.textContent = isFinite(cost) ? '/ ' + Math.round(cost) + ' to evolve' : 'apex form';
    const ready = p.canEvolve();
    e.evoBtn.classList.toggle('ready', ready);
    e.evoBtn.textContent = ready ? 'EVOLVE · E' : 'Evolve · E';
    e.hpFill.style.width = clamp(p.hp / p.maxHp * 100, 0, 100).toFixed(1) + '%';
    e.stFill.style.width = clamp(p.stam / p.maxStam * 100, 0, 100).toFixed(1) + '%';
    // depth
    const depthM = Math.max(0, Math.round(p.y));
    e.depthTxt.innerHTML = depthM.toLocaleString('en-US') + ' m';
    const lim = game.depthLimit();
    const span = CFG.MAX_DEPTH - CFG.MIN_Y;
    e.depthMark.style.top = (clamp((p.y - CFG.MIN_Y) / span, 0, 1) * 100).toFixed(2) + '%';
    e.depthLimit.style.top = (clamp((lim - CFG.MIN_Y) / span, 0, 1) * 100).toFixed(2) + '%';
    const z = zoneAt(p.y);
    e.zoneTxt.textContent = z.name;
    // traits
    const key = [...p.traits].sort().join(',');
    if (key !== this._traitKey) {
      this._traitKey = key;
      e.traits.innerHTML = '';
      for (const t of p.traits) {
        const info = TRAIT_INFO[t] || { n: t, ab: '' };
        const d = document.createElement('div');
        d.className = 'trait';
        d.textContent = info.n;
        d.title = info.ab;
        e.traits.appendChild(d);
      }
    }
    e.fpsQ.textContent = game.fps ? game.fps.toFixed(0) + ' fps · ' + World.entities.length + ' entities' : '';
  },

  /* ---- EVOLUTION PANEL ------------------------------------------------- */
  buildEvolution(game) {
    const p = game.player, node = p.stage;
    this.el.evoTitle.textContent = 'Stage ' + Math.min(p.nodeIndex + 1, STAGE_DEPTH.SPINE) + ' — ' + node.name;
    this.el.evoSub.textContent = node.latin + ' · ' + node.era;
    this.el.evoDna.textContent = Math.floor(p.dna) + ' DNA available · cheapest path ' +
                                 Math.min(...node.ch.map(c => c.cost)) + ' DNA';
    const wrap = this.el.cards;
    wrap.innerHTML = '';
    this.previews.length = 0;

    node.ch.forEach((c, i) => {
      const afford = p.dna >= c.cost;
      const card = document.createElement('div');
      card.className = 'card' + (c.to !== p.stageId && STAGES[c.to] && !STAGES[c.to].final &&
                                 STAGE_DEPTH[c.to] < STAGE_DEPTH[p.stageId] ? '' : '');
      // mark the card that advances the lineage (highest tier progress)
      const advances = STAGE_DEPTH[c.to] > STAGE_DEPTH[p.stageId] || (STAGES[c.to] && STAGES[c.to].final);
      if (advances) card.classList.add('adv');
      if (!afford) card.style.opacity = '0.62';

      const num = document.createElement('div'); num.className = 'num'; num.textContent = (i + 1);
      card.appendChild(num);

      const cv = document.createElement('canvas');
      cv.width = 300; cv.height = 112 * (window.devicePixelRatio > 1.4 ? 1 : 1);
      card.appendChild(cv);
      this.previews.push({ cv, choice: c, game });

      const h = document.createElement('h4'); h.textContent = c.k; card.appendChild(h);
      const to = STAGES[c.to];
      const sci = document.createElement('div'); sci.className = 'sci';
      sci.textContent = '→ ' + to.name + (to.final ? '  ★ FINAL FORM' : '');
      card.appendChild(sci);
      const d = document.createElement('p'); d.textContent = c.d; card.appendChild(d);
      if (c.n) { const n = document.createElement('div'); n.className = 'note'; n.textContent = c.n; card.appendChild(n); }

      // stat deltas of the resulting form vs. the current one
      const del = document.createElement('div'); del.className = 'deltas';
      const b = p.stage.st, nb = to.st, st = c.st || {};
      const row = (label, a, bv, better) => {
        const diff = (bv + (st[label === 'Size' ? 'r' : label === 'Vitality' ? 'hp' :
                            label === 'Speed' ? 'speed' : label === 'Sense' ? 'sense' :
                            label === 'Bite' ? 'melee' : 'armor'] || 0)) - a;
        const s = document.createElement('span');
        s.className = 'd ' + (diff > 0.01 ? (better === 'dn' ? 'dn' : 'up') : diff < -0.01 ? 'dn' : '');
        s.textContent = label + ' ' + (diff >= 0 ? '+' : '') + (Math.abs(diff) >= 10 ? Math.round(diff) : diff.toFixed(1));
        del.appendChild(s);
      };
      row('Size', b.r, nb.r); row('Vitality', b.hp, nb.hp); row('Speed', b.speed, nb.speed);
      row('Sense', b.sense, nb.sense); row('Bite', b.melee, nb.melee); row('Armor', b.armor, nb.armor);
      if (c.tr) c.tr.forEach(t => {
        const info = TRAIT_INFO[t];
        if (!info) return;
        const s = document.createElement('span'); s.className = 'd ab';
        s.textContent = '✦ ' + info.n + ' — ' + info.ab;
        del.appendChild(s);
      });
      if (st.dnaRate) { const s = document.createElement('span'); s.className = 'd ab';
        s.textContent = '✦ Passive DNA +' + st.dnaRate.toFixed(1) + '/s'; del.appendChild(s); }
      const cost = document.createElement('span'); cost.className = 'd';
      cost.textContent = (afford ? '◆ ' : '◇ ') + c.cost + ' DNA';
      if (!afford) cost.style.color = '#ff9d8f';
      del.appendChild(cost);
      card.appendChild(del);

      card.addEventListener('mouseenter', () => Sound.ui(true));
      card.addEventListener('click', () => game.chooseEvolution(c));
      wrap.appendChild(card);
    });
    this.show('evo');
  },

  /** Animate the little preview canvases while the evolution panel is open. */
  renderPreviews(time) {
    if (!this.previews.length) return;
    const p = this.game.player;
    for (const pr of this.previews) {
      const ctx = pr.cv.getContext('2d');
      const W = pr.cv.width, H = pr.cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // water
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'hsla(192 60% 30% / .55)'); g.addColorStop(1, 'hsla(210 62% 10% / .7)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // build the body this choice would produce
      const target = STAGES[pr.choice.to];
      const vis = Object.assign({}, target.vis);
      const merged = Object.assign({}, p.vis);   // keep the player's accumulated layers
      for (const k in vis) merged[k] = vis[k];
      let org = (vis.organelles || []).slice();
      const cur = (p.vis.organelles || []).filter(x => org.indexOf(x) < 0).slice(0, 3);
      merged.organelles = org.concat(cur);
      const r = Math.min(W, H) * 0.3;
      ctx.save();
      ctx.translate(W * 0.5 - r * 0.15, H * 0.5);
      ctx.scale(1, 1);
      Vis.body(ctx, merged, r, time * 2.2, { detail: true, dim: 0, alpha: 1, seed: 4242, animate: true });
      ctx.restore();
    }
  },

  /* ---- DEATH ------------------------------------------------------------ */
  showDeath(game) {
    const p = game.player, s = game.stats;
    this.el.deadWhy.innerHTML = 'Your <b>' + p.stage.name + '</b> was taken by a <b>' +
      (p.lastKiller || 'predator') + '</b> at ' + Math.round(p.y).toLocaleString('en-US') + ' m.';
    const cpStage = STAGES[game.checkpoint ? game.checkpoint.stageId : p.stageId];
    this.el.deadFine.textContent = 'Checkpoint held — you return as ' + (cpStage ? cpStage.name : p.stage.name);
    this.fillStats(this.el.dead.parentElement.querySelector('.statsGrid'), [
      ['DNA banked', Math.floor(s.dnaEarned).toLocaleString('en-US')],
      ['Organisms eaten', s.eaten.toLocaleString('en-US')],
      ['Stage reached', Math.min(p.nodeIndex + 1, STAGE_DEPTH.SPINE) + ' / ' + STAGE_DEPTH.SPINE],
      ['Time', fmtTime(s.time)],
    ]);
    this.show('dead');
  },

  /* ---- VICTORY ---------------------------------------------------------- */
  showVictory(game) {
    const p = game.player, s = game.stats;
    this.el.winName.textContent = p.stage.name.toUpperCase();
    this.el.winSci.textContent = p.stage.latin;
    this.el.winMsg.textContent = p.stage.win;
    this.fillStats(this.el.win.querySelector('.statsGrid'), [
      ['Time to apex', fmtTime(s.time)],
      ['Organisms eaten', s.eaten.toLocaleString('en-US')],
      ['DNA earned', Math.floor(s.dnaEarned).toLocaleString('en-US')],
      ['Evolutions', s.evolutions],
      ['Deaths', s.deaths],
      ['Deepest dive', Math.round(s.deepest).toLocaleString('en-US') + ' m'],
      ['Final length', (p.r * 2 * 0.02).toFixed(1) + ' m'],
      ['Predators slain', s.kills.toLocaleString('en-US')],
    ]);
    // lineage trail
    const l = this.el.lineage;
    l.innerHTML = '<b>YOUR LINEAGE</b><br>' + (game.player.lineage || []).map(n => STAGES[n.from].name)
      .concat([p.stage.name]).map((n, i, a) => i === a.length - 1 ? '<b>' + n + '</b>' : n).join(' → ');
    // portrait
    const cv = this.el.winPortrait;
    const dpr = 1;
    cv.width = Math.max(320, Math.min(900, window.innerWidth * 0.7)) * dpr;
    cv.height = Math.max(150, Math.min(240, window.innerHeight * 0.28)) * dpr;
    this.winCtx = cv.getContext('2d');
    this.winVis = p.vis; this.winR = p.r;
    this.renderPortrait(0);
    this.show('win');
  },
  renderPortrait(time) {
    const ctx = this.winCtx; if (!ctx) return;
    const W = this.el.winPortrait.width, H = this.el.winPortrait.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, W * 0.6);
    g.addColorStop(0, 'hsla(196 62% 26% / .8)'); g.addColorStop(1, 'hsla(214 66% 6% / .95)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // drifting light motes
    for (let i = 0; i < 26; i++) {
      const x = ((i * 97.3 + time * 12) % W), y = ((i * 61.7 + Math.sin(time + i) * 18) % H);
      ctx.fillStyle = `hsla(188 100% 84% / ${0.06 + 0.05 * Math.sin(time * 2 + i)})`;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.save();
    ctx.translate(W * 0.5, H * 0.52);
    const r = Math.min(W, H) * 0.32;
    Vis.body(ctx, this.winVis, r, time * 1.9, { detail: true, dim: 0, alpha: 1, seed: 99, animate: true });
    ctx.restore();
  },

  fillStats(grid, rows) {
    if (!grid) return;
    grid.innerHTML = '';
    rows.forEach(([k, v]) => {
      const d = document.createElement('div'); d.className = 'stat';
      d.innerHTML = '<div class="k">' + k + '</div><div class="v">' + v + '</div>';
      grid.appendChild(d);
    });
  },
};

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
