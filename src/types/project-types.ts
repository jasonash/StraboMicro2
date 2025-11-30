/**
 * StraboMicro Project Data Model
 *
 * TypeScript interfaces for StraboMicro2 project structure
 * Merged from modern project-schema.json and legacy JavaFX format
 *
 * This file maintains backward compatibility with legacy .smz files while
 * supporting modern improvements. Most fields are optional with null safety
 * to handle legacy data gracefully.
 *
 * Last updated: 2025-11-22
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
  owner?: string | null;
  ownerAffiliation?: string | null;
  ownerEmail?: string | null;
  ownerORCID?: string | null;
  principalInvestigator?: string | null;
  principalInvestigatorAffiliation?: string | null;
  principalInvestigatorEmail?: string | null;
  principalInvestigatorORCID?: string | null;
  grantNumber?: string | null;
  fundingSource?: string | null;
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
  existsOnServer?: boolean | null;
  label?: string | null;
  sampleID?: string | null;
  igsn?: string | null;  // International Geo Sample Number
  longitude?: number | null;
  latitude?: number | null;
  mainSamplingPurpose?: string | null;
  otherSamplingPurpose?: string | null;
  sampleDescription?: string | null;
  materialType?: string | null;
  inplacenessOfSample?: string | null;
  orientedSample?: string | null;
  sampleOrientationNotes?: string | null;
  sampleSize?: string | null;
  degreeOfWeathering?: string | null;
  sampleNotes?: string | null;
  sampleType?: string | null;
  color?: string | null;
  lithology?: string | null;
  sampleUnit?: string | null;
  otherMaterialType?: string | null;
  orientation?: string | null;
  orientationQuality?: string | null;
  samplingPurpose?: string | null;
  rockType?: string | null;
  fieldRelationships?: string | null;
  physiographicSetting?: string | null;
  tectSetting?: string | null;
  notes?: string | null;
  mainLithCategory?: string | null;
  mainRockType?: string | null;
  micrographs?: MicrographMetadata[] | null;
  isExpanded?: boolean | null;
  isSpotExpanded?: boolean | null;
}

// ============================================================================
// MICROGRAPH (IMAGE) STRUCTURE
// ============================================================================

/**
 * Micrograph orientation information
 * Supports multiple orientation methods: unoriented, trend/plunge, and fabric reference
 */
export interface MicrographOrientation {
  orientationMethod?: string | null;
  // Trend and Plunge fields
  topTrend?: number | null;
  topPlunge?: number | null;
  topReferenceCorner?: string | null;
  sideTrend?: number | null;
  sidePlunge?: number | null;
  sideReferenceCorner?: string | null;
  trendPlungeStrike?: number | null;
  trendPlungeDip?: number | null;
  // Fabric Reference fields
  fabricReference?: string | null;
  fabricStrike?: number | null;
  fabricDip?: number | null;
  fabricTrend?: number | null;
  fabricPlunge?: number | null;
  fabricRake?: number | null;
  lookDirection?: string | null;
  topCorner?: string | null;
}

export interface MicrographMetadata {
  id: string;
  name: string;
  notes?: string | null;

  // Image file properties
  imageFilename?: string | null;
  imagePath?: string | null;  // RUNTIME-ONLY: Full path to image file (NOT serialized to project.json)
  imageType?: string | null;
  imageWidth?: number | null;  // RUNTIME-ONLY: Convenience field (NOT serialized, use width instead)
  imageHeight?: number | null;  // RUNTIME-ONLY: Convenience field (NOT serialized, use height instead)
  width?: number | null;  // LEGACY: Image width in pixels (serialized to project.json)
  height?: number | null;  // LEGACY: Image height in pixels (serialized to project.json)
  micronPerPixel?: number | null;

  // Scale information
  scale?: string | null;
  scalePixelsPerCentimeter?: number | null;  // Primary scale measurement
  polish?: boolean | null;
  polishDescription?: string | null;
  description?: string | null;

  // Spatial registration (for associated/overlay images)
  parentID?: string | null;  // References parent micrograph for hierarchical overlay
  xOffset?: number | null;
  yOffset?: number | null;
  offsetInParent?: SimpleCoord | null;  // Top-left corner in original parent coordinates (rectangle placement)
  rotation?: number | null;
  scaleX?: number | null;  // Scale factor in X direction
  scaleY?: number | null;  // Scale factor in Y direction
  pointInParent?: SimpleCoord | null;  // For point-based placement
  flipped?: boolean | null;
  isFlipped?: boolean | null;
  opacity?: number | null;
  visible?: boolean | null;
  isMicroVisible?: boolean | null;

  // Orientation information
  orientationInfo?: MicrographOrientation | null;

  // Supporting data
  instrument?: InstrumentType | null;
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;

  // Annotations
  spots?: Spot[] | null;

  // Feature info types (use Info object pattern - singular, not plural)
  mineralogy?: MineralogyType | null;
  grainInfo?: GrainInfoType | null;
  fabricInfo?: FabricInfoType | null;
  fractureInfo?: FractureInfoType | null;
  foldInfo?: FoldInfoType | null;
  veinInfo?: VeinInfoType | null;
  clasticDeformationBandInfo?: ClasticDeformationBandInfoType | null;
  grainBoundaryInfo?: GrainBoundaryInfoType | null;
  intraGrainInfo?: IntraGrainInfoType | null;
  pseudotachylyteInfo?: PseudotachylyteInfoType | null;
  faultsShearZonesInfo?: FaultsShearZonesInfoType | null;
  extinctionMicrostructureInfo?: ExtinctionMicrostructureInfoType | null;
  lithologyInfo?: LithologyInfoType | null;

  // UI state (not serialized, runtime only)
  isExpanded?: boolean | null;
  isSpotExpanded?: boolean | null;
  tags?: string[] | null;
}

// ============================================================================
// SPOT (ANNOTATION) STRUCTURE
// ============================================================================

/**
 * Spot metadata
 * Annotated region on a micrograph with geometry and feature info
 */
export interface Spot {
  id: string;
  name: string;
  notes?: string | null;
  labelColor?: string | null;
  showLabel?: boolean | null;
  color?: string | null;
  opacity?: number | null; // 0-100%, applied to fill only
  date?: string | null;
  time?: string | null;
  modifiedTimestamp?: number | null;

  // Geometry (modern GeoJSON-style or legacy points array)
  geometry?: Geometry | null;
  geometryType?: string | null;
  points?: SimpleCoord[] | null;

  // Supporting data
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;
  images?: ImageType[] | null;

  // Feature info types (use Info object pattern - singular, not plural)
  mineralogy?: MineralogyType | null;
  grainInfo?: GrainInfoType | null;
  fabricInfo?: FabricInfoType | null;
  fractureInfo?: FractureInfoType | null;
  foldInfo?: FoldInfoType | null;
  veinInfo?: VeinInfoType | null;
  clasticDeformationBandInfo?: ClasticDeformationBandInfoType | null;
  grainBoundaryInfo?: GrainBoundaryInfoType | null;
  intraGrainInfo?: IntraGrainInfoType | null;
  pseudotachylyteInfo?: PseudotachylyteInfoType | null;
  faultsShearZonesInfo?: FaultsShearZonesInfoType | null;
  extinctionMicrostructureInfo?: ExtinctionMicrostructureInfoType | null;
  lithologyInfo?: LithologyInfoType | null;

  // UI state
  tags?: string[] | null;
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
  spotIDs?: string[] | null;
  micrographs?: string[] | null;
  isExpanded?: boolean | null;
}

export interface Tag {
  id: string;
  name: string;
  tagType?: string | null;
  tagSubtype?: string | null;
  otherConcept?: string | null;
  otherDocumentation?: string | null;
  otherTagType?: string | null;
  color?: string | null;
  lineColor?: string | null;
  fillColor?: string | null;
  transparency?: number | null;
  tagSize?: number | null;
  notes?: string | null;
  spotIDs?: string[] | null;
  // UI state (runtime only - not serialized)
  isExpanded?: boolean | null;
}

// ============================================================================
// SUPPORTING TYPES (Simple Data Structures)
// ============================================================================

/**
 * Simple 2D coordinate
 * Used for offsetInParent and pointInParent
 */
export interface SimpleCoord {
  X?: number | null;
  Y?: number | null;
  x?: number | null;  // Lowercase variant for compatibility
  y?: number | null;
}

/**
 * Associated file metadata
 */
export interface AssociatedFileType {
  fileName?: string | null;
  originalPath?: string | null;
  fileType?: string | null;
  otherType?: string | null;
  notes?: string | null;
}

/**
 * URL link metadata
 */
export interface LinkType {
  label?: string | null;
  url?: string | null;
}

/**
 * Image metadata
 */
export interface ImageType {
  fileName?: string | null;
  filePath?: string | null;
  imageType?: string | null;
  notes?: string | null;
}

// ============================================================================
// MINERALOGY TYPES
// ============================================================================

/**
 * Mineralogy container
 * Contains array of minerals with percentages
 */
export interface MineralogyType {
  percentageCalculationMethod?: string | null;
  mineralogyMethod?: string | null;
  minerals?: MineralType[] | null;
  notes?: string | null;
}

/**
 * Individual mineral entry
 */
export interface MineralType {
  name?: string | null;
  operator?: string | null;
  percentage?: number | null;
}

// ============================================================================
// GRAIN INFO TYPES
// ============================================================================

/**
 * Grain information container
 * Contains arrays for size, shape, and orientation data
 */
export interface GrainInfoType {
  grainSizeInfo?: GrainSizeType[] | null;
  grainShapeInfo?: GrainShapeType[] | null;
  grainOrientationInfo?: GrainOrientationType[] | null;
  grainSizeNotes?: string | null;
  grainShapeNotes?: string | null;
  grainOrientationNotes?: string | null;
}

/**
 * Grain size statistics
 */
export interface GrainSizeType {
  phases?: string[] | null;
  mean?: number | null;
  median?: number | null;
  mode?: number | null;
  standardDeviation?: number | null;
  sizeUnit?: string | null;
}

/**
 * Grain shape descriptor
 */
export interface GrainShapeType {
  phases?: string[] | null;
  shape?: string | null;
}

/**
 * Grain orientation data
 */
export interface GrainOrientationType {
  phases?: string[] | null;
  meanOrientation?: number | null;
  relativeTo?: string | null;
  software?: string | null;
  spoTechnique?: string | null;
  spoOther?: string | null;
}

// ============================================================================
// FABRIC INFO TYPES
// ============================================================================

/**
 * Fabric information container
 * Contains array of fabric descriptions
 */
export interface FabricInfoType {
  fabrics?: FabricType[] | null;
  notes?: string | null;
}

/**
 * Individual fabric description
 * Contains nested sub-types for composition, grain size, shape, and cleavage
 */
export interface FabricType {
  fabricLabel?: string | null;
  fabricElement?: string | null;
  fabricCategory?: string | null;
  fabricSpacing?: string | null;
  fabricDefinedBy?: string[] | null;
  fabricCompositionInfo?: FabricCompositionType | null;
  fabricGrainSizeInfo?: FabricGrainSizeType | null;
  fabricGrainShapeInfo?: FabricGrainShapeType | null;
  fabricCleavageInfo?: FabricCleavageType | null;
}

/**
 * Fabric composition information
 */
export interface FabricCompositionType {
  compositionNotes?: string | null;
  layers?: FabricCompositionLayerType[] | null;
}

/**
 * Individual fabric composition layer
 */
export interface FabricCompositionLayerType {
  composition?: string | null;
  thickness?: number | null;
  thicknessUnits?: string | null;
}

/**
 * Fabric grain size information
 */
export interface FabricGrainSizeType {
  grainSizeNotes?: string | null;
  layers?: FabricGrainSizeLayerType[] | null;
}

/**
 * Individual fabric grain size layer
 */
export interface FabricGrainSizeLayerType {
  grainSize?: string | null;
  thickness?: number | null;
  thicknessUnits?: string | null;
}

/**
 * Fabric grain shape information
 */
export interface FabricGrainShapeType {
  phases?: string[] | null;
  alignment?: string | null;
  shape?: string | null;
  notes?: string | null;
}

/**
 * Fabric cleavage information
 */
export interface FabricCleavageType {
  spacing?: number | null;
  spacingUnit?: string | null;
  styloliticCleavage?: boolean | null;
  geometryOfSeams?: string[] | null;
  notes?: string | null;
}

// ============================================================================
// FRACTURE INFO TYPES
// ============================================================================

/**
 * Fracture information container
 */
export interface FractureInfoType {
  fractures?: FractureType[] | null;
  notes?: string | null;
}

/**
 * Individual fracture description
 */
export interface FractureType {
  granularity?: string | null;
  mineralogy?: string | null;
  kinematicType?: string | null;
  openingAperture?: number | null;
  openingApertureUnit?: string | null;
  shearOffset?: number | null;
  shearOffsetUnit?: string | null;
  hybridAperture?: number | null;
  hybridApertureUnit?: string | null;
  hybridOffset?: number | null;
  hybridOffsetUnit?: string | null;
  sealedHealed?: boolean | null;
}

// ============================================================================
// VEIN INFO TYPES
// ============================================================================

/**
 * Vein information container
 */
export interface VeinInfoType {
  veins?: VeinType[] | null;
  notes?: string | null;
}

/**
 * Individual vein description
 * Contains arrays of sub-types for different vein characteristics
 */
export interface VeinType {
  mineralogy?: string | null;
  crystalShapes?: VeinSubType[] | null;
  growthMorphologies?: VeinSubType[] | null;
  inclusionTrails?: VeinSubType[] | null;
  kinematics?: VeinSubType[] | null;
}

/**
 * Vein sub-type for crystal shapes, growth morphologies, inclusion trails, and kinematics
 */
export interface VeinSubType {
  type?: string | null;
  subType?: string | null;
  numericValue?: number | null;
  unit?: string | null;
}

// ============================================================================
// FOLD INFO TYPES
// ============================================================================

/**
 * Fold information container
 */
export interface FoldInfoType {
  folds?: FoldType[] | null;
  notes?: string | null;
}

/**
 * Individual fold description
 */
export interface FoldType {
  label?: string | null;
  interLimbAngle?: string[] | null;
  interLimbAngleOther?: string | null;
  closure?: string | null;
  closureOther?: string | null;
  orientationAxialTrace?: string | null;
  symmetry?: string | null;
  vergence?: string | null;
  wavelength?: number | null;
  wavelengthUnit?: string | null;
  amplitude?: number | null;
  amplitudeUnit?: string | null;
  foldStyle?: string | null;
  foldStyleOther?: string | null;
  foldContinuity?: string | null;
  foldContinuityOther?: string | null;
  facing?: string | null;
  facingOther?: string | null;
}

// ============================================================================
// FAULTS/SHEAR ZONES INFO TYPES
// ============================================================================

/**
 * Faults and shear zones information container
 */
export interface FaultsShearZonesInfoType {
  faultsShearZones?: FaultsShearZonesType[] | null;
  notes?: string | null;
}

/**
 * Individual fault/shear zone description
 */
export interface FaultsShearZonesType {
  shearSenses?: FaultsShearZonesShearSenseType[] | null;
  indicators?: FaultsShearZonesIndicatorsType[] | null;
  offset?: number | null;
  offsetUnit?: string | null;
  width?: number | null;
  widthUnit?: string | null;
}

/**
 * Shear sense sub-type
 */
export interface FaultsShearZonesShearSenseType {
  type?: string | null;
}

/**
 * Shear indicators sub-type
 */
export interface FaultsShearZonesIndicatorsType {
  type?: string | null;
}

// ============================================================================
// CLASTIC DEFORMATION BAND INFO TYPES
// ============================================================================

/**
 * Clastic deformation band information container
 */
export interface ClasticDeformationBandInfoType {
  bands?: ClasticDeformationBandType[] | null;
  notes?: string | null;
}

/**
 * Individual deformation band description
 */
export interface ClasticDeformationBandType {
  types?: ClasticDeformationBandTypeType[] | null;
  thickness?: number | null;
  thicknessUnit?: string | null;
  cements?: string | null;
}

/**
 * Deformation band type sub-type
 */
export interface ClasticDeformationBandTypeType {
  type?: string | null;
  aperture?: number | null;
  apertureUnit?: string | null;
  offset?: number | null;
  offsetUnit?: string | null;
}

// ============================================================================
// GRAIN BOUNDARY INFO TYPES
// ============================================================================

/**
 * Grain boundary information container
 */
export interface GrainBoundaryInfoType {
  boundaries?: GrainBoundaryType[] | null;
  notes?: string | null;
}

/**
 * Individual grain boundary description
 */
export interface GrainBoundaryType {
  typeOfBoundary?: string | null;
  phase1?: string | null;
  phase2?: string | null;
  morphologies?: GrainBoundaryMorphologyType[] | null;
  descriptors?: GrainBoundaryDescriptorType[] | null;
}

/**
 * Grain boundary morphology sub-type
 */
export interface GrainBoundaryMorphologyType {
  type?: string | null;
}

/**
 * Grain boundary descriptor
 */
export interface GrainBoundaryDescriptorType {
  type?: string | null;
  subTypes?: GrainBoundaryDescriptorSubType[] | null;
}

/**
 * Grain boundary descriptor sub-type
 */
export interface GrainBoundaryDescriptorSubType {
  type?: string | null;
  otherType?: string | null;
}

// ============================================================================
// INTRA-GRAIN INFO TYPES
// ============================================================================

/**
 * Intra-grain information container
 */
export interface IntraGrainInfoType {
  grains?: IntraGrainType[] | null;
  notes?: string | null;
}

/**
 * Individual intra-grain description
 */
export interface IntraGrainType {
  mineral?: string | null;
  grainTextures?: IntraGrainTexturalFeatureType[] | null;
}

/**
 * Intra-grain textural feature
 */
export interface IntraGrainTexturalFeatureType {
  type?: string | null;
  otherType?: string | null;
  openingAperture?: number | null;
  openingApertureUnit?: string | null;
  shearOffset?: number | null;
  shearOffsetUnit?: string | null;
  hybridAperture?: number | null;
  hybridApertureUnit?: string | null;
  hybridOffset?: number | null;
  hybridOffsetUnit?: string | null;
  sealedHealed?: boolean | null;
}

// ============================================================================
// PSEUDOTACHYLYTE INFO TYPES
// ============================================================================

/**
 * Pseudotachylyte information container
 */
export interface PseudotachylyteInfoType {
  pseudotachylytes?: PseudotachylyteType[] | null;
  reasoning?: string | null;
  notes?: string | null;
}

/**
 * Individual pseudotachylyte description
 * Extremely detailed type with 40+ fields
 */
export interface PseudotachylyteType {
  label?: string | null;
  hasMatrixGroundmass?: boolean | null;
  matrixGroundmassColor?: string | null;
  matrixGroundmassConstraintsOnComposition?: boolean | null;
  matrixGroundmassConstraintsOnCompositionDetails?: string | null;
  hasCrystallites?: boolean | null;
  crystallitesMineralogy?: string | null;
  crystallitesShapes?: string[] | null;
  otherShape?: string | null;
  crystallitesLowerSize?: number | null;
  crystallitesLowerSizeUnit?: string | null;
  crystallitesUpperSize?: number | null;
  crystallitesUpperSizeUnit?: string | null;
  crystallitesZoning?: boolean | null;
  crystallitesZoningDetails?: string | null;
  crystallitesDistribution?: string | null;
  hasSurvivorClasts?: boolean | null;
  survivorClastsMineralogy?: string | null;
  survivorClastsMarginDescription?: string | null;
  survivorClastsDistribution?: string | null;
  hasSulphideOxide?: boolean | null;
  sulphideOxideMineralogy?: string | null;
  sulphideOxideLowerSize?: number | null;
  sulphideOxideLowerSizeUnit?: string | null;
  sulphideOxideUpperSize?: number | null;
  sulphideOxideUpperSizeUnit?: string | null;
  sulphideOxideDistribution?: string | null;
  hasFabric?: boolean | null;
  fabricDescription?: string | null;
  hasInjectionFeatures?: boolean | null;
  injectionFeaturesAperture?: number | null;
  injectionFeaturesApertureUnit?: string | null;
  injectionFeaturesLength?: number | null;
  injectionFeaturesLengthUnit?: string | null;
  hasChilledMargins?: boolean | null;
  chilledMarginsDescription?: string | null;
  hasVesciclesAmygdules?: boolean | null;
  vesciclesAmygdulesMineralogy?: string | null;
  vesciclesAmygdulesLowerSize?: number | null;
  vesciclesAmygdulesLowerSizeUnit?: string | null;
  vesciclesAmygdulesUpperSize?: number | null;
  vesciclesAmygdulesUpperSizeUnit?: string | null;
  vesciclesAmygdulesDistribution?: string | null;
}

// ============================================================================
// EXTINCTION MICROSTRUCTURE INFO TYPES
// ============================================================================

/**
 * Extinction microstructure information container
 */
export interface ExtinctionMicrostructureInfoType {
  extinctionMicrostructures?: ExtinctionMicrostructureType[] | null;
  notes?: string | null;
}

/**
 * Individual extinction microstructure description
 */
export interface ExtinctionMicrostructureType {
  phase?: string | null;
  dislocations?: ExtinctionDislocationType[] | null;
  subDislocations?: ExtinctionDislocationSubType[] | null;
  heterogeneousExtinctions?: ExtinctionHeteroType[] | null;
  subGrainStructures?: ExtinctionSubgrainType[] | null;
  extinctionBands?: ExtinctionBandsType[] | null;
  subWideExtinctionBands?: ExtinctionWideBandsType[] | null;
  subFineExtinctionBands?: ExtinctionFineBandsType[] | null;
}

/**
 * Extinction dislocation type
 */
export interface ExtinctionDislocationType {
  type?: string | null;
}

/**
 * Extinction dislocation sub-type
 */
export interface ExtinctionDislocationSubType {
  type?: string | null;
}

/**
 * Heterogeneous extinction type
 */
export interface ExtinctionHeteroType {
  type?: string | null;
}

/**
 * Sub-grain structure type
 */
export interface ExtinctionSubgrainType {
  type?: string | null;
}

/**
 * Extinction bands type
 */
export interface ExtinctionBandsType {
  type?: string | null;
}

/**
 * Wide extinction bands sub-type
 */
export interface ExtinctionWideBandsType {
  type?: string | null;
}

/**
 * Fine extinction bands sub-type
 */
export interface ExtinctionFineBandsType {
  type?: string | null;
}

// ============================================================================
// LITHOLOGY INFO TYPES
// ============================================================================

/**
 * Lithology information container
 */
export interface LithologyInfoType {
  lithologies?: LithologyType[] | null;
  notes?: string | null;
}

/**
 * Individual lithology classification
 * Three-level hierarchical classification system
 */
export interface LithologyType {
  level1?: string | null;
  level1Other?: string | null;
  level2?: string | null;
  level2Other?: string | null;
  level3?: string | null;
  level3Other?: string | null;
}

// ============================================================================
// INSTRUMENT TYPE (65 fields!)
// ============================================================================

/**
 * Instrument metadata
 * Comprehensive analytical instrument parameters
 * Used for SEM, TEM, EBSD, optical microscopy, etc.
 */
export interface InstrumentType {
  instrumentType?: string | null;
  otherInstrumentType?: string | null;
  dataType?: string | null;
  otherDataType?: string | null;
  instrumentBrand?: string | null;
  instrumentModel?: string | null;
  university?: string | null;
  laboratory?: string | null;
  dataCollectionSoftware?: string | null;
  dataCollectionSoftwareVersion?: string | null;
  postProcessingSoftware?: string | null;
  postProcessingSoftwareVersion?: string | null;
  filamentType?: string | null;
  instrumentDetectors?: InstrumentDetectorType[] | null;
  instrumentNotes?: string | null;
  accelerationVoltage?: number | null;
  beamCurrent?: number | null;
  spotSize?: number | null;
  aperture?: number | null;
  cameraLength?: number | null;
  cameraBinning?: string | null;
  analysisDwellTime?: number | null;
  dwellTime?: number | null;
  workingDistance?: number | null;
  instrumentPurged?: boolean | null;
  instrumentPurgedGasType?: string | null;
  environmentPurged?: boolean | null;
  environmentPurgedGasType?: string | null;
  scanTime?: number | null;
  resolution?: number | null;
  spectralResolution?: number | null;
  wavenumberRange?: string | null;
  averaging?: string | null;
  backgroundComposition?: string | null;
  backgroundCorrectionFrequencyAndNotes?: string | null;
  excitationWavelength?: number | null;
  laserPower?: number | null;
  diffractionGrating?: number | null;
  integrationTime?: number | null;
  objective?: number | null;
  calibration?: string | null;
  notesOnPostProcessing?: string | null;
  atomicMode?: string | null;
  cantileverStiffness?: number | null;
  tipDiameter?: number | null;
  operatingFrequency?: number | null;
  scanDimensions?: string | null;
  scanArea?: string | null;
  spatialResolution?: number | null;
  temperatureOfRoom?: number | null;
  relativeHumidity?: number | null;
  sampleTemperature?: number | null;
  stepSize?: number | null;
  backgroundDwellTime?: number | null;
  standards?: InstrumentWDSStandardsType[] | null;
  backgroundCorrectionTechnique?: string | null;
  deadTime?: number | null;
  calibrationStandardNotes?: string | null;
  notesOnCrystalStructuresUsed?: string | null;
  color?: string | null;
  rgbCheck?: string | null;
  energyLoss?: string | null;
}

/**
 * Instrument detector metadata
 */
export interface InstrumentDetectorType {
  detectorType?: string | null;
  detectorMake?: string | null;
  detectorModel?: string | null;
}

/**
 * WDS standards metadata
 */
export interface InstrumentWDSStandardsType {
  element?: string | null;
  crystalType?: string | null;
  standardName?: string | null;
}

// ============================================================================
// UTILITY TYPES AND TYPE GUARDS
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
 * Union type of all feature Info container types
 */
export type FeatureInfoType =
  | MineralogyType
  | GrainInfoType
  | FabricInfoType
  | FractureInfoType
  | FoldInfoType
  | VeinInfoType
  | ClasticDeformationBandInfoType
  | GrainBoundaryInfoType
  | IntraGrainInfoType
  | PseudotachylyteInfoType
  | FaultsShearZonesInfoType
  | ExtinctionMicrostructureInfoType
  | LithologyInfoType;

/**
 * Type for feature type names (using modern singular Info pattern)
 */
export type FeatureTypeName =
  | 'mineralogy'
  | 'grainInfo'
  | 'fabricInfo'
  | 'fractureInfo'
  | 'foldInfo'
  | 'veinInfo'
  | 'clasticDeformationBandInfo'
  | 'grainBoundaryInfo'
  | 'intraGrainInfo'
  | 'pseudotachylyteInfo'
  | 'faultsShearZonesInfo'
  | 'extinctionMicrostructureInfo'
  | 'lithologyInfo';

// ============================================================================
// COMPATIBILITY ALIASES
// ============================================================================

/**
 * Type aliases for backward compatibility with existing code
 * These allow both modern and legacy naming conventions
 */

// Main entity type aliases (adding 'Type' suffix for consistency with legacy)
export type { ProjectMetadata as ProjectMetadataType };
export type { DatasetMetadata as DatasetMetadataType };
export type { SampleMetadata as SampleMetadataType };
export type { MicrographMetadata as MicrographMetadataType };
export type { Spot as SpotMetadataType };
export type { GroupMetadata as GroupMetadataType };
export type { Tag as TagType };

// Geometry type aliases
// Note: GeometryType is already defined as a string union type above
// export type { Geometry as GeometryType }; // Commented to avoid conflict
export type { SimpleCoord as SimpleCoordType };

// Orientation alias
export type { MicrographOrientation as MicrographOrientationType };
