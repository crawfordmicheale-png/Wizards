/* ============================================================
   art.js — every visual is generated at load time.
   Sprites are hand-authored pixel maps; glows, ground and UI
   icons are drawn procedurally. Nothing is fetched.
   ============================================================ */
(function (global) {
  'use strict';
  const W = global.W;
  const TAU = W.TAU;

  const Art = { sprites: {}, glows: {}, icons: {} };
  W.Art = Art;

  /* ---------------------------------------------------------
     Pixel-map renderer.
     `map` is a newline-delimited string; '.' is transparent and
     every other character indexes into `pal`. Rows are padded to
     the widest row so small authoring slips degrade gracefully
     instead of throwing.
     --------------------------------------------------------- */
  function px(map, pal, scale) {
    scale = scale || 1;
    const rows = map.trim().split('\n').map((r) => r.trim());
    const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const h = rows.length;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        const col = pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    c.pw = w; c.ph = h;
    return c;
  }
  Art.px = px;

  /** Horizontally mirrored copy — used for entity facing. */
  function flipH(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.translate(c.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    c.pw = src.pw; c.ph = src.ph;
    return c;
  }

  /** Solid silhouette in one colour — used for hit flashes. */
  function tint(src, color) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    c.pw = src.pw; c.ph = src.ph;
    return c;
  }
  Art.tint = tint;

  /* =========================================================
     PIXEL MAPS
     ========================================================= */

  const MAP_WIZARD = `
  ................
  .......kk.......
  ......khhk......
  ......khhk......
  .....khhhhk.....
  .....khhhhk...g.
  ....khhhhhhk..w.
  ...kHhhhhhhHk.w.
  ..kkkkkkkkkkkkw.
  .....kssssk...w.
  .....sesses...w.
  .....ksssk....w.
  ....krRRRRrk..w.
  ...krrRRRRrrkkw.
  ...krrrRRrrrk.w.
  ...krrrrrrrrk.w.
  ...krrrrrrrrk...
  ....krrrrrrk....
  `;

  const MAP_IMP = `
  ................
  ..k..........k..
  ..kk........kk..
  ...kk......kk...
  ....kbbbbbbk....
  ...kbbbbbbbbk...
  ...kbeebbeebk...
  ...kbbbbbbbbk...
  ....kbmmmmbk....
  .....kbbbbk.....
  ...kkbbbbbbkk...
  ..kbbbbbbbbbbk..
  ..kbbbbbbbbbbk..
  ...kbbbbbbbbk...
  ....kbk..kbk....
  ....kk....kk....
  `;

  const MAP_BAT = `
  .kk..........kk.
  .kwwk......kwwk.
  .kwwwk.kk.kwwwk.
  ..kwwwkeekwwwk..
  ...kwwkbbkwwk...
  .....kbbbbk.....
  .....kbbbbk.....
  ......kbbk......
  .......kk.......
  `;

  const MAP_SKELETON = `
  .......kkkk.....
  ......kbbbbk....
  ......kbeebk....
  ......kbbbbk....
  .......kbbk.....
  ........kk......
  .....kkbbbbkk...
  ....kbbbbbbbbk..
  ....kbkbbbbkbk..
  .....kbbbbbbk...
  ......kbbbbk....
  .....kbk..kbk...
  .....kbk..kbk...
  ....kkbk..kbkk..
  `;

  const MAP_SLIME = `
  ......kkkk......
  ....kkSSSSkk....
  ...kSSssssSSk...
  ..kSsssssssssk..
  .kSsseesseesssk.
  .kssseesseessssk
  .kssssssssssssk.
  .kssssssssssssk.
  ..kssssssssssk..
  ...kkkkkkkkkk...
  `;

  const MAP_CULTIST = `
  ................
  ......kkkk......
  .....khhhhk.....
  ....khhhhhhk....
  ....khggggkk....
  ....khgeegh k...
  ....khggggk.....
  ...kkhhhhhhkk...
  ..khhhhhhhhhhk..
  ..khhrrhhrrhhk..
  ..khhhhhhhhhhk..
  ..khhhhhhhhhhk..
  ...khhhhhhhhk...
  ...khhhhhhhhk...
  ....kkhhhhkk....
  ......kkkk......
  `;

  const MAP_GARGOYLE = `
  ..k..........k..
  ..kkk......kkk..
  ..kwwk....kwwk..
  ..kwwwkkkkwwwk..
  ..kwwsssssswwk..
  ...kwseeeesswk..
  ...kwssmmmsswk..
  ...kkssssssskk..
  ..kssssssssssk..
  .ksssskkkkssssk.
  .kssskkwwkksssk.
  .kssskwwwwksssk.
  ..kssskwwksssk..
  ..kkssssssssk...
  ...kkskkkkskk...
  ....kk....kk....
  `;

  const MAP_WISP = `
  ......kk......
  ....kkggkk....
  ...kgggggggk..
  ..kggwwwwggk..
  ..kgwwWWwwgk..
  ..kgwWWWWwgk..
  ..kgwwWWwwgk..
  ..kggwwwwggk..
  ...kgggggggk..
  ....kkggkk....
  ......kk......
  `;

  const MAP_WRAITH = `
  ......kkkk......
  ....kkhhhhkk....
  ...khhhhhhhhk...
  ...khheeeehhk...
  ...khheeeehhk...
  ...khhhhhhhhk...
  ..khhhhhhhhhhk..
  ..khhhhhhhhhhk..
  ..khhhhhhhhhhk..
  ...khhhhhhhhk...
  ...khhhhhhhhk...
  ....khhhhhhk....
  ....kh.hh.hk....
  .....k.hh.k.....
  ......k..k......
  `;

  /* --- Bosses. Same 16px grid, drawn at a much larger scale so
         the chunky pixels read as sheer bulk. -------------- */

  const MAP_BOSS_MATRIARCH = `
  .......kk.......
  ......khhk......
  .....khhhhk.....
  ....khhhhhhk....
  ...khhgggghhk...
  ..khhgggggghhk..
  .kkkkkkkkkkkkkk.
  ....ksssssk.....
  ...ksererersk...
  ...ksssmmsssk...
  ..krrRRRRRRrrk..
  .krrRRggggRRrrk.
  .krrRRRggRRRrrk.
  .krrrRRRRRRrrrk.
  ..krrrrrrrrrrk..
  ...kkrrrrrrkk...
  `;

  const MAP_BOSS_LICH = `
  ....kkkkkkkk....
  ...kbbbbbbbbk...
  ..kbbggbbggbbk..
  ..kbbggbbggbbk..
  ..kbbbbbbbbbbk..
  ...kbbmmmmbbk...
  ....kkbbbbkk....
  ...krrkkkkrrk...
  ..krrrrrrrrrrk..
  .krrrgrrrrgrrrk.
  .krrggrrrrggrrk.
  .krrrrrggrrrrrk.
  ..krrrrggrrrrk..
  ..krrrrrrrrrrk..
  ...kkrrrrrrkk...
  .....kkkkkk.....
  `;

  const MAP_BOSS_GORGON = `
  ..s..s....s..s..
  .skk.skk.skk.ks.
  ..skkkskkksk.s..
  ...sskkkkkss....
  ....kgggggk.....
  ...kggggggggk...
  ..kggeeggeeggk..
  ..kgggggggggggk.
  ..kggggmmggggk..
  ...kgggggggggk..
  ..kggggggggggk..
  .kgggkgggkgggggk
  .kggkkkgkkkgggk.
  ..kgggggggggk...
  ...kkgggggkk....
  ....kk...kk.....
  `;

  const MAP_BOSS_DEVOURER = `
  .k..kkkkkkkk..k.
  .kk.kmmmmmmk.kk.
  ..kkkmmmmmmkkk..
  ..kbmmeemmeemk..
  ..kbmmmmmmmmbk..
  .kbbmwwwwwwmbbk.
  .kbmwwwwwwwwmbk.
  kbbmwmwmwmwmwbbk
  kbbmwwwwwwwwmbbk
  .kbmwwwwwwwwmbk.
  .kbbmwwwwwwmbbk.
  ..kbbmmmmmmbbk..
  ..kbbbmmmmbbbk..
  ...kbbbbbbbbk...
  ....kkbbbbkk....
  ......kkkk......
  `;

  /* --- Pickups & props -------------------------------------- */

  const MAP_GEM = `
  ..kk..
  .kGGk.
  kGWWGk
  kGGGGk
  .kGGk.
  ..kk..
  `;

  const MAP_HEART = `
  .kk..kk.
  kHHkkHHk
  kHHHHHHk
  kHWHHHHk
  .kHHHHk.
  ..kHHk..
  ...kk...
  `;

  const MAP_CHEST = `
  ..kkkkkkkk..
  .kwwwwwwwwk.
  kwWWWWWWWWwk
  kwwwwwwwwwwk
  kkkkkkkkkkkk
  kwwwGGGGwwwk
  kwwwGWWGwwwk
  kwwwwGGwwwwk
  kkkkkkkkkkkk
  `;

  const MAP_COIN = `
  ..kkkk..
  .kGGGGk.
  kGWWGGGk
  kGWGGGGk
  kGGGGGGk
  .kGGGGk.
  ..kkkk..
  `;

  const MAP_MAGNET = `
  ..kkk..kkk..
  .kRRRkkRRRk.
  .kRRRkkRRRk.
  .kRRRkkRRRk.
  .kRRkkkkRRk.
  .kRkkGGkkRk.
  .kkkGGGGkkk.
  ..kkGGGGkk..
  ...kkkkkk...
  `;

  const MAP_SKULL = `
  ..kkkkkk..
  .kbbbbbbk.
  kbbbbbbbbk
  kbkkbbkkbk
  kbkkbbkkbk
  kbbbbbbbbk
  .kbbbbbbk.
  ..kbkbkb..
  `;

  /* =========================================================
     PALETTES
     ========================================================= */

  const CHAR_PALETTES = {
    ember: { k: '#1b0a12', h: '#7d1f3d', H: '#a8355b', r: '#c23b52', R: '#e8656f',
             s: '#f4cda4', e: '#2c0d18', w: '#6b4426', g: '#ff9448' },
    frost: { k: '#0a1024', h: '#1f3d7d', H: '#3560a8', r: '#2f6fb0', R: '#6fb7ee',
             s: '#ecdcff', e: '#0a1030', w: '#4a5a72', g: '#8fe8ff' },
    storm: { k: '#120a24', h: '#3d2a6b', H: '#5a41a0', r: '#6a3fb0', R: '#a87cec',
             s: '#eec9a6', e: '#160a30', w: '#5a4a30', g: '#ffe066' },
    hedge: { k: '#0d1a10', h: '#1f4a2c', H: '#2f6b3d', r: '#3c7d4a', R: '#74c47a',
             s: '#e8cfa8', e: '#0c2014', w: '#5a4426', g: '#b6ff7a' },
  };

  const ENEMY_PALETTES = {
    imp:      { k: '#180612', b: '#c0392b', e: '#ffe066', m: '#3d0a0a' },
    impBlue:  { k: '#06121e', b: '#2f7fbf', e: '#c9ffff', m: '#0a2438' },
    impGreen: { k: '#0a1a08', b: '#4e9b3a', e: '#e8ff8a', m: '#152c10' },
    bat:      { k: '#12060f', w: '#5b2f6b', b: '#8a4fa8', e: '#ff5f8f' },
    batRed:   { k: '#1a0608', w: '#7a2030', b: '#b83a4a', e: '#ffd25f' },
    skeleton: { k: '#101018', b: '#ddd6c0', e: '#5fe0ff' },
    skeleton2:{ k: '#0d1418', b: '#a8c8c0', e: '#ff7a4f' },
    slime:    { k: '#06180f', s: '#3fbf7a', S: '#8fefb8', e: '#0a2a18' },
    slimeAcid:{ k: '#1a1806', s: '#b8bf3f', S: '#f0ef9a', e: '#2a2a0a' },
    cultist:  { k: '#0e0616', h: '#4a2470', g: '#c9a8ff', e: '#ff3f5f', r: '#ffcf5f' },
    cultist2: { k: '#160610', h: '#70244a', g: '#ffa8c9', e: '#5fffd0', r: '#5fc9ff' },
    gargoyle: { k: '#0c0f14', s: '#6b7280', w: '#454b57', e: '#ff9f3f', m: '#1a1d24' },
    wisp:     { k: '#04141c', g: '#2f9fbf', w: '#7fe8ff', W: '#ffffff' },
    wispRed:  { k: '#1c0410', g: '#bf2f6f', w: '#ff8fc9', W: '#ffffff' },
    wraith:   { k: '#0a0814', h: '#2e2a52', e: '#9fffe8' },
  };

  const BOSS_PALETTES = {
    matriarch: { k: '#160418', h: '#3d0e4a', g: '#ff4fd0', s: '#e8c9b8', e: '#ff2f5f',
                 r: '#6b1450', R: '#a82f88', m: '#2a0618' },
    lich:      { k: '#04120e', b: '#cfe0d0', g: '#5fffd0', m: '#0a2a20', r: '#1f4a5f', R: '#3f7f9f' },
    gorgon:    { k: '#0a1608', g: '#5f9f3f', e: '#ffe03f', m: '#1a2f10', s: '#8fbf4f' },
    devourer:  { k: '#14040a', b: '#5f1020', m: '#a82030', w: '#ffcf5f', e: '#ff2f2f' },
  };

  /* =========================================================
     BUILD
     ========================================================= */

  const PIXEL = 4;          // world pixels per sprite pixel, base scale

  function build(name, map, pal, scale) {
    const base = px(map, pal, scale || PIXEL);
    Art.sprites[name] = { r: base, l: flipH(base), flash: tint(base, '#ffffff'), w: base.width, h: base.height };
    return Art.sprites[name];
  }
  Art.build = build;

  Art.init = function () {
    // Player wizards
    for (const id in CHAR_PALETTES) build('wiz_' + id, MAP_WIZARD, CHAR_PALETTES[id], 3);

    // Rank-and-file
    build('imp', MAP_IMP, ENEMY_PALETTES.imp, 3);
    build('impBlue', MAP_IMP, ENEMY_PALETTES.impBlue, 3);
    build('impGreen', MAP_IMP, ENEMY_PALETTES.impGreen, 4);
    build('bat', MAP_BAT, ENEMY_PALETTES.bat, 3);
    build('batRed', MAP_BAT, ENEMY_PALETTES.batRed, 3);
    build('skeleton', MAP_SKELETON, ENEMY_PALETTES.skeleton, 3);
    build('skeleton2', MAP_SKELETON, ENEMY_PALETTES.skeleton2, 3);
    build('slime', MAP_SLIME, ENEMY_PALETTES.slime, 3);
    build('slimeSmall', MAP_SLIME, ENEMY_PALETTES.slime, 2);
    build('slimeAcid', MAP_SLIME, ENEMY_PALETTES.slimeAcid, 3);
    build('cultist', MAP_CULTIST, ENEMY_PALETTES.cultist, 3);
    build('cultist2', MAP_CULTIST, ENEMY_PALETTES.cultist2, 3);
    build('gargoyle', MAP_GARGOYLE, ENEMY_PALETTES.gargoyle, 4);
    build('wisp', MAP_WISP, ENEMY_PALETTES.wisp, 3);
    build('wispRed', MAP_WISP, ENEMY_PALETTES.wispRed, 3);
    build('wraith', MAP_WRAITH, ENEMY_PALETTES.wraith, 3);

    // Bosses
    build('boss_matriarch', MAP_BOSS_MATRIARCH, BOSS_PALETTES.matriarch, 7);
    build('boss_lich', MAP_BOSS_LICH, BOSS_PALETTES.lich, 7);
    build('boss_gorgon', MAP_BOSS_GORGON, BOSS_PALETTES.gorgon, 8);
    build('boss_devourer', MAP_BOSS_DEVOURER, BOSS_PALETTES.devourer, 9);

    // Pickups
    const gemPal = (g, w) => ({ k: '#0a1414', G: g, W: w });
    build('gem1', MAP_GEM, gemPal('#3fd0a8', '#c9fff0'), 3);
    build('gem2', MAP_GEM, gemPal('#4f9fff', '#d0e8ff'), 4);
    build('gem3', MAP_GEM, gemPal('#c96fff', '#f0d8ff'), 5);
    build('gem4', MAP_GEM, gemPal('#ffcf3f', '#fff4c0'), 6);
    build('heart', MAP_HEART, { k: '#1a0610', H: '#ff5f7f', W: '#ffd0d8' }, 3);
    build('chest', MAP_CHEST, { k: '#1a1006', w: '#8a5a2a', W: '#c08a4a', G: '#ffcf3f' }, 3);
    build('coin', MAP_COIN, { k: '#1a1406', G: '#ffcf3f', W: '#fff4c0' }, 3);
    build('magnet', MAP_MAGNET, { k: '#180a0a', R: '#e04f4f', G: '#c0c8d0' }, 3);
    build('skull', MAP_SKULL, { k: '#12100a', b: '#e0dcc8' }, 3);

    buildGlows();
    buildGround();
    buildIcons();
  };

  /* ---------------------------------------------------------
     Glow sprites — pre-rendered radial gradients. Drawing these
     with 'lighter' is far cheaper than per-particle shadowBlur.
     --------------------------------------------------------- */
  const GLOW_COLORS = {
    fire: '#ff8a3c', ember: '#ffd06a', ice: '#8fe8ff', frost: '#d8f4ff',
    volt: '#c9a8ff', spark: '#fff2a8', life: '#7fffb0', toxic: '#a8e83c',
    void: '#c04fff', blood: '#ff4f6f', holy: '#fff0c0', arcane: '#7fa8ff',
    white: '#ffffff', shadow: '#6a3fb8',
  };

  function makeGlow(color, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.28, color);
    grd.addColorStop(0.62, color + '66');
    grd.addColorStop(1, color + '00');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function buildGlows() {
    for (const k in GLOW_COLORS) {
      const hex = GLOW_COLORS[k];
      Art.glows[k] = makeGlow(hex, 64);
      Art.glows[k + '_lg'] = makeGlow(hex, 192);
    }
    Art.glowColor = GLOW_COLORS;

    // Soft round particle (no white core) for smoke and dust.
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    Art.soft = c;
  }

  /* ---------------------------------------------------------
     Ground — one tile, drawn as a repeating pattern. Rune marks
     and cracks are baked in so the floor has texture without
     any per-frame cost.
     --------------------------------------------------------- */
  function buildGround() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');

    g.fillStyle = '#0d0a19';
    g.fillRect(0, 0, S, S);

    // Mottled stone
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const r = 2 + Math.random() * 16;
      const v = Math.random();
      g.fillStyle = v < 0.5 ? 'rgba(30,24,56,0.35)' : 'rgba(6,4,14,0.35)';
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }

    // Flagstone grid, wrapping so tiles line up seamlessly
    g.strokeStyle = 'rgba(70,54,120,0.16)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      const p = i * (S / 4);
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
    }

    // A few faint runes
    g.strokeStyle = 'rgba(140,100,230,0.13)';
    g.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) {
      const x = 24 + Math.random() * (S - 48), y = 24 + Math.random() * (S - 48);
      const r = 8 + Math.random() * 14;
      const sides = 3 + ((Math.random() * 4) | 0);
      g.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * TAU - Math.PI / 2;
        const px_ = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        s === 0 ? g.moveTo(px_, py) : g.lineTo(px_, py);
      }
      g.stroke();
      g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.stroke();
    }

    // Sparse grass tufts to break up the stone
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      g.strokeStyle = `rgba(${40 + Math.random() * 30 | 0},${70 + Math.random() * 40 | 0},60,0.28)`;
      g.lineWidth = 1.5;
      for (let b = 0; b < 3; b++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (b - 1) * 3 + Math.random() * 2, y - 4 - Math.random() * 5);
        g.stroke();
      }
    }
    Art.ground = c;
  }

  /* ---------------------------------------------------------
     UI icons — small vector glyphs for spells and passives.
     --------------------------------------------------------- */
  function iconCanvas(draw, bg) {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (bg) {
      const grd = g.createRadialGradient(16, 16, 2, 16, 16, 17);
      grd.addColorStop(0, bg + 'cc');
      grd.addColorStop(1, bg + '10');
      g.fillStyle = grd;
      g.beginPath(); g.arc(16, 16, 15, 0, TAU); g.fill();
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    draw(g, S);
    return c;
  }

  /** n-pointed star, used by several icons. */
  function star(g, x, y, r1, r2, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = (i / (n * 2)) * TAU + (rot || 0);
      const px_ = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i === 0 ? g.moveTo(px_, py) : g.lineTo(px_, py);
    }
    g.closePath();
  }

  const ICON_DRAW = {
    firebolt: (g) => {
      g.fillStyle = '#ff7a2a';
      g.beginPath();
      g.moveTo(16, 3); g.quadraticCurveTo(26, 14, 22, 21);
      g.arc(16, 21, 6, 0, Math.PI); g.quadraticCurveTo(6, 14, 16, 3);
      g.fill();
      g.fillStyle = '#ffe27a';
      g.beginPath(); g.moveTo(16, 12); g.quadraticCurveTo(21, 18, 16, 25);
      g.quadraticCurveTo(11, 18, 16, 12); g.fill();
    },
    frost: (g) => {
      g.strokeStyle = '#9fe8ff'; g.lineWidth = 2.4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.beginPath(); g.moveTo(16, 16);
        g.lineTo(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12); g.stroke();
        g.lineWidth = 1.6;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7);
          g.lineTo(16 + Math.cos(a + s * 0.6) * 11, 16 + Math.sin(a + s * 0.6) * 11);
          g.stroke();
        }
        g.lineWidth = 2.4;
      }
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(16, 16, 2.6, 0, TAU); g.fill();
    },
    chain: (g) => {
      g.strokeStyle = '#e0d0ff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(19, 3); g.lineTo(10, 15); g.lineTo(16, 15);
      g.lineTo(11, 29); g.lineTo(23, 13); g.lineTo(16, 13); g.lineTo(21, 3);
      g.fillStyle = '#c9a8ff'; g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
    },
    orbs: (g) => {
      g.strokeStyle = 'rgba(160,200,255,.55)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(16, 16, 11, 0, TAU); g.stroke();
      g.fillStyle = '#7fa8ff';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU - 0.6;
        g.beginPath(); g.arc(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 3.6, 0, TAU); g.fill();
      }
      g.fillStyle = '#dfe8ff';
      g.beginPath(); g.arc(16, 16, 3, 0, TAU); g.fill();
    },
    cauldron: (g) => {
      g.fillStyle = '#2a2438';
      g.beginPath(); g.moveTo(6, 15); g.lineTo(26, 15);
      g.quadraticCurveTo(24, 28, 16, 28); g.quadraticCurveTo(8, 28, 6, 15); g.fill();
      g.fillStyle = '#a8e83c';
      g.beginPath(); g.ellipse(16, 15, 10, 3.4, 0, 0, TAU); g.fill();
      g.fillStyle = '#d8ff8a';
      g.beginPath(); g.arc(12, 10, 2.4, 0, TAU); g.fill();
      g.beginPath(); g.arc(19, 7, 1.8, 0, TAU); g.fill();
    },
    bats: (g) => {
      g.fillStyle = '#b07fe8';
      for (const [x, y, s] of [[16, 15, 1], [8, 22, .62], [24, 22, .62]]) {
        g.save(); g.translate(x, y); g.scale(s, s);
        g.beginPath();
        g.moveTo(-11, -4); g.lineTo(-5, 0); g.lineTo(-3, -3); g.lineTo(0, 2);
        g.lineTo(3, -3); g.lineTo(5, 0); g.lineTo(11, -4);
        g.lineTo(7, 5); g.lineTo(0, 7); g.lineTo(-7, 5); g.closePath(); g.fill();
        g.restore();
      }
    },
    beam: (g) => {
      const grd = g.createLinearGradient(4, 16, 30, 16);
      grd.addColorStop(0, '#fff0c0'); grd.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(5, 12); g.lineTo(31, 5); g.lineTo(31, 27); g.lineTo(5, 20); g.fill();
      g.fillStyle = '#fff6d8';
      g.beginPath(); g.arc(6, 16, 5, 0, TAU); g.fill();
    },
    starfall: (g) => {
      g.strokeStyle = 'rgba(255,220,150,.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(4, 2); g.lineTo(13, 13); g.stroke();
      g.beginPath(); g.moveTo(26, 4); g.lineTo(20, 11); g.stroke();
      g.fillStyle = '#ffd479';
      star(g, 17, 19, 11, 4.6, 5, -Math.PI / 2); g.fill();
      g.fillStyle = '#fff6d8';
      star(g, 17, 19, 5, 2, 5, -Math.PI / 2); g.fill();
    },
    siphon: (g) => {
      g.strokeStyle = '#ff5f8f'; g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(5, 26);
      g.bezierCurveTo(12, 20, 12, 12, 22, 8);
      g.stroke();
      g.fillStyle = '#ff8fb0';
      g.beginPath();
      g.moveTo(24, 4); g.bezierCurveTo(30, 8, 27, 14, 22, 15);
      g.bezierCurveTo(19, 12, 20, 6, 24, 4); g.fill();
      g.fillStyle = '#ffd0dd';
      g.beginPath(); g.arc(6, 26, 3, 0, TAU); g.fill();
    },
    ward: (g) => {
      g.fillStyle = 'rgba(120,180,255,.4)';
      g.beginPath(); g.moveTo(16, 3); g.lineTo(27, 8); g.lineTo(27, 17);
      g.quadraticCurveTo(27, 26, 16, 30);
      g.quadraticCurveTo(5, 26, 5, 17); g.lineTo(5, 8); g.closePath();
      g.fill();
      g.strokeStyle = '#bfe0ff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#eaf4ff';
      star(g, 16, 16, 6.5, 2.6, 4, 0); g.fill();
    },

    /* --- passives --- */
    grimoire: (g) => {
      g.fillStyle = '#6a2f8f';
      g.fillRect(6, 5, 20, 22);
      g.fillStyle = '#a05fc9'; g.fillRect(6, 5, 4, 22);
      g.fillStyle = '#f0e8d0'; g.fillRect(11, 8, 12, 16);
      g.fillStyle = '#ffd479'; star(g, 17, 16, 5.4, 2.2, 5, -Math.PI / 2); g.fill();
    },
    boots: (g) => {
      g.fillStyle = '#7a4a28';
      g.beginPath(); g.moveTo(10, 5); g.lineTo(18, 5); g.lineTo(19, 19);
      g.lineTo(27, 22); g.lineTo(27, 27); g.lineTo(9, 27); g.closePath(); g.fill();
      g.fillStyle = '#c9a86a'; g.fillRect(9, 24, 18, 3);
      g.strokeStyle = '#9fe8ff'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(3, 10); g.lineTo(9, 10); g.stroke();
      g.beginPath(); g.moveTo(2, 16); g.lineTo(8, 16); g.stroke();
    },
    amulet: (g) => {
      g.strokeStyle = '#c9c0e8'; g.lineWidth = 2;
      g.beginPath(); g.arc(16, 12, 9, Math.PI * 0.15, Math.PI * 0.85, true); g.stroke();
      g.fillStyle = '#ff5f8f';
      g.beginPath(); g.moveTo(16, 12); g.lineTo(23, 20); g.lineTo(16, 29);
      g.lineTo(9, 20); g.closePath(); g.fill();
      g.fillStyle = '#ffc0d0';
      g.beginPath(); g.moveTo(16, 15); g.lineTo(20, 20); g.lineTo(16, 25); g.lineTo(12, 20); g.closePath(); g.fill();
    },
    hourglass: (g) => {
      g.fillStyle = '#c9a86a'; g.fillRect(7, 3, 18, 3); g.fillRect(7, 26, 18, 3);
      g.fillStyle = 'rgba(200,230,255,.35)';
      g.beginPath(); g.moveTo(9, 6); g.lineTo(23, 6); g.lineTo(16, 16); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(9, 26); g.lineTo(23, 26); g.lineTo(16, 16); g.closePath(); g.fill();
      g.fillStyle = '#ffd479';
      g.beginPath(); g.moveTo(11, 8); g.lineTo(21, 8); g.lineTo(16, 15); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(12, 26); g.lineTo(20, 26); g.lineTo(16, 21); g.closePath(); g.fill();
    },
    lens: (g) => {
      g.strokeStyle = '#d0c8f0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(20, 20); g.lineTo(28, 28); g.stroke();
      g.fillStyle = 'rgba(140,220,255,.45)';
      g.beginPath(); g.arc(14, 14, 9, 0, TAU); g.fill();
      g.strokeStyle = '#e8e0ff'; g.lineWidth = 2.4; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.beginPath(); g.arc(11, 11, 3, 0, TAU); g.fill();
    },
    ring: (g) => {
      g.strokeStyle = '#ffd479'; g.lineWidth = 3.4;
      g.beginPath(); g.arc(16, 19, 9, 0, TAU); g.stroke();
      g.fillStyle = '#7fe8ff';
      star(g, 16, 6, 6, 2.4, 4, 0); g.fill();
    },
    lodestone: (g) => {
      g.fillStyle = '#e04f4f';
      g.beginPath(); g.arc(16, 17, 11, Math.PI, 0); g.fill();
      g.fillStyle = '#0d0a19'; g.fillRect(5, 17, 22, 4);
      g.fillStyle = '#e04f4f'; g.fillRect(5, 21, 5, 6); g.fillRect(22, 21, 5, 6);
      g.fillStyle = '#c0c8d0'; g.fillRect(5, 24, 5, 4); g.fillRect(22, 24, 5, 4);
    },
    ward_p: (g) => {
      g.fillStyle = '#4a5568';
      g.beginPath(); g.moveTo(16, 3); g.lineTo(28, 9);
      g.quadraticCurveTo(28, 25, 16, 30);
      g.quadraticCurveTo(4, 25, 4, 9); g.closePath(); g.fill();
      g.strokeStyle = '#9fb0c8'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#1a1f2a'; g.fillRect(14, 10, 4, 13);
      g.fillRect(9, 14, 14, 4);
    },
    feather: (g) => {
      g.fillStyle = '#ff9448';
      g.beginPath();
      g.moveTo(26, 4);
      g.bezierCurveTo(12, 6, 6, 16, 7, 26);
      g.bezierCurveTo(20, 24, 26, 16, 26, 4);
      g.fill();
      g.strokeStyle = '#ffe27a'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(26, 4); g.lineTo(5, 28); g.stroke();
    },
    moonstone: (g) => {
      g.fillStyle = '#e8f0ff';
      g.beginPath(); g.arc(16, 16, 11, 0, TAU); g.fill();
      g.fillStyle = '#0d0a19';
      g.beginPath(); g.arc(21, 13, 10, 0, TAU); g.fill();
      g.fillStyle = '#7fffb0';
      g.beginPath(); g.arc(9, 21, 2.2, 0, TAU); g.fill();
      g.beginPath(); g.arc(13, 26, 1.5, 0, TAU); g.fill();
    },
    cat: (g) => {
      g.fillStyle = '#1c1830';
      g.beginPath(); g.moveTo(6, 14); g.lineTo(9, 5); g.lineTo(14, 11);
      g.lineTo(18, 11); g.lineTo(23, 5); g.lineTo(26, 14);
      g.quadraticCurveTo(26, 27, 16, 27);
      g.quadraticCurveTo(6, 27, 6, 14); g.fill();
      g.fillStyle = '#7fffb0';
      g.beginPath(); g.ellipse(12, 16, 2.2, 3.2, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(20, 16, 2.2, 3.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff9fc0';
      g.beginPath(); g.arc(16, 22, 1.8, 0, TAU); g.fill();
    },

    /* --- meta / misc --- */
    might: (g) => {
      g.fillStyle = '#c9c0d8';
      g.beginPath(); g.moveTo(16, 2); g.lineTo(20, 16); g.lineTo(16, 20);
      g.lineTo(12, 16); g.closePath(); g.fill();
      g.fillStyle = '#8a5a2a'; g.fillRect(14, 20, 4, 10);
      g.fillStyle = '#ffd479'; g.fillRect(9, 18, 14, 3);
    },
  };

  function buildIcons() {
    const bgFor = {
      firebolt: '#ff7a2a', frost: '#5fc9ff', chain: '#c9a8ff', orbs: '#7fa8ff',
      cauldron: '#a8e83c', bats: '#b07fe8', beam: '#ffd479', starfall: '#ffb84f',
      siphon: '#ff5f8f', ward: '#7fc9ff',
    };
    for (const k in ICON_DRAW) {
      Art.icons[k] = iconCanvas(ICON_DRAW[k], bgFor[k] || '#5a4a8a');
    }
  }

  /* ---------------------------------------------------------
     Runtime helpers used by the renderer
     --------------------------------------------------------- */

  /** Draw a sprite centred on (x,y) in world space. */
  Art.draw = function (g, spr, x, y, facing, scale, flash) {
    const img = flash ? spr.flash : (facing < 0 ? spr.l : spr.r);
    const w = spr.w * (scale || 1), h = spr.h * (scale || 1);
    g.drawImage(img, (x - w / 2) | 0, (y - h / 2) | 0, w, h);
  };

  /** Additive glow blob. Caller is responsible for composite mode. */
  Art.glow = function (g, name, x, y, size, alpha) {
    const img = Art.glows[name] || Art.glows.white;
    g.globalAlpha = alpha;
    g.drawImage(img, x - size / 2, y - size / 2, size, size);
  };

})(window);
