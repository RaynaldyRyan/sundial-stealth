// SUNDIAL — guards. Patrols you can learn: fixed waypoint loops with pauses,
// a vision cone, and four states — patrol, suspicious ("?"), searching (walks
// to the last-seen spot), alarm (chases). A guard caught in sudden light
// flinches and shields its eyes for 2 seconds. An idle guard whose patrol
// passes within 90px of a fresh footprint diverts to investigate it.

import { coneContains, losBlocked } from './detection.js';

export const CONE_RANGE = 185;
export const CONE_HALF = 0.62; // ~35 degrees
export const PATROL_SPEED = 58;
export const CHASE_SPEED = 158;
export const SEARCH_SPEED = 105;
export const FLINCH_SECONDS = 2;
export const PRINT_INVESTIGATE_RADIUS = 90;

export function makeGuard(def) {
  return {
    x: def.x, y: def.y,
    angle: 0,
    waypoints: def.waypoints.map(([x, y]) => ({ x, y })),
    wp: 0,
    pause: def.pause ?? 1.2,
    pauseT: 0,
    state: 'patrol', // patrol | suspicious | searching | alarm | flinch | investigate
    alert: 0, // 0-100, per-guard suspicion
    lastSeen: null,
    lookT: 0,
    flinchT: 0,
    investigate: null,
    scanDir: 1,
  };
}

function moveToward(g, tx, ty, speed, dt) {
  const dx = tx - g.x, dy = ty - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  g.x += (dx / dist) * step;
  g.y += (dy / dist) * step;
  g.angle = Math.atan2(dy, dx);
  return dist - step < 2;
}

function turnToward(g, targetAngle, rate, dt) {
  let diff = targetAngle - g.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  g.angle += step;
}

// Per-frame awareness: does this guard see the player right now?
export function guardSeesPlayer(g, player, occluders) {
  if (g.state === 'flinch') return false;
  if (!coneContains(g.x, g.y, g.angle, CONE_RANGE, CONE_HALF, player.x, player.y)) return false;
  return !losBlocked(g.x, g.y, player.x, player.y, occluders);
}

export function updateGuard(g, dt, game) {
  const { player, occluders, footprints } = game;

  if (g.flinchT > 0) {
    g.flinchT -= dt;
    g.alert = Math.max(0, g.alert - 30 * dt);
    if (g.flinchT <= 0 && g.state === 'flinch') g.state = 'patrol';
    if (g.state === 'flinch') return;
  }

  const sees = guardSeesPlayer(g, player, occluders);
  const dist = Math.hypot(player.x - g.x, player.y - g.y);
  const proximity = Math.max(0, 1 - dist / CONE_RANGE);

  if (sees) {
    // In light you are found fast; in shadow the same cone is half as dangerous.
    const lightFactor = player.inShadow ? 0.45 : 1.6;
    const speedFactor = player.moving === 'sprint' ? 1.5 : player.moving === 'sneak' ? 0.6 : 1.0;
    g.alert += (14 + 46 * proximity) * lightFactor * speedFactor * dt;
    g.lastSeen = { x: player.x, y: player.y };
    if (g.alert >= 75) g.state = 'alarm';
    else if (g.alert >= 50) g.state = 'searching';
    else if (g.alert >= 25) g.state = 'suspicious';
  } else {
    g.alert = Math.max(0, g.alert - 9 * dt);
    if (g.state === 'suspicious' && g.alert < 25) g.state = 'patrol';
    if (g.state === 'searching' && g.alert < 20) g.state = 'patrol';
    if (g.state === 'alarm' && g.alert < 55) {
      g.state = 'searching';
      g.lookT = 0;
    }
  }

  // Noise: sprinting is loud. A guard inside the noise radius gets suspicious.
  if (player.moving === 'sprint' && dist < 170) {
    g.alert += 26 * dt;
    if (g.alert >= 25 && g.state === 'patrol') {
      g.state = 'suspicious';
      g.lastSeen = { x: player.x, y: player.y };
    }
  }

  switch (g.state) {
    case 'patrol': {
      // Dust footprints: divert to investigate a fresh print near the patrol.
      if (!g.investigate) {
        for (const p of footprints) {
          if (game.time - p.t < 6 && Math.hypot(p.x - g.x, p.y - g.y) < PRINT_INVESTIGATE_RADIUS) {
            g.investigate = { x: p.x, y: p.y };
            g.state = 'investigate';
            break;
          }
        }
      }
      if (g.state !== 'patrol') break;
      if (g.pauseT > 0) {
        g.pauseT -= dt;
        g.angle += g.scanDir * 0.55 * dt; // look around at the waypoint
        break;
      }
      const target = g.waypoints[g.wp];
      if (moveToward(g, target.x, target.y, PATROL_SPEED, dt)) {
        g.wp = (g.wp + 1) % g.waypoints.length;
        g.pauseT = g.pause;
        g.scanDir = -g.scanDir;
      }
      break;
    }
    case 'investigate': {
      if (g.investigate && moveToward(g, g.investigate.x, g.investigate.y, SEARCH_SPEED, dt)) {
        g.investigate = null;
        g.state = 'suspicious';
        g.pauseT = 1.2;
        g.alert = Math.max(g.alert, 30);
      }
      break;
    }
    case 'suspicious': {
      if (g.lastSeen) turnToward(g, Math.atan2(g.lastSeen.y - g.y, g.lastSeen.x - g.x), 2.4, dt);
      if (g.pauseT > 0) {
        g.pauseT -= dt;
        break;
      }
      if (g.alert >= 50) {
        g.state = 'searching';
        g.lookT = 0;
        break;
      }
      if (g.alert < 25) g.state = 'patrol';
      break;
    }
    case 'searching': {
      if (g.lastSeen) {
        if (moveToward(g, g.lastSeen.x, g.lastSeen.y, SEARCH_SPEED, dt)) {
          g.lookT += dt;
          g.angle += Math.sin(g.lookT * 2.2) * 1.4 * dt;
          if (g.lookT > 2.5) {
            g.state = 'patrol';
            g.lastSeen = null;
          }
        }
      } else {
        g.state = 'patrol';
      }
      break;
    }
    case 'alarm': {
      // Chase the player's live position while the alarm holds.
      moveToward(g, player.x, player.y, CHASE_SPEED, dt);
      g.lastSeen = { x: player.x, y: player.y };
      break;
    }
    default:
      break;
  }
}

// A shutter just opened: guards standing in the newly lit strip flinch.
export function flinchGuardsInRect(guards, rect) {
  let count = 0;
  for (const g of guards) {
    if (g.x >= rect.x - 10 && g.x <= rect.x + rect.w + 10 && g.y >= rect.y - 10 && g.y <= rect.y + rect.h + 10) {
      g.state = 'flinch';
      g.flinchT = FLINCH_SECONDS;
      g.alert = Math.max(0, g.alert - 25);
      count++;
    }
  }
  return count;
}
