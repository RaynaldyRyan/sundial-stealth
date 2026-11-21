[![make.fun](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/RaynaldyRyan/sundial-stealth/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/RaynaldyRyan/sundial-stealth/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759)

# SUNDIAL — A Thief in the Siesta Sun

A bright top-down stealth game for the [make.fun best stealth game bounty](https://make.fun/bounty/best-stealth-game-20261121-1759). Calvera, a cliffside limestone town at siesta: shutters closed, streets empty, and the only guard that never blinks is the sun. You are a thief working an empty town in the worst possible light.

Five levels, five hours — noon to six — each with its own colour script, sun angle and shadow length:

1. **The Sixth Hour** (noon) — steal the Brass Gnomon from the courtyard sundial.
2. **Lemon Stair** (1pm) — take the Jade Key from the upper terrace.
3. **Bell Court** (2pm) — steal the Bell-Ringer's Tally under a swinging bell.
4. **Cold Fountain** (4pm) — recover the Fountain Cipher.
5. **The Gilded Stair** (6pm) — take the Gilded Hourglass and escape as the sun sets.

## The three mechanics

- **The sun is a clock.** One global light vector rotates as the level runs. Every occluder extrudes a shadow polygon along it, so cover shrinks and grows on its own and routes close behind you.
- **Shutters are level geometry.** Press E by a shutter to flip it: light floods the street, guards caught in it flinch and shield their eyes for 2 seconds, and the whole shadow pass re-runs.
- **Dust footprints.** You drop a fading footprint every 8px. An idle guard whose patrol passes near a fresh print diverts to investigate it.

Detection is one float with four bands — HIDDEN, SUSPICIOUS, SEARCHING, ALARM — that climbs in light and near guards, falls in shadow, and spikes on sprinting noise. Guards patrol, pause with a "?", search your last-seen spot, and chase on alarm. Get caught in the open and the run ends; steal the objective and reach the exit unseen for a GHOST rating.

## Controls

WASD / arrows move · SHIFT sneak (silent, slow) · SPACE sprint (loud, fast) · E interact · ESC pause · 1–5 pick a level.

## Play it

Serve `game/` with any static HTTP server and open `game/index.html` in desktop Chrome. No build step, no network at runtime: every script is a file under `game/`.

## Layout

- `game/index.html` — the page; a 2560×1440 canvas, 1280×720 logical.
- `game/src/main.js` — loop, state machine, staged screenshot scenes, self-test.
- `game/src/levels.js` — the five hours: data for every level.
- `game/src/shadows.js` — sun-clock shadow extrusion and the baked shadow layer.
- `game/src/guards.js` — patrols, vision cones, suspicion, flinch, footprint investigation.
- `game/src/player.js` — movement, collision, footprints, interaction.
- `game/src/detection.js` — the suspicion float, bands, cone and line-of-sight tests.
- `game/src/render.js` — town, HUD, title, level select, pause, caught, escaped.
- `main.ts` — the hand-in program: copies `game/` + `screenshots/` to `/output` and writes `dossier.json`.
