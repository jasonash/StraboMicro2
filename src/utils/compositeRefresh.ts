/**
 * Composite thumbnails after changes no dialog regenerated them for
 *
 * A composite thumbnail is a micrograph's image with its placed children on
 * it (electron/main.js composite:generate-thumbnail), so it goes stale when
 * a child is created, removed, moved to another parent, placed differently,
 * hidden or shown. The dialogs that do such edits regenerate it themselves;
 * changes applied as a whole (undo/redo, sync pulls, sync decisions) come
 * here, and so do images a pull downloaded (main leaves a synced copy's
 * composite as it was while an image it shows is missing). Regeneration
 * runs one at a time in the background; the tree and the groups panel
 * reload a thumbnail on 'thumbnail-generated'.
 */

import type { EntityChange } from '../../electron/shared/entityModel.mjs';
import type { ProjectMetadata } from '@/types/project-types';
import { findMicrographById } from '@/store/helpers';

/** Micrograph fields the composite of its parent shows. */
const DRAWN_ON_PARENT = [
  'parentID', 'offsetInParent', 'pointInParent', 'xOffset', 'yOffset', 'rotation', 'placementType', 'affineMatrix',
  'affineTileHash', 'affineBoundsOffset', 'isMicroVisible', 'opacity', 'isPrimarySibling', 'isFlipped',
  'width', 'height', 'imageWidth', 'imageHeight', 'scalePixelsPerCentimeter',
] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function parentOf(body: Record<string, unknown> | undefined): string | null {
  const p = body?.parentID;
  return typeof p === 'string' && p ? p : null;
}

/**
 * Micrographs whose composite these changes made stale: the parents a
 * child was added to, removed from, or redrawn on.
 * @param withCreated - Also the created micrographs themselves (their file may
 *   be missing, e.g. one brought back); not for pulls, whose files download
 */
export function compositesAffectedBy(changes: EntityChange[], { withCreated = false } = {}): string[] {
  const out = new Set<string>();
  for (const c of changes) {
    const type = (c.after ?? c.before)?.type;
    if (type !== 'micrograph') continue;
    const before = c.before?.body as Record<string, unknown> | undefined;
    const after = c.after?.body as Record<string, unknown> | undefined;
    const drawn = !before || !after || DRAWN_ON_PARENT.some((f) => !same(before[f], after[f]));
    if (drawn) {
      const a = parentOf(before);
      const b = parentOf(after);
      if (a) out.add(a);
      if (b) out.add(b);
    }
    if (withCreated && !c.before && c.after) out.add(c.after.id);
  }
  return [...out];
}

/**
 * Micrographs whose composite shows these micrographs' images: their parents,
 * and each one itself when it has children (a composite left as it was while
 * an image downloaded is made when the image arrives).
 */
export function compositesShowing(project: ProjectMetadata | null, micrographIds: string[]): string[] {
  if (!project || micrographIds.length === 0) return [];
  const ids = new Set(micrographIds);
  const out = new Set<string>();
  for (const dataset of project.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const m of sample.micrographs ?? []) {
        if (ids.has(m.id) && m.parentID) out.add(m.parentID);
        if (m.parentID && ids.has(m.parentID)) out.add(m.parentID);
      }
    }
  }
  return [...out];
}

let queue: Promise<void> = Promise.resolve();
const waiting = new Set<string>();

/**
 * Regenerate these micrographs' composites (in the background, one at a time).
 * @param getProject - The project as it is when each one runs
 */
export function regenerateComposites(micrographIds: string[], getProject: () => ProjectMetadata | null): void {
  if (typeof window === 'undefined') return; // unit tests
  for (const id of micrographIds) {
    if (waiting.has(id)) continue;
    waiting.add(id);
    queue = queue.then(async () => {
      waiting.delete(id);
      const project = getProject();
      if (!project || !window.api || !findMicrographById(project, id)) return;
      try {
        const r = await window.api.generateCompositeThumbnail(project.id, id, project);
        // Not made while an image is still downloading: compositesShowing redoes it on arrival
        if (r.success) window.dispatchEvent(new CustomEvent('thumbnail-generated', { detail: { micrographId: id } }));
      } catch (err) {
        console.warn(`[Thumbnails] Could not regenerate the composite of ${id}:`, err);
      }
    });
  }
}
