/**
 * Grain Size Analysis PDF, renderer side (Claire's issue #64, 2026-11-23).
 *
 * Draws the histogram and the rose with print colors (src/services/grainCharts.ts,
 * 3x for a sharp page), formats the text exactly as the dialog
 * shows it, and hands both to the main process (electron/grainAnalysisPdf.js),
 * which asks where to save and lays the page out.
 */

import type { GrainAnalysisResults, RockType } from '@/services/grainAnalysis/types';
import { roseCaption } from '@/components/charts/drawRose';
import { histogramPng, rosePng } from '@/services/grainCharts';
import { orientationSpreadDegrees } from '@/utils/grainAnalysisRun';

export interface GrainAnalysisPdfContent {
  title: string;
  details: string[];
  histogramPng: string;
  rosePng: string | null;
  roseCaption: string[];
  roseNote?: string;
  stats: Array<{ heading: string; rows: Array<[string, string]> }>;
  minerals: Array<{ mineral: string; count: string; mean: string; aspectRatio: string; orientation: string }>;
}

export interface GrainAnalysisPdfInput {
  results: GrainAnalysisResults;
  /** Saved analysis name, or null for an unsaved one */
  name: string | null;
  projectName: string;
  /** e.g. 'Current micrograph: Thin section 1' or 'All micrographs' */
  scopeText: string;
  rockType: RockType;
  useLogScale: boolean;
  showGrid: boolean;
  /** Which image's right side 0° points to (the rose caption) */
  frameDescription: string;
  /** Combined unrelated frames, deleted spots, etc. */
  roseNote?: string;
  missingNote?: string;
}


function formatSize(microns: number): string {
  if (microns >= 1000) return (microns / 1000).toFixed(2) + ' mm';
  return microns.toFixed(1) + ' µm';
}

function formatArea(microns2: number): string {
  const mm2 = microns2 / 1e6;
  if (mm2 >= 1) return mm2.toFixed(2) + ' mm²';
  if (mm2 >= 0.01) return mm2.toFixed(3) + ' mm²';
  if (mm2 >= 0.001) return mm2.toFixed(4) + ' mm²';
  if (microns2 >= 1000) return Math.round(microns2).toLocaleString() + ' µm²';
  return microns2.toFixed(1) + ' µm²';
}

const ROCK_TYPE_LABEL: Record<RockType, string> = {
  sedimentary: 'Sedimentary',
  igneous: 'Igneous',
  metamorphic: 'Metamorphic',
};

/** Does the rose show (same rule as the dialog: some elongated grains) */
export function showsRose(results: GrainAnalysisResults): boolean {
  return results.grains.some((g) => g.aspectRatio > 1.2);
}

/** Everything the PDF page needs, as the dialog shows it */
export function buildGrainAnalysisPdfContent(input: GrainAnalysisPdfInput): GrainAnalysisPdfContent {
  const { results } = input;
  const sizes = results.grains.map((g) => g.equivalentDiameterMicrons);
  const orientations = results.grains.map((g) => g.orientationDegrees);

  // The charts as the dialog shows them, in print colors
  const histogram = histogramPng({ sizes, rockType: input.rockType, useLogScale: input.useLogScale, showGrid: input.showGrid });
  const rose = showsRose(results) ? rosePng({ orientations }) || null : null;

  const s = results.sizeStats;
  const sizeRows: Array<[string, string]> = [
    ['Mean', formatSize(s.mean)],
    ['Median', formatSize(s.median)],
    ['Std Dev', formatSize(s.stdDev)],
    ['Range', `${formatSize(s.min)} - ${formatSize(s.max)}`],
  ];
  if (results.sortingCoefficient !== null) {
    sizeRows.push(['Sorting', `${results.sortingCoefficient.toFixed(2)} (${results.sortingClass})`]);
  }
  sizeRows.push(['Skewness', `${s.skewness >= 0 ? '+' : ''}${s.skewness.toFixed(2)}`]);

  const shapeRows: Array<[string, string]> = [
    ['Mean Aspect Ratio', results.aspectRatioStats.mean.toFixed(2)],
    ['Mean Circularity', results.circularityStats.mean.toFixed(2)],
  ];
  if (results.preferredOrientation !== null) {
    shapeRows.push([
      'Preferred Orientation',
      `${results.preferredOrientation.toFixed(0)}° ± ${orientationSpreadDegrees(results).toFixed(0)}°`,
    ]);
  }

  const details = [
    `Project: ${input.projectName}`,
    `Scope: ${input.scopeText}`,
    `Polygon spots: ${s.count} · Rock type: ${ROCK_TYPE_LABEL[input.rockType]} · Exported ${new Date().toLocaleString()}`,
  ];
  if (input.missingNote) details.push(input.missingNote);

  return {
    title: input.name ? `Grain Size Analysis: ${input.name}` : 'Grain Size Analysis',
    details,
    histogramPng: histogram,
    rosePng: rose,
    roseCaption: rose ? roseCaption(input.frameDescription, true) : [],
    roseNote: rose ? input.roseNote : undefined,
    stats: [
      {
        heading: 'Summary',
        rows: [
          ['Grains', String(s.count)],
          ['Total Area', formatArea(results.totalAreaMicrons2)],
          ['Coverage', `${results.totalAreaPercent.toFixed(1)}%`],
        ],
      },
      { heading: 'Size (Equiv. Diameter)', rows: sizeRows },
      { heading: 'Shape', rows: shapeRows },
    ],
    minerals: results.mineralGroups.map((g) => ({
      mineral: g.mineral,
      count: String(g.count),
      mean: formatSize(g.sizeStats.mean),
      aspectRatio: g.meanAspectRatio.toFixed(1),
      orientation: g.meanAspectRatio > 1.2 ? `${g.meanOrientation.toFixed(0)}°` : '',
    })),
  };
}

/** Ask where to save and write the PDF; resolves to the saved path, or null when cancelled */
export async function exportGrainAnalysisPdf(input: GrainAnalysisPdfInput): Promise<string | null> {
  const api = window.api;
  if (!api) return null;
  const content = buildGrainAnalysisPdfContent(input);
  const date = new Date().toISOString().slice(0, 10);
  const defaultName = input.name ? `Grain Size - ${input.name}` : `Grain Size Analysis ${date}`;
  const result = await api.exportGrainAnalysisPdf(content, defaultName);
  return result.success ? result.filePath ?? null : null;
}
