/**
 * StraboMicro Web Viewer — Project Types
 *
 * Subset of the desktop app's project-types.ts, covering the data model
 * needed for read-only viewing. Copied from the desktop codebase.
 */

// ============================================================================
// ROOT PROJECT STRUCTURE
// ============================================================================

export interface ProjectMetadata {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  purposeOfStudy?: string | null;
  otherTeamMembers?: string | null;
  areaOfInterest?: string | null;
  instrumentsUsed?: string | null;
  gpsDatum?: string | null;
  magneticDeclination?: string | null;
  notes?: string | null;
  date?: string | null;
  modifiedTimestamp?: string | null;
  projectLocation?: string | null;
  datasets?: DatasetMetadata[] | null;
  groups?: GroupMetadata[] | null;
  tags?: Tag[] | null;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  date?: string | null;
  modifiedTimestamp?: string | null;
  samples?: SampleMetadata[] | null;
}

export interface SampleMetadata {
  id: string;
  name: string;
  label?: string | null;
  sampleID?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  micrographs?: MicrographMetadata[] | null;
  isExpanded?: boolean | null;
}

// ============================================================================
// MICROGRAPH (IMAGE) STRUCTURE
// ============================================================================

export interface MicrographMetadata {
  id: string;
  name: string;
  notes?: string | null;
  imageType?: string | null;
  width?: number | null;
  height?: number | null;

  // Scale
  scale?: string | null;
  scalePixelsPerCentimeter?: number | null;

  // Spatial registration (overlay placement)
  parentID?: string | null;
  offsetInParent?: SimpleCoord | null;
  rotation?: number | null;
  pointInParent?: SimpleCoord | null;
  opacity?: number | null;
  isMicroVisible?: boolean | null;

  // Instrument
  instrument?: InstrumentType | null;

  // Annotations
  spots?: Spot[] | null;

  // Tags
  tags?: string[] | null;
}

// ============================================================================
// SPOT (ANNOTATION) STRUCTURE
// ============================================================================

export interface Spot {
  id: string;
  name: string;
  notes?: string | null;
  labelColor?: string | null;
  showLabel?: boolean | null;
  color?: string | null;
  opacity?: number | null;
  date?: string | null;
  time?: string | null;
  modifiedTimestamp?: number | null;

  // Geometry
  geometry?: Geometry | null;
  geometryType?: string | null;
  points?: SimpleCoord[] | null;
}

// ============================================================================
// GEOMETRY
// ============================================================================

export type GeometryType = 'Point' | 'LineString' | 'Polygon';

export interface Geometry {
  type: GeometryType;
  coordinates: number[] | number[][] | number[][][];
}

export interface SimpleCoord {
  X?: number | null;
  Y?: number | null;
  x?: number | null;
  y?: number | null;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface InstrumentType {
  instrumentType?: string | null;
  imageType?: string | null;
  instrumentBrand?: string | null;
  instrumentModel?: string | null;
}

export interface GroupMetadata {
  id: string;
  name: string;
  spotIDs?: string[] | null;
}

export interface Tag {
  id: string;
  name: string;
}
