/**
 * Tests for electron/shared/entityModel.mjs
 *
 *   node tests/sync/entityModel.test.mjs [server-dump.json]
 *
 * Synthetic cases always run. With a dump from the StraboBackend tool
 * tests/microsync/decompose_dump.php (the server's own normalize +
 * decompose over every dev project), every project is also compared with
 * the server change by change: same create order, parents, bodies, child
 * order, collapsed duplicates and stop reasons; and assemble() must give
 * back the server's normalized project.
 */

import fs from 'node:fs';
import {
  explode, assemble, collectPerUserFields, normalizeChildOrder, perUserFields,
  ExplodeError, entityKey,
} from '../../electron/shared/entityModel.mjs';
import { deepEqual } from '../../electron/shared/deepEqual.mjs';

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) {
    passes++;
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 1500)}` : ''}`);
  }
}
function section(name) { console.log(`\n== ${name}`); }

function stopReason(fn) {
  try { fn(); return null; } catch (e) { return e instanceof ExplodeError ? e.reason : `other: ${e.message}`; }
}

function withoutPerUser(type, body) {
  const out = { ...body };
  for (const f of perUserFields(type)) delete out[f];
  return out;
}

// ---------------------------------------------------------------------------
section('Synthetic');

const base = () => ({
  id: 'P', name: 'Project', presetKeyBindings: { 1: 'pre1' }, grainAnalysisSpotFilter: 'all',
  datasets: [{
    id: 'D1', name: 'Dataset', isExpanded: true,
    samples: [{
      id: 'S1', name: 'Sample', isExpanded: false,
      micrographs: [
        { id: 'M2', name: 'nested', parentID: 'M1', spots: [{ id: 'X2', name: 'b' }] },
        { id: 'M1', name: 'reference', isSpotExpanded: true, spots: [{ id: 'X1', name: 'a', tags: ['T1'] }] },
        { id: 'M3', name: 'dangling', parentID: 'GONE' },
      ],
    }],
  }],
  tags: [{ id: 'T1', name: 'tag', spotIDs: ['X1'] }],
  groups: [{ id: 'G1', name: 'group', micrographs: ['M1'] }],
  presets: null,
});

{
  const { entities, order, duplicatesCollapsed } = explode(base(), [{ id: 'PC1', micrographId: 'M1', points: [], isExpanded: true }]);
  check('create order: project, tag, group, dataset, sample, M1+spot, M3, M2+spot, point count',
    deepEqual(order, ['project:P', 'tag:T1', 'group:G1', 'dataset:D1', 'sample:S1', 'micrograph:M1', 'spot:X1',
      'micrograph:M3', 'micrograph:M2', 'spot:X2', 'point_count:PC1']), JSON.stringify(order));
  check('no duplicates', duplicatesCollapsed === 0);
  const p = entities['project:P'];
  check('project body: no child collections, no per-user fields',
    deepEqual(p.body, { id: 'P', name: 'Project' }), JSON.stringify(p.body));
  check('project child order (server key order, missing list filled)',
    deepEqual(p.childOrder, { datasets: ['D1'], tags: ['T1'], groups: ['G1'], presets: [] }) &&
    deepEqual(Object.keys(p.childOrder), ['datasets', 'tags', 'groups', 'presets']), JSON.stringify(p.childOrder));
  check('micrograph body keeps parentID, drops spots and isSpotExpanded',
    deepEqual(entities['micrograph:M1'].body, { id: 'M1', name: 'reference' }) && entities['micrograph:M2'].body.parentID === 'M1');
  check('missing spots list becomes an empty child order', deepEqual(entities['micrograph:M3'].childOrder, { spots: [] }));
  check('spot is a leaf (no childOrder), parent is its micrograph',
    entities['spot:X1'].childOrder === undefined && entities['spot:X1'].parentType === 'micrograph' && entities['spot:X1'].parentId === 'M1');
  check('id lists stay ordinary fields', deepEqual(entities['group:G1'].body.micrographs, ['M1']) && deepEqual(entities['spot:X1'].body.tags, ['T1']));
  check('point count: parent micrograph, per-user dropped',
    entities['point_count:PC1'].parentId === 'M1' && entities['point_count:PC1'].body.isExpanded === undefined);

  const back = assemble(entities, 'P', { order });
  check('assemble gives the normalized project back (children in stored order)',
    back && deepEqual(back.project.datasets[0].samples[0].micrographs.map((m) => m.id), ['M2', 'M1', 'M3']) &&
    deepEqual(back.project.presets, []) && back.project.presetKeyBindings === undefined);
  check('assemble returns point counts', back && back.pointCounts.length === 1 && back.pointCounts[0].id === 'PC1');

  const withUser = assemble(entities, 'P', { order, perUser: collectPerUserFields(base()) });
  check('per-user fields restored from the local project',
    withUser && deepEqual(withUser.project.presetKeyBindings, { 1: 'pre1' }) && withUser.project.grainAnalysisSpotFilter === 'all' &&
    withUser.project.datasets[0].isExpanded === true && withUser.project.datasets[0].samples[0].isExpanded === false &&
    withUser.project.datasets[0].samples[0].micrographs[1].isSpotExpanded === true);
  check('assemble without the project entity -> null', assemble({}, 'P') === null);
  const again = explode(withUser.project, withUser.pointCounts);
  check('explode(assemble(explode(x))) == explode(x)', deepEqual(again.entities, entities) && deepEqual(again.order, order));
}

{
  const x = base();
  x.datasets[0].samples[0].micrographs[0].spots[0].note = undefined;
  x.datasets[0].samples[0].micrographs[0].fn = () => 1;
  const { entities } = explode(x);
  check('undefined values and functions dropped (as saved to disk)',
    !('note' in entities['spot:X2'].body) && !('fn' in entities['micrograph:M2'].body));
}

{
  const x = base();
  x.datasets[0].samples[0].micrographs[1].parentID = 'M2'; // M1 <-> M2 loop
  const { order } = explode(x);
  check('parentID loop still emitted (server rejects it)', order.includes('micrograph:M1') && order.includes('micrograph:M2'));
}

{
  const x = base();
  const dup = JSON.parse(JSON.stringify(x.datasets[0].samples[0].micrographs[1].spots[0]));
  x.datasets[0].samples[0].micrographs[1].spots.push(dup);
  const r = explode(x);
  check('identical duplicate under the same parent collapsed', r.duplicatesCollapsed === 1 && r.entities['micrograph:M1'].childOrder.spots.length === 1);
  const y = base();
  y.datasets[0].samples[0].micrographs[1].spots.push({ ...dup, name: 'other' });
  check('differing duplicate stops (duplicate_differs)', stopReason(() => explode(y)) === 'duplicate_differs');
  const z = base();
  z.datasets[0].samples[0].micrographs[0].spots.push(dup);
  check('identical duplicate under another parent stops', stopReason(() => explode(z)) === 'duplicate_differs');
  const w = base();
  w.datasets[0].samples[0].micrographs[0].spots = { a: 1 };
  check('child collection that is not a list stops (bad_json)', stopReason(() => explode(w)) === 'bad_json');
  const v = base();
  v.datasets[0].samples[0].micrographs[0].spots.push({ name: 'no id' });
  check('child without id stops (bad_id)', stopReason(() => explode(v)) === 'bad_id');
  check('project without id stops (bad_id)', stopReason(() => explode({ name: 'x' })) === 'bad_id');
  check('point count without id stops (bad_id)', stopReason(() => explode(base(), [{ micrographId: 'M1' }])) === 'bad_id');
}

check('normalizeChildOrder: stored first, unknown and repeated dropped, missing appended',
  deepEqual(normalizeChildOrder('sample', { micrographs: ['B', 'GONE', 'A', 'B'] }, { micrograph: ['A', 'B', 'C'] }), { micrographs: ['B', 'A', 'C'] }));
check('normalizeChildOrder: no stored order -> creation order',
  deepEqual(normalizeChildOrder('micrograph', undefined, { spot: ['s2', 's1'] }), { spots: ['s2', 's1'] }));

{
  const { entities, order } = explode(base());
  const reordered = { ...entities, 'sample:S1': { ...entities['sample:S1'], childOrder: { micrographs: ['M3', 'NOPE'] } } };
  const r = assemble(reordered, 'P', { order });
  check('assemble applies stored order, appends the rest in creation order',
    deepEqual(r.project.datasets[0].samples[0].micrographs.map((m) => m.id), ['M3', 'M1', 'M2']),
    JSON.stringify(r.project.datasets[0].samples[0].micrographs.map((m) => m.id)));
  const extra = { ...entities, 'spot:NEW': { type: 'spot', id: 'NEW', parentType: 'micrograph', parentId: 'M1', body: { id: 'NEW' } } };
  const r2 = assemble(extra, 'P', { order });
  check('entity missing from the creation order still assembled (appended)',
    deepEqual(r2.project.datasets[0].samples[0].micrographs[1].spots.map((s) => s.id), ['X1', 'NEW']));
  check('entity key format', entityKey('spot', 'abc') === 'spot:abc');
}

// ---------------------------------------------------------------------------
const dumpPath = process.argv[2];
if (dumpPath) {
  section(`Server comparison (${dumpPath})`);
  const cases = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  let entitiesCompared = 0;
  for (const c of cases) {
    const label = c.source;
    if (!c.ok) {
      const reason = stopReason(() => explode(c.input, c.pointCounts));
      check(`${label}: stops like the server (${c.reason})`, reason === c.reason, `client: ${reason}`);
      continue;
    }
    let r;
    try {
      r = explode(c.input, c.pointCounts);
    } catch (e) {
      check(`${label}: explode`, false, e.message);
      continue;
    }
    const serverOrder = c.changes.map((ch) => entityKey(ch.type, ch.id));
    check(`${label}: same create order (${serverOrder.length})`, deepEqual(r.order, serverOrder),
      JSON.stringify(serverOrder.find((k, i) => r.order[i] !== k)));
    const collapsedWarn = (c.warnings || []).find((w) => w.includes('identical duplicate'));
    const serverCollapsed = collapsedWarn ? parseInt(collapsedWarn, 10) : 0;
    check(`${label}: same collapsed duplicates (${serverCollapsed})`, r.duplicatesCollapsed === serverCollapsed);
    let bad = null;
    for (const ch of c.changes) {
      const e = r.entities[entityKey(ch.type, ch.id)];
      entitiesCompared++;
      const serverBody = ch.type === 'point_count' ? withoutPerUser('point_count', ch.body) : ch.body;
      const same = e && e.parentType === (ch.parentType ?? null) && e.parentId === (ch.parentId ?? null) &&
        deepEqual(e.body, serverBody) && deepEqual(e.childOrder, ch.childOrder);
      if (!same) { bad = { key: entityKey(ch.type, ch.id), client: e, server: ch }; break; }
    }
    check(`${label}: every entity equal (parent, body, child order)`, bad === null, JSON.stringify(bad));
    const back = assemble(r.entities, c.input.id, { order: r.order });
    check(`${label}: assemble == server normalized project`, back !== null && deepEqual(back.project, c.normalized));
    check(`${label}: assemble returns the point counts`,
      back !== null && deepEqual(back.pointCounts.map((p) => p.id).sort(), c.pointCounts.map((p) => p.id).sort()));
    const withUser = assemble(r.entities, c.input.id, { order: r.order, perUser: collectPerUserFields(c.input) });
    const again = explode(withUser.project, withUser.pointCounts);
    check(`${label}: per-user fields survive a round trip`,
      deepEqual(Object.fromEntries(collectPerUserFields(withUser.project)), Object.fromEntries(collectPerUserFields(c.input))));
    check(`${label}: explode(assemble(explode(x))) == explode(x)`, deepEqual(again.entities, r.entities));
  }
  console.log(`  ${cases.length} projects, ${entitiesCompared} entities compared with the server`);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
