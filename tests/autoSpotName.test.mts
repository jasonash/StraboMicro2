/**
 * Auto spot mode names (src/utils/autoSpotName.ts, design 5.2): {n}
 * patterns, the default, no padding, the next number from the highest one
 * used in the sample (archived spots included), gaps never filled.
 *
 *   npm run test:auto-spot-name
 */

import {
  DEFAULT_SPOT_NAME_PATTERN,
  effectivePattern,
  highestNumber,
  nextSpotName,
  sampleSpotNames,
  spotNameFor,
} from '../src/utils/autoSpotName.ts';
import type { SampleMetadata } from '../src/types/project-types.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
function eq(label: string, got: unknown, want: unknown) {
  check(`${label} = ${JSON.stringify(want)}`, got === want, got);
}

function sample(micrographs: { id: string; spots: { name: unknown; archived?: boolean }[] }[]): SampleMetadata {
  return { id: 's1', micrographs: micrographs.map((m) => ({ id: m.id, spots: m.spots })) } as SampleMetadata;
}

// Patterns
eq('default pattern', DEFAULT_SPOT_NAME_PATTERN, 'Spot {n}');
eq('empty pattern', effectivePattern(''), 'Spot {n}');
eq('blank pattern', effectivePattern('   '), 'Spot {n}');
eq('null pattern', effectivePattern(null), 'Spot {n}');
eq('undefined pattern', effectivePattern(undefined), 'Spot {n}');
eq('pattern with {n} kept', effectivePattern('Ol-{n}'), 'Ol-{n}');
eq('pattern trimmed', effectivePattern('  Ol-{n} '), 'Ol-{n}');
eq('no {n}: " {n}" added', effectivePattern('Olivine'), 'Olivine {n}');
eq('number first', effectivePattern('{n}a'), '{n}a');

// Names, no padding
eq('Ol-{n} 7', spotNameFor('Ol-{n}', 7), 'Ol-7');
eq('default 1', spotNameFor(null, 1), 'Spot 1');
eq('Olivine 3', spotNameFor('Olivine', 3), 'Olivine 3');
eq('{n}a 12', spotNameFor('{n}a', 12), '12a');
eq('only the first {n} replaced', spotNameFor('G{n}-{n}', 4), 'G4-{n}');
eq('no padding at 100', spotNameFor('Ol-{n}', 100), 'Ol-100');

// Highest number
eq('none', highestNumber('Ol-{n}', []), 0);
eq('simple', highestNumber('Ol-{n}', ['Ol-1', 'Ol-2', 'Ol-3']), 3);
eq('order does not matter', highestNumber('Ol-{n}', ['Ol-9', 'Ol-2', 'Ol-10']), 10);
eq('gaps: highest counts', highestNumber('Ol-{n}', ['Ol-1', 'Ol-8']), 8);
eq('padded names count by value', highestNumber('Ol-{n}', ['Ol-07', 'Ol-003']), 7);
eq('other prefixes ignored', highestNumber('Ol-{n}', ['Px-12', 'Spot 30', 'Ol-2']), 2);
eq('whole name only: suffix', highestNumber('Ol-{n}', ['Ol-7b']), 0);
eq('whole name only: prefix', highestNumber('Ol-{n}', ['xOl-7']), 0);
eq('case sensitive', highestNumber('Ol-{n}', ['ol-7', 'OL-8']), 0);
eq('surrounding spaces ignored', highestNumber('Ol-{n}', [' Ol-5 ']), 5);
eq('no digits', highestNumber('Ol-{n}', ['Ol-', 'Ol-x']), 0);
eq('regex characters are literal', highestNumber('Q.(a)+{n}', ['Q.(a)+4', 'QX(a)+9']), 4);
eq('number in the middle', highestNumber('G{n}a', ['G3a', 'G14a', 'G2b']), 14);
eq('no {n} pattern', highestNumber('Olivine', ['Olivine 2', 'Olivine 11', 'Olivine']), 11);
eq('default pattern', highestNumber(null, ['Spot 4', 'Spot 1', 'Spots 9']), 4);
eq('unsafe huge number skipped', highestNumber('Ol-{n}', ['Ol-99999999999999999999', 'Ol-3']), 3);

// Sample range: every micrograph, archived spots included
const s = sample([
  { id: 'ref', spots: [{ name: 'Ol-1' }, { name: 'Ol-2' }, { name: 'Px-1' }] },
  { id: 'child', spots: [{ name: 'Ol-5', archived: true }, { name: 'Ol-3' }] },
  { id: 'empty', spots: [] },
]);
eq('sample names count', sampleSpotNames(s).length, 5);
check('sample names skip non-strings',
  sampleSpotNames(sample([{ id: 'm', spots: [{ name: null }, { name: 'A' }] }])).join() === 'A');
eq('sampleSpotNames(null)', sampleSpotNames(null).length, 0);
eq('micrograph without spots', sampleSpotNames({ id: 's', micrographs: [{ id: 'm' }] } as SampleMetadata).length, 0);
eq('next across micrographs incl. archived', nextSpotName('Ol-{n}', s).name, 'Ol-6');
eq('next number', nextSpotName('Ol-{n}', s).number, 6);
eq('next for another prefix', nextSpotName('Px-{n}', s).name, 'Px-2');
eq('next for an unused pattern', nextSpotName('Grain {n}', s).name, 'Grain 1');
eq('next default in an empty sample', nextSpotName(null, sample([])).name, 'Spot 1');
eq('next with no sample', nextSpotName('Ol-{n}', null).name, 'Ol-1');

// Deleting the highest frees its number; deleting another leaves a gap
const afterDeleteHighest = sample([{ id: 'm', spots: [{ name: 'Ol-1' }, { name: 'Ol-2' }] }]);
eq('highest deleted: number reused', nextSpotName('Ol-{n}', afterDeleteHighest).name, 'Ol-3');
const afterDeleteMiddle = sample([{ id: 'm', spots: [{ name: 'Ol-1' }, { name: 'Ol-3' }] }]);
eq('middle deleted: gap not filled', nextSpotName('Ol-{n}', afterDeleteMiddle).name, 'Ol-4');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
