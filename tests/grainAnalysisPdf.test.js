/**
 * Grain Size Analysis PDF layout (electron/grainAnalysisPdf.js, Claire #64):
 * a typical analysis fits on one page, a long By Mineral table flows onto a
 * second, a bad image is skipped instead of failing.
 *
 *   npm run test:grain-analysis-pdf      (KEEP_PDF=1 keeps the files and prints where)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { writeGrainAnalysisPdf, pngFromDataUrl } = require('../electron/grainAnalysisPdf');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/** Pages in a PDFKit file (uncompressed page objects) */
function pageCount(file) {
  const text = fs.readFileSync(file).toString('latin1');
  return (text.match(/\/Type \/Page\b/g) || []).length;
}

async function png(width, height, color) {
  const buf = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return `data:image/png;base64,${buf.toString('base64')}`;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grain-pdf-'));
  const histogramPng = await png(1560, 900, '#9ec5fe');
  const rosePng = await png(840, 840, '#a5d6a7');
  const mineral = (i) => ({ mineral: `Mineral ${i}`, count: String(10 + i), mean: '120.5 µm', aspectRatio: '1.8', orientation: '42°' });
  const content = {
    title: 'Grain Size Analysis: Quartz, D2 fabric',
    details: ['Project: Test', 'Scope: Current micrograph: Thin section 1', 'Polygon spots: 48 · Rock type: Metamorphic · Exported now'],
    histogramPng,
    rosePng,
    roseCaption: ['Rose diagram of the long-axis orientations ... 0–180° and each sector is mirrored across the center.', 'Equal-area rose ...', 'Red line ... ± ...'],
    roseNote: 'Polygons from 2 reference micrographs are combined.',
    stats: [
      { heading: 'Summary', rows: [['Grains', '48'], ['Total Area', '0.123 mm²'], ['Coverage', '12.0%']] },
      { heading: 'Size (Equiv. Diameter)', rows: [['Mean', '120.5 µm'], ['Median', '110.0 µm'], ['Std Dev', '30.1 µm'], ['Range', '50.0 µm - 300.0 µm'], ['Sorting', '0.45 (well sorted)'], ['Skewness', '+0.20']] },
      { heading: 'Shape', rows: [['Mean Aspect Ratio', '1.80'], ['Mean Circularity', '0.71'], ['Preferred Orientation', '42° ± 18°']] },
    ],
    minerals: [1, 2, 3, 4, 5, 6, 7, 8].map(mineral),
  };

  const one = path.join(dir, 'typical.pdf');
  await writeGrainAnalysisPdf(one, content);
  check('typical analysis written', fs.statSync(one).size > 1000);
  check('typical analysis fits on one page', pageCount(one) === 1, `pages: ${pageCount(one)}`);

  const long = path.join(dir, 'many-minerals.pdf');
  await writeGrainAnalysisPdf(long, { ...content, minerals: Array.from({ length: 40 }, (_, i) => mineral(i)) });
  check('40 minerals flow onto a second page', pageCount(long) === 2, `pages: ${pageCount(long)}`);

  const noRose = path.join(dir, 'no-rose.pdf');
  await writeGrainAnalysisPdf(noRose, { ...content, rosePng: null, histogramPng: 'not a data url', minerals: [] });
  check('no rose, bad histogram image, no minerals: still written', pageCount(noRose) === 1);

  check('data URL decoded', pngFromDataUrl(histogramPng)?.length > 0);
  check('other text is not an image', pngFromDataUrl('data:image/jpeg;base64,AAAA') === null && pngFromDataUrl(null) === null);

  if (process.env.KEEP_PDF) console.log(`PDFs kept in ${dir}`);
  else fs.rmSync(dir, { recursive: true, force: true });

  console.log(failures === 0 ? `\nALL PASSED (${passes} checks)` : `\n${failures} FAILED, ${passes} passed`);
  process.exit(failures === 0 ? 0 : 1);
})();
