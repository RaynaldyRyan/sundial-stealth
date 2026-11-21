// SUNDIAL — the thief. WASD/arrows move; SHIFT sneaks (silent, slow); SPACE
// sprints (loud, fast); E interacts. Dust footprints drop every 8px of travel
// and fade after 6 seconds — guards follow fresh ones.

import { PLAY } from './levels.js';

export const WALK_SPEED = 132;
export const SNEAK_SPEED = 72;
export const SPRINT_SPEED = 212;
export const PLAYER_RADIUS = 13;
export const PRINT_SPACING = 8;
export const PRINT_LIFETIME = 6;

export function makePlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y,
    facing: -Math.PI / 2,
    moving: 'idle', // idle | sneak | walk | sprint
    inShadow: false,
    lastPrint: { x: spawn.x, y: spawn.y },
    printSide: 1,
  };
}

function circleHitsRect(px, py, r, rect) {
  const cx = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r;
}

// Slide along walls: try full move, then each axis alone.
function collideMove(p, nx, ny, solids) {
  const blocked = (x, y) => solids.some((r) => circleHitsRect(x, y, PLAYER_RADIUS, r));
  if (!blocked(nx, ny)) { p.x = nx; p.y = ny; return; }
  if (!blocked(nx, p.y)) { p.x = nx; return; }
  if (!blocked(p.x, ny)) { p.y = ny; }
}

export function updatePlayer(p, dt, input, game) {
  let dx = 0, dy = 0;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len; dy /= len;
    p.facing = Math.atan2(dy, dx);
  }
  const sprinting = input.sprint && len > 0;
  const sneaking = input.sneak && len > 0;
  const speed = sprinting ? SPRINT_SPEED : sneaking ? SNEAK_SPEED : WALK_SPEED;
  p.moving = len === 0 ? 'idle' : sprinting ? 'sprint' : sneaking ? 'sneak' : 'walk';

  if (len > 0) {
    const nx = p.x + dx * speed * dt;
    const ny = p.y + dy * speed * dt;
    collideMove(p, nx, ny, game.solids);
    p.x = Math.max(PLAY.x + PLAYER_RADIUS, Math.min(PLAY.x + PLAY.w - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAY.y + PLAYER_RADIUS, Math.min(PLAY.y + PLAY.h - PLAYER_RADIUS, p.y));
    // Dust footprints, alternating feet.
    if (Math.hypot(p.x - p.lastPrint.x, p.y - p.lastPrint.y) >= PRINT_SPACING) {
      p.printSide = -p.printSide;
      const side = p.printSide * 5;
      const px = -Math.sin(p.facing) * side, py = Math.cos(p.facing) * side;
      game.footprints.push({ x: p.x + px, y: p.y + py, angle: p.facing, t: game.time });
      p.lastPrint = { x: p.x, y: p.y };
    }
  }
}

// Noise radius the HUD draws as a thin arc around the player.
export function noiseRadius(p) {
  if (p.moving === 'sprint') return 120;
  if (p.moving === 'walk') return 42;
  return 0;
}

// E key: nearest interactable within reach — shutter, objective, loot.
export function nearestInteractable(game) {
  const p = game.player;
  let best = null, bestDist = 46;
  for (const s of game.shutters) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const d = Math.hypot(cx - p.x, cy - p.y);
    if (d < bestDist) { best = { kind: 'shutter', target: s }; bestDist = d; }
  }
  if (!game.objectiveTaken) {
    const o = game.level.objective;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < bestDist) { best = { kind: 'objective', target: o }; bestDist = d; }
  }
  for (const loot of game.loot) {
    if (loot.taken) continue;
    const d = Math.hypot(loot.x - p.x, loot.y - p.y);
    if (d < bestDist) { best = { kind: 'loot', target: loot }; bestDist = d; }
  }
  return best;
}
