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
      deed: 'blooded',
    },

    /* ---- The wider cast. Word got out; the hollow draws more
            than witches now. ---- */
    {
      id: 'battlemage', name: 'Sir Aldric Vane', title: 'Battle Mage',
      desc: 'Trained to cast in armour, which the academy thought was cheating. Starts with Runeblade.',
      spr: 'wiz_battlemage', start: 'runeblade', hp: 132,
      mods: { damage: 0.08, speed: -0.04 },
      modText: '+8% damage, heavy plate',
      deed: 'steel',
    },
    {
      id: 'warden', name: 'Rowan Ash', title: 'Forest Warden',
      desc: 'Counts every arrow and every debt. Starts with Thorn Volley.',
      spr: 'wiz_warden', start: 'thornvolley', hp: 104,
      mods: { pickup: 0.45, area: 0.1 },
      modText: '+45% pickup range, +10% area',
      deed: 'forager',
    },
    {
      id: 'knight', name: 'Dame Ysolde', title: 'Oath Knight',
      desc: 'Slow, immovable, and entirely out of patience. Starts with Warhammer.',
      spr: 'wiz_knight', start: 'hammer', hp: 176,
      mods: { speed: -0.12, dr: 0.1 },
      modText: 'Heaviest armour, slowest step',
      deed: 'unbroken',
    },
    {
      id: 'werewolf', name: 'Fenn', title: 'The Turned',
      desc: 'Fast, starving, and only mostly in control. Starts with Rending Claws.',
      spr: 'wiz_werewolf', start: 'claws', hp: 96,
      mods: { speed: 0.22, regen: 0.4 },
      modText: '+22% speed, knits closed fast',
      deed: 'moonlit',
    },
    {
      id: 'vampire', name: 'Countess Ilka', title: 'The Undying',
      desc: 'Takes what she needs and calls it hospitality. Starts with Crimson Rite.',
      spr: 'wiz_vampire', start: 'bloodbolt', hp: 92,
      mods: { damage: 0.12, lifesteal: 1 },
      modText: '+12% damage, drinks from every kill',
      deed: 'sanguine',
    },
    {
      id: 'alchemist', name: 'Doctor Quill', title: 'Plague Alchemist',
      desc: 'Believes most problems dissolve, given the right solvent. Starts with the Flask.',
      spr: 'wiz_alchemist', start: 'flask', hp: 108,
      mods: { area: 0.18, cdr: 0.06 },
      modText: '+18% spell size, +6% cast rate',
      deed: 'reagent',
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

    /* ---- Steel and blood: the wider cast's arsenal ---- */

    runeblade: {
      name: 'Runeblade', icon: 'runeblade', color: 'arcane',
      blurb: 'Sweeps a rune-lit blade through everything in front of you.',
      up: ['Sweeps a rune-lit blade through everything in front of you.',
           '+damage', 'Wider arc', '+reach, faster', '+damage',
           'Wider arc, second sweep', 'Faster', 'The sweep comes full circle'],
      t: {
        dmg:  [46, 60, 76, 96, 122, 154, 194, 250],
        cd:   [1.05, 1.0, 0.92, 0.82, 0.76, 0.68, 0.60, 0.54],
        rad:  [92, 96, 104, 118, 124, 132, 140, 150],
        arc:  [1.5, 1.6, 1.9, 2.0, 2.2, 2.5, 2.7, 6.28],
      },
      evo: { req: 'grimoire', name: 'Duskcleaver',
             desc: 'Every sweep is a full circle, and it cuts the air behind it too.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const base = g.nearestEnemy(p.x, p.y, 500);
        const aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        const sweeps = (sp.level >= 6 ? 2 : 1) + (sp.evolved ? 1 : 0);
        for (let i = 0; i < sweeps; i++) {
          g.spawnSlash({
            owner: p, a: aim + (i ? Math.PI : 0), arc: sp.evolved ? 6.28 : s.arc,
            r: s.rad * p.stat.area, dmg: s.dmg, color: 'arcane',
            spin: sp.evolved ? 6 : 2.2, life: 0.24, src: sp,
          });
        }
        g.audio('zap');
      },
    },

    thornvolley: {
      name: 'Thorn Volley', icon: 'thornvolley', color: 'life',
      blurb: 'Looses a fan of barbed arrows that punch through ranks.',
      up: ['Looses a fan of barbed arrows that punch through ranks.',
           '+1 arrow', '+damage', '+1 arrow, deeper pierce', 'Faster draw',
           '+1 arrow', '+damage, deeper pierce', 'Arrows split on impact'],
      t: {
        dmg:    [30, 38, 50, 62, 78, 98, 124, 158],
        cd:     [1.15, 1.08, 1.0, 0.9, 0.8, 0.74, 0.66, 0.58],
        count:  [3, 4, 4, 5, 5, 6, 6, 7],
        pierce: [1, 1, 2, 3, 3, 3, 4, 5],
      },
      evo: { req: 'ring', name: 'Hunter\u2019s Mercy',
             desc: 'A full ring of arrows, every one of them barbed.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles;
        const base = g.nearestEnemy(p.x, p.y, 900);
        const aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        for (let i = 0; i < n; i++) {
          const a = sp.evolved
            ? (i / n) * TAU
            : aim + (i - (n - 1) / 2) * 0.14;
          g.spawnBolt({
            x: p.x, y: p.y, a, speed: 620, dmg: s.dmg, pierce: s.pierce,
            r: 8, glow: 'life', life: 1.5, trail: 'life',
            burst: sp.level >= 8 ? { r: 48 * p.stat.area, dmg: s.dmg * 0.5 } : null,
            src: sp,
          });
        }
        g.audio('shoot');
      },
    },

    hammer: {
      name: 'Warhammer', icon: 'hammer', color: 'frost',
      blurb: 'Hurls a hammer that batters its way out and back again.',
      up: ['Hurls a hammer that batters its way out and back again.',
           '+damage', 'Flies further', '+1 hammer', '+damage',
           'Flies further, faster', '+1 hammer', 'Hammers shatter the ground where they turn'],
      t: {
        dmg:   [54, 70, 90, 114, 145, 182, 230, 292],
        cd:    [1.7, 1.6, 1.5, 1.35, 1.22, 1.1, 1.0, 0.9],
        count: [1, 1, 1, 2, 2, 2, 3, 3],
        life:  [1.9, 2.0, 2.3, 2.4, 2.5, 2.8, 3.0, 3.2],
      },
      evo: { req: 'ward_p', name: 'Mjolnir\u2019s Echo',
             desc: 'Four hammers, and each turning point cracks the earth.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles + (sp.evolved ? 1 : 0);
        const base = g.nearestEnemy(p.x, p.y, 700);
        const aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        for (let i = 0; i < n; i++) {
          g.spawnBoomerang({
            owner: p, x: p.x, y: p.y,
            a: aim + (i - (n - 1) / 2) * 0.5,
            speed: 560, dmg: s.dmg, life: s.life,
            r: 18 * p.stat.area, color: 'frost', src: sp,
          });
        }
        g.audio('shoot');
      },
    },

    claws: {
      name: 'Rending Claws', icon: 'claws', color: 'blood',
      blurb: 'Tears at everything within arm\u2019s reach, and drinks what it opens.',
      up: ['Tears at everything within arm\u2019s reach, and drinks what it opens.',
           '+damage', 'Longer reach', 'Faster, +healing', '+damage',
           'Longer reach', 'Faster', 'Every rake is a full circle'],
      t: {
        dmg:  [26, 34, 44, 56, 72, 92, 118, 152],
        cd:   [0.62, 0.58, 0.54, 0.46, 0.42, 0.38, 0.33, 0.29],
        rad:  [74, 78, 88, 92, 98, 108, 114, 122],
        leech:[0.4, 0.5, 0.6, 0.9, 1.0, 1.2, 1.4, 1.8],
      },
      evo: { req: 'moonstone', name: 'Moon\u2019s Hunger',
             desc: 'The beast takes over. Full circles, and far deeper draughts.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const base = g.nearestEnemy(p.x, p.y, 400);
        const aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        g.spawnSlash({
          owner: p, a: aim, arc: sp.level >= 8 || sp.evolved ? 6.28 : 1.9,
          r: s.rad * p.stat.area, dmg: s.dmg, color: 'blood',
          leech: s.leech * (sp.evolved ? 2 : 1), knock: 120,
          spin: 3, life: 0.18, src: sp,
        });
        g.audio('hit');
      },
    },

    bloodbolt: {
      name: 'Crimson Rite', icon: 'bloodbolt', color: 'blood',
      blurb: 'Flings a clot of stolen blood. What it takes, you keep.',
      up: ['Flings a clot of stolen blood. What it takes, you keep.',
           '+damage', '+1 bolt', '+healing', '+damage',
           '+1 bolt, pierces', 'Faster', 'Bolts burst into a red mist'],
      t: {
        dmg:    [38, 50, 64, 82, 104, 132, 168, 214],
        cd:     [1.1, 1.02, 0.95, 0.86, 0.78, 0.70, 0.62, 0.55],
        count:  [1, 1, 2, 2, 2, 3, 3, 4],
        pierce: [0, 0, 0, 1, 1, 2, 2, 3],
        leech:  [0.6, 0.7, 0.8, 1.2, 1.3, 1.5, 1.8, 2.2],
      },
      evo: { req: 'amulet', name: 'Sanguine Choir',
             desc: 'The mist lingers, and everything caught in it feeds you.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles;
        const base = g.nearestEnemy(p.x, p.y, 900);
        const aim = base ? Math.atan2(base.y - p.y, base.x - p.x) : p.facingAngle;
        for (let i = 0; i < n; i++) {
          g.spawnBolt({
            x: p.x, y: p.y, a: aim + (i - (n - 1) / 2) * 0.18,
            speed: 500, dmg: s.dmg, pierce: s.pierce,
            r: 11, glow: 'blood', life: 1.6, trail: 'blood',
            leech: s.leech * (sp.evolved ? 1.8 : 1),
            burst: sp.level >= 8 || sp.evolved
              ? { r: 70 * p.stat.area, dmg: s.dmg * 0.55 } : null,
            src: sp,
          });
        }
        g.audio('fire');
      },
    },

    flask: {
      name: 'Alchemist\u2019s Flask', icon: 'flask', color: 'toxic',
      blurb: 'Lobs a bottle that breaks into a corrosive pool.',
      up: ['Lobs a bottle that breaks into a corrosive pool.',
           '+damage', 'Bigger break', '+1 flask', 'Pools last longer',
           '+damage', '+1 flask', 'The pool spits smaller flasks of its own'],
      t: {
        dmg:   [56, 72, 92, 116, 148, 186, 236, 300],
        cd:    [2.0, 1.9, 1.8, 1.65, 1.5, 1.35, 1.2, 1.05],
        rad:   [78, 82, 94, 98, 104, 114, 122, 132],
        count: [1, 1, 1, 2, 2, 2, 3, 3],
        dur:   [3.0, 3.2, 3.4, 3.6, 4.4, 4.6, 4.8, 5.4],
      },
      evo: { req: 'lens', name: 'Cascade',
             desc: 'Each break throws two more. It does not really stop.' },
      cast(g, p, sp) {
        const s = C.stats(p, sp);
        const n = s.count + p.stat.projectiles + (sp.evolved ? 2 : 0);
        for (let i = 0; i < n; i++) {
          const tgt = g.randomEnemyNear(p.x, p.y, 560) ||
                      { x: p.x + rand(-260, 260), y: p.y + rand(-260, 260) };
          g.spawnFlask({
            x: p.x, y: p.y, tx: tgt.x + rand(-30, 30), ty: tgt.y + rand(-30, 30),
            dmg: s.dmg, r: s.rad * p.stat.area, dps: s.dmg * 0.3,
            zoneDur: s.dur, color: 'toxic', src: sp,
          });
        }
        g.audio('shoot');
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
     Scripted events. These define only *when* a swarm lands and
     what shape it takes — which creature shows up is drawn from
     the stage's pool and shuffled per run, so the beats stay
     authored while the content varies.
     --------------------------------------------------------- */
  C.eventSlots = [
    { at: 60,  kind: 'ring',  n: 26 },
    { at: 105, kind: 'flank', n: 30 },
    { at: 220, kind: 'ring',  n: 24 },
    { at: 260, kind: 'pack',  n: 16 },
    { at: 380, kind: 'flank', n: 40 },
    { at: 430, kind: 'ring',  n: 20 },
    { at: 520, kind: 'pack',  n: 6 },
    { at: 610, kind: 'ring',  n: 22 },
    { at: 700, kind: 'flank', n: 26 },
    { at: 760, kind: 'pack',  n: 9 },
    { at: 820, kind: 'ring',  n: 26 },
  ];

  /** Headline for a swarm, built from its shape and its creature. */
  C.eventText = function (kind, enemyId) {
    const n = (C.enemies[enemyId] || {}).name || 'Something';
    const plural = n.endsWith('s') ? n : n + 's';
    if (kind === 'ring') return `${plural} encircle you`;
    if (kind === 'flank') return `${plural} from both sides`;
    return `A pack of ${plural}`;
  };

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

  /** When Wardens wake. Which Warden is decided per run by the stage. */
  C.bossSlots = [
    { at: 150, mult: 1.0 },
    { at: 330, mult: 1.0 },
    { at: 510, mult: 1.0 },
    { at: 690, mult: 1.0 },
    { at: 840, mult: 1.8 },
  ];

  C.RUN_LENGTH = 900;   // 15:00 — survive to see dawn

  /* =========================================================
     DEEDS — the progression spine.

     Every unlock in the game hangs off one of these: heroes,
     weapons and stages all name a deed, and a deed is just a
     predicate over the save file plus a line of progress text.
     Keeping them in one table means the Deeds screen can show
     what is left without each system inventing its own copy.
     ========================================================= */
  const pct = (have, need) => `${Math.min(have, need)}/${need}`;

  C.deeds = [
    { id: 'blooded',  name: 'Blooded',        desc: 'Slay 600 foes in total.',
      test: (s) => s.kills >= 600,        prog: (s) => pct(s.kills, 600) },
    { id: 'steel',    name: 'Tempered Steel', desc: 'Reach level 20 in a single run.',
      test: (s) => (s.bestLevel || 0) >= 20, prog: (s) => pct(s.bestLevel || 0, 20) },
    { id: 'forager',  name: 'Forager',        desc: 'Gather 4000 essence in total.',
      test: (s) => (s.essence || 0) >= 4000, prog: (s) => pct(s.essence || 0, 4000) },
    { id: 'unbroken', name: 'Unbroken',       desc: 'Survive 8 minutes in a single run.',
      test: (s) => (s.best || 0) >= 480,  prog: (s) => `${Math.floor((s.best || 0) / 60)}/8 min` },
    { id: 'moonlit',  name: 'Moonlit',        desc: 'Slay 12 Wardens.',
      test: (s) => (s.bossKills || 0) >= 12, prog: (s) => pct(s.bossKills || 0, 12) },
    { id: 'sanguine', name: 'Sanguine',       desc: 'Evolve any weapon.',
      test: (s) => (s.evolutions || 0) >= 1, prog: (s) => pct(s.evolutions || 0, 1) },
    { id: 'reagent',  name: 'Reagent',        desc: 'Open 15 chests.',
      test: (s) => (s.chests || 0) >= 15, prog: (s) => pct(s.chests || 0, 15) },
    { id: 'dawn',     name: 'First Dawn',     desc: 'Survive one night to the dawn.',
      test: (s) => (s.wins || 0) >= 1,    prog: (s) => pct(s.wins || 0, 1) },
    { id: 'legion',   name: 'Legion',         desc: 'Slay 3000 foes in total.',
      test: (s) => s.kills >= 3000,       prog: (s) => pct(s.kills, 3000) },
    { id: 'arsenal',  name: 'Arsenal',        desc: 'Reach level 12 in a single run.',
      test: (s) => (s.bestLevel || 0) >= 12, prog: (s) => pct(s.bestLevel || 0, 12) },
    { id: 'hunter',   name: 'Hunter',         desc: 'Slay 4 Wardens.',
      test: (s) => (s.bossKills || 0) >= 4, prog: (s) => pct(s.bossKills || 0, 4) },
    { id: 'ruin',     name: 'Ruin',           desc: 'Reach 6 minutes in a single run.',
      test: (s) => (s.best || 0) >= 360,  prog: (s) => `${Math.floor((s.best || 0) / 60)}/6 min` },
  ];

  C.deed = (id) => C.deeds.find((d) => d.id === id);
  C.deedDone = (save, id) => {
    if (!id) return true;                       // no deed named = always open
    const d = C.deed(id);
    return d ? !!d.test(save) : true;
  };
  /** Locked-reason string, or null when it is available. */
  C.lockReason = function (save, id) {
    if (C.deedDone(save, id)) return null;
    const d = C.deed(id);
    return `${d.desc} (${d.prog(save)})`;
  };

  /** Weapons that must be earned. Anything unlisted is open from the start. */
  C.weaponDeeds = {
    starfall: 'arsenal', siphon: 'hunter', ward: 'ruin',
    runeblade: 'steel', thornvolley: 'forager', hammer: 'unbroken',
    claws: 'moonlit', bloodbolt: 'sanguine', flask: 'reagent',
  };

  C.weaponUnlocked = (save, id) => C.deedDone(save, C.weaponDeeds[id]);

  /* =========================================================
     STAGES — where the vigil is held.

     A stage re-colours the ground, tilts the spawn table toward a
     kind of enemy, picks which Wardens turn up, and supplies the
     pool of creatures that scripted swarms are drawn from. Within
     a stage the swarm creatures and Warden order are shuffled per
     run, so the beats stay authored while the cast varies.
     ========================================================= */
  C.stages = [
    {
      id: 'hollow', name: 'The Hollow', title: 'Where it started',
      blurb: 'Old flagstones and older runes. Everything the night has to offer, in fair measure.',
      ground: null,                              // the default palette
      weights: {},                               // no tilt
      mods: { spawn: 1, hp: 1, spd: 1 },
      mote: 'arcane',
      bosses: ['matriarch', 'lich', 'gorgon', 'devourer'],
      swarms: ['imp', 'bat', 'skeleton', 'slime', 'cultist', 'batRed', 'wraith', 'gargoyle'],
    },
    {
      id: 'chapel', name: 'The Drowned Chapel', title: 'Ranged nightmare',
      blurb: 'Flooded aisles under green water. Fewer bodies, far more spellfire — this is the bullet-hell stage.',
      ground: {
        base: '#07141a', stoneA: 'rgba(20,52,64,0.38)', stoneB: 'rgba(3,10,16,0.4)',
        grid: 'rgba(60,140,150,0.15)', rune: 'rgba(90,220,220,0.14)',
        tuft: [30, 90, 90], tuftAlpha: 0.22, tufts: 40, runes: 8,
      },
      // Casters and archers dominate; brawlers are thinned out.
      weights: { cultist: 2.2, cultist2: 2.2, skeleton: 2.0, skeleton2: 2.0,
                 wisp: 2.4, wispRed: 2.4, imp: 0.5, bat: 0.6, batRed: 0.6,
                 slime: 0.7, gargoyle: 0.6 },
      mods: { spawn: 0.82, hp: 1.0, spd: 0.95 },
      mote: 'ice',
      bosses: ['lich', 'gorgon', 'lich', 'devourer'],
      swarms: ['skeleton', 'cultist', 'wisp', 'skeleton2', 'cultist2', 'wispRed'],
      deed: 'dawn',
    },
    {
      id: 'waste', name: 'The Ashen Waste', title: 'They come running',
      blurb: 'Cracked red earth under a dead sky. Little spellfire, but the swarm never stops coming.',
      ground: {
        base: '#180a0a', stoneA: 'rgba(72,26,18,0.36)', stoneB: 'rgba(10,3,3,0.42)',
        grid: 'rgba(150,70,45,0.14)', rune: 'rgba(255,140,70,0.12)',
        tuft: [80, 45, 30], tuftAlpha: 0.2, tufts: 26, runes: 3, blobs: 1100,
      },
      // Fast melee everywhere; the shooters mostly stay home.
      weights: { imp: 2.0, impBlue: 2.0, impGreen: 1.8, bat: 2.2, batRed: 2.2,
                 wraith: 2.0, slime: 1.4, slimeAcid: 1.4,
                 skeleton: 0.35, skeleton2: 0.35, cultist: 0.4, cultist2: 0.4,
                 wisp: 0.3, wispRed: 0.3 },
      mods: { spawn: 1.35, hp: 1.0, spd: 1.1 },
      mote: 'ember',
      bosses: ['matriarch', 'devourer', 'matriarch', 'gorgon'],
      swarms: ['imp', 'bat', 'batRed', 'wraith', 'impBlue', 'slime', 'impGreen'],
      deed: 'legion',
    },
  ];

  C.stage = function (id) {
    return C.stages.find((s) => s.id === id) || C.stages[0];
  };

  /** Build one run's swarm and Warden order for a stage. */
  C.rollStagePlan = function (stage) {
    const pool = W.shuffle(stage.swarms.slice());
    const swarms = C.eventSlots.map((slot, i) => {
      const type = pool[i % pool.length];
      return { at: slot.at, kind: slot.kind, n: slot.n, type,
               text: C.eventText(slot.kind, type) };
    });
    const cast = W.shuffle(stage.bosses.slice());
    const bosses = C.bossSlots.map((slot, i) => ({
      at: slot.at, mult: slot.mult, id: cast[i % cast.length],
    }));
    return { swarms, bosses };
  };

  /* =========================================================
     CURSES — opt-in handicaps taken before a run. Each one
     makes the night worse and pays out more soul shards, so
     the player sets their own difficulty and gets paid for it.

     Every curse is expressed as a multiplier on a value the
     engine already reads, which is why none of them need
     special-case logic at the point of use.
     ========================================================= */
  C.curseDefaults = () => ({
    spawnRate: 1,     // director pressure
    maxhp: 1,
    damage: 1,        // damage you deal
    dmgTaken: 1,
    speed: 1,
    xp: 1,
    bulletSpd: 1,     // hostile projectiles
    bulletDmg: 1,
    bossTime: 1,      // schedule multiplier: < 1 means they wake sooner
    bossPower: 1,
    gemLife: 0,       // seconds before loose essence rots; 0 = never
    gemDrift: 1,      // speed of the lazy essence pull; 0 disables it
    fog: 0,
    noRevive: false,
    shardBonus: 0,    // additive across every curse taken
  });

  C.curses = [
    { id: 'swarm',    name: 'Swarm',            icon: 'cat',       shard: 0.25,
      desc: 'The hollow sends far more of everything.',
      apply: (m) => { m.spawnRate *= 1.55; } },

    { id: 'frailty',  name: 'Frailty',          icon: 'amulet',    shard: 0.20,
      desc: 'Your body is thinner than it was. −30% maximum health.',
      apply: (m) => { m.maxhp *= 0.70; } },

    { id: 'glass',    name: 'Glass Heart',      icon: 'might',     shard: 0.30,
      desc: 'You strike far harder — and so does everything else.',
      apply: (m) => { m.damage *= 1.6; m.dmgTaken *= 1.8; } },

    { id: 'hunger',   name: 'Hunger',           icon: 'lodestone', shard: 0.25,
      desc: 'Essence rots where it falls, and barely drifts. Go and get it.',
      // Tuned against a five-seed sweep. Essence still crawls toward you,
      // far slower than a walk, and rots at 12s. That costs a player who
      // collects about 18% of their levels and a pure kiter roughly half
      // — which is the point: it taxes kiting, not playing.
      apply: (m) => { m.gemLife = 12; m.gemDrift = 0.5; } },

    { id: 'fog',      name: 'Creeping Fog',     icon: 'lens',      shard: 0.20,
      desc: 'The dark presses closer. You see much less of it coming.',
      apply: (m) => { m.fog = 1; } },

    { id: 'wardens',  name: 'Restless Wardens', icon: 'feather',   shard: 0.30,
      desc: 'The Wardens wake early, and angrier.',
      apply: (m) => { m.bossTime *= 0.75; m.bossPower *= 1.45; } },

    { id: 'leadfoot', name: 'Leadfoot',         icon: 'boots',     shard: 0.25,
      desc: 'Your feet drag. −18% movement speed.',
      apply: (m) => { m.speed *= 0.82; } },

    { id: 'barrage',  name: 'Barrage',          icon: 'ward',      shard: 0.30,
      desc: 'Their spells fly faster and land heavier.',
      apply: (m) => { m.bulletSpd *= 1.4; m.bulletDmg *= 1.35; } },

    { id: 'famine',   name: 'Famine',           icon: 'grimoire',  shard: 0.30,
      desc: 'Essence yields far less. You will level slowly.',
      apply: (m) => { m.xp *= 0.65; } },

    { id: 'brittle',  name: 'Brittle Soul',     icon: 'moonstone', shard: 0.25,
      desc: 'Nothing brings you back. Revivals do not work.',
      apply: (m) => { m.noRevive = true; } },
  ];

  /** Fold a list of curse ids into a single modifier object. */
  C.curseMods = function (ids) {
    const m = C.curseDefaults();
    for (const c of C.curses) {
      if (!ids || !ids.includes(c.id)) continue;
      c.apply(m);
      m.shardBonus += c.shard;
    }
    return m;
  };

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
