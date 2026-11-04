/**
 * Web viewer: children not placed on their parent are not drawn and are
 * marked "Location not set" (web-viewer/src/utils/placement.ts, 2026-10-07).
 *
 *   npm run test:web-viewer-placement
 */

import { hasLocation, needsLocation } from '../web-viewer/src/utils/placement.ts';
import type { MicrographMetadata } from '../web-viewer/src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean) {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
  }
}

function micro(fields: Partial<MicrographMetadata>): MicrographMetadata {
  return { id: 'c', name: 'child', parentID: 'p', ...fields } as MicrographMetadata;
}

check('no placement: no location', !hasLocation(micro({})));
check('null placement fields: no location', !hasLocation(micro({ offsetInParent: null, pointInParent: null, xOffset: null, yOffset: null })));
check('offsetInParent', hasLocation(micro({ offsetInParent: { X: 10, Y: 20 } })));
check('offsetInParent at 0,0', hasLocation(micro({ offsetInParent: { X: 0, Y: 0 } })));
check('pointInParent', hasLocation(micro({ pointInParent: { X: 5, Y: 5 } })));
check('legacy xOffset/yOffset', hasLocation(micro({ xOffset: 0, yOffset: 0 })));
check('xOffset alone is not enough', !hasLocation(micro({ xOffset: 3 })));
check('affine', hasLocation(micro({ placementType: 'affine' })));
check('child without location needs one', needsLocation(micro({})));
check('reference never needs one', !needsLocation(micro({ parentID: null })));
check('placed child does not', !needsLocation(micro({ offsetInParent: { X: 1, Y: 1 } })));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
