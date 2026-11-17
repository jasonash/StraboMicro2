/**
 * Tags of a spot and groups of a micrograph for the right pane
 * (src/utils/tagsAndGroups.ts, Claire's issue #61).
 *
 *   npm run test:tags-groups
 */

import { tagsOfSpot, groupsOfMicrograph, tagChanges } from '../src/utils/tagsAndGroups.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

const project = {
  id: 'p', name: 'P',
  tags: [{ id: 't1', name: 'Quartz' }, { id: 't2', name: 'Feldspar' }, { id: 't3', name: 'Mica' }],
  groups: [
    { id: 'g1', name: 'Thin sections', micrographs: ['m1', 'm2'] },
    { id: 'g2', name: 'SEM', micrographs: ['m3'] },
    { id: 'g3', name: 'Empty', micrographs: null },
    { id: 'g4', name: 'Again', micrographs: ['m1'] },
  ],
} as never;

// --- tagsOfSpot ---
check('project order, not the spot\'s', same(tagsOfSpot(project, { id: 's', tags: ['t3', 't1'] } as never).map((t) => t.id), ['t1', 't3']));
check('deleted tag ids skipped', same(tagsOfSpot(project, { id: 's', tags: ['gone', 't2'] } as never).map((t) => t.id), ['t2']));
check('no tags', tagsOfSpot(project, { id: 's' } as never).length === 0 && tagsOfSpot(project, { id: 's', tags: [] } as never).length === 0);
check('no spot / no project', tagsOfSpot(project, null).length === 0 && tagsOfSpot(null, { id: 's', tags: ['t1'] } as never).length === 0);

// --- groupsOfMicrograph ---
check('groups holding the micrograph, project order', same(groupsOfMicrograph(project, 'm1').map((g) => g.id), ['g1', 'g4']));
check('one group', same(groupsOfMicrograph(project, 'm3').map((g) => g.id), ['g2']));
check('in none / no id / no project', groupsOfMicrograph(project, 'm9').length === 0 && groupsOfMicrograph(project, null).length === 0 && groupsOfMicrograph(null, 'm1').length === 0);

// --- tagChanges ---
{
  const c = tagChanges(['t1', 't2'], ['t2', 't3']);
  check('add + remove', same(c.add, ['t3']) && same(c.remove, ['t1']), c);
  const n = tagChanges(['t1'], ['t1']);
  check('no change', n.add.length === 0 && n.remove.length === 0, n);
  const all = tagChanges(['t1', 't2'], []);
  check('remove all', same(all.remove, ['t1', 't2']) && all.add.length === 0, all);
  const dup = tagChanges([], ['t1', 't1']);
  check('duplicates added once', same(dup.add, ['t1']), dup);
}

console.log(`\ntags and groups: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
