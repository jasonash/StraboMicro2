/**
 * View > Micrograph Visibility... (Jason + Peter, 2026-10-29): the rows of the
 * panel and what its buttons change. The rows are every associated
 * micrograph placed under the micrograph in the viewer, in tree order and
 * indented by depth. A PPL/XPL pair is one row (the XPL is drawn where its
 * PPL is), and showing or hiding it changes both. Visibility (isMicroVisible)
 * is each person's own view (a per-user field, never synced). Pure functions
 * (npm run test:micrograph-visibility).
 */

import type { MicrographMetadata, ProjectMetadata } from '@/types/project-types';

export interface VisibilityRow {
  id: string;
  name: string;
  /** 0 = placed directly on the micrograph in the viewer */
  depth: number;
  visible: boolean;
  /** 0-1 */
  opacity: number;
  /** The row's ancestors below the micrograph in the viewer (nearest last) */
  ancestorIds: string[];
  /** The hidden secondary sibling (XPL) that follows this row's visibility, if any */
  siblingId: string | null;
}

function micrographsOf(project: ProjectMetadata | null | undefined): MicrographMetadata[] {
  const all: MicrographMetadata[] = [];
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) all.push(...(sample.micrographs ?? []));
  }
  return all;
}

/** The panel's rows for the micrograph in the viewer (depth-first, in the tree's order) */
export function visibilityRows(project: ProjectMetadata | null | undefined, rootId: string | null | undefined): VisibilityRow[] {
  if (!project || !rootId) return [];
  const all = micrographsOf(project);
  const byId = new Map(all.map((m) => [m.id, m]));
  const rows: VisibilityRow[] = [];
  const seen = new Set<string>([rootId]);
  const visit = (parentId: string, depth: number, ancestors: string[]) => {
    for (const m of all) {
      if (m.parentID !== parentId || m.isPrimarySibling === false || seen.has(m.id)) continue;
      seen.add(m.id);
      const sibling = m.siblingImageId ? byId.get(m.siblingImageId) : undefined;
      rows.push({
        id: m.id,
        name: m.name || m.imageFilename || 'Unnamed Micrograph',
        depth,
        visible: m.isMicroVisible !== false,
        opacity: m.opacity ?? 1,
        ancestorIds: ancestors,
        siblingId: sibling && sibling.isPrimarySibling === false ? sibling.id : null,
      });
      visit(m.id, depth + 1, [...ancestors, m.id]);
      // Children placed on the hidden XPL show in its PPL's place (as in the tree)
      if (sibling && sibling.isPrimarySibling === false) visit(sibling.id, depth + 1, [...ancestors, m.id]);
    }
  };
  visit(rootId, 0, []);
  return rows;
}

/** Rows whose name contains the text (case-insensitive); all rows for blank text */
export function filterRows(rows: VisibilityRow[], text: string): VisibilityRow[] {
  const q = text.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
}

/** Visibility for every micrograph a row stands for (the row and its XPL), as micrograph id => visible */
export function visibilityFor(rows: VisibilityRow[], visible: boolean): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const r of rows) {
    out.set(r.id, visible);
    if (r.siblingId) out.set(r.siblingId, visible);
  }
  return out;
}

/**
 * "Show only this one": the row and its ancestors shown (or it could not be
 * seen), every other row hidden. Only rows that change are returned.
 */
export function showOnlyUpdates(rows: VisibilityRow[], id: string): Map<string, boolean> {
  const target = rows.find((r) => r.id === id);
  if (!target) return new Map();
  const keep = new Set([id, ...target.ancestorIds]);
  const out = new Map<string, boolean>();
  for (const r of rows) {
    const visible = keep.has(r.id);
    if (r.visible === visible) continue;
    out.set(r.id, visible);
    if (r.siblingId) out.set(r.siblingId, visible);
  }
  return out;
}
