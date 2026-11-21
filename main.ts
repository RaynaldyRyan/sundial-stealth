// SUNDIAL — A Thief in the Siesta Sun. Hand-in program for the make.fun
// best-stealth-game bounty (Node 22, standard library only).
//
// The game is this repository's game/ folder: plain static files a desktop
// browser loads offline (game/index.html plus its ES modules, no library and
// no network request). This program copies game/ and screenshots/ from beside
// this file to the output directory and writes /output/dossier.json with the
// vendored make.fun library.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: the dossier text is capped at 160 KiB; the rest
// refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; game/ over 993 files or 48 MiB, or a path over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A one-line receipt on stdout: the dossier's byte size and the screenshot
// count, so a run's output says what it handed in.
const shotCount = existsSync(join(here, 'screenshots'))
  ? readdirSync(join(here, 'screenshots')).filter((n) => /\.(png|jpe?g)$/i.test(n)).length
  : 0;
console.log(`SUNDIAL handed in: dossier ${Buffer.byteLength(dossier)} bytes, ${shotCount} screenshots -> ${out}`);
