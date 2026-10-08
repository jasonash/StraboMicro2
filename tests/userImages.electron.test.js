/**
 * Image files people bring in are converted even when the format carries
 * harmless warnings (electron/sharpInput.js). Microscope TIFFs whose tags are
 * not in ascending order were refused by sharp's default failOn 'warning'
 * (Sentry ELECTRON-2P, 2026-10-08: "Warning treated as error due to failOn
 * setting / Invalid TIFF directory; tags are not sorted in ascending order").
 * A JPEG-compressed TIFF (YCbCr) is rejected by the tiff library and goes to
 * sharp, which is the path of the report. A cut-off file is still refused
 * (failOn 'none' would turn its missing part grey without a word).
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
