/**
 * Original images sharp cannot read (BMP), turned into lossless PNG files.
 *
 * StraboMicro v1 copied a BMP original into images/<micrographId> as it was;
 * the app converts a BMP when it is imported, so only v1 projects have one.
 * sharp (libvips) cannot read BMP, so the tile step of every sync push failed
 * on such a file with "Input file contains unsupported image format" and the
 * whole push stopped, for every copy of the project (user report 2026-11-18,
 * StraboSpot project 557, a 32-bit BITFIELDS BMP of a BSE image).
 *
 * convertBmpOriginals rewrites each BMP original once, in place, as a PNG of
 * the same size and the same pixels (gray when every pixel is gray). The
 * next push uploads it, so the server and the other copies get the PNG too.
 * Called when a project opens (project:load-json) and before a push (a pull
 * can bring a BMP from a copy that has not converted it yet).
 *
 * decodeBmp is also the import's BMP decoder (electron/imageConverter.js):
 * bmp-js read the channel masks of a 32-bit BITFIELDS BMP wrongly (a gray
 * BSE image came out red).
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const log = require('electron-log');
const { writeFileAtomic } = require('./atomicFile');

/** @param {Buffer} buf */
function looksLikeBmp(buf) {
  return buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d; // 'BM'
}

/**
 * Whether a file starts with the BMP signature
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function isBmpFile(filePath) {
  let handle = null;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const head = Buffer.alloc(2);
    const { bytesRead } = await handle.read(head, 0, 2, 0);
    return bytesRead === 2 && looksLikeBmp(head);
  } catch (_) {
    return false;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

/**
 * Shift and width of a channel mask, to read a channel as 0..255
 * @param {number} mask
 */
function maskReader(mask) {
  if (!mask) return () => 0;
  let shift = 0;
  while (((mask >>> shift) & 1) === 0) shift++;
  let bits = 0;
  while (((mask >>> (shift + bits)) & 1) === 1) bits++;
  const max = 2 ** bits - 1;
  return (/** @type {number} */ value) => Math.round((((value & mask) >>> shift) * 255) / max);
}

/**
 * Uncompressed BMP layouts read here byte for byte (1/4/8-bit palette,
 * 16/24/32-bit, BITFIELDS masks, top-down or bottom-up). null for anything
 * else (RLE, embedded JPEG/PNG, OS/2 headers), which goes to node-canvas.
 * Alpha is ignored: microscope images do not use it, and 32-bit BMPs often
 * leave it 0, which would make every pixel transparent.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, rgb: Buffer } | null}
 */
function decodeUncompressed(buf) {
  if (buf.length < 54) return null;
  const dataOffset = buf.readUInt32LE(10);
  const dibSize = buf.readUInt32LE(14);
  if (dibSize < 40) return null;
  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  const colorsUsed = buf.readUInt32LE(46);
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  if (width <= 0 || height === 0) return null;

  let masks = null;
  if (compression === 3 || compression === 6) {
    if (bpp !== 16 && bpp !== 32) return null;
    masks = [buf.readUInt32LE(54), buf.readUInt32LE(58), buf.readUInt32LE(62)];
  } else if (compression !== 0) {
    return null;
  } else if (bpp === 16) {
    masks = [0x7c00, 0x03e0, 0x001f];
  } else if (![1, 4, 8, 24, 32].includes(bpp)) {
    return null;
  }

  const rowSize = Math.floor((bpp * width + 31) / 32) * 4;
  if (dataOffset + rowSize * height > buf.length) throw new Error('The BMP file is cut off');

  let palette = null;
  if (bpp <= 8) {
    const count = colorsUsed || 2 ** bpp;
    const at = 14 + dibSize;
    palette = [];
    for (let i = 0; i < count; i++) palette.push([buf[at + i * 4 + 2], buf[at + i * 4 + 1], buf[at + i * 4]]);
  }
  const readers = masks ? masks.map(maskReader) : null;

  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const row = dataOffset + (topDown ? y : height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      if (palette) {
        const bitPos = x * bpp;
        const byte = buf[row + (bitPos >> 3)];
        const index = (byte >> (8 - bpp - (bitPos & 7))) & (2 ** bpp - 1);
        const c = palette[index] || [0, 0, 0];
        rgb[o] = c[0];
        rgb[o + 1] = c[1];
        rgb[o + 2] = c[2];
      } else if (readers) {
        const v = bpp === 32 ? buf.readUInt32LE(row + x * 4) : buf.readUInt16LE(row + x * 2);
        rgb[o] = readers[0](v);
        rgb[o + 1] = readers[1](v);
        rgb[o + 2] = readers[2](v);
      } else {
        const p = row + x * (bpp / 8);
        rgb[o] = buf[p + 2];
        rgb[o + 1] = buf[p + 1];
        rgb[o + 2] = buf[p];
      }
    }
  }
  return { width, height, rgb };
}

/**
 * Decode a BMP to 8-bit pixels: 1 channel when every pixel is gray, else 3
 * @param {Buffer} buf
 * @returns {Promise<{ width: number, height: number, channels: 1 | 3, data: Buffer }>}
 */
async function decodeBmp(buf) {
  let decoded = decodeUncompressed(buf);
  if (!decoded) {
    const { createCanvas, loadImage } = require('canvas');
    const image = await loadImage(buf);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, image.width, image.height).data;
    const n = image.width * image.height;
    const rgb = Buffer.alloc(n * 3);
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = rgba[i * 4];
      rgb[i * 3 + 1] = rgba[i * 4 + 1];
      rgb[i * 3 + 2] = rgba[i * 4 + 2];
    }
    decoded = { width: image.width, height: image.height, rgb };
  }
  const { width, height, rgb } = decoded;
  const n = width * height;
  let gray = true;
  for (let i = 0; i < n && gray; i++) {
    const o = i * 3;
    if (rgb[o] !== rgb[o + 1] || rgb[o] !== rgb[o + 2]) gray = false;
  }
  if (!gray) return { width, height, channels: 3, data: rgb };
  const data = Buffer.alloc(n);
  for (let i = 0; i < n; i++) data[i] = rgb[i * 3];
  return { width, height, channels: 1, data };
}

/** Conversions under way, per project folder (open and push can ask at once) */
const running = new Map();

/**
 * Rewrite every BMP in <folder>/images as a lossless PNG of the same size.
 * A file that cannot be converted is left as it was (logged).
 * @param {string} folder - Project folder
 * @returns {Promise<Array<{ id: string, width: number, height: number, bytesBefore: number, bytesAfter: number }>>}
 */
function convertBmpOriginals(folder) {
  const key = path.resolve(folder);
  const current = running.get(key);
  if (current) return current;
  const job = convertAll(key).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

/** @param {string} folder */
async function convertAll(folder) {
  const imagesDir = path.join(folder, 'images');
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = await fs.promises.readdir(imagesDir, { withFileTypes: true });
  } catch (_) {
    return [];
  }
  const converted = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const filePath = path.join(imagesDir, entry.name);
    if (!(await isBmpFile(filePath))) continue;
    try {
      const bytesBefore = (await fs.promises.stat(filePath)).size;
      const { width, height, channels, data } = await decodeBmp(await fs.promises.readFile(filePath));
      let pipeline = sharp(data, { raw: { width, height, channels }, limitInputPixels: false });
      // A 1-channel raw input is written as RGB unless asked for gray
      if (channels === 1) pipeline = pipeline.toColourspace('b-w');
      const png = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      await writeFileAtomic(filePath, png);
      converted.push({ id: entry.name, width, height, bytesBefore, bytesAfter: png.length });
      log.info(`[OriginalImages] images/${entry.name}: BMP ${width}x${height} (${bytesBefore} bytes) rewritten as PNG (${channels === 1 ? 'gray' : 'color'}, ${png.length} bytes)`);
    } catch (err) {
      log.error(`[OriginalImages] images/${entry.name}: BMP could not be converted, left as it was:`, err);
    }
  }
  return converted;
}

module.exports = { isBmpFile, decodeBmp, convertBmpOriginals };
