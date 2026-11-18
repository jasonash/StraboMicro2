/**
 * Image stitcher: the mosaic builder (electron/mosaicBuilder.js) and the image opener
 * (electron/userImage.js), in plain Node.
 *
 *   npm run test:mosaic-builder
 *
 * Tiles are cut from a made-up color picture, written as files in a temp folder, and built
 * back into a mosaic that is compared with the picture.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const bmp = require('bmp-js');
const { buildMosaic, saveMosaicAs, BuildCancelled, BAND_ROWS } = require('../electron/mosaicBuilder');
const { openUserImage, rgbPixels } = require('../electron/userImage');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strabo-mosaic-test-'));
const file = (name) => path.join(dir, name);

// A smooth color picture (smooth, so resampling differences stay small)
const SW = 1400;
const SH = 1000;
const scene = Buffer.alloc(SW * SH * 3);
for (let y = 0; y < SH; y++) {
  for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 3;
    scene[i] = 128 + 100 * Math.sin(x / 37) * Math.cos(y / 53);
    scene[i + 1] = 128 + 100 * Math.sin((x + y) / 61);
    scene[i + 2] = 128 + 100 * Math.cos(x / 29 - y / 71);
  }
}
const sceneAt = (x, y) => [scene[(y * SW + x) * 3], scene[(y * SW + x) * 3 + 1], scene[(y * SW + x) * 3 + 2]];

/** A tile file: the scene region at (left, top), optionally changed pixel by pixel */
async function writeTile(name, left, top, width, height, change) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = sceneAt(left + x, top + y);
      const o = (y * width + x) * 3;
      const out = change ? change(r, g, b, x, y) : [r, g, b];
      data[o] = out[0];
      data[o + 1] = out[1];
      data[o + 2] = out[2];
    }
  }
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 1 }).toFile(file(name));
  return { path: file(name), width, height };
}

async function pixelsOf(p) {
  const { data, info } = await sharp(p, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

/** Largest and mean difference between a built image and the scene region starting at (left, top) */
function against(built, left, top, skip) {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < built.height; y++) {
    for (let x = 0; x < built.width; x++) {
      if (skip && skip(x, y)) continue;
      const want = sceneAt(left + x, top + y);
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(built.data[(y * built.width + x) * 3 + k] - want[k]);
        if (d > max) max = d;
        sum += d;
        n++;
      }
    }
  }
  return { max, mean: sum / n };
}

/** A minimal little-endian 16-bit gray TIFF, one strip (what a microscope camera may write) */
function grayTiff16(values, width, height) {
  const tags = [[256, 4, width], [257, 4, height], [258, 3, 16], [259, 3, 1], [262, 3, 1], [273, 4, 8], [277, 3, 1], [278, 4, height], [279, 4, width * height * 2]];
  const ifdAt = 8 + width * height * 2;
  const out = Buffer.alloc(ifdAt + 2 + tags.length * 12 + 4);
  out.write('II', 0, 'latin1');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(ifdAt, 4);
  Buffer.from(values.buffer, values.byteOffset, values.byteLength).copy(out, 8);
  out.writeUInt16LE(tags.length, ifdAt);
  tags.forEach(([tag, type, value], k) => {
    const at = ifdAt + 2 + k * 12;
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(1, at + 4);
    if (type === 3) out.writeUInt16LE(value, at + 8);
    else out.writeUInt32LE(value, at + 8);
  });
  return out;
}

(async () => {
  // ---------------------------------------------------------------- 1. four tiles, exact places
  const TW = 700;
  const TH = 500;
  const places = [[100, 80], [640, 90], [110, 470], [650, 460]];
  const tiles = [];
  for (let k = 0; k < places.length; k++) {
    const t = await writeTile(`t${k}.png`, places[k][0], places[k][1], TW, TH);
    tiles.push({ ...t, matrix: [1, 0, places[k][0] - 100, 0, 1, places[k][1] - 80] });
  }
  const W = 650 + TW - 100;
  const H = 470 + TH - 80;
  {
    const seen = [];
    const out = await buildMosaic({ tiles, width: W, height: H, outputPath: file('four.tif'), fill: [255, 0, 255], onProgress: (d, t) => seen.push([d, t]) });
    check('result says size and bytes', out.width === W && out.height === H && out.bytes === fs.statSync(file('four.tif')).size, out);
    const built = await pixelsOf(file('four.tif'));
    check('the TIFF reads back as RGB at the right size', built.width === W && built.height === H && built.channels === 3, built);
    const covered = (x, y) => places.some(([px, py]) => x + 100 >= px && x + 100 < px + TW && y + 80 >= py && y + 80 < py + TH);
    const diff = against(built, 100, 80, (x, y) => !covered(x, y));
    check('covered pixels equal the picture (within rounding)', diff.max <= 1, diff);
    // Top right of tile 0's row is above tile 1 (which starts 10 rows lower): uncovered
    const o = (2 * W + (W - 5)) * 3;
    check('uncovered pixels have the fill color', built.data[o] === 255 && built.data[o + 1] === 0 && built.data[o + 2] === 255, [...built.data.subarray(o, o + 3)]);
    check('several bands were written', H > BAND_ROWS * 3 && seen.length === Math.ceil(H / BAND_ROWS), seen.length);
    check('progress ends at the last row', seen[seen.length - 1][0] === H && seen[seen.length - 1][1] === H, seen[seen.length - 1]);

    const cropped = await buildMosaic({ tiles, width: W, height: H, crop: { left: 300, top: 200, width: 500, height: 300 }, outputPath: file('crop.tif') });
    const c = await pixelsOf(file('crop.tif'));
    check('crop: only that rectangle', cropped.width === 500 && cropped.height === 300 && against(c, 400, 280).max <= 1, against(c, 400, 280));

    const strip = await buildMosaic({ tiles, width: W, height: H, crop: { left: 0, top: 100, width: 600, height: 120 }, outputPath: file('strip.tif') });
    const s = await pixelsOf(file('strip.tif'));
    check('a mosaic of one band is a valid file too', strip.height === 120 && s.height === 120 && against(s, 100, 180).max <= 1);

    await saveMosaicAs(file('four.tif'), file('four.jpg'), 'jpeg');
    await saveMosaicAs(file('four.tif'), file('four.png'), 'png');
    const j = await sharp(file('four.jpg')).metadata();
    const png = await pixelsOf(file('four.png'));
    check('saved as JPEG at the same size', j.format === 'jpeg' && j.width === W && j.height === H, j);
    check('saved as PNG with the same pixels', png.width === W && Buffer.compare(png.data, built.data) === 0);
  }

  // ---------------------------------------------------------------- 2. saved at half size
  {
    const half = tiles.map((t) => ({ ...t, matrix: t.matrix.map((v) => v * 0.5) }));
    const out = await buildMosaic({ tiles: half, width: Math.round(W / 2), height: Math.round(H / 2), outputPath: file('half.tif') });
    const built = await pixelsOf(file('half.tif'));
    const want = await sharp(scene, { raw: { width: SW, height: SH, channels: 3 } }).extract({ left: 100, top: 80, width: W, height: H }).resize(out.width, out.height, { fit: 'fill' }).raw().toBuffer();
    let sum = 0;
    let n = 0;
    for (let y = 30; y < 200; y++) for (let x = 30; x < 250; x++) for (let k = 0; k < 3; k++) {
      sum += Math.abs(built.data[(y * out.width + x) * 3 + k] - want[(y * out.width + x) * 3 + k]);
      n++;
    }
    check('half size: like the picture shrunk to half', sum / n < 2, sum / n);
  }

  // ---------------------------------------------------------------- 3. a turned tile
  {
    // The tile shows the scene around (700, 500), turned 12 degrees: tile pixel -> scene pixel
    const rad = (12 * Math.PI) / 180;
    const a = Math.cos(rad);
    const q = Math.sin(rad);
    const w = 600;
    const h = 400;
    const truth = [a, -q, 700 - (a * w) / 2 + (q * h) / 2, q, a, 500 - (q * w) / 2 - (a * h) / 2];
    const data = Buffer.alloc(w * h * 3);
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      // Pixel centers
      const sx = truth[0] * (u + 0.5) + truth[1] * (v + 0.5) + truth[2] - 0.5;
      const sy = truth[3] * (u + 0.5) + truth[4] * (v + 0.5) + truth[5] - 0.5;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      for (let k = 0; k < 3; k++) {
        const p = (x, y) => scene[(y * SW + x) * 3 + k];
        data[(v * w + u) * 3 + k] = (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy + 0.5;
      }
    }
    await sharp(data, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file('turned.png'));
    // Mosaic frame = the scene region from (300, 200), 800 x 600
    const matrix = [truth[0], truth[1], truth[2] - 300, truth[3], truth[4], truth[5] - 200];
    await buildMosaic({ tiles: [{ path: file('turned.png'), width: w, height: h, matrix }], width: 800, height: 600, outputPath: file('turned.tif'), fill: [1, 2, 3] });
    const built = await pixelsOf(file('turned.tif'));
    const inside = (x, y) => {
      // Mosaic pixel -> tile pixel, well inside the tile
      const dx = x + 300 - 700;
      const dy = y + 200 - 500;
      const u = a * dx + q * dy;
      const v = -q * dx + a * dy;
      return Math.abs(u) < w / 2 - 4 && Math.abs(v) < h / 2 - 4;
    };
    const diff = against(built, 300, 200, (x, y) => !inside(x, y));
    check('a turned tile lands where its matrix says', diff.mean < 1.5 && diff.max <= 12, diff);
    check('outside the turned tile is fill', built.data[0] === 1 && built.data[1] === 2 && built.data[2] === 3);
  }

  // ---------------------------------------------------------------- 4. feathering and masks
  {
    // Two tiles side by side, 200 px shared; the right one 20% darker; a white "scale bar" burned
    // into the left tile inside the shared part, and another outside it
    const bar = (x, y) => (x >= 520 && x < 580 && y >= 100 && y < 130) || (x >= 100 && x < 160 && y >= 100 && y < 130);
    const left = await writeTile('left.png', 100, 100, 600, 300, (r, g, b, x, y) => (bar(x, y) ? [255, 255, 255] : [r, g, b]));
    const right = await writeTile('right.png', 500, 100, 600, 300, (r, g, b) => [r * 0.8, g * 0.8, b * 0.8]);
    const pair = [{ ...left, matrix: [1, 0, 0, 0, 1, 0] }, { ...right, matrix: [1, 0, 400, 0, 1, 0] }];
    await buildMosaic({ tiles: pair, width: 1000, height: 300, outputPath: file('pair.tif') });
    const built = await pixelsOf(file('pair.tif'));
    // Brightness relative to the picture along the middle row
    const ratio = (x) => {
      let s = 0;
      let n = 0;
      for (let y = 140; y < 160; y++) for (let k = 0; k < 3; k++) {
        s += built.data[(y * 1000 + x) * 3 + k] / sceneAt(100 + x, 100 + y)[k];
        n++;
      }
      return s / n;
    };
    check('left of the shared part: the left tile', Math.abs(ratio(300) - 1) < 0.01, ratio(300));
    check('right of the shared part: the right tile', Math.abs(ratio(700) - 0.8) < 0.01, ratio(700));
    check('middle of the shared part: half way', Math.abs(ratio(500) - 0.9) < 0.02, ratio(500));
    let steps = 0;
    for (let x = 401; x < 600; x++) steps = Math.max(steps, Math.abs(ratio(x) - ratio(x - 1)));
    check('no step anywhere across the shared part', steps < 0.01, steps);
    check('and it falls steadily from left to right', ratio(420) > ratio(470) && ratio(470) > ratio(530) && ratio(530) > ratio(580), [ratio(420), ratio(470), ratio(530), ratio(580)]);
    // Without a mask the bar in the shared part shows half faded
    const barPixel = (b) => b.data[(115 * 1000 + 550) * 3];
    const clean = sceneAt(650, 215)[0] * 0.8;
    check('fixture: without a mask the bar shows through', Math.abs(barPixel(built) - clean) > 20, [barPixel(built), clean]);

    const masked = [{ ...pair[0], masks: [{ x: 510, y: 90, width: 80, height: 50 }, { x: 90, y: 90, width: 80, height: 50 }] }, pair[1]];
    await buildMosaic({ tiles: masked, width: 1000, height: 300, outputPath: file('masked.tif') });
    const m = await pixelsOf(file('masked.tif'));
    check('masked bar in the shared part: the other tile\'s clean pixels', Math.abs(barPixel(m) - clean) <= 1.5, [barPixel(m), clean]);
    check('masked bar where nothing else covers stays', m.data[(115 * 1000 + 130) * 3] === 255);
    check('outside the masks nothing changed', Buffer.compare(m.data.subarray(200 * 3000, 300 * 3000), built.data.subarray(200 * 3000, 300 * 3000)) === 0);
  }

  // ---------------------------------------------------------------- 5. cancel
  {
    let asked = 0;
    let error = null;
    try {
      await buildMosaic({ tiles, width: W, height: H, outputPath: file('cancelled.tif'), isCancelled: () => ++asked > 3 });
    } catch (e) {
      error = e;
    }
    check('cancel: stops with BuildCancelled', error instanceof BuildCancelled, error && error.message);
    check('cancel: no file left behind', !fs.existsSync(file('cancelled.tif')));
    let missing = null;
    try {
      await buildMosaic({ tiles: [{ path: file('nope.png'), width: 10, height: 10, matrix: [1, 0, 0, 0, 1, 0] }], width: 10, height: 10, outputPath: file('missing.tif') });
    } catch (e) {
      missing = e;
    }
    check('a missing tile file is an error, and no file is left', !!missing && !(missing instanceof BuildCancelled) && !fs.existsSync(file('missing.tif')), missing && missing.message);
  }

  // ---------------------------------------------------------------- 6. opening people's images
  {
    const w = 120;
    const h = 80;
    const rgb = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      rgb[i * 3] = i % 251;
      rgb[i * 3 + 1] = (i * 7) % 251;
      rgb[i * 3 + 2] = (i * 13) % 251;
    }
    await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).tiff({ compression: 'none' }).toFile(file('rgb.tif'));
    const tif = await openUserImage(file('rgb.tif'));
    const fromTif = await rgbPixels(tif, w, h);
    check('TIFF: size and pixels', tif.width === w && tif.height === h && Buffer.compare(fromTif.data, rgb) === 0);

    // 16-bit gray: values 0..65535 become 0..255
    const gray16 = new Uint16Array(w * h);
    for (let i = 0; i < w * h; i++) gray16[i] = (i * 257 * 3) % 65536;
    fs.writeFileSync(file('gray16.tif'), grayTiff16(gray16, w, h));
    const meta16 = await sharp(file('gray16.tif')).metadata();
    const g = await rgbPixels(await openUserImage(file('gray16.tif')), w, h);
    let worst = 0;
    for (let i = 0; i < w * h; i++) worst = Math.max(worst, Math.abs(g.data[i * 3] - Math.round(gray16[i] / 257)), Math.abs(g.data[i * 3] - g.data[i * 3 + 1]), Math.abs(g.data[i * 3] - g.data[i * 3 + 2]));
    check('fixture: the gray TIFF is 16-bit', meta16.depth === 'ushort', meta16.depth);
    check('16-bit gray TIFF: scaled to 8-bit, three equal channels', worst <= 1, worst);

    const abgr = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      abgr[i * 4] = 255;
      abgr[i * 4 + 1] = rgb[i * 3 + 2];
      abgr[i * 4 + 2] = rgb[i * 3 + 1];
      abgr[i * 4 + 3] = rgb[i * 3];
    }
    fs.writeFileSync(file('rgb.bmp'), bmp.encode({ data: abgr, width: w, height: h }).data);
    const fromBmp = await rgbPixels(await openUserImage(file('rgb.bmp')), w, h);
    check('BMP: pixels', Buffer.compare(fromBmp.data, rgb) === 0);

    await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png().toFile(file('rgb.png'));
    const png = await openUserImage(file('rgb.png'));
    const smaller = await rgbPixels(png, 60, 40);
    check('PNG: read at another size', png.width === w && smaller.width === 60 && smaller.height === 40 && smaller.data.length === 60 * 40 * 3);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
