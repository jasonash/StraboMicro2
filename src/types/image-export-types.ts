/**
 * Image Export Types
 *
 * Shared by the unified image export dialog (File > Export Images... and the
 * per-micrograph export button) and the main-process renderer in
 * electron/imageExport.js. Keep the option names in sync with that module.
 */

export type ImageExportFormat = 'jpeg' | 'png' | 'svg';

/**
 * Which sketch layers to draw.
 * - 'visible' / 'all' / 'none': rule applied per micrograph (batch export)
 * - string[]: explicit layer ids (single-micrograph export)
 */
export type SketchLayerSelection = 'visible' | 'all' | 'none' | string[];

export interface ImageExportOptions {
  format: ImageExportFormat;
  /** Base micrograph pixels. Off = transparent annotation-only PNG. */
  includeImage: boolean;
  /** Child micrograph overlays and point-located micrograph markers. */
  includeOverlays: boolean;
  /** Spot shapes (points, lines, polygons). */
  includeSpots: boolean;
  /** Spot name labels. */
  includeLabels: boolean;
  sketchLayers: SketchLayerSelection;
}

/**
 * The user's remembered export settings. Layer choices are per micrograph, so
 * only the visible/none rule is persisted.
 */
export interface ImageExportPreferences extends Omit<ImageExportOptions, 'sketchLayers'> {
  sketchLayers: 'visible' | 'none';
}

export const DEFAULT_IMAGE_EXPORT_PREFERENCES: ImageExportPreferences = {
  format: 'jpeg',
  includeImage: true,
  includeOverlays: true,
  includeSpots: true,
  includeLabels: true,
  sketchLayers: 'visible',
};

/** Batch export request: options plus an optional id filter (null = all). */
export interface BatchImageExportRequest extends ImageExportOptions {
  micrographIds: string[] | null;
}

export interface ImageExportProgress {
  current: number;
  total: number;
  currentName: string;
  status: 'processing' | 'complete' | 'error';
  error?: string;
}

export interface ImageExportResult {
  success: boolean;
  canceled?: boolean;
  filePath?: string;
  /** Batch only: number of images written to the ZIP */
  exported?: number;
  error?: string;
  /** Batch only: per-micrograph failures (the ZIP still contains the rest) */
  errors?: Array<{ micrographId: string; name: string; error: string }>;
}

/** Reduce a concrete selection to the persisted rule. */
export function toPersistedSketchSelection(selection: SketchLayerSelection): 'visible' | 'none' {
  if (Array.isArray(selection)) return selection.length > 0 ? 'visible' : 'none';
  return selection === 'none' ? 'none' : 'visible';
}

/** True when the options would draw at least one thing. */
export function imageExportHasContent(options: ImageExportOptions): boolean {
  if (options.includeImage || options.includeOverlays || options.includeSpots || options.includeLabels) {
    return true;
  }
  return Array.isArray(options.sketchLayers)
    ? options.sketchLayers.length > 0
    : options.sketchLayers !== 'none';
}
