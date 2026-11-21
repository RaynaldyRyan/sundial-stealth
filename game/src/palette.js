// SUNDIAL — palette. Six fixed values, used everywhere. Shadows are saturated
// blue, never grey: grey shadow is what makes flat 2D canvas look cheap.
export const PALETTE = {
  bone: '#EFE3CE',
  chalk: '#FBF6EA',
  ultramarine: '#2C3A8C',
  ink: '#14121F',
  vermillion: '#E2542C',
  jade: '#2E9E83',
  amber: '#D9A441',
  violet: '#6B4E9E',
  cyan: '#3FA7B8',
  rust: '#B4552D',
};

export const SERIF = "Georgia, 'Palatino Linotype', 'Book Antiqua', 'DejaVu Serif', serif";
export const MONO = "'DejaVu Sans Mono', 'Liberation Mono', Consolas, monospace";

// 'rrggbb' + alpha -> 'rgba(r,g,b,a)'
export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Detection band colours: hidden reads bone/jade, alarm reads vermillion.
export function bandColor(band) {
  if (band === 'HIDDEN') return PALETTE.jade;
  if (band === 'SUSPICIOUS') return PALETTE.amber;
  if (band === 'SEARCHING') return '#D97B2E';
  return PALETTE.vermillion;
}
