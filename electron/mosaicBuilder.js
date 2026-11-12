/**
 * Image stitcher: builds the mosaic file from the tiles and their placements
 * (src/services/stitch/stitchLayout.ts mosaicFrame gives the size and the matrices).
 *
 * Memory stays flat whatever the tile and mosaic sizes: the mosaic is made in horizontal bands
 * and each band is written to disk as one strip of an uncompressed TIFF; a tile is held in
 * memory (already shrunk to the mosaic's pixel size) only while a band crosses it.
 *
 * Where tiles overlap, each pixel is the weighted average of the tiles there; a tile's weight
 * falls to almost nothing at its own edge (feathering), so seams, corner darkening and small
 * brightness steps fade into each other. Areas no tile covers get the fill color.
 *
 * The work is cut into short pieces with a pause between them, so the process it runs in keeps
 * answering. No Electron imports: it also runs in plain Node tests.
 *
 * Design: docs/image-stitcher-design.md
 */

const fs = require('fs');
const sharp = require('sharp');
const { openUserImage, rgbPixels } = require('./userImage');

/** Rows per band (and per TIFF strip) */
const BAND_ROWS = 256;
/** A tile's weight reaches 1 this share of its half short side in from the edge */
const FEATHER = 0.3;
/** Weight at the very edge of a tile, and of masked pixels: used only where nothing better covers */
const EDGE_WEIGHT = 1e-3;

class BuildCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'BuildCancelled';
  }
}

const pause = () => new Promise((resolve) => setImmediate(resolve));

/** [a, b, tx, c, d, ty] inverted */
function invert(m) {
  const det = m[0] * m[4] - m[1] * m[3];
  return [m[4] / det, -m[1] / det, (m[1] * m[5] - m[4] * m[2]) / det, -m[3] / det, m[0] / det, (m[3] * m[2] - m[0] * m[5]) / det];
}

/** Header of a little-endian baseline TIFF whose strips follow at byte 8 */
function tiffHeader(ifdOffset) {
  const b = Buffer.alloc(8);
  b.write('II', 0, 'latin1');
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(ifdOffset, 4);
  return b;
}

/** The image file directory of an uncompressed 8-bit RGB TIFF with one strip per band, written after the pixels */
function tiffDirectory(width, height, rowsPerStrip, ifdOffset) {
  const strips = Math.ceil(height / rowsPerStrip);
  const entries = 10;
  const ifdSize = 2 + entries * 12 + 4;
  const bitsAt = ifdOffset + ifdSize;
  const offsetsAt = bitsAt + 6;
  const countsAt = offsetsAt + strips * 4;
  const b = Buffer.alloc(ifdSize + 6 + strips * 8);
  let at = 0;
  b.writeUInt16LE(entries, at);
  at += 2;
  const entry = (tag, type, count, value) => {
    b.writeUInt16LE(tag, at);
    b.writeUInt16LE(type, at + 2);
    b.writeUInt32LE(count, at + 4);
    if (type === 3 && count === 1) b.writeUInt16LE(value, at + 8);
    else b.writeUInt32LE(value, at + 8);
    at += 12;
  };
  const SHORT = 3;
  const LONG = 4;
  const stripBytes = (i) => Math.min(rowsPerStrip, height - i * rowsPerStrip) * width * 3;
  entry(256, LONG, 1, width);
  entry(257, LONG, 1, height);
  entry(258, SHORT, 3, bitsAt);
  entry(259, SHORT, 1, 1); // no compression
  entry(262, SHORT, 1, 2); // RGB
  entry(273, LONG, strips, strips === 1 ? 8 : offsetsAt);
  entry(277, SHORT, 1, 3);
  entry(278, LONG, 1, rowsPerStrip);
  entry(279, LONG, strips, strips === 1 ? stripBytes(0) : countsAt);
  entry(284, SHORT, 1, 1); // chunky
  b.writeUInt32LE(0, at); // no further directory
  at += 4;
  b.writeUInt16LE(8, at);
  b.writeUInt16LE(8, at + 2);
  b.writeUInt16LE(8, at + 4);
  at += 6;
  let offset = 8;
  for (let i = 0; i < strips; i++) {
    b.writeUInt32LE(offset, at + i * 4);
    b.writeUInt32LE(stripBytes(i), at + strips * 4 + i * 4);
    offset += stripBytes(i);
  }
  return b;
}

/**
 * @typedef {Object} MosaicTile
 * @property {string} path  The original image file
 * @property {number} width  Its full size in pixels
 * @property {number} height
 * @property {number[]} matrix  [a, b, tx, c, d, ty]: tile pixel -> mosaic pixel (move, turn, resize)
 * @property {Array<{x: number, y: number, width: number, height: number}>} [masks]
 *   Areas of the tile (tile pixels) to use only where no other tile covers (burned-in scale bars)
 */

/**
 * @param {Object} job
 * @param {MosaicTile[]} job.tiles
 * @param {number} job.width   Mosaic size in pixels
 * @param {number} job.height
 * @param {{left: number, top: number, width: number, height: number}} [job.crop]  Part of the mosaic to write
 * @param {[number, number, number]} [job.fill]  Color of uncovered areas, default black
 * @param {string} job.outputPath  Uncompressed TIFF to write
 * @param {(done: number, total: number) => void} [job.onProgress]  In rows
 * @param {() => boolean} [job.isCancelled]
 * @returns {Promise<{path: string, width: number, height: number, bytes: number}>}
 */
async function buildMosaic(job) {
  const crop = job.crop ?? { left: 0, top: 0, width: job.width, height: job.height };
  const W = Math.round(crop.width);
  const H = Math.round(crop.height);
  if (!(W > 0 && H > 0)) throw new Error('The mosaic has no size');
  if (8 + W * H * 3 + 4096 + Math.ceil(H / BAND_ROWS) * 8 > 0xffffffff) throw new Error('The mosaic is too large for one file');
  const fill = job.fill ?? [0, 0, 0];
  const isCancelled = job.isCancelled ?? (() => false);

  // Per tile: its size on the mosaic, the rows it touches, and mosaic pixel -> shrunken tile pixel
  const plan = job.tiles.map((tile) => {
    const [a, b, tx, c, d, ty] = tile.matrix;
    const scale = Math.hypot(a, c);
    const rw = Math.max(1, Math.round(tile.width * scale));
    const rh = Math.max(1, Math.round(tile.height * scale));
    // shrunken tile pixel -> crop pixel
    const kx = tile.width / rw;
    const ky = tile.height / rh;
    const forward = [a * kx, b * ky, tx - crop.left, c * kx, d * ky, ty - crop.top];
    const corners = [[0, 0], [rw, 0], [rw, rh], [0, rh]].map(([x, y]) => [forward[0] * x + forward[1] * y + forward[2], forward[3] * x + forward[4] * y + forward[5]]);
    return {
      tile,
      rw,
      rh,
      kx,
      ky,
      back: invert(forward),
      x0: Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0])))),
      x1: Math.min(W, Math.ceil(Math.max(...corners.map((p) => p[0])))),
      y0: Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1])))),
      y1: Math.min(H, Math.ceil(Math.max(...corners.map((p) => p[1])))),
      pixels: null,
    };
  }).filter((p) => p.x1 > p.x0 && p.y1 > p.y0);

  const file = await fs.promises.open(job.outputPath, 'w');
  try {
    await file.write(tiffHeader(8 + W * H * 3));
    const sums = new Float32Array(W * BAND_ROWS * 3);
    const weights = new Float32Array(W * BAND_ROWS);
    // One buffer for every full band (each write is finished before the next band starts)
    const fullStrip = Buffer.alloc(W * BAND_ROWS * 3);

    for (let top = 0; top < H; top += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, H - top);
      sums.fill(0);
      weights.fill(0);

      for (const p of plan) {
        if (p.y1 <= top || p.y0 >= top + rows) continue;
        if (isCancelled()) throw new BuildCancelled();
        if (!p.pixels) {
          const opened = await openUserImage(p.tile.path);
          p.pixels = (await rgbPixels(opened, p.rw, p.rh)).data;
        }
        drawTile(p, sums, weights, W, top, rows);
        await pause();
      }

      const strip = rows === BAND_ROWS ? fullStrip : Buffer.alloc(W * rows * 3);
      for (let i = 0; i < W * rows; i++) {
        const w = weights[i];
        if (w > 0) {
          strip[i * 3] = sums[i * 3] / w + 0.5;
          strip[i * 3 + 1] = sums[i * 3 + 1] / w + 0.5;
          strip[i * 3 + 2] = sums[i * 3 + 2] / w + 0.5;
        } else {
          strip[i * 3] = fill[0];
          strip[i * 3 + 1] = fill[1];
          strip[i * 3 + 2] = fill[2];
        }
      }
      await file.write(strip);
      // Tiles the bands have passed are no longer needed
      for (const p of plan) if (p.pixels && p.y1 <= top + rows) p.pixels = null;
      job.onProgress?.(top + rows, H);
      await pause();
      if (isCancelled()) throw new BuildCancelled();
    }
    await file.write(tiffDirectory(W, H, BAND_ROWS, 8 + W * H * 3));
  } catch (error) {
    await file.close();
    await fs.promises.unlink(job.outputPath).catch(() => undefined);
    throw error;
  }
  await file.close();
  const { size } = await fs.promises.stat(job.outputPath);
  return { path: job.outputPath, width: W, height: H, bytes: size };
}

/** Adds one tile's share to the rows [top, top + rows) of the band */
function drawTile(p, sums, weights, W, top, rows) {
  const { rw, rh, pixels, back } = p;
  const [ia, ib, itx, ic, id, ity] = back;
  const ramp = Math.max(1, (Math.min(rw, rh) / 2) * FEATHER);
  const masks = (p.tile.masks ?? []).map((m) => ({ x0: m.x / p.kx, y0: m.y / p.ky, x1: (m.x + m.width) / p.kx, y1: (m.y + m.height) / p.ky }));
  const yFrom = Math.max(p.y0, top);
  const yTo = Math.min(p.y1, top + rows);
  for (let y = yFrom; y < yTo; y++) {
    // Center of mosaic pixel (x, y) in shrunken tile pixels (pixel centers at .5)
    let u = ia * (p.x0 + 0.5) + ib * (y + 0.5) + itx;
    let v = ic * (p.x0 + 0.5) + id * (y + 0.5) + ity;
    let at = (y - top) * W + p.x0;
    for (let x = p.x0; x < p.x1; x++, u += ia, v += ic, at++) {
      if (u < 0 || v < 0 || u > rw || v > rh) continue;
      let w = Math.min(u, rw - u, v, rh - v) / ramp;
      if (w > 1) w = 1;
      if (w < EDGE_WEIGHT) w = EDGE_WEIGHT;
      for (let k = 0; k < masks.length; k++) {
        const m = masks[k];
        if (u >= m.x0 && u < m.x1 && v >= m.y0 && v < m.y1) w = EDGE_WEIGHT * EDGE_WEIGHT;
      }
      // Bilinear, between pixel centers, clamped at the tile's edge
      let fx = u - 0.5;
      let fy = v - 0.5;
      if (fx < 0) fx = 0;
      else if (fx > rw - 1) fx = rw - 1;
      if (fy < 0) fy = 0;
      else if (fy > rh - 1) fy = rh - 1;
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = x0 + 1 < rw ? x0 + 1 : x0;
      const y1 = y0 + 1 < rh ? y0 + 1 : y0;
      const ax = fx - x0;
      const ay = fy - y0;
      const i00 = (y0 * rw + x0) * 3;
      const i10 = (y0 * rw + x1) * 3;
      const i01 = (y1 * rw + x0) * 3;
      const i11 = (y1 * rw + x1) * 3;
      const w00 = (1 - ax) * (1 - ay) * w;
      const w10 = ax * (1 - ay) * w;
      const w01 = (1 - ax) * ay * w;
      const w11 = ax * ay * w;
      const o = at * 3;
      sums[o] += pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11;
      sums[o + 1] += pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11;
      sums[o + 2] += pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11;
      weights[at] += w;
    }
  }
}

/**
 * The built TIFF saved in another format, read from disk strip by strip.
 * @param {'jpeg' | 'png' | 'tiff'} format
 */
async function saveMosaicAs(tiffPath, outputPath, format) {
  const image = sharp(tiffPath, { limitInputPixels: false, sequentialRead: true });
  if (format === 'jpeg') await image.jpeg({ quality: 95, mozjpeg: true }).toFile(outputPath);
  else if (format === 'png') await image.png().toFile(outputPath);
  else if (format === 'tiff') await image.tiff({ compression: 'lzw' }).toFile(outputPath);
  else throw new Error(`Unknown format: ${format}`);
  return outputPath;
}

module.exports = { buildMosaic, saveMosaicAs, BuildCancelled, BAND_ROWS };
