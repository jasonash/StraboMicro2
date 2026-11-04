/**
 * Unit tests of which composite thumbnails go stale (src/utils/compositeRefresh.ts),
 * and which ones to make again when a pull's images arrive.
 *
 *   npm run test:composite-refresh
 */

import { compositesAffectedBy, compositesShowing } from '@/utils/compositeRefresh';
import type { ProjectMetadata } from '@/types/project-types';
import type { EntityChange } from '../../electron/shared/entityModel.mjs';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const m = (id: string, body: Record<string, unknown>) =>
  ({ type: 'micrograph', id, parentType: 'sample', parentId: 's1', body: { id, ...body } }) as unknown as NonNullable<EntityChange['after']>;
const change = (before: EntityChange['before'], after: EntityChange['after']): EntityChange =>
  ({ key: `micrograph:${(after ?? before)!.id}`, before, after });
const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

check('rotated child: its parent', eq(compositesAffectedBy([change(m('c', { parentID: 'p', rotation: 0 }), m('c', { parentID: 'p', rotation: 15 }))]), ['p']));
check('renamed child: nothing', eq(compositesAffectedBy([change(m('c', { parentID: 'p', name: 'a' }), m('c', { parentID: 'p', name: 'b' }))]), []));
check('moved to another parent: both', eq(compositesAffectedBy([change(m('c', { parentID: 'p' }), m('c', { parentID: 'q' }))]), ['p', 'q']));
check('child removed: its parent', eq(compositesAffectedBy([change(m('c', { parentID: 'p' }), null)]), ['p']));
check('child brought back: parent, and itself when asked',
  eq(compositesAffectedBy([change(null, m('c', { parentID: 'p' }))], { withCreated: true }), ['p', 'c']) &&
  eq(compositesAffectedBy([change(null, m('c', { parentID: 'p' }))]), ['p']));
check('reference micrograph edited: nothing', eq(compositesAffectedBy([change(m('r', { rotation: 0 }), m('r', { rotation: 90 }))]), []));
check('spots are not drawn', eq(compositesAffectedBy([{ key: 'spot:x', before: null, after: { type: 'spot', id: 'x', parentType: 'micrograph', parentId: 'p', body: { id: 'x' } } as unknown as NonNullable<EntityChange['after']> }]), []));

// Images arrived: the composites that show them (parents, and each one with children)
const tree = {
  datasets: [{ samples: [{ micrographs: [
    { id: 'ref' }, { id: 'child', parentID: 'ref' }, { id: 'grandchild', parentID: 'child' }, { id: 'lone' },
  ] }] }],
} as unknown as ProjectMetadata;
check('arrived child: its parent', eq(compositesShowing(tree, ['grandchild']), ['child']));
check('arrived middle micrograph: its parent and itself', eq(compositesShowing(tree, ['child']), ['ref', 'child']));
check('arrived micrograph without parent or children: nothing', eq(compositesShowing(tree, ['lone']), []));
check('no project: nothing', eq(compositesShowing(null, ['child']), []));

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
