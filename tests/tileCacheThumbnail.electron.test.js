/**
 * A tile cache with metadata.json but no thumbnail.jpg (Sentry ELECTRON-3C,
 * 2026-11-24). metadata.json is written before the thumbnail, so a first load
 * that was cut short left such a cache; isCacheValid called it valid, the
 * viewer's thumbnail request failed, and the micrograph stayed blank on every
 * open. Checks, with the real tileCache + tileGenerator in a scratch userData:
 * a complete cache is a hit; with the thumbnail removed it is a miss, and
 * processImage / processImageComplete rebuild the thumbnail.
 * Runs in Electron (tileCache uses app.getPath).
 *
 *   npm run test:tile-cache-thumbnail
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

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strabo-thumb-test-'));
  // Before tileCache is required: it reads userData in its constructor
  app.setPath('userData', path.join(dir, 'userData'));
  const tileCache = require('../electron/tileCache');
  const tileGenerator = require('../electron/tileGenerator');

  const imagePath = path.join(dir, 'micrograph.png');
  await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .png().toFile(imagePath);

  // First load builds the cache
  const first = await tileGenerator.processImage(imagePath);
  check('first load is a cache miss', first.fromCache === false);
  const thumbPath = tileCache.getThumbnailPath(first.hash);
  check('first load writes the thumbnail', fs.existsSync(thumbPath));
  check('complete cache is valid', (await tileCache.isCacheValid(imagePath)).exists === true);
  check('second load is a cache hit', (await tileGenerator.processImage(imagePath)).fromCache === true);

  // The Sentry case: metadata.json kept, thumbnail.jpg gone
  fs.rmSync(thumbPath);
  check('metadata.json still there', fs.existsSync(path.join(tileCache.getCacheDir(first.hash), 'metadata.json')));
  check('cache without a thumbnail is not valid', (await tileCache.isCacheValid(imagePath)).exists === false);

  const again = await tileGenerator.processImage(imagePath);
  check('viewer load rebuilds it (cache miss)', again.fromCache === false);
  check('same hash after rebuild', again.hash === first.hash);
  check('thumbnail is back', fs.existsSync(thumbPath));
  const buffer = await tileCache.loadThumbnail(first.hash);
  check('thumbnail loads (what image:load-thumbnail returns)', !!buffer && buffer.length > 0);
  check('valid again after rebuild', (await tileCache.isCacheValid(imagePath)).exists === true);

  // Preparation / rebuild path (processImageComplete) also repairs it
  fs.rmSync(thumbPath);
  const complete = await tileGenerator.processImageComplete(imagePath);
  check('processImageComplete rebuilds a cache without a thumbnail', complete.fromCache === false && fs.existsSync(thumbPath));

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
