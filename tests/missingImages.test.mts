/**
 * Micrographs without an image file, warned about before Export as .smz and
 * Turn On Sync (Sentry ELECTRON-39): the check in electron/missingImages.js
 * and the wording in src/utils/missingImages.ts.
 *
 *   npm run test:missing-images
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { micrographRefs, missingImagesWarning, MISSING_IMAGES_LIST_LIMIT } from '../src/utils/missingImages.ts';

const require = createRequire(import.meta.url);
const { missingImages, micrographsOf } = require('../electron/missingImages.js');

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const project = {
  datasets: [{ samples: [
    { micrographs: [{ id: 'm1', name: 'NOC-7_PPL' }, { id: 'm2', name: 'NOC-7_XPL' }] },
    { micrographs: [{ id: 'm3', name: '  ' }, { id: 'm4', name: 'Empty file' }, { id: '../x', name: 'Bad id' }] },
  ] }],
};

// Which micrographs the project has
const refs = micrographRefs(project);
check('micrographRefs: tree order, blank name named', refs.map((r) => r.id).join() === 'm1,m2,m3,m4,../x' && refs[2].name === 'Unnamed micrograph', refs);
check('micrographRefs: no project', micrographRefs(null).length === 0 && micrographRefs({}).length === 0);
check('micrographsOf (main) agrees on the ids', micrographsOf(project).map((m: { id: string }) => m.id).join() === 'm1,m2,m3,m4,../x');

// The check against a folder
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-images-'));
try {
  fs.mkdirSync(path.join(tmp, 'images'));
  fs.mkdirSync(path.join(tmp, 'uiImages'));
  fs.writeFileSync(path.join(tmp, 'images', 'm1'), 'jpeg');
  fs.writeFileSync(path.join(tmp, 'images', 'm4'), '');
  fs.writeFileSync(path.join(tmp, 'uiImages', 'm2'), 'jpeg');
  const missing = missingImages(tmp, 'a4f3165a-a512-4a9b-8953-bf099d321a96', refs);
  check('new project: no file, an empty file and a uiImages-only file all count as missing; a bad id is ignored',
    missing.map((m: { id: string }) => m.id).join() === 'm2,m3,m4', missing);
  check('names come back trimmed or named', missing[1].name === 'Unnamed micrograph' && missing[0].name === 'NOC-7_XPL', missing);
  const legacy = missingImages(tmp, '16866805364130', refs);
  check('legacy project (numeric id): uiImages/<id> counts as the image', legacy.map((m: { id: string }) => m.id).join() === 'm3,m4', legacy);
  check('nothing missing when every image is there', missingImages(tmp, 'p', [{ id: 'm1', name: 'a' }]).length === 0);
  check('no folder: everything missing, no throw', missingImages(path.join(tmp, 'nope'), 'p', [{ id: 'm1', name: 'a' }]).length === 1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// The wording
check('nothing missing: no warning', missingImagesWarning([], 'export') === null && missingImagesWarning([], 'sync') === null);
const one = missingImagesWarning([{ id: 'a', name: 'OC-10_PPL' }], 'export');
check('one, export', one !== null && one.title === '1 micrograph has no image file on this computer' && one.lines.join() === 'OC-10_PPL'
  && one.more === null && one.note.startsWith('The .smz file will not have its image, so whoever opens it gets that micrograph without an image.'), one);
const many = Array.from({ length: 40 }, (_, i) => ({ id: `id${i}`, name: `M${i}` }));
const forty = missingImagesWarning(many, 'sync');
check('forty, sync: first names, "and N more", sync note', forty !== null && forty.title === '40 micrographs have no image file on this computer'
  && forty.lines.length === MISSING_IMAGES_LIST_LIMIT && forty.more === `and ${40 - MISSING_IMAGES_LIST_LIMIT} more`
  && forty.note.startsWith('StraboSpot gets those micrographs without an image.') && forty.note.includes('sync that copy instead'), forty);
const all = [one, forty, missingImagesWarning(many, 'export'), missingImagesWarning([{ id: 'a', name: 'x' }], 'sync')];
check('no em dash in any wording', all.every((w) => w !== null && !/—/.test(JSON.stringify(w))));

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
