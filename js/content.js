/* ============================================================
   content.js — characters, spells, passives, enemies, bosses,
   and the persistent Vault upgrades. Pure data plus the cast
   routines that drive each spell.
   ============================================================ */
(function (global) {
  'use strict';
  const W = global.W;
  const TAU = W.TAU;
  const { rand, randInt, pick, clamp } = W;

  const C = {};
  W.Content = C;

  /* =========================================================
     CHARACTERS
     ========================================================= */
  C.chars = [
    {
      id: 'ember', name: 'Elara Ashthorn', title: 'Emberwitch',
      desc: 'Her temper outpaces her patience. Starts with Firebolt.',
      spr: 'wiz_ember', start: 'firebolt', hp: 100,
      mods: { damage: 0.15 },
      modText: '+15% spell damage',
    },
    {
      id: 'frost', name: 'Morwenna Rime', title: 'Frostwarden',
      desc: 'Winter answers when she calls. Starts with Frost Nova.',
      spr: 'wiz_frost', start: 'frost', hp: 118,
      mods: { area: 0.22, maxhp: 0 },
      modText: '+22% spell area, sturdier',
    },
    {
      id: 'storm', name: 'Zephyr Vance', title: 'Stormcaller',
      desc: 'Never still, never safe. Starts with Chain Lightning.',
      spr: 'wiz_storm', start: 'chain', hp: 92,
      mods: { speed: 0.14, cdr: 0.10 },
      modText: '+14% speed, +10% cast rate',
    },
    {
      id: 'hedge', name: 'Bramble Hex', title: 'Hedge-Witch',
      desc: 'Keeps a pot on the fire and a grudge in it. Starts with Bubbling Cauldron.',
      spr: 'wiz_hedge', start: 'cauldron', hp: 112,
      mods: { regen: 0.7, pickup: 0.3 },
      modText: '+0.7 HP/s, +30% pickup range',
      lockedBy: (save) => (save.kills >= 600 ? null : `Slay 600 foes in total (${save.kills}/600)`),
    },
  ];

  /* =========================================================
     SPELLS
     `t` holds per-level stat tables (index = level - 1).
     `evo` names the passive that unlocks the evolved form.
     ========================================================= */

  const SPELLS = {

    firebolt: {
      name: 'Firebolt', icon: 'firebolt', color: 'fire',
      blurb: 'Hurls searing bolts at the nearest foe.',
      up: ['Hurls a searing bolt at the nearest foe.',
           '+1 bolt', '+damage', '+1 bolt, bolts pierce', 'Faster casting',
           '+1 bolt', 'Faster casting, +pierce', 'Bolts detonate on impact'],
      t: {
        dmg:   [28, 36, 46, 58, 72, 90, 112, 145],
        cd:    [0.95, 0.92, 0.82, 0.78, 0.68, 0.64, 0.55, 0.50],
        count: [1, 2, 2, 3, 3, 4, 4, 5],
        pierce:[0, 0, 0, 1, 1, 1, 2, 3],
        spd:   [470, 480, 490, 500, 515, 530, 550, 580],
      },
      evo: { req: 'grimoire', name: 'Infernal Comet',
             desc: 'Bolts become comets that leave a burning wake.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles;
        const base = g.nearestEnemy(p.x, p.y, 900);
        let aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        for (let i = 0; i < n; i++) {
          const spread = n > 1 ? (i - (n - 1) / 2) * 0.16 : 0;
          const a = aim + spread + rand(-0.03, 0.03);
          g.spawnBolt({
            x: p.x, y: p.y, a, speed: s.spd, dmg: s.dmg, pierce: s.pierce,
            r: sp.evolved ? 13 : 9, glow: sp.evolved ? 'ember' : 'fire',
            life: 1.6, trail: sp.evolved ? 'fire' : null,
            burst: sp.level >= 8 ? { r: 62 * p.stat.area, dmg: s.dmg * 0.6 } : null,
            burn: sp.evolved ? { dps: s.dmg * 0.5, dur: 3 } : null,
            src: sp,
          });
        }
        g.audio('fire');
      },
    },

    frost: {
      name: 'Frost Nova', icon: 'frost', color: 'ice',
      blurb: 'A ring of killing cold erupts outward.',
      up: ['A ring of killing cold erupts outward, slowing what it touches.',
           '+radius, +damage', 'Chills harder', '+radius', '+damage, faster',
           '+radius', 'Chilled foes shatter for bonus damage', 'Leaves a lingering frost field'],
      t: {
        dmg:   [26, 34, 44, 56, 70, 88, 110, 140],
        cd:    [3.1, 2.9, 2.7, 2.5, 2.2, 2.0, 1.8, 1.6],
        rad:   [115, 135, 150, 175, 190, 215, 240, 265],
        slow:  [0.35, 0.40, 0.46, 0.50, 0.54, 0.58, 0.62, 0.68],
      },
      evo: { req: 'lens', name: 'Absolute Zero',
             desc: 'The nova freezes solid, halting everything it catches.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const r = s.rad * p.stat.area;
        g.spawnNova({
          x: p.x, y: p.y, r, dmg: s.dmg, slow: s.slow, dur: sp.evolved ? 2.6 : 1.8,
          freeze: !!sp.evolved, shatter: sp.level >= 7, color: 'ice',
        });
        if (sp.level >= 8 || sp.evolved) {
          g.spawnZone({ x: p.x, y: p.y, r: r * 0.6, dps: s.dmg * 0.35, dur: 3.5,
                        color: 'frost', slow: s.slow, src: sp });
        }
        g.audio('ice');
      },
    },

    chain: {
      name: 'Chain Lightning', icon: 'chain', color: 'volt',
      blurb: 'A bolt that leaps between souls.',
      up: ['A bolt of lightning that leaps between nearby foes.',
           '+1 jump', '+damage', '+1 jump, faster', '+damage', '+2 jumps',
           'Faster, longer reach', 'Every jump stuns briefly'],
      t: {
        dmg:   [34, 44, 56, 70, 88, 110, 138, 175],
        cd:    [1.7, 1.6, 1.45, 1.3, 1.2, 1.1, 0.95, 0.82],
        jumps: [3, 4, 5, 6, 7, 9, 10, 12],
        range: [230, 240, 250, 265, 280, 295, 320, 350],
      },
      evo: { req: 'hourglass', name: 'Tempest',
             desc: 'The storm forks — two bolts, and every strike stuns.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const strands = sp.evolved ? 2 : 1;
        let fired = false;
        const used = new Set();
        for (let k = 0; k < strands; k++) {
          let from = p, hops = s.jumps + 1 + p.stat.projectiles;
          const pts = [{ x: p.x, y: p.y }];
          for (let i = 0; i < hops; i++) {
            const e = g.nearestEnemy(from.x, from.y, s.range * p.stat.area, used);
            if (!e) break;
            used.add(e);
            pts.push({ x: e.x, y: e.y });
            g.damageEnemy(e, s.dmg * Math.pow(0.94, i), { src: sp, crit: true });
            if (sp.level >= 8 || sp.evolved) g.stun(e, 0.35);
            g.fx.spark(e.x, e.y, 'volt', 7);
            from = e; fired = true;
          }
          if (pts.length > 1) g.fx.lightning(pts, 'volt', sp.evolved ? 0.26 : 0.2);
        }
        if (fired) g.audio('zap');
      },
    },

    orbs: {
      name: 'Arcane Orbs', icon: 'orbs', color: 'arcane',
      blurb: 'Bound spirits circle you, shredding what draws near.',
      up: ['Two bound orbs circle you, striking what they touch.',
           '+damage', '+1 orb', 'Wider orbit', '+damage', '+1 orb',
           'Faster orbit, +1 orb', 'Orbs knock foes back hard'],
      t: {
        dmg:   [22, 29, 36, 45, 57, 71, 89, 112],
        count: [2, 2, 3, 3, 4, 5, 6, 6],
        rad:   [80, 84, 90, 104, 110, 118, 126, 134],
        spin:  [2.0, 2.1, 2.2, 2.3, 2.5, 2.7, 3.0, 3.3],
      },
      passive: true,   // maintained continuously rather than "cast"
      evo: { req: 'ring', name: 'Astral Court',
             desc: 'A second, counter-spinning ring joins the dance.' },
      sync(g, p, sp) {
        const s = C.stats(p, sp);
        const want = (s.count + p.stat.projectiles) * (sp.evolved ? 2 : 1);
        g.syncOrbs(sp, want, s.rad * p.stat.area, s.spin, s.dmg,
                   sp.level >= 8 || sp.evolved ? 320 : 90, !!sp.evolved);
      },
    },

    cauldron: {
      name: 'Bubbling Cauldron', icon: 'cauldron', color: 'toxic',
      blurb: 'Spills a caustic brew that eats through anything standing in it.',
      up: ['Spills a caustic brew underfoot that corrodes anything in it.',
           '+damage', 'Wider spill', 'Lasts longer', '+damage',
           'Wider spill, brewed faster', '+damage', 'The brew slows and spreads'],
      t: {
        dmg:  [28, 36, 46, 58, 73, 92, 115, 145],
        cd:   [3.0, 2.8, 2.6, 2.5, 2.2, 1.9, 1.75, 1.6],
        rad:  [66, 70, 82, 86, 92, 104, 112, 124],
        dur:  [4.0, 4.2, 4.4, 5.2, 5.4, 5.6, 6.0, 6.5],
      },
      evo: { req: 'moonstone', name: 'Plaguebloom',
             desc: 'The brew spreads from every corpse it claims.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        g.spawnZone({
          x: p.x + rand(-16, 16), y: p.y + rand(-16, 16),
          r: s.rad * p.stat.area, dps: s.dmg, dur: s.dur, color: 'toxic',
          slow: sp.level >= 8 || sp.evolved ? 0.3 : 0,
          spread: !!sp.evolved, src: sp,
        });
        g.audio('shoot');
      },
    },

    bats: {
      name: 'Spirit Bats', icon: 'bats', color: 'shadow',
      blurb: 'Looses a familiar that hunts down its own quarry.',
      up: ['Looses a spirit bat that hunts a foe of its own choosing.',
           '+damage', '+1 bat', 'Bats fly longer', '+damage',
           '+1 bat, faster', '+1 bat', 'Bats strike twice before fading'],
      t: {
        dmg:   [34, 45, 57, 72, 90, 113, 142, 180],
        cd:    [2.4, 2.2, 2.1, 1.9, 1.7, 1.45, 1.3, 1.15],
        count: [1, 1, 2, 2, 3, 4, 5, 5],
        life:  [3.4, 3.5, 3.6, 4.2, 4.4, 4.6, 4.8, 5.2],
      },
      evo: { req: 'cat', name: 'Night Legion',
             desc: 'The flock doubles and never seems to tire.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = (s.count + p.stat.projectiles) * (sp.evolved ? 2 : 1);
        for (let i = 0; i < n; i++) {
          g.spawnBat({
            x: p.x + rand(-18, 18), y: p.y + rand(-18, 18),
            dmg: s.dmg, life: s.life, hits: sp.level >= 8 || sp.evolved ? 2 : 1, src: sp,
          });
        }
        g.audio('shoot');
      },
    },

    beam: {
      name: 'Runic Beam', icon: 'beam', color: 'holy',
      blurb: 'A lance of sunlight sweeps endlessly around you.',
      up: ['A lance of sunlight sweeps slowly around you.',
           'Longer reach', '+damage', 'Sweeps faster', '+1 beam',
           '+damage, longer', 'Sweeps faster', '+1 beam, blinding intensity'],
      t: {
        dps:  [62, 74, 92, 110, 135, 165, 205, 260],
        len:  [240, 285, 300, 320, 340, 380, 400, 440],
        rot:  [0.75, 0.78, 0.82, 0.95, 1.0, 1.05, 1.2, 1.3],
        beams:[1, 1, 1, 1, 2, 2, 2, 3],
      },
      passive: true,
      evo: { req: 'amulet', name: 'Dawnlance',
             desc: 'Four beams, and the light burns what it passes over.' },
      sync(g, p, sp) {
        const s = C.stats(p, sp);
        sp.beamCount = sp.evolved ? 4 : s.beams;
        sp.beamLen = s.len * p.stat.area;
        sp.beamDps = s.dps;
        sp.beamRot = s.rot;
        sp.beamBurn = !!sp.evolved;
      },
    },

    starfall: {
      name: 'Starfall', icon: 'starfall', color: 'ember',
      blurb: 'Calls down meteors on distant foes.',
      up: ['Calls a meteor down onto a distant foe.',
           '+damage', '+1 meteor', 'Wider blast', '+damage',
           '+1 meteor, falls faster', 'Wider blast', '+2 meteors, blazing craters'],
      t: {
        dmg:   [95, 120, 150, 185, 230, 285, 355, 440],
        cd:    [3.4, 3.2, 3.1, 2.9, 2.6, 2.3, 2.1, 1.9],
        count: [1, 1, 2, 2, 3, 4, 4, 6],
        blast: [72, 76, 82, 96, 100, 106, 118, 130],
      },
      evo: { req: 'boots', name: 'Meteor Storm',
             desc: 'The sky does not stop. Craters burn where they land.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles + (sp.evolved ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const tgt = g.randomEnemyNear(p.x, p.y, 640) ||
                      { x: p.x + rand(-320, 320), y: p.y + rand(-320, 320) };
          g.spawnMeteor({
            x: tgt.x + rand(-40, 40), y: tgt.y + rand(-40, 40),
            dmg: s.dmg, r: s.blast * p.stat.area, delay: 0.45 + i * 0.14,
            crater: sp.level >= 8 || sp.evolved, src: sp,
          });
        }
      },
    },

    siphon: {
      name: 'Soul Siphon', icon: 'siphon', color: 'blood',
      blurb: 'Tethers the nearest soul and drinks it.',
      up: ['Tethers a nearby foe and drains their life into yours.',
           '+damage', 'Longer tether', '+healing', '+damage',
           '+1 tether', 'Longer tether, +damage', '+1 tether, drains far faster'],
      t: {
        dps:   [48, 60, 76, 95, 120, 150, 188, 235],
        range: [190, 200, 225, 235, 250, 265, 290, 320],
        heal:  [0.5, 0.6, 0.7, 1.0, 1.1, 1.3, 1.6, 2.1],
        links: [1, 1, 1, 1, 1, 2, 2, 3],
      },
      passive: true,
      evo: { req: 'ward_p', name: 'Wraithbind',
             desc: 'Bound souls are dragged toward you as they wither.' },
      sync(g, p, sp) {
        const s = C.stats(p, sp);
        sp.links = s.links + (sp.evolved ? 2 : 0);
        sp.range = s.range * p.stat.area;
        sp.dps = s.dps;
        sp.healRate = s.heal;
        sp.pull = !!sp.evolved;
      },
    },

    ward: {
      name: 'Warding Sigil', icon: 'ward', color: 'frost',
      blurb: 'A rune orbits you, swatting hostile magic from the air.',
      up: ['A rune orbits you, destroying enemy projectiles it touches.',
           '+damage', 'Wider orbit', '+1 sigil', '+damage',
           'Faster orbit', '+1 sigil', 'Sigils detonate what they block'],
      t: {
        dmg:   [42, 54, 68, 86, 108, 135, 170, 215],
        count: [1, 1, 1, 2, 2, 2, 3, 3],
        rad:   [64, 66, 78, 82, 86, 90, 96, 104],
        spin:  [1.5, 1.6, 1.7, 1.8, 1.9, 2.3, 2.5, 2.7],
      },
      passive: true,
      evo: { req: 'lodestone', name: 'Aegis Eternal',
             desc: 'Five sigils, and each blocked spell bursts violently.' },
      sync(g, p, sp) {
        const s = C.stats(p, sp);
        g.syncSigils(sp, sp.evolved ? 5 : s.count, s.rad * p.stat.area,
                     s.spin, s.dmg, sp.level >= 8 || sp.evolved);
      },
    },
  };

  // Stamp ids and slot type onto each definition.
  for (const id in SPELLS) { SPELLS[id].id = id; SPELLS[id].kind = 'spell'; SPELLS[id].max = 8; }
  C.spells = SPELLS;

  /* =========================================================
     PASSIVES
     ========================================================= */
  const PASSIVES = {
    grimoire:  { name: 'Elder Grimoire', icon: 'grimoire', max: 5, per: 0.14,
                 blurb: (v) => `+${(v * 100) | 0}% spell damage` },
    boots:     { name: 'Seven-League Boots', icon: 'boots', max: 5, per: 0.09,
                 blurb: (v) => `+${Math.round(v * 100)}% movement speed` },
    amulet:    { name: 'Vitality Amulet', icon: 'amulet', max: 5, per: 24,
                 blurb: (v) => `+${v} maximum health` },
    hourglass: { name: 'Cracked Hourglass', icon: 'hourglass', max: 5, per: 0.09,
                 blurb: (v) => `+${Math.round(v * 100)}% cast rate` },
    lens:      { name: 'Focusing Lens', icon: 'lens', max: 5, per: 0.14,
                 blurb: (v) => `+${Math.round(v * 100)}% spell size` },
    ring:      { name: "Conjurer's Ring", icon: 'ring', max: 3, per: 1,
                 blurb: (v) => `+${v} projectile${v > 1 ? 's' : ''} on every spell` },
    lodestone: { name: 'Lodestone', icon: 'lodestone', max: 4, per: 0.35,
                 blurb: (v) => `+${Math.round(v * 100)}% essence pickup range` },
    ward_p:    { name: 'Obsidian Ward', icon: 'ward_p', max: 5, per: 0.07,
                 blurb: (v) => `-${Math.round(v * 100)}% damage taken` },
    feather:   { name: 'Phoenix Feather', icon: 'feather', max: 2, per: 1,
                 blurb: (v) => `Return from death ${v} more time${v > 1 ? 's' : ''}` },
    moonstone: { name: 'Moonstone', icon: 'moonstone', max: 5, per: 0.65,
                 blurb: (v) => `Recover ${v.toFixed(1)} health per second` },
    cat:       { name: 'Black Cat', icon: 'cat', max: 5, per: 0.12,
                 blurb: (v) => `+${Math.round(v * 100)}% essence and shards` },
  };
  for (const id in PASSIVES) { PASSIVES[id].id = id; PASSIVES[id].kind = 'passive'; }
  C.passives = PASSIVES;

  /* =========================================================
     Stat resolution
     ========================================================= */

  /** Per-level stats for a held spell, with evolution bonus folded in. */
  C.stats = function (p, sp) {
    const def = SPELLS[sp.id];
    const i = clamp(sp.level, 1, 8) - 1;
    const out = {};
    for (const k in def.t) out[k] = def.t[k][i];
    if (sp.evolved) {
      if (out.dmg) out.dmg *= 1.45;
      if (out.dps) out.dps *= 1.45;
      if (out.rad) out.rad *= 1.2;
      if (out.blast) out.blast *= 1.2;
      if (out.cd) out.cd *= 0.8;
    }
    if (out.dmg) out.dmg *= p.stat.damage;
    if (out.dps) out.dps *= p.stat.damage;
    if (out.cd) out.cd /= p.stat.cdr;
    return out;
  };

  /** Card text for taking `spell` to the next level. */
  C.spellUpText = function (sp) {
    const def = SPELLS[sp.id];
    const next = sp ? sp.level : 0;
    return def.up[Math.min(next, def.up.length - 1)];
  };

  /* =========================================================
     ENEMIES
     `ai`: chase | weave | shooter | keepDist | orbit | dash
     `atk.kind`: aimed | spread | ring | spiral
     ========================================================= */
  const E = {
    imp:        { name: 'Imp', hp: 22, spd: 66, dmg: 9, xp: 1, spr: 'imp', r: 16, ai: 'chase' },
    impBlue:    { name: 'Frost Imp', hp: 40, spd: 80, dmg: 12, xp: 2, spr: 'impBlue', r: 16, ai: 'chase' },
    impGreen:   { name: 'Bloated Imp', hp: 110, spd: 50, dmg: 17, xp: 5, spr: 'impGreen', r: 22, ai: 'chase',
                  onDeath: 'burst' },
    bat:        { name: 'Night Bat', hp: 13, spd: 122, dmg: 7, xp: 1, spr: 'bat', r: 14, ai: 'weave' },
    batRed:     { name: 'Blood Bat', hp: 30, spd: 146, dmg: 11, xp: 2, spr: 'batRed', r: 14, ai: 'weave' },
    skeleton:   { name: 'Bone Archer', hp: 42, spd: 46, dmg: 10, xp: 2, spr: 'skeleton', r: 16, ai: 'shooter',
                  atk: { cd: 2.4, kind: 'aimed', n: 1, spd: 195, dmg: 9, color: 'frost' } },
    skeleton2:  { name: 'Bone Marksman', hp: 82, spd: 52, dmg: 12, xp: 4, spr: 'skeleton2', r: 16, ai: 'shooter',
                  atk: { cd: 2.0, kind: 'spread', n: 3, spread: 0.34, spd: 215, dmg: 10, color: 'ember' } },
    slime:      { name: 'Ooze', hp: 58, spd: 38, dmg: 12, xp: 2, spr: 'slime', r: 19, ai: 'chase',
                  split: { type: 'slimeSmall', n: 2 } },
    slimeSmall: { name: 'Oozeling', hp: 18, spd: 60, dmg: 7, xp: 1, spr: 'slimeSmall', r: 12, ai: 'chase' },
    slimeAcid:  { name: 'Caustic Ooze', hp: 140, spd: 36, dmg: 16, xp: 6, spr: 'slimeAcid', r: 20, ai: 'chase',
                  atk: { cd: 2.6, kind: 'ring', n: 8, spd: 135, dmg: 11, color: 'toxic' },
                  split: { type: 'slime', n: 2 } },
    cultist:    { name: 'Coven Acolyte', hp: 50, spd: 44, dmg: 11, xp: 3, spr: 'cultist', r: 16, ai: 'keepDist',
                  dist: 215, atk: { cd: 2.6, kind: 'spread', n: 3, spread: 0.5, spd: 180, dmg: 10, color: 'void' } },
    cultist2:   { name: 'Coven Adept', hp: 100, spd: 48, dmg: 14, xp: 6, spr: 'cultist2', r: 16, ai: 'keepDist',
                  dist: 235, atk: { cd: 2.3, kind: 'spiral', n: 4, spd: 165, dmg: 12, color: 'blood' } },
    gargoyle:   { name: 'Gargoyle', hp: 260, spd: 34, dmg: 22, xp: 9, spr: 'gargoyle', r: 26, ai: 'chase',
                  armor: 4, knockResist: 0.8 },
    wisp:       { name: 'Corpse Light', hp: 32, spd: 86, dmg: 8, xp: 3, spr: 'wisp', r: 14, ai: 'orbit',
                  dist: 205, atk: { cd: 1.9, kind: 'ring', n: 5, spd: 125, dmg: 8, color: 'ice' } },
    wispRed:    { name: 'Hate Light', hp: 60, spd: 96, dmg: 11, xp: 5, spr: 'wispRed', r: 14, ai: 'orbit',
                  dist: 185, atk: { cd: 1.6, kind: 'spiral', n: 6, spd: 140, dmg: 10, color: 'blood' } },
    wraith:     { name: 'Wraith', hp: 90, spd: 100, dmg: 17, xp: 5, spr: 'wraith', r: 17, ai: 'dash',
                  knockResist: 0.4 },
  };
  for (const id in E) { E[id].id = id; }
  C.enemies = E;

  /* ---------------------------------------------------------
     Spawn table — which enemies appear, and how heavily, as the
     run progresses. `from`/`to` are minutes.
     --------------------------------------------------------- */
  C.spawnTable = [
    { id: 'imp',        from: 0.0,  to: 99,  weight: (m) => Math.max(0, 10 - m * 0.6) },
    { id: 'bat',        from: 0.5,  to: 99,  weight: (m) => Math.max(0, 8 - m * 0.4) },
    { id: 'skeleton',   from: 1.5,  to: 99,  weight: (m) => Math.min(7, m * 0.9) },
    { id: 'slime',      from: 2.5,  to: 99,  weight: (m) => Math.min(6, (m - 2) * 0.8) },
    { id: 'impBlue',    from: 3.5,  to: 99,  weight: (m) => Math.min(8, (m - 3) * 0.9) },
    { id: 'cultist',    from: 4.0,  to: 99,  weight: (m) => Math.min(7, (m - 3.5) * 0.8) },
    { id: 'batRed',     from: 5.0,  to: 99,  weight: (m) => Math.min(7, (m - 4.5) * 0.9) },
    { id: 'wisp',       from: 5.5,  to: 99,  weight: (m) => Math.min(5, (m - 5) * 0.7) },
    { id: 'skeleton2',  from: 6.5,  to: 99,  weight: (m) => Math.min(6, (m - 6) * 0.8) },
    { id: 'wraith',     from: 7.0,  to: 99,  weight: (m) => Math.min(6, (m - 6.5) * 0.8) },
    { id: 'cultist2',   from: 8.0,  to: 99,  weight: (m) => Math.min(6, (m - 7.5) * 0.8) },
    { id: 'gargoyle',   from: 8.5,  to: 99,  weight: (m) => Math.min(4, (m - 8) * 0.5) },
    { id: 'impGreen',   from: 9.5,  to: 99,  weight: (m) => Math.min(5, (m - 9) * 0.6) },
    { id: 'wispRed',    from: 10.0, to: 99,  weight: (m) => Math.min(5, (m - 9.5) * 0.6) },
    { id: 'slimeAcid',  from: 11.0, to: 99,  weight: (m) => Math.min(5, (m - 10.5) * 0.6) },
  ];

  /* ---------------------------------------------------------
     Scripted events — swarms, elite packs, breathers.
     --------------------------------------------------------- */
  C.events = [
    { at: 60,  kind: 'ring',  type: 'imp',      n: 26, text: 'A tide of imps' },
    { at: 105, kind: 'flank', type: 'bat',      n: 30, text: 'Wings in the dark' },
    { at: 220, kind: 'ring',  type: 'skeleton', n: 24, text: 'The bone choir' },
    { at: 260, kind: 'pack',  type: 'slime',    n: 16, text: 'Something oozes closer' },
    { at: 380, kind: 'flank', type: 'batRed',   n: 40, text: 'Bloodwing swarm' },
    { at: 430, kind: 'ring',  type: 'cultist',  n: 20, text: 'The coven encircles you' },
    { at: 520, kind: 'pack',  type: 'gargoyle', n: 5,  text: 'The statues wake' },
    { at: 610, kind: 'ring',  type: 'wraith',   n: 22, text: 'Wraith procession' },
    { at: 700, kind: 'flank', type: 'wispRed',  n: 26, text: 'Hateful lights' },
    { at: 760, kind: 'pack',  type: 'gargoyle', n: 9,  text: 'A gargoyle host' },
    { at: 820, kind: 'ring',  type: 'cultist2', n: 26, text: 'The full coven' },
  ];

  /* =========================================================
     BOSSES
     Each has an attack rotation; `fn` receives (game, boss).
     ========================================================= */
  const B = {
    matriarch: {
      name: 'Morvath, Coven Matriarch', spr: 'boss_matriarch', hp: 3600, spd: 44,
      dmg: 26, r: 46, xp: 60, shards: 30, color: 'void',
      attacks: [
        { cd: 3.2, dur: 2.4, fn: 'spiral' },
        { cd: 3.0, dur: 0.1, fn: 'summonBats' },
        { cd: 2.8, dur: 0.1, fn: 'fan' },
      ],
    },
    lich: {
      name: 'Vorlath the Unburied', spr: 'boss_lich', hp: 8200, spd: 40,
      dmg: 30, r: 46, xp: 110, shards: 55, color: 'life',
      attacks: [
        { cd: 3.0, dur: 0.1, fn: 'radial' },
        { cd: 2.6, dur: 0.1, fn: 'blink' },
        { cd: 3.4, dur: 0.1, fn: 'summonSkeletons' },
        { cd: 3.0, dur: 2.0, fn: 'spiral' },
      ],
    },
    gorgon: {
      name: 'The Gorgon Sisters', spr: 'boss_gorgon', hp: 15000, spd: 52,
      dmg: 34, r: 50, xp: 190, shards: 90, color: 'toxic',
      attacks: [
        { cd: 2.6, dur: 0.1, fn: 'shotgun' },
        { cd: 3.2, dur: 1.6, fn: 'sweep' },
        { cd: 3.0, dur: 0.1, fn: 'radial' },
        { cd: 2.2, dur: 1.2, fn: 'charge' },
      ],
    },
    devourer: {
      name: 'The Devourer of Names', spr: 'boss_devourer', hp: 26000, spd: 46,
      dmg: 42, r: 58, xp: 320, shards: 150, color: 'blood',
      attacks: [
        { cd: 2.4, dur: 2.2, fn: 'spiral' },
        { cd: 2.8, dur: 0.1, fn: 'ringWave' },
        { cd: 3.0, dur: 1.4, fn: 'charge' },
        { cd: 2.6, dur: 0.1, fn: 'summonAll' },
        { cd: 3.2, dur: 1.8, fn: 'sweep' },
      ],
    },
  };
  for (const id in B) { B[id].id = id; B[id].boss = true; }
  C.bosses = B;

  /** Boss appearances, in order. After the last, they repeat with scaling. */
  C.bossSchedule = [
    { at: 150, id: 'matriarch' },
    { at: 330, id: 'lich' },
    { at: 510, id: 'gorgon' },
    { at: 690, id: 'devourer' },
    { at: 840, id: 'gorgon', mult: 1.8 },
  ];

  C.RUN_LENGTH = 900;   // 15:00 — survive to see dawn

  /* =========================================================
     VAULT (persistent meta upgrades)
     ========================================================= */
  C.vault = [
    { id: 'might',    name: 'Might',      icon: 'might',     max: 5, cost: (r) => 40 + r * 35,
      desc: (r) => `+${r * 6}% spell damage`, apply: (s, r) => { s.damage += r * 0.06; } },
    { id: 'vigor',    name: 'Vigor',      icon: 'amulet',    max: 5, cost: (r) => 35 + r * 30,
      desc: (r) => `+${r * 14} maximum health`, apply: (s, r) => { s.maxhp += r * 14; } },
    { id: 'haste',    name: 'Haste',      icon: 'boots',     max: 4, cost: (r) => 50 + r * 40,
      desc: (r) => `+${r * 4}% movement speed`, apply: (s, r) => { s.speed += r * 0.04; } },
    { id: 'focus',    name: 'Focus',      icon: 'hourglass', max: 4, cost: (r) => 55 + r * 45,
      desc: (r) => `+${r * 5}% cast rate`, apply: (s, r) => { s.cdr += r * 0.05; } },
    { id: 'greed',    name: 'Greed',      icon: 'cat',       max: 4, cost: (r) => 45 + r * 35,
      desc: (r) => `+${r * 15}% soul shards`, apply: (s, r) => { s.shardBonus += r * 0.15; } },
    { id: 'wisdom',   name: 'Wisdom',     icon: 'grimoire',  max: 4, cost: (r) => 45 + r * 35,
      desc: (r) => `+${r * 8}% essence gained`, apply: (s, r) => { s.xpBonus += r * 0.08; } },
    { id: 'recovery', name: 'Recovery',   icon: 'moonstone', max: 3, cost: (r) => 70 + r * 60,
      desc: (r) => `Recover ${(r * 0.3).toFixed(1)} HP/s`, apply: (s, r) => { s.regen += r * 0.3; } },
    { id: 'magnetism',name: 'Magnetism',  icon: 'lodestone', max: 3, cost: (r) => 50 + r * 40,
      desc: (r) => `+${r * 25}% pickup range`, apply: (s, r) => { s.pickup += r * 0.25; } },
    { id: 'fortune',  name: 'Fortune',    icon: 'ring',      max: 3, cost: (r) => 80 + r * 70,
      desc: (r) => `+${r} level-up reroll${r > 1 ? 's' : ''}`, apply: (s, r) => { s.rerolls += r; } },
    { id: 'revival',  name: 'Revival',    icon: 'feather',   max: 2, cost: (r) => 220 + r * 240,
      desc: (r) => `Return from death ${r} time${r > 1 ? 's' : ''}`, apply: (s, r) => { s.revives += r; } },
  ];

})(window);
