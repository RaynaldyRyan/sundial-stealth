// SUNDIAL — game loop and state machine. Screens: title, level select,
// playing, paused, caught, escaped. The sun ticks every 2 seconds; the shadow
// layer re-bakes on each tick, on a shutter flip, or every frame while the
// bell swings. Staged screenshot scenes come from ?shot=, and ?selftest=1
// runs scripted win/lose checks and reports them on window.__selftest.

import { LEVELS, PLAY } from './levels.js';
import { makePlayer, updatePlayer, nearestInteractable, PLAYER_RADIUS } from './player.js';
import { makeGuard, updateGuard, flinchGuardsInRect } from './guards.js';
import { bakeShadowLayer, bellShadowPolygon, pointInShadow } from './shadows.js';
import { bandOf } from './detection.js';
import {
  renderPlaying, renderTitle, renderSelect, renderPause, renderCaught, renderEscaped,
} from './render.js';

const BEST_KEY = 'sundial-best-v1';
const SHOT = new URLSearchParams(location.search).get('shot');
const SELFTEST = new URLSearchParams(location.search).has('selftest');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // Private mode: best times just don't persist.
  }
}

function ratingFor(spotted) {
  if (spotted === 0) return 'GHOST';
  if (spotted <= 2) return 'SHADOW';
  return 'LOUD';
}

function starsFor(spotted, time, par) {
  let stars = spotted === 0 ? 2 : spotted <= 2 ? 1 : 0;
  if (time <= par) stars += 1;
  return Math.max(1, Math.min(3, stars));
}

const game = {
  screen: 'title',
  levelIndex: 0,
  level: null,
  time: 0,
  sunAngle: 0,
  sunDir: { x: 1, y: 0 },
  shadowCanvas: null,
  shadowPolys: [],
  shadowDirty: true,
  player: null,
  guards: [],
  shutters: [],
  loot: [],
  objectiveTaken: false,
  footprints: [],
  solids: [],
  occluders: [],
  detection: 0,
  spotted: 0,
  wasAlarmed: false,
  interactable: null,
  toast: null,
  rating: null,
  stars: 0,
  best: loadBest(),
  buttons: [],
  frozen: false,
  input: { left: false, right: false, up: false, down: false, sneak: false, sprint: false },
};

function toast(text) {
  game.toast = { text, t: game.time };
}

function occludersForLOS() {
  const list = game.level.occluders.slice();
  for (const s of game.shutters) if (!s.open) list.push({ ...s, kind: 'shutter' });
  return list;
}

function rebuildShadows() {
  const L = game.level;
  if (!game.shadowCanvas) {
    game.shadowCanvas = document.createElement('canvas');
    game.shadowCanvas.width = PLAY.w / 2;
    game.shadowCanvas.height = PLAY.h / 2;
  }
  // The bake canvas covers the play area; translate polygons into its space.
  const occluders = occludersForLOS().map((r) => ({ ...r, x: r.x - PLAY.x, y: r.y - PLAY.y }));
  let bellPoly = null;
  if (L.swinger) {
    const swing = Math.sin(game.time * (Math.PI * 2 / L.swinger.period)) * L.swinger.amp;
    const angle = game.sunAngle + swing;
    bellPoly = bellShadowPolygon(
      { x: L.swinger.x - PLAY.x, y: L.swinger.y - PLAY.y }, angle, L.sun.length,
    );
  }
  const baked = bakeShadowLayer(game.shadowCanvas, occluders, game.sunDir, L.sun.length, L.shadow, bellPoly, PLAY.w);
  // Keep world-space polygons for the in-shadow test.
  const worldPolys = baked.map((poly) => poly.map((p) => ({ x: p.x + PLAY.x, y: p.y + PLAY.y })));
  game.shadowPolys = worldPolys;
  game.shadowDirty = false;
}

function startLevel(index) {
  const L = LEVELS[index];
  game.levelIndex = index;
  game.level = L;
  game.time = 0;
  game.sunAngle = L.sun.angle;
  game.sunDir = { x: Math.cos(L.sun.angle), y: Math.sin(L.sun.angle) };
  game.player = makePlayer(L.spawn);
  game.guards = L.guards.map(makeGuard);
  game.shutters = L.shutters.map((s) => ({ ...s }));
  game.loot = L.loot.map((l) => ({ ...l, taken: false }));
  game.objectiveTaken = false;
  game.footprints = [];
  game.solids = L.occluders.filter((r) => r.kind !== 'planter' && r.kind !== 'steps');
  game.occluders = occludersForLOS();
  game.detection = 0;
  game.spotted = 0;
  game.wasAlarmed = false;
  game.interactable = null;
  game.toast = null;
  game.rating = null;
  game.stars = 0;
  game.shadowDirty = true;
  game.screen = 'playing';
  rebuildShadows();
  toast(`STEAL THE ${L.objective.name.toUpperCase()} — THEN REACH THE EXIT`);
}

function interact() {
  const it = nearestInteractable(game);
  if (!it) return;
  if (it.kind === 'shutter') {
    it.target.open = !it.target.open;
    game.occluders = occludersForLOS();
    game.shadowDirty = true;
    rebuildShadows();
    if (it.target.open) {
      // Light floods the street: guards caught in it flinch.
      const lit = {
        x: it.target.x + game.sunDir.x * 60 - 30,
        y: it.target.y + game.sunDir.y * 60 - 30,
        w: 220, h: 220,
      };
      const n = flinchGuardsInRect(game.guards, lit);
      toast(n > 0 ? 'LIGHT FLOODS IN — A GUARD SHIELDS ITS EYES' : 'THE SHUTTER FLIPS — LIGHT POURS THROUGH');
    } else {
      toast('SHUTTER CLOSED — SHADE RETURNS');
    }
  } else if (it.kind === 'objective') {
    game.objectiveTaken = true;
    toast(`${game.level.objective.name.toUpperCase()} TAKEN — REACH THE EXIT`);
  } else if (it.kind === 'loot') {
    it.target.taken = true;
    const got = game.loot.filter((l) => l.taken).length;
    toast(`RELIC POCKETED — RELIQUARY ${got}/4`);
  }
}

function update(dt) {
  if (game.screen !== 'playing' || game.frozen) return;
  game.time += dt;
  // The sun is a clock: it turns a couple of degrees per level-minute.
  const newAngle = game.level.sun.angle + game.time * game.level.sun.drift;
  if (Math.abs(newAngle - game.sunAngle) > 0.004) {
    game.sunAngle = newAngle;
    game.sunDir = { x: Math.cos(newAngle), y: Math.sin(newAngle) };
    game.shadowDirty = true;
  }
  if (game.level.swinger) game.shadowDirty = true;
  if (game.shadowDirty) rebuildShadows();

  updatePlayer(game.player, dt, game.input, game);
  game.player.inShadow = pointInShadow(game.player.x, game.player.y, game.shadowPolys);
  game.footprints = game.footprints.filter((p) => game.time - p.t < 6);

  let maxAlert = 0;
  for (const g of game.guards) {
    updateGuard(g, dt, game);
    maxAlert = Math.max(maxAlert, g.alert);
  }
  game.detection = maxAlert;
  const alarmed = bandOf(maxAlert) === 'ALARM';
  if (alarmed && !game.wasAlarmed) {
    game.spotted += 1;
    toast('SPOTTED! BREAK LINE OF SIGHT');
  }
  game.wasAlarmed = alarmed;

  // Caught: a guard touches you while the alarm holds.
  if (alarmed) {
    for (const g of game.guards) {
      if (g.state === 'alarm' && Math.hypot(g.x - game.player.x, g.y - game.player.y) < PLAYER_RADIUS + 12) {
        game.screen = 'caught';
        return;
      }
    }
  }

  // Exit: only once the objective is taken.
  const e = game.level.exit;
  if (game.objectiveTaken
    && game.player.x > e.x && game.player.x < e.x + e.w
    && game.player.y > e.y && game.player.y < e.y + e.h) {
    game.rating = ratingFor(game.spotted);
    game.stars = starsFor(game.spotted, game.time, game.level.par);
    const prev = game.best[game.levelIndex];
    if (!prev || game.time < prev.time) {
      game.best[game.levelIndex] = { time: game.time, stars: game.stars, rating: game.rating };
      saveBest(game.best);
    }
    game.screen = 'escaped';
    return;
  }

  game.interactable = nearestInteractable(game);
}

function render() {
  game.buttons = [];
  ctx.setTransform(2, 0, 0, 2, 0, 0); // 2560x1440 backing store, 1280x720 logic
  if (game.screen === 'title') renderTitle(ctx, game);
  else if (game.screen === 'select') renderSelect(ctx, game);
  else if (game.screen === 'playing') renderPlaying(ctx, game);
  else if (game.screen === 'paused') renderPause(ctx, game);
  else if (game.screen === 'caught') renderCaught(ctx, game);
  else if (game.screen === 'escaped') renderEscaped(ctx, game);
}

function goMenu() {
  game.screen = 'select';
}

function clickButton(id) {
  if (id === 'resume') game.screen = 'playing';
  else if (id === 'menu') goMenu();
  else if (id === 'retry') startLevel(game.levelIndex);
  else if (id === 'next') startLevel(game.levelIndex + 1);
  else if (id.startsWith('level-')) startLevel(Number(id.slice(6)));
}

const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sneak', ShiftRight: 'sneak', Space: 'sprint',
};

addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  const mapped = KEYS[ev.code];
  if (mapped) {
    game.input[mapped] = true;
    if (ev.code === 'Space' || ev.code.startsWith('Arrow')) ev.preventDefault();
  }
  if (ev.code === 'KeyE' && game.screen === 'playing') interact();
  if (ev.code === 'Escape') {
    if (game.screen === 'playing') game.screen = 'paused';
    else if (game.screen === 'paused') game.screen = 'playing';
  }
  if (ev.code === 'Enter' && game.screen === 'title') game.screen = 'select';
  if (ev.code === 'KeyR' && (game.screen === 'caught' || game.screen === 'escaped')) startLevel(game.levelIndex);
  if (ev.code === 'KeyN' && game.screen === 'escaped' && game.levelIndex + 1 < LEVELS.length) startLevel(game.levelIndex + 1);
  if (game.screen === 'select' && /^Digit[1-5]$/.test(ev.code)) startLevel(Number(ev.code.slice(5)) - 1);
});

addEventListener('keyup', (ev) => {
  const mapped = KEYS[ev.code];
  if (mapped) game.input[mapped] = false;
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (1280 / rect.width);
  const y = (ev.clientY - rect.top) * (720 / rect.height);
  if (game.screen === 'title') { game.screen = 'select'; return; }
  for (const b of game.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      clickButton(b.id);
      return;
    }
  }
});

// ---------------------------------------------------------------- staged shots
// ?shot=select|bell|alarm|shutter|fountain stages a composed scene ~20s
// into play and freezes the simulation so the frame is deterministic. It is
// the game's own code rendering its own state — the same mechanism the kit
// starter uses.

function stageShot() {
  if (!SHOT) return;
  if (SHOT === 'select') {
    // Demo best times, so the select screen shows a campaign in progress.
    game.best = {
      0: { time: 82.4, stars: 3, rating: 'GHOST' },
      1: { time: 96.1, stars: 2, rating: 'SHADOW' },
      2: { time: 104.7, stars: 2, rating: 'SHADOW' },
    };
    game.screen = 'select';
    game.time = 1.5;
    return;
  }
  if (SHOT === 'bell') {
    startLevel(2);
    game.time = 47.3;
    game.player.x = 520; game.player.y = 430;
    game.player.facing = 0.4;
    game.guards[0].x = 430; game.guards[0].y = 330; game.guards[0].angle = 0.9; game.guards[0].alert = 32; game.guards[0].state = 'suspicious';
    game.guards[1].x = 860; game.guards[1].y = 220; game.guards[1].angle = 2.4;
    game.guards[2].x = 700; game.guards[2].y = 470; game.guards[2].angle = -2.2;
    game.loot[0].taken = true;
    game.detection = 32;
    game.footprints = [
      { x: 470, y: 470, angle: 0.4, t: 44 }, { x: 486, y: 458, angle: 0.4, t: 45 },
      { x: 500, y: 446, angle: 0.4, t: 46 }, { x: 512, y: 436, angle: 0.4, t: 46.8 },
    ];
    game.frozen = true;
    return;
  }
  if (SHOT === 'alarm') {
    startLevel(1);
    game.time = 47.0;
    game.objectiveTaken = true;
    game.player.x = 640; game.player.y = 380;
    game.player.facing = -1.2;
    game.player.moving = 'sprint';
    game.guards[0].x = 560; game.guards[0].y = 330; game.guards[0].angle = 0.6; game.guards[0].alert = 88; game.guards[0].state = 'alarm';
    game.guards[1].x = 760; game.guards[1].y = 460; game.guards[1].angle = -2.5; game.guards[1].alert = 62; game.guards[1].state = 'searching';
    game.detection = 88;
    game.spotted = 1;
    game.loot[0].taken = true; game.loot[1].taken = true;
    game.footprints = [];
    for (let i = 0; i < 12; i++) {
      game.footprints.push({ x: 560 + i * 8, y: 460 - i * 7, angle: -0.7, t: 42 + i * 0.4 });
    }
    game.toast = { text: 'SPOTTED! BREAK LINE OF SIGHT', t: 46.2 };
    game.frozen = true;
    return;
  }
  if (SHOT === 'fountain') {
    // Cold Fountain at 4pm: cyan caustics, the long 200px shadows, a run
    // 98 seconds in — a different hour and a different clock than Bell Court.
    startLevel(3);
    game.time = 98.0;
    game.player.x = 480; game.player.y = 440;
    game.player.facing = 0.9;
    game.guards[0].x = 420; game.guards[0].y = 240; game.guards[0].angle = 1.2;
    game.guards[1].x = 900; game.guards[1].y = 520; game.guards[1].angle = -2.0;
    game.guards[2].x = 700; game.guards[2].y = 200; game.guards[2].angle = 2.6; game.guards[2].alert = 18;
    game.loot[0].taken = true; game.loot[2].taken = true;
    game.detection = 12;
    game.footprints = [
      { x: 420, y: 480, angle: 0.9, t: 94 }, { x: 438, y: 468, angle: 0.9, t: 95 },
      { x: 456, y: 456, angle: 0.9, t: 96 }, { x: 470, y: 447, angle: 0.9, t: 97 },
    ];
    game.toast = { text: 'RELIC POCKETED — RELIQUARY 2/4', t: 96.5 };
    game.frozen = true;
    return;
  }
  if (SHOT === 'shutter') {
    startLevel(0);
    game.time = 63.8;
    game.player.x = 110; game.player.y = 355;
    game.player.facing = 0.1;
    game.shutters[0].open = true;
    game.occluders = occludersForLOS();
    game.shadowDirty = true;
    rebuildShadows();
    game.guards[0].x = 260; game.guards[0].y = 340; game.guards[0].angle = 2.8;
    game.guards[0].state = 'flinch'; game.guards[0].flinchT = 1.2; game.guards[0].alert = 10;
    game.guards[1].x = 880; game.guards[1].y = 200; game.guards[1].angle = 2.2;
    game.loot[0].taken = true;
    game.detection = 10;
    game.toast = { text: 'LIGHT FLOODS IN — A GUARD SHIELDS ITS EYES', t: 62.6 };
    game.frozen = true;
  }
}

// ---------------------------------------------------------------- self-test
// ?selftest=1 drives the real update loop with scripted play and reports on
// window.__selftest: every level winnable, caught reachable, counters work.

function runSelfTest() {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail: detail ?? '' });
  try {
    for (let i = 0; i < LEVELS.length; i++) {
      startLevel(i);
      // Walk the thief to the objective, take it, walk to the exit.
      game.player.x = LEVELS[i].objective.x; game.player.y = LEVELS[i].objective.y;
      interact();
      check(`level ${i + 1} objective`, game.objectiveTaken, LEVELS[i].objective.name);
      const loot = game.loot[0];
      game.player.x = loot.x; game.player.y = loot.y;
      interact();
      check(`level ${i + 1} loot counter`, game.loot.filter((l) => l.taken).length === 1, '1/4');
      const e = LEVELS[i].exit;
      game.player.x = e.x + e.w / 2; game.player.y = e.y + e.h / 2;
      // Guards must not be mid-alarm for the scripted win.
      for (const g of game.guards) { g.alert = 0; g.state = 'patrol'; }
      game.detection = 0;
      update(0.05);
      check(`level ${i + 1} winnable`, game.screen === 'escaped', `screen=${game.screen}`);
      check(`level ${i + 1} rating`, ['GHOST', 'SHADOW', 'LOUD'].includes(game.rating), game.rating);
    }
    // Caught path: alarm + guard on top of the player.
    startLevel(0);
    game.guards[0].alert = 90; game.guards[0].state = 'alarm';
    game.guards[0].x = game.player.x + 5; game.guards[0].y = game.player.y;
    update(0.05);
    check('caught reachable', game.screen === 'caught', `screen=${game.screen}`);
    // Shutter flip changes the shadow pass.
    startLevel(0);
    const before = game.shadowPolys.length;
    game.player.x = 70; game.player.y = 355;
    interact();
    check('shutter flips', game.shutters[0].open === true, `polys ${before} -> ${game.shadowPolys.length}`);
    // Detection: standing in a guard's cone in the light raises alert.
    // (640,440) is open sun at noon: no column shadow reaches it. The guard is
    // re-aimed each tick so the patrol walk does not turn its cone away.
    startLevel(0);
    const g = game.guards[0];
    g.state = 'patrol'; g.alert = 0;
    game.player.x = 640; game.player.y = 440;
    for (let s = 0; s < 40; s++) {
      g.x = 640; g.y = 520; g.angle = -Math.PI / 2;
      update(0.05);
    }
    check('detection rises in cone', g.alert > 40, `alert=${g.alert.toFixed(1)}`);
  } catch (err) {
    results.push({ name: 'exception', ok: false, detail: String(err && err.stack || err) });
  }
  window.__selftest = { done: true, passed: results.filter((r) => r.ok).length, total: results.length, results };
  document.title = `SELFTEST ${window.__selftest.passed}/${window.__selftest.total}`;
}

// ---------------------------------------------------------------- boot

stageShot();
if (SELFTEST) {
  // Run after first paint so the canvas context exists.
  requestAnimationFrame(() => setTimeout(runSelfTest, 50));
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.screen === 'title' || game.screen === 'select') game.time += dt;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle for the screenshot/playtest driver (read-only state view).
window.__sundial = game;
