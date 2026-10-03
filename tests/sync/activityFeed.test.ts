/**
 * Unit tests of the activity panel's grouping and wording
 * (src/utils/activityFeed.ts, spec v3 17m, 17v).
 *
 *   npm run test:activity-feed
 */

import { groupActivity, lineText, whenText, canRestore, restoreFailureText, type ActivityLookup } from '@/utils/activityFeed';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const ME = 2;
const MAYA: SyncUser = { pkey: 7, name: 'Maya Chen' };
const YOU: SyncUser = { pkey: ME, name: 'Jason Ash' };
const T0 = Date.parse('2026-10-03T14:00:00.000Z');
let seq = 1000;

function row(over: Partial<SyncHistoryRow> & { at?: string }): SyncHistoryRow {
  return {
    seq: seq--, pushId: 'push-a', type: 'spot', id: 'S1', op: 'create', name: null,
    parentType: 'micrograph', parentId: 'M1', movedFrom: null, changedPaths: null,
    user: MAYA, onBehalfOf: null, at: new Date(T0).toISOString(), here: false, pending: false,
    ...over,
  };
}
const min = (n: number) => new Date(T0 - n * 60_000).toISOString();

const local: Record<string, string> = { 'micrograph:M1': 'TS-12 ppl', 'micrograph:M2': 'TS-12 xpl', 'sample:SA': 'Basalt', 'spot:S1': 'Garnet 1' };
const look: ActivityLookup = {
  me: ME,
  nameOf: (t, id) => local[`${t}:${id}`] ?? null,
  exists: (t, id) => `${t}:${id}` in local,
};

// A burst of creates under one micrograph, newest first
let g = groupActivity([
  row({ id: 'S3', name: 'Garnet 3', at: min(0) }),
  row({ id: 'S2', name: 'Garnet 2', at: min(4) }),
  row({ id: 'S1', name: 'Garnet 1', at: min(9) }),
], look);
check('three spots in 9 minutes: one line', g.length === 1 && lineText(g[0]) === "Maya Chen added 3 spots to micrograph 'TS-12 ppl'", g.map(lineText));
check('a burst selects the parent', g[0].target?.type === 'micrograph' && g[0].target?.id === 'M1', g[0].target);
check('newest seq is the key, all seqs kept', g[0].seqs.length === 3 && g[0].key === String(g[0].seqs[0]));

g = groupActivity([row({ id: 'S2', at: min(0) }), row({ id: 'S1', at: min(11) })], look);
check('more than 10 minutes apart: two lines', g.length === 2, g.map(lineText));

g = groupActivity([row({ id: 'S1', name: 'Garnet 1', at: min(0) })], look);
check('one create names it and selects it', lineText(g[0]) === "Maya Chen added spot 'Garnet 1' to micrograph 'TS-12 ppl'" &&
  g[0].target?.id === 'S1', [lineText(g[0]), g[0].target]);

// Other people, other kinds, other parents break a burst
g = groupActivity([
  row({ id: 'S4', at: min(0) }),
  row({ id: 'S5', at: min(1), user: YOU }),
  row({ id: 'S6', at: min(2), parentId: 'M2' }),
  row({ id: 'S7', at: min(3), op: 'update', changedPaths: ['name'] }),
], look);
check('person, parent and kind each start a new line', g.length === 4, g.map(lineText));
check('my account reads You', g[1].you && lineText(g[1]).startsWith('You added'), lineText(g[1]));

// Pending changes never join changes already in my copy
g = groupActivity([row({ id: 'S8', at: min(0), pending: true }), row({ id: 'S9', at: min(1) })], look);
check('pending and in-copy changes stay apart', g.length === 2 && g[0].pending && !g[1].pending);

// Updates: fields named, file refs by kind, project settings
g = groupActivity([row({ id: 'S1', op: 'update', changedPaths: ['name', 'notes'], name: 'Garnet 1' })], look);
check('one update names the fields', lineText(g[0]) === "Maya Chen changed Name, Notes of spot 'Garnet 1'", lineText(g[0]));
g = groupActivity([row({ type: 'micrograph', id: 'M1', op: 'update', changedPaths: ['refs.image'], name: 'TS-12 ppl', parentType: 'sample', parentId: 'SA' })], look);
check('a replaced image reads Image', lineText(g[0]) === "Maya Chen changed Image of micrograph 'TS-12 ppl'", lineText(g[0]));
g = groupActivity([
  row({ id: 'S1', op: 'update', changedPaths: ['color'], at: min(0) }),
  row({ id: 'S2', op: 'update', changedPaths: ['color'], at: min(1) }),
], look);
check('updates to several spots', lineText(g[0]) === "Maya Chen changed 2 spots on micrograph 'TS-12 ppl'", lineText(g[0]));
g = groupActivity([
  row({ id: 'S1', op: 'update', changedPaths: ['name'], at: min(0) }),
  row({ id: 'S1', op: 'update', changedPaths: ['notes'], at: min(1) }),
], look);
check('repeated edits of one spot: one line, fields merged', g.length === 1 && lineText(g[0]).includes('changed Name, Notes of'), lineText(g[0]));
g = groupActivity([row({ type: 'project', id: 'P', op: 'update', changedPaths: ['name'], parentType: null, parentId: null })], look);
check('project settings', lineText(g[0]) === 'Maya Chen changed the project settings (Name)' && g[0].target === null, lineText(g[0]));

// Cascades fold into the topmost item
g = groupActivity([
  row({ type: 'micrograph', id: 'MX', op: 'delete', name: 'Old scan', parentType: 'sample', parentId: 'SA', pushId: 'p-del', at: min(0) }),
  row({ type: 'spot', id: 'X1', op: 'delete', parentType: 'micrograph', parentId: 'MX', pushId: 'p-del', at: min(0) }),
  row({ type: 'spot', id: 'X2', op: 'delete', parentType: 'micrograph', parentId: 'MX', pushId: 'p-del', at: min(0) }),
  row({ type: 'micrograph', id: 'MY', op: 'delete', parentType: 'micrograph', parentId: 'MX', pushId: 'p-del', at: min(0) }),
], look);
check('a cascaded delete is one line with what it held', g.length === 1 &&
  lineText(g[0]) === "Maya Chen deleted micrograph 'Old scan' (1 micrograph, 2 spots)", g.map(lineText));
check('a delete selects the parent; Restore offers the topmost', g[0].target?.type === 'sample' &&
  g[0].deleted.length === 1 && g[0].deleted[0].id === 'MX', g[0]);
g = groupActivity([
  row({ type: 'spot', id: 'X1', op: 'delete', parentType: 'micrograph', parentId: 'MX', pushId: 'p-other' }),
], look);
check('a delete without its parent in the same push stays its own line', g.length === 1 && g[0].text.startsWith("deleted an unnamed spot"), g.map(lineText));

// Moves, restores, whole-project operations
g = groupActivity([row({ type: 'micrograph', id: 'M2', op: 'update', changedPaths: [], movedFrom: 'SB', parentType: 'sample', parentId: 'SA', name: 'TS-12 xpl' })], look);
check('a move names the new parent', lineText(g[0]) === "Maya Chen moved micrograph 'TS-12 xpl' to sample 'Basalt'", lineText(g[0]));
g = groupActivity([row({ type: 'micrograph', id: 'M1', op: 'restore', name: 'TS-12 ppl', parentType: 'sample', parentId: 'SA' })], look);
check('a restore', lineText(g[0]) === "Maya Chen restored micrograph 'TS-12 ppl'" && g[0].deleted.length === 0, lineText(g[0]));
g = groupActivity([row({ type: 'project', id: 'P', op: 'replace_project', parentType: null, parentId: null })], look);
check('replace project', lineText(g[0]) === 'Maya Chen replaced the whole project');

// An accepted parked change names both people (17y)
g = groupActivity([row({ id: 'S1', op: 'update', changedPaths: ['name'], user: YOU, onBehalfOf: { pkey: 9, name: 'Dan' }, name: 'Garnet 1' })], look);
check('accepted parked change', lineText(g[0]) === "You accepted Dan's change: changed Name of spot 'Garnet 1'", lineText(g[0]));

// Restore (17n, 17w)
const del = groupActivity([row({ type: 'micrograph', id: 'MX', op: 'delete', name: 'Old scan', parentType: 'sample', parentId: 'SA' })], look)[0];
const myDel = groupActivity([row({ type: 'micrograph', id: 'MX', op: 'delete', user: YOU, parentType: 'sample', parentId: 'SA' })], look)[0];
const gone = groupActivity([row({ type: 'micrograph', id: 'M1', op: 'delete', parentType: 'sample', parentId: 'SA' })], look)[0];
check('restore: owners and editors on any deletion', canRestore(del, 'owner') && canRestore(del, 'editor'));
check('restore: a contributor only on their own', !canRestore(del, 'contributor') && canRestore(myDel, 'contributor'));
check('restore: never for viewers or unknown roles', !canRestore(myDel, 'viewer') && !canRestore(myDel, null));
check('restore: not when the item is back in my copy', gone.deleted.length === 0 && !canRestore(gone, 'owner'));
check('restore failure wording', restoreFailureText('parent_deleted').includes('Restore that first') &&
  restoreFailureText('whatever') === 'It could not be restored.');

// Times
const now = new Date(T0);
check('just now', whenText(min(0.5), now) === 'just now');
check('minutes', whenText(min(5), now) === '5 min ago');
check('yesterday', whenText(new Date(T0 - 26 * 3_600_000).toISOString(), now).startsWith('yesterday') ||
  whenText(new Date(T0 - 26 * 3_600_000).toISOString(), now).includes(','), whenText(new Date(T0 - 26 * 3_600_000).toISOString(), now));
check('older dates have a day', /\d/.test(whenText(new Date(T0 - 9 * 86_400_000).toISOString(), now)) &&
  whenText(new Date(T0 - 9 * 86_400_000).toISOString(), now).includes(','));

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
