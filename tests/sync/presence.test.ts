/**
 * Unit tests of presence (src/utils/presence.ts, spec v3 17al-17an).
 *
 *   npm run test:presence
 */

import {
  peopleFrom, presenceColor, initialsOf, presenceLine, editingNotice, viewersOf, editorsOf, sendableTarget, minutesSince,
  panelDialogTarget, type PresenceTarget,
} from '@/utils/presence';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const is = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

const M = { type: 'micrograph', id: 'M1' };
const S = { type: 'spot', id: 'S1' };
const conn = (user: number, over: Partial<SyncLivePerson> = {}): SyncLivePerson => ({
  conn: `c${user}${Math.random()}`, user, state: 'here', viewing: null, editing: null, since: '2026-10-04T12:00:00Z', ...over,
});
const names = { 1: 'Ana Ruiz', 2: 'Ben Ito', 3: 'Cleo Park' };

// One per account, me left out, sorted by name
let people = peopleFrom([conn(2), conn(1), conn(3), conn(2)], 1, names);
is('me (and my other computers) left out, one per person, by name', people.map((p) => p.name), ['Ben Ito', 'Cleo Park']);
is('nobody left out when I am not known', peopleFrom([conn(1)], null, names).length, 1);
is('unknown name', peopleFrom([conn(9)], 1, names)[0].name, 'Someone');

// A person on two computers: the one that is here, else the latest
people = peopleFrom([
  conn(2, { state: 'away', viewing: M, since: '2026-10-04T12:05:00Z' }),
  conn(2, { state: 'here', viewing: null, since: '2026-10-04T12:00:00Z' }),
], 1, names);
is('two computers: the here one wins', [people[0].state, people[0].viewing], ['here', null]);
people = peopleFrom([
  conn(2, { state: 'away', viewing: M, since: '2026-10-04T12:05:00Z' }),
  conn(2, { state: 'away', viewing: S, since: '2026-10-04T12:01:00Z' }),
], 1, names);
is('both away: the latest wins', people[0].viewing, M);
people = peopleFrom([conn(2, { state: 'here' }), conn(2, { state: 'away', editing: S })], 1, names);
is('editing on any computer counts', people[0].editing, S);

// Viewing and editing
people = peopleFrom([conn(2, { viewing: M }), conn(3, { viewing: M, editing: S })], 1, names);
is('viewers of a micrograph', viewersOf(people, M).map((p) => p.name), ['Ben Ito', 'Cleo Park']);
is('editors of a spot', editorsOf(people, S).map((p) => p.name), ['Cleo Park']);
is('nobody edits the micrograph', editorsOf(people, M).length, 0);

// Colors and initials
check('color stable per account', presenceColor(42) === presenceColor(42));
check('colors differ between accounts', presenceColor(42) !== presenceColor(43));
is('initials of two words', initialsOf('Ben Ito'), 'BI');
is('initials of three words', initialsOf('Ana Maria Ruiz'), 'AM');
is('initials of one word', initialsOf('ben'), 'B');
is('initials of nothing', initialsOf('  '), '?');

// Lines
const now = Date.parse('2026-10-04T12:12:30Z');
const describe = (t: PresenceTarget, editing: boolean) =>
  t.type === 'micrograph' ? (editing ? 'micrograph 160328-4 XPL' : '160328-4 XPL') : t.type === 'spot' ? 'spot Garnet 1' : null;
const ben = (over: Partial<SyncLivePerson>) => peopleFrom([conn(2, over)], 1, names)[0];
is('viewing', presenceLine(ben({ viewing: M }), describe, now), 'Ben Ito, viewing 160328-4 XPL');
is('editing wins over viewing', presenceLine(ben({ viewing: M, editing: S }), describe, now), 'Ben Ito, editing spot Garnet 1');
is('away for 12 min', presenceLine(ben({ state: 'away', viewing: M }), describe, now), 'Ben Ito, away (12 min)');
is('away just now', presenceLine(ben({ state: 'away', since: '2026-10-04T12:12:00Z' }), describe, now), 'Ben Ito, away');
is('nothing open', presenceLine(ben({}), describe, now), 'Ben Ito');
is('target unknown here (not pulled yet)', presenceLine(ben({ viewing: { type: 'micrograph', id: 'nope' } }), () => null, now), 'Ben Ito');
is('minutes since a bad time', minutesSince('nonsense', now), 0);

// The dialog line (17am)
is('one editor', editingNotice(['Ben Ito'], 'spot'),
  "Ben Ito is editing this spot right now. You can still edit; if you both change the same field you'll be asked which to keep.");
is('two editors', editingNotice(['Ben Ito', 'Cleo Park'], 'micrograph'),
  "Ben Ito and Cleo Park are editing this micrograph right now. You can still edit; if you both change the same field you'll be asked which to keep.");

// What the live service accepts
is('a uuid target is sent', sendableTarget({ type: 'spot', id: '1b2c-3d4e' }), { type: 'spot', id: '1b2c-3d4e' });
is('an id with spaces is not', sendableTarget({ type: 'spot', id: 'a b' }), null);
is('a bad type is not', sendableTarget({ type: 'Spot!', id: 'x' }), null);
is('nothing', sendableTarget(null), null);

// What a side panel's dialog edits
const ids = { projectId: 'P', datasetId: 'D', sampleId: 'SA', micrographId: 'M1', spotId: 'S1' };
is('no dialog', panelDialogTarget(null, ids), null);
is('detailed notes only show', panelDialogTarget('detailedNotes', ids), null);
is('project', panelDialogTarget('project', ids), { type: 'project', id: 'P' });
is('sample', panelDialogTarget('sample', ids), { type: 'sample', id: 'SA' });
is('micrograph dialog with a spot selected edits the micrograph', panelDialogTarget('polish-description', ids), M);
is('metadata dialog edits the spot', panelDialogTarget('mineralogy', ids), S);
is('metadata dialog without a spot edits the micrograph', panelDialogTarget('mineralogy', { ...ids, spotId: null }), M);

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
