/**
 * PPL/XPL pairs for Scanner images as well as Optical Microscopy (user
 * request 2026-10-11): Scanner names its types "Plane Polarized" / "Cross
 * Polarized", Optical Microscopy "Plane Polarized Light" / "Cross Polarized
 * Light". A pair never mixes instruments.
 *
 *   npm run test:polarization
 */

import { canPairWith, partnerImageType, partnerRole, polarizedRole } from '../src/utils/polarization.ts';
import type { MicrographMetadata } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

function micro(id: string, instrumentType: string | null, imageType: string | null): MicrographMetadata {
  return { id, name: id, imageType, instrument: instrumentType ? { instrumentType } : null } as MicrographMetadata;
}

// Roles
const roles: [string | null | undefined, string | null][] = [
  ['Plane Polarized Light', 'PPL'],
  ['Cross Polarized Light', 'XPL'],
  ['Plane Polarized', 'PPL'],
  ['Cross Polarized', 'XPL'],
  ['plane polarized ', 'PPL'],
  ['PPL', 'PPL'],
  ['Crossed Polarized Light', 'XPL'],
  ['No Polarizer', null],
  ['Reflected Light', null],
  ['Other', null],
  ['', null],
  [null, null],
  [undefined, null],
];
for (const [type, want] of roles) {
  check(`polarizedRole(${JSON.stringify(type)}) = ${want}`, polarizedRole(type) === want, polarizedRole(type));
}

// The other half's label and image type, in the same instrument's names
check('partnerRole of Scanner PPL is XPL', partnerRole('Plane Polarized') === 'XPL');
check('partnerRole of Scanner XPL is PPL', partnerRole('Cross Polarized') === 'PPL');
const partners: [string, string][] = [
  ['Plane Polarized Light', 'Cross Polarized Light'],
  ['Cross Polarized Light', 'Plane Polarized Light'],
  ['Plane Polarized', 'Cross Polarized'],
  ['Cross Polarized', 'Plane Polarized'],
  ['PPL', 'Cross Polarized Light'],
  ['XPL', 'Plane Polarized Light'],
];
for (const [type, want] of partners) {
  check(`partnerImageType(${type}) = ${want}`, partnerImageType(type) === want, partnerImageType(type));
}

// Who may be linked
const optPpl = micro('opt-ppl', 'Optical Microscopy', 'Plane Polarized Light');
const optXpl = micro('opt-xpl', 'Optical Microscopy', 'Cross Polarized Light');
const scanPpl = micro('scan-ppl', 'Scanner', 'Plane Polarized');
const scanXpl = micro('scan-xpl', 'Scanner', 'Cross Polarized');
const scanNone = micro('scan-none', 'Scanner', 'No Polarizer');
const scanUntyped = micro('scan-untyped', 'Scanner', null);
check('optical PPL + optical XPL', canPairWith(optPpl, optXpl));
check('optical XPL + optical PPL', canPairWith(optXpl, optPpl));
check('scanner PPL + scanner XPL', canPairWith(scanPpl, scanXpl));
check('scanner XPL + scanner PPL', canPairWith(scanXpl, scanPpl));
check('no mixing: optical PPL + scanner XPL', !canPairWith(optPpl, scanXpl));
check('no mixing: scanner PPL + optical XPL', !canPairWith(scanPpl, optXpl));
check('no mixing without instrument fields (image type names)',
  !canPairWith(micro('a', null, 'Plane Polarized'), micro('b', null, 'Cross Polarized Light')));
check('not PPL + PPL', !canPairWith(scanPpl, micro('p2', 'Scanner', 'Plane Polarized')));
check('not with No Polarizer', !canPairWith(scanPpl, scanNone));
check('a source with no PPL/XPL type pairs with nothing', !canPairWith(scanNone, scanXpl));
check('untyped candidate, same instrument (as before)', canPairWith(scanPpl, scanUntyped));
check('untyped candidate, other instrument', !canPairWith(optPpl, scanUntyped));

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
