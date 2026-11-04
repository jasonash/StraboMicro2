/**
 * Tests for the undo/redo functions in electron/shared/entityModel.mjs
 * (diffProjects, checkEntityChanges, applyEntityChanges).
 *
 *   node tests/sync/undoPatches.test.mjs [server-dump.json]
 *
 * Synthetic edits always run. With a dump from the StraboBackend tool
 * tests/microsync/decompose_dump.php, random edits are also applied to every
 * real dev project: undo must give back the original exactly, redo the
 * edited version, and a remote change to an edited entity must block undo.
 */

import fs from 'node:fs';
import {
  diffProjects, checkEntityChanges, applyEntityChanges, normalizeProject,
} from '../../electron/shared/entityModel.mjs';
import { deepEqual } from '../../electron/shared/deepEqual.mjs';

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 1500)}` : ''}`);
  }
}
function section(name) { console.log(`\n== ${name}`); }

const copy = (x) => JSON.parse(JSON.stringify(x));
/** Comparable form: per-user fields gone, child lists filled (tree expansion is not undone). */
const norm = (p) => normalizeProject(p).project;

function undo(project, changes) {
  const out = copy(project);
  const ok = checkEntityChanges(out, changes, 'undo');
  if (ok.ok) applyEntityChanges(out, changes, 'undo');
  return { ok: ok.ok, project: out };
}
function redo(project, changes) {
  const out = copy(project);
  const ok = checkEntityChanges(out, changes, 'redo');
  if (ok.ok) applyEntityChanges(out, changes, 'redo');
  return { ok: ok.ok, project: out };
}

/** Undo and redo of edit(before) round-trip exactly. */
function roundTrip(label, before, edit) {
  const after = copy(before);
  edit(after);
  const changes = diffProjects(before, after);
  const u = undo(after, changes);
  check(`${label}: undo restores the original`, u.ok && deepEqual(norm(u.project), norm(before)),
    u.ok ? firstDiff(norm(u.project), norm(before)) : 'blocked');
  const r = redo(u.project, changes);
  check(`${label}: redo restores the edit`, r.ok && deepEqual(norm(r.project), norm(after)),
    r.ok ? firstDiff(norm(r.project), norm(after)) : 'blocked');
  return changes;
}

function firstDiff(a, b, path = '') {
  if (deepEqual(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)?.slice(0, 200)} vs ${JSON.stringify(b)?.slice(0, 200)}`;
}

// ---------------------------------------------------------------------------
section('Synthetic');

const base = () => ({
  id: 'P', name: 'Project', presetKeyBindings: { 1: 'x' },
  datasets: [
    { id: 'D1', name: 'D1', isExpanded: true, samples: [
      { id: 'S1', name: 'S1', micrographs: [
        { id: 'M1', name: 'ref', spots: [{ id: 'X1', name: 'a', tags: ['T1'] }, { id: 'X2', name: 'b' }] },
        { id: 'M2', name: 'child', parentID: 'M1', spots: [{ id: 'X3', name: 'c' }] },
      ] },
      { id: 'S2', name: 'S2', micrographs: [] },
    ] },
    { id: 'D2', name: 'D2', samples: [] },
  ],
  tags: [{ id: 'T1', name: 'tag', spotIDs: ['X1'] }],
  groups: [], presets: [],
});

check('no change -> no entity changes', diffProjects(base(), base()).length === 0);
check('per-user field change only -> no entity changes', diffProjects(base(), { ...base(), presetKeyBindings: { 2: 'y' } }).length === 0);
{
  const after = base();
  after.datasets[0].modifiedTimestamp = '2026-01-02T03:04:05.000Z';
  check('time-only change -> no entity changes for undo', diffProjects(base(), after).length === 0);
  const withTs = diffProjects(base(), after, { withTimestamps: true });
  check('time-only change -> one dataset change withTimestamps (pulls, decisions)', withTs.length === 1 && withTs[0].key === 'dataset:D1' &&
    withTs[0].after.body.modifiedTimestamp === '2026-01-02T03:04:05.000Z');
}
{
  const after = base();
  after.datasets[0].isExpanded = false;
  check('tree expansion change -> no entity changes', diffProjects(base(), after).length === 0);
}

{
  const ch = roundTrip('rename spot', base(), (p) => { p.datasets[0].samples[0].micrographs[0].spots[0].name = 'renamed'; });
  check('rename spot touches only that spot', ch.length === 1 && ch[0].key === 'spot:X1');
}
roundTrip('add a field, remove a field', base(), (p) => {
  const m = p.datasets[0].samples[0].micrographs[0];
  m.notes = 'new note';
  delete p.datasets[0].samples[0].micrographs[1].parentID;
});
roundTrip('nested feature object edit', base(), (p) => { p.datasets[0].samples[0].micrographs[0].mineralogy = { minerals: [{ name: 'Qtz' }] }; });
{
  const ch = roundTrip('add a spot', base(), (p) => { p.datasets[0].samples[0].micrographs[0].spots.push({ id: 'X9', name: 'new' }); });
  check('add spot = spot created + micrograph child order', ch.length === 2 && ch.some((c) => c.key === 'spot:X9' && c.before === null));
}
{
  const ch = roundTrip('delete micrograph with spots (cascade)', base(), (p) => { p.datasets[0].samples[0].micrographs.splice(0, 1); });
  check('cascade lists the micrograph and both spots as removed',
    ['micrograph:M1', 'spot:X1', 'spot:X2'].every((k) => ch.some((c) => c.key === k && c.after === null)));
}
roundTrip('delete a whole dataset', base(), (p) => { p.datasets.splice(0, 1); });
roundTrip('move a sample to another dataset', base(), (p) => { p.datasets[1].samples.push(p.datasets[0].samples.splice(1, 1)[0]); });
roundTrip('reorder micrographs', base(), (p) => { p.datasets[0].samples[0].micrographs.reverse(); });
roundTrip('reorder datasets and edit project field', base(), (p) => { p.datasets.reverse(); p.name = 'Renamed'; });
roundTrip('tag membership on spot and tag', base(), (p) => {
  p.datasets[0].samples[0].micrographs[0].spots[1].tags = ['T1'];
  p.tags[0].spotIDs.push('X2');
});
roundTrip('add a tag, group and preset', base(), (p) => {
  p.tags.push({ id: 'T2', name: 'second' });
  p.groups.push({ id: 'G1', name: 'g', micrographs: ['M1'] });
  p.presets.push({ id: 'PR1', name: 'preset' });
});
roundTrip('add dataset > sample > micrograph > spot at once', base(), (p) => {
  p.datasets.push({ id: 'D3', name: 'D3', samples: [{ id: 'S3', name: 'S3', micrographs: [{ id: 'M3', name: 'm', spots: [{ id: 'X7' }] }] }] });
});

{
  const before = base();
  const after = copy(before);
  after.datasets[0].samples[0].micrographs[0].spots[0].name = 'mine';
  const changes = diffProjects(before, after);
  const remote = copy(after);
  remote.datasets[0].samples[0].micrographs[0].spots[0].color = 'red'; // someone else edited the same spot
  check('remote edit to the same entity blocks undo', undo(remote, changes).ok === false);
  const other = copy(after);
  other.datasets[0].samples[0].micrographs[0].spots[1].name = 'theirs';
  const u = undo(other, changes);
  check('remote edit to another entity: undo works and keeps it',
    u.ok && u.project.datasets[0].samples[0].micrographs[0].spots[0].name === 'a' &&
    u.project.datasets[0].samples[0].micrographs[0].spots[1].name === 'theirs');
  const sib = copy(after);
  sib.datasets[0].samples[0].micrographs[0].spots.push({ id: 'XR', name: 'remote sibling' });
  const u2 = undo(sib, changes);
  check('remote sibling added: undo works and keeps the sibling',
    u2.ok && u2.project.datasets[0].samples[0].micrographs[0].spots.some((s) => s.id === 'XR'));
}
{
  const before = base();
  const after = copy(before);
  after.datasets[0].samples[0].micrographs[0].spots.splice(0, 1); // delete X1
  const changes = diffProjects(before, after);
  const gone = copy(after);
  gone.datasets[0].samples[0].micrographs.splice(0, 1); // someone deleted its micrograph
  check('undo of delete blocked when the parent is gone', undo(gone, changes).ok === false);
  const back = copy(after);
  back.datasets[0].samples[0].micrographs[0].spots.push({ id: 'X1', name: 'recreated elsewhere' });
  check('undo of delete blocked when the entity exists again', undo(back, changes).ok === false);
}
{
  const before = base();
  before.datasets[0].samples[0].micrographs[0].isSpotExpanded = true;
  const after = copy(before);
  after.datasets[0].samples[0].micrographs[0].name = 'renamed';
  const u = undo(after, diffProjects(before, after));
  check('undo keeps per-user fields of entities that stay', u.project.datasets[0].samples[0].micrographs[0].isSpotExpanded === true);
}

// ---------------------------------------------------------------------------
const dumpPath = process.argv[2];
if (dumpPath) {
  section(`Random edits on every dev project (${dumpPath})`);
  const cases = JSON.parse(fs.readFileSync(dumpPath, 'utf8')).filter((c) => c.ok);
  let seed = 12345;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let edits = 0;
  for (const c of cases) {
    const p0 = norm(c.input);
    const micrographs = [];
    for (const d of p0.datasets) for (const s of d.samples) for (const m of s.micrographs) micrographs.push({ d, s, m });
    const editsFor = [
      ['rename project', (p) => { p.name = `${p.name} (edited)`; }],
      ['reverse datasets', (p) => { (p.datasets ??= []).reverse(); }],
      ['add tag', (p) => { (p.tags ??= []).push({ id: 'TNEW', name: 'new tag' }); }],
    ];
    if (micrographs.length > 0) {
      const pick = micrographs[rand(micrographs.length)];
      const path = (p) => {
        const d = p.datasets.find((x) => x.id === pick.d.id);
        const s = d.samples.find((x) => x.id === pick.s.id);
        const m = s.micrographs.find((x) => x.id === pick.m.id);
        m.spots ??= [];
        return { d, s, m };
      };
      editsFor.push(
        ['edit micrograph fields', (p) => { const { m } = path(p); m.name = 'edited'; m.notes = 'note'; delete m.imageType; }],
        ['add spots', (p) => { const { m } = path(p); m.spots.push({ id: 'XNEW1', name: 'n1' }, { id: 'XNEW2', name: 'n2', geometryType: 'point', points: [{ X: 1, Y: 2 }] }); }],
        ['delete micrograph (cascade)', (p) => { const { s, m } = path(p); s.micrographs.splice(s.micrographs.indexOf(m), 1); }],
        ['delete its sample (cascade)', (p) => { const { d, s } = path(p); d.samples.splice(d.samples.indexOf(s), 1); }],
        ['reverse micrographs in sample', (p) => { const { s } = path(p); s.micrographs.reverse(); }],
      );
      if (pick.m.spots.length > 0) {
        editsFor.push(
          ['edit a spot', (p) => { const { m } = path(p); m.spots[rand(m.spots.length)].name = 'spot edited'; }],
          ['delete a spot', (p) => { const { m } = path(p); m.spots.splice(rand(m.spots.length), 1); }],
          ['reverse spots', (p) => { const { m } = path(p); m.spots.reverse(); }],
        );
      }
      if (p0.datasets.length > 1) {
        editsFor.push(['move sample to another dataset', (p) => {
          const { d, s } = path(p);
          d.samples.splice(d.samples.indexOf(s), 1);
          p.datasets.find((x) => x.id !== d.id).samples.push(s);
        }]);
      }
    }
    for (const [name, edit] of editsFor) {
      roundTrip(`${c.source} ${name}`, c.input, edit);
      edits++;
    }
  }
  console.log(`  ${cases.length} projects, ${edits} edits undone and redone`);
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
