/**
 * Undo / Redo
 *
 * Each undo step records only the entities an edit changed, as before/after
 * states (electron/shared/entityModel.mjs). Undo puts the before states
 * back and touches nothing else, so changes that arrive from a sync are
 * never reverted by an undo; if an entity in the step has changed since,
 * the whole step is skipped with a notice.
 *
 * - Edits are grouped: a burst of project changes becomes one step once the
 *   project has been quiet for QUIET_MS (a slider drag is one step).
 * - Opening, switching or closing a project clears the history.
 * - Per-user fields (tree expansion, key bindings) are not undone.
 * - Undo marks the project as changed and reselects the affected spot or
 *   micrograph; zoom, pan and the active tool are left alone.
 */

import {
  diffProjects,
  checkEntityChanges,
  applyEntityChanges,
  type EntityChange,
  type EntityState,
} from '../../electron/shared/entityModel.mjs';
import type { ProjectMetadata } from '@/types/project-types';
import { buildMicrographIndex, buildSpotIndex, selectionAfterChange } from './helpers';

const LIMIT = 50;
const QUIET_MS = 300;

/** The part of the app store undo works with. */
interface UndoableState {
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
}

/** The store methods undo uses (structural, so the app store with its middleware fits). */
interface Store {
  getState(): UndoableState;
  setState(partial: Partial<UndoableState>): void;
  subscribe(listener: (state: UndoableState, prev: UndoableState) => void): () => void;
}
type Direction = 'undo' | 'redo';

interface Step {
  changes: EntityChange[];
}

let store: Store | null = null;
let past: Step[] = [];
let future: Step[] = [];
/** Project as it was before the current burst of edits (null: no burst). */
let burstBase: ProjectMetadata | null = null;
let burstTimer: ReturnType<typeof setTimeout> | null = null;
/** Set while undo/redo writes the project, so the write is not recorded. */
let applying = false;
let onBlocked: (message: string) => void = (message) => console.warn(`[Undo] ${message}`);

/** Close the current burst of edits into a step. */
function flush(): void {
  if (burstTimer !== null) {
    clearTimeout(burstTimer);
    burstTimer = null;
  }
  const base = burstBase;
  burstBase = null;
  const current = store?.getState().project ?? null;
  if (!base || !current) return;
  const changes = diffProjects(base, current);
  if (changes.length === 0) return;
  past.push({ changes });
  if (past.length > LIMIT) past.shift();
  future = [];
}

/** Forget all undo and redo steps (project opened, switched or closed). */
export function resetUndoHistory(): void {
  if (burstTimer !== null) clearTimeout(burstTimer);
  burstTimer = null;
  burstBase = null;
  past = [];
  future = [];
}

/** Where the "cannot undo" notice goes (default: console). */
export function setUndoBlockedHandler(handler: (message: string) => void): void {
  onBlocked = handler;
}

/**
 * Run a project change that must not become an undo step (applying pulled
 * changes). Pending edits are closed into their own step first.
 */
export function withoutUndoRecording(fn: () => void): void {
  flush();
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

/** Start recording edits of the given store. Called once, where the store is created. */
export function installUndoHistory(appStore: Store): void {
  store = appStore;
  appStore.subscribe((state, prev) => {
    if (applying || state.project === prev.project) return;
    if (state.project?.id !== prev.project?.id) {
      resetUndoHistory();
      return;
    }
    if (burstBase === null) burstBase = prev.project;
    if (burstTimer !== null) clearTimeout(burstTimer);
    burstTimer = setTimeout(flush, QUIET_MS);
  });
}

function describe(changes: EntityChange[], key: string): string {
  const c = changes.find((x) => x.key === key);
  const type = (c?.after ?? c?.before)?.type ?? 'item';
  return type === 'point_count' ? 'point count' : type;
}

/** The spot or micrograph an applied step should bring into view, if any. */
function focusTarget(changes: EntityChange[], direction: Direction): EntityState | null {
  const targets = changes
    .map((c) => (direction === 'undo' ? c.before : c.after))
    .filter((t): t is EntityState => t !== null);
  return targets.find((t) => t.type === 'spot') ?? targets.find((t) => t.type === 'micrograph') ?? null;
}

async function applyStep(step: Step, direction: Direction): Promise<boolean> {
  if (!store) return false;
  const state = store.getState();
  const project = state.project;
  if (!project) return false;

  const check = checkEntityChanges(project, step.changes, direction);
  if (!check.ok) {
    const what = describe(step.changes, check.key);
    onBlocked(`Can't ${direction} this change: the ${what} it affects has changed since. It was skipped.`);
    return false;
  }

  const next = structuredClone(project);
  applyEntityChanges(next, step.changes, direction);
  const micrographIndex = buildMicrographIndex(next);
  const spotIndex = buildSpotIndex(next);

  applying = true;
  try {
    store.setState({
      project: next,
      isDirty: true,
      micrographIndex,
      spotIndex,
      // Selection must not point at entities the step removed
      ...selectionAfterChange(state, micrographIndex, spotIndex),
    });
  } finally {
    applying = false;
  }

  const target = focusTarget(step.changes, direction);
  if (target?.type === 'spot' && target.parentId) {
    const s = store.getState();
    if (s.activeMicrographId !== target.parentId && !(await s.selectMicrograph(target.parentId))) return true;
    await store.getState().selectActiveSpot(target.id);
  } else if (target?.type === 'micrograph') {
    await store.getState().selectMicrograph(target.id);
  }
  return true;
}

/** Undo the most recent step (Edit > Undo). */
export async function undo(): Promise<void> {
  flush();
  const step = past.pop();
  if (!step) return;
  if (await applyStep(step, 'undo')) future.push(step);
}

/** Redo the most recently undone step (Edit > Redo). */
export async function redo(): Promise<void> {
  flush();
  const step = future.pop();
  if (!step) return;
  if (await applyStep(step, 'redo')) past.push(step);
}
