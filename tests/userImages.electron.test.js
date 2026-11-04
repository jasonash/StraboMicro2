/**
 * Image files people bring in are converted even when the format carries
 * harmless warnings (electron/sharpInput.js). Microscope TIFFs whose tags are
 * not in ascending order were refused by sharp's default failOn 'warning'
 * (Sentry ELECTRON-2P, 2026-10-08: "Warning treated as error due to failOn
 * setting / Invalid TIFF directory; tags are not sorted in ascending order").
 * A JPEG-compressed TIFF (YCbCr) is rejected by the tiff library and goes to
 * sharp, which is the path of the report. A cut-off file is still refused
 * (failOn 'none' would turn its missing part grey without a word).
 * Palette TIFFs keep their colors and 16-bit TIFFs their contrast (Peter's
 * EDS map and BSE image, 2026-10-29: the palette index was shown as gray and
 * only the low byte of each 16-bit value was kept), in the import conversion,
 * the import preview's decoder and the tile generator (electron/tiffPixels.js).
 * Runs in Electron (scratch space needs app.getPath).
 *
 *   npm run test:user-images
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

/** Swap the first two entries of the first IFD (little-endian classic TIFF): tags no longer ascending */
function unsortTags(buf) {
  const b = Buffer.from(buf);
  if (b.toString('ascii', 0, 2) !== 'II') throw new Error('expected a little-endian TIFF');
  const ifd = b.readUInt32LE(4);
  const first = Buffer.from(b.subarray(ifd + 2, ifd + 14));
  const second = Buffer.from(b.subarray(ifd + 14, ifd + 26));
  second.copy(b, ifd + 2);
  first.copy(b, ifd + 14);
  return b;
}

/**
 * An uncompressed little-endian TIFF, one strip. samples: Uint8Array or
 * Uint16Array, one sample per pixel. colorMap (palette TIFF): 3 * 256 16-bit
 * values (all reds, then greens, then blues).
 */
function rawTiff(width, height, samples, colorMap = null) {
  const bits = samples.BYTES_PER_ELEMENT * 8;
  const pixelBytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const mapBytes = colorMap ? Buffer.from(Uint16Array.from(colorMap).buffer) : Buffer.alloc(0);
  const tags = [
    [256, 3, 1, width], // ImageWidth
    [257, 3, 1, height], // ImageLength
    [258, 3, 1, bits], // BitsPerSample
    [259, 3, 1, 1], // Compression: none
    [262, 3, 1, colorMap ? 3 : 1], // Photometric: palette or BlackIsZero
    [273, 4, 1, 0], // StripOffsets (filled below)
    [277, 3, 1, 1], // SamplesPerPixel
    [278, 3, 1, height], // RowsPerStrip
    [279, 4, 1, pixelBytes.length], // StripByteCounts
  ];
  if (colorMap) tags.push([320, 3, colorMap.length, 0]); // ColorMap (offset filled below)
  const ifdSize = 2 + tags.length * 12 + 4;
  const mapOffset = 8 + ifdSize;
  const pixelOffset = mapOffset + mapBytes.length;
  const head = Buffer.alloc(8 + ifdSize);
  head.write('II', 0, 'ascii');
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(8, 4);
  head.writeUInt16LE(tags.length, 8);
  tags.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    head.writeUInt16LE(tag, at);
    head.writeUInt16LE(type, at + 2);
    head.writeUInt32LE(count, at + 4);
    if (tag === 273) head.writeUInt32LE(pixelOffset, at + 8);
    else if (tag === 320) head.writeUInt32LE(mapOffset, at + 8);
    else if (type === 3) head.writeUInt16LE(value, at + 8);
    else head.writeUInt32LE(value, at + 8);
  });
  return Buffer.concat([head, mapBytes, pixelBytes]);
}

/** Left half one value, right half another */
function halves(width, height, Type, left, right) {
  const a = new Type(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) a[y * width + x] = x < width / 2 ? left : right;
  return a;
}

/** RGB of the pixel at (x, y) of an image file, after sharp decodes it */
async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

const near = (rgb, want, tolerance = 4) => rgb.every((v, i) => Math.abs(v - want[i]) <= tolerance);

function picture() {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .composite([{ input: Buffer.from('<svg width="1200" height="900"><circle cx="600" cy="450" r="300" fill="#ddd"/></svg>') }]);
}

async function run() {
  const { convertToScratchJPEG, getImageDimensions, isValidImage } = require('../electron/imageConverter');
  const scratchSpace = require('../electron/scratchSpace');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-images-'));
  const write = (name, buf) => { const p = path.join(dir, name); fs.writeFileSync(p, buf); return p; };

  const lzw = await picture().tiff({ compression: 'lzw' }).toBuffer();
  const jpg = await picture().jpeg().toBuffer();
  const files = {
    jpegUnsorted: write('jpeg-unsorted.tif', unsortTags(await picture().tiff({ compression: 'jpeg' }).toBuffer())),
    lzwUnsorted: write('lzw-unsorted.tif', unsortTags(lzw)),
    lzwSorted: write('lzw.tif', lzw),
    truncated: write('truncated.tif', lzw.subarray(0, Math.floor(lzw.length * 0.6))),
    cutJpeg: write('cut.jpg', jpg.subarray(0, Math.floor(jpg.length * 0.6))),
  };

  for (const key of ['jpegUnsorted', 'lzwUnsorted', 'lzwSorted']) {
    try {
      const r = await convertToScratchJPEG(files[key]);
      check(`${key}: converted at full size`, r.jpegWidth > 0 && r.originalWidth === 1200 && r.originalHeight === 900, JSON.stringify(r));
      const meta = await sharp(r.scratchPath).metadata();
      check(`${key}: scratch file is a JPEG`, meta.format === 'jpeg', meta.format);
      await scratchSpace.deleteScratchFile(r.identifier);
    } catch (e) {
      check(`${key}: converted`, false, e.message);
    }
  }

  check('unsorted TIFF: dimensions read', (await getImageDimensions(files.lzwUnsorted).catch((e) => ({ e }))).width === 1200);
  check('unsorted TIFF: valid image', await isValidImage(files.lzwUnsorted));

  let refused = false;
  try { await convertToScratchJPEG(files.truncated); } catch { refused = true; }
  check('truncated TIFF: still refused', refused);
  check('truncated TIFF: not a valid image', !(await isValidImage(files.truncated)));

  refused = false;
  try { await convertToScratchJPEG(files.cutJpeg); } catch { refused = true; }
  check('cut-off JPEG: refused, not converted with a grey part', refused);

  // Palette TIFF: index 1 = orange-brown (Peter's Al map), index 2 = blue. Read as gray the
  // indices would be nearly black (1 and 2).
  const colorMap = new Array(3 * 256).fill(0);
  const setColor = (index, [r, g, b]) => { colorMap[index] = r * 257; colorMap[256 + index] = g * 257; colorMap[512 + index] = b * 257; };
  setColor(1, [200, 120, 70]);
  setColor(2, [40, 60, 220]);
  const W = 1200;
  const H = 900;
  const palettePath = write('palette.tif', rawTiff(W, H, halves(W, H, Uint8Array, 1, 2), colorMap));
  // 16-bit gray: 30000 and 40000 are 117 and 156 in 8 bits; the low byte alone gives 48 and 64
  const gray16Path = write('gray16.tif', rawTiff(W, H, halves(W, H, Uint16Array, 30000, 40000)));
  const cases = [
    { key: 'palette TIFF', file: palettePath, left: [200, 120, 70], right: [40, 60, 220] },
    { key: '16-bit gray TIFF', file: gray16Path, left: [117, 117, 117], right: [156, 156, 156] },
  ];

  for (const c of cases) {
    // Import conversion (New Micrograph, Batch Import, Add Sibling)
    try {
      const r = await convertToScratchJPEG(c.file);
      const left = await pixelAt(r.scratchPath, Math.round(r.jpegWidth / 4), Math.round(r.jpegHeight / 2));
      const right = await pixelAt(r.scratchPath, Math.round((r.jpegWidth * 3) / 4), Math.round(r.jpegHeight / 2));
      check(`${c.key}: import keeps the left half ${c.left}`, near(left, c.left), `got ${left}`);
      check(`${c.key}: import keeps the right half ${c.right}`, near(right, c.right), `got ${right}`);
      await scratchSpace.deleteScratchFile(r.identifier);
    } catch (e) {
      check(`${c.key}: import converted`, false, e.message);
    }

    // Decoder of the import preview and the tile generator (RGBA)
    try {
      const tileGenerator = require('../electron/tileGenerator');
      const { width, data } = await tileGenerator.decodeTiff(c.file);
      const rgbaAt = (x, y) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3));
      check(`${c.key}: tile decoder left half`, near(rgbaAt(10, 10), c.left, 0), `got ${rgbaAt(10, 10)}`);
      check(`${c.key}: tile decoder right half`, near(rgbaAt(W - 10, 10), c.right, 0), `got ${rgbaAt(W - 10, 10)}`);
      check(`${c.key}: tile decoder opaque`, data[3] === 255, `alpha ${data[3]}`);
    } catch (e) {
      check(`${c.key}: tile decoder decoded`, false, e.message);
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
