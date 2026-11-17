/**
 * Last step of npm run build:standalone: the page is named view.html (the
 * legacy viewer's address, view.html?p=<id>), and an empty smzFiles/ folder
 * with a short note shows where the project folders go.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../dist-standalone/', import.meta.url));

if (!existsSync(join(out, 'index.html'))) {
  console.error('finish-standalone: dist-standalone/index.html not found; run vite build --mode standalone first');
  process.exit(1);
}
renameSync(join(out, 'index.html'), join(out, 'view.html'));

mkdirSync(join(out, 'smzFiles'), { recursive: true });
writeFileSync(
  join(out, 'smzFiles', 'README.txt'),
  [
    'Put decompressed StraboMicro projects here, one folder per project.',
    '',
    'A .smz file is a ZIP archive: rename it to .zip and extract it. It holds',
    'one folder named by the project id (it contains project.json). Copy that',
    'folder here, then open view.html?p=<project id>.',
    '',
  ].join('\n'),
);

console.log('Standalone viewer ready in dist-standalone/ (view.html, config.js, assets/, smzFiles/)');
