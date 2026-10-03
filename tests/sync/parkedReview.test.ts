/**
 * Unit tests of the owner's review of parked changes
 * (src/utils/parkedReview.ts, spec v3 17o, 17x-17aa): review rows against
 * the current project, and what Accept does to it.
 *
 *   npm run test:parked-review
 */

import { applyEntityChanges } from '../../electron/shared/entityModel.mjs';
import { buildReview, acceptChanges, currentEntities, waitingText } from '@/utils/parkedReview';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function project(): any {
  return {
    id: 'P', name: 'Project',
    datasets: [{
      id: 'D1', name: 'd',
      samples: [{
        id: 'S1', name: 'Basalt',
        micrographs: [
          { id: 'M1', name: 'TS-12 ppl', notes: 'owner notes', spots: [{ id: 'SP1', name: 'Garnet 1', color: '#ff0000' }] },
          { id: 'M2', name: 'Nested', parentID: 'M1', spots: [{ id: 'SP2', name: 'On nested' }] },
        ],
      }],
    }],
  };
}
const mic = (p: any, id: string) => p.datasets[0].samples[0].micrographs.find((m: any) => m.id === id);
const DAN: SyncUser = { pkey: 9, name: 'Dan Smith' };

const push: SyncParkedPush = {
  id: 1, user: DAN, parkedAt: '2026-10-03T14:00:00.000Z', reason: 'removed', role: null, decided: {},
  changes: [
    // A new micrograph with two spots on it: one unit
    { op: 'create', type: 'micrograph', id: 'MN', parentType: 'sample', parentId: 'S1', body: { id: 'MN', name: 'Dan scan' } },
    { op: 'create', type: 'spot', id: 'SN1', parentType: 'micrograph', parentId: 'MN', body: { id: 'SN1', name: 'n1' } },
    { op: 'create', type: 'spot', id: 'SN2', parentType: 'micrograph', parentId: 'MN', body: { id: 'SN2', name: 'n2' } },
    // A spot on an existing micrograph
    { op: 'create', type: 'spot', id: 'SN3', parentType: 'micrograph', parentId: 'M1', body: { id: 'SN3', name: 'Garnet 3' } },
    // Renamed an existing spot
    { op: 'update', type: 'spot', id: 'SP1', baseVersion: 1, fields: { name: 'Garnet 1b' } },
    // The sample's new child order and a save's timestamp (not shown)
    { op: 'update', type: 'sample', id: 'S1', childOrder: { micrographs: ['M1', 'M2', 'MN'] } },
    { op: 'update', type: 'dataset', id: 'D1', baseVersion: 2, fields: { modifiedTimestamp: '2026-10-03T14:57:39.355Z' } },
    // Deleted a micrograph with a nested micrograph
    { op: 'delete', type: 'micrograph', id: 'M1', baseVersion: 3 },
  ],
};

let cur = currentEntities(project());
let review = buildReview(push, cur);
const byKey = (k: string) => review.units.find((u) => u.key === k)!;
check('units: new micrograph with its spots is one, the rest one each; child order and timestamps silent',
  review.units.length === 4 && byKey('micrograph:MN').keys.length === 3 && review.silentKeys.join() === 'sample:S1,dataset:D1',
  review.units.map((u) => [u.key, u.keys.length]));
check('create text names it, its parent and what it holds',
  byKey('micrograph:MN').text === "Added micrograph 'Dan scan' to sample 'Basalt' (2 spots)", byKey('micrograph:MN').text);
check('update shows the member\'s value next to the current one', byKey('spot:SP1').fields.length === 1 &&
  byKey('spot:SP1').fields[0].label === 'Name' && byKey('spot:SP1').fields[0].theirs === 'Garnet 1b' &&
  byKey('spot:SP1').fields[0].now === 'Garnet 1', byKey('spot:SP1'));
check('delete counts what it holds now', byKey('micrograph:M1').text === "Deleted micrograph 'TS-12 ppl' (1 micrograph, 2 spots)",
  byKey('micrograph:M1').text);
check('nothing else blocked yet', review.units.every((u) => u.blocked === null || u.key === 'micrograph:MN'));

// Accept: apply to the project as it is now
const apply = (key: string) => {
  const p = project();
  const changes = acceptChanges(push, byKey(key), currentEntities(p));
  applyEntityChanges(p, changes, 'redo');
  return { p, changes };
};
check('a new micrograph is blocked (its image is not in the parked change)', /image did not reach StraboSpot/.test(byKey('micrograph:MN').blocked ?? '') &&
  byKey('micrograph:MN').blocked!.includes('Dan Smith'), byKey('micrograph:MN').blocked);
check('blocked: Accept changes nothing', acceptChanges(push, byKey('micrograph:MN'), cur).length === 0);
let a = apply('spot:SN3');
check('accept a created spot: added to its micrograph', mic(a.p, 'M1').spots.map((s: any) => s.id).join() === 'SP1,SN3' &&
  a.changes.length === 1 && a.changes[0].before === null, mic(a.p, 'M1').spots);
const spotUnit: SyncParkedPush = { ...push, changes: [
  { op: 'create', type: 'spot', id: 'SX', parentType: 'micrograph', parentId: 'M1', body: { id: 'SX', name: 'x' } },
] };
check('a spot unit is accepted whole', acceptChanges(spotUnit, buildReview(spotUnit, cur).units[0], cur).length === 1);
a = apply('spot:SP1');
check('accept an update: the member\'s field, the rest as now', mic(a.p, 'M1').spots[0].name === 'Garnet 1b' &&
  mic(a.p, 'M1').spots[0].color === '#ff0000');
a = apply('micrograph:M1');
check('accept a delete: the micrograph, its spots and the nested micrograph go', !mic(a.p, 'M1') && !mic(a.p, 'M2') &&
  a.changes.length === 4, a.changes.map((c) => c.key));

// The project moved on meanwhile: newer work is kept, deleted parents block
const later = project();
mic(later, 'M1').spots[0].color = '#00ff00';
const laterCur = currentEntities(later);
const upd = acceptChanges(push, buildReview(push, laterCur).units.find((u) => u.key === 'spot:SP1')!, laterCur);
applyEntityChanges(later, upd, 'redo');
check('accept over newer work: only the member\'s field changes', mic(later, 'M1').spots[0].name === 'Garnet 1b' &&
  mic(later, 'M1').spots[0].color === '#00ff00');

const gone = project();
gone.datasets[0].samples[0].micrographs = [];
cur = currentEntities(gone);
review = buildReview(push, cur);
check('parent deleted since: the create is blocked with the reason', /micrograph was deleted since/.test(byKey('spot:SN3').blocked ?? ''),
  byKey('spot:SN3'));
check('the item deleted since: the update is blocked', /deleted since/.test(byKey('spot:SP1').blocked ?? ''), byKey('spot:SP1'));
check('blocked units change nothing', acceptChanges(push, byKey('spot:SN3'), cur).length === 0);
check('a delete of something already gone is not blocked and changes nothing',
  byKey('micrograph:M1').blocked === null && acceptChanges(push, byKey('micrograph:M1'), cur).length === 0 &&
  byKey('micrograph:M1').text.includes('gone already'));
check('a create whose parent is there is not blocked for that', !/deleted since/.test(byKey('micrograph:MN').blocked ?? ''));

// Already accepted (the item exists): blocked, and decisions are shown
const twice = project();
mic(twice, 'M1').spots.push({ id: 'SN3', name: 'Garnet 3' });
review = buildReview({ ...push, decided: { 'spot:SP1': 'discarded' } }, currentEntities(twice));
check('a create already in the project is blocked', /already/.test(byKey('spot:SN3').blocked ?? ''));
check('decided items show their decision', byKey('spot:SP1').decided === 'discarded' && byKey('spot:SN3').decided === null);

// The waiting line
check('waiting text, one person', waitingText([push]) === "Dan Smith's 6 unsynced changes are waiting for your review", waitingText([push]));
check('waiting text, one change', waitingText([{ user: DAN, changes: [push.changes[4]] }]) === "Dan Smith's 1 unsynced change is waiting for your review");
check('waiting text, two people', waitingText([push, { user: { pkey: 3, name: 'Maya' }, changes: [push.changes[4]] }]) ===
  "Dan Smith's 6 unsynced changes and Maya's 1 unsynced change are waiting for your review");

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
