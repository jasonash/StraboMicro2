/**
 * BMP originals (electron/originalImages.js). A StraboMicro v1 project kept a
 * BMP original as it was; sharp cannot read BMP, so every sync push stopped
 * with "Input file contains unsupported image format" (user report
 * 2026-11-18, StraboSpot project 557: a 32-bit BITFIELDS, top-down BMP of a
 * BSE image). Checks: the decoder against made-up BMPs of each layout, the
 * in-place conversion of a project's images/ (PNG, same pixels, other files
 * untouched, idempotent), tiles from the converted file, and the import's BMP
 * conversion (bmp-js turned a gray BITFIELDS BMP red).
 * Runs in Electron (electron-log, scratch space).
 *
 *   npm run test:original-images
 *   BMP_FILE=<path to a real BMP> npm run test:original-images   (also converts that file, in a copy)
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
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

/** Test picture: a color per pixel, gray when gray is set */
function colorAt(x, y, gray) {
  if (gray) { const v = (x * 7 + y * 13) % 256; return [v, v, v]; }
  return [(x * 37) % 256, (y * 53) % 256, (x * 11 + y * 5) % 256];
}

/**
 * A BMP file. bpp 24 / 32 (BI_RGB), 32 or 16 with masks (BITFIELDS),
 * 16 (BI_RGB 5-5-5), 8 / 4 / 1 with a palette (pixel = palette index).
 */
function makeBmp({ width, height, bpp, masks = null, topDown = false, gray = false, palette = null, alpha = 0 }) {
  const dibSize = masks ? 108 : 40;
  const paletteBytes = palette ? palette.length * 4 : 0;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
  const offset = 14 + dibSize + paletteBytes;
  const b = Buffer.alloc(offset + rowSize * height);
  b.write('BM', 0, 'ascii');
  b.writeUInt32LE(b.length, 2);
  b.writeUInt32LE(offset, 10);
  b.writeUInt32LE(dibSize, 14);
  b.writeInt32LE(width, 18);
  b.writeInt32LE(topDown ? -height : height, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(bpp, 28);
  b.writeUInt32LE(masks ? 3 : 0, 30);
  b.writeUInt32LE(rowSize * height, 34);
  b.writeUInt32LE(palette ? palette.length : 0, 46);
  if (masks) masks.forEach((m, i) => b.writeUInt32LE(m >>> 0, 54 + i * 4));
  if (palette) palette.forEach(([r, g, bl], i) => { const o = 14 + dibSize + i * 4; b[o] = bl; b[o + 1] = g; b[o + 2] = r; });
  const expected = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = offset + (topDown ? y : height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      let rgb;
      if (palette) {
        const index = (x + y) % palette.length;
        rgb = palette[index];
        const bitPos = x * bpp;
        b[row + (bitPos >> 3)] |= index << (8 - bpp - (bitPos & 7));
      } else if (bpp === 16) {
        const [r, g, bl] = colorAt(x, y, gray).map((v) => v >> 3);
        rgb = [r, g, bl].map((v) => Math.round((v * 255) / 31));
        b.writeUInt16LE((r << 10) | (g << 5) | bl, row + x * 2);
      } else {
        rgb = colorAt(x, y, gray);
        const p = row + x * (bpp / 8);
        if (masks) {
          // masks: R 0x00ff0000, G 0x0000ff00, B 0x000000ff, A 0xff000000
          b.writeUInt32LE((((alpha << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0), p);
        } else {
          b[p] = rgb[2]; b[p + 1] = rgb[1]; b[p + 2] = rgb[0];
          if (bpp === 32) b[p + 3] = alpha;
        }
      }
      expected.set(rgb, (y * width + x) * 3);
    }
  }
  return { file: b, expected };
}

const MASKS = [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000];
const GRAYS = [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]];
const COLORS = [[255, 0, 0], [0, 128, 0], [0, 0, 255], [250, 200, 10]];

/** Decoded pixels as RGB (1 channel widened) */
function asRgb(d) {
  if (d.channels === 3) return d.data;
  const out = Buffer.alloc(d.width * d.height * 3);
  for (let i = 0; i < d.width * d.height; i++) out.fill(d.data[i], i * 3, i * 3 + 3);
  return out;
}

async function run() {
  const { decodeBmp, isBmpFile, convertBmpOriginals } = require('../electron/originalImages');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'original-images-'));

  // 1. Decoder, each layout (odd widths: row padding)
  const cases = {
    '24-bit bottom-up color': { width: 13, height: 7, bpp: 24 },
    '24-bit top-down gray': { width: 10, height: 6, bpp: 24, topDown: true, gray: true },
    '32-bit BI_RGB, alpha 0': { width: 9, height: 5, bpp: 32, alpha: 0 },
    '32-bit BITFIELDS top-down gray (the report)': { width: 11, height: 8, bpp: 32, masks: MASKS, topDown: true, gray: true, alpha: 255 },
    '32-bit BITFIELDS color, alpha 0': { width: 7, height: 4, bpp: 32, masks: MASKS, alpha: 0 },
    '16-bit 5-5-5': { width: 5, height: 3, bpp: 16 },
    '8-bit palette gray': { width: 9, height: 4, bpp: 8, palette: GRAYS },
    '4-bit palette': { width: 7, height: 3, bpp: 4, palette: COLORS },
    '1-bit palette': { width: 19, height: 3, bpp: 1, palette: [[0, 0, 0], [255, 255, 255]] },
  };
  for (const [name, spec] of Object.entries(cases)) {
    const { file, expected } = makeBmp(spec);
    try {
      const d = await decodeBmp(file);
      const gray = spec.gray || spec.palette === GRAYS || (spec.palette && spec.palette.length === 2);
      check(`${name}: size`, d.width === spec.width && d.height === spec.height, `${d.width}x${d.height}`);
      check(`${name}: ${gray ? 'gray, 1 channel' : 'color, 3 channels'}`, d.channels === (gray ? 1 : 3), `channels ${d.channels}`);
      check(`${name}: every pixel right`, asRgb(d).equals(expected));
    } catch (e) {
      check(`${name}: decoded`, false, e.message);
    }
  }
  let refused = false;
  const cut = makeBmp({ width: 20, height: 20, bpp: 24 }).file;
  try { await decodeBmp(cut.subarray(0, cut.length - 100)); } catch { refused = true; }
  check('cut-off BMP refused', refused);

  // 2. A project's images/: BMP becomes PNG in place, other files untouched
  const folder = path.join(dir, 'project');
  const images = path.join(folder, 'images');
  fs.mkdirSync(images, { recursive: true });
  const report = makeBmp({ width: 300, height: 200, bpp: 32, masks: MASKS, topDown: true, gray: true, alpha: 255 });
  const color = makeBmp({ width: 64, height: 48, bpp: 24 });
  fs.writeFileSync(path.join(images, '17485395023797'), report.file);
  fs.writeFileSync(path.join(images, '22222222222222'), color.file);
  const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(images, '33333333333333'), jpeg);
  check('BMP detected', await isBmpFile(path.join(images, '17485395023797')));
  check('JPEG not taken for a BMP', !(await isBmpFile(path.join(images, '33333333333333'))));

  const [first, again] = [convertBmpOriginals(folder), convertBmpOriginals(folder)];
  check('open and push asking at once share one run', first === again);
  const converted = await first;
  check('two BMPs converted', converted.length === 2, JSON.stringify(converted));
  for (const [id, src, channels] of [['17485395023797', report, 1], ['22222222222222', color, 3]]) {
    const p = path.join(images, id);
    const meta = await sharp(p).metadata();
    check(`${id}: now a PNG sharp reads`, meta.format === 'png' && meta.width > 0, meta.format);
    check(`${id}: ${channels === 1 ? 'gray' : 'color'} PNG`, meta.channels === channels, `channels ${meta.channels}`);
    const raw = await sharp(p).toColourspace('srgb').removeAlpha().raw().toBuffer();
    check(`${id}: same pixels (lossless)`, raw.equals(src.expected));
  }
  check('JPEG left byte for byte', fs.readFileSync(path.join(images, '33333333333333')).equals(jpeg));
  check('no temporary files left', fs.readdirSync(images).length === 3, fs.readdirSync(images).join(', '));
  check('second run converts nothing', (await convertBmpOriginals(folder)).length === 0);
  check('folder without images/ is fine', (await convertBmpOriginals(path.join(dir, 'nothing'))).length === 0);

  // An unreadable "BMP" is left as it was
  const broken = path.join(dir, 'broken');
  fs.mkdirSync(path.join(broken, 'images'), { recursive: true });
  const brokenBytes = cut.subarray(0, 80);
  fs.writeFileSync(path.join(broken, 'images', '1'), brokenBytes);
  check('broken BMP: nothing converted', (await convertBmpOriginals(broken)).length === 0);
  check('broken BMP: left as it was', fs.readFileSync(path.join(broken, 'images', '1')).equals(brokenBytes));

  // 3. Tiles from the converted file (the step that failed in the push)
  const tileGenerator = require('../electron/tileGenerator');
  try {
    const r = await tileGenerator.processImageComplete(path.join(images, '17485395023797'));
    check('tiles made from the converted original', r.metadata.width === 300 && r.metadata.height === 200, JSON.stringify(r.metadata));
  } catch (e) {
    check('tiles made from the converted original', false, e.message);
  }

  // 4. Import of a gray BITFIELDS BMP stays gray (bmp-js made it red)
  const { convertToScratchJPEG } = require('../electron/imageConverter');
  const scratchSpace = require('../electron/scratchSpace');
  const big = makeBmp({ width: 2100, height: 1200, bpp: 32, masks: MASKS, topDown: true, gray: true, alpha: 255 });
  const importPath = path.join(dir, 'bse.bmp');
  fs.writeFileSync(importPath, big.file);
  try {
    const r = await convertToScratchJPEG(importPath);
    const stats = await sharp(r.scratchPath).stats();
    const [rm, gm, bm] = stats.channels.map((c) => c.mean);
    const spread = Math.max(rm, gm, bm) - Math.min(rm, gm, bm);
    check('import: gray BMP stays gray', spread < 2, `means ${rm.toFixed(1)} ${gm.toFixed(1)} ${bm.toFixed(1)}`);
    check('import: full size', r.originalWidth === 2100 && r.originalHeight === 1200, JSON.stringify(r));
    await scratchSpace.deleteScratchFile(r.identifier);
  } catch (e) {
    check('import: BMP converted', false, e.message);
  }

  // 5. Optional: a real BMP (in a copy)
  if (process.env.BMP_FILE) {
    const real = path.join(dir, 'real');
    fs.mkdirSync(path.join(real, 'images'), { recursive: true });
    fs.copyFileSync(process.env.BMP_FILE, path.join(real, 'images', 'real'));
    const [c] = await convertBmpOriginals(real);
    check('real BMP converted', !!c, 'nothing converted');
    if (c) {
      console.log(`  real BMP: ${c.width}x${c.height}, ${c.bytesBefore} -> ${c.bytesAfter} bytes`);
      const meta = await sharp(path.join(real, 'images', 'real')).metadata();
      check('real BMP: PNG of the same size', meta.format === 'png' && meta.width === c.width && meta.height === c.height);
    }
  }

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
