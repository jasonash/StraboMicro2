/**
 * Unit tests of the Open Remote Project row text (src/utils/remoteProjectRow.ts).
 *
 *   npm run test:remote-rows
 */

import { remoteRowText } from '@/utils/remoteProjectRow';

let failures = 0;
let passes = 0;
const is = (label: string, got: string, want: string) => {
  if (got === want) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        got:  ${got}\n        want: ${want}`);
  }
};

const row = (over: Partial<Parameters<typeof remoteRowText>[0]> = {}) => ({
  pid: 5247, name: 'LocalOnlyTest', role: 'owner', updatedAt: null, owner: { pkey: 3, name: 'Jason Ash' }, members: 2, here: null, ...over,
});

is('owner, two people', remoteRowText(row(), [row()]), 'On StraboSpot · 2 people');
is('only me', remoteRowText(row({ members: 1 }), [row()]), 'On StraboSpot · only you');
is('older server: no count', remoteRowText(row({ members: undefined }), [row()]), 'On StraboSpot');
is('member: whose project', remoteRowText(row({ role: 'editor', members: 3 }), [row()]), "On StraboSpot · Jason Ash's project · 3 people");
is('synced copy here', remoteRowText(row({ here: 'synced' }), [row()]), 'On StraboSpot · synced copy on this computer · 2 people');
const twins = [row(), row({ pid: 5832, members: 1 })];
is('same name: project number', remoteRowText(twins[1], twins), 'On StraboSpot · only you · StraboSpot project 5832');
is('same name ignoring case and spaces', remoteRowText(row(), [row(), row({ pid: 9, name: ' localonlytest ' })]),
  'On StraboSpot · 2 people · StraboSpot project 5247');
is('different names: no number', remoteRowText(row(), [row(), row({ pid: 9, name: 'Other' })]), 'On StraboSpot · 2 people');

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
