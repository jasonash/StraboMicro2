/**
 * Links added to many spots at once (src/utils/spotLinks.ts, Edit n Spots
 * dialog): appended, a URL the spot already has is skipped, nothing to add
 * = null (spot left untouched).
 *
 *   npm run test:spot-links
 */

import { addLinks } from '../src/utils/spotLinks.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
function same(label: string, got: unknown, want: unknown) {
  check(`${label} = ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want), got);
}

const paper = { label: 'Paper', url: 'https://doi.org/10.1/abc' };
const data = { label: 'Data', url: 'https://example.org/data' };

same('no links yet', addLinks(undefined, [paper]), [paper]);
same('null links', addLinks(null, [paper, data]), [paper, data]);
same('appended after existing', addLinks([data], [paper]), [data, paper]);
same('already there = null', addLinks([paper], [paper]), null);
same('same URL, other label = skipped', addLinks([paper], [{ label: 'Other', url: paper.url }]), null);
same('URL compared trimmed', addLinks([paper], [{ label: 'P', url: ` ${paper.url} ` }]), null);
same('stored URL trimmed', addLinks([], [{ label: 'D', url: ' https://example.org/data ' }]), [{ label: 'D', url: data.url }]);
same('only the new one added', addLinks([paper], [paper, data]), [paper, data]);
same('duplicate within the new links added once', addLinks([], [data, { label: 'Again', url: data.url }]), [data]);
same('empty URL ignored', addLinks([], [{ label: 'x', url: '' }]), null);
same('nothing to add', addLinks([paper], []), null);

const before = [paper];
addLinks(before, [data]);
same('existing list not changed in place', before, [paper]);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
