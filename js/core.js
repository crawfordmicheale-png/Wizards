/* ============================================================
   core.js — math, RNG, input, audio synthesis, persistence
   ============================================================ */
(function (global) {
  'use strict';
  const W = (global.W = global.W || {});

  /* ---------------------------------------------------------
     Math
     --------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const dist2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const chance = (p) => Math.random() < p;
  /** Shortest-path angle interpolation. */
  const angleLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % TAU) - Math.PI;
    if (d < -Math.PI) d += TAU;
    return a + d * t;
  };
  /** Fisher-Yates, in place. */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /** Framerate-independent exponential smoothing factor. */
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

  W.TAU = TAU;
  Object.assign(W, { clamp, lerp, dist, dist2, rand, randInt, pick, chance, angleLerp, shuffle, damp });

  /* ---------------------------------------------------------
     Object pool — bullets and particles churn hard enough that
     allocation shows up in frame times.
     --------------------------------------------------------- */
  class Pool {
    constructor(factory) {
      this.factory = factory;
      this.free = [];
      this.active = [];
    }
    spawn() {
      const o = this.free.pop() || this.factory();
      o.dead = false;
      this.active.push(o);
      return o;
    }
    /** Compacts `active`, recycling anything flagged dead. */
    sweep() {
      const a = this.active;
      let w = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i].dead) this.free.push(a[i]);
        else a[w++] = a[i];
      }
      a.length = w;
    }
    clear() {
      for (const o of this.active) this.free.push(o);
      this.active.length = 0;
    }
  }
  W.Pool = Pool;

  /* ---------------------------------------------------------
     Spatial hash — hundreds of enemies vs hundreds of
     projectiles is O(n*m) without it.
     --------------------------------------------------------- */
  class SpatialGrid {
    constructor(cell = 96) {
      this.cell = cell;
      this.map = new Map();
    }
    _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
    clear() { this.map.clear(); }
    insert(o) {
      const c = this.cell;
      const k = this._key(Math.floor(o.x / c), Math.floor(o.y / c));
      let b = this.map.get(k);
      if (!b) { b = []; this.map.set(k, b); }
      b.push(o);
    }
    /** Collects entities in every cell overlapping the query circle. */
    query(x, y, r, out) {
      out.length = 0;
      const c = this.cell;
      const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
      const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const b = this.map.get(this._key(cx, cy));
          if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
        }
      }
      return out;
    }
  }
  W.SpatialGrid = SpatialGrid;

  /* ---------------------------------------------------------
     Input
     --------------------------------------------------------- */
  const Input = {
    keys: Object.create(null),
    pressed: Object.create(null),   // edge-triggered, cleared each frame
    ax: 0, ay: 0,                   // normalised movement vector
    touch: { active: false, dx: 0, dy: 0 },
    dashQueued: false,

    init() {
      const norm = (e) => {
        const k = e.key;
        if (k === ' ' || k === 'Spacebar') return 'space';
        return k.length === 1 ? k.toLowerCase() : k;
      };
      addEventListener('keydown', (e) => {
        const k = norm(e);
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if (['space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      });
      addEventListener('keyup', (e) => { this.keys[norm(e)] = false; });
      addEventListener('blur', () => { this.keys = Object.create(null); });
      this._initTouch();
    },

    _initTouch() {
      const stick = document.getElementById('stick');
      const nub = document.getElementById('stickNub');
      const dashBtn = document.getElementById('dashBtn');
      if (!stick) return;
      let id = null, ox = 0, oy = 0;
      const R = 52;

      const start = (e) => {
        const t = e.changedTouches[0];
        id = t.identifier; ox = t.clientX; oy = t.clientY;
        this.touch.active = true;
        stick.classList.add('active');
        const r = stick.getBoundingClientRect();
        nub.style.left = (ox - r.left) + 'px';
        nub.style.top = (oy - r.top) + 'px';
        e.preventDefault();
      };
      const move = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== id) continue;
          let dx = t.clientX - ox, dy = t.clientY - oy;
          const m = Math.hypot(dx, dy);
          if (m > R) { dx = dx / m * R; dy = dy / m * R; }
          this.touch.dx = dx / R; this.touch.dy = dy / R;
          e.preventDefault();
        }
      };
      const end = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier !== id) continue;
          id = null;
          this.touch.active = false; this.touch.dx = this.touch.dy = 0;
          stick.classList.remove('active');
        }
      };
      stick.addEventListener('touchstart', start, { passive: false });
      stick.addEventListener('touchmove', move, { passive: false });
      stick.addEventListener('touchend', end);
      stick.addEventListener('touchcancel', end);
      dashBtn.addEventListener('touchstart', (e) => { this.dashQueued = true; e.preventDefault(); }, { passive: false });
    },

    /** Call once per frame, before systems read `ax`/`ay`. */
    update() {
      let x = 0, y = 0;
      const k = this.keys;
      if (k['a'] || k['ArrowLeft']) x -= 1;
      if (k['d'] || k['ArrowRight']) x += 1;
      if (k['w'] || k['ArrowUp']) y -= 1;
      if (k['s'] || k['ArrowDown']) y += 1;
      if (this.touch.active) { x += this.touch.dx; y += this.touch.dy; }
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      this.ax = x; this.ay = y;
    },

    /** True once per physical key press. */
    once(k) {
      if (this.pressed[k]) { this.pressed[k] = false; return true; }
      return false;
    },
    wantsDash() {
      if (this.dashQueued) { this.dashQueued = false; return true; }
      return this.once('space');
    },
    endFrame() { this.pressed = Object.create(null); },
  };
  W.Input = Input;

  /* ---------------------------------------------------------
     Audio — everything is synthesised; no asset files, no
     network, and it survives being opened from file://
     --------------------------------------------------------- */
  const Audio_ = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: false, ready: false,
    _noiseBuf: null,
    _next: 0, _step: 0, _timer: null,

    init() {
      if (this.ctx) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      // A touch of hall on everything keeps the synth blips from
      // sounding like a 1980s calculator.
      const conv = this.ctx.createConvolver();
      conv.buffer = this._impulse(1.7, 2.6);
      const wet = this.ctx.createGain(); wet.gain.value = 0.22;
      conv.connect(wet); wet.connect(this.master);
      this.reverb = conv;

      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.34;
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55;
      this.musicGain.connect(this.master); this.musicGain.connect(conv);
      this.sfxGain.connect(this.master); this.sfxGain.connect(conv);

      // Shared white-noise buffer for impacts and whooshes.
      const n = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
      this.ready = true;
    },

    _impulse(dur, decay) {
      const rate = this.ctx.sampleRate, len = (rate * dur) | 0;
      const buf = this.ctx.createBuffer(2, len, rate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
      }
      return buf;
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.9;
    },

    /** Pitched blip with optional glide. */
    tone(freq, dur, opt = {}) {
      if (!this.ready || this.muted) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = opt.type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + dur);
      const vol = (opt.gain ?? 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (opt.filter) {
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = opt.filter;
        o.connect(f); node = f;
      }
      node.connect(g); g.connect(opt.bus || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },

    /** Filtered noise burst — impacts, whooshes, explosions. */
    noise(dur, opt = {}) {
      if (!this.ready || this.muted) return;
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
      s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = opt.type || 'bandpass';
      f.frequency.setValueAtTime(opt.freq || 900, t);
      if (opt.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, opt.to), t + dur);
      f.Q.value = opt.q ?? 1.2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(opt.gain ?? 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.sfxGain);
      s.start(t); s.stop(t + dur + 0.02);
    },

    /* --- Named cues ------------------------------------- */
    sfx(name) {
      if (!this.ready || this.muted) return;
      switch (name) {
        case 'shoot':   this.tone(680, 0.10, { type: 'triangle', to: 340, gain: 0.10 }); break;
        case 'fire':    this.noise(0.16, { freq: 1500, to: 380, gain: 0.13, q: 0.8 }); break;
        case 'ice':     this.tone(1250, 0.24, { type: 'sine', to: 720, gain: 0.13 }); break;
        case 'zap':     this.noise(0.10, { freq: 3600, to: 1500, gain: 0.14, type: 'highpass' });
                        this.tone(1500, 0.07, { type: 'square', to: 700, gain: 0.05 }); break;
        case 'hit':     this.noise(0.06, { freq: 1900, to: 700, gain: 0.10 }); break;
        case 'kill':    this.noise(0.16, { freq: 800, to: 150, gain: 0.14, type: 'lowpass', q: 0.7 }); break;
        case 'boom':    this.noise(0.5, { freq: 700, to: 55, gain: 0.34, type: 'lowpass', q: 0.6 });
                        this.tone(120, 0.42, { type: 'sine', to: 38, gain: 0.28 }); break;
        case 'hurt':    this.tone(230, 0.26, { type: 'sawtooth', to: 88, gain: 0.24, filter: 900 }); break;
        case 'pickup':  this.tone(880, 0.07, { type: 'sine', to: 1320, gain: 0.09 }); break;
        case 'coin':    this.tone(1320, 0.09, { type: 'triangle', to: 1760, gain: 0.10 }); break;
        case 'heal':    this.tone(520, 0.3, { type: 'sine', to: 1040, gain: 0.18 }); break;
        case 'level':   [523, 659, 784, 1046].forEach((f, i) =>
                          setTimeout(() => this.tone(f, 0.45, { type: 'triangle', gain: 0.19 }), i * 85)); break;
        case 'choose':  this.tone(760, 0.12, { type: 'triangle', to: 1140, gain: 0.14 }); break;
        case 'dash':    this.noise(0.2, { freq: 320, to: 2400, gain: 0.11, type: 'highpass' }); break;
        case 'boss':    this.tone(70, 1.5, { type: 'sawtooth', to: 44, gain: 0.3, filter: 320 });
                        this.noise(1.4, { freq: 260, to: 60, gain: 0.2, type: 'lowpass' }); break;
        case 'chest':   [659, 784, 988, 1319, 1568].forEach((f, i) =>
                          setTimeout(() => this.tone(f, 0.5, { type: 'sine', gain: 0.17 }), i * 70)); break;
        case 'death':   this.tone(300, 1.6, { type: 'sawtooth', to: 40, gain: 0.3, filter: 700 }); break;
        case 'win':     [523, 659, 784, 1046, 1319].forEach((f, i) =>
                          setTimeout(() => this.tone(f, 1.0, { type: 'triangle', gain: 0.2 }), i * 150)); break;
      }
    },

    /* --- Music -------------------------------------------
       A slow four-chord loop in A natural minor with a
       shifting arpeggio on top. Scheduled with a lookahead
       so it stays in time regardless of frame rate.
       --------------------------------------------------- */
    music: {
      playing: false, intensity: 0,
      // Am – F – C – G, as semitone offsets from A2
      chords: [[0, 3, 7, 12], [-4, 0, 5, 8], [3, 7, 10, 15], [-2, 2, 7, 10]],
    },

    startMusic() {
      if (!this.ready || this.music.playing) return;
      this.music.playing = true;
      this._step = 0;
      this._next = this.ctx.currentTime + 0.1;
      const tick = () => {
        if (!this.music.playing) return;
        while (this._next < this.ctx.currentTime + 0.25) {
          this._scheduleStep(this._step, this._next);
          this._next += 0.1305;           // ~115 BPM sixteenths
          this._step++;
        }
        this._timer = setTimeout(tick, 25);
      };
      tick();
    },
    stopMusic() {
      this.music.playing = false;
      clearTimeout(this._timer);
    },

    _scheduleStep(step, t) {
      const m = this.music;
      const bar = (step >> 4) % m.chords.length;
      const ch = m.chords[bar];
      const s = step % 16;
      const midi = (semi) => 55 * Math.pow(2, semi / 12);   // A1 root
      const g = this.musicGain;

      // Bass on the downbeat and the "and" of 3
      if (s === 0 || s === 10) {
        this._voice(midi(ch[0] - 12), t, 0.5, 'sine', 0.34, g, 220);
      }
      // Arpeggio — denser as the run heats up
      const density = 0.55 + m.intensity * 0.4;
      if (s % 2 === 0 || Math.random() < density * 0.35) {
        const note = ch[(step * 3 + (s >> 1)) % ch.length] + (s % 8 >= 4 ? 12 : 0);
        this._voice(midi(note + 12), t, 0.17, 'triangle', 0.11 + m.intensity * 0.05, g, 2600);
      }
      // Pad swell at the top of each bar
      if (s === 0) {
        for (const n of [ch[1], ch[2]]) {
          this._voice(midi(n), t, 1.9, 'sawtooth', 0.045, g, 620);
        }
      }
      // Heartbeat percussion once things get busy
      if (m.intensity > 0.3 && (s === 4 || s === 12)) {
        this.noise(0.09, { freq: 3400, gain: 0.035 * m.intensity, type: 'highpass' });
      }
    },

    _voice(freq, t, dur, type, vol, bus, cutoff) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = type; o.frequency.value = freq;
      f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + dur + 0.05);
    },
  };
  W.Audio = Audio_;

  /* ---------------------------------------------------------
     Persistence
     --------------------------------------------------------- */
  const KEY = 'hexhollow.save.v1';
  const Save = {
    data: null,
    _default() {
      return { shards: 0, meta: {}, best: 0, runs: 0, kills: 0, muted: false,
               char: 'ember', wins: 0, curses: [], stage: 'hollow',
               // Progression counters. Deeds are predicates over these.
               bestLevel: 0, essence: 0, bossKills: 0, evolutions: 0, chests: 0,
               settings: { shake: 1, particles: 1, numbers: true } };
    },
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.data = raw ? Object.assign(this._default(), JSON.parse(raw)) : this._default();
      } catch (e) {
        this.data = this._default();
      }
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
    },
    wipe() { this.data = this._default(); this.save(); },
    rank(id) { return this.data.meta[id] || 0; },
  };
  W.Save = Save;

})(window);
