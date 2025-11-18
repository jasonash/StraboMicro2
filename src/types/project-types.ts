/**
 * StraboMicro Project Data Model
 *
 * TypeScript interfaces generated from project-schema.json
 * Represents the complete geological microanalysis project structure
 */

// ============================================================================
// ROOT PROJECT STRUCTURE
// ============================================================================

export interface ProjectMetadata {
  id: string;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  owner?: string;
  ownerAffiliation?: string;
  ownerEmail?: string;
  ownerORCID?: string;
  principalInvestigator?: string;
  principalInvestigatorAffiliation?: string;
  principalInvestigatorEmail?: string;
  principalInvestigatorORCID?: string;
  grantNumber?: string;
  fundingSource?: string;
  purposeOfStudy?: string;
  otherTeamMembers?: string;
  areaOfInterest?: string;
  gpsDatum?: string;
  magneticDeclination?: string;
  notes?: string;
  datasets?: DatasetMetadata[];
  groups?: GroupMetadata[];
  tags?: Tag[];
}

export interface DatasetMetadata {
  id: string;
  name: string;
  samples?: SampleMetadata[];
}

export interface SampleMetadata {
  id: string;
  name: string;
  label?: string;
  sampleID?: string;
  longitude?: number;
  latitude?: number;
  mainSamplingPurpose?: string;
  otherSamplingPurpose?: string;
  sampleDescription?: string;
  materialType?: string;
  inplacenessOfSample?: string;
  orientedSample?: string;
  sampleOrientationNotes?: string;
  sampleSize?: string;
  degreeOfWeathering?: string;
  sampleNotes?: string;
  sampleType?: string;
  color?: string;
  lithology?: string;
  sampleUnit?: string;
  otherMaterialType?: string;
  orientation?: string;
  orientationQuality?: string;
  samplingPurpose?: string;
  rockType?: string;
  fieldRelationships?: string;
  physiographicSetting?: string;
  tectSetting?: string;
  notes?: string;
  mainLithCategory?: string;
  mainRockType?: string;
  micrographs?: MicrographMetadata[];
}

// ============================================================================
// MICROGRAPH (IMAGE) STRUCTURE
// ============================================================================

export interface MicrographOrientation {
  orientationMethod: 'unoriented' | 'trendPlunge' | 'fabricReference';
  // Trend and Plunge fields
  topTrend?: number;
  topPlunge?: number;
  topReferenceCorner?: 'left' | 'right';
  sideTrend?: number;
  sidePlunge?: number;
  sideReferenceCorner?: 'top' | 'bottom';
  trendPlungeStrike?: number;
  trendPlungeDip?: number;
  // Fabric Reference fields
  fabricReference?: 'xz' | 'yz' | 'xy';
  fabricStrike?: number;
  fabricDip?: number;
  fabricTrend?: number;
  fabricPlunge?: number;
  fabricRake?: number;
  lookDirection?: 'down' | 'up';
}

export interface MicrographMetadata {
  id: string;
  name: string;
  notes?: string;

  // Image file properties
  imageFilename?: string;
  imagePath?: string;  // Full path to image file (not serialized in .smz, runtime only)
  imageWidth?: number;
  imageHeight?: number;
  micronPerPixel?: number;

  // Spatial registration (for associated/overlay images)
  parentID?: string;  // References parent micrograph for hierarchical overlay
  xOffset?: number;
  yOffset?: number;
  rotation?: number;
  flipped?: boolean;
  opacity?: number;
  visible?: boolean;

  // Orientation information
  orientationInfo?: MicrographOrientation;

  // Annotations
  spots?: Spot[];

  // Feature collections (same as Spot)
  grainInfos?: GrainInfo[];
  fabricInfos?: FabricInfo[];
  boundaryInfos?: BoundaryInfo[];
  mineralogies?: Mineralogy[];
  veinInfos?: VeinInfo[];
  fractureInfos?: FractureInfo[];
  foldInfos?: FoldInfo[];
  porosity?: Porosity[];
  pseudotachylytes?: Pseudotachylyte[];
  otherFeatures?: OtherFeature[];
}

// ============================================================================
// SPOT (ANNOTATION) STRUCTURE
// ============================================================================

export interface Spot {
  id: string;
  name: string;
  notes?: string;
  geometry?: Geometry;

  // Geological feature collections
  grainInfos?: GrainInfo[];
  fabricInfos?: FabricInfo[];
  boundaryInfos?: BoundaryInfo[];
  mineralogies?: Mineralogy[];
  veinInfos?: VeinInfo[];
  fractureInfos?: FractureInfo[];
  foldInfos?: FoldInfo[];
  porosity?: Porosity[];
  pseudotachylytes?: Pseudotachylyte[];
  otherFeatures?: OtherFeature[];
}

// ============================================================================
// GEOMETRY (GeoJSON-like)
// ============================================================================

export type GeometryType = 'Point' | 'LineString' | 'Polygon';

export interface Geometry {
  type: GeometryType;
  coordinates: number[] | number[][] | number[][][];
}

export interface PointGeometry extends Geometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface LineStringGeometry extends Geometry {
  type: 'LineString';
  coordinates: Array<[number, number]>;
}

export interface PolygonGeometry extends Geometry {
  type: 'Polygon';
  coordinates: Array<Array<[number, number]>>;
}

// ============================================================================
// ORGANIZATION STRUCTURES
// ============================================================================

export interface GroupMetadata {
  id: string;
  name: string;
  spotIDs?: string[];
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  spotIDs?: string[];
}

// ============================================================================
// GEOLOGICAL FEATURE TYPES
// ============================================================================

export interface GrainInfo {
  grainSize?: string;
  grainSizeRange?: string;
  shapePreferredOrientation?: string;
  aspectRatio?: string;
  aspectRatioRange?: string;
  boundaryShape?: string;
  contacts?: string;
  surfaceTexture?: string;
  grainBoundaries?: GrainBoundary[];
  geochronologies?: Geochronology[];
  chemistries?: Chemistry[];
}

export interface FabricInfo {
  fabricType?: string;
  fabricOrientation?: number;
  penetrativeness?: string;
  clastSize?: string;
  sharingAngle?: number;
  symmetry?: string;
  metamorphicGrade?: string;
  metamorphicTexture?: string;
  protolithLithology?: string;
}

export interface BoundaryInfo {
  boundaryType?: string;
  boundaryShape?: string;
  boundaryCharacter?: string;
  boundaryDefinition?: string;
}

export interface Mineralogy {
  mineral?: string;
  abundance?: number;
  habit?: string;
  color?: string;
  pleochroism?: string;
  interference?: string;
  relief?: string;
  cleavage?: string;
  twinning?: string;
  zoning?: string;
  alteration?: string;
  opticSign?: string;
  extinctionAngle?: number;
  chemistries?: Chemistry[];
}

export interface VeinInfo {
  veinType?: string;
  veinOrientation?: number;
  thickness?: number;
  fillMineralogy?: string;
  wallRockAlteration?: string;
}

export interface FractureInfo {
  fractureType?: string;
  fractureOrientation?: number;
  aperture?: number;
  fill?: string;
  termination?: string;
}

export interface FoldInfo {
  foldType?: string;
  axialOrientation?: number;
  limbOrientation?: number;
  interlimbAngle?: number;
  wavelength?: number;
  amplitude?: number;
}

export interface Porosity {
  porosityType?: string;
  porosityPercent?: number;
  poreSize?: number;
  poreShape?: string;
  connectivity?: string;
}

export interface Pseudotachylyte {
  veinType?: string;
  veinThickness?: number;
  veinOrientation?: number;
  matrixColor?: string;
  matrixTexture?: string;
  clastComposition?: string;
  clastSize?: string;
  clastShape?: string;
  clastDistribution?: string;
  injectionVeins?: boolean;
  wallRockAlteration?: string;
  crosscuttingRelationships?: string;
}

export interface OtherFeature {
  featureType?: string;
  description?: string;
  properties?: Record<string, unknown>;
}

// ============================================================================
// ANALYTICAL DATA STRUCTURES
// ============================================================================

export interface GrainBoundary {
  boundaryType?: string;
  misorientation?: number;
  segmentation?: string;
}

export interface Geochronology {
  method?: string;
  age?: number;
  uncertainty?: number;
  material?: string;
  lab?: string;
  analyst?: string;
  date?: string;
  reference?: string;
}

export interface Chemistry {
  instrument?: Instrument;
  elements?: Record<string, number>;
  oxides?: Record<string, number>;
  total?: number;
  analyst?: string;
  analysisDate?: string;
}

export type InstrumentType =
  | 'SEM'
  | 'TEM'
  | 'EPMA'
  | 'SIMS'
  | 'LA-ICP-MS'
  | 'XRF'
  | 'Raman'
  | 'FTIR'
  | 'Optical';

export interface Instrument {
  instrumentType?: InstrumentType;
  instrumentModel?: string;
  acceleratingVoltage?: number;
  beamCurrent?: number;
  spotSize?: number;
  workingDistance?: number;
  detector?: string;
  magnification?: number;
  countTime?: number;
  beamDiameter?: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Type guard to check if geometry is a Point
 */
export function isPointGeometry(geometry: Geometry): geometry is PointGeometry {
  return geometry.type === 'Point';
}

/**
 * Type guard to check if geometry is a LineString
 */
export function isLineStringGeometry(geometry: Geometry): geometry is LineStringGeometry {
  return geometry.type === 'LineString';
}

/**
 * Type guard to check if geometry is a Polygon
 */
export function isPolygonGeometry(geometry: Geometry): geometry is PolygonGeometry {
  return geometry.type === 'Polygon';
}

/**
 * Helper type for feature collections
 */
export interface FeatureCollections {
  grainInfos?: GrainInfo[];
  fabricInfos?: FabricInfo[];
  boundaryInfos?: BoundaryInfo[];
  mineralogies?: Mineralogy[];
  veinInfos?: VeinInfo[];
  fractureInfos?: FractureInfo[];
  foldInfos?: FoldInfo[];
  porosity?: Porosity[];
  pseudotachylytes?: Pseudotachylyte[];
  otherFeatures?: OtherFeature[];
}

/**
 * Union type of all geological feature types
 */
export type GeologicalFeature =
  | GrainInfo
  | FabricInfo
  | BoundaryInfo
  | Mineralogy
  | VeinInfo
  | FractureInfo
  | FoldInfo
  | Porosity
  | Pseudotachylyte
  | OtherFeature;

/**
 * Type for feature type names
 */
export type FeatureTypeName =
  | 'grainInfos'
  | 'fabricInfos'
  | 'boundaryInfos'
  | 'mineralogies'
  | 'veinInfos'
  | 'fractureInfos'
  | 'foldInfos'
  | 'porosity'
  | 'pseudotachylytes'
  | 'otherFeatures';
