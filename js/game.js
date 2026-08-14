/* ============================================================
   game.js — main loop, spawn director, rendering, UI.
   ============================================================ */
(function (global) {
  'use strict';
  const W = global.W;
  const TAU = W.TAU;
  const { clamp, lerp, rand, randInt, pick, chance, damp, shuffle } = W;
  const Art = W.Art, FX = W.FX, C = W.Content, Audio_ = W.Audio, Save = W.Save;

  const $ = (id) => document.getElementById(id);

  const Game = {
    /* ---------------- lifecycle ---------------- */
    state: 'menu',
    time: 0,
    canvas: null, ctx: null,
    w: 0, h: 0, dpr: 1,
    showNumbers: true,

    init() {
      if (this._inited) return;
      this._inited = true;
      this.fx = FX;
      this.canvas = $('game');
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      Art.init();
      W.Input.init();
      Save.load();

      this.enemyPool = new W.Pool(() => new W.Enemy());
      this.bulletPool = new W.Pool(() => new W.Bullet());
      this.boltPool = new W.Pool(() => new W.Bolt());
      this.zonePool = new W.Pool(() => new W.Zone());
      this.meteorPool = new W.Pool(() => new W.Meteor());
      this.novaPool = new W.Pool(() => new W.Nova());
      this.batPool = new W.Pool(() => new W.SpiritBat());
      this.pickupPool = new W.Pool(() => new W.Pickup());
      this.bosses = [];

      this.grid = new W.SpatialGrid(100);
      this._scratch = [];
      for (let i = 0; i < 8; i++) this._scratch.push([]);
      this._scratchIdx = 0;

      this.cam = { x: 0, y: 0 };
      this.curse = C.curseDefaults();     // replaced per run in start()
      this.groundPattern = this.ctx.createPattern(Art.ground, 'repeat');

      this.resize();
      addEventListener('resize', () => this.resize());

      this.buildMenu();
      this.bindUI();

      this.settings = Object.assign({ shake: 1, particles: 1, numbers: true },
                                    Save.data.settings || {});
      this.applySettings();
      this.selectedChar = Save.data.char || 'ember';
      this.selectedStage = Save.data.stage || 'hollow';
      this.stage = C.stage(this.selectedStage);
      this.setMuted(!!Save.data.muted);

      this.last = performance.now();
      this.fpsAvg = 60;
      requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.w = innerWidth;
      this.h = innerHeight;
      this.canvas.width = Math.floor(this.w * dpr);
      this.canvas.height = Math.floor(this.h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;
      // Spawn just outside whatever the player can actually see.
      this.spawnRadius = Math.hypot(this.w, this.h) * 0.5 + 90;
    },

    audio(n) { Audio_.sfx(n); },

    /* =====================================================
       MENU / UI
       ===================================================== */
    buildMenu() {
      const wrap = $('charSelect');
      wrap.innerHTML = '';
      for (const c of C.chars) {
        const locked = c.lockedBy ? c.lockedBy(Save.data) : null;
        const el = document.createElement('div');
        el.className = 'char' + (locked ? ' locked' : '');
        const cv = document.createElement('canvas');
        cv.width = 72; cv.height = 72;
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        const spr = Art.sprites[c.spr];
        const s = Math.min(72 / spr.w, 72 / spr.h) * 0.92;
        g.globalAlpha = locked ? 0.25 : 1;
        g.drawImage(spr.r, (72 - spr.w * s) / 2, (72 - spr.h * s) / 2, spr.w * s, spr.h * s);
        el.appendChild(cv);
        const body = document.createElement('div');
        body.innerHTML =
          `<div class="cname">${locked ? '???' : c.name}</div>` +
          `<div class="ctitle">${c.title}</div>` +
          `<div class="cdesc">${locked ? locked : c.desc + '<br><b>' + c.modText + '</b>'}</div>`;
        el.appendChild(body);
        if (!locked) {
          el.onclick = () => {
            this.selectedChar = c.id;
            Save.data.char = c.id; Save.save();
            [...wrap.children].forEach((n) => n.classList.remove('sel'));
            el.classList.add('sel');
            Audio_.resume(); this.audio('choose');
          };
        }
        if (c.id === (Save.data.char || 'ember') && !locked) el.classList.add('sel');
        wrap.appendChild(el);
      }
      if (!wrap.querySelector('.sel')) {
        const first = wrap.querySelector('.char:not(.locked)');
        if (first) first.classList.add('sel');
      }
      $('vaultGold').textContent = Save.data.shards + ' ✦';
      $('curseTag').textContent = this.curseTag();
      this.buildStages();
    },

    bindUI() {
      $('btnPlay').onclick = () => { Audio_.resume(); this.start(); };
      $('btnHelp').onclick = () => { $('help').classList.remove('hidden'); $('title').classList.add('hidden'); };
      $('btnHelpBack').onclick = () => { $('help').classList.add('hidden'); $('title').classList.remove('hidden'); };
      $('btnVault').onclick = () => { this.openVault(); };
      $('btnCurses').onclick = () => { this.openCurses(); };
      $('btnSettings').onclick = () => {
        $('title').classList.add('hidden'); $('settings').classList.remove('hidden');
        this.renderSettings();
      };
      $('btnSettingsBack').onclick = () => {
        $('settings').classList.add('hidden'); $('title').classList.remove('hidden');
      };
      $('setShake').onclick = () => this.cycleSetting('shake', [1, 0.5, 0]);
      $('setParticles').onclick = () => this.cycleSetting('particles', [1, 0.6, 0.3]);
      $('setNumbers').onclick = () => this.cycleSetting('numbers', [true, false]);
      $('setSound').onclick = () => { this.setMuted(!Audio_.muted); this.renderSettings(); };
      $('btnCursesBack').onclick = () => {
        $('curses').classList.add('hidden'); $('title').classList.remove('hidden'); this.buildMenu();
      };
      $('btnCursesClear').onclick = () => {
        Save.data.curses = []; Save.save(); this.audio('choose'); this.openCurses();
      };
      $('btnVaultBack').onclick = () => { $('vault').classList.add('hidden'); $('title').classList.remove('hidden'); this.buildMenu(); };
      $('btnWipe').onclick = () => {
        if (confirm('Erase all Vault progress and records?')) { Save.wipe(); this.openVault(); this.buildMenu(); }
      };
      $('btnResume').onclick = () => this.togglePause();
      $('btnQuit').onclick = () => this.endRun(false, true);
      $('btnMute').onclick = () => this.setMuted(!Audio_.muted);
      $('btnAgain').onclick = () => { $('over').classList.add('hidden'); this.start(); };
      $('btnMenu').onclick = () => { $('over').classList.add('hidden'); this.toMenu(); };
      $('btnReroll').onclick = () => this.reroll();

      addEventListener('keydown', (e) => {
        if (this.state === 'play' || this.state === 'pause') {
          if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.togglePause();
        }
        if (e.key === 'm' || e.key === 'M') this.setMuted(!Audio_.muted);
        if (this.state === 'levelup' && e.key >= '1' && e.key <= '4') {
          const cards = $('cards').children;
          const i = +e.key - 1;
          if (cards[i]) cards[i].click();
        }
      });
    },

    setMuted(m) {
      Audio_.init();
      Audio_.setMuted(m);
      Save.data.muted = m; Save.save();
      $('btnMute').textContent = 'Sound: ' + (m ? 'Off' : 'On');
    },

    openVault() {
      $('title').classList.add('hidden');
      $('vault').classList.remove('hidden');
      const grid = $('vaultGrid');
      grid.innerHTML = '';
      for (const u of C.vault) {
        const rank = Save.rank(u.id);
        const maxed = rank >= u.max;
        const cost = u.cost(rank);
        const afford = Save.data.shards >= cost;
        const el = document.createElement('div');
        el.className = 'vault-item' + (maxed ? ' max' : '');
        let pips = '';
        for (let i = 0; i < u.max; i++) pips += `<span class="pip${i < rank ? ' on' : ''}"></span>`;
        el.innerHTML =
          `<div class="vname"><span>${u.name}</span><span class="pips">${pips}</span></div>` +
          `<div class="vdesc">${u.desc(Math.max(1, rank + (maxed ? 0 : 1)))}</div>` +
          `<div class="vcost${afford || maxed ? '' : ' poor'}">${maxed ? 'MASTERED' : cost + ' ✦'}</div>`;
        if (!maxed && afford) {
          el.onclick = () => {
            Save.data.shards -= cost;
            Save.data.meta[u.id] = rank + 1;
            Save.save();
            this.audio('chest');
            this.openVault();
          };
        }
        grid.appendChild(el);
      }
      const head = $('vault').querySelector('.subtitle');
      head.innerHTML = `You hold <b style="color:var(--gold)">${Save.data.shards} ✦</b> soul shards. ` +
                       `These blessings persist across every run.`;
    },

    /* ---------------- Settings ---------------- */
    applySettings() {
      FX.shakeScale = this.settings.shake;
      Save.data.settings = this.settings;
    },

    cycleSetting(key, values) {
      const i = values.findIndex((v) => v === this.settings[key]);
      this.settings[key] = values[(i + 1) % values.length];
      this.applySettings();
      Save.save();
      this.audio('choose');
      this.renderSettings();
    },

    renderSettings() {
      const lbl = (v, map) => map[String(v)] ?? String(v);
      $('setShake').textContent = 'Screen Shake: ' +
        lbl(this.settings.shake, { '1': 'Full', '0.5': 'Reduced', '0': 'Off' });
      $('setParticles').textContent = 'Particles: ' +
        lbl(this.settings.particles, { '1': 'Full', '0.6': 'Reduced', '0.3': 'Minimal' });
      $('setNumbers').textContent = 'Damage Numbers: ' + (this.settings.numbers ? 'On' : 'Off');
      $('setSound').textContent = 'Sound: ' + (Audio_.muted ? 'Off' : 'On');
    },

    /* ---------------- Stage select ---------------- */
    buildStages() {
      const wrap = $('stageSelect');
      wrap.innerHTML = '';
      let anyOpen = false;
      for (const st of C.stages) {
        const locked = st.unlock ? st.unlock(Save.data) : null;
        const el = document.createElement('div');
        el.className = 'stage' + (locked ? ' locked' : '');
        el.innerHTML =
          `<div class="sname">${locked ? '???' : st.name}</div>` +
          `<div class="stitle">${st.title}</div>` +
          `<div class="sdesc">${locked || st.blurb}</div>`;
        if (!locked) {
          anyOpen = true;
          el.onclick = () => {
            this.selectedStage = st.id;
            this.stage = st;
            Save.data.stage = st.id; Save.save();
            [...wrap.children].forEach((n) => n.classList.remove('sel'));
            el.classList.add('sel');
            Audio_.resume(); this.audio('choose');
          };
          if (st.id === this.selectedStage) el.classList.add('sel');
        }
        wrap.appendChild(el);
      }
      // A stage that was selected and has since been locked (progress wiped)
      // must not leave the run pointing at something unplayable.
      if (anyOpen && !wrap.querySelector('.sel')) {
        this.selectedStage = 'hollow';
        this.stage = C.stage('hollow');
        wrap.querySelector('.stage:not(.locked)').classList.add('sel');
      }
    },

    /* ---------------- Curses ---------------- */
    activeCurses() {
      const ids = Save.data.curses || [];
      return C.curses.filter((c) => ids.includes(c.id));
    },

    curseTag() {
      const on = this.activeCurses();
      if (!on.length) return 'none';
      const bonus = Math.round(on.reduce((n, c) => n + c.shard, 0) * 100);
      return `${on.length} · +${bonus}% ✦`;
    },

    openCurses() {
      $('title').classList.add('hidden');
      $('curses').classList.remove('hidden');
      const ids = Save.data.curses || [];
      const grid = $('curseGrid');
      grid.innerHTML = '';
      for (const c of C.curses) {
        const on = ids.includes(c.id);
        const el = document.createElement('div');
        el.className = 'vault-item curse' + (on ? ' on' : '');
        const head = document.createElement('div');
        head.className = 'vhead';
        head.appendChild(this.iconNode(c.icon, 26));
        const nm = document.createElement('div');
        nm.className = 'vname';
        nm.innerHTML = `<span>${c.name}</span>`;
        head.appendChild(nm);
        const mark = document.createElement('div');
        mark.className = 'curse-mark';
        head.appendChild(mark);
        el.appendChild(head);
        const body = document.createElement('div');
        body.innerHTML = `<div class="vdesc">${c.desc}</div>` +
                         `<div class="vpay">+${Math.round(c.shard * 100)}% soul shards</div>`;
        el.appendChild(body);
        el.onclick = () => {
          const list = Save.data.curses || (Save.data.curses = []);
          const i = list.indexOf(c.id);
          if (i >= 0) list.splice(i, 1); else list.push(c.id);
          Save.save();
          this.audio('choose');
          this.openCurses();
        };
        grid.appendChild(el);
      }
      const on = this.activeCurses();
      const bonus = Math.round(on.reduce((n, c) => n + c.shard, 0) * 100);
      $('curseSub').innerHTML = on.length
        ? `<b style="color:var(--rose)">${on.length}</b> curse${on.length > 1 ? 's' : ''} bound &mdash; ` +
          `payout <b style="color:var(--gold)">+${bonus}%</b>. They apply to every run until lifted.`
        : 'Make the night worse. Get paid for it. Curses stay bound until you lift them.';
    },

    toMenu() {
      this.state = 'menu';
      Audio_.stopMusic();
      $('hud').classList.add('hidden');
      $('touch').classList.add('hidden');
      $('title').classList.remove('hidden');
      $('bossBarWrap').classList.add('hidden');
      this.buildMenu();
    },

    /* =====================================================
       RUN SETUP
       ===================================================== */
    metaStats() {
      const s = { damage: 0, maxhp: 0, speed: 0, cdr: 0, regen: 0, pickup: 0,
                  xpBonus: 0, shardBonus: 0, revives: 0, rerolls: 0 };
      for (const u of C.vault) {
        const r = Save.rank(u.id);
        if (r > 0) u.apply(s, r);
      }
      return s;
    },

    start() {
      const def = C.chars.find((c) => c.id === this.selectedChar) || C.chars[0];

      this.enemyPool.clear(); this.bulletPool.clear(); this.boltPool.clear();
      this.zonePool.clear(); this.meteorPool.clear(); this.novaPool.clear();
      this.batPool.clear(); this.pickupPool.clear();
      this.bosses.length = 0;
      FX.reset();

      this.stage = C.stage(this.selectedStage);
      this.plan = C.rollStagePlan(this.stage);
      this.groundPattern = this.ctx.createPattern(
        Art.groundFor(this.stage.id, this.stage.ground), 'repeat');
      this.curse = C.curseMods(Save.data.curses);
      this.player = new W.Player(def, this.metaStats(), this.curse);
      this.time = 0;
      this.kills = 0;
      this.shards = 0;
      this.levelQueue = 0;
      this.eventIdx = 0;
      this.bossIdx = 0;
      this.spawnAcc = 0;
      this.eliteTimer = 42;
      this.cam.x = 0; this.cam.y = 0;
      this.bulletDmgMul = 1;
      this.activeBoss = null;
      this.victory = false;
      this.pendingCards = null;

      $('title').classList.add('hidden');
      $('vault').classList.add('hidden');
      $('curses').classList.add('hidden');
      $('settings').classList.add('hidden');
      $('help').classList.add('hidden');
      $('over').classList.add('hidden');
      $('hud').classList.remove('hidden');
      $('bossBarWrap').classList.add('hidden');
      if ('ontouchstart' in window) $('touch').classList.remove('hidden');

      this.refreshSlots();
      this.state = 'play';
      Audio_.resume();
      Audio_.startMusic();
      const bound = this.activeCurses();
      this.banner(this.stage.name.toUpperCase(), bound.length ? '#ff6b8f' : '#c9a8ff');
      Save.data.runs++; Save.save();
    },

    /* =====================================================
       MAIN LOOP
       ===================================================== */
    loop(ts) {
      requestAnimationFrame((t) => this.loop(t));
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (dt > 1 / 20) dt = 1 / 20;          // never simulate huge steps
      if (dt <= 0) dt = 1 / 60;

      this.fpsAvg = lerp(this.fpsAvg, 1 / dt, 0.05);
      // Trim particle output rather than dropping frames.
      const auto = this.fpsAvg < 40 ? 0.4 : this.fpsAvg < 52 ? 0.7 : 1;
      FX.quality = Math.min(auto, this.settings.particles);
      this.showNumbers = this.settings.numbers && this.fpsAvg > 45;

      W.Input.update();
      if (this.state === 'play') this.update(dt);
      this.render();
      W.Input.endFrame();
    },

    update(dt) {
      const p = this.player;
      this.time += dt;

      this.director(dt);

      p.update(dt, this);

      // Rebuild the broadphase once per frame from live enemies.
      this.grid.clear();
      const en = this.enemyPool.active;
      for (let i = 0; i < en.length; i++) if (!en[i].dead) this.grid.insert(en[i]);
      for (const b of this.bosses) if (!b.dead) this.grid.insert(b);

      // --- enemies ------------------------------------------
      // Anything the player has long since outrun is recycled. Without
      // this a kiting player drags an ever-growing tail of mobs that
      // can never be fought, starving them of essence.
      const cull = this.spawnRadius * 2.2, cull2 = cull * cull;
      const eliteCull2 = (this.spawnRadius * 3.4) * (this.spawnRadius * 3.4);
      const n = en.length;
      for (let i = 0; i < n; i++) {
        const e = en[i];
        if (e.dead) continue;
        if (W.dist2(e.x, e.y, p.x, p.y) > (e.elite ? eliteCull2 : cull2)) { e.dead = true; continue; }
        e.update(dt, this);
        this.touchPlayer(e, dt);
      }
      for (let i = this.bosses.length - 1; i >= 0; i--) {
        const b = this.bosses[i];
        if (b.dead) { this.bosses.splice(i, 1); continue; }
        b.update(dt, this);
        this.touchPlayer(b, dt);
      }
      this.separate(dt);

      // --- projectiles & effects ----------------------------
      this.tickPool(this.boltPool, dt);
      this.tickPool(this.bulletPool, dt);
      this.tickPool(this.zonePool, dt);
      this.tickPool(this.meteorPool, dt);
      this.tickPool(this.novaPool, dt);
      this.tickPool(this.batPool, dt);
      this.tickPool(this.pickupPool, dt);
      this.enemyPool.sweep();

      this.updateOrbitals(dt);
      FX.update(dt);

      // --- camera -------------------------------------------
      const lead = 0.08;
      this.cam.x = lerp(this.cam.x, p.x + p.vx * lead, damp(9, dt));
      this.cam.y = lerp(this.cam.y, p.y + p.vy * lead, damp(9, dt));

      // --- music intensity ----------------------------------
      Audio_.music.intensity = clamp(this.time / 600 + (this.activeBoss ? 0.4 : 0), 0, 1);

      this.updateHUD();

      if (this.time >= C.RUN_LENGTH && !this.victory) this.endRun(true);
      if (this.levelQueue > 0 && this.state === 'play') this.openLevelUp();
    },

    tickPool(pool, dt) {
      const a = pool.active;
      const n = a.length;
      for (let i = 0; i < n; i++) if (!a[i].dead) a[i].update(dt, this);
      pool.sweep();
    },

    /** Contact damage. */
    touchPlayer(e, dt) {
      const p = this.player;
      const rr = e.r * 0.8 + p.r * 0.7;
      if (W.dist2(e.x, e.y, p.x, p.y) < rr * rr) p.hurt(e.dmg, this);
    },

    /** Cheap crowd separation so mobs form a wall instead of a stack. */
    separate(dt) {
      const a = this.enemyPool.active;
      const out = this._buf();
      const step = Math.max(1, Math.floor(a.length / 220));   // sample under heavy load
      for (let i = this._sepOffset | 0; i < a.length; i += step) {
        const e = a[i];
        if (e.dead) continue;
        this.grid.query(e.x, e.y, e.r * 1.6, out);
        for (let j = 0; j < out.length; j++) {
          const o = out[j];
          if (o === e || o.dead || o.boss) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          const d2 = dx * dx + dy * dy;
          const md = (e.r + o.r) * 0.72;
          if (d2 > md * md || d2 < 0.001) continue;
          const d = Math.sqrt(d2);
          const push = (md - d) * 6 * dt;
          const ux = dx / d, uy = dy / d;
          e.x -= ux * push; e.y -= uy * push;
          o.x += ux * push; o.y += uy * push;
        }
      }
      this._sepOffset = ((this._sepOffset | 0) + 1) % Math.max(1, step);
    },

    /* =====================================================
       SPAWN DIRECTOR
       ===================================================== */
    difficulty() {
      const m = this.time / 60;
      const st = this.stage ? this.stage.mods : { hp: 1, spd: 1 };
      return {
        hp: (1 + m * 0.34 + m * m * 0.026) * st.hp,
        dmg: 1 + m * 0.125,
        spd: (1 + Math.min(0.35, m * 0.028)) * st.spd,
        bossHp: 1 + m * 0.12,
      };
    },

    director(dt) {
      const m = this.time / 60;
      const scale = this.difficulty();
      this.bulletDmgMul = scale.dmg * this.curse.bulletDmg;

      // --- steady trickle -----------------------------------
      const alive = this.enemyPool.active.length;
      const target = Math.min(300, 24 + m * 14) * this.curse.spawnRate * this.stage.mods.spawn;
      const rate = alive > 460 ? 0 : clamp((target - alive) * 0.55, 0, 34 * this.curse.spawnRate);
      this.spawnAcc += rate * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        const id = this.rollEnemy(m);
        if (id) this.spawnRing(id, 1, scale);
      }

      // --- elites -------------------------------------------
      this.eliteTimer -= dt;
      if (this.eliteTimer <= 0 && this.time > 70) {
        this.eliteTimer = clamp(46 - m * 1.6, 20, 46);
        const id = this.rollEnemy(m);
        if (id) {
          const e = this.spawnRing(id, 1, scale, true);
          if (e) FX.ring(e.x, e.y, 10, 160, 'void', 0.6, 6);
        }
      }

      // --- scripted events ----------------------------------
      while (this.eventIdx < this.plan.swarms.length &&
             this.time >= this.plan.swarms[this.eventIdx].at) {
        this.runEvent(this.plan.swarms[this.eventIdx++], scale);
      }

      // --- bosses -------------------------------------------
      while (this.bossIdx < this.plan.bosses.length &&
             this.time >= this.plan.bosses[this.bossIdx].at * this.curse.bossTime) {
        const b = this.plan.bosses[this.bossIdx++];
        this.spawnBoss(b.id, (b.mult || 1) * this.curse.bossPower, scale);
      }
      // Past the schedule, keep escalating.
      if (this.bossIdx >= this.plan.bosses.length && this.time > 870 && !this.activeBoss) {
        this.spawnBoss(pick(this.stage.bosses), 2.4, scale);
        this.bossIdx++;
      }
    },

    rollEnemy(m) {
      let total = 0;
      const opts = this._buf();
      for (const row of C.spawnTable) {
        if (m < row.from) continue;
        const wgt = row.weight(m) * (this.stage.weights[row.id] ?? 1);
        if (wgt <= 0) continue;
        total += wgt;
        opts.push({ id: row.id, w: total });
      }
      if (!total) return 'imp';
      const r = Math.random() * total;
      for (const o of opts) if (r <= o.w) return o.id;
      return 'imp';
    },

    /** Point on the ring just past the visible edge. */
    ringPoint(spreadA) {
      const p = this.player;
      const a = spreadA !== undefined ? spreadA : rand(TAU);
      const d = this.spawnRadius + rand(0, 60);
      return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, a };
    },

    spawnRing(id, count, scale, elite) {
      const def = C.enemies[id];
      if (!def) return null;
      let last = null;
      for (let i = 0; i < count; i++) {
        const pt = this.ringPoint();
        last = this.enemyPool.spawn().init(def, pt.x, pt.y, scale, elite);
      }
      return last;
    },

    runEvent(ev, scale) {
      const def = C.enemies[ev.type];
      if (!def) return;
      const p = this.player;
      if (ev.kind === 'ring') {
        for (let i = 0; i < ev.n; i++) {
          const a = (i / ev.n) * TAU;
          const d = this.spawnRadius * 0.92;
          this.enemyPool.spawn().init(def, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, scale);
        }
      } else if (ev.kind === 'flank') {
        for (let s of [-1, 1]) {
          const base = s > 0 ? 0 : Math.PI;
          for (let i = 0; i < ev.n / 2; i++) {
            const a = base + rand(-0.55, 0.55);
            const d = this.spawnRadius + rand(0, 260);
            this.enemyPool.spawn().init(def, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, scale);
          }
        }
      } else {
        const base = rand(TAU);
        for (let i = 0; i < ev.n; i++) {
          const a = base + rand(-0.6, 0.6);
          const d = this.spawnRadius + rand(0, 160);
          this.enemyPool.spawn().init(def, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, scale);
        }
      }
      this.banner(ev.text, '#ff9f7a');
      this.audio('boss');
    },

    spawnBoss(id, mult, scale) {
      const def = C.bosses[id];
      if (!def) return;
      const pt = this.ringPoint();
      const b = new W.Boss();
      b.initBoss(def, pt.x, pt.y, mult, scale);
      this.bosses.push(b);
      this.activeBoss = b;
      $('bossBarWrap').classList.remove('hidden');
      $('bossName').textContent = def.name;
      this.banner(def.name, '#ff7a5f');
      this.audio('boss');
      FX.kick(18);
    },

    summon(boss, type, n) {
      const def = C.enemies[type];
      if (!def) return;
      const scale = this.difficulty();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.2, 0.2);
        const d = boss.r + rand(40, 110);
        const e = this.enemyPool.spawn().init(def, boss.x + Math.cos(a) * d, boss.y + Math.sin(a) * d, scale);
        FX.spark(e.x, e.y, boss.def.color, 6, 120);
      }
      FX.ring(boss.x, boss.y, boss.r, boss.r * 3, boss.def.color, 0.5, 5);
    },

    /* =====================================================
       COMBAT API (used by spell cast routines)
       ===================================================== */
    _buf() {
      const b = this._scratch[this._scratchIdx];
      this._scratchIdx = (this._scratchIdx + 1) % this._scratch.length;
      b.length = 0;
      return b;
    },

    queryEnemies(x, y, r) {
      const out = this._buf();
      return this.grid.query(x, y, r, out);
    },

    nearestEnemy(x, y, maxDist, exclude) {
      let best = null, bd = maxDist * maxDist;
      // Widen the search until something turns up or we exceed the cap.
      for (let r = 180; r <= maxDist * 1.05; r *= 2) {
        const found = this.grid.query(x, y, r, this._buf());
        for (let i = 0; i < found.length; i++) {
          const e = found[i];
          if (e.dead || (exclude && exclude.has(e))) continue;
          const d = W.dist2(x, y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) break;
      }
      return best;
    },

    randomEnemyNear(x, y, r) {
      const found = this.grid.query(x, y, r, this._buf());
      const live = [];
      for (let i = 0; i < found.length; i++) if (!found[i].dead) live.push(found[i]);
      return live.length ? pick(live) : null;
    },

    damageEnemy(e, dmg, opt) {
      if (!e || e.dead) return;
      e.damage(dmg, this, opt || {});
    },

    stun(e, t) { if (e && !e.dead) e.stunT = Math.max(e.stunT, t); },

    explode(x, y, r, dmg, color, src, big) {
      const found = this.queryEnemies(x, y, r + 40);
      for (let i = 0; i < found.length; i++) {
        const e = found[i];
        if (e.dead) continue;
        const rr = r + e.r;
        if (W.dist2(x, y, e.x, e.y) > rr * rr) continue;
        const a = Math.atan2(e.y - y, e.x - x);
        this.damageEnemy(e, dmg, { src, crit: true, knock: { x: Math.cos(a) * 240, y: Math.sin(a) * 240 } });
      }
      FX.ring(x, y, r * 0.25, r * 1.1, color, big ? 0.5 : 0.32, big ? 8 : 5);
      FX.burst(x, y, color, big ? 26 : 12, big ? 340 : 200, big ? 26 : 16);
      if (big) { FX.smoke(x, y, 'shadow', 8); FX.kick(9); this.audio('boom'); }
    },

    spawnBolt(o) { this.boltPool.spawn().init(o); },
    spawnBullet(x, y, a, spd, dmg, color) {
      // Hard ceiling: past this the screen is unreadable anyway, and
      // dropping the newest shot is kinder than dropping frames.
      if (this.bulletPool.active.length >= 850) return;
      this.bulletPool.spawn().init(x, y, a, spd * this.curse.bulletSpd, dmg, color);
    },
    spawnZone(o) { this.zonePool.spawn().init(o); },
    spawnMeteor(o) { this.meteorPool.spawn().init(o); },
    spawnNova(o) { this.novaPool.spawn().init(o); FX.kick(5); },
    spawnBat(o) { this.batPool.spawn().init(o); },

    /* =====================================================
       ORBITALS — orbs, sigils, beams, siphon tethers
       ===================================================== */
    syncOrbs(sp, count, radius, spin, dmg, knock, dual) {
      sp.orbCount = count; sp.orbRadius = radius; sp.orbSpin = spin;
      sp.orbDmg = dmg; sp.orbKnock = knock; sp.orbDual = dual;
    },
    syncSigils(sp, count, radius, spin, dmg, explode) {
      sp.sigCount = count; sp.sigRadius = radius; sp.sigSpin = spin;
      sp.sigDmg = dmg; sp.sigExplode = explode;
    },

    updateOrbitals(dt) {
      const p = this.player;
      for (const sp of p.spells) {
        if (sp.id === 'orbs' && sp.orbCount) {
          sp.orbA = (sp.orbA || 0) + sp.orbSpin * dt;
          sp.orbTick = (sp.orbTick || 0) - dt;
          const fire = sp.orbTick <= 0;
          if (fire) sp.orbTick = 0.26;
          const rings = sp.orbDual ? 2 : 1;
          const per = Math.max(1, Math.round(sp.orbCount / rings));
          for (let ring = 0; ring < rings; ring++) {
            for (let i = 0; i < per; i++) {
              const dir = ring ? -1 : 1;
              const a = sp.orbA * dir + (i / per) * TAU + ring * 0.5;
              const rad = sp.orbRadius * (ring ? 0.62 : 1);
              const ox = p.x + Math.cos(a) * rad, oy = p.y + Math.sin(a) * rad;
              if (fire) {
                const found = this.queryEnemies(ox, oy, 40);
                for (let k = 0; k < found.length; k++) {
                  const e = found[k];
                  if (e.dead) continue;
                  const rr = 18 + e.r;
                  if (W.dist2(ox, oy, e.x, e.y) > rr * rr) continue;
                  const ang = Math.atan2(e.y - p.y, e.x - p.x);
                  this.damageEnemy(e, sp.orbDmg, {
                    src: sp,
                    knock: { x: Math.cos(ang) * sp.orbKnock, y: Math.sin(ang) * sp.orbKnock },
                  });
                  FX.spark(ox, oy, 'arcane', 4, 100);
                }
              }
              sp._pos = sp._pos || [];
              sp._pos[ring * per + i] = { x: ox, y: oy };
            }
          }
          sp._posCount = rings * per;
        }

        if (sp.id === 'ward' && sp.sigCount) {
          sp.sigA = (sp.sigA || 0) + sp.sigSpin * dt;
          sp.sigTick = (sp.sigTick || 0) - dt;
          const fire = sp.sigTick <= 0;
          if (fire) sp.sigTick = 0.3;
          sp._pos = sp._pos || [];
          for (let i = 0; i < sp.sigCount; i++) {
            const a = sp.sigA + (i / sp.sigCount) * TAU;
            const ox = p.x + Math.cos(a) * sp.sigRadius, oy = p.y + Math.sin(a) * sp.sigRadius;
            sp._pos[i] = { x: ox, y: oy };
            // Swat hostile projectiles out of the air.
            const bl = this.bulletPool.active;
            for (let k = 0; k < bl.length; k++) {
              const b = bl[k];
              if (b.dead) continue;
              if (W.dist2(ox, oy, b.x, b.y) > 26 * 26) continue;
              b.dead = true;
              FX.spark(b.x, b.y, 'frost', 6, 130);
              if (sp.sigExplode) this.explode(b.x, b.y, 58, sp.sigDmg * 0.6, 'frost', sp);
            }
            if (fire) {
              const found = this.queryEnemies(ox, oy, 40);
              for (let k = 0; k < found.length; k++) {
                const e = found[k];
                if (e.dead) continue;
                const rr = 20 + e.r;
                if (W.dist2(ox, oy, e.x, e.y) > rr * rr) continue;
                const ang = Math.atan2(e.y - p.y, e.x - p.x);
                this.damageEnemy(e, sp.sigDmg, {
                  src: sp, knock: { x: Math.cos(ang) * 260, y: Math.sin(ang) * 260 },
                });
              }
            }
          }
          sp._posCount = sp.sigCount;
        }

        if (sp.id === 'beam' && sp.beamCount) {
          sp.beamA = (sp.beamA || 0) + sp.beamRot * dt;
          sp.beamTick = (sp.beamTick || 0) - dt;
          const fire = sp.beamTick <= 0;
          if (fire) sp.beamTick = 0.11;
          if (fire) {
            for (let i = 0; i < sp.beamCount; i++) {
              const a = sp.beamA + (i / sp.beamCount) * TAU;
              const dx = Math.cos(a), dy = Math.sin(a);
              const midX = p.x + dx * sp.beamLen * 0.5, midY = p.y + dy * sp.beamLen * 0.5;
              const found = this.queryEnemies(midX, midY, sp.beamLen * 0.5 + 60);
              for (let k = 0; k < found.length; k++) {
                const e = found[k];
                if (e.dead) continue;
                const ex = e.x - p.x, ey = e.y - p.y;
                const proj = ex * dx + ey * dy;
                if (proj < 0 || proj > sp.beamLen) continue;
                const perp = Math.abs(ex * dy - ey * dx);
                if (perp > 18 + e.r * 0.7) continue;
                this.damageEnemy(e, sp.beamDps * 0.11, { src: sp });
                if (sp.beamBurn) { e.burnDps = Math.max(e.burnDps, sp.beamDps * 0.25); e.burnT = 2; }
                if (chance(0.3)) FX.trail(e.x, e.y, 'holy', 14);
              }
            }
          }
        }

        if (sp.id === 'siphon' && sp.links) {
          const used = new Set();
          sp._links = sp._links || [];
          sp._links.length = 0;
          for (let i = 0; i < sp.links; i++) {
            const e = this.nearestEnemy(p.x, p.y, sp.range, used);
            if (!e) break;
            used.add(e);
            sp._links.push(e);
            this.damageEnemy(e, sp.dps * dt, { src: sp });
            p.heal(sp.healRate * dt);
            if (sp.pull) {
              const a = Math.atan2(p.y - e.y, p.x - e.x);
              e.x += Math.cos(a) * 55 * dt;
              e.y += Math.sin(a) * 55 * dt;
            }
            if (chance(dt * 12)) {
              const t = Math.random();
              FX.trail(lerp(e.x, p.x, t), lerp(e.y, p.y, t), 'blood', 11);
            }
          }
        }
      }
    },

    /* =====================================================
       DEATH, DROPS, PICKUPS
       ===================================================== */
    onEnemyKilled(e, opt) {
      this.kills++;
      const color = e.boss ? e.def.color : 'blood';
      FX.burst(e.x, e.y, color, e.boss ? 40 : 8, e.boss ? 420 : 170, e.boss ? 30 : 13);
      this.audio(e.boss ? 'boom' : 'kill');

      if (e.boss) {
        FX.kick(24);
        FX.ring(e.x, e.y, 20, 520, e.def.color, 0.9, 12);
        this.spawnPickup('chest', e.x, e.y);
        const shards = Math.round(e.def.shards * (1 + this.time / 900));
        for (let i = 0; i < 6; i++) {
          this.spawnPickup('coin', e.x + rand(-60, 60), e.y + rand(-60, 60));
        }
        this.shards += Math.round(shards * this.player.stat.shardBonus);
        for (let i = 0; i < 8; i++) this.spawnPickup('xp4', e.x + rand(-70, 70), e.y + rand(-70, 70));
        this.activeBoss = this.bosses.find((b) => b !== e && !b.dead) || null;
        if (!this.activeBoss) $('bossBarWrap').classList.add('hidden');
        this.banner('SLAIN', '#ffd479');
        return;
      }

      // Essence
      const xp = e.xp;
      const tier = xp >= 40 ? 'xp4' : xp >= 12 ? 'xp3' : xp >= 4 ? 'xp2' : 'xp1';
      this.spawnPickup(tier, e.x, e.y);
      if (e.elite) {
        for (let i = 0; i < 4; i++) this.spawnPickup('xp3', e.x + rand(-30, 30), e.y + rand(-30, 30));
        this.spawnPickup('coin', e.x, e.y);
        this.spawnPickup(chance(0.5) ? 'heart' : 'magnet', e.x + 18, e.y);
      }
      if (chance(0.012)) this.spawnPickup('heart', e.x, e.y);
      if (chance(0.02)) this.spawnPickup('coin', e.x, e.y);
      if (chance(0.004)) this.spawnPickup('magnet', e.x, e.y);
      if (chance(0.0025)) this.spawnPickup('bomb', e.x, e.y);

      // Splitters and death bursts
      if (e.def.split) {
        const d = C.enemies[e.def.split.type];
        const scale = this.difficulty();
        for (let i = 0; i < e.def.split.n; i++) {
          const a = rand(TAU);
          this.enemyPool.spawn().init(d, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, scale);
        }
      }
      if (e.def.onDeath === 'burst') {
        for (let i = 0; i < 10; i++) {
          this.spawnBullet(e.x, e.y, (i / 10) * TAU, 150, 9 * this.bulletDmgMul, 'toxic');
        }
      }
    },

    spawnPickup(kind, x, y) { this.pickupPool.spawn().init(kind, x, y); },

    collect(pk) {
      const d = pk.def, p = this.player;
      if (d.xp) {
        p.gainXp(d.xp * p.stat.xpBonus, this);
        this.audio('pickup');
      }
      if (d.heal) { p.heal(d.heal); this.audio('heal'); }
      if (d.shards) {
        this.shards += Math.round(d.shards * p.stat.shardBonus);
        this.audio('coin');
      }
      if (d.magnet) {
        const a = this.pickupPool.active;
        for (let i = 0; i < a.length; i++) if (!a[i].dead && a[i].def.xp) a[i].pulled = true;
        this.audio('chest');
        FX.ring(p.x, p.y, 20, 900, 'arcane', 0.7, 6);
      }
      if (d.bomb) {
        const a = this.enemyPool.active;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          if (e.dead) continue;
          if (W.dist2(e.x, e.y, p.x, p.y) < 900 * 900) this.damageEnemy(e, 99999, { src: null });
        }
        FX.ring(p.x, p.y, 20, 1000, 'blood', 0.8, 14);
        FX.kick(24);
        this.audio('boom');
        this.banner('ALL SOULS RELEASED', '#ff8fa8');
      }
      if (d.chest) {
        this.audio('chest');
        this.shards += Math.round(25 * p.stat.shardBonus);
        this.levelQueue += 2;
        FX.burst(p.x, p.y, 'ember', 30, 300, 22);
        this.banner('A CHEST!', '#ffd479');
      }
    },

    /* =====================================================
       LEVEL UP
       ===================================================== */
    queueLevelUps(n) {
      this.levelQueue += n;
      this.audio('level');
      FX.ring(this.player.x, this.player.y, 20, 220, 'life', 0.6, 6);
    },

    /** Build the card pool: evolutions first, then upgrades and new picks. */
    rollCards() {
      const p = this.player;
      const out = [];

      // Evolutions trump everything else.
      for (const sp of p.spells) {
        const def = C.spells[sp.id];
        if (sp.evolved || sp.level < 8 || !def.evo) continue;
        const req = C.passives[def.evo.req];
        if ((p.passives[def.evo.req] || 0) < req.max) continue;
        out.push({ type: 'evolve', id: sp.id, def, name: def.evo.name,
                   desc: def.evo.desc, icon: def.icon, tag: 'Evolution' });
      }
      if (out.length) return out.slice(0, 3);

      const pool = [];
      for (const sp of p.spells) {
        const def = C.spells[sp.id];
        if (sp.level >= 8) continue;
        pool.push({ type: 'spell', id: sp.id, def, name: def.name,
                    desc: C.spellUpText(sp), icon: def.icon,
                    tag: 'Spell · Lv ' + (sp.level + 1), weight: 18 });
      }
      // Brand-new options are throttled once you already have a few, so
      // a build sharpens instead of collecting ten level-1 spells.
      if (p.spells.length < 6) {
        const newW = p.spells.length < 3 ? 13 : 5;
        for (const id in C.spells) {
          if (p.spells.some((s) => s.id === id)) continue;
          const def = C.spells[id];
          pool.push({ type: 'spell', id, def, name: def.name, desc: def.blurb,
                      icon: def.icon, tag: 'New Spell', weight: newW });
        }
      }
      const passiveCount = Object.keys(p.passives).length;
      for (const id in C.passives) {
        const def = C.passives[id];
        const lv = p.passives[id] || 0;
        if (lv >= def.max) continue;
        if (lv === 0 && passiveCount >= 6) continue;
        pool.push({ type: 'passive', id, def, name: def.name,
                    desc: def.blurb(def.per * (lv + 1)), icon: def.icon,
                    tag: lv === 0 ? 'New Charm' : 'Charm · Lv ' + (lv + 1),
                    weight: lv === 0 ? (passiveCount < 3 ? 11 : 5) : 13 });
      }

      if (!pool.length) {
        return [{ type: 'heal', name: 'Arcane Surge', icon: 'might',
                  desc: 'Fully restore health and gain +15 maximum health.', tag: 'Boon' }];
      }

      // Weighted sample without replacement.
      const picked = [];
      const n = Math.min(pool.length, p.rerolls > 0 && chance(0.25) ? 4 : 3);
      const work = pool.slice();
      while (picked.length < n && work.length) {
        let total = 0;
        for (const o of work) total += o.weight;
        let r = Math.random() * total, idx = 0;
        for (let i = 0; i < work.length; i++) {
          r -= work[i].weight;
          if (r <= 0) { idx = i; break; }
        }
        picked.push(work.splice(idx, 1)[0]);
      }
      return picked;
    },

    openLevelUp() {
      this.state = 'levelup';
      this.pendingCards = this.rollCards();
      this.renderCards();
      $('levelup').classList.remove('hidden');
      $('lvlupSub').textContent = this.levelQueue > 1
        ? `Level ${this.player.level} · ${this.levelQueue} boons waiting`
        : `Level ${this.player.level}`;
    },

    renderCards() {
      const box = $('cards');
      box.innerHTML = '';
      this.pendingCards.forEach((c, i) => {
        const el = document.createElement('div');
        el.className = 'card ' + (c.type === 'evolve' ? 'evolve' : c.type === 'passive' ? 'passive' : 'spell');
        const icon = this.iconNode(c.icon, 64);
        el.innerHTML = `<div class="ktag">${c.tag}</div><div class="knum">${i + 1}</div>`;
        el.appendChild(icon);
        const t = document.createElement('div');
        t.innerHTML = `<div class="kname">${c.name}</div><div class="kdesc">${c.desc}</div>`;
        el.appendChild(t);
        el.onclick = () => this.chooseCard(c);
        box.appendChild(el);
      });
      const rr = $('btnReroll');
      rr.classList.toggle('hidden', this.player.rerolls <= 0);
      $('rerollCount').textContent = '×' + this.player.rerolls;
    },

    reroll() {
      if (this.player.rerolls <= 0) return;
      this.player.rerolls--;
      this.pendingCards = this.rollCards();
      this.renderCards();
      this.audio('choose');
    },

    chooseCard(c) {
      const p = this.player;
      if (c.type === 'spell') p.addSpell(c.id);
      else if (c.type === 'passive') p.addPassive(c.id);
      else if (c.type === 'evolve') {
        p.evolve(c.id);
        this.banner(c.name.toUpperCase(), '#ffd479');
        FX.ring(p.x, p.y, 20, 340, 'ember', 0.8, 10);
      } else if (c.type === 'heal') {
        p.bonusHp += 15; p.recalc(); p.hp = p.maxhp;
      }
      this.audio('choose');
      this.levelQueue--;
      $('levelup').classList.add('hidden');
      this.refreshSlots();
      if (this.levelQueue > 0) {
        // Chain straight into the next choice.
        setTimeout(() => this.openLevelUp(), 90);
      } else {
        this.state = 'play';
        this.last = performance.now();
      }
    },

    /* =====================================================
       PAUSE / END
       ===================================================== */
    togglePause() {
      if (this.state === 'play') {
        this.state = 'pause';
        $('pause').classList.remove('hidden');
        this.renderPauseLoadout();
      } else if (this.state === 'pause') {
        this.state = 'play';
        this.last = performance.now();
        $('pause').classList.add('hidden');
      }
    },

    renderPauseLoadout() {
      const box = $('pauseLoadout');
      box.innerHTML = '';
      const add = (icon, name, lv, evolved) => {
        const row = document.createElement('div');
        row.className = 'ld-row';
        row.appendChild(this.iconNode(icon, 26));
        const n = document.createElement('div');
        n.className = 'ldn';
        n.textContent = name;
        row.appendChild(n);
        const l = document.createElement('div');
        l.className = 'ldl';
        l.textContent = evolved ? '✦ EVOLVED' : 'Lv ' + lv;
        row.appendChild(l);
        box.appendChild(row);
      };
      for (const sp of this.player.spells) {
        const d = C.spells[sp.id];
        add(d.icon, sp.evolved ? d.evo.name : d.name, sp.level, sp.evolved);
      }
      for (const id in this.player.passives) {
        const d = C.passives[id];
        add(d.icon, d.name, this.player.passives[id], false);
      }
    },

    playerDown() {
      const p = this.player;
      if (p.revives > 0 && !this.curse.noRevive) {
        p.revives--;
        p.hp = p.maxhp;
        p.iframe = 2.6;
        FX.ring(p.x, p.y, 20, 720, 'ember', 1.0, 14);
        FX.kick(24);
        this.audio('win');
        this.banner('THE FEATHER BURNS', '#ff9448');
        // Clear the screen so the revive actually means something.
        const a = this.bulletPool.active;
        for (let i = 0; i < a.length; i++) a[i].dead = true;
        const en = this.enemyPool.active;
        for (let i = 0; i < en.length; i++) {
          if (!en[i].dead && W.dist2(en[i].x, en[i].y, p.x, p.y) < 420 * 420) {
            this.damageEnemy(en[i], 9999, {});
          }
        }
        return;
      }
      p.dead = true;
      this.endRun(false);
    },

    endRun(won, abandoned) {
      if (this.state === 'over') return;
      this.victory = won;
      this.state = 'over';
      Audio_.stopMusic();
      $('levelup').classList.add('hidden');
      $('pause').classList.add('hidden');
      $('bossBarWrap').classList.add('hidden');

      const base = this.shards + this.kills * 0.32 * this.player.stat.shardBonus;
      const earned = Math.round(base * (1 + this.curse.shardBonus));
      const s = Save.data;
      s.shards += earned;
      s.kills += this.kills;
      s.best = Math.max(s.best, Math.floor(this.time));
      if (won) s.wins++;
      Save.save();

      if (!abandoned) this.audio(won ? 'win' : 'death');

      $('overTitle').textContent = won ? 'Dawn Breaks' : abandoned ? 'You Slip Away' : 'The Hollow Claims You';
      const where = this.stage.name;
      $('overSub').textContent = won
        ? `The sun crests the ridge and ${where} falls silent. You held.`
        : abandoned ? `You slip out of ${where}. The shards are yours to keep.`
        : `${where} took you at ${fmtTime(this.time)}. The night goes on without you.`;

      const bound = this.activeCurses();
      $('results').innerHTML =
        res(fmtTime(this.time), 'Survived') +
        res(this.kills, 'Slain') +
        res('Lv ' + this.player.level, 'Reached') +
        res(earned + ' ✦', 'Shards Earned', true) +
        (bound.length
          ? `<div class="res curse"><div class="rv">+${Math.round(this.curse.shardBonus * 100)}%</div>` +
            `<div class="rk">${bound.length} Curse${bound.length > 1 ? 's' : ''}</div></div>`
          : res(fmtTime(s.best), 'Best Ever'));

      $('over').classList.remove('hidden');
      $('touch').classList.add('hidden');
    },

    banner(text, color) {
      const el = $('banner');
      el.textContent = text;
      el.style.color = color || '#c9a8ff';
      el.classList.remove('show');
      void el.offsetWidth;                 // restart the animation
      el.classList.add('show');
    },

    /* =====================================================
       HUD
       ===================================================== */
    iconNode(name, size) {
      const src = Art.icons[name] || Art.icons.might;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(src, 0, 0, size, size);
      return c;
    },

    refreshSlots() {
      const p = this.player;
      const sRow = $('spellSlots'), pRow = $('passiveSlots');
      sRow.innerHTML = ''; pRow.innerHTML = '';
      for (const sp of p.spells) {
        const d = C.spells[sp.id];
        const el = document.createElement('div');
        el.className = 'slot' + (sp.level >= 8 ? ' maxed' : '');
        el.title = (sp.evolved ? d.evo.name : d.name) + ' · Lv ' + sp.level;
        el.appendChild(this.iconNode(d.icon, 30));
        const i = document.createElement('i');
        i.textContent = sp.evolved ? '✦' : sp.level;
        el.appendChild(i);
        sRow.appendChild(el);
      }
      for (const id in p.passives) {
        const d = C.passives[id];
        const lv = p.passives[id];
        const el = document.createElement('div');
        el.className = 'slot' + (lv >= d.max ? ' maxed' : '');
        el.title = d.name + ' · Lv ' + lv;
        el.appendChild(this.iconNode(d.icon, 22));
        const i = document.createElement('i');
        i.textContent = lv;
        el.appendChild(i);
        pRow.appendChild(el);
      }
    },

    updateHUD() {
      const p = this.player;
      $('hpFill').style.transform = `scaleX(${clamp(p.hp / p.maxhp, 0, 1)})`;
      $('hpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxhp}`;
      $('xpFill').style.transform = `scaleX(${clamp(p.xp / p.xpNext, 0, 1)})`;
      $('xpText').textContent = 'LEVEL ' + p.level;
      $('clock').textContent = fmtTime(this.time);
      $('kills').textContent = this.kills;
      $('gold').textContent = this.shards;
      $('dashFill').style.transform = `scaleX(${clamp(1 - p.dashCd / 1.6, 0, 1)})`;
      if (this.activeBoss && !this.activeBoss.dead) {
        $('bossFill').style.transform =
          `scaleX(${clamp(this.activeBoss.hp / this.activeBoss.maxhp, 0, 1)})`;
      }
    },

    /* =====================================================
       RENDER
       ===================================================== */
    render() {
      const g = this.ctx;
      const w = this.w, h = this.h;

      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#07060f';
      g.fillRect(0, 0, w, h);

      if (this.state === 'menu' || !this.player) { this.renderMenuBg(g, w, h); return; }

      const sx = FX.shake ? rand(-FX.shake, FX.shake) : 0;
      const sy = FX.shake ? rand(-FX.shake, FX.shake) : 0;
      const camX = Math.round(this.cam.x - w / 2 + sx);
      const camY = Math.round(this.cam.y - h / 2 + sy);
      g.translate(-camX, -camY);

      // --- ground -------------------------------------------
      g.fillStyle = this.groundPattern;
      g.fillRect(camX, camY, w, h);

      // Pools of light so the floor isn't uniformly flat
      g.globalCompositeOperation = 'lighter';
      const t = this.time;
      for (let i = 0; i < 4; i++) {
        const px = camX + w * (0.2 + 0.22 * i) + Math.sin(t * 0.13 + i * 2.1) * 90;
        const py = camY + h * (0.3 + 0.16 * (i % 3)) + Math.cos(t * 0.11 + i * 1.7) * 70;
        Art.glow(g, i % 2 ? 'shadow' : 'arcane', px, py, 460, 0.055);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      // --- world layers -------------------------------------
      this.drawPool(g, this.zonePool);
      this.drawPool(g, this.meteorPool);
      this.drawPool(g, this.pickupPool);

      // Depth-sort so the crowd overlaps convincingly
      const en = this.enemyPool.active;
      const vis = this._buf();
      const pad = 120;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (e.dead) continue;
        if (e.x < camX - pad || e.x > camX + w + pad || e.y < camY - pad || e.y > camY + h + pad) continue;
        vis.push(e);
      }
      vis.sort((a, b) => a.y - b.y);
      for (let i = 0; i < vis.length; i++) vis[i].draw(g);
      for (const b of this.bosses) if (!b.dead) b.draw(g);

      this.drawBeams(g);
      this.drawPool(g, this.batPool);
      this.player.draw(g);
      this.drawOrbitals(g);
      this.drawSiphon(g);

      g.globalCompositeOperation = 'lighter';
      this.drawPool(g, this.boltPool);
      this.drawPool(g, this.novaPool);
      const bl = this.bulletPool.active;
      for (let i = 0; i < bl.length; i++) if (!bl[i].dead) bl[i].draw(g);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < bl.length; i++) if (!bl[i].dead) bl[i].drawCore(g);

      FX.draw(g);
      this.player.drawCore(g);
      FX.drawText(g);

      // --- screen space -------------------------------------
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawVignette(g, w, h);
      this.drawOffscreenMarkers(g, w, h, camX, camY);
    },

    drawPool(g, pool) {
      const a = pool.active;
      for (let i = 0; i < a.length; i++) if (!a[i].dead) a[i].draw(g);
    },

    drawOrbitals(g) {
      const p = this.player;
      g.globalCompositeOperation = 'lighter';
      for (const sp of p.spells) {
        if ((sp.id === 'orbs' || sp.id === 'ward') && sp._pos) {
          const color = sp.id === 'orbs' ? 'arcane' : 'frost';
          const n = sp._posCount || 0;
          for (let i = 0; i < n; i++) {
            const o = sp._pos[i];
            if (!o) continue;
            Art.glow(g, color, o.x, o.y, sp.id === 'orbs' ? 46 : 54, 0.9);
          }
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      // Sigils get a rune ring so they read as wards, not orbs.
      for (const sp of p.spells) {
        if (sp.id !== 'ward' || !sp._pos) continue;
        g.strokeStyle = 'rgba(220,240,255,.85)';
        g.lineWidth = 2;
        for (let i = 0; i < (sp._posCount || 0); i++) {
          const o = sp._pos[i];
          if (!o) continue;
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * TAU + this.time * 2;
            const px = o.x + Math.cos(a) * 11, py = o.y + Math.sin(a) * 11;
            k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
          }
          g.stroke();
        }
      }
    },

    drawBeams(g) {
      const p = this.player;
      for (const sp of p.spells) {
        if (sp.id !== 'beam' || !sp.beamCount) continue;
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < sp.beamCount; i++) {
          const a = (sp.beamA || 0) + (i / sp.beamCount) * TAU;
          g.save();
          g.translate(p.x, p.y);
          g.rotate(a);
          const grd = g.createLinearGradient(0, 0, sp.beamLen, 0);
          const col = sp.beamBurn ? '#ffd479' : '#fff0c0';
          grd.addColorStop(0, 'rgba(255,255,255,.85)');
          grd.addColorStop(0.25, col + 'aa');
          grd.addColorStop(1, 'rgba(255,200,90,0)');
          g.fillStyle = grd;
          const wdt = sp.beamBurn ? 26 : 18;
          g.beginPath();
          g.moveTo(0, -wdt * 0.4);
          g.lineTo(sp.beamLen, -wdt);
          g.lineTo(sp.beamLen, wdt);
          g.lineTo(0, wdt * 0.4);
          g.closePath();
          g.fill();
          g.restore();
        }
        Art.glow(g, 'holy', p.x, p.y, 70, 0.7);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    },

    drawSiphon(g) {
      const p = this.player;
      for (const sp of p.spells) {
        if (sp.id !== 'siphon' || !sp._links || !sp._links.length) continue;
        g.globalCompositeOperation = 'lighter';
        for (const e of sp._links) {
          if (!e || e.dead) continue;
          const grd = g.createLinearGradient(p.x, p.y, e.x, e.y);
          grd.addColorStop(0, 'rgba(255,180,200,.9)');
          grd.addColorStop(1, 'rgba(255,60,110,.35)');
          g.strokeStyle = grd;
          g.lineWidth = 5;
          g.beginPath();
          g.moveTo(p.x, p.y);
          const mx = (p.x + e.x) / 2 + Math.sin(this.time * 9) * 16;
          const my = (p.y + e.y) / 2 + Math.cos(this.time * 9) * 16;
          g.quadraticCurveTo(mx, my, e.x, e.y);
          g.stroke();
          Art.glow(g, 'blood', e.x, e.y, 40, 0.6);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    },

    drawVignette(g, w, h) {
      const p = this.player;
      // Creeping Fog pulls the dark in hard and leaves only a small
      // pool of sight around the player.
      const fog = this.curse.fog;
      const inner = Math.min(w, h) * (fog ? 0.10 : 0.34);
      const outer = Math.max(w, h) * (fog ? 0.40 : 0.72);
      const grd = g.createRadialGradient(w / 2, h / 2, inner, w / 2, h / 2, outer);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(1, fog ? 'rgba(0,0,0,0.97)' : 'rgba(0,0,0,0.62)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      if (fog) {
        // Drifting murk, so the edge of vision is not a static ring.
        g.globalCompositeOperation = 'multiply';
        for (let i = 0; i < 3; i++) {
          const t = this.time * 0.06 + i * 2.1;
          const gx = w / 2 + Math.cos(t) * w * 0.22;
          const gy = h / 2 + Math.sin(t * 1.3) * h * 0.22;
          const g2 = g.createRadialGradient(gx, gy, 0, gx, gy, Math.min(w, h) * 0.42);
          g2.addColorStop(0, 'rgba(120,120,150,1)');
          g2.addColorStop(1, 'rgba(255,255,255,1)');
          g.fillStyle = g2;
          g.fillRect(0, 0, w, h);
        }
        g.globalCompositeOperation = 'source-over';
      }

      // Blood haze when the player is nearly gone
      const hurt = 1 - clamp(p.hp / p.maxhp, 0, 1);
      if (hurt > 0.55) {
        const a = (hurt - 0.55) / 0.45;
        const g2 = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2,
                                          w / 2, h / 2, Math.max(w, h) * 0.62);
        g2.addColorStop(0, 'rgba(180,10,40,0)');
        g2.addColorStop(1, `rgba(180,10,40,${0.45 * a * (0.7 + Math.sin(this.time * 6) * 0.3)})`);
        g.fillStyle = g2;
        g.fillRect(0, 0, w, h);
      }
    },

    /** Arrows for the boss and for elites that wander off-screen. */
    drawOffscreenMarkers(g, w, h, camX, camY) {
      const marks = [];
      if (this.activeBoss && !this.activeBoss.dead) marks.push({ e: this.activeBoss, c: '#ff7a5f' });
      const en = this.enemyPool.active;
      for (let i = 0; i < en.length; i++) if (en[i].elite && !en[i].dead) marks.push({ e: en[i], c: '#c96fff' });

      for (const m of marks) {
        const sx = m.e.x - camX, sy = m.e.y - camY;
        if (sx > 40 && sx < w - 40 && sy > 40 && sy < h - 40) continue;
        const cx = w / 2, cy = h / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const rx = Math.min(w / 2 - 34, Math.abs(Math.cos(a)) > 0.0001 ? Math.abs((w / 2 - 34) / Math.cos(a)) : 1e9);
        const ry = Math.min(h / 2 - 34, Math.abs(Math.sin(a)) > 0.0001 ? Math.abs((h / 2 - 34) / Math.sin(a)) : 1e9);
        const r = Math.min(rx, ry);
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        g.save();
        g.translate(px, py);
        g.rotate(a);
        g.fillStyle = m.c;
        g.globalAlpha = 0.85;
        g.beginPath();
        g.moveTo(12, 0); g.lineTo(-8, -8); g.lineTo(-8, 8);
        g.closePath(); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    },

    /** Slow drifting motes behind the title screen. */
    renderMenuBg(g, w, h) {
      const t = performance.now() / 1000;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const x = ((i * 137.5 + t * (12 + i % 5 * 6)) % (w + 200)) - 100;
        const y = (Math.sin(t * 0.4 + i) * 0.5 + 0.5) * h;
        Art.glow(g, i % 3 === 0 ? 'ember' : i % 3 === 1 ? 'arcane' : 'life',
                 x, y, 40 + (i % 4) * 26, 0.16);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    },
  };

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function res(v, k, gold) {
    return `<div class="res${gold ? ' gold' : ''}"><div class="rv">${v}</div><div class="rk">${k}</div></div>`;
  }

  W.Game = Game;
  addEventListener('DOMContentLoaded', () => Game.init());
  if (document.readyState !== 'loading') Game.init();
})(window);
