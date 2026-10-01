/**
 * Sync test scenarios (Debug > Sync Test, dev and -dev. builds only)
 *
 * Each scenario works in one window on the selected micrograph (and its
 * selected or first spot): it syncs first, makes "their" change on the
 * server as another computer of the same account (sync:test-other), makes
 * the local change through the store, then runs a sync cycle and checks
 * that the expected item reached the decisions dialog or notice. The user
 * then answers in the dialog and uses Compare with Server to see that both
 * sides agree.
 */

import { useAppStore } from '@/store';
import { useSyncStore, decisionsWaiting } from '@/store/useSyncStore';
import { getRestServerUrl } from '@/components/dialogs/PreferencesDialog';
import { buildMicrographIndex, buildSpotIndex } from '@/store/helpers';
import type { MicrographMetadata, ProjectMetadata, Spot } from '@/types/project-types';

export type SyncTestAction =
  | 'test-conflict' | 'test-shape' | 'test-placement' | 'test-their-delete' | 'test-my-delete' | 'test-refused'
  | 'test-notice' | 'test-compare';

const ACTIONS: readonly SyncTestAction[] = [
  'test-conflict', 'test-shape', 'test-placement', 'test-their-delete', 'test-my-delete', 'test-refused', 'test-notice',
  'test-compare',
];

/** A spot's points moved by dx (image pixels), as stored. */
function shiftedPoints(spot: Spot, dx: number): Array<{ X: number; Y: number }> {
  return (spot.points || []).map((p) => ({ X: (p.X ?? p.x ?? 0) + dx, Y: p.Y ?? p.y ?? 0 }));
}

function isSyncTestAction(a: string): a is SyncTestAction {
  return ACTIONS.some((x) => x === a);
}

const COUNT_WAIT_MS = 4_000;

/** Wait until the sync store shows a count above `before` (counts refresh after a cycle). */
async function waitForRise(read: () => number, before: number): Promise<boolean> {
  const until = Date.now() + COUNT_WAIT_MS;
  while (Date.now() < until) {
    if (read() > before) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return read() > before;
}

function findSample(project: ProjectMetadata, micrographId: string) {
  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      if ((sample.micrographs || []).some((m) => m.id === micrographId)) return { dataset, sample };
    }
  }
  return null;
}

/** The selected micrograph and spot (the selected spot if it is on it, else its first). */
function selection(): { micrograph: MicrographMetadata; spot: Spot | null } | null {
  const s = useAppStore.getState();
  const micrograph = s.activeMicrographId ? s.micrographIndex.get(s.activeMicrographId) : undefined;
  if (!micrograph) return null;
  const spots = micrograph.spots || [];
  const spot = spots.find((x) => x.id === s.activeSpotId) ?? spots[0] ?? null;
  return { micrograph, spot };
}

async function otherComputer(changes: Array<Record<string, unknown>>): Promise<string | null> {
  const api = window.api;
  const projectId = useSyncStore.getState().projectId;
  if (!api || !projectId) return 'Sync is not available';
  const r = await api.sync.testOther(projectId, getRestServerUrl(), changes);
  if (!r.ok) return r.message;
  const bad = r.results.filter((x) => x.status !== 'accepted');
  return bad.length > 0 ? `The other computer's change was not accepted: ${bad.map((x) => `${x.status}/${x.reason ?? ''}`).join(', ')}` : null;
}

async function compare(): Promise<void> {
  const api = window.api;
  const projectId = useSyncStore.getState().projectId;
  const project = useAppStore.getState().project;
  if (!api || !projectId || !project) return;
  // Compare what is on disk: save the app's project first
  await api.saveProjectJson(project, projectId);
  const r = await api.sync.testCompare(projectId, getRestServerUrl());
  if (!r.ok) {
    alert(`Compare failed: ${r.message}`);
    return;
  }
  const s = useSyncStore.getState();
  const waiting = `\n\nWaiting here: ${s.pending ?? '?'} changes not pushed, ${r.held} items held or waiting for a decision.`;
  if (r.differences.length === 0) {
    alert(`IN SYNC: all ${r.same} items match the server.${waiting}`);
  } else {
    const shown = r.differences.slice(0, 25).map((d) => `- ${d}`).join('\n');
    const more = r.differences.length > 25 ? `\n...and ${r.differences.length - 25} more` : '';
    alert(`${r.differences.length} DIFFERENCES (${r.same} items match):\n${shown}${more}${waiting}`);
  }
}

/** Run one Debug > Sync Test item (other actions are ignored). */
export async function runSyncTestScenario(action: string): Promise<void> {
  if (!isSyncTestAction(action)) return;
  const sync = useSyncStore.getState();
  if (!sync.synced) {
    alert('Open a synced project first.');
    return;
  }
  if (action === 'test-compare') {
    await compare();
    return;
  }
  if (decisionsWaiting(sync) > 0) {
    alert('Settle the waiting decisions first (Debug > Sync: Review Decisions...), so this test starts clean.');
    return;
  }
  const sel = selection();
  if (!sel) {
    alert('Select a micrograph first (and optionally one of its spots).');
    return;
  }
  const { micrograph, spot } = sel;
  const needsSpot = action !== 'test-refused' && action !== 'test-placement';
  if (needsSpot && !spot) {
    alert('The selected micrograph needs at least one spot for this test.');
    return;
  }
  if (action === 'test-shape' && (spot?.points || []).length === 0) {
    alert('The spot has no points to move; select a spot with a shape.');
    return;
  }
  if (action === 'test-placement' && (!micrograph.parentID || micrograph.placementType === 'affine')) {
    // An affine overlay's picture is baked into tiles: a matrix change alone would leave them stale
    alert('Select an associated micrograph placed as a rectangle or a point (not affine).');
    return;
  }
  const project = useAppStore.getState().project;
  const where = project ? findSample(project, micrograph.id) : null;
  if (!project || !where) return;

  const controller = await import('@/services/syncController');
  // Start from a synced state, so "their" change is based on what this copy has
  await controller.runCycleAndWait(true);
  if (decisionsWaiting(useSyncStore.getState()) > 0) {
    alert('Syncing first brought up decisions; settle them, then run the test again.');
    return;
  }

  const store = useAppStore.getState();
  const stamp = new Date().toLocaleTimeString();
  let error: string | null = null;
  let expect: { read: () => number; what: string };
  const conflicts = () => useSyncStore.getState().conflicts;
  const questions = () => useSyncStore.getState().questions;
  const refused = () => useSyncStore.getState().refused;

  if (action === 'test-conflict' || action === 'test-notice') {
    const s = spot!;
    error = await otherComputer([{ op: 'update', type: 'spot', id: s.id, fields: {
      name: `${s.name} (theirs ${stamp})`, notes: `Notes from the other computer ${stamp}` } }]);
    if (!error) store.updateSpotData(s.id, { name: `${s.name} (mine ${stamp})`, notes: `Notes from this computer ${stamp}` });
    expect = { read: conflicts, what: 'a conflict on the spot' };
  } else if (action === 'test-shape') {
    // Each side moves the shape sideways by 5% of the image width, in opposite directions
    const s = spot!;
    const dx = Math.max(20, Math.round(0.05 * (micrograph.imageWidth || micrograph.width || 1000)));
    error = await otherComputer([{ op: 'update', type: 'spot', id: s.id, fields: { points: shiftedPoints(s, dx) } }]);
    if (!error) store.updateSpotData(s.id, { points: shiftedPoints(s, -dx) });
    expect = { read: conflicts, what: 'a shape conflict on the spot' };
  } else if (action === 'test-placement') {
    // Each side rotates it, in opposite directions
    const r = micrograph.rotation || 0;
    error = await otherComputer([{ op: 'update', type: 'micrograph', id: micrograph.id, fields: { rotation: r + 15 } }]);
    if (!error) store.updateMicrographMetadata(micrograph.id, { rotation: r - 15 });
    expect = { read: conflicts, what: 'a placement conflict on the micrograph' };
  } else if (action === 'test-their-delete') {
    error = await otherComputer([{ op: 'delete', type: 'micrograph', id: micrograph.id }]);
    if (!error) store.updateSpotData(spot!.id, { name: `${spot!.name} (edited here ${stamp})` });
    expect = { read: questions, what: '"They deleted ..." question' };
  } else if (action === 'test-my-delete') {
    error = await otherComputer([{ op: 'update', type: 'spot', id: spot!.id, fields: { name: `${spot!.name} (edited there ${stamp})` } }]);
    if (!error) store.deleteMicrograph(micrograph.id);
    expect = { read: questions, what: '"You deleted ..." question' };
  } else {
    // A micrograph with micrographs nested under it may not move to another sample
    const nested = (where.sample.micrographs || []).some((m) => m.parentID === micrograph.id);
    if (!nested) {
      alert('Select a micrograph that has associated micrographs placed on it (the server refuses to move such a micrograph to another sample).');
      return;
    }
    const next = structuredClone(project);
    const dataset = (next.datasets || []).find((d) => d.id === where.dataset.id);
    const fromSample = dataset?.samples?.find((x) => x.id === where.sample.id);
    if (!dataset || !fromSample) return;
    let target = (dataset.samples || []).find((x) => x.id !== fromSample.id);
    if (!target) {
      target = { id: crypto.randomUUID(), name: `Sync test sample ${stamp}`, micrographs: [] };
      dataset.samples = [...(dataset.samples || []), target];
    }
    const moving = (fromSample.micrographs || []).find((m) => m.id === micrograph.id);
    if (!moving) return;
    fromSample.micrographs = (fromSample.micrographs || []).filter((m) => m.id !== micrograph.id);
    target.micrographs = [...(target.micrographs || []), moving];
    useAppStore.setState({ project: next, micrographIndex: buildMicrographIndex(next), spotIndex: buildSpotIndex(next) });
    expect = { read: refused, what: 'a change the server did not accept' };
  }
  if (error) {
    alert(`Test not run: ${error}`);
    return;
  }

  const before = expect.read();
  await controller.runCycleAndWait(action !== 'test-notice');
  const rose = await waitForRise(expect.read, before);
  if (!rose) {
    alert(`TEST FAILED: expected ${expect.what}, but none appeared. Use Debug > Sync Test: Compare with Server and send Claude the result.`);
  } else if (action === 'test-notice') {
    console.log('[Sync Test] Notice scenario: expect the bottom-left notice, not the dialog');
  }
}
