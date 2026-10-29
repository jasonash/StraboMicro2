/**
 * Overlapping spots (src/utils/spotStacking.ts; Peter, 2026-10-29): larger
 * polygons are drawn under smaller ones, lines and points on top, ties keep
 * the saved order; the spots under a point are found top first.
 *
 *   npm run test:spot-stacking
 */

import { spotArea, spotContains, spotDrawOrder, spotsAt } from '../src/utils/spotStacking.ts';
import type { Spot } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

/** A square polygon spot in legacy points */
const square = (id: string, x: number, y: number, size: number) => ({
  id, name: id, geometryType: 'polygon',
  points: [{ X: x, Y: y }, { X: x + size, Y: y }, { X: x + size, Y: y + size }, { X: x, Y: y + size }],
}) as unknown as Spot;
const point = (id: string, x: number, y: number) => ({ id, name: id, geometryType: 'point', points: [{ X: x, Y: y }] }) as unknown as Spot;
const line = (id: string, coords: number[][]) => ({ id, name: id, geometry: { type: 'LineString', coordinates: coords } }) as unknown as Spot;
const geoSquare = (id: string, x: number, y: number, size: number) => ({
  id, name: id, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] },
}) as unknown as Spot;

eq('area of a legacy square', spotArea(square('a', 0, 0, 10)), 100);
eq('area of a GeoJSON square (closed ring)', spotArea(geoSquare('g', 5, 5, 4)), 16);
eq('point and line have no area', [spotArea(point('p', 1, 1)), spotArea(line('l', [[0, 0], [5, 5]]))], [0, 0]);

const small = square('small', 40, 40, 10);
const big = square('big', 0, 0, 100);
const mid = geoSquare('mid', 30, 30, 40);
const dot = point('dot', 45, 45);
const crack = line('crack', [[0, 50], [100, 50]]);
const ids = (spots: Spot[]) => spots.map((s) => s.id);
eq('draw order: big, mid, small polygons, then line, then point', ids(spotDrawOrder([dot, small, crack, big, mid])), ['big', 'mid', 'small', 'crack', 'dot']);
eq('the small spot drawn first is still drawn on top of the big one', ids(spotDrawOrder([small, big])), ['big', 'small']);
const twinA = square('twinA', 0, 0, 10);
const twinB = square('twinB', 5, 0, 10);
eq('same area: saved order kept', ids(spotDrawOrder([twinB, twinA])), ['twinB', 'twinA']);
const input = [small, big];
spotDrawOrder(input);
eq('input not changed', ids(input), ['small', 'big']);

eq('inside polygon', spotContains(big, 50, 50, 1), true);
eq('outside polygon', spotContains(small, 20, 20, 1), false);
eq('on the edge within tolerance', spotContains(small, 40.5, 30 + 10.5, 1), true);
eq('point within tolerance', [spotContains(dot, 47, 45, 3), spotContains(dot, 49, 45, 3)], [true, false]);
eq('line within tolerance, not past its end', [spotContains(crack, 60, 51, 2), spotContains(crack, 103, 50, 2)], [true, false]);

eq('spots at the center, top first', ids(spotsAt([big, small, mid, dot, crack], 45, 45, 1)), ['dot', 'small', 'mid', 'big']);
eq('spots at a corner of the big one only', ids(spotsAt([big, small, mid], 5, 5, 1)), ['big']);
eq('nothing there', spotsAt([small], 500, 500, 1), []);
eq('a spot without coordinates is never hit', spotsAt([{ id: 'x', name: 'x', geometryType: 'polygon' } as unknown as Spot], 0, 0, 5), []);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
