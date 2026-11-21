// SUNDIAL — sun-clock shadows. Every occluder rect extrudes a shadow polygon
// along the light vector; the sun rotates a couple of degrees per level-minute,
// so cover shrinks and grows on its own and routes close behind you. The layer
// is baked to a half-resolution offscreen canvas and redrawn only when the sun
// ticks, a shutter flips, or a level has a swinging bell.

export const SHADOW_HEIGHT = {
  column: 1.5, wall: 1.0, crate: 0.6, stall: 1.3, planter: 0.5,
  tree: 1.2, fountain: 0.4, shutter: 1.0, tower: 1.3, steps: 0,
};

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// Monotone-chain convex hull of {x, y} points.
export function convexHull(points) {
  const pts = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (pts.length <= 1) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// Project a rect's corners along the light vector and hull them.
export function shadowPolygonForRect(rect, dir, length) {
  const h = SHADOW_HEIGHT[rect.kind] ?? 1.0;
  const d = length * h;
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  const projected = corners.map((c) => ({ x: c.x + dir.x * d, y: c.y + dir.y * d }));
  return convexHull(corners.concat(projected));
}

// The bell's shadow: a long quad from the pivot, sweeping with the swing.
export function bellShadowPolygon(swinger, angle, length) {
  const reach = length * 2.4;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const px = -dy, py = dx; // perpendicular
  const half = 26;
  const tipX = swinger.x + dx * reach, tipY = swinger.y + dy * reach;
  return [
    { x: swinger.x + px * half, y: swinger.y + py * half },
    { x: swinger.x - px * half, y: swinger.y - py * half },
    { x: tipX - px * (half * 0.4), y: tipY - py * (half * 0.4) },
    { x: tipX + px * (half * 0.4), y: tipY + py * (half * 0.4) },
  ];
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInShadow(x, y, polys) {
  for (const p of polys) if (pointInPolygon(x, y, p)) return true;
  return false;
}

// Bake all shadow polygons onto a half-resolution canvas. The polygons live in
// a coordinate space `spaceW` wide (the play area, not the full frame), so the
// bake scale comes from that space. Returns the polygons too, so gameplay can
// test whether the player stands in shadow.
export function bakeShadowLayer(canvas, occluders, dir, length, color, bellPoly, spaceW) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / (spaceW ?? 1280);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  const polys = [];
  for (const rect of occluders) {
    if ((SHADOW_HEIGHT[rect.kind] ?? 1) <= 0) continue;
    const poly = shadowPolygonForRect(rect, dir, length);
    polys.push(poly);
    ctx.beginPath();
    poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)));
    ctx.closePath();
    ctx.fill();
  }
  if (bellPoly) {
    polys.push(bellPoly);
    ctx.beginPath();
    bellPoly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)));
    ctx.closePath();
    ctx.fill();
  }
  return polys;
}
