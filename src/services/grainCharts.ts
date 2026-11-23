/**
 * The Grain Size charts for print and download: the histogram and the rose
 * drawn with print colors on white, as a PNG (3x for sharp print) or an SVG
 * (vector, editable). Used by the PDF and by each chart's download button
 * (Jason, 2026-11-23). Same drawing functions as the screen.
 */

import type { RockType } from '@/services/grainAnalysis/types';
import { generateHistogramBins, generateRoseSectors, getClassificationScheme } from '@/services/grainAnalysis/statistics';
import { drawSizeHistogram, HISTOGRAM_PRINT_COLORS } from '@/components/charts/drawHistogram';
import { drawRoseDiagram, roseCircularStats, ROSE_PRINT_COLORS } from '@/components/charts/drawRose';
import { SvgContext, type ChartContext } from '@/utils/svgContext';

/** Chart sizes, as in the dialog */
export const HISTOGRAM_SIZE = { width: 520, height: 300 } as const;
export const ROSE_SIZE = 280;
const PNG_SCALE = 3;

export interface HistogramInput {
  sizes: number[];
  rockType: RockType;
  useLogScale: boolean;
  showGrid: boolean;
}

export interface RoseInput {
  orientations: number[];
}

export type ChartFormat = 'png' | 'svg';

function drawHistogram(ctx: ChartContext, input: HistogramInput) {
  drawSizeHistogram(ctx, {
    ...HISTOGRAM_SIZE,
    bins: generateHistogramBins(input.sizes, 15, input.useLogScale),
    classification: getClassificationScheme(input.rockType),
    useLogScale: input.useLogScale,
    showGrid: input.showGrid,
    colors: HISTOGRAM_PRINT_COLORS,
  });
}

function drawRose(ctx: ChartContext, input: RoseInput) {
  drawRoseDiagram(ctx, {
    size: ROSE_SIZE,
    sectors: generateRoseSectors(input.orientations, 18),
    orientationCount: input.orientations.length,
    circularStats: roseCircularStats(input.orientations),
    showMean: true,
    colors: ROSE_PRINT_COLORS,
  });
}

/** PNG data URL of a drawing, width x height at PNG_SCALE, on white ('' when no canvas) */
function png(width: number, height: number, draw: (ctx: ChartContext) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = width * PNG_SCALE;
  canvas.height = height * PNG_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.scale(PNG_SCALE, PNG_SCALE);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  return canvas.toDataURL('image/png');
}

function svg(width: number, height: number, title: string, draw: (ctx: ChartContext) => void): string {
  const ctx = new SvgContext();
  draw(ctx);
  return ctx.toSvg(width, height, '#ffffff', title);
}

export function histogramPng(input: HistogramInput): string {
  return png(HISTOGRAM_SIZE.width, HISTOGRAM_SIZE.height, (ctx) => drawHistogram(ctx, input));
}

export function histogramSvg(input: HistogramInput): string {
  return svg(HISTOGRAM_SIZE.width, HISTOGRAM_SIZE.height, 'Grain size distribution', (ctx) => drawHistogram(ctx, input));
}

export function rosePng(input: RoseInput): string {
  return png(ROSE_SIZE, ROSE_SIZE, (ctx) => drawRose(ctx, input));
}

export function roseSvg(input: RoseInput): string {
  return svg(ROSE_SIZE, ROSE_SIZE, 'Grain orientation rose diagram', (ctx) => drawRose(ctx, input));
}

/** A file name without characters file systems refuse */
export function chartFileName(base: string): string {
  return base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 150) || 'chart';
}

/**
 * Ask where to save one chart and write it. kind picks the chart; the name
 * is the file name without extension. Resolves to the saved path, or null.
 */
export async function downloadChart(
  kind: 'histogram' | 'rose',
  format: ChartFormat,
  histogram: HistogramInput,
  rose: RoseInput,
  name: string
): Promise<string | null> {
  const api = window.api;
  if (!api) return null;
  const data = kind === 'histogram'
    ? (format === 'svg' ? histogramSvg(histogram) : histogramPng(histogram))
    : (format === 'svg' ? roseSvg(rose) : rosePng(rose));
  if (!data) return null;
  const result = await api.saveGrainChart(data, format, chartFileName(name));
  return result.success ? result.filePath ?? null : null;
}
