/**
 * Integration test for src/store/undoHistory.ts with a real zustand store.
 *
 *   npm run test:undo-history
 *
 * Bundled with rolldown (tests/sync/rolldown.test.config.mjs) and run in Node.
 */

import { create } from 'zustand';
import {
  installUndoHistory, resetUndoHistory, undo, redo, withoutUndoRecording, setUndoBlockedHandler,
} from '../../src/store/undoHistory';
import { buildMicrographIndex, buildSpotIndex } from '../../src/store/helpers';
import type { ProjectMetadata } from '../../src/types/project-types';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const QUIET = 350; // a little over the history's 300 ms

interface TestState {
  project: ProjectMetadata | null;
  isDirty: boolean;
  activeMicrographId: string | null;
  activeSpotId: string | null;
  micrographNavigationStack: string[];
  selectedSpotIds: string[];
  micrographIndex: ReturnType<typeof buildMicrographIndex>;
  spotIndex: ReturnType<typeof buildSpotIndex>;
  selectMicrograph: (id: string | null) => Promise<boolean>;
  selectActiveSpot: (id: string | null) => Promise<boolean>;
  edit: (fn: (p: ProjectMetadata) => void) => void;
  load: (p: ProjectMetadata) => void;
}

const store = create<TestState>()((set, get) => ({
  project: null,
  isDirty: false,
  activeMicrographId: null,
  activeSpotId: null,
  micrographNavigationStack: [],
  selectedSpotIds: [],
  micrographIndex: new Map(),
  spotIndex: new Map(),
  selectMicrograph: async (id) => { set({ activeMicrographId: id, activeSpotId: null }); return true; },
  selectActiveSpot: async (id) => { set({ activeSpotId: id }); return true; },
  edit: (fn) => {
    const p = structuredClone(get().project!);
    fn(p);
    set({ project: p, isDirty: true, micrographIndex: buildMicrographIndex(p), spotIndex: buildSpotIndex(p) });
  },
  load: (p) => {
    set({ project: p, isDirty: false, micrographIndex: buildMicrographIndex(p), spotIndex: buildSpotIndex(p),
      activeMicrographId: null, activeSpotId: null });
    resetUndoHistory();
  },
}));
installUndoHistory(store);
const blocked: string[] = [];
setUndoBlockedHandler((m) => blocked.push(m));

const project = (id = 'P'): ProjectMetadata => ({
  id, name: 'Project',
  datasets: [{ id: 'D1', name: 'D1', samples: [{ id: 'S1', name: 'S1', micrographs: [
    { id: 'M1', name: 'ref', spots: [{ id: 'X1', name: 'a' }] },
    { id: 'M2', name: 'other', spots: [] },
  ] }] }],
} as unknown as ProjectMetadata);
const m = (i: number) => store.getState().project!.datasets![0].samples![0].micrographs![i];
const S = () => store.getState();

(async () => {
  store.getState().load(project());

  // A burst of edits is one step
  for (let i = 0; i < 20; i++) S().edit((p) => { p.datasets![0].samples![0].micrographs![0].opacity = i / 20; });
  await sleep(QUIET);
  S().edit((p) => { p.datasets![0].samples![0].micrographs![0].name = 'renamed'; });
  await sleep(QUIET);
  await undo();
  check('undo the rename', m(0).name === 'ref' && m(0).opacity === 19 / 20);
  await undo();
  check('one undo reverts the whole slider burst', m(0).opacity === undefined, String(m(0).opacity));
  check('undo marks the project changed', S().isDirty === true);
  await redo();
  await redo();
  check('redo twice restores both', m(0).opacity === 19 / 20 && m(0).name === 'renamed');

  // Undo during a burst closes the burst first
  S().edit((p) => { p.datasets![0].samples![0].micrographs![1].name = 'quick'; });
  await undo();
  check('undo right after an edit (no wait) undoes it', m(1).name === 'other');

  // New edit clears redo
  await redo();
  check('redo it', m(1).name === 'quick');
  await undo();
  S().edit((p) => { p.name = 'new edit'; });
  await sleep(QUIET);
  await redo();
  check('a new edit clears redo', m(1).name === 'other' && S().project!.name === 'new edit');

  // Selection: undo a spot add while it is selected; undo a delete reselects
  S().edit((p) => { p.datasets![0].samples![0].micrographs![1].spots!.push({ id: 'X9', name: 'new' } as never); });
  await sleep(QUIET);
  await S().selectMicrograph('M2');
  await S().selectActiveSpot('X9');
  store.setState({ selectedSpotIds: ['X9', 'X1'] });
  await undo();
  check('undo removes the added spot and clears its selection',
    !S().spotIndex.has('X9') && S().activeSpotId === null && JSON.stringify(S().selectedSpotIds) === '["X1"]');
  await S().selectMicrograph('M2');
  await redo();
  check('redo re-adds the spot and selects it', S().spotIndex.has('X9') && S().activeSpotId === 'X9');
  S().edit((p) => { p.datasets![0].samples![0].micrographs!.splice(0, 1); }); // delete M1 (and X1)
  await sleep(QUIET);
  check('micrograph deleted', !S().micrographIndex.has('M1') && !S().spotIndex.has('X1'));
  await S().selectMicrograph('M2');
  await undo();
  check('undo restores the micrograph and its spot', S().micrographIndex.has('M1') && S().spotIndex.has('X1'));
  check('undo of a delete navigates to the restored spot', S().activeMicrographId === 'M1' && S().activeSpotId === 'X1',
    `${S().activeMicrographId} ${S().activeSpotId}`);

  // Pulled change: not recorded, survives undo, blocks undo of the same entity
  S().edit((p) => { p.datasets![0].samples![0].micrographs![0].notes = 'mine'; });
  await sleep(QUIET);
  withoutUndoRecording(() => S().edit((p) => { p.datasets![0].samples![0].micrographs![1].notes = 'theirs'; }));
  await sleep(QUIET);
  await undo();
  check('pulled change is not an undo step and survives undo', m(0).notes === undefined && m(1).notes === 'theirs');
  await redo();
  withoutUndoRecording(() => S().edit((p) => { p.datasets![0].samples![0].micrographs![0].notes = 'theirs too'; }));
  const before = blocked.length;
  await undo();
  check('undo blocked when the entity changed remotely, with a notice',
    m(0).notes === 'theirs too' && blocked.length === before + 1 && blocked[blocked.length - 1].includes('micrograph'), blocked.join(' | '));

  // Per-user only: no step
  S().edit((p) => { p.datasets![0].samples![0].micrographs![0].isExpanded = true; });
  await sleep(QUIET);
  const n = m(0).name;
  await undo();
  check('tree expansion is not an undo step (undo goes to the previous edit instead)', m(0).isExpanded === true && m(0).name === n);

  // Switching projects clears history, also mid-burst
  S().edit((p) => { p.name = 'unsaved in A'; });
  S().load(project('Q'));
  await sleep(QUIET);
  await undo();
  check('history cleared on project switch', S().project!.id === 'Q' && S().project!.name === 'Project');
  S().edit((p) => { p.name = 'Q edit'; });
  await sleep(QUIET);
  S().load(project('Q')); // same project reloaded
  await undo();
  check('history cleared when the same project is reloaded', S().project!.name === 'Project');

  // Project replaced without loadProject (e.g. restored from saved state): history still cleared
  S().edit((p) => { p.name = 'Q edited'; });
  await sleep(QUIET);
  S().edit((p) => { p.name = 'Q mid-burst'; });
  const r = project('R');
  r.datasets![0].samples![0].micrographs![0].name = 'only in R';
  store.setState({ project: r, micrographIndex: buildMicrographIndex(r), spotIndex: buildSpotIndex(r) });
  await sleep(QUIET);
  await undo();
  check('history cleared when the project is replaced directly',
    S().project!.id === 'R' && S().project!.name === 'Project' && m(0).name === 'only in R', `${S().project!.name} / ${m(0).name}`);

  // Limit 50
  for (let i = 0; i < 55; i++) { S().edit((p) => { p.name = `v${i}`; }); await undo(); await redo(); }
  let count = 0;
  for (let i = 0; i < 60; i++) { const before2 = S().project!.name; await undo(); if (S().project!.name !== before2) count++; }
  check('at most 50 undo steps', count === 50, String(count));

  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  process.exit(failures ? 1 : 0);
})();
