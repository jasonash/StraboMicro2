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

// Circular mean of axial data: 170 and 10 average to 0 (horizontal), not 90
near('mean of 170 and 10 = 0', calculateCircularMean([170, 10]).mean, 0);
near('mean of 40, 45, 50 = 45', calculateCircularMean([40, 45, 50]).mean, 45);

// Rose sectors count each grain in the sector that holds its angle
const sectors = generateRoseSectors([5, 44, 46, 95], 18);
eq('sector 0-10 holds 5', sectors[0].count, 1);
eq('sector 40-50 holds 44 and 46', sectors[4].count, 2);
eq('sector 90-100 holds 95', sectors[9].count, 1);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
