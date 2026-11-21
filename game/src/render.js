// SUNDIAL — rendering. Full-canvas HUD (no big side panel): a top bar with
// the level name, the big detection state and the timer, a bottom bar with
// controls and sun status. The player avatar itself is coloured by state.
// A 1px bone keyline, 4% grain and a 12% vignette finish every frame.

import { PALETTE, SERIF, MONO, rgba, bandColor } from './palette.js';
import { bandOf, bandHint } from './detection.js';
import { CONE_RANGE, CONE_HALF } from './guards.js';
import { noiseRadius } from './player.js';
import { PLAY, LEVELS } from './levels.js';

const W = 1280, H = 720;
const TOP = 58, BOTTOM = 44;

let grainCanvas = null;
function grain() {
  if (grainCanvas) return grainCanvas;
  grainCanvas = document.createElement('canvas');
  grainCanvas.width = 160; grainCanvas.height = 160;
  const c = grainCanvas.getContext('2d');
  const img = c.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return grainCanvas;
}

function frameOverlay(ctx) {
  // 1px bone keyline inset 8px, 4% grain, 12% vignette.
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.chalk, 0.9);
  ctx.lineWidth = 1;
  ctx.strokeRect(8.5, 8.5, W - 17, H - 17);
  ctx.globalAlpha = 0.04;
  const g = grain();
  for (let x = 0; x < W; x += 160) for (let y = 0; y < H; y += 160) ctx.drawImage(g, x, y);
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(20,18,31,0)');
  vg.addColorStop(1, 'rgba(20,18,31,0.12)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

// The hour stamp: clock hour in plain 12-hour form plus the level's palette
// name — "2PM · RUST", "4PM · CYAN". Stamped in the HUD and on the cards so
// every screenshot names its hour at a glance.
function hourStamp(L) {
  const h12 = L.hourNum % 12 || 12;
  return `${h12}PM · ${L.paletteName}`;
}

const BAND_NAMES = ['HIDDEN', 'SUSPICIOUS', 'SEARCHING', 'ALARM'];

// Four-segment pip row beside the detection state: one segment lit per band,
// so the meter reads even before the word does.
function drawBandPips(ctx, band, x, y) {
  const idx = BAND_NAMES.indexOf(band);
  for (let i = 0; i < 4; i++) {
    const px = x + i * 20;
    ctx.save();
    if (i === idx) {
      ctx.fillStyle = bandColor(BAND_NAMES[i]);
      ctx.beginPath(); ctx.roundRect(px, y, 16, 8, 2); ctx.fill();
    } else {
      ctx.strokeStyle = rgba(PALETTE.chalk, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(px + 0.5, y + 0.5, 15, 7, 2); ctx.stroke();
    }
    ctx.restore();
  }
}

// A landmark silhouette for a level-select card, drawn from the game's own
// tile shapes: campanile, orange grove, arcade awning, cistern, viaduct.
function drawLandmark(ctx, kind, x, y, w, h, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.14;
  if (kind === 'campanile') {
    const tw = w * 0.24, tx = x + w / 2 - tw / 2;
    ctx.fillRect(tx, y + h * 0.28, tw, h * 0.72);
    ctx.beginPath();
    ctx.moveTo(tx - 4, y + h * 0.28); ctx.lineTo(tx + tw / 2, y); ctx.lineTo(tx + tw + 4, y + h * 0.28);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.fillRect(tx + tw * 0.32, y + h * 0.42, tw * 0.36, h * 0.2);
  } else if (kind === 'grove') {
    for (const [fx, fr] of [[0.22, 0.30], [0.5, 0.38], [0.78, 0.28]]) {
      const cx = x + w * fx, cy = y + h * 0.45;
      ctx.fillRect(cx - 2, cy, 4, h * 0.5);
      ctx.beginPath(); ctx.arc(cx, cy, h * fr, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'awning') {
    ctx.fillRect(x + w * 0.08, y + h * 0.5, 4, h * 0.5);
    ctx.fillRect(x + w * 0.92 - 4, y + h * 0.5, 4, h * 0.5);
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) ctx.fillRect(x + w * 0.06 + (i / 8) * w * 0.88, y + h * 0.18, (w * 0.88) / 8, h * 0.34);
    }
    ctx.fillRect(x + w * 0.06, y + h * 0.18, w * 0.88, 3);
  } else if (kind === 'cistern') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + w * 0.08, y + h * 0.55, w * 0.84, h * 0.38);
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x + w / 2 - 3, y + h * 0.08, 6, h * 0.5);
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.12, 7, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'viaduct') {
    ctx.fillRect(x + w * 0.04, y + h * 0.3, w * 0.92, h * 0.16);
    for (let i = 0; i < 3; i++) {
      const ax = x + w * (0.14 + i * 0.28);
      ctx.fillRect(ax, y + h * 0.46, w * 0.1, h * 0.54);
      ctx.fillRect(ax + w * 0.16, y + h * 0.46, w * 0.1, h * 0.54);
    }
    ctx.fillRect(x + w * 0.04, y + h * 0.86, w * 0.92, h * 0.14);
  }
  ctx.restore();
}

function button(ctx, game, id, x, y, w, h, label, primary) {
  game.buttons.push({ id, x, y, w, h });
  ctx.save();
  ctx.fillStyle = primary ? PALETTE.ink : rgba(PALETTE.ink, 0.08);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  if (!primary) ctx.stroke();
  ctx.fillStyle = primary ? PALETTE.chalk : PALETTE.ink;
  ctx.font = `600 15px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

// ---------------------------------------------------------------- floor

function drawFloor(ctx, game) {
  const L = game.level;
  ctx.fillStyle = L.floor;
  ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  // Flagstones: alternating tiles + grout lines.
  ctx.fillStyle = L.floorAlt;
  const T = 62;
  for (let y = PLAY.y; y < PLAY.y + PLAY.h; y += T) {
    for (let x = PLAY.x; x < PLAY.x + PLAY.w; x += T) {
      if (((x - PLAY.x) / T + (y - PLAY.y) / T) % 2 === 0) ctx.fillRect(x, y, T, T);
    }
  }
  ctx.strokeStyle = rgba(PALETTE.ink, 0.07);
  ctx.lineWidth = 1;
  for (let x = PLAY.x; x <= PLAY.x + PLAY.w; x += T) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, PLAY.y); ctx.lineTo(x + 0.5, PLAY.y + PLAY.h); ctx.stroke();
  }
  for (let y = PLAY.y; y <= PLAY.y + PLAY.h; y += T) {
    ctx.beginPath(); ctx.moveTo(PLAY.x, y + 0.5); ctx.lineTo(PLAY.x + PLAY.w, y + 0.5); ctx.stroke();
  }
  // Lemon Stair terraces: three step bands with hard edges.
  if (game.levelIndex === 1) {
    for (let i = 0; i < 3; i++) {
      const y = PLAY.y + 130 + i * 150;
      ctx.fillStyle = rgba(PALETTE.ink, 0.10);
      ctx.fillRect(PLAY.x, y, PLAY.w, 10);
      ctx.fillStyle = rgba(PALETTE.chalk, 0.5);
      ctx.fillRect(PLAY.x, y + 10, PLAY.w, 3);
    }
  }
  // Gilded Stair: a diagonal staircase of pale steps.
  if (game.levelIndex === 4) {
    ctx.fillStyle = rgba(PALETTE.chalk, 0.55);
    for (let i = 0; i < 9; i++) {
      ctx.fillRect(PLAY.x + 60 + i * 120, PLAY.y + PLAY.h - 90 - i * 56, 120, 26);
    }
    ctx.strokeStyle = rgba(PALETTE.ink, 0.12);
    for (let i = 0; i < 9; i++) {
      ctx.strokeRect(PLAY.x + 60 + i * 120 + 0.5, PLAY.y + PLAY.h - 90 - i * 56 + 0.5, 120, 26);
    }
  }
  // Cold Fountain caustics: drifting cyan light on the plaza.
  if (L.caustics) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = PALETTE.cyan;
    for (let i = 0; i < 9; i++) {
      const cx = 180 + ((i * 173 + Math.sin(game.time * 0.4 + i * 2.1) * 40) % 950 + 950) % 950;
      const cy = 120 + ((i * 211 + Math.cos(game.time * 0.3 + i * 1.7) * 34) % 480 + 480) % 480;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46 + 18 * Math.sin(i * 3.3), 16 + 6 * Math.cos(i * 2.7), i * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- pieces

function drawOccluder(ctx, r) {
  ctx.save();
  if (r.kind === 'column') {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.fillStyle = '#D9C69C';
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.chalk;
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(PALETTE.ink, 0.25); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.ink, 0.18);
    ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 5, 0, Math.PI * 2); ctx.fill();
  } else if (r.kind === 'crate') {
    ctx.fillStyle = '#C8A25E';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = rgba(PALETTE.ink, 0.4); ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x, r.y + r.h);
    ctx.stroke();
  } else if (r.kind === 'wall' || r.kind === 'tower') {
    ctx.fillStyle = '#D8C69A';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = rgba(PALETTE.ink, 0.35); ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.fillStyle = rgba(PALETTE.ink, 0.12);
    for (let x = r.x + 10; x < r.x + r.w - 8; x += 18) ctx.fillRect(x, r.y + 8, 10, 3);
    if (r.kind === 'tower') {
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h - 8, 10, Math.PI, 0); ctx.fill();
    }
  } else if (r.kind === 'stall') {
    ctx.fillStyle = PALETTE.vermillion;
    ctx.fillRect(r.x, r.y, r.w, 14);
    ctx.fillStyle = PALETTE.chalk;
    for (let x = r.x; x < r.x + r.w; x += 16) ctx.fillRect(x, r.y, 8, 14);
    ctx.fillStyle = '#8A6A3B';
    ctx.fillRect(r.x + 4, r.y + 14, r.w - 8, r.h - 14);
  } else if (r.kind === 'planter') {
    ctx.fillStyle = '#7A5A34';
    ctx.fillRect(r.x, r.y + 12, r.w, r.h - 12);
    ctx.fillStyle = PALETTE.jade;
    for (let x = r.x + 8; x < r.x + r.w - 6; x += 14) {
      ctx.beginPath(); ctx.arc(x, r.y + 10, 8, 0, Math.PI * 2); ctx.fill();
    }
  } else if (r.kind === 'tree') {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.fillStyle = '#6B4E2E';
    ctx.fillRect(cx - 3, cy - 2, 6, 16);
    ctx.fillStyle = '#3E7D4E';
    ctx.beginPath(); ctx.arc(cx, cy - 6, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5A9E63';
    ctx.beginPath(); ctx.arc(cx - 8, cy - 12, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D9C33B';
    for (const [lx, ly] of [[-10, 2], [6, -14], [10, 4]]) {
      ctx.beginPath(); ctx.arc(cx + lx, cy + ly, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  } else if (r.kind === 'fountain') {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    ctx.fillStyle = '#CBB98F';
    ctx.beginPath(); ctx.arc(cx, cy, r.w / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7FC4D4';
    ctx.beginPath(); ctx.arc(cx, cy, r.w / 2 - 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(PALETTE.chalk, 0.7);
    ctx.beginPath(); ctx.arc(cx - 12, cy - 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.chalk;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawShutter(ctx, game, s) {
  ctx.save();
  if (!s.open) {
    ctx.fillStyle = '#C9B183';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = rgba(PALETTE.ink, 0.4); ctx.lineWidth = 1.5;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    ctx.strokeStyle = rgba(PALETTE.ink, 0.3); ctx.lineWidth = 1;
    for (let y = s.y + 12; y < s.y + s.h - 6; y += 12) {
      ctx.beginPath(); ctx.moveTo(s.x + 3, y); ctx.lineTo(s.x + s.w - 3, y); ctx.stroke();
    }
    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('E', s.x + s.w / 2, s.y + s.h + 14);
  } else {
    // Folded open: light pours through along the sun vector — a bright warm
    // wedge with a hot core, so the flood reads at a glance.
    const dir = game.sunDir;
    const spill = 230;
    ctx.fillStyle = 'rgba(255,244,214,0.75)';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + s.w, s.y);
    ctx.lineTo(s.x + s.w + dir.x * spill, s.y + dir.y * spill + 30);
    ctx.lineTo(s.x + dir.x * spill, s.y + s.h + dir.y * spill + 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.85)';
    ctx.beginPath();
    ctx.moveTo(s.x + 4, s.y + 20);
    ctx.lineTo(s.x + s.w - 4, s.y + 20);
    ctx.lineTo(s.x + s.w - 4 + dir.x * spill * 0.7, s.y + 60 + dir.y * spill * 0.7);
    ctx.lineTo(s.x + 4 + dir.x * spill * 0.7, s.y + s.h - 20 + dir.y * spill * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#A98F5F';
    ctx.fillRect(s.x, s.y, 6, s.h);
    ctx.fillRect(s.x + s.w - 6, s.y, 6, s.h);
  }
  ctx.restore();
}

function drawLoot(ctx, loot, time) {
  if (loot.taken) return;
  const bob = Math.sin(time * 2.4 + loot.x) * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(217,164,65,0.35)';
  ctx.beginPath(); ctx.arc(loot.x, loot.y + bob, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#D9A441';
  ctx.beginPath(); ctx.arc(loot.x, loot.y + bob, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8A6A1F'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(loot.x, loot.y + bob, 8, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#8A6A1F';
  ctx.font = `700 9px ${MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('◈', loot.x, loot.y + bob + 0.5);
  ctx.restore();
}

function drawObjective(ctx, game) {
  if (game.objectiveTaken) return;
  const o = game.level.objective;
  const t = game.time;
  const pulse = 1 + 0.12 * Math.sin(t * 3);
  ctx.save();
  ctx.translate(o.x, o.y + Math.sin(t * 1.8) * 3);
  ctx.fillStyle = rgba(PALETTE.amber, 0.30);
  ctx.beginPath(); ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#F2C14E';
  ctx.strokeStyle = '#8A6A1F';
  ctx.lineWidth = 2;
  ctx.fillRect(-9, -9, 18, 18);
  ctx.strokeRect(-9, -9, 18, 18);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(o.name.toUpperCase(), 0, 34); // below the diamond: the bell hangs above it
  ctx.restore();
}

function drawExit(ctx, game) {
  const e = game.level.exit;
  const open = game.objectiveTaken;
  ctx.save();
  ctx.fillStyle = open ? PALETTE.jade : rgba(PALETTE.ink, 0.35);
  ctx.fillRect(e.x, e.y, e.w, e.h);
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
  ctx.strokeRect(e.x + 1, e.y + 1, e.w - 2, e.h - 2);
  ctx.fillStyle = PALETTE.chalk;
  ctx.font = `700 13px ${MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(open ? 'EXIT ▶' : 'EXIT', e.x + e.w / 2, e.y + e.h / 2 - 6);
  ctx.font = `600 9px ${MONO}`;
  ctx.fillText(open ? 'GO NOW' : 'LOCKED', e.x + e.w / 2, e.y + e.h / 2 + 12);
  if (open) {
    ctx.strokeStyle = rgba(PALETTE.jade, 0.5 + 0.3 * Math.sin(game.time * 4));
    ctx.lineWidth = 3;
    ctx.strokeRect(e.x - 4, e.y - 4, e.w + 8, e.h + 8);
  }
  ctx.restore();
}

function drawFootprints(ctx, game) {
  ctx.save();
  ctx.fillStyle = rgba(PALETTE.ink, 0.5);
  for (const p of game.footprints) {
    const age = game.time - p.t;
    if (age > 6) continue;
    ctx.globalAlpha = 0.45 * (1 - age / 6);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function coneColor(state) {
  if (state === 'alarm') return { fill: 'rgba(226,84,44,0.34)', edge: PALETTE.vermillion };
  if (state === 'searching') return { fill: 'rgba(217,123,46,0.28)', edge: '#D97B2E' };
  if (state === 'suspicious' || state === 'investigate') return { fill: 'rgba(217,164,65,0.24)', edge: PALETTE.amber };
  return { fill: 'rgba(46,158,131,0.16)', edge: PALETTE.jade };
}

function drawGuards(ctx, game) {
  for (const g of game.guards) {
    const c = coneColor(g.state);
    // Vision cone — none while blinded: a flinching guard sees nothing.
    if (g.state !== 'flinch') {
      ctx.save();
      ctx.fillStyle = c.fill;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.arc(g.x, g.y, CONE_RANGE, g.angle - CONE_HALF, g.angle + CONE_HALF);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = c.edge;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    // Body: ink disc, state-coloured cap, facing tick.
    ctx.save();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath(); ctx.arc(g.x, g.y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.state === 'flinch' ? PALETTE.chalk : bandColor(bandOf(g.alert));
    ctx.beginPath(); ctx.arc(g.x, g.y, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PALETTE.chalk; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(g.x + Math.cos(g.angle) * 12, g.y + Math.sin(g.angle) * 12);
    ctx.stroke();
    // State mark.
    ctx.font = `700 17px ${SERIF}`;
    ctx.textAlign = 'center';
    if (g.state === 'flinch') {
      // BLINDED gets the header treatment: serif, amber, on an ink pill —
      // the same styling as the SUSPICIOUS state mark, not bare caps.
      ctx.font = `700 13px ${SERIF}`;
      const bw = ctx.measureText('BLINDED').width + 16;
      ctx.fillStyle = rgba(PALETTE.ink, 0.85);
      ctx.beginPath(); ctx.roundRect(g.x - bw / 2, g.y - 40, bw, 20, 4); ctx.fill();
      ctx.fillStyle = PALETTE.amber;
      ctx.textAlign = 'center';
      ctx.fillText('BLINDED', g.x, g.y - 26);
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.x - 10, g.y - 6); ctx.lineTo(g.x - 4, g.y - 14);
      ctx.moveTo(g.x + 10, g.y - 6); ctx.lineTo(g.x + 4, g.y - 14);
      ctx.stroke();
    } else if (g.state === 'alarm') {
      ctx.fillStyle = PALETTE.vermillion;
      ctx.fillText('!', g.x, g.y - 20);
    } else if (g.state === 'suspicious' || g.state === 'investigate' || g.state === 'searching') {
      ctx.fillStyle = PALETTE.amber;
      ctx.fillText('?', g.x, g.y - 20);
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, game) {
  const p = game.player;
  const band = bandOf(game.detection);
  const radius = noiseRadius(p);
  ctx.save();
  if (radius > 0) {
    ctx.strokeStyle = rgba(PALETTE.vermillion, p.moving === 'sprint' ? 0.55 : 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
  }
  if (p.inShadow) {
    ctx.strokeStyle = rgba(PALETTE.jade, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.stroke();
  }
  // The avatar itself is coloured by detection state.
  ctx.fillStyle = band === 'HIDDEN' ? PALETTE.chalk : bandColor(band);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.facing) * 13, p.y + Math.sin(p.facing) * 13);
  ctx.lineTo(p.x + Math.cos(p.facing + 2.5) * 7, p.y + Math.sin(p.facing + 2.5) * 7);
  ctx.lineTo(p.x + Math.cos(p.facing - 2.5) * 7, p.y + Math.sin(p.facing - 2.5) * 7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBell(ctx, game) {
  const s = game.level.swinger;
  if (!s) return;
  const swing = Math.sin(game.time * (Math.PI * 2 / s.period)) * s.amp;
  const bx = s.x + Math.sin(swing) * 34, by = s.y + 40;
  ctx.save();
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(bx, by - 12); ctx.stroke();
  ctx.fillStyle = '#D9A441';
  ctx.beginPath();
  ctx.moveTo(bx - 12, by + 8);
  ctx.quadraticCurveTo(bx - 12, by - 12, bx, by - 14);
  ctx.quadraticCurveTo(bx + 12, by - 12, bx + 12, by + 8);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8A6A1F'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

function drawGnomon(ctx, x, y, hourNum, sunAngle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = PALETTE.chalk;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
    ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
    ctx.stroke();
  }
  // Hairline: the hour hand, rotating as the sun does.
  const hand = ((hourNum % 12) / 12) * Math.PI * 2 - Math.PI / 2 + (sunAngle - 1.15) * 0.5;
  ctx.strokeStyle = PALETTE.vermillion; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hand) * 14, Math.sin(hand) * 14); ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawHUD(ctx, game) {
  const L = game.level;
  const band = bandOf(game.detection);
  // Top bar.
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, W, TOP);
  ctx.fillStyle = PALETTE.chalk;
  ctx.font = `700 20px ${SERIF}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${game.levelIndex + 1} · ${L.name.toUpperCase()}`, 20, 26);
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.chalk, 0.65);
  ctx.fillText(`${L.hour} — ${L.objective.name.toUpperCase()}, THEN THE EXIT`, 20, 45);
  // Centre: the big detection state, with the band pip row beside it.
  ctx.textAlign = 'center';
  ctx.font = `700 26px ${SERIF}`;
  ctx.fillStyle = bandColor(band);
  const bandText = band + (band === 'SUSPICIOUS' ? ' ?' : band === 'ALARM' ? ' !' : '');
  ctx.fillText(bandText, W / 2, 29);
  drawBandPips(ctx, band, W / 2 + ctx.measureText(bandText).width / 2 + 14, 18);
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.chalk, 0.7);
  ctx.fillText(bandHint(band), W / 2, 47);
  // Hour stamp pill: "2PM · RUST" — the hour and palette, right of centre.
  const stamp = hourStamp(L);
  ctx.font = `700 12px ${MONO}`;
  const sw = ctx.measureText(stamp).width + 24;
  const sx = W - 232 - sw;
  ctx.fillStyle = rgba(PALETTE.chalk, 0.07);
  ctx.strokeStyle = L.accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(sx, 12, sw, 34, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PALETTE.chalk;
  ctx.textAlign = 'center';
  ctx.fillText(stamp, sx + sw / 2, 34);
  // Right: timer, loot, gnomon dial.
  ctx.textAlign = 'right';
  ctx.font = `700 22px ${MONO}`;
  ctx.fillStyle = PALETTE.chalk;
  ctx.fillText(fmtTime(game.time), W - 118, 28);
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.chalk, 0.65);
  const lootGot = game.loot.filter((l) => l.taken).length;
  ctx.fillText(`RELIQUARY ${lootGot}/4   PAR ${fmtTime(L.par)}`, W - 118, 46);
  drawGnomon(ctx, W - 88, 29, L.hourNum, game.sunAngle);
  // Bottom bar.
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, H - BOTTOM, W, BOTTOM);
  ctx.fillStyle = rgba(PALETTE.chalk, 0.75);
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = 'left';
  ctx.fillText('WASD MOVE · SHIFT SNEAK · SPACE SPRINT · E INTERACT · ESC PAUSE', 20, H - 17);
  ctx.textAlign = 'right';
  const sunWord = game.player.inShadow ? 'IN SHADE — HARD TO SEE' : 'IN LIGHT — EASY TO SEE';
  ctx.fillStyle = game.player.inShadow ? PALETTE.jade : PALETTE.vermillion;
  ctx.fillText(`SUN ${L.hourNum}:00  ·  ${sunWord}`, W - 20, H - 17);
  // Interact prompt + toast.
  const it = game.interactable;
  if (it) {
    const label = it.kind === 'shutter'
      ? (it.target.open ? 'E — CLOSE THE SHUTTER' : 'E — PULL THE SHUTTER')
      : it.kind === 'objective' ? `E — TAKE THE ${it.target.name.toUpperCase()}`
        : 'E — POCKET THE RELIC';
    ctx.font = `700 13px ${MONO}`;
    const tw = ctx.measureText(label).width + 24;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath(); ctx.roundRect(game.player.x - tw / 2, game.player.y - 52, tw, 24, 4); ctx.fill();
    ctx.fillStyle = PALETTE.chalk;
    ctx.textAlign = 'center';
    ctx.fillText(label, game.player.x, game.player.y - 35);
  }
  if (game.toast && game.time - game.toast.t < 3.2) {
    ctx.globalAlpha = Math.min(1, (3.2 - (game.time - game.toast.t)) / 0.8);
    ctx.font = `700 14px ${MONO}`;
    const tw = ctx.measureText(game.toast.text).width + 32;
    ctx.fillStyle = rgba(PALETTE.ink, 0.92);
    ctx.beginPath(); ctx.roundRect(W / 2 - tw / 2, TOP + 10, tw, 28, 4); ctx.fill();
    ctx.fillStyle = PALETTE.chalk;
    ctx.textAlign = 'center';
    ctx.fillText(game.toast.text, W / 2, TOP + 29);
    ctx.globalAlpha = 1;
  }
  // Alarm wash: the floor goes vermillion at ALARM.
  if (band === 'ALARM') {
    ctx.fillStyle = `rgba(226,84,44,${0.05 + 0.03 * Math.sin(game.time * 6)})`;
    ctx.fillRect(PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  }
}

// ---------------------------------------------------------------- screens

export function renderPlaying(ctx, game) {
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, W, H);
  drawFloor(ctx, game);
  if (game.shadowCanvas) ctx.drawImage(game.shadowCanvas, PLAY.x, PLAY.y, PLAY.w, PLAY.h);
  // Dappled leaf shadow on Lemon Stair: dots inside the tree shadows.
  if (game.level.dapple) {
    ctx.save();
    ctx.fillStyle = rgba(PALETTE.ultramarine, 0.25);
    for (const r of game.level.occluders) {
      if (r.kind !== 'tree') continue;
      for (let i = 0; i < 8; i++) {
        const ox = ((i * 37 + r.x) % 90) - 10, oy = ((i * 53 + r.y) % 70) + 20;
        ctx.beginPath(); ctx.arc(r.x + ox, r.y + oy, 5 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  for (const s of game.shutters) if (!s.open) drawShutter(ctx, game, s);
  for (const r of game.level.occluders) drawOccluder(ctx, r);
  for (const s of game.shutters) if (s.open) drawShutter(ctx, game, s);
  drawExit(ctx, game);
  for (const loot of game.loot) drawLoot(ctx, loot, game.time);
  drawObjective(ctx, game);
  drawFootprints(ctx, game);
  drawBell(ctx, game);
  drawGuards(ctx, game);
  drawPlayer(ctx, game);
  drawHUD(ctx, game);
  frameOverlay(ctx);
}

export function renderTitle(ctx, game) {
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, W, H);
  // A great sundial: hour lines, gnomon, and its long blue shadow.
  const cx = 640, cy = 330;
  ctx.save();
  ctx.strokeStyle = rgba(PALETTE.ink, 0.25); ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    ctx.lineTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 190);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(PALETTE.ultramarine, 0.5);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + 260, cy + 130);
  ctx.lineTo(cx + 300, cy + 100);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 10); ctx.lineTo(cx, cy - 70); ctx.lineTo(cx + 18, cy + 10);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 190, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 92px ${SERIF}`;
  ctx.fillText('SUNDIAL', cx, 150);
  ctx.font = `400 24px ${SERIF}`;
  ctx.fillText('A Thief in the Siesta Sun', cx, 192);
  ctx.font = `600 14px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.ink, 0.7);
  ctx.fillText('CALVERA · FIVE HOURS · FIVE THEFTS · ONE SUN THAT NEVER BLINKS', cx, 560);
  ctx.font = `700 18px ${MONO}`;
  ctx.fillStyle = PALETTE.ink;
  const blink = 0.6 + 0.4 * Math.sin(game.time * 3);
  ctx.globalAlpha = blink;
  ctx.fillText('PRESS ENTER OR CLICK TO BEGIN', cx, 610);
  ctx.globalAlpha = 1;
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.ink, 0.6);
  ctx.fillText('WASD MOVE · SHIFT SNEAK · SPACE SPRINT · E INTERACT', cx, 640);
  frameOverlay(ctx);
}

function medallion(ctx, x, y, stars) {
  ctx.save();
  ctx.fillStyle = stars >= 3 ? '#D9A441' : stars === 2 ? '#C9C9C9' : stars === 1 ? '#B07B4A' : rgba(PALETTE.ink, 0.15);
  ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 12px ${MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(stars > 0 ? '★'.repeat(stars) : '—', x, y + 1);
  ctx.restore();
}

export function renderSelect(ctx, game) {
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 44px ${SERIF}`;
  ctx.fillText('THE FIVE HOURS', 640, 92);
  ctx.font = `400 18px ${SERIF}`;
  ctx.fillStyle = rgba(PALETTE.ink, 0.7);
  ctx.fillText('Every hour a theft. Nothing locked — pick any hour and go.', 640, 124);
  const cw = 224, gap = 16, x0 = (W - (cw * 5 + gap * 4)) / 2, y0 = 160, ch = 380;
  LEVELS.forEach((L, i) => {
    const x = x0 + i * (cw + gap);
    const best = game.best[i];
    ctx.save();
    ctx.fillStyle = PALETTE.chalk;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y0, cw, ch, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = L.accent;
    ctx.fillRect(x, y0, cw, 8);
    game.buttons.push({ id: `level-${i}`, x, y: y0, w: cw, h: ch });
    // Landmark silhouette behind the card's header: one per hour.
    drawLandmark(ctx, L.landmark, x + 12, y0 + 12, cw - 24, 56, L.accent);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.ink;
    // Fit the level name inside the card: shrink until it fits.
    let titleSize = 30;
    ctx.font = `700 ${titleSize}px ${SERIF}`;
    while (titleSize > 19 && ctx.measureText(L.name).width > cw - 32) {
      titleSize -= 1;
      ctx.font = `700 ${titleSize}px ${SERIF}`;
    }
    ctx.fillText(L.name, x + 16, y0 + 52);
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = L.accent;
    ctx.fillText(L.hour, x + 16, y0 + 74);
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = rgba(PALETTE.ink, 0.55);
    ctx.fillText(hourStamp(L), x + 16, y0 + 92);
    ctx.font = `400 14px ${SERIF}`;
    ctx.fillStyle = rgba(PALETTE.ink, 0.75);
    // Wrap the story line.
    const words = L.story.split(' ');
    let line = '', ly = y0 + 106;
    for (const w of words) {
      if (ctx.measureText(line + w).width > cw - 32) {
        ctx.fillText(line, x + 16, ly); ly += 20; line = '';
      }
      line += w + ' ';
    }
    ctx.fillText(line, x + 16, ly);
    // Objective + par.
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText('STEAL', x + 16, y0 + 210);
    ctx.font = `700 12px ${MONO}`;
    ctx.fillText(L.objective.name.toUpperCase(), x + 16, y0 + 228);
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = rgba(PALETTE.ink, 0.6);
    ctx.fillText(`PAR ${fmtTime(L.par)} · ${L.guards.length} GUARDS`, x + 16, y0 + 252);
    // Medallion + best time.
    medallion(ctx, x + 36, y0 + 306, best ? best.stars : 0);
    ctx.textAlign = 'left';
    ctx.font = `700 14px ${MONO}`;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(best ? fmtTime(best.time) : '— : —.—', x + 66, y0 + 302);
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = best ? PALETTE.jade : rgba(PALETTE.ink, 0.5);
    ctx.fillText(best ? best.rating : 'NOT YET STOLEN', x + 66, y0 + 320);
    ctx.textAlign = 'center';
    ctx.font = `700 13px ${MONO}`;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(`[${i + 1}]  PLAY`, x + cw / 2, y0 + ch - 22);
    ctx.restore();
  });
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.ink, 0.6);
  ctx.textAlign = 'center';
  ctx.fillText('CLICK A CARD OR PRESS 1–5 · BEST TIMES ARE KEPT ON THIS MACHINE', 640, 590);
  frameOverlay(ctx);
}

export function renderPause(ctx, game) {
  renderPlaying(ctx, game);
  ctx.fillStyle = 'rgba(20,18,31,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.chalk;
  ctx.font = `700 52px ${SERIF}`;
  ctx.fillText('PAUSED', 640, 300);
  ctx.font = `400 18px ${SERIF}`;
  ctx.fillText('The sun waits for no thief — but it will wait for you.', 640, 340);
  button(ctx, game, 'resume', 490, 390, 300, 44, 'RESUME  [ESC]', true);
  button(ctx, game, 'menu', 490, 446, 300, 44, 'LEVEL SELECT', false);
  frameOverlay(ctx);
}

export function renderCaught(ctx, game) {
  renderPlaying(ctx, game);
  ctx.fillStyle = 'rgba(226,84,44,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.chalk;
  ctx.font = `700 64px ${SERIF}`;
  ctx.fillText('CAUGHT', 640, 280);
  ctx.font = `400 20px ${SERIF}`;
  ctx.fillText('A guard laid hands on you in the open sun.', 640, 322);
  ctx.font = `600 14px ${MONO}`;
  ctx.fillText(`SURVIVED ${fmtTime(game.time)} · SPOTTED ${game.spotted}x · LOOT ${game.loot.filter((l) => l.taken).length}/4`, 640, 366);
  button(ctx, game, 'retry', 420, 410, 200, 46, 'RETRY  [R]', true);
  button(ctx, game, 'menu', 660, 410, 200, 46, 'LEVEL SELECT', false);
  frameOverlay(ctx);
}

export function renderEscaped(ctx, game) {
  ctx.fillStyle = PALETTE.bone;
  ctx.fillRect(0, 0, W, H);
  const L = game.level;
  const lootGot = game.loot.filter((l) => l.taken).length;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.ink;
  ctx.font = `700 60px ${SERIF}`;
  ctx.fillText('ESCAPED', 640, 130);
  ctx.font = `400 20px ${SERIF}`;
  ctx.fillText(`The ${L.objective.name} is yours. Calvera sleeps on, none the wiser.`, 640, 170);
  // Rating + stars.
  ctx.font = `700 34px ${SERIF}`;
  ctx.fillStyle = game.rating === 'GHOST' ? PALETTE.jade : game.rating === 'SHADOW' ? PALETTE.amber : PALETTE.vermillion;
  ctx.fillText(game.rating, 640, 232);
  ctx.font = `700 44px ${SERIF}`;
  ctx.fillStyle = '#D9A441';
  ctx.fillText('★'.repeat(game.stars) + '☆'.repeat(3 - game.stars), 640, 288);
  // Stats row.
  ctx.font = `600 13px ${MONO}`;
  ctx.fillStyle = rgba(PALETTE.ink, 0.65);
  const stats = [
    ['TIME', fmtTime(game.time)],
    ['PAR', fmtTime(L.par)],
    ['SPOTTED', `${game.spotted}x`],
    ['RELIQUARY', `${lootGot}/4`],
  ];
  stats.forEach(([label, value], i) => {
    const x = 340 + i * 200;
    ctx.fillText(label, x, 350);
    ctx.font = `700 22px ${MONO}`;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(value, x, 380);
    ctx.font = `600 13px ${MONO}`;
    ctx.fillStyle = rgba(PALETTE.ink, 0.65);
  });
  if (game.time <= L.par) {
    ctx.font = `700 14px ${MONO}`;
    ctx.fillStyle = PALETTE.jade;
    ctx.fillText('UNDER PAR — THE SUN ITSELF APPLAUDS', 640, 420);
  }
  const next = game.levelIndex + 1 < LEVELS.length;
  button(ctx, game, next ? 'next' : 'menu', 420, 460, 200, 46, next ? 'NEXT LEVEL  [N]' : 'LEVEL SELECT', true);
  button(ctx, game, 'retry', 660, 460, 200, 46, 'RETRY  [R]', false);
  if (next) button(ctx, game, 'menu', 540, 522, 200, 46, 'LEVEL SELECT', false);
  frameOverlay(ctx);
}
