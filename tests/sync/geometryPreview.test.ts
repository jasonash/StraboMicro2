/**
 * Unit tests of the sync dialog's geometry previews (src/utils/geometryPreview.ts).
 *
 *   npm run test:geometry-preview
 */

import { placementOutline, previewCrop, shapePoints } from '@/utils/geometryPreview';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

// Shapes
{
  const s = shapePoints({ geometryType: 'polygon', points: [{ X: 1, Y: 2 }, { X: 3, Y: 4 }, { X: 5, Y: 1 }] });
  check('polygon points', s.kind === 'polygon' && s.points.length === 3 && s.points[1].x === 3, s);
  check('one point is a point', shapePoints({ geometryType: 'polygon', points: [{ X: 1, Y: 2 }] }).kind === 'point');
  check('LineString is a line', shapePoints({ geometryType: 'LineString', points: [{ X: 0, Y: 0 }, { X: 1, Y: 1 }] }).kind === 'line');
  const g = shapePoints({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 3]]] } });
  check('GeoJSON polygon coordinates', g.kind === 'polygon' && g.points.length === 3 && g.points[2].y === 3, g);
  check('no shape', shapePoints({}).points.length === 0);
}

// Placements
{
  // 100 x 50 image at 200 px/cm on a parent at 100 px/cm: half size, top left at (10, 20)
  const r = placementOutline({ width: 100, height: 50, scalePixelsPerCentimeter: 200, offsetInParent: { X: 10, Y: 20 } }, 100);
  check('rectangle: scaled and placed', near(r[0].x, 10) && near(r[0].y, 20) && near(r[2].x, 60) && near(r[2].y, 45), r);
  const rot = placementOutline({ width: 100, height: 50, scalePixelsPerCentimeter: 100, pointInParent: { X: 0, Y: 0 }, rotation: 90 }, 100);
  check('point placement, rotated 90 about the center', near(rot[0].x, 25) && near(rot[0].y, -50), rot);
  const a = placementOutline({ width: 10, height: 10, placementType: 'affine', affineMatrix: [2, 0, 5, 0, 3, 7] }, 100);
  check('affine: matrix on the corners', near(a[2].x, 25) && near(a[2].y, 37), a);
  check('no placement', placementOutline({ width: 10, height: 10 }, 100).length === 0);
}

// Crop
{
  const img = { width: 4000, height: 3000 };
  const c = previewCrop([[{ x: 1000, y: 1000 }, { x: 1200, y: 1100 }], [{ x: 1300, y: 1000 }]], img, 1.5);
  check('crop holds both sides with a margin', c.x < 1000 && c.x + c.width > 1300 && c.y < 1000 && c.y + c.height > 1100, c);
  check('crop has the preview aspect', near(c.width / c.height, 1.5), c);
  const p = previewCrop([[{ x: 5, y: 5 }]], img, 1.5);
  check('a point near the corner: some context, kept inside', p.x === 0 && p.y === 0 && p.width >= 40, p);
  const w = previewCrop([], img, 1.5);
  check('nothing to show: the whole image', near(w.width, 4500) && near(w.height, 3000), w);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
