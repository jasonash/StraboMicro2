/**
 * Tags of a spot and groups of a micrograph, for the right pane (Claire's
 * issue #61, 2026-11-17). Pure functions.
 *
 * A spot's tags are the tag ids in spot.tags (as in the v1 data model); a
 * micrograph's groups are the project groups whose micrographs list holds
 * its id.
 */

import type { GroupMetadata, ProjectMetadata, Spot, Tag } from '@/types/project-types';

/** The project's tags this spot has, in the project's order (ids of deleted tags are skipped) */
export function tagsOfSpot(project: ProjectMetadata | null | undefined, spot: Spot | null | undefined): Tag[] {
  const ids = new Set(spot?.tags ?? []);
  if (ids.size === 0) return [];
  return (project?.tags ?? []).filter((tag) => ids.has(tag.id));
}

/** The project's groups that hold this micrograph, in the project's order */
export function groupsOfMicrograph(project: ProjectMetadata | null | undefined, micrographId: string | null | undefined): GroupMetadata[] {
  if (!micrographId) return [];
  return (project?.groups ?? []).filter((group) => (group.micrographs ?? []).includes(micrographId));
}

/** What to add and remove to go from one list of tag ids to another */
export function tagChanges(current: string[], wanted: string[]): { add: string[]; remove: string[] } {
  const now = new Set(current);
  const next = new Set(wanted);
  return {
    add: wanted.filter((id, i) => !now.has(id) && wanted.indexOf(id) === i),
    remove: current.filter((id, i) => !next.has(id) && current.indexOf(id) === i),
  };
}
