/**
 * Saved Grain Size analyses (Claire's issue #64, 2026-11-23). Pure rules, no store.
 *
 * Decisions (Jason, 2026-11-23):
 *  - A "Current micrograph" analysis is kept on that micrograph, an
 *    "All micrographs" one on the project (grainAnalyses on each).
 *  - It keeps a fixed list of spots (the checked ones) and the rock type,
 *    never the numbers. Spots deleted or archived later drop out, and the
 *    dialog says how many.
 *  - The spot-list filters (mineral, tag, has data) only help checking boxes;
 *    they are not saved.
 */

import type { ProjectMetadata, SavedGrainAnalysis, Spot } from '@/types/project-types';
import type { AnalysisScope, PolygonSpotItem } from '@/utils/grainAnalysisRun';
import { tagsOfSpot } from '@/utils/tagsAndGroups';
import { sectionHasData, type SpotDataSectionId } from '@/utils/spotDataSections';

/** Where a saved analysis lives: a micrograph's list or the project's */
export type AnalysisHome = { kind: 'micrograph'; micrographId: string } | { kind: 'project' };

/** One saved analysis: where it lives and its id (the right pane opens the dialog with it) */
export interface SavedAnalysisRef {
  home: AnalysisHome;
  id: string;
}

export function homeForScope(scope: AnalysisScope, micrographId: string | null | undefined): AnalysisHome | null {
  if (scope === 'all') return { kind: 'project' };
  return micrographId ? { kind: 'micrograph', micrographId } : null;
}

export function scopeOfHome(home: AnalysisHome): AnalysisScope {
  return home.kind === 'project' ? 'all' : 'current';
}

export const MAX_ANALYSIS_NAME = 120;

/** A name as it will be saved: trimmed, inner runs of spaces kept, cut to the limit */
export function cleanAnalysisName(name: string): string {
  return name.trim().slice(0, MAX_ANALYSIS_NAME);
}

/** Why a name cannot be used in this list, or null when it can (exceptId: the one being renamed) */
export function analysisNameProblem(
  name: string,
  list: SavedGrainAnalysis[] | null | undefined,
  exceptId?: string
): string | null {
  const clean = cleanAnalysisName(name);
  if (clean === '') return 'Enter a name.';
  const lower = clean.toLocaleLowerCase();
  const taken = (list ?? []).some((a) => a.id !== exceptId && a.name.trim().toLocaleLowerCase() === lower);
  return taken ? 'An analysis with this name is already saved here.' : null;
}

/** A free default name: "Analysis 1", "Analysis 2", ... */
export function nextAnalysisName(list: SavedGrainAnalysis[] | null | undefined): string {
  const names = new Set((list ?? []).map((a) => a.name.trim().toLocaleLowerCase()));
  for (let n = 1; ; n++) {
    const name = `Analysis ${n}`;
    if (!names.has(name.toLocaleLowerCase())) return name;
  }
}

/** Spot ids in the order of the spot list (so a save does not depend on click order) */
export function orderedSpotIds(available: PolygonSpotItem[], checked: Set<string>): string[] {
  return available.filter(({ spot }) => checked.has(spot.id)).map(({ spot }) => spot.id);
}

/**
 * The spots of a saved analysis that can still be measured, and how many of
 * its saved spots are gone (deleted, archived, no longer a polygon, or moved
 * out of its micrograph).
 */
export function resolveAnalysisSpots(
  analysis: Pick<SavedGrainAnalysis, 'spotIds'>,
  available: PolygonSpotItem[]
): { items: PolygonSpotItem[]; missing: number } {
  const byId = new Map(available.map((item) => [item.spot.id, item]));
  const items: PolygonSpotItem[] = [];
  let missing = 0;
  for (const id of new Set(analysis.spotIds)) {
    const item = byId.get(id);
    if (item) items.push(item);
    else missing++;
  }
  return { items, missing };
}

export function missingSpotsText(missing: number): string {
  if (missing <= 0) return '';
  return missing === 1
    ? '1 spot saved in this analysis no longer exists (deleted or archived) and is left out.'
    : `${missing} spots saved in this analysis no longer exist (deleted or archived) and are left out.`;
}

/** Same spots (as a set) and same rock type: nothing to save */
export function analysisUnchanged(
  saved: SavedGrainAnalysis,
  spotIds: string[],
  rockType: SavedGrainAnalysis['rockType']
): boolean {
  if (saved.rockType !== rockType) return false;
  const a = new Set(saved.spotIds);
  const b = new Set(spotIds);
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// ============================================================================
// Spot-list filters (they only narrow the list shown for checking)

export const NO_MINERAL = '(no mineral)';

export interface SpotListFilter {
  /** Mineral names; NO_MINERAL matches spots without one. Empty = any */
  minerals: string[];
  /** Tag ids; a spot matches when it has any of them. Empty = any */
  tagIds: string[];
  /** Data sections the spot must have data in (all of them). Empty = any */
  sections: SpotDataSectionId[];
}

export const NO_SPOT_LIST_FILTER: SpotListFilter = { minerals: [], tagIds: [], sections: [] };

export function isSpotListFilterOn(filter: SpotListFilter): boolean {
  return filter.minerals.length > 0 || filter.tagIds.length > 0 || filter.sections.length > 0;
}

/** The mineral a spot is counted under (the first in its mineralogy, as in the analysis) */
export function mineralOfSpot(spot: Spot): string | null {
  const name = spot.mineralogy?.minerals?.[0]?.name;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/** Minerals among the spots, sorted, NO_MINERAL last when some spot has none */
export function mineralChoices(items: PolygonSpotItem[]): string[] {
  const names = new Set<string>();
  let none = false;
  for (const { spot } of items) {
    const m = mineralOfSpot(spot);
    if (m) names.add(m);
    else none = true;
  }
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  return none ? [...sorted, NO_MINERAL] : sorted;
}

/** The project's tags that at least one of the spots has, in the project's order */
export function tagChoices(project: ProjectMetadata | null | undefined, items: PolygonSpotItem[]): Array<{ id: string; name: string }> {
  const used = new Set<string>();
  for (const { spot } of items) for (const id of spot.tags ?? []) used.add(id);
  return (project?.tags ?? []).filter((t) => used.has(t.id)).map((t) => ({ id: t.id, name: t.name || 'Unnamed tag' }));
}

export function spotMatchesListFilter(
  project: ProjectMetadata | null | undefined,
  spot: Spot,
  filter: SpotListFilter
): boolean {
  if (filter.minerals.length > 0) {
    const m = mineralOfSpot(spot) ?? NO_MINERAL;
    if (!filter.minerals.includes(m)) return false;
  }
  if (filter.tagIds.length > 0) {
    const has = new Set(tagsOfSpot(project, spot).map((t) => t.id));
    if (!filter.tagIds.some((id) => has.has(id))) return false;
  }
  for (const section of filter.sections) {
    if (!sectionHasData(section, spot)) return false;
  }
  return true;
}
