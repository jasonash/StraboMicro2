/**
 * Which way a wheel event zooms (src/utils/wheelZoom.ts): events with no
 * vertical movement, or more sideways than vertical (a Mac trackpad or Magic
 * Mouse sends many), do not zoom.
 *
 *   npm run test:wheel-zoom
 */

import { wheelZoomDirection } from '../src/utils/wheelZoom.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

eq('mouse wheel down: zoom out', wheelZoomDirection({ deltaX: 0, deltaY: 100 }), -1);
eq('mouse wheel up: zoom in', wheelZoomDirection({ deltaX: 0, deltaY: -100 }), 1);
eq('small trackpad step down: zoom out', wheelZoomDirection({ deltaX: 0, deltaY: 2 }), -1);
eq('no movement at all: no zoom', wheelZoomDirection({ deltaX: 0, deltaY: 0 }), 0);
eq('negative zero: no zoom', wheelZoomDirection({ deltaX: 0, deltaY: -0 }), 0);
eq('sideways only: no zoom', wheelZoomDirection({ deltaX: 20, deltaY: 0 }), 0);
eq('sideways only, left: no zoom', wheelZoomDirection({ deltaX: -20, deltaY: 0 }), 0);
eq('mostly sideways, a little up: no zoom', wheelZoomDirection({ deltaX: 10, deltaY: -3 }), 0);
eq('diagonal, mostly down: zoom out', wheelZoomDirection({ deltaX: 3, deltaY: 10 }), -1);
eq('exactly diagonal: zooms (vertical counts)', wheelZoomDirection({ deltaX: 5, deltaY: -5 }), 1);
eq('NaN deltaY: no zoom', wheelZoomDirection({ deltaX: 0, deltaY: Number.NaN }), 0);

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
