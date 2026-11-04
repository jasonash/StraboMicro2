/**
 * Who made their change, as the decisions dialog words it
 * (src/utils/syncDecisionText.ts).
 *
 *   npm run test:decision-text
 */

import {
  changedAtLabel,
  keepAllTheirsLabel,
  questionText,
  theirSideLabel,
} from '@/utils/syncDecisionText';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

const FRED: SyncAuthor = { name: 'Fred Smith', me: false, at: '2026-10-27T15:21:00Z' };
const ANN: SyncAuthor = { name: 'Ann Lee', me: false, at: null };
const ME: SyncAuthor = { name: 'Jason Ash', me: true, at: null };
const NONAME: SyncAuthor = { name: '', me: false, at: null };

check('their side: full name', theirSideLabel(FRED) === "Fred Smith's", theirSideLabel(FRED));
check('their side: my other computer', theirSideLabel(ME) === 'You, on another computer');
check('their side: no author stored', theirSideLabel(undefined) === 'Theirs');
check('their side: account without a name', theirSideLabel(NONAME) === 'Theirs');

check('keep all: one person', keepAllTheirsLabel([FRED, { ...FRED, at: null }]) === "Keep all Fred Smith's");
check('keep all: two people', keepAllTheirsLabel([FRED, ANN]) === 'Keep all theirs');
check('keep all: my other computer', keepAllTheirsLabel([ME]) === 'Keep all from your other computer');
check('keep all: an old field without an author', keepAllTheirsLabel([FRED, undefined]) === 'Keep all theirs');

const now = new Date('2026-10-27T18:00:00Z');
const today = changedAtLabel('2026-10-27T15:21:00Z', now);
check('time today: no date', /^changed \d{1,2}:21/.test(today) && !today.includes('Oct'), today);
const earlier = changedAtLabel('2026-10-20T15:21:00Z', now);
check('time on another day: with the date', earlier.startsWith('changed ') && earlier.includes('Oct') && earlier.includes('20') && !earlier.includes('2026'), earlier);
check('time another year: with the year', changedAtLabel('2025-10-20T15:21:00Z', now).includes('2025'));
check('no time', changedAtLabel(null, now) === '' && changedAtLabel('nonsense', now) === '');

const item = (kind: 'theirs_deleted' | 'mine_deleted', by: SyncAuthor[], n = 3): SyncQuestionItem => ({
  key: 'micrograph:m1', type: 'micrograph', name: 'TS-12', parentType: 'sample', parentName: 'S1',
  kind, contains: {}, localChanges: n, theirChanges: n, by,
});
const t = (q: SyncQuestionItem) => questionText(q);
check('their delete by name', t(item('theirs_deleted', [FRED])) === "Fred Smith deleted Micrograph 'TS-12' in sample 'S1'. You changed 3 of these since.",
  t(item('theirs_deleted', [FRED])));
check('their delete, my other computer', t(item('theirs_deleted', [ME])).startsWith("You deleted Micrograph 'TS-12' in sample 'S1' on another computer."));
check('their delete, nobody stored', t(item('theirs_deleted', [])).startsWith('They deleted'));
check('my delete, one person', t(item('mine_deleted', [FRED], 1)) === "You deleted Micrograph 'TS-12' in sample 'S1'. Fred Smith changed 1 item in it since.",
  t(item('mine_deleted', [FRED], 1)));
check('my delete, two people', t(item('mine_deleted', [ANN, FRED])).includes('Ann Lee and Fred Smith changed 3 items'));
check('my delete, three people', t(item('mine_deleted', [ANN, FRED, ME])).includes('Ann Lee, Fred Smith and you (on another computer) changed'));
check('my delete, many people', t(item('mine_deleted', [ANN, FRED, { ...FRED, name: 'C' }, { ...FRED, name: 'D' }])).includes('Ann Lee, Fred Smith and 2 others changed'));
check('my delete, only my other computer', t(item('mine_deleted', [ME])).endsWith('You changed 3 items in it on another computer since.'));
check('my delete, nobody stored', t(item('mine_deleted', [])).includes('. They changed 3 items in it since.'));

console.log(failures === 0 ? `ALL PASSED (${passes} checks)` : `${failures} FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
