/**
 * "Same area as parent" (src/utils/copySizePlacement.ts; Peter, 2026-10-29):
 * a child covers its parent exactly at offset 0, rotation 0, with the scale
 * that makes its drawn width the parent's width; only for matching
 * proportions and a parent with a scale.
 *
 *   npm run test:parent-area
 */

import { computeParentAreaPlacement, parentAreaUnavailableReason } from '@/utils/copySizePlacement';
import type { MicrographMetadata } from '@/types/project-types';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

const bse = { id: 'bse', name: 'BSE', imageWidth: 3072, imageHeight: 2048, scalePixelsPerCentimeter: 60000 } as MicrographMetadata;

// Same pixel size: same scale, drawn exactly over the parent
const same = computeParentAreaPlacement(bse, 3072, 2048);
eq('offset 0, rotation 0', [same?.offsetInParent, same?.rotation], [{ X: 0, Y: 0 }, 0]);
eq('same size: same scale', same?.scalePixelsPerCentimeter, 60000);
// Drawn width on the parent = child px * parentScale / childScale
const drawnWidth = (w: number, s: number) => w * (bse.scalePixelsPerCentimeter as number) / s;
eq('same size covers the parent width', drawnWidth(3072, same?.scalePixelsPerCentimeter as number), 3072);

// An EDS map at a quarter of the pixels: a quarter of the scale, still the parent's width
const map = computeParentAreaPlacement(bse, 768, 512);
eq('smaller map: scale by width', map?.scalePixelsPerCentimeter, 15000);
eq('smaller map covers the parent width', drawnWidth(768, map?.scalePixelsPerCentimeter as number), 3072);
eq('other placements cleared', [map?.pointInParent, map?.placementType, map?.affineMatrix, map?.xOffset], [undefined, undefined, undefined, undefined]);
eq('legacy fields present to clear them', ['pointInParent', 'placementType', 'affineMatrix', 'xOffset'].every((k) => map !== null && k in map), true);

eq('usable', parentAreaUnavailableReason(bse, 768, 512), null);
eq('proportions differ', parentAreaUnavailableReason(bse, 1000, 1000), "Its proportions (1000 × 1000) differ from the parent's (3072 × 2048).");
eq('no placement when proportions differ', computeParentAreaPlacement(bse, 1000, 1000), null);
eq('parent without scale', parentAreaUnavailableReason({ ...bse, scalePixelsPerCentimeter: undefined }, 768, 512), 'The parent micrograph has no scale yet.');
eq('no parent', parentAreaUnavailableReason(null, 768, 512), 'This micrograph has no parent.');
eq('unknown child size', parentAreaUnavailableReason(bse, 0, 512), 'The image sizes are not known.');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
