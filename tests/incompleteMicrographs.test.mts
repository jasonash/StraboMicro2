/**
 * Turn-on sync warning for incomplete micrographs
 * (src/utils/incompleteMicrographs.ts; 2026-10-07 decision B: warn, never
 * refuse). The list comes from findIncompleteMicrographs, the export check.
 *
 *   npm run test:incomplete-micrographs
 */

import { incompleteWarning, missingText, INCOMPLETE_LIST_LIMIT } from '../src/utils/incompleteMicrographs.ts';
import type { IncompleteItem } from '../src/utils/incompleteMicrographs.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

function item(name: string, scale: boolean, location: boolean, instrument = false): IncompleteItem {
  return { name, needsScale: scale, needsLocation: location, needsInstrumentInfo: instrument };
}

// missingText
check('scale only', missingText(item('a', true, false)) === 'needs a scale', missingText(item('a', true, false)));
check('location only', missingText(item('a', false, true)) === 'needs a location');
check('instrument only', missingText(item('a', false, false, true)) === 'needs instrument details');
check('scale and location', missingText(item('a', true, true)) === 'needs a scale and a location', missingText(item('a', true, true)));
check('all three', missingText(item('a', true, true, true)) === 'needs a scale, a location and instrument details',
  missingText(item('a', true, true, true)));
check('nothing missing', missingText(item('a', false, false)) === null);

// incompleteWarning
check('empty list: no warning', incompleteWarning([]) === null);
check('only complete items: no warning', incompleteWarning([item('a', false, false)]) === null);

const one = incompleteWarning([item('TS-12', false, true)]);
check('one: singular title', one?.title === "1 micrograph isn't finished yet", one);
check('one: line', one?.lines.length === 1 && one.lines[0] === 'TS-12: needs a location', one);
check('one: no more', one?.more === null, one);
check('one: singular note', !!one?.note.includes('finish it later') && !one.note.includes(' them '), one);

const many = Array.from({ length: INCOMPLETE_LIST_LIMIT + 3 }, (_, i) => item(`M${i + 1}`, true, false));
const w = incompleteWarning([item('done', false, false), ...many]);
check('many: plural title counts only incomplete', w?.title === `${INCOMPLETE_LIST_LIMIT + 3} micrographs aren't finished yet`, w);
check('many: lists the limit', w?.lines.length === INCOMPLETE_LIST_LIMIT, w);
check('many: first listed is the first incomplete', w?.lines[0] === 'M1: needs a scale', w);
check('many: and N more', w?.more === 'and 3 more', w);
check('many: plural note', !!w?.note.includes('finish them later'), w);

const exact = incompleteWarning(many.slice(0, INCOMPLETE_LIST_LIMIT));
check('exactly the limit: no more line', exact?.more === null && exact.lines.length === INCOMPLETE_LIST_LIMIT, exact);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
