/**
 * View > Show Parent Spots (src/utils/parentSpots.ts; Peter, 2026-10-29): the
 * spots of every micrograph above the one in the viewer, mapped into its
 * pixels through the placements (scaled rectangle with rotation, 3-point
 * registration), level by level; a point placement stops the chain.
 *
 *   npm run test:parent-spots
 */

import { ancestorSpots, childToParentMatrix } from '@/utils/parentSpots';
import type { MicrographMetadata, Spot } from '@/types/project-types';

let failures = 0;
let passes = 0;
function near(label: string, actual: number[] | undefined, expected: number[]) {
  const ok = !!actual && actual.length === expected.length && actual.every((v, i) => Math.abs(v - expected[i]) < 1e-6);
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

const pointSpot = (id: string, x: number, y: number) => ({ id, name: id, geometryType: 'point', points: [{ X: x, Y: y }] }) as unknown as Spot;
const firstPoint = (s: Spot | undefined) => (s?.points?.[0] ? [s.points[0].X ?? 0, s.points[0].Y ?? 0] : undefined);

const ref = { id: 'ref', name: 'Reference', imageWidth: 2000, imageHeight: 1500, scalePixelsPerCentimeter: 40000, spots: [pointSpot('r1', 300, 250), pointSpot('r2', 300, 450)] } as unknown as MicrographMetadata;
// 800 x 600 at twice the reference's px/cm (so half its size on the reference), top-left at (100, 100)
const bse = { id: 'bse', name: 'BSE 1', parentID: 'ref', imageWidth: 800, imageHeight: 600, scalePixelsPerCentimeter: 80000, offsetInParent: { X: 100, Y: 100 }, rotation: 0, spots: [pointSpot('b1', 400, 300)] } as unknown as MicrographMetadata;
const byId = (list: MicrographMetadata[]) => (id: string) => list.find((m) => m.id === id);

// Rectangle, no rotation: child px (0,0) -> (100,100), (800,600) -> (500,400)
const m = childToParentMatrix(bse, ref);
near('rectangle matrix', m ?? undefined, [0.5, 0, 100, 0, 0.5, 100]);
const onBse = ancestorSpots(bse, byId([ref, bse]));
near('reference spot (300,250) on BSE 1 at (400,300)', firstPoint(onBse.find((p) => p.source.id === 'r1')?.spot), [400, 300]);
eq('labelled with its micrograph', onBse.map((p) => [p.source.id, p.sourceMicrographName]), [['r1', 'Reference'], ['r2', 'Reference']]);

// Rotated 90° clockwise about the center (300,250 on the reference): child (800,300) -> (300,450)
const turned = { ...bse, rotation: 90 } as MicrographMetadata;
near('rotated: reference (300,450) is the right-middle of BSE 1', firstPoint(ancestorSpots(turned, byId([ref, turned])).find((p) => p.source.id === 'r2')?.spot), [800, 300]);

// 3-point registration: parent = 2 * child + (10, 20)
const affine = { ...bse, id: 'aff', placementType: 'affine', affineMatrix: [2, 0, 10, 0, 2, 20], offsetInParent: undefined } as unknown as MicrographMetadata;
near('affine: reference (300,250) -> (145,115)', firstPoint(ancestorSpots(affine, byId([ref, affine])).find((p) => p.source.id === 'r1')?.spot), [145, 115]);

// Two levels: a map covering BSE 1 exactly (same px, same scale) sees BSE 1's spots and the reference's
const map = { id: 'map', name: 'Map Al', parentID: 'bse', imageWidth: 800, imageHeight: 600, scalePixelsPerCentimeter: 80000, offsetInParent: { X: 0, Y: 0 }, rotation: 0, spots: [] } as unknown as MicrographMetadata;
const onMap = ancestorSpots(map, byId([ref, bse, map]));
eq('two levels, nearest first', onMap.map((p) => p.source.id), ['b1', 'r1', 'r2']);
near('BSE 1 spot at the same pixel on the map', firstPoint(onMap[0].spot), [400, 300]);
near('reference spot through both levels', firstPoint(onMap[1].spot), [400, 300]);

// A point placement has no footprint: nothing above can be mapped
const pointPlaced = { ...map, offsetInParent: undefined, pointInParent: { X: 5, Y: 5 } } as unknown as MicrographMetadata;
eq('point placement: no parent spots', ancestorSpots(pointPlaced, byId([ref, bse, pointPlaced])).length, 0);
eq('reference itself: none', ancestorSpots(ref, byId([ref])).length, 0);

// A secondary sibling (XPL) is placed where its PPL is
const ppl = { ...bse, id: 'ppl', siblingImageId: 'xpl', isPrimarySibling: true, spots: [] } as unknown as MicrographMetadata;
const xpl = { id: 'xpl', name: 'XPL', parentID: 'ref', imageWidth: 800, imageHeight: 600, siblingImageId: 'ppl', isPrimarySibling: false, spots: [] } as unknown as MicrographMetadata;
near('XPL uses its PPL placement', firstPoint(ancestorSpots(xpl, byId([ref, ppl, xpl])).find((p) => p.source.id === 'r1')?.spot), [400, 300]);
eq('original spots untouched', firstPoint(ref.spots?.[0]), [300, 250]);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
