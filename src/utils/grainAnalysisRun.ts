/**
 * One Grain Size Analysis run, shared by the dialog, the right pane's
 * summaries and the PDF export (Claire's issue #64, 2026-11-23), so all three
 * always show the same numbers for the same spots.
 *
 * Scope "current" covers one micrograph in its own frame; "all" covers every
 * micrograph, with orientations turned into each grain's reference micrograph
 * frame (src/utils/grainFrames.ts). Pure: no store, no React.
 */

import type { MicrographMetadata, ProjectMetadata, Spot } from '@/types/project-types';
import { grainMetricsInFrames, type FrameSummary } from '@/utils/grainFrames';
import { analyzeGrains } from '@/services/grainAnalysis/statistics';
import type { GrainAnalysisResults, RockType } from '@/services/grainAnalysis/types';
import { isPolygonType } from '@/utils/spotGeometryType';

export type AnalysisScope = 'current' | 'all';

export interface PolygonSpotItem {
  spot: Spot;
  micrograph: MicrographMetadata;
}

type Lookup = (id: string) => MicrographMetadata | undefined;

/** Every micrograph of the project, in tree order */
export function allMicrographs(project: ProjectMetadata | null | undefined): MicrographMetadata[] {
  const all: MicrographMetadata[] = [];
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      for (const micrograph of sample.micrographs ?? []) all.push(micrograph);
    }
  }
  return all;
}

/** The micrographs a scope covers: the given one, or all of them */
export function micrographsInScope(
  project: ProjectMetadata | null | undefined,
  scope: AnalysisScope,
  current: MicrographMetadata | null | undefined
): MicrographMetadata[] {
  if (scope === 'current') return current ? [current] : [];
  return allMicrographs(project);
}

/** The polygon spots an analysis can use (archived spots left out), in tree order */
export function polygonSpotsOf(micrographs: MicrographMetadata[]): PolygonSpotItem[] {
  const out: PolygonSpotItem[] = [];
  for (const micrograph of micrographs) {
    for (const spot of micrograph.spots ?? []) {
      if (!isPolygonType(spot.geometryType) || spot.archived) continue;
      out.push({ spot, micrograph });
    }
  }
  return out;
}

/** Name of the sample that holds a micrograph ('' when not found) */
export function sampleNameOf(project: ProjectMetadata | null | undefined, micrographId: string): string {
  for (const dataset of project?.datasets ?? []) {
    for (const sample of dataset.samples ?? []) {
      if (sample.micrographs?.some((m) => m.id === micrographId)) {
        return sample.label || sample.sampleID || sample.name || '';
      }
    }
  }
  return '';
}

export interface GrainAnalysisRun {
  results: GrainAnalysisResults | null;
  /** Reference frames the orientations were measured in (more than one = unrelated frames combined) */
  frames: FrameSummary[];
  /** Polygons that gave a measurement (spots with too few points give none) */
  measured: number;
}

/**
 * Analyze the given spots. micrographs = the scope's micrographs (for the
 * coverage area and the size scale); items = the spots to measure.
 */
export function runGrainAnalysis(
  project: ProjectMetadata | null | undefined,
  micrographs: MicrographMetadata[],
  items: PolygonSpotItem[],
  lookup: Lookup,
  scope: AnalysisScope,
  rockType: RockType
): GrainAnalysisRun {
  const { metrics, frames } = grainMetricsInFrames(items, lookup, scope === 'all');
  const first = micrographs[0];
  if (metrics.length === 0 || !first) return { results: null, frames, measured: metrics.length };

  // Coverage is measured against every micrograph in scope
  let totalAreaMicrons2 = 0;
  for (const micrograph of micrographs) {
    const micronsPerPixel = 10000 / (micrograph.scalePixelsPerCentimeter || 100);
    totalAreaMicrons2 += (micrograph.width || 1000) * (micrograph.height || 1000) * micronsPerPixel * micronsPerPixel;
  }

  const results = analyzeGrains(
    metrics,
    first.id,
    first.name || 'Unknown',
    sampleNameOf(project, first.id),
    first.scalePixelsPerCentimeter || 100,
    totalAreaMicrons2,
    rockType
  );
  return { results, frames, measured: metrics.length };
}

/** Circular standard deviation of the orientations, in degrees, as the dialog prints it after ± */
export function orientationSpreadDegrees(results: GrainAnalysisResults): number {
  return (Math.sqrt(-2 * Math.log(results.orientationStrength)) * 180) / Math.PI / 2;
}
