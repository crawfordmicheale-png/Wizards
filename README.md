# Hex & Hollow — Arcane Survivors

A witches-and-wizards **survivor bullet-hell** that runs entirely in the browser.
You move; your spells cast themselves. Hold out against the hollow for fifteen
minutes and the sun does the rest.

## Play

Open `index.html` in any modern browser. That's it — no build step, no install,
no server, no network. It works straight off the filesystem.

If you'd rather serve it:

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move |
| `Space` | Blink — a short dash with brief invulnerability |
| `Esc` / `P` | Pause |
| `M` | Mute |
| `1`–`4` | Pick a level-up card |
| Touch | Drag anywhere on the left to move, tap the sigil to Blink |

Your body is big but your **soul-core is tiny** — the glowing dot at your centre
is the only thing enemy bullets can hit. Enemy *bodies* still hurt on contact.

## How a run goes

- Kill things, collect the essence they drop, level up, pick a boon.
- Six spell slots and six charm slots. Spells cap at level 8.
- Take a spell to 8 **and** max its paired charm to unlock an **evolution** —
  a distinct, much nastier version. Evolution cards preempt everything else.
- A Warden wakes every 2½ minutes. They hit hard, shift patterns at 40% health,
  and drop a chest.
- Survive to **15:00** to win.

Soul shards persist. Spend them in **The Coven Vault** on permanent upgrades —
that's the intended path from "died at six minutes" to actually seeing dawn.

## Stages

Where you hold the vigil changes what holds it against you. Within a stage the
swarm creatures and the Warden order are **shuffled every run**, so the beats
stay authored while the cast varies.

| Stage | Character | Unlock |
| --- | --- | --- |
| **The Hollow** | Everything in fair measure | open |
| **The Drowned Chapel** | Casters and archers; fewer bodies, far more spellfire | survive one night |
| **The Ashen Waste** | Fast melee, almost no spellfire, and it never stops | 3000 lifetime kills |

Each stage re-colours the ground, applies per-enemy weight multipliers over the
base spawn table, tilts crowd size and speed, and picks which Wardens turn up.
Measured over 150 seconds, the Chapel runs roughly 18 ranged to 22 melee where
the Hollow runs 8 to 49 and the Waste 4 to 58.

## Settings

Screen shake (full / reduced / off), particle density, damage numbers and sound,
all persisted. Shake in particular is worth turning down — boss detonations kick
hard, and there was previously no way to stop them.

## Curses

Ten optional handicaps, bound from the title screen and kept until you lift
them. Each makes the run harder and raises the shard payout; they stack, up to
+260%.

| Curse | Effect | Payout |
| --- | --- | --- |
| Swarm | Far more of everything | +25% |
| Frailty | −30% maximum health | +20% |
| Glass Heart | You deal +60%, take +80% | +30% |
| Hunger | Essence rots after 12s and barely drifts toward you | +25% |
| Creeping Fog | The dark closes in; you see much less coming | +20% |
| Restless Wardens | Bosses wake 25% sooner and hit far harder | +30% |
| Leadfoot | −18% movement speed | +25% |
| Barrage | Hostile spells fly 40% faster and hit 35% harder | +30% |
| Famine | −35% essence gained | +30% |
| Brittle Soul | Revivals do not work | +25% |

Every curse is a multiplier on a value the engine already reads, so none of them
needed special-case logic at the point of use. Hunger is the exception worth
knowing about. Loose essence normally drifts after you once it is a few seconds
old, which would have swept up every gem before it could rot; under Hunger that
drift slows to half a walking pace and essence expires at 12s.

Those numbers came from a five-seed sweep rather than a guess. The first version
rotted at 8s with no drift at all, which cost a collecting player 52% of their
levels and a pure kiter 79% — far too steep for a +25% payout when Famine costs
30% for +30%. At 12s / half-speed drift it costs a collector about 18% and a
kiter roughly half, which taxes kiting specifically rather than punishing
everyone. Single runs could not measure this: changing one parameter sends the
seeded run down a different build, so per-setting means over five seeds were
needed to see the trend at all.

## Characters

| | Starts with | Bonus |
| --- | --- | --- |
| **Elara Ashthorn**, Emberwitch | Firebolt | +15% spell damage |
| **Morwenna Rime**, Frostwarden | Frost Nova | +22% spell area, sturdier |
| **Zephyr Vance**, Stormcaller | Chain Lightning | +14% speed, +10% cast rate |
| **Bramble Hex**, Hedge-Witch | Bubbling Cauldron | +0.7 HP/s, +30% pickup range |

Bramble unlocks at 600 lifetime kills.

## About the assets

There are none to download. Every sprite is a hand-authored pixel map compiled
to a canvas at load time (`js/art.js`); glows, the ground tile and the UI icons
are generated procedurally; all sound and the music loop are synthesised with
the Web Audio API (`js/core.js`). Nothing is fetched at runtime, so the game
runs offline, from `file://`, and behind any content-security policy.

## Layout

```
index.html          shell + every UI overlay
css/style.css
js/core.js          math, pooling, spatial hash, input, audio synthesis, save
js/art.js           pixel maps, sprite/glow/ground/icon generation
js/content.js       characters, spells, passives, enemies, bosses, vault
js/entities.js      player, enemies, bosses, projectiles, particles
js/game.js          main loop, spawn director, rendering, UI
```

## Tests

```bash
npm install
npx playwright install chromium
npm test
```

`tests/smoke.mjs` boots the real page in headless Chromium and drives the real
update loop — there is no mock game. `Math.random` is replaced with a seeded
PRNG before any game script runs, and the suite guards that seeding two ways:
it runs one scenario twice from the same seed and compares results, and it
asserts no scenario leaves a pending timer behind.

Both exist because *asynchronous* consumers of `Math.random` are easy to
reintroduce and drain entropy at a rate set by wall-clock speed. The music
scheduler was one such consumer; the deferred level-up card was another.

Scope of that guarantee, stated precisely: results are reproducible for a given
**Chromium build**, and the checks verify that. Different builds diverge
slightly — a long run reports a peak crowd of 244 on CI and 248 in a sandbox
running an older browser. That is a browser difference, not a seeding failure:
the floating-point fingerprints are byte-identical, and CI is stable run to run.

CI always uses the build Playwright pins. If the suite cannot find that build it
falls back to a system Chromium so it still runs, and prints a warning saying
exact counts will differ. Every assertion is a range rather than a golden value,
so both paths pass.

It covers: boot and asset generation; self-verified determinism; that every
sprite, icon, spawn-table and evolution reference in `content.js` actually
resolves; a four-minute run with a kiting bot; far-enemy recycling; a full
15-minute *pacifist* run (no spells at all — the case that once spiralled);
every spell in its evolved form; every enemy AI branch and boss attack pattern;
every curse; every stage; and each UI surface.

Stages are checked for identity rather than existence: the Chapel must actually
field proportionally more ranged enemies than the Hollow, the Waste must crowd
harder with fewer shooters, and ten rolls of a stage plan must produce at least
five distinct swarm-and-Warden orders.

Curses are checked for measurable effect, not mere existence — Swarm has to
actually raise the crowd, Restless Wardens has to actually spawn a boss earlier.
Where a curse changes a mechanism rather than a statistic it gets a direct probe
instead: Barrage is asserted on projectile velocity, Brittle Soul by holding
three revives and confirming death still ends the run, Hunger by watching a
single gem expire. Those are preferred wherever available, because an emergent
statistic can move for reasons unrelated to the change — a first draft of the
Barrage check asserted bullet *count* and passed vacuously at 0 to 0.

Every major guard was validated by mutation rather than assumed to work:
deleting the despawn line takes the pacifist crowd from 248 to 1448; scaling all
spell damage to 15% drops the bot to level 4 with 43 kills; letting the music
scheduler run again makes the same seed produce 160 kills instead of 103. Each
fails the checks written for it.

It deliberately does *not* fail on single-spell tuning changes — the seeded run
simply picks a different build, and that is balance work rather than a
regression.

CI runs this on every push to `main` and every pull request
(`.github/workflows/ci.yml`), uploading a screenshot if anything fails.

### Performance notes

Enemies and projectiles are pooled; broadphase collision goes through a uniform
spatial hash. Particle output and damage numbers scale down automatically if the
frame rate dips, and enemies the player has long since outrun are recycled
rather than accumulating forever.
