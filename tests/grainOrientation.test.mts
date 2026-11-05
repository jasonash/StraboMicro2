/**
 * Grain long-axis orientation (src/utils/grainMetrics.ts) and the statistics the
 * Grain Size Analysis rose diagram is built from (src/services/grainAnalysis/statistics.ts).
 *
 * Convention: counterclockwise from the image horizontal, 0-180 (ImageJ Fit Ellipse):
 * horizontal = 0, "/" as seen on screen = 45, vertical = 90, "\" = 135.
 * Spot coordinates are image pixels with y growing downward.
 *
 *   npm run test:grain-orientation
 */

import { calculateEllipseMetrics } from '../src/utils/grainMetrics.ts';
import { calculateCircularMean, generateRoseSectors } from '../src/services/grainAnalysis/statistics.ts';
import { countAxis, roseRings, equalAreaRadius, sizeTickLabels, niceTicks } from '../src/utils/countTicks.ts';

let failures = 0;
let passes = 0;
function near(label: string, actual: number, expected: number, tol = 0.5) {
  // Axial angles: 179.9 and 0.1 are the same direction
  const d = Math.abs(((actual - expected) % 180 + 270) % 180 - 90);
  if (d <= tol) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${actual.toFixed(2)}\n        expected ${expected}`);
  }
}
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${String(actual)}\n        expected ${String(expected)}`);
  }
}

/** A thin 100 x 10 rectangle centered at (500, 500), long axis at screenAngle
 *  degrees counterclockwise from horizontal AS SEEN ON SCREEN (image y down). */
function grain(screenAngle: number) {
  const a = (screenAngle * Math.PI) / 180;
  const ux = Math.cos(a), uy = -Math.sin(a); // long axis in image coordinates
  const vx = -uy, vy = ux;                    // short axis
  const corners: Array<[number, number]> = [[-50, -5], [50, -5], [50, 5], [-50, 5]];
  return corners.map(([s, t]) => ({ X: 500 + s * ux + t * vx, Y: 500 + s * uy + t * vy }));
}

near('horizontal grain = 0', calculateEllipseMetrics(grain(0)).orientation, 0);
near('"/" grain (up to the right on screen) = 45', calculateEllipseMetrics(grain(45)).orientation, 45);
near('vertical grain = 90', calculateEllipseMetrics(grain(90)).orientation, 90);
near('"\\" grain (down to the right on screen) = 135', calculateEllipseMetrics(grain(135)).orientation, 135);
near('30 degree grain = 30', calculateEllipseMetrics(grain(30)).orientation, 30);
near('160 degree grain = 160', calculateEllipseMetrics(grain(160)).orientation, 160);

// Explicit screen check, independent of the helper: points running from the lower
// left to the upper right of the screen have y DEcreasing as x increases.
const slash = [{ X: 0, Y: 100 }, { X: 100, Y: 0 }, { X: 104, Y: 4 }, { X: 4, Y: 104 }];
near('lower-left to upper-right polygon = 45', calculateEllipseMetrics(slash).orientation, 45);

for (const o of [0, 45, 90, 135, 179]) {
  const r = calculateEllipseMetrics(grain(o)).orientation;
  eq(`orientation ${o} stays in [0, 180)`, r >= 0 && r < 180, true);
}

// ---- Shape comes from the polygon's area, not its vertices ----

function close(label: string, actual: number, expected: number, relTol = 0.01) {
  if (Math.abs(actual - expected) <= relTol * Math.abs(expected)) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${actual.toFixed(4)}\n        expected ${expected}`);
  }
}

// A circle of radius 50 (720 vertices): best-fit ellipse axes = the diameter, 100
const circle = Array.from({ length: 720 }, (_, i) => {
  const t = (i / 720) * 2 * Math.PI;
  return { X: 300 + 50 * Math.cos(t), Y: 300 + 50 * Math.sin(t) };
});
close('circle major axis = diameter', calculateEllipseMetrics(circle).majorAxis, 100);
close('circle minor axis = diameter', calculateEllipseMetrics(circle).minorAxis, 100);

// An ellipse with semi-axes 60 x 20 at 30 degrees: axes 120 and 40, orientation 30
const ellipse30 = Array.from({ length: 720 }, (_, i) => {
  const t = (i / 720) * 2 * Math.PI, a = (30 * Math.PI) / 180;
  const s = 60 * Math.cos(t), u = 20 * Math.sin(t);
  return { X: 400 + s * Math.cos(a) - u * Math.sin(a), Y: 400 - (s * Math.sin(a) + u * Math.cos(a)) };
});
const e30 = calculateEllipseMetrics(ellipse30);
close('60x20 ellipse major axis = 120', e30.majorAxis, 120);
close('60x20 ellipse minor axis = 40', e30.minorAxis, 40);
near('60x20 ellipse at 30 degrees', e30.orientation, 30, 0.1);

// A 100 x 20 rectangle: second moments are w^2/12 and h^2/12, so the aspect ratio is 5
const rect = [{ X: 0, Y: 0 }, { X: 100, Y: 0 }, { X: 100, Y: 20 }, { X: 0, Y: 20 }];
const r = calculateEllipseMetrics(rect);
close('rectangle aspect ratio = 5', r.majorAxis / r.minorAxis, 5);
close('rectangle major axis = 4*sqrt(100^2/12)', r.majorAxis, 4 * Math.sqrt(10000 / 12));

// The same parallelogram with 40 extra points along one edge gives the same answer
const para = [{ X: 0, Y: 0 }, { X: 100, Y: 0 }, { X: 130, Y: -30 }, { X: 30, Y: -30 }];
const paraDense = [...para];
for (let i = 1; i < 40; i++) paraDense.push({ X: 30 - (i * 30) / 40, Y: -30 + (i * 30) / 40 });
const p1 = calculateEllipseMetrics(para), p2 = calculateEllipseMetrics(paraDense);
near('extra vertices do not move the orientation', p2.orientation, p1.orientation, 0.01);
close('extra vertices do not change the major axis', p2.majorAxis, p1.majorAxis, 1e-9);
close('extra vertices do not change the minor axis', p2.minorAxis, p1.minorAxis, 1e-9);

// Winding direction does not matter
const rev = calculateEllipseMetrics([...ellipse30].reverse());
close('reversed winding: same major axis', rev.majorAxis, e30.majorAxis, 1e-9);
near('reversed winding: same orientation', rev.orientation, e30.orientation, 0.01);

// Circular mean of axial data: 170 and 10 average to 0 (horizontal), not 90
near('mean of 170 and 10 = 0', calculateCircularMean([170, 10]).mean, 0);
near('mean of 40, 45, 50 = 45', calculateCircularMean([40, 45, 50]).mean, 45);

// Rose sectors count each grain in the sector that holds its angle
const sectors = generateRoseSectors([5, 44, 46, 95], 18);
eq('sector 0-10 holds 5', sectors[0].count, 1);
eq('sector 40-50 holds 44 and 46', sectors[4].count, 2);
eq('sector 90-100 holds 95', sectors[9].count, 1);

// ---- Count axes: whole numbers only ----
const ticksOf = (m: number) => { const { yMax, yStep } = countAxis(m); const t: number[] = []; for (let v = 0; v <= yMax; v += yStep) t.push(v); return t; };
eq('histogram axis for a max of 7', ticksOf(7).join(' '), '0 2 4 6 8');
eq('histogram axis for a max of 1', ticksOf(1).join(' '), '0 1 2');
eq('histogram axis for a max of 48', ticksOf(48).join(' '), '0 10 20 30 40 50');
for (const m of [0, 1, 3, 7, 9, 23, 137, 1000]) {
  const t = ticksOf(m);
  eq(`histogram ticks for ${m} are whole numbers above the max`, t.every(Number.isInteger) && t[t.length - 1] > m, true);
  const r = roseRings(m);
  eq(`rose rings for ${m} are whole numbers reaching the max`, r.every(Number.isInteger) && r[r.length - 1] >= Math.max(1, m) && r.length <= 5, true);
}
eq('rose rings for a max of 2', roseRings(2).join(' '), '1 2');
eq('rose rings for a max of 7', roseRings(7).join(' '), '2 4 6 8');

// ---- Equal-area rose: area, not length, goes with the count ----
const r1 = equalAreaRadius(1, 4, 100), r4 = equalAreaRadius(4, 4, 100);
close('outer count reaches the outer radius', r4, 100);
close('a quarter of the count is half the radius (a quarter of the area)', r1, 50);
eq('zero count has no petal', equalAreaRadius(0, 4, 100), 0);

// ---- Size axis labels: neighbouring ticks never read the same ----
const ticks = (a: number, b: number) => Array.from({ length: 7 }, (_, i) => a + (i / 6) * (b - a));
eq('1.09-1.17 mm', sizeTickLabels(ticks(1090, 1170)).join(' '), '1.09mm 1.10mm 1.12mm 1.13mm 1.14mm 1.16mm 1.17mm');
eq('2 um - 1.17 mm (Peter)', sizeTickLabels(ticks(2, 1170)).join(' '), '2µm 197µm 391µm 586µm 781µm 975µm 1.2mm');
eq('wide mm range keeps one decimal', sizeTickLabels(ticks(1000, 7000)).join(' '), '1.0mm 2.0mm 3.0mm 4.0mm 5.0mm 6.0mm 7.0mm');
eq('narrow um range gets decimals', sizeTickLabels(ticks(10, 11.2)).join(' '), '10.0µm 10.2µm 10.4µm 10.6µm 10.8µm 11.0µm 11.2µm');
for (const [a, b] of [[1090, 1170], [2, 1170], [10, 11.2], [500, 1500], [3.1, 3.4]]) {
  const l = sizeTickLabels(ticks(a, b));
  eq(`labels ${a}-${b} all differ from their neighbours`, l.every((x, i) => i === 0 || x !== l[i - 1]), true);
}

// ---- Linear size axis ticks at round values ----
eq('ticks 1090-1170', niceTicks(1090, 1170, 6).join(' '), '1100 1120 1140 1160');
eq('ticks 2-1170 (Peter)', niceTicks(2, 1170, 6).join(' '), '200 400 600 800 1000');
eq('ticks 1130-1200', sizeTickLabels(niceTicks(1130, 1200, 6)).join(' '), '1.14mm 1.16mm 1.18mm 1.20mm');
eq('ticks 0.1-0.7 have no float noise', niceTicks(0.1, 0.7, 6).join(' '), '0.1 0.2 0.3 0.4 0.5 0.6 0.7');
eq('equal ends give one tick', niceTicks(5, 5, 6).join(' '), '5');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
