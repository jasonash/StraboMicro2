/**
 * StraboMicro Web Viewer — Project Types
 *
 * Full type definitions copied from the desktop app's project-types.ts.
 * Supports read-only display of all geological metadata, sketches,
 * StraboTools results, and analytical data.
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

  // Grain Size Analysis spot selection (project-level)
  grainAnalysisSpotFilter?: 'all' | 'selected' | null;
  grainAnalysisSelectedSpotIds?: string[] | null;
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
  igsn?: string | null;
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
}

// ============================================================================
// MICROGRAPH (IMAGE) STRUCTURE
// ============================================================================

export interface MicrographOrientation {
  orientationMethod?: string | null;
  topTrend?: number | null;
  topPlunge?: number | null;
  topReferenceCorner?: string | null;
  sideTrend?: number | null;
  sidePlunge?: number | null;
  sideReferenceCorner?: string | null;
  trendPlungeStrike?: number | null;
  trendPlungeDip?: number | null;
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

  // Image properties
  imageType?: string | null;
  width?: number | null;
  height?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  micronPerPixel?: number | null;

  // Scale
  scale?: string | null;
  scalePixelsPerCentimeter?: number | null;
  polish?: boolean | null;
  polishDescription?: string | null;
  description?: string | null;

  // Spatial registration (overlay placement)
  parentID?: string | null;
  xOffset?: number | null;
  yOffset?: number | null;
  offsetInParent?: SimpleCoord | null;
  rotation?: number | null;
  scaleX?: number | null;
  scaleY?: number | null;
  pointInParent?: SimpleCoord | null;

  // Affine transform placement
  placementType?: 'point' | 'rectangle' | 'affine' | null;
  affineMatrix?: [number, number, number, number, number, number] | null;
  controlPoints?: Array<{
    source: [number, number];
    target: [number, number];
  }> | null;
  affineBoundsOffset?: { x: number; y: number } | null;
  affineTransformedWidth?: number | null;
  affineTransformedHeight?: number | null;
  affineTileHash?: string | null;

  flipped?: boolean | null;
  isFlipped?: boolean | null;
  opacity?: number | null;
  visible?: boolean | null;
  isMicroVisible?: boolean | null;

  // Orientation
  orientationInfo?: MicrographOrientation | null;

  // Supporting data
  instrument?: InstrumentType | null;
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;

  // Annotations
  spots?: Spot[] | null;

  // Feature info types
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

  // XPL/PPL sibling pairing
  siblingImageId?: string | null;
  isPrimarySibling?: boolean | null;
  siblingScaleFactor?: number | null;

  // Sketch overlay layers
  sketchLayers?: SketchLayer[] | null;

  // StraboTools analysis results
  straboTools?: StraboToolsResult | null;

  // UI state
  isExpanded?: boolean | null;
  isSpotExpanded?: boolean | null;
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

  // Supporting data
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;

  // Feature info types
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

  // Spot generation fields
  generationMethod?: 'manual' | 'point-count' | 'grain-detection' | null;
  areaPixels?: number | null;
  centroid?: { X: number; Y: number } | null;
  appliedPresetIds?: string[] | null;
  archived?: boolean;
  tags?: string[] | null;
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
// SKETCH OVERLAY TYPES
// ============================================================================

export interface SketchStroke {
  id: string;
  points: number[];
  color: string;
  strokeWidth: number;
  opacity: number;
  tool: 'pen' | 'marker';
}

export interface SketchText {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  rotation?: number;
}

export interface SketchLayer {
  id: string;
  name: string;
  visible: boolean;
  createdAt: string;
  strokes: SketchStroke[];
  textItems: SketchText[];
}

// ============================================================================
// STRABO TOOLS ANALYSIS RESULTS
// ============================================================================

export interface StraboToolsResult {
  tool: 'edge-fabric' | 'color-index' | 'edge-detect' | 'mode';
  timestamp: string;
  sourceMicrographId?: string | null;
  azimuth?: number | null;
  axialRatio?: number | null;
  colorIndexPercentage?: number | null;
  colorIndexThreshold?: number | null;
  colorIndexMode?: 'global' | 'adaptive' | null;
  edgeDetectThreshold?: number | null;
  modeNumPhases?: number | null;
  modePhasePercentages?: number[] | null;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface AssociatedFileType {
  fileName?: string | null;
  originalPath?: string | null;
  fileType?: string | null;
  otherType?: string | null;
  notes?: string | null;
}

export interface LinkType {
  label?: string | null;
  url?: string | null;
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

// ============================================================================
// MINERALOGY TYPES
// ============================================================================

export interface MineralogyType {
  percentageCalculationMethod?: string | null;
  mineralogyMethod?: string | null;
  minerals?: MineralType[] | null;
  notes?: string | null;
}

export interface MineralType {
  name?: string | null;
  operator?: string | null;
  percentage?: number | null;
}

// ============================================================================
// GRAIN INFO TYPES
// ============================================================================

export interface GrainInfoType {
  grainSizeInfo?: GrainSizeType[] | null;
  grainShapeInfo?: GrainShapeType[] | null;
  grainOrientationInfo?: GrainOrientationType[] | null;
  grainSizeNotes?: string | null;
  grainShapeNotes?: string | null;
  grainOrientationNotes?: string | null;
}

export interface GrainSizeType {
  phases?: string[] | null;
  mean?: number | null;
  median?: number | null;
  mode?: number | null;
  standardDeviation?: number | null;
  sizeUnit?: string | null;
}

export interface GrainShapeType {
  phases?: string[] | null;
  shape?: string | null;
}

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

export interface FabricInfoType {
  fabrics?: FabricType[] | null;
  notes?: string | null;
}

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

export interface FabricCompositionType {
  compositionNotes?: string | null;
  layers?: FabricCompositionLayerType[] | null;
}

export interface FabricCompositionLayerType {
  composition?: string | null;
  thickness?: number | null;
  thicknessUnits?: string | null;
}

export interface FabricGrainSizeType {
  grainSizeNotes?: string | null;
  layers?: FabricGrainSizeLayerType[] | null;
}

export interface FabricGrainSizeLayerType {
  grainSize?: string | null;
  thickness?: number | null;
  thicknessUnits?: string | null;
}

export interface FabricGrainShapeType {
  phases?: string[] | null;
  alignment?: string | null;
  shape?: string | null;
  notes?: string | null;
}

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

export interface FractureInfoType {
  fractures?: FractureType[] | null;
  notes?: string | null;
}

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

export interface VeinInfoType {
  veins?: VeinType[] | null;
  notes?: string | null;
}

export interface VeinType {
  mineralogy?: string | null;
  crystalShapes?: VeinSubType[] | null;
  growthMorphologies?: VeinSubType[] | null;
  inclusionTrails?: VeinSubType[] | null;
  kinematics?: VeinSubType[] | null;
}

export interface VeinSubType {
  type?: string | null;
  subType?: string | null;
  numericValue?: number | null;
  unit?: string | null;
}

// ============================================================================
// FOLD INFO TYPES
// ============================================================================

export interface FoldInfoType {
  folds?: FoldType[] | null;
  notes?: string | null;
}

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

export interface FaultsShearZonesInfoType {
  faultsShearZones?: FaultsShearZonesType[] | null;
  notes?: string | null;
}

export interface FaultsShearZonesType {
  shearSenses?: Array<{ type?: string | null }> | null;
  indicators?: Array<{ type?: string | null }> | null;
  offset?: number | null;
  offsetUnit?: string | null;
  width?: number | null;
  widthUnit?: string | null;
}

// ============================================================================
// CLASTIC DEFORMATION BAND INFO TYPES
// ============================================================================

export interface ClasticDeformationBandInfoType {
  bands?: ClasticDeformationBandType[] | null;
  notes?: string | null;
}

export interface ClasticDeformationBandType {
  types?: Array<{
    type?: string | null;
    aperture?: number | null;
    apertureUnit?: string | null;
    offset?: number | null;
    offsetUnit?: string | null;
  }> | null;
  thickness?: number | null;
  thicknessUnit?: string | null;
  cements?: string | null;
}

// ============================================================================
// GRAIN BOUNDARY INFO TYPES
// ============================================================================

export interface GrainBoundaryInfoType {
  boundaries?: GrainBoundaryType[] | null;
  notes?: string | null;
}

export interface GrainBoundaryType {
  typeOfBoundary?: string | null;
  phase1?: string | null;
  phase2?: string | null;
  morphologies?: Array<{ type?: string | null }> | null;
  descriptors?: Array<{
    type?: string | null;
    subTypes?: Array<{ type?: string | null; otherType?: string | null }> | null;
  }> | null;
}

// ============================================================================
// INTRA-GRAIN INFO TYPES
// ============================================================================

export interface IntraGrainInfoType {
  grains?: IntraGrainType[] | null;
  notes?: string | null;
}

export interface IntraGrainType {
  mineral?: string | null;
  grainTextures?: Array<{
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
  }> | null;
}

// ============================================================================
// PSEUDOTACHYLYTE INFO TYPES
// ============================================================================

export interface PseudotachylyteInfoType {
  pseudotachylytes?: PseudotachylyteType[] | null;
  reasoning?: string | null;
  notes?: string | null;
}

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

export interface ExtinctionMicrostructureInfoType {
  extinctionMicrostructures?: ExtinctionMicrostructureType[] | null;
  notes?: string | null;
}

export interface ExtinctionMicrostructureType {
  phase?: string | null;
  dislocations?: Array<{ type?: string | null }> | null;
  subDislocations?: Array<{ type?: string | null }> | null;
  heterogeneousExtinctions?: Array<{ type?: string | null }> | null;
  subGrainStructures?: Array<{ type?: string | null }> | null;
  extinctionBands?: Array<{ type?: string | null }> | null;
  subWideExtinctionBands?: Array<{ type?: string | null }> | null;
  subFineExtinctionBands?: Array<{ type?: string | null }> | null;
}

// ============================================================================
// LITHOLOGY INFO TYPES
// ============================================================================

export interface LithologyInfoType {
  lithologies?: LithologyType[] | null;
  notes?: string | null;
}

export interface LithologyType {
  level1?: string | null;
  level1Other?: string | null;
  level2?: string | null;
  level2Other?: string | null;
  level3?: string | null;
  level3Other?: string | null;
}

// ============================================================================
// INSTRUMENT TYPE
// ============================================================================

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
  instrumentDetectors?: Array<{
    detectorType?: string | null;
    detectorMake?: string | null;
    detectorModel?: string | null;
  }> | null;
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
  stepSize?: number | null;
}

// ============================================================================
// POINT COUNT SESSION TYPES (loaded from separate files)
// ============================================================================

export interface PointCountSession {
  id: string;
  micrographId: string;
  name: string;
  createdAt: string;
  updatedAt?: string | null;
  gridType?: string | null;
  points?: PointCountPoint[] | null;
  summary?: PointCountSummaryData | null;
}

export interface PointCountPoint {
  index: number;
  x: number;
  y: number;
  classification?: string | null;
  mineralId?: string | null;
}

export interface PointCountSummaryData {
  totalPoints: number;
  classifiedPoints: number;
  minerals: Array<{
    name: string;
    count: number;
    percentage: number;
    color?: string | null;
  }>;
}
