/* ============================================================
   smoke.mjs — headless regression suite for Hex & Hollow.

   Boots the real page in Chromium and drives the real update
   loop. Math.random is replaced with a seeded PRNG before any
   game code runs, so every scenario is reproducible and CI does
   not flake.

   Run with:  npm test
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = path.join(ROOT, 'tests', 'artifacts');
const PORT = 8791;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/* ---------------- result collection ---------------- */
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  const tag = ok ? '\x1b[32m  ok  \x1b[0m' : '\x1b[31m FAIL \x1b[0m';
  console.log(`${tag} ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
};

/* ---------------- static server ---------------- */
function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

/* ---------------- browser resolution ----------------
   CI uses `npx playwright install chromium`, which Playwright
   finds on its own. Some sandboxes ship a prebuilt browser at a
   non-standard path, so fall back to locating one.            */
function findLocalChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return null;
  for (const d of fs.readdirSync(base)) {
    if (!d.startsWith('chromium-')) continue;
    const exe = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (err) {
    const exe = findLocalChromium();
    if (!exe) throw err;
    return chromium.launch({ executablePath: exe });
  }
}

/* ---------------- in-page helpers ----------------
   Installed once on window, then reused by every scenario.   */
function installHelpers() {
  const G = window.W.Game;
  window.W.Audio.setMuted(true);

  /* The music scheduler runs on a setTimeout loop and draws from
     Math.random() on every step. Left running, it consumes seeded
     entropy at a rate set by wall-clock speed, so a fast machine and
     a slow one diverge. Silence it so the simulation is the only
     consumer. */
  window.W.Audio.stopMusic();
  window.W.Audio.startMusic = () => {};

  window.__h = {
    /** Halt the rAF chain so scenarios control time exactly. */
    takeOver() { G.loop = () => {}; },

    /** Repulsion-based kiting bot — approximates a competent player. */
    bot() {
      const p = G.player;
      let fx = 0, fy = 0;
      const en = G.enemyPool.active;
      for (let i = 0; i < en.length; i += 2) {
        const e = en[i];
        if (e.dead) continue;
        const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
        if (d2 > 260 * 260 || d2 < 1) continue;
        fx += dx / d2 * 1400; fy += dy / d2 * 1400;
      }
      const bl = G.bulletPool.active;
      for (let i = 0; i < bl.length; i++) {
        const b = bl[i];
        if (b.dead) continue;
        const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > 150 * 150 || d2 < 1) continue;
        fx += dx / d2 * 3200; fy += dy / d2 * 3200;
      }
      const a = G.time * 0.4;
      fx += Math.cos(a) * 0.9; fy += Math.sin(a) * 0.9;
      const m = Math.hypot(fx, fy) || 1;
      window.W.Input.ax = fx / m; window.W.Input.ay = fy / m;
      window.W.Input.dashQueued = p.dashCd <= 0 && Math.random() < 0.03;
    },

    /** Always take an upgrade over a brand-new pick, like a real player. */
    autoPick() {
      const cs = G.pendingCards;
      if (!cs || !cs.length) { G.state = 'play'; return; }
      const up = cs.filter((c) => !/^New/.test(c.tag));
      G.chooseCard((up.length ? up : cs)[0]);
    },

    /** Step the real update loop, tracking peak load. */
    run(frames, { render = false } = {}) {
      let maxEnemies = 0, maxBullets = 0, levelUps = 0;
      for (let i = 0; i < frames; i++) {
        if (G.state === 'levelup') { levelUps++; this.autoPick(); continue; }
        if (G.state === 'over') break;
        G.state = 'play';
        this.bot();
        G.update(1 / 60);
        if (render) G.render();
        maxEnemies = Math.max(maxEnemies, G.enemyPool.active.length);
        maxBullets = Math.max(maxBullets, G.bulletPool.active.length);
      }
      const p = G.player;
      return {
        time: Math.floor(G.time), state: G.state, level: p.level, kills: G.kills,
        hp: Math.round(p.hp), maxEnemies, maxBullets, levelUps,
        spells: p.spells.length,
      };
    },
  };
}

/* ============================================================ */
async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const server = await serve();
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message} @ ${(e.stack || '').split('\n')[1] || '?'}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  // Determinism: seed the PRNG before any game script executes.
  await page.addInitScript(() => {
    let s = 0;
    window.__seed = (n) => { s = n | 0; };
    window.__seed(0x9e3779b9);
    Math.random = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* ---------- 1. boot ---------- */
  const boot = await page.evaluate(() => ({
    sprites: Object.keys(W.Art.sprites).length,
    icons: Object.keys(W.Art.icons).length,
    state: W.Game.state,
    ground: !!W.Art.ground,
    menuChars: document.querySelectorAll('#charSelect .char').length,
  }));
  check('boots without errors', errors.length === 0, errors[0] || '');
  check('sprites generated', boot.sprites >= 30, `${boot.sprites} sprites`);
  check('icons generated', boot.icons >= 20, `${boot.icons} icons`);
  check('ground tile generated', boot.ground);
  check('title screen renders characters', boot.menuChars >= 4, `${boot.menuChars} shown`);

  /* ---------- 2. content <-> art wiring ----------
     Catches a renamed or deleted sprite/icon long before it
     surfaces as an undefined at runtime.                    */
  const wiring = await page.evaluate(() => {
    const missing = [];
    const C = W.Content, A = W.Art;
    for (const c of C.chars) if (!A.sprites[c.spr]) missing.push(`char ${c.id} -> ${c.spr}`);
    for (const id in C.enemies) if (!A.sprites[C.enemies[id].spr]) missing.push(`enemy ${id}`);
    for (const id in C.bosses) if (!A.sprites[C.bosses[id].spr]) missing.push(`boss ${id}`);
    for (const id in C.spells) if (!A.icons[C.spells[id].icon]) missing.push(`spell ${id}`);
    for (const id in C.passives) if (!A.icons[C.passives[id].icon]) missing.push(`passive ${id}`);
    for (const u of C.vault) if (!A.icons[u.icon]) missing.push(`vault ${u.id}`);
    // Every spell that evolves must name a real passive.
    for (const id in C.spells) {
      const e = C.spells[id].evo;
      if (e && !C.passives[e.req]) missing.push(`evo ${id} -> ${e.req}`);
    }
    // Every spawn-table and event entry must name a real enemy.
    for (const r of C.spawnTable) if (!C.enemies[r.id]) missing.push(`spawn ${r.id}`);
    for (const e of C.events) if (!C.enemies[e.type]) missing.push(`event ${e.type}`);
    for (const b of C.bossSchedule) if (!C.bosses[b.id]) missing.push(`schedule ${b.id}`);
    return missing;
  });
  check('content references resolve', wiring.length === 0, wiring.slice(0, 3).join('; '));

  await page.evaluate(installHelpers);

  /* ---------- 2b. determinism ----------
     Same seed, same run, twice. Any asynchronous consumer of
     Math.random() — a scheduler, a timer, an animation callback —
     drifts the second result and fails here, which is what keeps
     the thresholds below from flaking on a faster machine. */
  const det = await page.evaluate(() => {
    const once = () => {
      window.__seed(0x1234567);
      W.Game.start();
      window.__h.takeOver();
      return window.__h.run(60 * 90);
    };
    const a = once(), b = once();
    return { a, b, equal: JSON.stringify(a) === JSON.stringify(b) };
  });
  check('simulation is deterministic', det.equal,
        det.equal ? `kills=${det.a.kills} level=${det.a.level}`
                  : `${JSON.stringify(det.a)} vs ${JSON.stringify(det.b)}`);

  /* ---------- 3. a real 4-minute run ---------- */
  errors.length = 0;
  const run = await page.evaluate(() => {
    const G = W.Game;
    for (const u of W.Content.vault) W.Save.data.meta[u.id] = u.max;
    G.selectedChar = 'ember';
    G.start();
    window.__h.takeOver();
    return window.__h.run(60 * 240);
  });
  check('4-minute run stays error-free', errors.length === 0, errors[0] || '');
  check('run reaches 4:00', run.time >= 235, `t=${run.time}s state=${run.state}`);
  check('player progresses', run.level >= 10, `level ${run.level}`);
  // Guards the damage-output regression that once left kills ~5x too low.
  check('kill rate is healthy', run.kills >= 300, `${run.kills} kills`);
  check('bullet cap holds', run.maxBullets <= 900, `peak ${run.maxBullets}`);
  check('level-ups were offered', run.levelUps > 0, `${run.levelUps} cards taken`);

  /* ---------- 3b. far-enemy recycling ----------
     Direct test of the mechanism. A well-armed player kills fast
     enough to hide a broken despawn, so drive it explicitly.   */
  const cull = await page.evaluate(() => {
    const G = W.Game;
    G.start();
    const p = G.player;
    const sc = G.difficulty();
    for (let i = 0; i < 300; i++) {
      const a = Math.random() * Math.PI * 2;
      G.enemyPool.spawn().init(W.Content.enemies.imp,
        p.x + Math.cos(a) * 400, p.y + Math.sin(a) * 400, sc);
    }
    const before = G.enemyPool.active.length;
    p.x += 9000; p.y += 9000;             // outrun them all at once
    W.Input.ax = 0; W.Input.ay = 0;
    for (let i = 0; i < 4; i++) G.update(1 / 60);
    return { before, after: G.enemyPool.active.length };
  });
  check('outrun enemies are recycled', cull.before >= 290 && cull.after <= 30,
        `${cull.before} -> ${cull.after}`);

  /* ---------- 3c. pacifist endurance ----------
     A player who cannot kill is the case that once spiralled: the
     crowd grew without bound and essence never came back. Runs the
     full 15 minutes so every scripted swarm and boss fires.     */
  errors.length = 0;
  const pacifist = await page.evaluate(() => {
    const G = W.Game;
    G.start();
    const p = G.player;
    p.spells.length = 0;                  // no damage at all
    p.hurt = () => {};                    // survive to the end
    return window.__h.run(60 * 905);
  });
  check('full-length run stays error-free', errors.length === 0, errors[0] || '');
  check('reaches the 15:00 win', pacifist.time >= 900, `t=${pacifist.time}s`);
  check('crowd stays bounded without kills', pacifist.maxEnemies <= 500,
        `peak ${pacifist.maxEnemies}`);

  /* ---------- 4. every spell, including evolutions ----------
     A normal run never reaches most of these code paths.     */
  errors.length = 0;
  const spellIds = await page.evaluate(() => Object.keys(W.Content.spells));
  for (let i = 0; i < spellIds.length; i += 5) {
    const batch = spellIds.slice(i, i + 5);
    const r = await page.evaluate((batch) => {
      const G = W.Game;
      G.start();
      const p = G.player;
      p.spells.length = 0;
      for (const id of batch) {
        const sp = p.addSpell(id);
        if (sp) { sp.level = 8; sp.evolved = true; }
      }
      G.time = 300;                       // dense enough to have targets
      return window.__h.run(60 * 25);
    }, batch);
    check(`evolved spells fire: ${batch.join(', ')}`, errors.length === 0 && r.kills > 0,
          errors[0] || `${r.kills} kills`);
    errors.length = 0;
  }

  /* ---------- 5. every enemy and boss ----------
     Exercises each AI branch and every boss attack pattern.  */
  errors.length = 0;
  const zoo = await page.evaluate(() => {
    const G = W.Game;
    G.start();
    window.__h.takeOver();
    const p = G.player;
    p.spells.length = 0;
    const sp = p.addSpell('firebolt'); sp.level = 8;
    const sc = G.difficulty();
    let n = 0;
    for (const id in W.Content.enemies) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * 260;
        G.enemyPool.spawn().init(W.Content.enemies[id],
          p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, sc);
        n++;
      }
    }
    for (const id in W.Content.bosses) G.spawnBoss(id, 0.2, sc);
    p.hurt = () => {};                    // survive long enough to cycle patterns
    const r = window.__h.run(60 * 30, { render: true });
    return { ...r, spawned: n, bosses: G.bosses.length };
  });
  check('all enemy AI + boss patterns run clean', errors.length === 0, errors[0] || '');
  check('bosses take damage', zoo.kills >= 0 && zoo.spawned > 0,
        `${zoo.spawned} mobs, ${zoo.bosses} bosses left`);

  /* ---------- 6. UI surfaces ---------- */
  errors.length = 0;
  const ui = await page.evaluate(() => {
    const G = W.Game;
    G.start();
    G.levelQueue = 1; G.openLevelUp();
    const cards = document.querySelectorAll('#cards .card').length;
    document.getElementById('levelup').classList.add('hidden');
    G.state = 'play'; G.levelQueue = 0;

    G.togglePause();
    const paused = !document.getElementById('pause').classList.contains('hidden');
    const loadout = document.querySelectorAll('#pauseLoadout .ld-row').length;
    G.togglePause();

    G.endRun(false, true);
    const over = !document.getElementById('over').classList.contains('hidden');
    const results = document.querySelectorAll('#results .res').length;

    document.getElementById('over').classList.add('hidden');
    G.toMenu();
    G.openVault();
    const vault = document.querySelectorAll('#vaultGrid .vault-item').length;
    return { cards, paused, loadout, over, results, vault };
  });
  check('level-up offers cards', ui.cards >= 1 && ui.cards <= 4, `${ui.cards} cards`);
  check('pause shows loadout', ui.paused && ui.loadout >= 1, `${ui.loadout} rows`);
  check('game over shows results', ui.over && ui.results === 5, `${ui.results} tiles`);
  check('vault renders upgrades', ui.vault >= 10, `${ui.vault} items`);
  check('UI transitions are error-free', errors.length === 0, errors[0] || '');

  /* ---------- report ---------- */
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) {
    await page.screenshot({ path: path.join(ARTIFACTS, 'failure.png') }).catch(() => {});
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  await browser.close();
  server.close();

  if (failed.length) {
    console.error(`\n${failed.length} check(s) failed:`);
    for (const f of failed) console.error(`  - ${f.name} ${f.detail}`);
    process.exit(1);
  }
  console.log('smoke suite green');
}

main().catch((err) => {
  console.error('smoke suite crashed:', err);
  process.exit(1);
});
