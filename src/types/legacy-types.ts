/**
 * Legacy Type Definitions for StraboMicro2
 *
 * This file contains TypeScript interfaces generated from the complete legacy JSON schema.
 * These types represent the JavaFX StraboMicro project.json format and are used for
 * backward compatibility when reading legacy .smz project files.
 *
 * IMPORTANT: This is auto-generated from complete-legacy-schema.json
 * Field names match EXACTLY (case-sensitive) with the legacy format.
 * DO NOT modify field names without updating the schema.
 *
 * Total interfaces: 63+
 * Source: /Users/jason/Desktop/StraboMicro2/docs/complete-legacy-schema.json
 * Generated: 2025-11-22
 */

// ============================================================================
// CORE METADATA TYPES
// ============================================================================

/**
 * Top-level project metadata
 * Contains datasets, groups, and tags
 */
export interface ProjectMetadataType {
  id?: string | null;
  name?: string | null;
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
  datasets?: DatasetMetadataType[] | null;
  groups?: GroupMetadataType[] | null;
  tags?: TagType[] | null;
}

/**
 * Dataset metadata
 * Contains samples
 */
export interface DatasetMetadataType {
  id?: string | null;
  name?: string | null;
  date?: string | null;
  modifiedTimestamp?: string | null;
  samples?: SampleMetadataType[] | null;
}

/**
 * Sample metadata
 * Contains micrographs and geological sample information
 */
export interface SampleMetadataType {
  id?: string | null;
  existsOnServer?: boolean | null;
  label?: string | null;
  sampleID?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  mainSamplingPurpose?: string | null;
  sampleDescription?: string | null;
  materialType?: string | null;
  inplacenessOfSample?: string | null;
  orientedSample?: string | null;
  sampleSize?: string | null;
  degreeOfWeathering?: string | null;
  sampleNotes?: string | null;
  sampleType?: string | null;
  color?: string | null;
  lithology?: string | null;
  sampleUnit?: string | null;
  otherMaterialType?: string | null;
  sampleOrientationNotes?: string | null;
  otherSamplingPurpose?: string | null;
  micrographs?: MicrographMetadataType[] | null;
  isExpanded?: boolean | null;
  isSpotExpanded?: boolean | null;
}

/**
 * Micrograph metadata
 * Core image entity containing spots and all feature info types
 */
export interface MicrographMetadataType {
  id?: string | null;
  parentID?: string | null;
  name?: string | null;
  imageType?: string | null;
  width?: number | null;
  height?: number | null;
  opacity?: number | null;
  scale?: string | null;
  polish?: boolean | null;
  polishDescription?: string | null;
  description?: string | null;
  notes?: string | null;
  scalePixelsPerCentimeter?: number | null;
  offsetInParent?: SimpleCoordType | null;
  pointInParent?: SimpleCoordType | null;
  rotation?: number | null;
  mineralogy?: MineralogyType | null;
  spots?: SpotMetadataType[] | null;
  grainInfo?: GrainInfoType | null;
  fabricInfo?: FabricInfoType | null;
  orientationInfo?: MicrographOrientationType | null;
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;
  instrument?: InstrumentType | null;
  clasticDeformationBandInfo?: ClasticDeformationBandInfoType | null;
  grainBoundaryInfo?: GrainBoundaryInfoType | null;
  intraGrainInfo?: IntraGrainInfoType | null;
  veinInfo?: VeinInfoType | null;
  pseudotachylyteInfo?: PseudotachylyteInfoType | null;
  foldInfo?: FoldInfoType | null;
  faultsShearZonesInfo?: FaultsShearZonesInfoType | null;
  extinctionMicrostructureInfo?: ExtinctionMicrostructureInfoType | null;
  lithologyInfo?: LithologyInfoType | null;
  fractureInfo?: FractureInfoType | null;
  isMicroVisible?: boolean | null;
  isExpanded?: boolean | null;
  isSpotExpanded?: boolean | null;
  isFlipped?: boolean | null;
  tags?: string[] | null;
}

/**
 * Spot metadata
 * Annotated region on a micrograph with geometry and feature info
 */
export interface SpotMetadataType {
  id?: string | null;
  name?: string | null;
  labelColor?: string | null;
  showLabel?: boolean | null;
  color?: string | null;
  date?: string | null;
  time?: string | null;
  notes?: string | null;
  modifiedTimestamp?: number | null;
  geometryType?: string | null;
  points?: SimpleCoordType[] | null;
  mineralogy?: MineralogyType | null;
  grainInfo?: GrainInfoType | null;
  fabricInfo?: FabricInfoType | null;
  associatedFiles?: AssociatedFileType[] | null;
  links?: LinkType[] | null;
  clasticDeformationBandInfo?: ClasticDeformationBandInfoType | null;
  grainBoundaryInfo?: GrainBoundaryInfoType | null;
  intraGrainInfo?: IntraGrainInfoType | null;
  veinInfo?: VeinInfoType | null;
  pseudotachylyteInfo?: PseudotachylyteInfoType | null;
  foldInfo?: FoldInfoType | null;
  faultsShearZonesInfo?: FaultsShearZonesInfoType | null;
  extinctionMicrostructureInfo?: ExtinctionMicrostructureInfoType | null;
  lithologyInfo?: LithologyInfoType | null;
  fractureInfo?: FractureInfoType | null;
  tags?: string[] | null;
}

/**
 * Group metadata
 * Collection of micrographs for organizational purposes
 */
export interface GroupMetadataType {
  id?: string | null;
  name?: string | null;
  micrographs?: string[] | null;
  isExpanded?: boolean | null;
}

/**
 * Tag metadata
 * User-defined tags for categorization
 */
export interface TagType {
  id?: string | null;
  name?: string | null;
  tagType?: string | null;
  tagSubtype?: string | null;
  otherConcept?: string | null;
  otherDocumentation?: string | null;
  otherTagType?: string | null;
  lineColor?: string | null;
  fillColor?: string | null;
  transparency?: number | null;
  tagSize?: number | null;
  notes?: string | null;
}

// ============================================================================
// SUPPORTING TYPES (Simple Data Structures)
// ============================================================================

/**
 * Simple 2D coordinate
 */
export interface SimpleCoordType {
  X?: number | null;
  Y?: number | null;
}

/**
 * Micrograph orientation information
 * Supports multiple orientation methods
 */
export interface MicrographOrientationType {
  orientationMethod?: string | null;
  topTrend?: number | null;
  topPlunge?: number | null;
  topReferenceCorner?: string | null;
  sideTrend?: number | null;
  sidePlunge?: number | null;
  sideReferenceCorner?: string | null;
  trendPlungeStrike?: number | null;
  trendPlungeDip?: number | null;
  fabricStrike?: number | null;
  fabricDip?: number | null;
  fabricTrend?: number | null;
  fabricPlunge?: number | null;
  fabricRake?: number | null;
  fabricReference?: string | null;
  lookDirection?: string | null;
  topCorner?: string | null;
}

/**
 * Parent location information for associated images
 */
export interface ParentLocationInfoType {
  scalePixelsPerCentimeter?: number | null;
  offsetInParent?: SimpleCoordType | null;
  rotation?: number | null;
  width?: number | null;
  height?: number | null;
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
