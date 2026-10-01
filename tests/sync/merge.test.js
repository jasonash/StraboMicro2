/**
 * Unit tests of the three-way merge (electron/sync/merge.js).
 *
 *   npm run test:merge
 */

const { mergeValue, mergeEntity, mergeProject, mergeIdSet } = require('../../electron/sync/merge');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 2000)}` : ''}`);
  }
}
const J = (v) => JSON.stringify(v);
const eq = (a, b) => J(a) === J(b);

/** An entity state. */
function st(type, id, body, extra = {}) {
  return { type, id, parentType: extra.parentType ?? 'sample', parentId: extra.parentId ?? 's1', body: { id, ...body }, ...(extra.childOrder ? { childOrder: extra.childOrder } : {}) };
}
const m = (body, extra) => st('micrograph', 'm1', body, extra);

// --- Field merge -----------------------------------------------------------
{
  const r = mergeEntity(m({ name: 'a', notes: 'n' }), m({ name: 'mine', notes: 'n' }), m({ name: 'a', notes: 'theirs' }));
  check('different fields merge', r.conflicts.length === 0 && r.state.body.name === 'mine' && r.state.body.notes === 'theirs', J(r));
}
{
  const base = m({ mineralogy: { notes: 'x', minerals: [{ name: 'Qtz' }] } });
  const r = mergeEntity(base, m({ mineralogy: { notes: 'mine', minerals: [{ name: 'Qtz' }] } }),
    m({ mineralogy: { notes: 'x', minerals: [{ name: 'Qtz' }, { name: 'Fsp' }] } }));
  check('nested fields merge separately', r.conflicts.length === 0 && r.state.body.mineralogy.notes === 'mine' &&
    r.state.body.mineralogy.minerals.length === 2, J(r));
}
{
  const r = mergeEntity(m({ name: 'a' }), m({ name: 'mine' }), m({ name: 'theirs' }));
  check('same field, different values: conflict, mine kept', r.state.body.name === 'mine' && r.conflicts.length === 1 &&
    eq(r.conflicts[0].path, ['name']) && r.conflicts[0].theirs === 'theirs' && r.conflicts[0].base === 'a', J(r));
}
{
  const r = mergeEntity(m({ name: 'a' }), m({ name: 'same' }), m({ name: 'same' }));
  check('same change on both sides: no conflict', r.conflicts.length === 0 && r.state.body.name === 'same');
}
{
  const base = m({ mineralogy: { minerals: [{ name: 'Qtz' }] } });
  const r = mergeEntity(base, m({ mineralogy: { minerals: [{ name: 'Qtz' }, { name: 'Bt' }] } }),
    m({ mineralogy: { minerals: [{ name: 'Qtz' }, { name: 'Ms' }] } }));
  check('feature lists are one value: both changed = conflict', r.conflicts.length === 1 &&
    eq(r.conflicts[0].path, ['mineralogy', 'minerals']), J(r.conflicts));
}
{
  const r = mergeEntity(m({ notes: 'a', x: null }), m({ notes: 'a' }), m({ notes: 'b', x: null }));
  check('null and missing are the same', r.conflicts.length === 0 && r.state.body.notes === 'b', J(r));
}
{
  const r = mergeEntity(m({ notes: 'a' }), m({}), m({ notes: 'a' }));
  check('field removed by me stays removed', r.conflicts.length === 0 && !('notes' in r.state.body), J(r));
  const r2 = mergeEntity(m({ notes: 'a' }), m({}), m({ notes: 'b' }));
  check('removed by me, changed by them: conflict', r2.conflicts.length === 1, J(r2));
}
{
  const r = mergeEntity(m({ info: { a: 1 } }), m({ info: { a: 1, b: 2 } }), m({ info: { a: 1, c: 3 } }));
  check('both add different keys to an object', r.conflicts.length === 0 && eq(r.state.body.info, { a: 1, b: 2, c: 3 }), J(r));
  const r2 = mergeEntity(m({}), m({ info: { b: 2 } }), m({ info: { c: 3 } }));
  check('object added on both sides merges by key', r2.conflicts.length === 0 && eq(r2.state.body.info, { b: 2, c: 3 }), J(r2));
}

// --- Id sets ---------------------------------------------------------------
{
  check('id set: adds and removes from both sides', eq(mergeIdSet(['a', 'b', 'c'], ['a', 'c', 'd'], ['b', 'c', 'e']), ['c', 'd', 'e']));
  const sp = (tags) => st('spot', 'p1', { tags }, { parentType: 'micrograph', parentId: 'm1' });
  const r = mergeEntity(sp(['t1']), sp(['t1', 't2']), sp(['t1', 't3']));
  check('spot tags merge as a set', r.conflicts.length === 0 && eq(r.state.body.tags, ['t1', 't2', 't3']), J(r));
  const g = (body) => st('group', 'g1', body, { parentType: 'project', parentId: 'P' });
  const r2 = mergeEntity(g({ micrographs: ['m1'], spotIDs: [] }), g({ micrographs: ['m1', 'm2'], spotIDs: ['s1'] }),
    g({ micrographs: [], spotIDs: ['s2'] }));
  check('group membership merges as sets', r2.conflicts.length === 0 && eq(r2.state.body.micrographs, ['m2']) &&
    eq(r2.state.body.spotIDs, ['s1', 's2']), J(r2));
  const r3 = mergeEntity(m({ tags: ['a'] }), m({ tags: ['a', 'b'] }), m({ tags: ['c'] }));
  check('micrograph tags merge as a set', r3.conflicts.length === 0 && eq(r3.state.body.tags, ['b', 'c']), J(r3));
  const r4 = mergeEntity(m({ other: ['a'] }), m({ other: ['a', 'b'] }), m({ other: ['c'] }));
  check('a list that is not an id set stays atomic', r4.conflicts.length === 1);
}

// --- modifiedTimestamp -------------------------------------------------------
{
  const r = mergeEntity(m({ modifiedTimestamp: '2026-10-01T10:00:00Z', name: 'a' }),
    m({ modifiedTimestamp: '2026-10-01T12:00:00Z', name: 'mine' }), m({ modifiedTimestamp: '2026-10-01T11:00:00Z', name: 'a', notes: 'x' }));
  check('modifiedTimestamp: later wins (ISO)', r.conflicts.length === 0 && r.state.body.modifiedTimestamp === '2026-10-01T12:00:00Z', J(r));
  const sp = (body) => st('spot', 'p1', body, { parentType: 'micrograph', parentId: 'm1' });
  const r2 = mergeEntity(sp({ modifiedTimestamp: 1 }), sp({ modifiedTimestamp: 5, name: 'n' }), sp({ modifiedTimestamp: 9, color: 'red' }));
  check('modifiedTimestamp: later wins (epoch ms)', r2.conflicts.length === 0 && r2.state.body.modifiedTimestamp === 9 &&
    r2.state.body.name === 'n' && r2.state.body.color === 'red', J(r2));
}

// --- Sketch layers -------------------------------------------------------------
{
  const L = (id, strokes = [], textItems = [], extra = {}) => ({ id, name: id, visible: true, createdAt: 't', strokes, textItems, ...extra });
  const s = (id) => ({ id, points: [1, 2, 3, 4] });
  const base = m({ sketchLayers: [L('L1', [s('a')])] });
  const r = mergeEntity(base, m({ sketchLayers: [L('L1', [s('a'), s('b')]), L('L2')] }),
    m({ sketchLayers: [L('L1', [s('a'), s('c')]), L('L3')] }));
  const layers = r.state.body.sketchLayers;
  check('sketch: new layers from both sides kept', r.conflicts.length === 0 && eq(layers.map((l) => l.id), ['L1', 'L2', 'L3']), J(r));
  check('sketch: strokes added to one layer by both sides kept', eq(layers[0].strokes.map((x) => x.id), ['a', 'b', 'c']), J(layers[0]));
  const r2 = mergeEntity(base, m({ sketchLayers: [L('L1', [])] }), m({ sketchLayers: [L('L1', [s('a')], [], { name: 'Renamed' })] }));
  check('sketch: stroke deleted by me, layer renamed by them', r2.conflicts.length === 0 &&
    r2.state.body.sketchLayers[0].strokes.length === 0 && r2.state.body.sketchLayers[0].name === 'Renamed', J(r2));
  const t = (text) => ({ id: 'x1', x: 0, y: 0, text });
  const r3 = mergeEntity(m({ sketchLayers: [L('L1', [], [t('a')])] }), m({ sketchLayers: [L('L1', [], [t('mine')])] }),
    m({ sketchLayers: [L('L1', [], [t('theirs')])] }));
  check('sketch: same text edited both sides = conflict on that text', r3.conflicts.length === 1 &&
    eq(r3.conflicts[0].path, ['sketchLayers', '[L1]', 'textItems', '[x1]', 'text']), J(r3.conflicts));
  const r4 = mergeEntity(base, m({ sketchLayers: [] }), m({ sketchLayers: [L('L1', [s('a')], [], { visible: false })] }));
  check('sketch: layer deleted by me, changed by them = conflict', r4.conflicts.length === 1 &&
    eq(r4.conflicts[0].path, ['sketchLayers', '[L1]']), J(r4.conflicts));
}

// --- Parent and child order -------------------------------------------------------
{
  const r = mergeEntity(m({}), m({}), m({}, { parentId: 's2' }));
  check('moved by them only: moved', r.conflicts.length === 0 && r.state.parentId === 's2');
  const r2 = mergeEntity(m({}), m({}, { parentId: 's3' }), m({}, { parentId: 's2' }));
  check('moved differently on both sides: conflict, mine kept', r2.conflicts.length === 1 && eq(r2.conflicts[0].path, ['@parent']) &&
    r2.state.parentId === 's3');
  const r3 = mergeEntity(m({}), m({}, { parentId: 's3' }), m({ name: 'x' }));
  check('moved by me, edited by them: both', r3.conflicts.length === 0 && r3.state.parentId === 's3' && r3.state.body.name === 'x');
  const sm = (order) => st('sample', 's1', {}, { parentType: 'dataset', parentId: 'd1', childOrder: { micrographs: order } });
  check('order: theirs when I did not reorder', eq(mergeEntity(sm(['a', 'b']), sm(['a', 'b']), sm(['b', 'a'])).state.childOrder.micrographs, ['b', 'a']));
  check('order: mine when only I reordered', eq(mergeEntity(sm(['a', 'b']), sm(['b', 'a']), sm(['a', 'b'])).state.childOrder.micrographs, ['b', 'a']));
  const both = mergeEntity(sm(['a', 'b', 'c']), sm(['c', 'a', 'b']), sm(['b', 'a', 'c']));
  check('order: theirs when both reordered, never a conflict', both.conflicts.length === 0 && eq(both.state.childOrder.micrographs, ['b', 'a', 'c']));
}

// --- mergeValue misc ---------------------------------------------------------------
{
  const r = mergeValue(1, 2, 3, 'micrograph', ['scale']);
  check('scalar conflict reports base, mine, theirs', r.value === 2 && eq(r.conflicts[0], { path: ['scale'], base: 1, mine: 2, theirs: 3 }));
}

// --- mergeProject -------------------------------------------------------------------
{
  // Project: dataset d1 > sample s1 > micrographs m1 (spots p1, p2), m2 nested in m1 (parentID), m3
  const D = st('dataset', 'd1', { name: 'D' }, { parentType: 'project', parentId: 'P', childOrder: { samples: ['s1'] } });
  const S = st('sample', 's1', { label: 'S' }, { parentType: 'dataset', parentId: 'd1', childOrder: { micrographs: ['m1', 'm2', 'm3'] } });
  const M1 = st('micrograph', 'm1', { name: 'M1' }, { childOrder: { spots: ['p1', 'p2'] } });
  const M2 = st('micrograph', 'm2', { name: 'M2', parentID: 'm1' }, { childOrder: { spots: [] } });
  const M3 = st('micrograph', 'm3', { name: 'M3' }, { childOrder: { spots: [] } });
  const P1 = st('spot', 'p1', { name: 'P1' }, { parentType: 'micrograph', parentId: 'm1' });
  const P2 = st('spot', 'p2', { name: 'P2' }, { parentType: 'micrograph', parentId: 'm1' });
  const all = [D, S, M1, M2, M3, P1, P2];
  const key = (e) => `${e.type}:${e.id}`;
  const baseOf = (list) => Object.fromEntries(list.map((e) => [key(e), { ...e, version: 1 }]));
  const mineOf = (list) => ({ entities: Object.fromEntries(list.map((e) => [key(e), e])), order: list.map(key) });
  const clone = (e, body = {}, extra = {}) => ({ ...JSON.parse(JSON.stringify(e)), ...extra, body: { ...e.body, ...body } });

  // Their edit, their create, nothing local
  {
    const P3 = st('spot', 'p3', { name: 'P3' }, { parentType: 'micrograph', parentId: 'm3' });
    const r = mergeProject(baseOf(all), mineOf(all), new Map([['micrograph:m3', clone(M3, { name: 'M3 theirs' })], ['spot:p3', P3]]));
    check('project: their edit and create applied', r.changes.length === 2 && r.conflicts.length === 0 && r.questions.length === 0 &&
      r.changes.some((c) => c.key === 'micrograph:m3' && c.after.body.name === 'M3 theirs') &&
      r.changes.some((c) => c.key === 'spot:p3' && c.before === null), J(r));
  }
  // Their delete of m1 (cascade p1, p2, nested m2), nothing changed locally
  {
    const theirs = new Map([['micrograph:m1', null], ['spot:p1', null], ['spot:p2', null], ['micrograph:m2', null]]);
    const r = mergeProject(baseOf(all), mineOf(all), theirs);
    const removed = r.changes.filter((c) => c.after === null).map((c) => c.key);
    check('project: their cascade delete applied', r.questions.length === 0 && removed.length === 4 &&
      removed.indexOf('micrograph:m1') > removed.indexOf('spot:p1') && removed.indexOf('micrograph:m1') > removed.indexOf('micrograph:m2'), J(r));
  }
  // Their delete of m1 while I edited spot p2
  {
    const theirs = new Map([['micrograph:m1', null], ['spot:p1', null], ['spot:p2', null], ['micrograph:m2', null]]);
    const mine = [D, S, M1, M2, M3, P1, clone(P2, { name: 'P2 mine' })];
    const r = mergeProject(baseOf(all), mineOf(mine), theirs);
    check('project: delete vs my edit beneath = question, nothing removed', r.changes.length === 0 && r.questions.length === 1 &&
      r.questions[0].kind === 'theirs_deleted' && r.questions[0].key === 'micrograph:m1' && r.questions[0].localChanges === 1 &&
      r.questions[0].keys.length === 4, J(r));
  }
  // Their delete of m1 while I added a spot to it
  {
    const theirs = new Map([['micrograph:m1', null], ['spot:p1', null], ['spot:p2', null], ['micrograph:m2', null]]);
    const P9 = st('spot', 'p9', { name: 'new' }, { parentType: 'micrograph', parentId: 'm1' });
    const r = mergeProject(baseOf(all), mineOf([...all, P9]), theirs);
    check('project: delete vs my new spot beneath = question', r.changes.length === 0 && r.questions.length === 1 &&
      r.questions[0].localChanges === 1 && r.questions[0].keys.includes('spot:p9'), J(r));
  }
  // They moved p2 to m3, then deleted m1
  {
    const theirs = new Map([['spot:p2', clone(P2, {}, { parentId: 'm3' })], ['micrograph:m1', null], ['spot:p1', null], ['micrograph:m2', null]]);
    const r = mergeProject(baseOf(all), mineOf(all), theirs);
    check('project: a child they moved out first survives their delete', r.questions.length === 0 &&
      !r.changes.some((c) => c.key === 'spot:p2' && c.after === null) &&
      r.changes.some((c) => c.key === 'spot:p2' && c.after && c.after.parentId === 'm3'), J(r));
  }
  // I deleted m3, they edited it / did not
  {
    const mine = [D, S, M1, M2, P1, P2];
    const r = mergeProject(baseOf(all), mineOf(mine), new Map([['micrograph:m3', clone(M3, { name: 'theirs' })]]));
    check('project: my delete vs their edit = question', r.changes.length === 0 && r.questions.length === 1 &&
      r.questions[0].kind === 'mine_deleted', J(r));
    const r2 = mergeProject(baseOf(all), mineOf(mine), new Map([['micrograph:m3', clone(M3, {}, { childOrder: { spots: [] } })]]));
    check('project: my delete stands when they changed nothing', r2.changes.length === 0 && r2.questions.length === 0, J(r2));
  }
  // I deleted m1 (with p1, p2 and nested m2): grouped under m1
  {
    const mine = [D, S, M3];
    const r = mergeProject(baseOf(all), mineOf(mine), new Map([['spot:p2', clone(P2, { name: 'theirs' })]]));
    const q = r.questions[0];
    check('project: my delete vs their edit beneath = one question at the top', r.questions.length === 1 && q.key === 'micrograph:m1' &&
      q.kind === 'mine_deleted' && q.theirChanges === 1 && ['micrograph:m1', 'micrograph:m2', 'spot:p1', 'spot:p2'].every((k) => q.keys.includes(k)) &&
      q.keys.length === 4 && q.keys[0] === 'micrograph:m1' && r.changes.length === 0, J(r));
    const P9 = st('spot', 'p9', { name: 'new' }, { parentType: 'micrograph', parentId: 'm2' });
    const r2 = mergeProject(baseOf(all), mineOf(mine), new Map([['spot:p9', P9]]));
    check('project: their new spot under my delete joins the question, not created', r2.questions.length === 1 &&
      r2.questions[0].key === 'micrograph:m1' && r2.questions[0].keys.includes('spot:p9') && r2.changes.length === 0, J(r2));
    const r3 = mergeProject(baseOf(all), mineOf(mine), new Map([['spot:p2', clone(P2)]]));
    check('project: my delete stands when nothing beneath changed', r3.questions.length === 0 && r3.changes.length === 0, J(r3));
    const r4 = mergeProject(baseOf(all), mineOf([D]), new Map([['micrograph:m3', clone(M3, { name: 'theirs' })], ['spot:p1', clone(P1, { name: 'x' })]]));
    check('project: whole sample deleted = one question at the sample', r4.questions.length === 1 &&
      r4.questions[0].key === 'sample:s1' && r4.questions[0].theirChanges === 2 && r4.questions[0].keys.length === 6, J(r4));
  }
  // Conflict: same field
  {
    const r = mergeProject(baseOf(all), mineOf([D, S, clone(M1, { name: 'mine' }), M2, M3, P1, P2]),
      new Map([['micrograph:m1', clone(M1, { name: 'theirs', notes: 'n' })]]));
    check('project: conflict reported, other fields merged', r.conflicts.length === 1 && r.conflicts[0].key === 'micrograph:m1' &&
      r.changes.length === 1 && r.changes[0].after.body.name === 'mine' && r.changes[0].after.body.notes === 'n', J(r));
  }
  // Their state equal to mine: nothing to do
  {
    const r = mergeProject(baseOf(all), mineOf([D, S, clone(M1, { name: 'x' }), M2, M3, P1, P2]),
      new Map([['micrograph:m1', clone(M1, { name: 'x' })]]));
    check('project: same change both sides = no local change', r.changes.length === 0 && r.conflicts.length === 0, J(r));
  }
}

// --- Membership ids of deleted entities (§4.5) ------------------------------------------
{
  const T1 = st('tag', 't1', { name: 'T1' }, { parentType: 'project', parentId: 'P' });
  const T2 = st('tag', 't2', { name: 'T2' }, { parentType: 'project', parentId: 'P' });
  const G1 = st('group', 'g1', { name: 'G1', micrographs: ['m1', 'm2'] }, { parentType: 'project', parentId: 'P' });
  const M1 = st('micrograph', 'm1', { name: 'M1', tags: ['t1'] }, { childOrder: { spots: ['p1'] } });
  const M2 = st('micrograph', 'm2', { name: 'M2' }, { childOrder: { spots: [] } });
  const P1 = st('spot', 'p1', { name: 'P1', tags: ['t2'] }, { parentType: 'micrograph', parentId: 'm1' });
  const all = [T1, T2, G1, M1, M2, P1];
  const key = (e) => `${e.type}:${e.id}`;
  const baseOf = (list) => Object.fromEntries(list.map((e) => [key(e), { ...e, version: 1 }]));
  const mineOf = (list) => ({ entities: Object.fromEntries(list.map((e) => [key(e), e])), order: list.map(key) });
  const clone = (e, body = {}) => ({ ...JSON.parse(JSON.stringify(e)), body: { ...e.body, ...body } });
  const after = (r, k) => (r.changes.find((c) => c.key === k) || {}).after;

  // They deleted tag t2 (their copy stripped p1.tags too); I tagged m1 with t2 meanwhile
  {
    const r = mergeProject(baseOf(all), mineOf([T1, T2, G1, clone(M1, { tags: ['t1', 't2'] }), M2, P1]),
      new Map([['tag:t2', null], ['spot:p1', clone(P1, { tags: [] })]]));
    check('members: their deleted tag dropped from my new tagging', J(after(r, 'micrograph:m1')?.body.tags) === J(['t1']) &&
      J(after(r, 'spot:p1')?.body.tags) === J([]) && r.changes.some((c) => c.key === 'tag:t2' && c.after === null), J(r));
  }
  // They deleted m2 (nothing local beneath); the group still lists it
  {
    const r = mergeProject(baseOf(all), mineOf(all), new Map([['micrograph:m2', null]]));
    check('members: their deleted micrograph dropped from a group', J(after(r, 'group:g1')?.body.micrographs) === J(['m1']), J(r));
  }
  // I deleted m2 (they did not touch it); they added it to a new group
  {
    const G2 = st('group', 'g2', { name: 'G2', micrographs: ['m2', 'm1'] }, { parentType: 'project', parentId: 'P' });
    const r = mergeProject(baseOf(all), mineOf([T1, T2, clone(G1, { micrographs: ['m1'] }), M1, P1]), new Map([['group:g2', G2]]));
    check('members: my deleted micrograph dropped from their new group', J(after(r, 'group:g2')?.body.micrographs) === J(['m1']), J(r));
  }
  // A delete question keeps the ids (an answer may bring the entity back)
  {
    const r = mergeProject(baseOf(all), mineOf([T1, T2, G1, M1, P1]), new Map([['micrograph:m2', clone(M2, { name: 'theirs' })]]));
    check('members: ids of a questioned delete stay', r.questions.length === 1 && !after(r, 'group:g1'), J(r));
    const r2 = mergeProject(baseOf(all), mineOf([T1, T2, G1, M1, P1]), new Map([['tag:t1', clone(T1, { name: 'x' })]]),
      { held: new Set(['micrograph:m2']) });
    check('members: ids of an earlier unanswered question stay', !after(r2, 'group:g1'), J(r2));
  }
  // Ids of entities the base never had (old dangling ids) are left alone
  {
    const G3 = st('group', 'g3', { name: 'G3', micrographs: ['m1', 'zz'] }, { parentType: 'project', parentId: 'P' });
    const r = mergeProject(baseOf([...all, G3]), mineOf([...all, G3]), new Map([['micrograph:m2', null]]));
    check('members: unknown ids stay', !after(r, 'group:g3') && J(after(r, 'group:g1')?.body.micrographs) === J(['m1']), J(r));
  }
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
