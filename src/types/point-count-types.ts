/**
 * Point Count Types
 *
 * TypeScript interfaces for the Point Count system.
 * Point counting is a statistical sampling technique for determining
 * modal composition of rocks. Points are fundamentally different from
 * spots - they are temporary sampling locations, not permanent features.
 */

/**
 * A single point in a point count grid
 */
export interface PointCountPoint {
  /** Unique identifier for this point */
  id: string;
  /** Canvas X coordinate */
  x: number;
  /** Canvas Y coordinate */
  y: number;
  /** Grid row (for regular/stratified grids) */
  row: number;
  /** Grid column (for regular/stratified grids) */
  col: number;
  /** Classified mineral name (undefined = unclassified) */
  mineral?: string;
  /** ISO timestamp when classified */
  classifiedAt?: string;
}

/**
 * Grid configuration for a point count session
 */
export interface PointCountGridSettings {
  /** Number of rows in the grid */
  rows: number;
  /** Number of columns in the grid */
  cols: number;
  /** Total number of points */
  totalPoints: number;
  /** Optional offset from origin */
  offset?: { x: number; y: number };
}

/**
 * Summary statistics for a point count session
 */
export interface PointCountSummary {
  /** Total number of points in the session */
  totalPoints: number;
  /** Number of points that have been classified */
  classifiedCount: number;
  /** Modal composition: mineral name -> count */
  modalComposition: Record<string, number>;
}

/**
 * A complete point count session
 */
export interface PointCountSession {
  /** Unique identifier (UUID) */
  id: string;
  /** Parent micrograph ID */
  micrographId: string;
  /** User-editable name, e.g., "Point Count - Dec 13, 2025" */
  name: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when last updated */
  updatedAt: string;

  /** Grid type used for point generation */
  gridType: 'regular' | 'random' | 'stratified';
  /** Grid configuration (immutable after creation) */
  gridSettings: PointCountGridSettings;

  /** All points in this session */
  points: PointCountPoint[];

  /** Cached summary statistics (updated on save) */
  summary: PointCountSummary;
}

/**
 * Lightweight session summary for listing sessions without loading full data
 */
export interface PointCountSessionSummary {
  /** Session ID */
  id: string;
  /** Parent micrograph ID */
  micrographId: string;
  /** Session name */
  name: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** ISO timestamp when last updated */
  updatedAt: string;
  /** Grid type */
  gridType: 'regular' | 'random' | 'stratified';
  /** Total points in session */
  totalPoints: number;
  /** Number of classified points */
  classifiedCount: number;
}

/**
 * Mineral color palette for point visualization
 * Colors match the Statistics Panel bar chart for visual consistency
 */
export const MINERAL_COLORS: Record<string, string> = {
  'quartz': '#4CAF50',        // Green
  'plagioclase': '#2196F3',   // Blue
  'k-feldspar': '#9C27B0',    // Purple
  'biotite': '#FF9800',       // Orange
  'muscovite': '#FFEB3B',     // Yellow
  'hornblende': '#795548',    // Brown
  'olivine': '#8BC34A',       // Light green
  'pyroxene': '#F44336',      // Red
  'amphibole': '#00BCD4',     // Cyan
  'garnet': '#E91E63',        // Pink
  'calcite': '#607D8B',       // Blue gray
  'dolomite': '#9E9E9E',      // Gray
  'epidote': '#CDDC39',       // Lime
  'serpentine': '#009688',    // Teal
  'tourmaline': '#3F51B5',    // Indigo
  'zircon': '#FF5722',        // Deep orange
  'unknown': '#757575',       // Dark gray
};

/**
 * Generate a deterministic color from a string (for custom minerals)
 * Uses a simple hash to ensure the same mineral always gets the same color
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate HSL color with good saturation and lightness for visibility
  // Use the hash to determine hue (0-360), keep saturation and lightness fixed
  const hue = Math.abs(hash) % 360;
  const saturation = 65; // Good saturation for visibility
  const lightness = 50;  // Medium lightness

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get color for a mineral, with fallback for unknown minerals
 * - Known minerals get their predefined color
 * - Custom/unknown minerals get a deterministic color based on their name
 */
export function getMineralColor(mineral: string): string {
  const lowerMineral = mineral.toLowerCase();

  // Check predefined colors first
  if (MINERAL_COLORS[lowerMineral]) {
    return MINERAL_COLORS[lowerMineral];
  }

  // Generate a deterministic color for custom minerals
  // (except 'unknown' which keeps its gray color)
  if (lowerMineral === 'unknown') {
    return MINERAL_COLORS['unknown'];
  }

  return stringToColor(lowerMineral);
}

/**
 * Generate a default session name with current date
 */
export function generateDefaultSessionName(): string {
  const date = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `Point Count - ${month} ${day}, ${year}`;
}

/**
 * Calculate summary statistics from points array
 */
export function calculateSessionSummary(points: PointCountPoint[]): PointCountSummary {
  const modalComposition: Record<string, number> = {};
  let classifiedCount = 0;

  for (const point of points) {
    if (point.mineral) {
      classifiedCount++;
      modalComposition[point.mineral] = (modalComposition[point.mineral] || 0) + 1;
    }
  }

  return {
    totalPoints: points.length,
    classifiedCount,
    modalComposition,
  };
}

/**
 * Create a new point count session
 */
export function createPointCountSession(
  micrographId: string,
  gridType: 'regular' | 'random' | 'stratified',
  gridSettings: PointCountGridSettings,
  points: PointCountPoint[],
  name?: string
): PointCountSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    micrographId,
    name: name || generateDefaultSessionName(),
    createdAt: now,
    updatedAt: now,
    gridType,
    gridSettings,
    points,
    summary: calculateSessionSummary(points),
  };
}

/**
 * Convert full session to lightweight summary
 */
export function sessionToSummary(session: PointCountSession): PointCountSessionSummary {
  return {
    id: session.id,
    micrographId: session.micrographId,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    gridType: session.gridType,
    totalPoints: session.summary.totalPoints,
    classifiedCount: session.summary.classifiedCount,
  };
}
