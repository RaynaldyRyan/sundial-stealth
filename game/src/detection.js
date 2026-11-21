// SUNDIAL — detection model. One float 0-100, four threshold bands. The rate
// climbs with guard proximity and being in light, falls in shadow, and spikes
// on noise (sprinting). Guards see through a vision cone with line of sight.

export const BANDS = [
  { name: 'HIDDEN', max: 25 },
  { name: 'SUSPICIOUS', max: 50 },
  { name: 'SEARCHING', max: 75 },
  { name: 'ALARM', max: 100 },
];

export function bandOf(value) {
  for (const b of BANDS) if (value < b.max) return b.name;
  return 'ALARM';
}

export function bandHint(band) {
  if (band === 'HIDDEN') return 'Unseen. The sun is the only guard watching.';
  if (band === 'SUSPICIOUS') return 'Something caught an eye. Freeze or find shade.';
  if (band === 'SEARCHING') return 'They are coming to look. Move — quietly.';
  return 'RUN. They know where you are.';
}

// Is (x, y) inside the cone from (gx, gy) facing `angle`, range and half-angle?
export function coneContains(gx, gy, angle, range, halfAngle, x, y) {
  const dx = x - gx, dy = y - gy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist < 12) return true;
  let diff = Math.atan2(dy, dx) - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= halfAngle;
}

function segmentIntersectsRect(x0, y0, x1, y1, r) {
  // Slab test: does segment (x0,y0)-(x1,y1) cross rect r?
  const dx = x1 - x0, dy = y1 - y0;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < r.x || x0 > r.x + r.w) return false;
  } else {
    let t1 = (r.x - x0) / dx, t2 = (r.x + r.w - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < r.y || y0 > r.y + r.h) return false;
  } else {
    let t1 = (r.y - y0) / dy, t2 = (r.y + r.h - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// True when any solid occluder blocks the sight line. Low planters and crates
// do not block sight; walls, columns, stalls, towers and closed shutters do.
export function losBlocked(x0, y0, x1, y1, occluders) {
  for (const r of occluders) {
    if (r.kind === 'planter' || r.kind === 'crate' || r.kind === 'steps') continue;
    if (segmentIntersectsRect(x0, y0, x1, y1, r)) return true;
  }
  return false;
}
