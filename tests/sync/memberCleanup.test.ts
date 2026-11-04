/**
 * Unit tests of dropping membership ids that point at deleted entities
 * (src/store/helpers.ts dropDeadMemberIds, used by the store's delete actions).
 *
 *   npm run test:member-cleanup
 */

import { dropDeadMemberIds } from '@/store/helpers';
import type { ProjectMetadata } from '@/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function project(): ProjectMetadata {
  return {
    id: 'P',
    name: 'p',
    tags: [{ id: 'T1', name: 't1', spotIDs: ['S1', 'S2'] }, { id: 'T2', name: 't2' }],
    groups: [{ id: 'G1', name: 'g1', micrographs: ['M1', 'M2'], spotIDs: ['S1'] }, { id: 'G2', name: 'g2', micrographs: null }],
    datasets: [{
      id: 'D1', name: 'd',
      samples: [{
        id: 'A1', name: 's',
        micrographs: [
          { id: 'M1', name: 'm1', tags: ['T1', 'T2'], spots: [{ id: 'S1', name: 's1', tags: ['T1'] }, { id: 'S2', name: 's2' }] },
          { id: 'M2', name: 'm2' },
        ],
      }],
    }],
  } as unknown as ProjectMetadata;
}
const micrographs = (p: ProjectMetadata) => p.datasets![0].samples![0].micrographs!;

{
  const p = project();
  const before = JSON.stringify(p);
  dropDeadMemberIds(p);
  check('nothing deleted: project unchanged', JSON.stringify(p) === before, p);
}
{
  const p = project();
  micrographs(p).splice(1, 1); // M2 deleted
  dropDeadMemberIds(p);
  check('micrograph deleted: group drops it', same(p.groups![0].micrographs, ['M1']), p.groups);
  check('null list stays null', p.groups![1].micrographs === null);
  check('absent list stays absent', !('spotIDs' in p.groups![1]) && !('tags' in micrographs(p)[0].spots![1]));
}
{
  const p = project();
  micrographs(p)[0].spots!.splice(0, 1); // S1 deleted
  dropDeadMemberIds(p);
  check('spot deleted: group and tag drop it', same(p.groups![0].spotIDs, []) && same(p.tags![0].spotIDs, ['S2']), p);
}
{
  const p = project();
  p.tags = p.tags!.filter((t) => t.id !== 'T1'); // T1 deleted
  dropDeadMemberIds(p);
  check('tag deleted: micrograph and spot drop it', same(micrographs(p)[0].tags, ['T2']) && same(micrographs(p)[0].spots![0].tags, []), micrographs(p)[0]);
}
{
  const p = project();
  p.datasets = []; // whole dataset deleted
  dropDeadMemberIds(p);
  check('dataset deleted: every micrograph and spot id dropped',
    same(p.groups![0].micrographs, []) && same(p.groups![0].spotIDs, []) && same(p.tags![0].spotIDs, []), p);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
