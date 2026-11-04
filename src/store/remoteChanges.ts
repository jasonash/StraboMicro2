/**
 * Applying pulled changes to the store (collaboration spec v3 §6.2, 16k)
 *
 * One store write sets the pulled values exactly: creates, field updates,
 * moves, deletes and child order. Indexes are rebuilt once, no store action
 * runs (their side effects, such as scale cascades, were already carried by
 * the other side's push), nothing is recorded for undo (unless asked), and the selection
 * and viewer are left alone except where they pointed at a removed entity.
 */

import { applyEntityChanges, type EntityChange } from '../../electron/shared/entityModel.mjs';
import { useAppStore } from './useAppStore';
import { withoutUndoRecording } from './undoHistory';
import { buildMicrographIndex, buildSpotIndex, selectionAfterChange } from './helpers';

/**
 * @param changes - Entity changes in the app's form (sync:pull result)
 * @param options.undoable - Record the write as an ordinary undo step (a
 *   sync decision that takes their value is the user's own edit, 16y)
 * @returns false when no project is open (nothing applied)
 */
export function applyRemoteChanges(changes: EntityChange[], { undoable = false }: { undoable?: boolean } = {}): boolean {
  const state = useAppStore.getState();
  if (!state.project) return false;
  if (changes.length === 0) return true;
  const next = structuredClone(state.project);
  applyEntityChanges(next, changes, 'redo');
  const micrographIndex = buildMicrographIndex(next);
  const spotIndex = buildSpotIndex(next);
  const write = () => {
    useAppStore.setState({
      project: next,
      micrographIndex,
      spotIndex,
      ...selectionAfterChange(state, micrographIndex, spotIndex),
    });
  };
  if (undoable) write();
  else withoutUndoRecording(write);
  return true;
}

let applyingStamps = false;

/** True while the times a save stamped are being taken back (not an edit: sync ignores it) */
export function isApplyingSavedStamps(): boolean {
  return applyingStamps;
}

/**
 * Take back the modifiedTimestamp values a save wrote, so the project in the
 * store matches project.json (the save keeps a time the store set that
 * differs from the file, e.g. one a pull brought). No undo step, not an
 * unsaved change.
 */
export function applySavedStamps(projectId: string, stamps: SavedStamps): void {
  const project = useAppStore.getState().project;
  if (!project || project.id !== projectId) return;
  const projectTs = stamps.project ?? project.modifiedTimestamp;
  let changed = projectTs !== project.modifiedTimestamp;
  const datasets = (project.datasets ?? []).map((d) => {
    const ts = stamps.datasets[d.id];
    if (!ts || ts === d.modifiedTimestamp) return d;
    changed = true;
    return { ...d, modifiedTimestamp: ts };
  });
  if (!changed) return;
  withoutUndoRecording(() => {
    applyingStamps = true;
    try {
      useAppStore.setState({ project: { ...project, modifiedTimestamp: projectTs, datasets } });
    } finally {
      applyingStamps = false;
    }
  });
}
