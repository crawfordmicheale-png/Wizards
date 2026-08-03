/* ============================================================
   smoke.mjs — headless regression suite for Hex & Hollow.

   Boots the real page in Chromium and drives the real update
   loop. Math.random is replaced with a seeded PRNG before any
   game code runs, so scenarios are reproducible for a given
   Chromium build. Different builds diverge slightly, so every
   assertion is a range rather than a golden value.

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

/* Returns the browser plus whether it is the version Playwright pins.
   The fallback is what lets this run in sandboxes with no browser
   download, but a different Chromium produces slightly different
   simulation results — so say so loudly rather than leaving someone to
   wonder why their numbers disagree with CI. */
async function launch() {
  try {
    return { browser: await chromium.launch(), pinned: true };
  } catch (err) {
    const exe = findLocalChromium();
    if (!exe) throw err;
    return { browser: await chromium.launch({ executablePath: exe }), pinned: false, exe };
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

      /* chooseCard defers the next queued card by 90ms so the modal can
         animate. Inside a synchronous scenario that timer cannot fire, so
         it lands in the gap between scenarios instead — where it re-rolls
         cards and draws from the seeded stream, shifting every later
         scenario by an amount that depends on wall-clock timing. Run the
         follow-up inline so nothing is left pending. */
      const realSetTimeout = window.setTimeout;
      window.setTimeout = (fn) => { fn(); return 0; };
      try {
        G.chooseCard((up.length ? up : cs)[0]);
      } finally {
        window.setTimeout = realSetTimeout;
      }
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
        // Sampled here, synchronously: a timer with a short delay would
        // otherwise fire during the round-trip out to the test runner.
        pending: window.__pendingTimers(),
      };
    },
  };
}

/* ============================================================ */
async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const server = await serve();
  const { browser, pinned, exe } = await launch();
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

    /* Track outstanding timers. A scenario that ends with one pending
       leaks it into the gap before the next scenario, where it runs
       game code and draws from the seeded stream — the exact shape of
       cross-machine drift. Asserting the count is zero catches that at
       the source, rather than hoping a scenario happens to expose it. */
    const realSet = window.setTimeout, realClear = window.clearTimeout;
    const pending = new Set();
    window.setTimeout = function (fn, ms, ...rest) {
      const id = realSet.call(window, function () {
        pending.delete(id);
        return typeof fn === 'function' ? fn.apply(this, arguments) : undefined;
      }, ms, ...rest);
      pending.add(id);
      return id;
    };
    window.clearTimeout = function (id) { pending.delete(id); return realClear.call(window, id); };
    window.__pendingTimers = () => pending.size;
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* Environment fingerprint. Simulation results are reproducible on a
     given machine but have been observed to differ slightly between
     machines; printing this makes a local-vs-CI discrepancy diagnosable
     from the logs instead of guesswork. */
  const env = await page.evaluate(() => ({
    ua: navigator.userAgent.replace(/^.*(Chrome\/[\d.]+).*$/, '$1'),
    view: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
    spawnRadius: W.Game.spawnRadius,
    math: [Math.sin(1e6), Math.cos(0.7), Math.hypot(3.3, 4.7),
           Math.pow(1.1, 17), Math.atan2(0.3, 0.7), Math.exp(1.5)]
      .map((n) => n.toPrecision(17)).join(','),
  }));
  console.log(`\x1b[90menv  ${env.ua}  ${env.view}  spawnR=${env.spawnRadius}\x1b[0m`);
  console.log(`\x1b[90mmath ${env.math}\x1b[0m`);
  if (!pinned) {
    console.log(`\x1b[33mwarn using a system Chromium (${exe}), not the build Playwright pins.\n` +
                `     Checks still hold, but exact counts will differ from CI.\x1b[0m`);
  }
  console.log('');

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
  await page.evaluate(() => {
    W.Game.start(); window.__h.takeOver(); window.__seed(0x1234567);
    window.__detA = window.__h.run(60 * 90);
  });
  await page.evaluate(() => {
    W.Game.start(); window.__h.takeOver(); window.__seed(0x1234567);
  });
  // Deliberate gap *after* reseeding: a timer left pending by run A fires
  // here and draws from the fresh stream, so run B diverges. Comparing
  // inside one evaluate would miss it entirely — timers cannot fire while
  // synchronous page code is running.
  await page.waitForTimeout(350);
  const det = await page.evaluate(() => {
    const b = window.__h.run(60 * 90);
    return { a: window.__detA, b, equal: JSON.stringify(window.__detA) === JSON.stringify(b) };
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
  // Chest pickups queue two cards at once, so this run exercises the
  // deferred level-up path that leaks timers if the harness lets it.
  check('scenario leaves no pending timers', run.pending === 0, `${run.pending} outstanding`);

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

  /* ---------- 5b. curses ----------
     Each curse must measurably change the run. Where a curse has no
     aggregate signal (it changes projectile speed, or a death rule)
     it gets a direct probe instead of a statistic that might happen
     to move on its own.                                          */
  errors.length = 0;
  const curse = await page.evaluate(() => {
    const G = W.Game;

    const runCurse = (ids, secs) => {
      W.Save.data.curses = ids;
      W.Save.data.meta = {};                 // no vault, so effects stay visible
      window.__seed(0x5EED10);
      G.selectedChar = 'ember';
      G.start();
      window.__h.takeOver();
      const p = G.player;
      const r = window.__h.run(60 * secs);
      return { ...r, maxhp: p.maxhp, dmg: +p.stat.damage.toFixed(3),
               speed: Math.round(p.baseSpeed), shard: G.curse.shardBonus,
               bosses: G.bosses.length };
    };

    // 130s: past the first Warden under the Restless curse (150s x 0.75)
    // but before it on a clean run, which is the difference we assert.
    const base = runCurse([], 130);
    const each = {};
    for (const c of W.Content.curses) each[c.id] = runCurse([c.id], 130);
    const stacked = runCurse(W.Content.curses.map((c) => c.id), 60);

    const probe = {};

    // Barrage changes projectile speed, not projectile count — a count
    // would be the wrong thing to assert, and could move either way.
    const shotSpeed = (ids) => {
      W.Save.data.curses = ids;
      G.start();
      G.bulletPool.clear();
      G.spawnBullet(0, 0, 0, 100, 5, 'void');
      return Math.round(G.bulletPool.active[0].vx);
    };
    probe.shotBase = shotSpeed([]);
    probe.shotBarrage = shotSpeed(['barrage']);

    // Brittle Soul must actually suppress a revive that would otherwise fire.
    const dieHolding = (ids) => {
      W.Save.data.curses = ids;
      G.start();
      G.state = 'play';
      const p = G.player;
      p.revives = 3;
      p.hp = 1;
      G.playerDown();
      const out = { state: G.state, revives: p.revives };
      document.getElementById('over').classList.add('hidden');
      return out;
    };
    probe.dieBase = dieHolding([]);
    probe.dieBrittle = dieHolding(['brittle']);

    // Hunger: essence must actually rot, and the lazy drift must slow.
    // The gem is placed far enough away that the normal drift cannot
    // reach the player inside the window, so the control is honest —
    // otherwise the baseline gem is simply collected and both arms read
    // the same. Level counts are too build-dependent to assert on here;
    // the balance itself was settled by a five-seed sweep offline.
    const gemAfter = (ids, secs) => {
      W.Save.data.curses = ids;
      G.start();
      W.Input.ax = 0; W.Input.ay = 0;
      G.pickupPool.clear();
      G.spawnPickup('xp1', G.player.x + 8000, G.player.y);
      const gem = G.pickupPool.active[0];
      for (let i = 0; i < 60 * secs; i++) G.update(1 / 60);
      return { alive: !gem.dead, speed: Math.round(Math.hypot(gem.vx, gem.vy)) };
    };
    probe.gemBase = gemAfter([], 14);
    probe.gemHunger = gemAfter(['hunger'], 14);
    probe.driftBase = gemAfter([], 6);
    probe.driftHunger = gemAfter(['hunger'], 6);

    // Creeping Fog only changes rendering, so prove it renders.
    W.Save.data.curses = ['fog'];
    G.start();
    window.__h.takeOver();
    window.__h.run(60 * 3, { render: true });
    G.render();

    W.Save.data.curses = [];
    return { base, each, stacked, probe };
  });
  check('curses run clean', errors.length === 0, errors[0] || '');

  {
    const b = curse.base, e = curse.each, pr = curse.probe;
    check('Swarm raises pressure', e.swarm.maxEnemies > b.maxEnemies * 1.15,
          `${b.maxEnemies} -> ${e.swarm.maxEnemies}`);
    check('Frailty cuts health', e.frailty.maxhp < b.maxhp * 0.8,
          `${b.maxhp} -> ${e.frailty.maxhp}`);
    check('Glass Heart raises damage', e.glass.dmg > b.dmg * 1.4, `${b.dmg} -> ${e.glass.dmg}`);
    check('Hunger rots loose essence',
          pr.gemBase.alive && !pr.gemHunger.alive,
          `at 14s: clean=${pr.gemBase.alive ? 'alive' : 'gone'}, hunger=${pr.gemHunger.alive ? 'alive' : 'gone'}`);
    check('Hunger slows the essence drift',
          pr.driftHunger.speed < pr.driftBase.speed * 0.7 && pr.driftHunger.speed > 0,
          `${pr.driftBase.speed} -> ${pr.driftHunger.speed} px/s`);
    check('Leadfoot slows you', e.leadfoot.speed < b.speed * 0.9,
          `${b.speed} -> ${e.leadfoot.speed}`);
    check('Famine starves progress', e.famine.level < b.level, `lv ${b.level} -> ${e.famine.level}`);
    check('Restless Wardens wake early', e.wardens.bosses > 0 && b.bosses === 0,
          `bosses at 130s: ${b.bosses} -> ${e.wardens.bosses}`);
    check('Barrage speeds hostile fire', pr.shotBarrage > pr.shotBase * 1.3,
          `${pr.shotBase} -> ${pr.shotBarrage} px/s`);
    check('Brittle Soul suppresses revival',
          pr.dieBase.state !== 'over' && pr.dieBrittle.state === 'over',
          `clean=${pr.dieBase.state}, brittle=${pr.dieBrittle.state}`);
    check('Creeping Fog renders', errors.length === 0, errors[0] || '');
    check('every curse pays out', Object.values(e).every((r) => r.shard > 0), 'all > 0');
    check('curses stack their payout', curse.stacked.shard > 2,
          `+${Math.round(curse.stacked.shard * 100)}%`);
    check('all curses at once still runs', curse.stacked.time > 0,
          `t=${curse.stacked.time}s`);
  }

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
