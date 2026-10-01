/**
 * Applying pulled changes to the store (collaboration spec v3 §6.2, 16k)
 *
 * One store write sets the pulled values exactly: creates, field updates,
 * moves, deletes and child order. Indexes are rebuilt once, no store action
 * runs (their side effects, such as scale cascades, were already carried by
 * the other side's push), nothing is recorded for undo, and the selection
 * and viewer are left alone except where they pointed at a removed entity.
 */

import { applyEntityChanges, type EntityChange } from '../../electron/shared/entityModel.mjs';
import { useAppStore } from './useAppStore';
import { withoutUndoRecording } from './undoHistory';
import { buildMicrographIndex, buildSpotIndex, selectionAfterChange } from './helpers';

/**
 * @param changes - Entity changes in the app's form (sync:pull result)
 * @returns false when no project is open (nothing applied)
 */
export function applyRemoteChanges(changes: EntityChange[]): boolean {
  const state = useAppStore.getState();
  if (!state.project) return false;
  if (changes.length === 0) return true;
  const next = structuredClone(state.project);
  applyEntityChanges(next, changes, 'redo');
  const micrographIndex = buildMicrographIndex(next);
  const spotIndex = buildSpotIndex(next);
  withoutUndoRecording(() => {
    useAppStore.setState({
      project: next,
      micrographIndex,
      spotIndex,
      ...selectionAfterChange(state, micrographIndex, spotIndex),
    });
  });
  return true;
}
