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
  tableToCsv,
  type ImportRights,
} from '../src/utils/customUserData.ts';
import type { ProjectMetadata, Spot } from '../src/types/project-types.ts';
import { fieldLabel, valueText } from '../src/utils/syncDecisionText.ts';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const files = require('../electron/customUserDataFiles.js') as { toCsv: (h: string[], r: string[][]) => string; parseCsv: (text: string) => string[][] };
const pdf = require('../electron/pdfReactExport.js') as {
  customUserDataColumns: (p: unknown) => string[];
  customUserDataEntries: (columns: string[], spot: unknown) => Array<[string, string]>;
};

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
check('template: lockedCount', t.lockedCount === 4);
check('template: one row per spot, tree order', eq(t.rows.map((r) => r[3]), ['a', 'b', 'c', 'd']));
check('template: sample label, micrograph, spot names', eq(t.rows[0].slice(0, 3), ['Sample A', 'XPL', 'Spot 1']));
check('template: no Archived column (removed 2026-10-25), even for an archived spot', !t.headers.includes('Archived') && t.rows[1].length === t.headers.length, t.headers);
check('template: values as stored (0.820 kept)', eq(t.rows[0].slice(4), ['0.820', '312', '', '']));
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
check('refuse: blank header over values', refused([...H, '', 'X'], [['', '', '', 'a', 'v', '1']]).some((m) => m.includes('Column E has values but no header')));
check('accept: blank header over an empty column', refused([...H, '', 'X'], [['', '', '', 'a', '', '1']]).length === 0);
check('refuse: duplicate header (case + spaces ignored)', refused([...H, 'Mg#', ' mg# ']).some((m) => m.includes('appears twice (columns E and F)')));
check('refuse: header repeats a locked column', refused([...H, 'spot id']).some((m) => m.includes('appears twice')));
check('refuse: __proto__ header', refused([...H, '__proto__']).some((m) => m.includes("can't be used")));
check('refuse: same Spot ID on two rows', refused([...H, 'X'], [['', '', '', 'a', '1'], ['', '', '', 'a', '2']]).some((m) => m.includes('Rows 2 and 3 have the same Spot ID')));
check('refuse: no project', !checkImport(null, { headers: H, rows: [] }, owner).ok);
check('column letters', columnLetter(0) === 'A' && columnLetter(25) === 'Z' && columnLetter(26) === 'AA' && columnLetter(701) === 'ZZ' && columnLetter(702) === 'AAA');

// ---------------------------------------------------------------- plan
// A template from the 2.0.55 test builds, with the Archived column: still
// imports, and Archived is skipped, not taken as a user column
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

// ---------------------------------------------------------------- PDF (electron/pdfReactExport.js keeps its own copy of the order)
const variants: ProjectMetadata[] = [project(), { ...project(), customUserDataColumns: undefined }, { ...project(), customUserDataColumns: ['zeta', '', 'zeta', 'Nope'] }, removeAllCustomUserData(project())];
variants.forEach((v, i) => check(`PDF column order = app column order (${i})`, eq(pdf.customUserDataColumns(v), orderedColumns(v)), [pdf.customUserDataColumns(v), orderedColumns(v)]));
check('PDF spot entries = app spot entries', eq(pdf.customUserDataEntries(orderedColumns(p), m1Spots[0]), spotEntries(p, m1Spots[0])));
check('PDF spot entries: none', eq(pdf.customUserDataEntries(['a'], { customUserData: { a: '' } }), []));

// ---------------------------------------------------------------- CSV text (web viewer) = desktop CSV file
const csvTable = { headers: ['Spot ID', 'Notes'], rows: [['a', 'has, comma'], ['b', 'say "hi"\nnext line'], ['c', ' padded '], ['d', 'semi;colon'], ['e', '±']] };
check('tableToCsv = desktop toCsv', tableToCsv(csvTable) === files.toCsv(csvTable.headers, csvTable.rows), [tableToCsv(csvTable), files.toCsv(csvTable.headers, csvTable.rows)]);
check('tableToCsv: BOM and CRLF', tableToCsv(csvTable).startsWith('\uFEFFSpot ID,Notes\r\n'));

// ---------------------------------------------------------------- legacy digits-only Spot IDs through Excel (Peter, 2026-10-28)
// tests/fixtures/custom-user-data: a .csv download of a project whose spots
// the legacy app made (ids like 17671187167175) and the same file after
// Excel opened and saved it (ids now 1.76712E+13, several rows alike).
const fixture = (name: string) => files.parseCsv(readFileSync(new URL(`./fixtures/custom-user-data/${name}`, import.meta.url), 'utf8'));
const downloaded = fixture('legacy-ids-download.csv');
const excelSaved = fixture('legacy-ids-excel-saved.csv');
function legacyProject(): ProjectMetadata {
  const rows = downloaded.slice(1);
  return {
    id: 'L', name: 'Pimu Epidote Blueschists',
    datasets: [{ id: 'D', name: 'D', samples: [{ id: 'S', name: 'S', label: rows[0][0], micrographs: [{ id: 'M', name: rows[0][1], spots: rows.map((r) => spot(r[3], r[2])) }] }] }],
  } as unknown as ProjectMetadata;
}
const withColumn = (rows: string[][]) => ({ headers: [...rows[0], 'Mg#'], rows: rows.slice(1).map((r, i) => [...r, `0.${i}`]) });
const lp = legacyProject();
const legacyIds = downloaded.slice(1).map((r) => r[3]);
check('legacy fixture: 41 digits-only ids, Excel-saved copy rounded', legacyIds.length === 41 && legacyIds.every((id) => /^\d{14}$/.test(id)) &&
  excelSaved.slice(1).every((r) => /E\+13$/.test(r[3])), excelSaved[1]);

const fromDownload = checkImport(lp, withColumn(downloaded), owner);
check('legacy: the download imports by Spot ID', fromDownload.ok && fromDownload.plan.matched === 41 && fromDownload.plan.matchedByName.length === 0, fromDownload);
const fromExcel = checkImport(lp, withColumn(excelSaved), owner);
check('legacy: Excel-saved file is not refused (rows alike after rounding)', fromExcel.ok, fromExcel);
check('legacy: Excel-saved file matched by names, all 41 rows', fromExcel.ok && fromExcel.plan.matched === 41 && fromExcel.plan.matchedByName.length === 41 &&
  fromExcel.plan.roundedId.length === 0 && fromExcel.plan.unmatched.length === 0, fromExcel.ok ? fromExcel.plan : fromExcel);
check('legacy: values land on the real spot ids', fromExcel.ok && eq(Object.keys(fromExcel.plan.updates).sort(), [...legacyIds].sort()) &&
  fromExcel.plan.updates[legacyIds[0]]?.['Mg#'] === '0.0', fromExcel.ok ? Object.keys(fromExcel.plan.updates).slice(0, 3) : '');
check('legacy: trailing space Excel dropped from a spot name is no name change', fromExcel.ok && fromExcel.plan.nameChanges.length === 0, fromExcel.ok ? fromExcel.plan.nameChanges : '');

// The download written again: digits-only ids as ="...", which Excel keeps as text; read back to the same spots
const legacyTemplate = templateTable(lp);
const rewritten = files.toCsv(legacyTemplate.headers, legacyTemplate.rows);
check('csv: digits-only Spot ID written as ="..."', rewritten.includes('\r\n23C04A1,23C-04A1_PPL,SEM_1,="17671187167175"\r\n'), rewritten.slice(0, 120));
check('csv: ="..." only in the Spot ID column', !files.toCsv(['Spot ID', 'Count'], [['a-1', '17671187167175']]).includes('='));
check('csv: a uuid Spot ID is written as is', files.toCsv(['Spot ID'], [['3f2a9c1e-0b7d-4e55-9a41-6c2d8e1f0a37']]).includes('\r\n3f2a9c1e-0b7d-4e55-9a41-6c2d8e1f0a37\r\n'));
check('tableToCsv = desktop toCsv (digits-only ids)', tableToCsv(legacyTemplate) === rewritten);
const reread = checkImport(lp, withColumn(files.parseCsv(rewritten)), owner);
check('legacy: ="..." ids (or LibreOffice keeping them as typed) match by Spot ID', reread.ok && reread.plan.matched === 41 && reread.plan.matchedByName.length === 0, reread);

// Name matching is only for rounded ids, and only for one spot with those names
const L = [...LOCKED_COLUMNS, 'Mg#'];
const ln = (sample: string, spotName: string, id: string) => [sample, '23C-04A1_PPL', spotName, id, '1'];
const lpOne = checkImport(lp, { headers: L, rows: [ln('23C04A1', 'SEM_1', 'not-an-id')] }, owner);
check('names: an unknown (not rounded) id stays unmatched', lpOne.ok && lpOne.plan.unmatched.length === 1 && lpOne.plan.matched === 0, lpOne);
const lpWrongName = checkImport(lp, { headers: L, rows: [ln('23C04A1', 'SEM_99', '1.76712E+13')] }, owner);
check('names: rounded id + names of no spot = roundedId (skipped)', lpWrongName.ok && lpWrongName.plan.roundedId.length === 1 && lpWrongName.plan.matched === 0, lpWrongName);
const twins = legacyProject();
twins.datasets![0].samples![0].micrographs![0].spots![1].name = 'SEM_1';
const lpTwin = checkImport(twins, { headers: L, rows: [ln('23C04A1', 'SEM_1', '1.76712E+13')] }, owner);
check('names: two spots with those names = roundedId (skipped)', lpTwin.ok && lpTwin.plan.roundedId.length === 1 && lpTwin.plan.matched === 0, lpTwin);
const lpNoNames = checkImport(lp, { headers: ['Spot ID', 'Mg#'], rows: [['1.76712E+13', '1']] }, owner);
check('names: rounded id without the name columns = roundedId', lpNoNames.ok && lpNoNames.plan.roundedId.length === 1, lpNoNames);
const lpBoth = checkImport(lp, { headers: L, rows: [ln('23C04A1', 'SEM_1', legacyIds[0]), ln('23C04A1', 'SEM_1', '1.76712E+13')] }, owner);
check('refuse: one spot by id and again by name', !lpBoth.ok && lpBoth.problems.some((m) => m === 'Rows 2 and 3 are the same spot (SEM_1).'), lpBoth);
const lpSameRounded = checkImport(lp, { headers: L, rows: [ln('23C04A1', 'SEM_99', '1.76712E+13'), ln('23C04A1', 'SEM_98', '1.76712E+13')] }, owner);
check('rounded ids alike that match nothing are skipped, not refused', lpSameRounded.ok && lpSameRounded.plan.roundedId.length === 2, lpSameRounded);
const applied = fromExcel.ok ? applyImport(lp, fromExcel.plan) : lp;
check('legacy: apply after name matching', spotEntries(applied, applied.datasets![0].samples![0].micrographs![0].spots![5]).some(([c, v]) => c === 'Mg#' && v === '0.5'));

// ---------------------------------------------------------------- sync decisions dialog text
check('decision label: field name', fieldLabel(['customUserData']) === 'Custom User Data');
check('decision label: header shown as typed', fieldLabel(['customUserData', 'SiO2 (wt%)']) === 'Custom User Data › SiO2 (wt%)', fieldLabel(['customUserData', 'SiO2 (wt%)']));
check('decision label: other fields still prettified', fieldLabel(['grainInfo', 'grainSizeInfo']) === 'Grain info › Grain size info');
const vt = valueText(['customUserData'], { SiO2: '45.1', id: 'x7', 'Mg#': '0.82' });
check('decision value: headers as typed, a column called id is shown', vt.full === 'SiO2: 45.1\nid: x7\nMg#: 0.82', vt);
check('decision value: other objects still hide id', valueText(['mineralogy'], { id: 'q', notes: 'n' }).full === 'Notes: n');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
