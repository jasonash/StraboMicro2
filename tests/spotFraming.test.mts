/**
 * Go to spot framing (src/utils/spotFraming.ts): a spot's extent, and the
 * zoom + pan that center it and make it fill about a third of the view.
 *
 *   npm run test:spot-framing
 */

import { spotBounds, frameSpot, wholeImageZoom, SPOT_FILL, POINT_ZOOM_FACTOR } from '../src/utils/spotFraming.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// Extent
const poly = { geometry: { type: 'Polygon' as const, coordinates: [[[100, 200], [300, 200], [300, 260], [100, 200]]] } };
check('polygon bounds', JSON.stringify(spotBounds(poly)) === '{"minX":100,"minY":200,"maxX":300,"maxY":260}', spotBounds(poly));
const line = { geometry: { type: 'LineString' as const, coordinates: [[10, 50], [90, 50]] } };
check('line bounds', JSON.stringify(spotBounds(line)) === '{"minX":10,"minY":50,"maxX":90,"maxY":50}', spotBounds(line));
const point = { geometry: { type: 'Point' as const, coordinates: [40, 70] } };
check('point bounds', JSON.stringify(spotBounds(point)) === '{"minX":40,"minY":70,"maxX":40,"maxY":70}', spotBounds(point));
const legacy = { geometry: null, points: [{ X: 5, Y: 6 }, { x: 15, y: 26 }] };
check('legacy points (X/Y and x/y)', JSON.stringify(spotBounds(legacy)) === '{"minX":5,"minY":6,"maxX":15,"maxY":26}', spotBounds(legacy));
check('geometry wins over points (as SpotRenderer)', spotBounds({ ...point, points: [{ X: 999, Y: 999 }] })?.maxX === 40);
check('no coordinates: null', spotBounds({ geometry: null, points: [] }) === null);
check('non-finite coordinates are left out', spotBounds({ geometry: { type: 'Point' as const, coordinates: [NaN, 1] } }) === null);

// Framing
const view = { width: 1000, height: 800 };
const image = { width: 8000, height: 6000 };
const whole = wholeImageZoom(view, image);
check('whole-image zoom as fitToScreen', near(whole, Math.min(960 / 8000, 760 / 6000, 1)), whole);

const b = spotBounds(poly)!;
const f = frameSpot(b, view, image, 20)!;
check('polygon: larger side fills a third of the view', near(f.zoom, Math.min((1000 * SPOT_FILL) / 200, (800 * SPOT_FILL) / 60)), f);
check('polygon: centered', near(f.position.x + 200 * f.zoom, 500) && near(f.position.y + 230 * f.zoom, 400), f);

const fl = frameSpot(spotBounds(line)!, view, image, 20)!;
check('horizontal line: width alone decides', near(fl.zoom, (1000 * SPOT_FILL) / 80), fl);

const fp = frameSpot(spotBounds(point)!, view, image, 20)!;
check('point: a fixed close-up of the whole-image view', near(fp.zoom, whole * POINT_ZOOM_FACTOR), fp);
check('point: centered', near(fp.position.x + 40 * fp.zoom, 500) && near(fp.position.y + 70 * fp.zoom, 400), fp);

const tiny = frameSpot({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, view, image, 20)!;
check('a tiny spot stops at the maximum zoom', tiny.zoom === 20, tiny);

const huge = frameSpot({ minX: 0, minY: 0, maxX: 8000, maxY: 6000 }, view, image, 20)!;
check('a spot as big as the image never zooms out past the whole-image view', near(huge.zoom, whole), huge);

check('no view size: null', frameSpot(b, { width: 0, height: 800 }, image, 20) === null);
check('no image size: null', frameSpot(b, view, { width: 0, height: 0 }, 20) === null);

console.log(`\nspot framing: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
