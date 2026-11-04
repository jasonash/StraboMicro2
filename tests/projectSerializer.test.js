/**
 * project.json keeps fields this version does not know (electron/projectSerializer.js
 * withUnknownFields, 2026-10-13): at every level, on save and on load, so an
 * older copy of the app no longer erases newer fields of a synced project.
 * Fields the app only uses while running (NEVER_SAVE) are never written;
 * known fields are written exactly as before.
 *
 *   npm run test:project-serializer
 */

const s = require('../electron/projectSerializer');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
const json = (x) => JSON.parse(JSON.stringify(x));
const save = (p) => json(s.serializeToLegacyFormat(p));
const load = (j) => s.deserializeFromLegacyFormat(json(j));

/** A project.json with an unknown field at every level */
const file = () => ({
  id: 'P', name: 'Proj', date: '2026-01-01T00:00:00.000Z', modifiedTimestamp: '2026-01-01T00:00:00.000Z',
  futureProjectField: { a: 1 },
  datasets: [{
    id: 'D', name: 'Data', date: 'd', modifiedTimestamp: 'm', futureDatasetField: 'x',
    samples: [{
      id: 'S', label: 'Sample', futureSampleField: [1, 2],
      micrographs: [{
        id: 'M', name: 'Micro', width: 100, height: 50, futureMicrographField: true,
        spots: [{ id: 'X', name: 'Spot', geometryType: 'point', points: [{ X: 1, Y: 2 }], modifiedTimestamp: 5, futureSpotField: 0 }],
      }],
    }],
  }],
});

// Unknown fields survive load and save at every level
const loaded = load(file());
const m = loaded.datasets[0].samples[0].micrographs[0];
check('load keeps the project field', JSON.stringify(loaded.futureProjectField) === '{"a":1}');
check('load keeps the dataset field', loaded.datasets[0].futureDatasetField === 'x');
check('load keeps the sample field', JSON.stringify(loaded.datasets[0].samples[0].futureSampleField) === '[1,2]');
check('load keeps the micrograph field', m.futureMicrographField === true);
check('load keeps the spot field (falsy 0 too)', m.spots[0].futureSpotField === 0);

const saved = save(loaded);
const sm = saved.datasets[0].samples[0].micrographs[0];
check('save keeps the project field', JSON.stringify(saved.futureProjectField) === '{"a":1}');
check('save keeps the dataset field', saved.datasets[0].futureDatasetField === 'x');
check('save keeps the sample field', JSON.stringify(saved.datasets[0].samples[0].futureSampleField) === '[1,2]');
check('save keeps the micrograph field', sm.futureMicrographField === true);
check('save keeps the spot field', sm.spots[0].futureSpotField === 0);
check('a second round trip changes nothing', JSON.stringify(save(load(saved))) === JSON.stringify(saved));

// Known fields first, in their old order; unknown after
const keys = Object.keys(saved);
check('known project fields keep their order', keys.indexOf('id') === 0 && keys.indexOf('name') === 1, keys);
check('unknown project field comes after the known ones',
  keys.indexOf('futureProjectField') > keys.indexOf('grainAnalysisSelectedSpotIds'), keys);

// Known values are written exactly as before (normalized by the known rules, not overwritten by the source)
check('known normalization still applies (gpsDatum default)', saved.gpsDatum === 'WGS84');
check('known normalization still applies (instrumentsUsed blank)', saved.instrumentsUsed === '');
check('micrograph width/height still written as imageWidth/imageHeight too', sm.imageWidth === 100 && sm.imageHeight === 50);

// NEVER_SAVE: runtime-only fields are not written
const app = load(file());
app.datasets[0].samples[0].micrographs[0].imagePath = 'M';
check('micrograph imagePath (runtime) is not saved', !('imagePath' in save(app).datasets[0].samples[0].micrographs[0]));
for (const [level, names] of Object.entries(s.NEVER_SAVE)) {
  for (const name of names) {
    const p = load(file());
    const target = { project: p, dataset: p.datasets[0], sample: p.datasets[0].samples[0],
      micrograph: p.datasets[0].samples[0].micrographs[0], spot: p.datasets[0].samples[0].micrographs[0].spots[0] }[level];
    target[name] = 'runtime value';
    const out = save(p);
    const written = { project: out, dataset: out.datasets[0], sample: out.datasets[0].samples[0],
      micrograph: out.datasets[0].samples[0].micrographs[0], spot: out.datasets[0].samples[0].micrographs[0].spots[0] }[level];
    check(`NEVER_SAVE ${level}.${name} is not written`, written[name] !== 'runtime value', written[name]);
  }
}

// LOAD_IGNORE: written-but-not-read fields stay out of the app's project
check('instrumentsUsed is not loaded', !('instrumentsUsed' in load({ ...file(), instrumentsUsed: 'old' })));
check('projectLocation is not loaded', !('projectLocation' in load({ ...file(), projectLocation: '/old/path' })));

// Empty values: undefined and functions are never written
const withEmpty = load(file());
withEmpty.someUndefined = undefined;
withEmpty.someFunction = () => 1;
const outEmpty = save(withEmpty);
check('undefined unknown field not written', !('someUndefined' in outEmpty));
check('function unknown field not written', !('someFunction' in outEmpty));

// Decided 2026-10-13 (lost on every reload before): kept
{
  const p = load(file());
  const mic = p.datasets[0].samples[0].micrographs[0];
  mic.controlPoints = [{ source: { x: 1, y: 2 }, target: { x: 3, y: 4 } }];
  mic.imageFilename = 'thin-section-01.tif';
  Object.assign(mic.spots[0], { gridPosition: { row: 2, col: 3 }, generationTimestamp: '2026-10-13T00:00:00Z',
    generationSettings: { gridType: 'regular', pointCount: 100 } });
  p.datasets[0].samples[0].name = 'copy of label';
  const back = load(save(p));
  const bm = back.datasets[0].samples[0].micrographs[0];
  check('micrograph controlPoints kept (affine registration)', JSON.stringify(bm.controlPoints) === JSON.stringify(mic.controlPoints), bm.controlPoints);
  check('micrograph imageFilename kept', bm.imageFilename === 'thin-section-01.tif');
  check('spot point-count provenance kept', JSON.stringify([bm.spots[0].gridPosition, bm.spots[0].generationTimestamp, bm.spots[0].generationSettings]) ===
    JSON.stringify([{ row: 2, col: 3 }, '2026-10-13T00:00:00Z', { gridType: 'regular', pointCount: 100 }]));
  check('sample name (a copy of label) not saved', !('name' in save(p).datasets[0].samples[0]));
}

// The Default Spot Name (the field that exposed this) round-trips
check('spotNamePattern round-trips', save(load({ ...file(), spotNamePattern: 'Grain {n}' })).spotNamePattern === 'Grain {n}');

// Custom User Data (docs/custom-user-data-design.md): values on spots, column order on the project
{
  const p = load({ ...file(), customUserDataColumns: ['Mg#', '', 'Age (Ma)'] });
  check('customUserDataColumns: empty names dropped on load', JSON.stringify(p.customUserDataColumns) === JSON.stringify(['Mg#', 'Age (Ma)']), p.customUserDataColumns);
  p.datasets[0].samples[0].micrographs[0].spots[0].customUserData = { 'Mg#': '0.820', 'Age (Ma)': '', Odd: 12 };
  const out = save(p);
  check('customUserDataColumns saved', JSON.stringify(out.customUserDataColumns) === JSON.stringify(['Mg#', 'Age (Ma)']));
  const saved = out.datasets[0].samples[0].micrographs[0].spots[0].customUserData;
  check('customUserData saved as text, empty values dropped', JSON.stringify(saved) === JSON.stringify({ 'Mg#': '0.820', Odd: '12' }), saved);
  const back = load(out).datasets[0].samples[0].micrographs[0].spots[0].customUserData;
  check('customUserData round-trips', JSON.stringify(back) === JSON.stringify({ 'Mg#': '0.820', Odd: '12' }), back);
  const none = load(file());
  none.customUserDataColumns = [];
  none.datasets[0].samples[0].micrographs[0].spots[0].customUserData = { a: '' };
  const outNone = save(none);
  check('empty column list not saved', !('customUserDataColumns' in outNone));
  check('empty customUserData not saved', !('customUserData' in outNone.datasets[0].samples[0].micrographs[0].spots[0]));
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
