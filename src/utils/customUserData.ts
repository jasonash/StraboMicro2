/**
 * Custom User Data (docs/custom-user-data-design.md): the user's own
 * spreadsheet columns, one value per spot.
 *
 * Storage (v2 only; the legacy app ignores both fields):
 *   spot.customUserData            { "Mg#": "0.82", ... }  values as typed (text)
 *   project.customUserDataColumns  ["Mg#", ...]           column order
 * Values live on each spot so sync merges them per spot and per column; the
 * order lives on the project because the server's jsonb does not keep the
 * key order of objects. Columns that have values but are not in the list
 * (a Contributor's new column: they cannot change project settings) come
 * after the listed ones, alphabetically.
 *
 * Pure functions: the dialog, the store and the tests share them. Files are
 * read and written in main (electron/customUserDataFiles.js).
 */

import type { MicrographMetadata, ProjectMetadata, SampleMetadata, Spot } from '../types/project-types';

export type CustomUserData = Record<string, string>;

/** The locked columns of the template, in order */
export const COL_SAMPLE = 'Sample Name';
export const COL_MICROGRAPH = 'Micrograph Name';
export const COL_SPOT = 'Spot Name';
export const COL_ID = 'Spot ID';
export const COL_ARCHIVED = 'Archived';
export const LOCKED_COLUMNS = [COL_SAMPLE, COL_MICROGRAPH, COL_SPOT, COL_ID, COL_ARCHIVED] as const;

/** Header names a user column may not use (case and surrounding spaces ignored) */
const RESERVED = new Set(LOCKED_COLUMNS.map((c) => c.toLowerCase()));
/** Would replace an object's prototype when used as a key */
const UNSAFE_KEYS = new Set(['__proto__']);

const norm = (s: string) => s.trim().toLowerCase();

interface SpotPlace {
  spot: Spot;
  micrograph: MicrographMetadata;
  sample: SampleMetadata;
}

/** Every spot with its micrograph and sample, in tree order */
export function spotsInOrder(project: ProjectMetadata | null, micrographId?: string | null): SpotPlace[] {
  const out: SpotPlace[] = [];
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const micrograph of sample.micrographs ?? []) {
        if (micrographId && micrograph.id !== micrographId) continue;
        for (const spot of micrograph.spots ?? []) out.push({ spot, micrograph, sample });
      }
    }
  }
  return out;
}

function hasValues(data: CustomUserData | null | undefined): data is CustomUserData {
  return !!data && typeof data === 'object' && Object.keys(data).length > 0;
}

/** The value of a column as text ('' when none) */
function valueOf(data: CustomUserData | null | undefined, column: string): string {
  if (!data || !Object.prototype.hasOwnProperty.call(data, column)) return '';
  const v = data[column];
  return v === null || v === undefined ? '' : String(v);
}

/**
 * All columns in display order: the project's list first, then columns that
 * have values but are not listed, alphabetically.
 */
export function orderedColumns(project: ProjectMetadata | null): string[] {
  const listed = (project?.customUserDataColumns ?? []).filter((c): c is string => typeof c === 'string' && c !== '');
  const seen = new Set(listed);
  const extra = new Set<string>();
  for (const { spot } of spotsInOrder(project)) {
    if (!hasValues(spot.customUserData)) continue;
    for (const k of Object.keys(spot.customUserData)) if (!seen.has(k)) extra.add(k);
  }
  const unlisted = [...extra].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  return [...new Set(listed), ...unlisted];
}

/** The columns that have a value in at least one of these spots, in display order */
export function columnsWithValues(project: ProjectMetadata | null, spots: Spot[]): string[] {
  return orderedColumns(project).filter((c) => spots.some((s) => valueOf(s.customUserData, c) !== ''));
}

/** A spot's values in display order (non-empty only) */
export function spotEntries(project: ProjectMetadata | null, spot: Spot): Array<[string, string]> {
  if (!hasValues(spot.customUserData)) return [];
  return orderedColumns(project)
    .map((c): [string, string] => [c, valueOf(spot.customUserData, c)])
    .filter(([, v]) => v !== '');
}

/** Does the project (or one micrograph) have any Custom User Data */
export function hasCustomUserData(project: ProjectMetadata | null, micrographId?: string | null): boolean {
  return spotsInOrder(project, micrographId).some(({ spot }) => hasValues(spot.customUserData));
}

export interface CustomUserDataTable {
  headers: string[];
  rows: string[][];
  /** The first lockedCount columns are locked in an .xlsx file */
  lockedCount: number;
}

/**
 * The template, which is also the download: one row per spot (whole
 * project or one micrograph) with every column and the current values.
 */
export function templateTable(project: ProjectMetadata | null, micrographId?: string | null): CustomUserDataTable {
  const columns = orderedColumns(project);
  const rows = spotsInOrder(project, micrographId).map(({ spot, micrograph, sample }) => [
    sample.label || sample.name || '',
    micrograph.name || '',
    spot.name || '',
    spot.id,
    spot.archived ? 'Yes' : '',
    ...columns.map((c) => valueOf(spot.customUserData, c)),
  ]);
  return { headers: [...LOCKED_COLUMNS, ...columns], rows, lockedCount: LOCKED_COLUMNS.length };
}

/** How the template works: the .xlsx Instructions sheet and the dialog's help */
export const INSTRUCTION_SECTIONS: ReadonlyArray<{ title: string; lines: string[] }> = [
  {
    title: 'How to use this template',
    lines: [
      '1. Add your own column headers in row 1, to the right of the grey columns: one column per kind of data (for example "Mg#" or "Age (Ma)").',
      '2. Fill in a value for each spot. Values are kept as text, exactly as typed (0.820, <0.01 and n.d. all stay as they are).',
      '3. Save the file, then in StraboMicro choose Tools > Custom User Data... > Import Filled Template...',
    ],
  },
  {
    title: 'The grey columns are locked',
    lines: [
      `${LOCKED_COLUMNS.join(', ')} identify each spot. StraboMicro matches rows by Spot ID only, so never change it. To rename a spot or micrograph, rename it in StraboMicro.`,
      'Rows never create spots: draw the spots in StraboMicro first, then download a new template.',
    ],
  },
  {
    title: 'Importing again',
    lines: ['Only the columns in the file are updated; other columns stay as they are. An empty cell removes that value. Spots that are not in the file are not changed.'],
  },
  {
    title: 'Sorting',
    lines: ['Excel does not sort locked cells. To sort, choose Review > Unprotect Sheet (there is no password). Row order does not matter for the import.'],
  },
];

/** The text of the .xlsx Instructions sheet, one cell per line (first line = title) */
export function instructionLines(): string[] {
  return ['StraboMicro Custom User Data', ...INSTRUCTION_SECTIONS.flatMap((s) => ['', s.title, ...s.lines])];
}

// ---------------------------------------------------------------- import

export interface ImportTable {
  headers: string[];
  rows: string[][];
}

export interface ImportRights {
  /** May change the column list (project settings: Owner, Editor, local project) */
  canChangeColumns: boolean;
  /** May change this spot */
  canEditSpot: (spotId: string) => boolean;
}

export interface ImportRow {
  /** Row number as the spreadsheet shows it (header = 1) */
  row: number;
  spotId: string;
  spotName: string;
}

export interface ImportPlan {
  /** User columns in the file, in file order */
  columns: string[];
  /** Columns no spot has yet */
  newColumns: string[];
  /** Spot id => the file's values for `columns` ('' = remove) */
  updates: Record<string, CustomUserData>;
  /** Rows matched to a spot */
  matched: number;
  /** Spots whose data the import changes */
  changedSpots: number;
  /** Values added, changed or removed */
  changedValues: number;
  /** Spot ID not in this project (deleted spot, edited id, another project) */
  unmatched: ImportRow[];
  /** Values but no Spot ID */
  missingId: number[];
  /** Spots someone else added (Contributor): skipped */
  notYours: ImportRow[];
  /** Names in the file that differ from the project (the id wins) */
  nameChanges: Array<{ row: number; column: string; inFile: string; inProject: string }>;
  /** The column list is updated (false for a Contributor) */
  updatesColumnList: boolean;
}

export type ImportCheck = { ok: true; plan: ImportPlan } | { ok: false; problems: string[] };

/** Spreadsheet column letter of a 0-based index (0 = A, 26 = AA) */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Check a filled template against the project. Refuses the whole file on a
 * blank header (over values), a duplicate header, a header that repeats a
 * locked column, a missing Spot ID column or a Spot ID on two rows; anything
 * else becomes a plan the user reviews before it is applied.
 */
export function checkImport(project: ProjectMetadata | null, table: ImportTable, rights: ImportRights): ImportCheck {
  const problems: string[] = [];
  if (!project) return { ok: false, problems: ['No project is open.'] };

  const headers = table.headers.map((h) => String(h ?? '').trim());
  const rows = table.rows.map((r) => r.map((v) => String(v ?? '')));
  const colHasValues = (i: number) => rows.some((r) => (r[i] ?? '').trim() !== '');

  const locked = new Map<string, number>(); // lower-case locked header => index
  const userCols: Array<{ index: number; name: string }> = [];
  const seenUser = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h === '') {
      if (colHasValues(i)) problems.push(`Column ${columnLetter(i)} has values but no header.`);
      return;
    }
    const key = norm(h);
    if (RESERVED.has(key)) {
      if (locked.has(key)) problems.push(`"${h}" appears twice (columns ${columnLetter(locked.get(key) ?? 0)} and ${columnLetter(i)}).`);
      else locked.set(key, i);
      return;
    }
    if (UNSAFE_KEYS.has(key)) {
      problems.push(`"${h}" (column ${columnLetter(i)}) can't be used as a header.`);
      return;
    }
    const first = seenUser.get(key);
    if (first !== undefined) {
      problems.push(`"${h}" appears twice (columns ${columnLetter(first)} and ${columnLetter(i)}). Headers must be different (capitals and spaces don't count).`);
      return;
    }
    seenUser.set(key, i);
    userCols.push({ index: i, name: h });
  });
  const idCol = locked.get(norm(COL_ID));
  if (idCol === undefined) problems.push(`The "${COL_ID}" column is missing. StraboMicro needs it to match rows to spots; start from a downloaded template.`);

  // A Spot ID on two rows: which values are meant is unclear
  if (idCol !== undefined) {
    const firstRow = new Map<string, number>();
    rows.forEach((r, i) => {
      const id = (r[idCol] ?? '').trim();
      if (id === '') return;
      const prev = firstRow.get(id);
      if (prev !== undefined) problems.push(`Rows ${prev + 2} and ${i + 2} have the same Spot ID (${id}).`);
      else firstRow.set(id, i);
    });
  }
  if (problems.length > 0 || idCol === undefined) return { ok: false, problems };

  const places = new Map(spotsInOrder(project).map((p) => [p.spot.id, p]));
  const existing = new Set(orderedColumns(project));
  const plan: ImportPlan = {
    columns: userCols.map((c) => c.name),
    newColumns: userCols.map((c) => c.name).filter((c) => !existing.has(c)),
    updates: {},
    matched: 0,
    changedSpots: 0,
    changedValues: 0,
    unmatched: [],
    missingId: [],
    notYours: [],
    nameChanges: [],
    updatesColumnList: rights.canChangeColumns,
  };
  const nameCols: Array<[string, (p: SpotPlace) => string]> = [
    [COL_SAMPLE, (p) => p.sample.label || p.sample.name || ''],
    [COL_MICROGRAPH, (p) => p.micrograph.name || ''],
    [COL_SPOT, (p) => p.spot.name || ''],
  ];

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const id = (r[idCol] ?? '').trim();
    const spotNameCol = locked.get(norm(COL_SPOT));
    const fileSpotName = spotNameCol !== undefined ? (r[spotNameCol] ?? '').trim() : '';
    if (id === '') {
      if (userCols.some((c) => (r[c.index] ?? '').trim() !== '')) plan.missingId.push(rowNo);
      return;
    }
    const place = places.get(id);
    if (!place) {
      plan.unmatched.push({ row: rowNo, spotId: id, spotName: fileSpotName });
      return;
    }
    if (!rights.canEditSpot(id)) {
      plan.notYours.push({ row: rowNo, spotId: id, spotName: place.spot.name || '' });
      return;
    }
    plan.matched++;
    for (const [col, current] of nameCols) {
      const ci = locked.get(norm(col));
      if (ci === undefined) continue;
      const inFile = (r[ci] ?? '').trim();
      if (inFile !== '' && inFile !== current(place).trim()) {
        plan.nameChanges.push({ row: rowNo, column: col, inFile, inProject: current(place) });
      }
    }
    const values: CustomUserData = {};
    let changed = 0;
    for (const c of userCols) {
      const v = (r[c.index] ?? '').trim();
      values[c.name] = v;
      if (v !== valueOf(place.spot.customUserData, c.name)) changed++;
    }
    if (changed > 0) {
      plan.updates[id] = values;
      plan.changedSpots++;
      plan.changedValues += changed;
    }
  });
  return { ok: true, plan };
}

/** Would applying the plan change anything (values, or the column list) */
export function importChangesSomething(project: ProjectMetadata, plan: ImportPlan): boolean {
  if (plan.changedValues > 0) return true;
  const listed = project.customUserDataColumns ?? [];
  return plan.updatesColumnList && plan.columns.some((c) => !listed.includes(c));
}

function cleanData(data: CustomUserData): CustomUserData | undefined {
  const out = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string' && v !== ''));
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Change every spot of the project in place through fn (on a clone) */
function withSpots(project: ProjectMetadata, fn: (spot: Spot) => void): ProjectMetadata {
  const next = structuredClone(project);
  for (const { spot } of spotsInOrder(next)) fn(spot);
  return next;
}

function setData(spot: Spot, data: CustomUserData | undefined): void {
  if (data) spot.customUserData = data;
  else delete spot.customUserData;
}

/** The project after an import (only the planned spots change) */
export function applyImport(project: ProjectMetadata, plan: ImportPlan): ProjectMetadata {
  const next = withSpots(project, (spot) => {
    const values = plan.updates[spot.id];
    if (!values) return;
    setData(spot, cleanData({ ...(spot.customUserData ?? {}), ...values }));
  });
  if (plan.updatesColumnList) {
    const listed = (project.customUserDataColumns ?? []).filter((c) => typeof c === 'string' && c !== '');
    const add = plan.columns.filter((c) => !listed.includes(c));
    if (add.length > 0) next.customUserDataColumns = [...listed, ...add];
  }
  return next;
}

/** The project without one column (list and every spot) */
export function removeColumn(project: ProjectMetadata, column: string): ProjectMetadata {
  const next = withSpots(project, (spot) => {
    if (!spot.customUserData || !Object.prototype.hasOwnProperty.call(spot.customUserData, column)) return;
    const rest = Object.fromEntries(Object.entries(spot.customUserData).filter(([k]) => k !== column));
    setData(spot, cleanData(rest));
  });
  const listed = (project.customUserDataColumns ?? []).filter((c) => c !== column);
  if (listed.length > 0) next.customUserDataColumns = listed;
  else delete next.customUserDataColumns;
  return next;
}

/** The project without any Custom User Data */
export function removeAllCustomUserData(project: ProjectMetadata): ProjectMetadata {
  const next = withSpots(project, (spot) => {
    if (spot.customUserData !== undefined) delete spot.customUserData;
  });
  delete next.customUserDataColumns;
  return next;
}
