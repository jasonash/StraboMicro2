/**
 * Pixels per centimeter from a scale step's fields (src/utils/scaleInput.ts):
 * traced scale bar, Pixel Conversion Factor, image width (or height), with
 * the same unit conversions as the New Micrograph wizard.
 *
 *   npm run test:scale-input
 */

import { pixelsPerCentimeterFromInput } from '../src/utils/scaleInput.ts';

let failures = 0;
let passes = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = typeof expected === 'number' && typeof actual === 'number' ? Math.abs(actual - expected) < 1e-6 : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got      ${JSON.stringify(actual)}\n        expected ${JSON.stringify(expected)}`);
  }
}

eq('scale bar: 200 px = 100 μm -> 20000 px/cm', pixelsPerCentimeterFromInput('Trace Scale Bar', { scaleBarLineLengthPixels: 200, scaleBarPhysicalLength: 100, scaleBarUnits: 'μm' }, 800), 20000);
eq('pixel conversion: 500 px per 100 μm -> 50000', pixelsPerCentimeterFromInput('Pixel Conversion Factor', { pixels: 500, physicalLength: 100, pixelUnits: 'μm' }, 800), 50000);
eq('pixel conversion in mm', pixelsPerCentimeterFromInput('Pixel Conversion Factor', { pixels: 300, physicalLength: 1, pixelUnits: 'mm' }, 800), 3000);
eq('image width 2 mm for 800 px -> 4000', pixelsPerCentimeterFromInput('Provide Width/Height of Image', { imageWidthPhysical: 2, sizeUnits: 'mm' }, 800, 600), 4000);
eq('only the height given: from the height', pixelsPerCentimeterFromInput('Provide Width/Height of Image', { imageHeightPhysical: 1.5, sizeUnits: 'mm' }, 800, 600), 4000);
eq('missing fields: null', pixelsPerCentimeterFromInput('Pixel Conversion Factor', { pixels: 500 }, 800), null);
eq('zero length: null', pixelsPerCentimeterFromInput('Trace Scale Bar', { scaleBarLineLengthPixels: 200, scaleBarPhysicalLength: 0, scaleBarUnits: 'μm' }, 800), null);
eq('unknown unit: null', pixelsPerCentimeterFromInput('Pixel Conversion Factor', { pixels: 5, physicalLength: 1, pixelUnits: 'furlong' }, 800), null);
eq('Stretch and Drag has no fields: null', pixelsPerCentimeterFromInput('Stretch and Drag', {}, 800), null);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
