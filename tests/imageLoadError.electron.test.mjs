/**
 * What people see when an image they bring in cannot be converted
 * (src/utils/imageLoadError.ts). Sentry ELECTRON-2Y (2026-10-22): a damaged
 * XPL PNG in Add Sibling showed "Error invoking remote method
 * 'image:convert-to-scratch': Error: vipspng: libpng read error".
 * Damaged files are converted for real with convertToScratchJPEG, so a sharp
 * or tiff update that changes the decoder wording fails here instead of
 * silently showing the raw text again. Each error is wrapped the way
 * ipcRenderer.invoke wraps it before it reaches the dialogs.
 * Runs in Electron (scratch space needs app.getPath).
 *
 *   npm run test:image-load-error
 */

import { app } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 500)}` : ''}`);
  }
}

/** The renderer sees main-process errors wrapped like this */
function asIpcError(message) {
  return new Error(`Error invoking remote method 'image:convert-to-scratch': Error: ${message}`);
}

async function run() {
  const { describeImageLoadError, DAMAGED_IMAGE_MESSAGE, UNREADABLE_IMAGE_MESSAGE } = await import(
    '../src/utils/imageLoadError.ts'
  );
  const { convertToScratchJPEG } = require('../electron/imageConverter');
  const scratchSpace = require('../electron/scratchSpace');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-load-error-'));
  const write = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };

  // Noisy pixels so the compressed data is long enough to cut in the middle
  const raw = Buffer.alloc(1200 * 900 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + (i >> 9)) & 255;
  const pic = () => sharp(raw, { raw: { width: 1200, height: 900, channels: 3 } });
  const png = await pic().png().toBuffer();
  const interlaced = await pic().png({ progressive: true }).toBuffer();
  const jpg = await pic().jpeg().toBuffer();
  const tif = await pic().tiff({ compression: 'lzw' }).toBuffer();
  const cut = (b, f) => b.subarray(0, Math.floor(b.length * f));
  const flip = (b) => { const c = Buffer.from(b); const m = Math.floor(c.length / 2); c[m] ^= 0xff; c[m + 1] ^= 0xff; return c; };

  /** Convert and return the error message, or null when it converted */
  async function failure(file) {
    try {
      const r = await convertToScratchJPEG(file);
      await scratchSpace.deleteScratchFile(r.identifier);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  // Sanity: an intact PNG still converts
  check('intact PNG converts', (await failure(write('good.png', png))) === null);

  const damaged = {
    'PNG cut off (ELECTRON-2Y)': write('cut.png', cut(png, 0.6)),
    'PNG with corrupted bytes': write('flip.png', flip(png)),
    'interlaced PNG cut off': write('cut-interlaced.png', cut(interlaced, 0.6)),
    'PNG cut off inside its header': write('header.png', cut(png, 0.001)),
    'JPEG cut off': write('cut.jpg', cut(jpg, 0.6)),
    'TIFF cut off': write('cut.tif', cut(tif, 0.6)),
  };
  for (const [label, file] of Object.entries(damaged)) {
    const message = await failure(file);
    check(`${label}: refused`, message !== null);
    if (message === null) continue;
    check(`${label}: shown as damaged`, describeImageLoadError(asIpcError(message)) === DAMAGED_IMAGE_MESSAGE, message);
  }

  // TIFF magic bytes, rest unreadable: passes the header check, sharp cannot read it
  const tiffHeaderJunk = write('junk.png', Buffer.concat([Buffer.from('49492a00', 'hex'), Buffer.alloc(5000, 0x5a)]));
  const junkMessage = await failure(tiffHeaderJunk);
  check('unreadable after header check: refused', junkMessage !== null);
  if (junkMessage !== null) {
    check('unreadable after header check: shown as unreadable',
      describeImageLoadError(asIpcError(junkMessage)) === UNREADABLE_IMAGE_MESSAGE, junkMessage);
  }

  // validateImageFile's own text is already readable: only the IPC wrapper goes
  const passedThrough = {
    'empty file': write('empty.png', Buffer.alloc(0)),
    'not an image': write('text.jpg', Buffer.from('hello world, not an image')),
    'missing file': path.join(dir, 'missing.png'),
  };
  for (const [label, file] of Object.entries(passedThrough)) {
    const message = await failure(file);
    check(`${label}: refused`, message !== null);
    if (message === null) continue;
    const shown = describeImageLoadError(asIpcError(message));
    check(`${label}: own text shown without the IPC wrapper`, shown === message, shown);
  }

  check('non-Error value', describeImageLoadError(undefined) === 'Unknown error');

  fs.rmSync(dir, { recursive: true, force: true });
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    failures++;
    console.log('  FAIL  test crashed:', e);
  }
  console.log(failures ? `\n${failures} FAILED, ${passes} passed` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
