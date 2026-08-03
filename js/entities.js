/* ============================================================
   entities.js — actors, projectiles, effects.
   Everything here is pooled or reset-in-place; the hot loops
   allocate as little as possible.
   ============================================================ */
(function (global) {
  'use strict';
  const W = global.W;
  const TAU = W.TAU;
  const { clamp, lerp, rand, randInt, pick, chance, damp, dist } = W;
  const Art = W.Art;

  /* =========================================================
     PARTICLES / FX
     ========================================================= */
  class Particle {
    constructor() { this.dead = true; }
  }

  const FX = {
    pool: new W.Pool(() => new Particle()),
    arcs: [],
    texts: [],
    rings: [],
    shake: 0, shakeDecay: 6,
    quality: 1,

    reset() {
      this.pool.clear();
      this.arcs.length = this.texts.length = this.rings.length = 0;
      this.shake = 0;
    },

    p(x, y, vx, vy, life, size, color, opt) {
      opt = opt || {};
      const o = this.pool.spawn();
      o.x = x; o.y = y; o.vx = vx; o.vy = vy;
      o.life = o.maxLife = life;
      o.size = size; o.color = color;
      o.drag = opt.drag ?? 2.4;
      o.grav = opt.grav ?? 0;
      o.grow = opt.grow ?? 0;
      o.soft = !!opt.soft;
      return o;
    },

    spark(x, y, color, n, spd) {
      n = Math.round(n * this.quality);
      spd = spd || 190;
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), s = rand(spd * 0.3, spd);
        this.p(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.22, 0.5), rand(5, 13), color, { drag: 3.2 });
      }
    },

    burst(x, y, color, n, spd, size) {
      n = Math.round(n * this.quality);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.2, 0.2), s = rand(spd * 0.4, spd);
        this.p(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), rand(size * 0.5, size), color,
               { drag: 2.0, grow: 14 });
      }
    },

    smoke(x, y, color, n) {
      n = Math.round(n * this.quality);
      for (let i = 0; i < n; i++) {
        this.p(x + rand(-8, 8), y + rand(-8, 8), rand(-24, 24), rand(-40, -8),
               rand(0.6, 1.3), rand(12, 26), color, { drag: 1.1, grow: 20, soft: true });
      }
    },

    trail(x, y, color, size) {
      if (this.quality < 0.6 && chance(0.5)) return;
      this.p(x + rand(-2, 2), y + rand(-2, 2), rand(-14, 14), rand(-14, 14),
             rand(0.16, 0.34), size, color, { drag: 4 });
    },

    ring(x, y, r0, r1, color, dur, width) {
      this.rings.push({ x, y, r: r0, r0, r1, color, t: 0, dur: dur || 0.35, w: width || 4 });
    },

    lightning(points, color, dur) {
      this.arcs.push({ pts: points.slice(), color, t: 0, dur: dur || 0.2, seed: Math.random() * 1000 });
    },

    /* Damage numbers are rationed. With hundreds of hits a second an
       unthrottled stream buries the thing it is annotating. */
    text(x, y, str, color, size, priority) {
      if (this.texts.length > 70) return;
      if (!priority) {
        if (this.textAllow < 1) return;
        this.textAllow -= 1;
      }
      this.texts.push({ x, y, str, color, t: 0, dur: 0.85, size: size || 15, vy: -46, vx: rand(-18, 18) });
    },

    kick(amount) { this.shake = Math.min(28, this.shake + amount); },

    update(dt) {
      this.textAllow = Math.min(16, (this.textAllow || 0) + 24 * dt);
      const a = this.pool.active;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        o.life -= dt;
        if (o.life <= 0) { o.dead = true; continue; }
        const d = 1 - Math.min(1, o.drag * dt);
        o.vx *= d; o.vy *= d;
        o.vy += o.grav * dt;
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.grow) o.size += o.grow * dt;
      }
      this.pool.sweep();

      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        if (r.t >= r.dur) { this.rings.splice(i, 1); continue; }
        r.r = lerp(r.r0, r.r1, 1 - Math.pow(1 - r.t / r.dur, 2));
      }
      for (let i = this.arcs.length - 1; i >= 0; i--) {
        this.arcs[i].t += dt;
        if (this.arcs[i].t >= this.arcs[i].dur) this.arcs.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.t += dt;
        if (t.t >= t.dur) { this.texts.splice(i, 1); continue; }
        t.y += t.vy * dt; t.x += t.vx * dt;
        t.vy += 60 * dt;
      }
      this.shake = Math.max(0, this.shake - this.shake * this.shakeDecay * dt - 6 * dt);
    },

    draw(g) {
      // Additive glow pass — particles, rings, arcs
      g.globalCompositeOperation = 'lighter';
      const a = this.pool.active;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        const k = o.life / o.maxLife;
        const img = o.soft ? Art.soft : (Art.glows[o.color] || Art.glows.white);
        g.globalAlpha = k * k;
        const s = o.size * (0.5 + k * 0.7);
        g.drawImage(img, o.x - s / 2, o.y - s / 2, s, s);
      }

      g.globalAlpha = 1;
      for (const r of this.rings) {
        const k = 1 - r.t / r.dur;
        g.globalAlpha = k * 0.85;
        g.strokeStyle = Art.glowColor[r.color] || '#fff';
        g.lineWidth = r.w * k + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r, 0, TAU); g.stroke();
      }

      for (const arc of this.arcs) {
        const k = 1 - arc.t / arc.dur;
        const col = Art.glowColor[arc.color] || '#fff';
        for (let pass = 0; pass < 2; pass++) {
          g.globalAlpha = k * (pass ? 1 : 0.4);
          g.strokeStyle = pass ? '#ffffff' : col;
          g.lineWidth = pass ? 2 : 8;
          g.beginPath();
          for (let i = 0; i < arc.pts.length - 1; i++) {
            const p0 = arc.pts[i], p1 = arc.pts[i + 1];
            g.moveTo(p0.x, p0.y);
            const segs = 4;
            for (let s = 1; s <= segs; s++) {
              const t = s / segs;
              const jx = s === segs ? 0 : Math.sin(arc.seed + i * 7 + s * 3.1) * 13;
              const jy = s === segs ? 0 : Math.cos(arc.seed + i * 5 + s * 2.7) * 13;
              g.lineTo(lerp(p0.x, p1.x, t) + jx, lerp(p0.y, p1.y, t) + jy);
            }
          }
          g.stroke();
        }
      }

      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    },

    drawText(g) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = 1 - t.t / t.dur;
        g.globalAlpha = Math.min(1, k * 2.2);
        g.font = `800 ${t.size}px "Trebuchet MS", sans-serif`;
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(0,0,0,.8)';
        g.strokeText(t.str, t.x, t.y);
        g.fillStyle = t.color;
        g.fillText(t.str, t.x, t.y);
      }
      g.globalAlpha = 1;
    },
  };
  W.FX = FX;

  /* =========================================================
     PLAYER
     ========================================================= */
  class Player {
    constructor(charDef, meta) {
      this.def = charDef;
      this.spr = Art.sprites[charDef.spr];
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.facingAngle = 0;
      this.r = 18;            // body radius (contact damage)
      this.core = 7;          // soul-core radius (enemy bullets)
      this.bob = 0;

      this.level = 1;
      this.xp = 0;
      this.xpNext = 5;

      this.spells = [];       // {id, level, cd, evolved, ...}
      this.passives = {};     // id -> level

      this.iframe = 0;
      this.hitCd = 0;
      this.dashCd = 0;
      this.dashTime = 0;
      this.dashDir = { x: 1, y: 0 };
      this.flash = 0;
      this.dead = false;

      this.meta = meta;
      this.bonusHp = 0;
      this.stat = {};
      this.recalc();
      this.hp = this.maxhp;
      this.revives = this.stat.revives;
      this.rerolls = this.stat.rerolls;
      this.addSpell(charDef.start);
    }

    /** Rebuild derived stats from character, passives and vault ranks. */
    recalc() {
      const m = this.meta;
      const c = this.def.mods || {};
      const P = W.Content.passives;
      const lv = (id) => this.passives[id] || 0;

      const s = this.stat = {
        damage: 1, area: 1, cdr: 1, speed: 1, maxhp: this.def.hp,
        projectiles: 0, pickup: 1, dr: 0, regen: 0,
        xpBonus: 1, shardBonus: 1, revives: 0, rerolls: 1,
      };

      // Vault
      s.damage += m.damage; s.maxhp += m.maxhp; s.speed += m.speed;
      s.cdr += m.cdr; s.regen += m.regen; s.pickup += m.pickup;
      s.xpBonus += m.xpBonus; s.shardBonus += m.shardBonus;
      s.revives += m.revives; s.rerolls += m.rerolls;

      // Character
      s.damage += c.damage || 0;
      s.area += c.area || 0;
      s.speed += c.speed || 0;
      s.cdr += c.cdr || 0;
      s.regen += c.regen || 0;
      s.pickup += c.pickup || 0;
      s.maxhp += c.maxhp || 0;

      // Passives
      s.damage += lv('grimoire') * P.grimoire.per;
      s.speed += lv('boots') * P.boots.per;
      s.maxhp += lv('amulet') * P.amulet.per + this.bonusHp;
      s.cdr += lv('hourglass') * P.hourglass.per;
      s.area += lv('lens') * P.lens.per;
      s.projectiles += lv('ring') * P.ring.per;
      s.pickup += lv('lodestone') * P.lodestone.per;
      s.dr += lv('ward_p') * P.ward_p.per;
      s.regen += lv('moonstone') * P.moonstone.per;
      s.xpBonus += lv('cat') * P.cat.per;
      s.shardBonus += lv('cat') * P.cat.per;

      s.dr = clamp(s.dr, 0, 0.75);
      this.maxhp = Math.round(s.maxhp);
      this.baseSpeed = 208 * s.speed;
      this.pickupRadius = 92 * s.pickup;
    }

    addSpell(id) {
      let sp = this.spells.find((s) => s.id === id);
      if (sp) { sp.level = Math.min(8, sp.level + 1); return sp; }
      if (this.spells.length >= 6) return null;
      sp = { id, level: 1, cd: 0.35, evolved: false, orbs: [], sigils: [] };
      this.spells.push(sp);
      return sp;
    }

    addPassive(id) {
      const cap = W.Content.passives[id].max;
      this.passives[id] = Math.min(cap, (this.passives[id] || 0) + 1);
      const before = this.maxhp;
      this.recalc();
      if (id === 'amulet') this.hp += this.maxhp - before;
      if (id === 'feather') this.revives += 1;
      this.hp = Math.min(this.hp, this.maxhp);
    }

    evolve(id) {
      const sp = this.spells.find((s) => s.id === id);
      if (sp) { sp.evolved = true; sp.level = 8; }
    }

    gainXp(n, g) {
      this.xp += n;
      let leveled = 0;
      while (this.xp >= this.xpNext) {
        this.xp -= this.xpNext;
        this.level++;
        leveled++;
        // Gentle early curve, steeper once builds come online.
        this.xpNext = Math.round(4 + this.level * 2.6 + Math.pow(this.level, 1.5) * 1.2);
      }
      if (leveled) g.queueLevelUps(leveled);
    }

    hurt(amount, g) {
      if (this.iframe > 0 || this.dashTime > 0 || this.dead) return;
      const dmg = Math.max(1, amount * (1 - this.stat.dr));
      this.hp -= dmg;
      this.iframe = 0.62;
      this.flash = 0.16;
      FX.kick(6 + Math.min(10, dmg * 0.3));
      FX.text(this.x, this.y - 26, '-' + Math.round(dmg), '#ff8fa8', 17, true);
      FX.spark(this.x, this.y, 'blood', 10, 150);
      g.audio('hurt');
      if (this.hp <= 0) g.playerDown();
    }

    heal(n) {
      const before = this.hp;
      this.hp = Math.min(this.maxhp, this.hp + n);
      const got = this.hp - before;
      if (got > 0.9) FX.text(this.x, this.y - 30, '+' + Math.round(got), '#8fffb0', 15);
    }

    update(dt, g) {
      const In = W.Input;
      this.iframe = Math.max(0, this.iframe - dt);
      this.hitCd = Math.max(0, this.hitCd - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.flash = Math.max(0, this.flash - dt);

      // --- Dash / Blink -------------------------------------
      if (this.dashTime > 0) {
        this.dashTime -= dt;
        const s = 780;
        this.x += this.dashDir.x * s * dt;
        this.y += this.dashDir.y * s * dt;
        FX.p(this.x, this.y + 8, rand(-30, 30), rand(-30, 30), 0.3, rand(14, 24), 'volt', { drag: 3, soft: true });
      } else {
        let ax = In.ax, ay = In.ay;
        if (In.wantsDash() && this.dashCd <= 0) {
          const m = Math.hypot(ax, ay);
          this.dashDir = m > 0.1 ? { x: ax / m, y: ay / m } : { x: this.facing, y: 0 };
          this.dashTime = 0.17;
          this.dashCd = 1.6;
          g.audio('dash');
          FX.burst(this.x, this.y, 'volt', 14, 220, 16);
        }
        const target = this.baseSpeed;
        const k = damp(16, dt);
        this.vx = lerp(this.vx, ax * target, k);
        this.vy = lerp(this.vy, ay * target, k);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        if (Math.abs(ax) > 0.1) this.facing = ax > 0 ? 1 : -1;
        if (m2(ax, ay) > 0.01) this.facingAngle = Math.atan2(ay, ax);
      }

      this.bob += dt * (m2(this.vx, this.vy) > 400 ? 9 : 4);

      // --- Regen --------------------------------------------
      if (this.stat.regen > 0 && this.hp < this.maxhp) {
        this.hp = Math.min(this.maxhp, this.hp + this.stat.regen * dt);
      }

      // --- Spells -------------------------------------------
      const defs = W.Content.spells;
      for (const sp of this.spells) {
        const def = defs[sp.id];
        if (def.passive) { def.sync(g, this, sp); continue; }
        sp.cd -= dt;
        if (sp.cd <= 0) {
          const s = W.Content.stats(this, sp);
          sp.cd = Math.max(0.1, s.cd);
          def.cast(g, this, sp);
        }
      }
    }

    draw(g) {
      const bobY = Math.sin(this.bob) * 2.5;
      // Shadow
      g.globalAlpha = 0.35;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(this.x, this.y + this.spr.h * 0.44, 16, 6, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;

      if (this.iframe > 0 && Math.floor(this.iframe * 20) % 2 === 0) g.globalAlpha = 0.45;
      Art.draw(g, this.spr, this.x, this.y + bobY - 6, this.facing, 1, this.flash > 0);
      g.globalAlpha = 1;
    }

    /** Small glowing hitbox — reads as a soul and shows the true target. */
    drawCore(g) {
      g.globalCompositeOperation = 'lighter';
      const pulse = 0.7 + Math.sin(this.bob * 2.2) * 0.18;
      Art.glow(g, this.dashTime > 0 ? 'volt' : 'frost', this.x, this.y + 4, 30 * pulse, 0.75);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      // Dark rim, then bright core — the player must stay findable no
      // matter how much light is piled on top of them.
      g.strokeStyle = 'rgba(6,3,14,.85)';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(this.x, this.y + 4, 5.4, 0, TAU); g.stroke();
      g.fillStyle = this.iframe > 0 ? '#ffd0d8' : '#ffffff';
      g.beginPath(); g.arc(this.x, this.y + 4, 4, 0, TAU); g.fill();
    }
  }
  const m2 = (x, y) => x * x + y * y;
  W.Player = Player;

  /* =========================================================
     ENEMY
     ========================================================= */
  class Enemy {
    constructor() { this.dead = true; }

    init(def, x, y, scale, elite) {
      this.def = def;
      this.spr = Art.sprites[def.spr];
      this.x = x; this.y = y;
      this.vx = this.vy = 0;
      this.kx = this.ky = 0;                 // knockback velocity
      this.maxhp = def.hp * (scale.hp || 1) * (elite ? 6 : 1);
      this.hp = this.maxhp;
      this.dmg = def.dmg * (scale.dmg || 1);
      this.spd = def.spd * (scale.spd || 1) * (elite ? 0.85 : 1);
      this.r = def.r * (elite ? 1.5 : 1);
      this.scaleV = elite ? 1.5 : 1;
      this.xp = def.xp * (elite ? 8 : 1);
      this.elite = !!elite;
      this.facing = 1;
      this.flash = 0;
      this.slow = 0; this.slowT = 0;
      this.stunT = 0;
      this.burnDps = 0; this.burnT = 0;
      this.atkT = def.atk ? rand(0.4, def.atk.cd) : 0;
      this.phase = rand(TAU);
      this.spin = 0;
      this.hitBy = null;                     // pierce bookkeeping
      this.boss = false;
      this.dead = false;
      this.bob = rand(TAU);
      return this;
    }

    damage(n, g, opt) {
      if (this.dead) return;
      opt = opt || {};
      let dmg = n;
      if (this.def.armor) dmg = Math.max(1, dmg - this.def.armor);
      this.hp -= dmg;
      this.flash = 0.1;
      if (g.showNumbers) {
        FX.text(this.x + rand(-6, 6), this.y - this.r - 6, Math.round(dmg),
                opt.crit ? '#fff2a8' : '#ffffff', opt.crit ? 17 : 14);
      }
      if (opt.knock) {
        const res = 1 - (this.def.knockResist || 0);
        this.kx += opt.knock.x * res;
        this.ky += opt.knock.y * res;
      }
      if (this.hp <= 0) this.kill(g, opt);
    }

    kill(g, opt) {
      if (this.dead) return;
      this.dead = true;
      g.onEnemyKilled(this, opt);
    }

    update(dt, g) {
      const p = g.player;
      this.flash = Math.max(0, this.flash - dt);
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.stunT > 0) this.stunT -= dt;
      if (this.burnT > 0) {
        this.burnT -= dt;
        this.hp -= this.burnDps * dt;
        if (chance(dt * 8)) FX.trail(this.x + rand(-8, 8), this.y + rand(-8, 8), 'fire', 12);
        if (this.hp <= 0) { this.kill(g, {}); return; }
      }

      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      let sx = 0, sy = 0;
      const spd = this.spd * (1 - this.slow) * (this.stunT > 0 ? 0 : 1);

      switch (this.def.ai) {
        case 'chase':
          sx = nx * spd; sy = ny * spd;
          break;

        case 'weave': {
          this.phase += dt * 5.5;
          const px = -ny, py = nx;
          const wob = Math.sin(this.phase) * 0.75;
          sx = (nx + px * wob) * spd;
          sy = (ny + py * wob) * spd;
          break;
        }

        case 'shooter': {
          // Advance until in range, then hold and loose arrows.
          const want = 260;
          const m = d > want ? 1 : (d < want * 0.7 ? -0.7 : 0);
          sx = nx * spd * m; sy = ny * spd * m;
          break;
        }

        case 'keepDist': {
          const want = this.def.dist;
          const m = d > want + 30 ? 1 : (d < want - 30 ? -1 : 0);
          const px = -ny, py = nx;
          sx = (nx * m + px * 0.45) * spd;
          sy = (ny * m + py * 0.45) * spd;
          break;
        }

        case 'orbit': {
          const want = this.def.dist;
          const radial = clamp((d - want) / 90, -1, 1);
          const px = -ny, py = nx;
          sx = (nx * radial + px * 0.9) * spd;
          sy = (ny * radial + py * 0.9) * spd;
          break;
        }

        case 'dash': {
          // Stalk, then commit to a fast lunge.
          this.phase -= dt;
          if (this.phase <= 0) {
            this.dashing = 0.55;
            this.phase = rand(1.8, 3.0);
            this.dvx = nx; this.dvy = ny;
          }
          if (this.dashing > 0) {
            this.dashing -= dt;
            sx = this.dvx * spd * 3.0;
            sy = this.dvy * spd * 3.0;
            if (chance(dt * 30)) FX.trail(this.x, this.y, 'void', 14);
          } else {
            sx = nx * spd * 0.5; sy = ny * spd * 0.5;
          }
          break;
        }
      }

      // Knockback decays quickly and overrides steering.
      this.x += (sx + this.kx) * dt;
      this.y += (sy + this.ky) * dt;
      const kd = 1 - Math.min(1, 7 * dt);
      this.kx *= kd; this.ky *= kd;

      if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
      this.bob += dt * 6;

      // --- Ranged attacks -----------------------------------
      const atk = this.def.atk;
      if (atk && this.stunT <= 0) {
        this.atkT -= dt;
        if (this.atkT <= 0 && d < 620) {
          this.atkT = atk.cd * rand(0.85, 1.2);
          this.fire(g, atk, nx, ny);
        }
      }
    }

    fire(g, atk, nx, ny) {
      const base = Math.atan2(ny, nx);
      const mul = g.bulletDmgMul;
      switch (atk.kind) {
        case 'aimed':
          g.spawnBullet(this.x, this.y, base, atk.spd, atk.dmg * mul, atk.color);
          break;
        case 'spread':
          for (let i = 0; i < atk.n; i++) {
            const a = base + (i - (atk.n - 1) / 2) * atk.spread;
            g.spawnBullet(this.x, this.y, a, atk.spd, atk.dmg * mul, atk.color);
          }
          break;
        case 'ring':
          for (let i = 0; i < atk.n; i++) {
            g.spawnBullet(this.x, this.y, (i / atk.n) * TAU + this.phase, atk.spd, atk.dmg * mul, atk.color);
          }
          break;
        case 'spiral':
          this.spin += 0.55;
          for (let i = 0; i < atk.n; i++) {
            g.spawnBullet(this.x, this.y, (i / atk.n) * TAU + this.spin, atk.spd, atk.dmg * mul, atk.color);
          }
          break;
      }
      FX.spark(this.x, this.y, atk.color, 4, 90);
      g.audio('shoot');
    }

    draw(g) {
      const s = this.scaleV;
      g.globalAlpha = 0.3;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(this.x, this.y + this.spr.h * 0.42 * s, this.r * 0.8, this.r * 0.3, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;

      if (this.elite) {
        g.globalCompositeOperation = 'lighter';
        Art.glow(g, 'void', this.x, this.y, this.r * 4, 0.4);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      const bobY = Math.sin(this.bob) * 1.6;
      Art.draw(g, this.spr, this.x, this.y + bobY, this.facing, s, this.flash > 0);

      if (this.slow > 0) {
        g.globalCompositeOperation = 'lighter';
        Art.glow(g, 'ice', this.x, this.y, this.r * 3, 0.28);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
  W.Enemy = Enemy;

  /* =========================================================
     BOSS — an Enemy with a scripted attack rotation
     ========================================================= */
  const PATTERNS = {
    spiral(g, b, dt) {
      b.tick -= dt;
      while (b.tick <= 0) {
        b.tick += 0.055;
        b.spin += 0.36;
        const arms = b.def.id === 'devourer' ? 5 : 3;
        for (let i = 0; i < arms; i++) {
          g.spawnBullet(b.x, b.y, b.spin + (i / arms) * TAU, 155, b.bulletDmg, b.def.color);
        }
      }
    },

    sweep(g, b, dt) {
      b.tick -= dt;
      while (b.tick <= 0) {
        b.tick += 0.09;
        b.sweepA = (b.sweepA || b.aimAngle) + Math.sin(b.stateT * 3.4) * 0.32;
        for (const s of [-1, 1]) {
          g.spawnBullet(b.x, b.y, b.sweepA + s * 0.45, 210, b.bulletDmg, b.def.color);
        }
      }
    },

    charge(g, b, dt) {
      if (!b.chargeSet) {
        b.chargeSet = true;
        b.cvx = Math.cos(b.aimAngle) * 430;
        b.cvy = Math.sin(b.aimAngle) * 430;
        FX.ring(b.x, b.y, b.r, b.r * 3, b.def.color, 0.4, 6);
      }
      b.x += b.cvx * dt; b.y += b.cvy * dt;
      FX.trail(b.x + rand(-20, 20), b.y + rand(-20, 20), b.def.color, 26);
      b.tick -= dt;
      if (b.tick <= 0) {
        b.tick += 0.12;
        g.spawnBullet(b.x, b.y, rand(TAU), 120, b.bulletDmg * 0.7, b.def.color);
      }
    },

    radial(g, b) {
      const n = 22 + (b.enraged ? 10 : 0);
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < n; i++) {
          g.spawnBullet(b.x, b.y, (i / n) * TAU + ring * (Math.PI / n) + b.spin,
                        160 + ring * 55, b.bulletDmg, b.def.color);
        }
      }
      b.spin += 0.3;
      FX.ring(b.x, b.y, b.r, b.r * 4, b.def.color, 0.45, 7);
      FX.kick(7);
      g.audio('boom');
    },

    ringWave(g, b) {
      b.waveQueue = 3;
      b.waveT = 0;
    },

    fan(g, b) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        g.spawnBullet(b.x, b.y, b.aimAngle + (i - (n - 1) / 2) * 0.15, 250, b.bulletDmg, b.def.color);
      }
      FX.spark(b.x, b.y, b.def.color, 12, 200);
    },

    shotgun(g, b) {
      for (let i = 0; i < 16; i++) {
        g.spawnBullet(b.x, b.y, b.aimAngle + rand(-0.55, 0.55), rand(180, 330), b.bulletDmg, b.def.color);
      }
      FX.kick(5);
    },

    blink(g, b) {
      const p = g.player;
      const a = rand(TAU), d = rand(190, 300);
      FX.burst(b.x, b.y, b.def.color, 26, 320, 22);
      b.x = p.x + Math.cos(a) * d;
      b.y = p.y + Math.sin(a) * d;
      FX.burst(b.x, b.y, b.def.color, 26, 320, 22);
      PATTERNS.radial(g, b);
    },

    summonBats(g, b) { g.summon(b, 'bat', 10); },
    summonSkeletons(g, b) { g.summon(b, 'skeleton', 8); },
    summonAll(g, b) {
      g.summon(b, 'wraith', 5);
      g.summon(b, 'cultist', 5);
      g.summon(b, 'batRed', 8);
    },
  };

  class Boss extends Enemy {
    initBoss(def, x, y, mult, scale) {
      this.init({ ...def, ai: 'chase' }, x, y, { hp: 1, dmg: 1, spd: 1 }, false);
      this.def = def;
      this.spr = Art.sprites[def.spr];
      this.boss = true;
      this.maxhp = def.hp * mult * (scale.bossHp || 1);
      this.hp = this.maxhp;
      this.dmg = def.dmg * (scale.dmg || 1);
      this.spd = def.spd;
      this.r = def.r;
      this.scaleV = 1;
      this.xp = def.xp;
      this.bulletDmg = 12 * (scale.dmg || 1);
      this.atkIndex = -1;
      this.state = 'move';
      this.stateT = 0;
      this.atkT = 2.0;
      this.tick = 0;
      this.spin = 0;
      this.aimAngle = 0;
      this.enraged = false;
      this.waveQueue = 0; this.waveT = 0;
      this.mult = mult;
      return this;
    }

    update(dt, g) {
      const p = g.player;
      this.flash = Math.max(0, this.flash - dt);
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.stunT > 0) this.stunT -= dt;
      if (this.burnT > 0) { this.burnT -= dt; this.hp -= this.burnDps * dt; }
      this.bob += dt * 3;

      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.aimAngle = Math.atan2(dy, dx);
      if (Math.abs(dx) > 6) this.facing = dx > 0 ? 1 : -1;

      if (!this.enraged && this.hp < this.maxhp * 0.4) {
        this.enraged = true;
        this.spd *= 1.3;
        this.bulletDmg *= 1.15;
        FX.ring(this.x, this.y, 20, 420, 'blood', 0.7, 10);
        FX.kick(16);
        g.audio('boss');
        g.banner('ENRAGED', '#ff7a5f');
      }

      // Delayed expanding volleys queued by ringWave
      if (this.waveQueue > 0) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.waveT = 0.45;
          this.waveQueue--;
          const n = 26;
          for (let i = 0; i < n; i++) {
            g.spawnBullet(this.x, this.y, (i / n) * TAU + this.waveQueue * 0.12,
                          130 + this.waveQueue * 40, this.bulletDmg, this.def.color);
          }
          FX.ring(this.x, this.y, this.r, this.r * 3.5, this.def.color, 0.4, 5);
        }
      }

      if (this.state === 'move') {
        const want = 190;
        const m = d > want ? 1 : -0.5;
        const spd = this.spd * (1 - this.slow) * (this.stunT > 0 ? 0 : 1);
        this.x += (dx / d) * spd * m * dt;
        this.y += (dy / d) * spd * m * dt;
        this.atkT -= dt;
        if (this.atkT <= 0) {
          this.atkIndex = (this.atkIndex + 1) % this.def.attacks.length;
          const a = this.def.attacks[this.atkIndex];
          this.state = 'attack';
          this.stateT = a.dur;
          this.tick = 0;
          this.fired = false;
          this.chargeSet = false;
          this.sweepA = this.aimAngle;
        }
      }

      if (this.state === 'attack') {
        const a = this.def.attacks[this.atkIndex];
        const fn = PATTERNS[a.fn];
        if (fn) {
          if (a.dur <= 0.15) {
            if (!this.fired) { this.fired = true; fn(g, this); }   // instant: fire once
          } else {
            fn(g, this, dt);                                       // sustained: tick
          }
        }
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.state = 'move';
          this.atkT = a.cd * (this.enraged ? 0.7 : 1);
        }
      }

      this.x += this.kx * dt; this.y += this.ky * dt;
      const kd = 1 - Math.min(1, 8 * dt);
      this.kx *= kd; this.ky *= kd;
    }

    draw(g) {
      g.globalAlpha = 0.42;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(this.x, this.y + this.spr.h * 0.42, this.r * 0.95, this.r * 0.32, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;

      g.globalCompositeOperation = 'lighter';
      Art.glow(g, this.def.color, this.x, this.y, this.r * (this.enraged ? 6.5 : 5),
               this.enraged ? 0.5 : 0.32);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      const bobY = Math.sin(this.bob) * 3;
      Art.draw(g, this.spr, this.x, this.y + bobY, this.facing, 1, this.flash > 0);
    }
  }
  W.Boss = Boss;
  W.BOSS_PATTERNS = PATTERNS;

  /* =========================================================
     PROJECTILES
     ========================================================= */

  /** Player projectile. */
  class Bolt {
    constructor() { this.dead = true; }
    init(o) {
      this.x = o.x; this.y = o.y;
      this.vx = Math.cos(o.a) * o.speed;
      this.vy = Math.sin(o.a) * o.speed;
      this.a = o.a;
      this.dmg = o.dmg;
      this.pierce = o.pierce || 0;
      this.r = o.r || 9;
      this.glow = o.glow || 'fire';
      this.life = o.life || 1.6;
      this.trail = o.trail;
      this.burst = o.burst || null;
      this.burn = o.burn || null;
      this.src = o.src;
      this.hit = new Set();
      this.dead = false;
      return this;
    }
    update(dt, g) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.trail) FX.trail(this.x, this.y, this.trail, this.r * 1.6);

      const found = g.queryEnemies(this.x, this.y, this.r + 30);
      for (let i = 0; i < found.length; i++) {
        const e = found[i];
        if (e.dead || this.hit.has(e)) continue;
        const rr = this.r + e.r;
        if (W.dist2(this.x, this.y, e.x, e.y) > rr * rr) continue;
        this.hit.add(e);
        g.damageEnemy(e, this.dmg, { src: this.src, knock: { x: this.vx * 0.22, y: this.vy * 0.22 } });
        if (this.burn) { e.burnDps = Math.max(e.burnDps, this.burn.dps); e.burnT = this.burn.dur; }
        FX.spark(this.x, this.y, this.glow, 5, 120);
        if (this.burst) {
          g.explode(this.x, this.y, this.burst.r, this.burst.dmg, this.glow, this.src);
        }
        if (this.pierce-- <= 0) { this.dead = true; return; }
      }
    }
    draw(g) {
      Art.glow(g, this.glow, this.x, this.y, this.r * 4.2, 0.9);
    }
  }

  /** Enemy projectile — the bullet-hell half of the game. */
  class Bullet {
    constructor() { this.dead = true; }
    init(x, y, a, speed, dmg, color) {
      this.x = x; this.y = y;
      this.vx = Math.cos(a) * speed;
      this.vy = Math.sin(a) * speed;
      this.dmg = dmg;
      this.color = color || 'void';
      this.r = 7;
      this.life = 7;
      this.t = 0;
      this.dead = false;
      return this;
    }
    update(dt, g) {
      this.life -= dt;
      this.t += dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      const p = g.player;
      const rr = this.r + p.core;
      if (W.dist2(this.x, this.y, p.x, p.y + 4) < rr * rr) {
        p.hurt(this.dmg, g);
        this.dead = true;
        FX.spark(this.x, this.y, this.color, 8, 140);
        return;
      }
      // Culled generously so off-screen bullets can still come back around
      if (W.dist2(this.x, this.y, p.x, p.y) > 1700 * 1700) this.dead = true;
    }
    draw(g) {
      Art.glow(g, this.color, this.x, this.y, 20, 0.55);
    }
    /* Hostile shots get a hard dark rim and a white core. Against a
       screen full of additive glow that silhouette is the only thing
       that stays readable — and in a bullet hell, reading the bullets
       is the whole game. */
    drawCore(g) {
      const c = Art.glowColor[this.color] || '#fff';
      g.fillStyle = 'rgba(6,3,14,.92)';
      g.beginPath(); g.arc(this.x, this.y, this.r + 2, 0, TAU); g.fill();
      g.fillStyle = c;
      g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(this.x, this.y, this.r * 0.45, 0, TAU); g.fill();
    }
  }

  /** Homing familiar. */
  class SpiritBat {
    constructor() { this.dead = true; }
    init(o) {
      this.x = o.x; this.y = o.y;
      this.vx = rand(-140, 140); this.vy = rand(-140, 140);
      this.dmg = o.dmg;
      this.life = o.life;
      this.hits = o.hits || 1;
      this.src = o.src;
      this.target = null;
      this.cool = 0;
      this.dead = false;
      this.spr = Art.sprites.bat;
      this.facing = 1;
      return this;
    }
    update(dt, g) {
      this.life -= dt;
      this.cool -= dt;
      if (this.life <= 0) {
        this.dead = true;
        FX.spark(this.x, this.y, 'shadow', 6, 90);
        return;
      }
      if (!this.target || this.target.dead) this.target = g.nearestEnemy(this.x, this.y, 700);
      if (this.target) {
        const a = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        const sp = 430;
        this.vx = lerp(this.vx, Math.cos(a) * sp, damp(6, dt));
        this.vy = lerp(this.vy, Math.sin(a) * sp, damp(6, dt));
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.facing = this.vx > 0 ? 1 : -1;
      FX.trail(this.x, this.y, 'shadow', 12);

      if (this.cool <= 0 && this.target && !this.target.dead) {
        const rr = 16 + this.target.r;
        if (W.dist2(this.x, this.y, this.target.x, this.target.y) < rr * rr) {
          g.damageEnemy(this.target, this.dmg, { src: this.src, crit: true });
          FX.spark(this.x, this.y, 'void', 8, 150);
          this.cool = 0.25;
          if (--this.hits <= 0) { this.dead = true; return; }
          this.target = null;
          this.vx *= -0.6; this.vy *= -0.6;
        }
      }
    }
    draw(g) {
      g.globalCompositeOperation = 'lighter';
      Art.glow(g, 'shadow', this.x, this.y, 44, 0.5);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      Art.draw(g, this.spr, this.x, this.y, this.facing, 0.85);
    }
  }

  /** Persistent ground effect — cauldron brew, frost field, craters. */
  class Zone {
    constructor() { this.dead = true; }
    init(o) {
      this.x = o.x; this.y = o.y;
      this.r = o.r;
      this.dps = o.dps;
      this.dur = o.dur; this.life = o.dur;
      this.color = o.color || 'toxic';
      this.slow = o.slow || 0;
      this.spread = !!o.spread;
      this.src = o.src;
      this.tick = 0;
      this.dead = false;
      this.seed = rand(TAU);
      return this;
    }
    update(dt, g) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = 0.25;
        const found = g.queryEnemies(this.x, this.y, this.r + 30);
        for (let i = 0; i < found.length; i++) {
          const e = found[i];
          if (e.dead) continue;
          const rr = this.r + e.r * 0.6;
          if (W.dist2(this.x, this.y, e.x, e.y) > rr * rr) continue;
          g.damageEnemy(e, this.dps * 0.25, { src: this.src });
          if (this.slow) { e.slow = Math.max(e.slow, this.slow); e.slowT = 0.6; }
        }
      }
      if (chance(dt * 14)) {
        const a = rand(TAU), d = Math.sqrt(Math.random()) * this.r;
        FX.p(this.x + Math.cos(a) * d, this.y + Math.sin(a) * d,
             rand(-8, 8), rand(-30, -6), rand(0.4, 0.9), rand(8, 16), this.color,
             { drag: 1.4, grow: 8 });
      }
    }
    draw(g) {
      const k = Math.min(1, this.life / 0.6) * Math.min(1, (this.dur - this.life) / 0.25 + 0.3);
      g.globalCompositeOperation = 'lighter';
      Art.glow(g, this.color, this.x, this.y, this.r * 2.4, 0.30 * k);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.30 * k;
      g.strokeStyle = Art.glowColor[this.color];
      g.lineWidth = 2;
      g.beginPath();
      const wob = Math.sin(this.seed + this.life * 3) * 3;
      g.arc(this.x, this.y, this.r + wob, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
    }
  }

  /** Telegraphed meteor strike. */
  class Meteor {
    constructor() { this.dead = true; }
    init(o) {
      this.x = o.x; this.y = o.y;
      this.dmg = o.dmg; this.r = o.r;
      this.delay = o.delay;
      this.total = o.delay;
      this.crater = o.crater;
      this.src = o.src;
      this.dead = false;
      return this;
    }
    update(dt, g) {
      this.delay -= dt;
      if (this.delay <= 0) {
        this.dead = true;
        g.explode(this.x, this.y, this.r, this.dmg, 'ember', this.src, true);
        if (this.crater) {
          g.spawnZone({ x: this.x, y: this.y, r: this.r * 0.7, dps: this.dmg * 0.25,
                        dur: 3, color: 'fire', src: this.src });
        }
      }
    }
    draw(g) {
      const k = 1 - this.delay / this.total;
      // Target reticle
      g.globalAlpha = 0.25 + k * 0.55;
      g.strokeStyle = '#ffb84f';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(this.x, this.y, this.r * (0.35 + k * 0.65), 0, TAU); g.stroke();
      g.globalAlpha = 0.18;
      g.fillStyle = '#ffb84f';
      g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.fill();
      g.globalAlpha = 1;

      // Incoming rock
      const h = (1 - k) * 620;
      g.globalCompositeOperation = 'lighter';
      Art.glow(g, 'ember', this.x + h * 0.35, this.y - h, 60, 0.9);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  /** Expanding damage ring (Frost Nova and friends). */
  class Nova {
    constructor() { this.dead = true; }
    init(o) {
      this.x = o.x; this.y = o.y;
      this.max = o.r; this.r = 10;
      this.dmg = o.dmg;
      this.slow = o.slow; this.dur = o.dur;
      this.freeze = o.freeze; this.shatter = o.shatter;
      this.color = o.color;
      this.t = 0; this.grow = 0.34;
      this.hit = new Set();
      this.dead = false;
      return this;
    }
    update(dt, g) {
      this.t += dt;
      const k = Math.min(1, this.t / this.grow);
      this.r = lerp(10, this.max, 1 - Math.pow(1 - k, 2));
      const found = g.queryEnemies(this.x, this.y, this.r + 40);
      for (let i = 0; i < found.length; i++) {
        const e = found[i];
        if (e.dead || this.hit.has(e)) continue;
        const rr = this.r + e.r;
        if (W.dist2(this.x, this.y, e.x, e.y) > rr * rr) continue;
        this.hit.add(e);
        let dmg = this.dmg;
        if (this.shatter && e.slow > 0) dmg *= 1.6;
        const a = Math.atan2(e.y - this.y, e.x - this.x);
        g.damageEnemy(e, dmg, { src: null, knock: { x: Math.cos(a) * 190, y: Math.sin(a) * 190 } });
        e.slow = Math.max(e.slow, this.freeze ? 1 : this.slow);
        e.slowT = this.dur;
        if (this.freeze) e.stunT = Math.max(e.stunT, this.dur * 0.6);
      }
      if (k >= 1) this.dead = true;
    }
    draw(g) {
      const k = 1 - this.t / this.grow;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.max(0, k) * 0.8;
      g.strokeStyle = Art.glowColor[this.color];
      g.lineWidth = 9 * k + 2;
      g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.stroke();
      g.globalAlpha = Math.max(0, k) * 0.4;
      g.lineWidth = 22 * k + 2;
      g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.stroke();
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  }

  /* =========================================================
     PICKUPS
     ========================================================= */
  const PICKUP_KIND = {
    xp1:    { spr: 'gem1', xp: 1,  glow: 'life' },
    xp2:    { spr: 'gem2', xp: 5,  glow: 'arcane' },
    xp3:    { spr: 'gem3', xp: 18, glow: 'void' },
    xp4:    { spr: 'gem4', xp: 60, glow: 'ember' },
    heart:  { spr: 'heart', heal: 26, glow: 'blood' },
    coin:   { spr: 'coin', shards: 5, glow: 'ember' },
    magnet: { spr: 'magnet', magnet: true, glow: 'arcane' },
    chest:  { spr: 'chest', chest: true, glow: 'ember' },
    bomb:   { spr: 'skull', bomb: true, glow: 'blood' },
  };

  class Pickup {
    constructor() { this.dead = true; }
    init(kind, x, y) {
      this.kind = kind;
      this.def = PICKUP_KIND[kind];
      this.spr = Art.sprites[this.def.spr];
      this.x = x; this.y = y;
      this.vx = rand(-70, 70); this.vy = rand(-70, 70);
      this.pulled = false;
      this.bob = rand(TAU);
      this.age = 0;
      this.dead = false;
      return this;
    }
    update(dt, g) {
      this.age += dt;
      this.bob += dt * 4;
      const p = g.player;
      const dx = p.x - this.x, dy = p.y - this.y;
      const d2 = dx * dx + dy * dy;
      const pr = p.pickupRadius * (this.def.chest ? 0.5 : 1);

      // Loose essence eventually drifts after you. It travels only a
      // little faster than a walk, so outrunning a kill still costs you
      // time — but a fleeing player is never permanently starved of XP.
      if (!this.pulled && (d2 < pr * pr || (this.def.xp && this.age > 4))) this.pulled = true;

      if (this.pulled) {
        const d = Math.sqrt(d2) || 1;
        const sp = clamp(520 - d * 0.6, 260, 900);
        this.vx = lerp(this.vx, (dx / d) * sp, damp(11, dt));
        this.vy = lerp(this.vy, (dy / d) * sp, damp(11, dt));
      } else {
        this.vx *= 1 - Math.min(1, 4 * dt);
        this.vy *= 1 - Math.min(1, 4 * dt);
      }
      this.x += this.vx * dt; this.y += this.vy * dt;

      if (d2 < 24 * 24) { this.dead = true; g.collect(this); }
    }
    draw(g) {
      const bobY = Math.sin(this.bob) * 3;
      g.globalCompositeOperation = 'lighter';
      Art.glow(g, this.def.glow, this.x, this.y + bobY, this.def.chest ? 80 : 30, 0.4);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      Art.draw(g, this.spr, this.x, this.y + bobY, 1, 1);
    }
  }

  W.Bolt = Bolt;
  W.Bullet = Bullet;
  W.SpiritBat = SpiritBat;
  W.Zone = Zone;
  W.Meteor = Meteor;
  W.Nova = Nova;
  W.Pickup = Pickup;
  W.PICKUP_KIND = PICKUP_KIND;

})(window);
