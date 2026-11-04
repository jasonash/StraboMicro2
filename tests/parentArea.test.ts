/**
 * "Same area as parent" (src/utils/copySizePlacement.ts; Peter, 2026-10-29):
 * a child covers its parent exactly at offset 0, rotation 0, with the scale
 * that makes its drawn width the parent's width; only for matching
 * proportions and a parent with a scale. "Place unplaced children like...":
 * the placed children that can be the model, and why a child cannot copy it.
 *
 *   npm run test:parent-area
 */

import {
  computeParentAreaPlacement,
  copyPlacementUnavailableReason,
  describeScaleSource,
  listPlacedChildren,
  listScaleSources,
  parentAreaUnavailableReason,
} from '@/utils/copySizePlacement';
import type { MicrographMetadata, ProjectMetadata } from '@/types/project-types';

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

// Place unplaced children like...
const rect = { id: 'si', name: 'Map Si', parentID: 'bse', imageWidth: 800, imageHeight: 600, offsetInParent: { X: 1, Y: 2 }, scalePixelsPerCentimeter: 8 } as MicrographMetadata;
const pointPlaced = { id: 'pt', name: 'Spot photo', parentID: 'bse', imageWidth: 100, imageHeight: 900, pointInParent: { X: 5, Y: 5 } } as MicrographMetadata;
const unplacedChild = { id: 'al', name: 'Map Al', parentID: 'bse', imageWidth: 800, imageHeight: 600 } as MicrographMetadata;
const elsewhere = { id: 'x', name: 'Other', parentID: 'other', imageWidth: 800, imageHeight: 600, offsetInParent: { X: 0, Y: 0 } } as MicrographMetadata;
const project = { id: 'p', datasets: [{ samples: [{ micrographs: [bse, rect, pointPlaced, unplacedChild, elsewhere] }] }] } as unknown as ProjectMetadata;
eq('placed children of the parent only', listPlacedChildren(project, 'bse').map((c) => [c.id, c.placementType]), [['si', 'rectangle'], ['pt', 'point']]);
eq('no parent: none', listPlacedChildren(project, null), []);
eq('same proportions: can copy', copyPlacementUnavailableReason(rect, 400, 300), null);
eq('other proportions', copyPlacementUnavailableReason(rect, 500, 500), "Its proportions (500 × 500) differ from Map Si's (800 × 600).");
eq('a point placement: any proportions', copyPlacementUnavailableReason(pointPlaced, 500, 500), null);
eq('no model', copyPlacementUnavailableReason(null, 500, 500), 'Choose a micrograph to copy.');
eq('model not placed', copyPlacementUnavailableReason(unplacedChild, 800, 600), 'Map Al has no placement to copy.');

// Copy scale from an existing micrograph
eq('scale sources: every micrograph with a scale, not the excluded one', listScaleSources(project, 'si').map((x) => [x.id, x.scale]), [['bse', 60000]]);
eq('scale sources include placed children', listScaleSources(project, null).map((x) => x.id), ['bse', 'si']);
eq('label in px/um', describeScaleSource({ id: 'a', name: 'Ol-3', width: 2048, height: 1536, scale: 12500 }), 'Ol-3 (2048 × 1536, 1.25 px/μm)');
eq('label for a coarse scale', describeScaleSource({ id: 'b', name: 'Scan', width: 100, height: 100, scale: 1234 }), 'Scan (100 × 100, 0.123 px/μm)');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
