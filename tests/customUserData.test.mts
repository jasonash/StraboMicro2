/**
 * Custom User Data (docs/custom-user-data-design.md): column order, the
 * template, the import check (refusals and the plan), apply, remove, and
 * the Contributor rules (16).
 *
 *   npm run test:custom-user-data
 */

import {
  applyImport,
  checkImport,
  columnLetter,
  columnsWithValues,
  hasCustomUserData,
  importChangesSomething,
  instructionLines,
  LOCKED_COLUMNS,
  orderedColumns,
  removeAllCustomUserData,
  removeColumn,
  spotEntries,
  templateTable,
  type ImportRights,
} from '../src/utils/customUserData.ts';
import type { ProjectMetadata, Spot } from '../src/types/project-types.ts';
import { fieldLabel, valueText } from '../src/utils/syncDecisionText.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function spot(id: string, name: string, data?: Record<string, string>, archived = false): Spot {
  return { id, name, ...(data ? { customUserData: data } : {}), ...(archived ? { archived: true } : {}) } as Spot;
}

function project(): ProjectMetadata {
  return {
    id: 'P',
    name: 'Proj',
    customUserDataColumns: ['Mg#', 'Age (Ma)'],
    datasets: [{
      id: 'D',
      name: 'D',
      samples: [
        {
          id: 'S1', name: 'S1', label: 'Sample A',
          micrographs: [
            { id: 'M1', name: 'XPL', spots: [spot('a', 'Spot 1', { 'Mg#': '0.820', 'Age (Ma)': '312' }), spot('b', 'Spot 2', { 'Mg#': 'n.d.' }, true)] },
            { id: 'M2', name: 'PPL', spots: [spot('c', 'Spot 3')] },
          ],
        },
        { id: 'S2', name: 'S2', label: 'Sample B', micrographs: [{ id: 'M3', name: 'XPL', spots: [spot('d', 'Spot 4', { zeta: 'z', Alpha: 'x' })] }] },
      ],
    }],
  } as unknown as ProjectMetadata;
}

const owner: ImportRights = { canChangeColumns: true, canEditSpot: () => true };
const H = [...LOCKED_COLUMNS];

// ---------------------------------------------------------------- order and display
const p = project();
check('order: listed first, then unlisted alphabetically (case-insensitive)', eq(orderedColumns(p), ['Mg#', 'Age (Ma)', 'Alpha', 'zeta']), orderedColumns(p));
check('order: no list = alphabetical', eq(orderedColumns({ ...p, customUserDataColumns: undefined }), ['Age (Ma)', 'Alpha', 'Mg#', 'zeta']));
check('order: damaged list entries ignored', eq(orderedColumns({ ...p, customUserDataColumns: ['Mg#', '', 'Mg#'] as string[] }), ['Mg#', 'Age (Ma)', 'Alpha', 'zeta']));
check('order: null project', eq(orderedColumns(null), []));
const m1Spots = p.datasets![0].samples![0].micrographs![0].spots!;
check('columnsWithValues: only columns with a value in these spots', eq(columnsWithValues(p, m1Spots), ['Mg#', 'Age (Ma)']));
check('spotEntries: in order, non-empty', eq(spotEntries(p, m1Spots[0]), [['Mg#', '0.820'], ['Age (Ma)', '312']]));
check('spotEntries: none', eq(spotEntries(p, spot('x', 'x')), []));
check('hasCustomUserData: project', hasCustomUserData(p));
check('hasCustomUserData: micrograph without', !hasCustomUserData(p, 'M2'));

// ---------------------------------------------------------------- template
const t = templateTable(p);
check('template: headers = locked + ordered columns', eq(t.headers, [...LOCKED_COLUMNS, 'Mg#', 'Age (Ma)', 'Alpha', 'zeta']), t.headers);
check('template: lockedCount', t.lockedCount === 5);
check('template: one row per spot, tree order', eq(t.rows.map((r) => r[3]), ['a', 'b', 'c', 'd']));
check('template: sample label, micrograph, spot names', eq(t.rows[0].slice(0, 3), ['Sample A', 'XPL', 'Spot 1']));
check('template: archived = Yes', t.rows[1][4] === 'Yes' && t.rows[0][4] === '');
check('template: values as stored (0.820 kept)', eq(t.rows[0].slice(5), ['0.820', '312', '', '']));
const tm = templateTable(p, 'M3');
check('template: one micrograph', eq(tm.rows.map((r) => r[3]), ['d']));
check('template: empty project', templateTable(null).rows.length === 0);
check('instructions: title first, mention Spot ID and Unprotect', instructionLines()[0] === 'StraboMicro Custom User Data' &&
  instructionLines().some((l) => l.includes('Spot ID')) && instructionLines().some((l) => l.includes('Unprotect Sheet')));

// ---------------------------------------------------------------- refusals
function refused(headers: string[], rows: string[][] = [], rights = owner): string[] {
  const r = checkImport(project(), { headers, rows }, rights);
  return r.ok ? [] : r.problems;
}
check('refuse: no Spot ID column', refused(['Spot Name', 'X']).some((m) => m.includes('"Spot ID" column is missing')));
check('refuse: blank header over values', refused([...H, '', 'X'], [['', '', '', 'a', '', 'v', '1']]).some((m) => m.includes('Column F has values but no header')));
check('accept: blank header over an empty column', refused([...H, '', 'X'], [['', '', '', 'a', '', '', '1']]).length === 0);
check('refuse: duplicate header (case + spaces ignored)', refused([...H, 'Mg#', ' mg# ']).some((m) => m.includes('appears twice (columns F and G)')));
check('refuse: header repeats a locked column', refused([...H, 'spot id']).some((m) => m.includes('appears twice')));
check('refuse: __proto__ header', refused([...H, '__proto__']).some((m) => m.includes("can't be used")));
check('refuse: same Spot ID on two rows', refused([...H, 'X'], [['', '', '', 'a', '', '1'], ['', '', '', 'a', '', '2']]).some((m) => m.includes('Rows 2 and 3 have the same Spot ID')));
check('refuse: no project', !checkImport(null, { headers: H, rows: [] }, owner).ok);
check('column letters', columnLetter(0) === 'A' && columnLetter(25) === 'Z' && columnLetter(26) === 'AA' && columnLetter(701) === 'ZZ' && columnLetter(702) === 'AAA');

// ---------------------------------------------------------------- plan
const file = {
  headers: [' Sample Name', 'Micrograph Name', 'Spot Name', 'Spot ID', 'Archived', 'Mg#', ' Fo (%) '],
  rows: [
    ['Sample A', 'XPL', 'Spot 1', 'a', '', '0.820', '88'],     // Mg# same, Fo new
    ['Sample A', 'XPL', 'Spot 2 renamed', 'b', 'Yes', '', ''], // Mg# removed
    ['Sample A', 'PPL', 'Spot 3', 'c', '', '0.5', ''],         // Mg# added
    ['', '', 'Gone', 'zzz', '', '1', '2'],                      // unmatched
    ['', '', '', '', '', '7', ''],                              // values, no id
    ['', '', '', '', '', '', ''],                               // blank row: ignored
  ],
};
const r = checkImport(project(), file, owner);
check('plan: ok', r.ok, r);
if (r.ok) {
  const plan = r.plan;
  check('plan: columns trimmed, file order', eq(plan.columns, ['Mg#', 'Fo (%)']), plan.columns);
  check('plan: new columns', eq(plan.newColumns, ['Fo (%)']));
  check('plan: matched rows', plan.matched === 3, plan.matched);
  check('plan: changed spots / values', plan.changedSpots === 3 && plan.changedValues === 3, plan);
  check('plan: unmatched lists row, id, name', eq(plan.unmatched, [{ row: 5, spotId: 'zzz', spotName: 'Gone' }]));
  check('plan: missing id row', eq(plan.missingId, [6]));
  check('plan: name change listed (id wins)', eq(plan.nameChanges, [{ row: 3, column: 'Spot Name', inFile: 'Spot 2 renamed', inProject: 'Spot 2' }]));
  check('plan: owner updates the column list', plan.updatesColumnList);
  check('plan: changes something', importChangesSomething(project(), plan));

  const after = applyImport(project(), plan);
  const s = (id: string) => after.datasets![0].samples!.flatMap((x) => x.micrographs!).flatMap((m) => m.spots!).find((x) => x.id === id) ??
    after.datasets![0].samples![1].micrographs![0].spots!.find((x) => x.id === id);
  check('apply: other columns kept, new value added', eq(s('a')?.customUserData, { 'Mg#': '0.820', 'Age (Ma)': '312', 'Fo (%)': '88' }), s('a'));
  check('apply: empty cell removes; empty map removed', s('b')?.customUserData === undefined, s('b'));
  check('apply: value added to a spot with none', eq(s('c')?.customUserData, { 'Mg#': '0.5' }));
  check('apply: spot not in the file untouched', eq(s('d')?.customUserData, { zeta: 'z', Alpha: 'x' }));
  check('apply: names never change', s('b')?.name === 'Spot 2');
  check('apply: column list appended', eq(after.customUserDataColumns, ['Mg#', 'Age (Ma)', 'Fo (%)']));
  check('apply: input project not mutated', eq(project(), project()) && p.datasets![0].samples![0].micrographs![0].spots![1].customUserData?.['Mg#'] === 'n.d.');
  const again = checkImport(after, file, owner);
  check('re-import of the same file changes nothing', again.ok && again.plan.changedValues === 0 && !importChangesSomething(after, again.plan), again);
}

// Template -> import round trip without edits: nothing changes
const rt = templateTable(project());
const rtCheck = checkImport(project(), rt, owner);
check('round trip: own template changes nothing', rtCheck.ok && rtCheck.plan.changedValues === 0 && rtCheck.plan.nameChanges.length === 0, rtCheck);

// Columns may be in any order; only Spot ID is required
const minimal = checkImport(project(), { headers: ['Note', 'Spot ID'], rows: [['hi', 'c']] }, owner);
check('minimal file: Spot ID + one column', minimal.ok && minimal.plan.changedValues === 1 && minimal.plan.nameChanges.length === 0, minimal);

// An owner's import of unlisted columns adds them to the list even with no value change
const listOnly = checkImport(project(), { headers: ['Spot ID', 'zeta'], rows: [['d', 'z']] }, owner);
check('owner: unlisted column joins the list (changes something)', listOnly.ok && listOnly.plan.changedValues === 0 && importChangesSomething(project(), listOnly.plan));
if (listOnly.ok) check('owner: list order', eq(applyImport(project(), listOnly.plan).customUserDataColumns, ['Mg#', 'Age (Ma)', 'zeta']));

// ---------------------------------------------------------------- Contributor (16)
const contributor: ImportRights = { canChangeColumns: false, canEditSpot: (id) => id === 'c' };
const cr = checkImport(project(), file, contributor);
check('contributor: ok', cr.ok);
if (cr.ok) {
  check('contributor: others\' spots skipped and listed', eq(cr.plan.notYours.map((x) => x.spotId), ['a', 'b']), cr.plan.notYours);
  check('contributor: own spot updated', cr.plan.changedSpots === 1 && cr.plan.updates.c !== undefined);
  check('contributor: column list not updated', !cr.plan.updatesColumnList);
  const after = applyImport(project(), cr.plan);
  check('contributor: project column list unchanged', eq(after.customUserDataColumns, ['Mg#', 'Age (Ma)']));
  check('contributor: other spots unchanged', eq(after.datasets![0].samples![0].micrographs![0].spots![0].customUserData, { 'Mg#': '0.820', 'Age (Ma)': '312' }));
}
const crNew = checkImport(project(), { headers: ['Spot ID', 'New col'], rows: [['c', 'v']] }, contributor);
if (crNew.ok) {
  const after = applyImport(project(), crNew.plan);
  check('contributor: new column shows after listed ones', eq(orderedColumns(after), ['Mg#', 'Age (Ma)', 'Alpha', 'New col', 'zeta']), orderedColumns(after));
}
const crNothing = checkImport(project(), { headers: ['Spot ID', 'zeta'], rows: [['c', '']] }, contributor);
check('contributor: no value change and no list right = nothing to apply', crNothing.ok && !importChangesSomething(project(), crNothing.plan));

// ---------------------------------------------------------------- remove
const rc = removeColumn(project(), 'Mg#');
check('remove column: gone from list', eq(rc.customUserDataColumns, ['Age (Ma)']));
check('remove column: gone from spots, empty maps removed', eq(rc.datasets![0].samples![0].micrographs![0].spots![0].customUserData, { 'Age (Ma)': '312' }) &&
  rc.datasets![0].samples![0].micrographs![0].spots![1].customUserData === undefined);
const rcAll = removeColumn(removeColumn(project(), 'Mg#'), 'Age (Ma)');
check('remove last listed column: list removed', rcAll.customUserDataColumns === undefined);
const ra = removeAllCustomUserData(project());
check('remove all', ra.customUserDataColumns === undefined && !hasCustomUserData(ra));

// ---------------------------------------------------------------- sync decisions dialog text
check('decision label: field name', fieldLabel(['customUserData']) === 'Custom User Data');
check('decision label: header shown as typed', fieldLabel(['customUserData', 'SiO2 (wt%)']) === 'Custom User Data › SiO2 (wt%)', fieldLabel(['customUserData', 'SiO2 (wt%)']));
check('decision label: other fields still prettified', fieldLabel(['grainInfo', 'grainSizeInfo']) === 'Grain info › Grain size info');
const vt = valueText(['customUserData'], { SiO2: '45.1', id: 'x7', 'Mg#': '0.82' });
check('decision value: headers as typed, a column called id is shown', vt.full === 'SiO2: 45.1\nid: x7\nMg#: 0.82', vt);
check('decision value: other objects still hide id', valueText(['mineralogy'], { id: 'q', notes: 'n' }).full === 'Notes: n');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
