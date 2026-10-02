/**
 * Unit tests of the role checks (src/utils/permissions.ts, spec v3 §3.1,
 * 17h, 17i) on real edits: each case changes a project and runs the
 * changes diffProjects finds through the rules, as the app does.
 *
 *   npm run test:permissions
 */

import { diffProjects } from '../../electron/shared/entityModel.mjs';
import { splitChanges, canEditEntity, canCreate, creatorOf, othersBeneath, type Permissions } from '@/utils/permissions';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const OWNER = 1;
const ME = 2;

/* eslint-disable @typescript-eslint/no-explicit-any */
function project(): any {
  return {
    id: 'P', name: 'Project', presetKeyBindings: {},
    datasets: [{
      id: 'D1', name: 'd',
      samples: [{
        id: 'S1', label: 's', isExpanded: false,
        micrographs: [
          { id: 'M1', name: 'owner micrograph', spots: [{ id: 'SP1', name: 'owner spot' }, { id: 'SP2', name: 'my spot' }] },
          { id: 'M2', name: 'my micrograph', spots: [{ id: 'SP3', name: 'my spot on my micrograph' }] },
          { id: 'M3', name: 'my micrograph with an owner spot', spots: [{ id: 'SP4', name: 'owner spot on mine' }] },
        ],
      }],
    }],
  };
}
const authors: Record<string, number> = {
  'project:P': OWNER, 'dataset:D1': OWNER, 'sample:S1': OWNER, 'micrograph:M1': OWNER, 'spot:SP1': OWNER,
  'spot:SP2': ME, 'micrograph:M2': ME, 'spot:SP3': ME, 'micrograph:M3': ME, 'spot:SP4': OWNER,
};
const as = (role: SyncRole | null): Permissions => ({ role, me: ME, authors });

/** Changes made by edit(), split for a role */
function run(role: SyncRole | null, edit: (p: any) => void) {
  const before = project();
  const after = project();
  edit(after);
  const changes = diffProjects(before, after);
  return { changes, ...splitChanges(as(role), changes) };
}
const mic = (p: any, id: string) => p.datasets[0].samples[0].micrographs.find((m: any) => m.id === id);

// Owner, Editor and no role (local-only): everything
for (const role of ['owner', 'editor', null] as const) {
  const r = run(role, (p) => {
    p.name = 'Renamed';
    mic(p, 'M1').spots = [];
  });
  check(`${role}: settings and deleting others' spots allowed`, r.refused.length === 0 && r.allowed.length >= 3, r.refused);
}

// Viewer: nothing, not even adding
let r = run('viewer', (p) => {
  mic(p, 'M1').spots.push({ id: 'NEW', name: 'new' });
});
check('viewer: adding a spot refused (create and order)', r.allowed.length === 0 && r.refused.length === 2 &&
  r.refused.every((x) => x.problem === 'viewer'), r.refused);
check('viewer: cannot create or edit', !canCreate(as('viewer')) && !canEditEntity(as('viewer'), 'spot', 'SP2'));

// Contributor
r = run('contributor', (p) => {
  mic(p, 'M1').spots.push({ id: 'NEW', name: 'new' });
});
check('contributor: a spot on someone else\'s micrograph (its order changes too) is allowed', r.refused.length === 0 && r.allowed.length === 2, r.changes);
r = run('contributor', (p) => {
  mic(p, 'M1').spots.find((s: any) => s.id === 'SP2').name = 'renamed';
});
check('contributor: renaming my spot on someone else\'s micrograph is allowed', r.refused.length === 0 && r.allowed.length === 1, r.changes);
r = run('contributor', (p) => {
  mic(p, 'M1').spots.find((s: any) => s.id === 'SP1').name = 'renamed';
});
check('contributor: renaming someone else\'s spot is refused', r.allowed.length === 0 && r.refused.length === 1 &&
  r.refused[0].problem === 'not_creator', r.refused);
r = run('contributor', (p) => {
  mic(p, 'M1').name = 'renamed';
});
check('contributor: renaming someone else\'s micrograph is refused', r.refused.length === 1 && r.refused[0].problem === 'not_creator', r.refused);
r = run('contributor', (p) => {
  mic(p, 'M1').spots = mic(p, 'M1').spots.filter((s: any) => s.id !== 'SP1');
});
check('contributor: deleting someone else\'s spot is refused (the order change alone is fine)', r.refused.length === 1 &&
  r.refused[0].change.before?.id === 'SP1' && r.allowed.length === 1, { refused: r.refused, allowed: r.allowed });
r = run('contributor', (p) => {
  p.datasets[0].samples[0].micrographs = p.datasets[0].samples[0].micrographs.filter((m: any) => m.id !== 'M3');
});
check('contributor: deleting my micrograph with someone else\'s spot beneath is refused for that spot', r.refused.some(
  (x) => x.change.before?.id === 'SP4') && r.allowed.some((c) => c.before?.id === 'M3'), r.refused);
r = run('contributor', (p) => {
  p.datasets[0].samples[0].micrographs = p.datasets[0].samples[0].micrographs.filter((m: any) => m.id !== 'M2');
});
check('contributor: deleting my micrograph with only my spots is allowed', r.refused.length === 0, r.refused);
r = run('contributor', (p) => {
  p.name = 'Renamed';
});
check('contributor: the project settings are refused', r.refused.length === 1 && r.refused[0].problem === 'settings', r.refused);
r = run('contributor', (p) => {
  p.datasets.push({ id: 'D2', name: 'new', samples: [] });
});
check('contributor: a new dataset (project order changes) is allowed', r.refused.length === 0 && r.allowed.length === 2, r.changes);
r = run('contributor', (p) => {
  const sp = mic(p, 'M1').spots.find((s: any) => s.id === 'SP1');
  mic(p, 'M1').spots = mic(p, 'M1').spots.filter((s: any) => s.id !== 'SP1');
  mic(p, 'M2').spots.push(sp);
});
check('contributor: moving someone else\'s spot is refused', r.refused.length === 1 && r.refused[0].change.before?.id === 'SP1', r.refused);
r = run('contributor', (p) => {
  const sp = mic(p, 'M1').spots.find((s: any) => s.id === 'SP2');
  mic(p, 'M1').spots = mic(p, 'M1').spots.filter((s: any) => s.id !== 'SP2');
  mic(p, 'M2').spots.push(sp);
});
check('contributor: moving my spot (both micrographs reorder) is allowed', r.refused.length === 0 && r.allowed.length === 3, r.changes);
r = run('contributor', (p) => {
  p.datasets[0].samples[0].isExpanded = true;
  p.presetKeyBindings = { 1: 'x' };
});
check('contributor: per-user fields are not changes at all', r.changes.length === 0, r.changes);
check('contributor: an entity with no recorded creator is mine', canEditEntity(as('contributor'), 'spot', 'MADE-HERE') &&
  creatorOf(as('contributor'), 'spot', 'MADE-HERE') === null);
check('contributor: creator of someone else\'s entity is named', creatorOf(as('contributor'), 'spot', 'SP1') === OWNER &&
  creatorOf(as('contributor'), 'spot', 'SP2') === null);
check('contributor: never the project entity', !canEditEntity(as('contributor'), 'project', 'P'));

// What a delete would take along (checked before a Contributor deletes)
check('others beneath my micrograph with an owner spot: 1', othersBeneath(as('contributor'), project(), 'micrograph', 'M3') === 1);
check('others beneath my micrograph with only my spots: 0', othersBeneath(as('contributor'), project(), 'micrograph', 'M2') === 0);
const nested = project();
mic(nested, 'M2').spots = [];
nested.datasets[0].samples[0].micrographs.push({ id: 'M4', name: 'owner overlay on mine', parentID: 'M2', spots: [] });
authors['micrograph:M4'] = OWNER;
check('others beneath: a micrograph nested under mine counts', othersBeneath(as('contributor'), nested, 'micrograph', 'M2') === 1);
delete authors['micrograph:M4'];
check('others beneath the sample (owner and mine mixed)', othersBeneath(as('contributor'), project(), 'sample', 'S1') === 3);
check('editors are never blocked', othersBeneath(as('editor'), project(), 'sample', 'S1') === 0);

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${passes} checks passed)`);
process.exit(failures === 0 ? 0 : 1);
