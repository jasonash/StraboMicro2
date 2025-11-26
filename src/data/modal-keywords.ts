/**
 * Modal Keywords Data
 *
 * Contains all searchable keywords for the autocomplete data type selector.
 * Each keyword maps to a modal dialog that can be opened from the properties panel.
 *
 * Source: Legacy JavaFX UI.db modalKeywords table + fracture keywords from spec
 */

export interface ModalKeyword {
  id: number;
  keyword: string;
  path: string;
  modal: string;
  editLevel: 'micrograph' | 'spot' | 'both';
}

export const MODAL_KEYWORDS: ModalKeyword[] = [
  // Mineralogy (5 keywords)
  { id: 1, keyword: "Mineralogy Percentage Calculation Method", path: "Mineralogy -> Percentage Calculation Method", modal: "mineralogy", editLevel: "both" },
  { id: 2, keyword: "Mineralogy Method", path: "Mineralogy -> Method", modal: "mineralogy", editLevel: "both" },
  { id: 3, keyword: "Mineral Name", path: "Mineral -> Name", modal: "mineralogy", editLevel: "both" },
  { id: 4, keyword: "Mineral Percentage", path: "Mineral -> Percentage", modal: "mineralogy", editLevel: "both" },
  { id: 5, keyword: "Lithology Rock Type", path: "Lithology -> Rock Type", modal: "mineralogy", editLevel: "both" },

  // Grain (12 keywords)
  { id: 6, keyword: "Grain Phases", path: "Grain -> Phases", modal: "grain", editLevel: "both" },
  { id: 7, keyword: "Grain Size Mean", path: "Grain -> Size Mean", modal: "grain", editLevel: "both" },
  { id: 8, keyword: "Grain Size Median", path: "Grain -> Size Median", modal: "grain", editLevel: "both" },
  { id: 9, keyword: "Grain Size Mode", path: "Grain -> Size Mode", modal: "grain", editLevel: "both" },
  { id: 10, keyword: "Grain Size Standard Deviation", path: "Grain -> Size Standard Deviation", modal: "grain", editLevel: "both" },
  { id: 11, keyword: "Grain Shape Phases", path: "Grain -> Shape Phases", modal: "grain", editLevel: "both" },
  { id: 12, keyword: "Grain Shape", path: "Grain -> Shape", modal: "grain", editLevel: "both" },
  { id: 13, keyword: "Grain Orientation Phases", path: "Grain -> Orientation Phases", modal: "grain", editLevel: "both" },
  { id: 14, keyword: "Grain Orientation Mean Orientation", path: "Grain -> Orientation Mean Orientation", modal: "grain", editLevel: "both" },
  { id: 15, keyword: "Grain Orientation Relative To", path: "Grain -> Orientation Relative To", modal: "grain", editLevel: "both" },
  { id: 16, keyword: "Grain Orientation Software", path: "Grain -> Orientation Software", modal: "grain", editLevel: "both" },
  { id: 17, keyword: "Grain Orientation SPO Technique", path: "Grain -> Orientation SPO Technique", modal: "grain", editLevel: "both" },

  // Fabric (23 keywords)
  { id: 18, keyword: "Fabric Label", path: "Fabric -> Label", modal: "fabric", editLevel: "both" },
  { id: 19, keyword: "Fabric Element", path: "Fabric -> Element", modal: "fabric", editLevel: "both" },
  { id: 20, keyword: "Fabric Category", path: "Fabric -> Category", modal: "fabric", editLevel: "both" },
  { id: 21, keyword: "Fabric Spacing", path: "Fabric -> Spacing", modal: "fabric", editLevel: "both" },
  { id: 22, keyword: "Fabric Defined By", path: "Fabric -> Defined By", modal: "fabric", editLevel: "both" },
  { id: 23, keyword: "Fabric Composition Notes", path: "Fabric -> Composition Notes", modal: "fabric", editLevel: "both" },
  { id: 24, keyword: "Fabric Composition Layers", path: "Fabric -> Composition Layers", modal: "fabric", editLevel: "both" },
  { id: 25, keyword: "Fabric Layer Thickness", path: "Fabric -> Layer Thickness", modal: "fabric", editLevel: "both" },
  { id: 26, keyword: "Fabric Layer Thickness Unit", path: "Fabric -> Layer Thickness Unit", modal: "fabric", editLevel: "both" },
  { id: 27, keyword: "Fabric Grain Size", path: "Fabric -> Grain Size", modal: "fabric", editLevel: "both" },
  { id: 28, keyword: "Fabric Grain Size Notes", path: "Fabric -> Grain Size Notes", modal: "fabric", editLevel: "both" },
  { id: 29, keyword: "Fabric Grain Size Layers", path: "Fabric -> Grain Size Layers", modal: "fabric", editLevel: "both" },
  { id: 30, keyword: "Fabric Grain Size Unit", path: "Fabric -> Grain Size Unit", modal: "fabric", editLevel: "both" },
  { id: 31, keyword: "Fabric Grain Shape", path: "Fabric -> Grain Shape", modal: "fabric", editLevel: "both" },
  { id: 32, keyword: "Fabric Grain Shape Phases", path: "Fabric -> Grain Shape Phases", modal: "fabric", editLevel: "both" },
  { id: 33, keyword: "Fabric Grain Shape Alignment", path: "Fabric -> Grain Shape Alignment", modal: "fabric", editLevel: "both" },
  { id: 34, keyword: "Fabric Grain Shape Notes", path: "Fabric -> Grain Shape Notes", modal: "fabric", editLevel: "both" },
  { id: 35, keyword: "Fabric Cleavage", path: "Fabric -> Cleavage", modal: "fabric", editLevel: "both" },
  { id: 36, keyword: "Fabric Cleavage Spacing", path: "Fabric -> Cleavage Spacing", modal: "fabric", editLevel: "both" },
  { id: 37, keyword: "Fabric Cleavage Spacing Unit", path: "Fabric -> Cleavage Spacing Unit", modal: "fabric", editLevel: "both" },
  { id: 38, keyword: "Fabric Stylolitic Cleavage", path: "Fabric -> Stylolitic Cleavage", modal: "fabric", editLevel: "both" },
  { id: 39, keyword: "Fabric Geometry Of Seams", path: "Fabric -> Geometry Of Seams", modal: "fabric", editLevel: "both" },
  { id: 40, keyword: "Fabric Cleavage Notes", path: "Fabric -> Cleavage Notes", modal: "fabric", editLevel: "both" },

  // Sample (14 keywords)
  { id: 41, keyword: "Sample Label", path: "Sample -> Label", modal: "sample", editLevel: "both" },
  { id: 42, keyword: "Sample Sample Id", path: "Sample -> Sample Id", modal: "sample", editLevel: "both" },
  { id: 43, keyword: "Sample Sampling Purpose", path: "Sample -> Sampling Purpose", modal: "sample", editLevel: "both" },
  { id: 44, keyword: "Sample Description", path: "Sample -> Description", modal: "sample", editLevel: "both" },
  { id: 45, keyword: "Sample Material Type", path: "Sample -> Material Type", modal: "sample", editLevel: "both" },
  { id: 46, keyword: "Sample Inplaceness", path: "Sample -> Inplaceness", modal: "sample", editLevel: "both" },
  { id: 47, keyword: "Sample Oriented?", path: "Sample -> Oriented?", modal: "sample", editLevel: "both" },
  { id: 48, keyword: "Sample Size", path: "Sample -> Size", modal: "sample", editLevel: "both" },
  { id: 49, keyword: "Sample Degree Of Weathering", path: "Sample -> Degree Of Weathering", modal: "sample", editLevel: "both" },
  { id: 50, keyword: "Sample Notes", path: "Sample -> Notes", modal: "sample", editLevel: "both" },
  { id: 51, keyword: "Sample Sample Type", path: "Sample -> Sample Type", modal: "sample", editLevel: "both" },
  { id: 52, keyword: "Sample Color", path: "Sample -> Color", modal: "sample", editLevel: "both" },
  { id: 53, keyword: "Sample Lithology", path: "Sample -> Lithology", modal: "sample", editLevel: "both" },
  { id: 54, keyword: "Sample Sample Unit", path: "Sample -> Sample Unit", modal: "sample", editLevel: "both" },

  // Micrograph (15 keywords) - micrograph level only
  { id: 55, keyword: "Micrograph Name", path: "Micrograph -> Name", modal: "micrograph", editLevel: "micrograph" },
  { id: 56, keyword: "Micrograph Image Type", path: "Micrograph -> Image Type", modal: "micrograph", editLevel: "micrograph" },
  { id: 57, keyword: "Micrograph Polish", path: "Micrograph -> Polish", modal: "micrograph", editLevel: "micrograph" },
  { id: 58, keyword: "Micrograph Notes", path: "Micrograph -> Notes", modal: "micrograph", editLevel: "micrograph" },
  { id: 59, keyword: "Instrument Type", path: "Instrument -> Type", modal: "micrograph", editLevel: "micrograph" },
  { id: 60, keyword: "Instrument Data Type", path: "Instrument -> Data Type", modal: "micrograph", editLevel: "micrograph" },
  { id: 61, keyword: "Instrument Brand", path: "Instrument -> Brand", modal: "micrograph", editLevel: "micrograph" },
  { id: 62, keyword: "Instrument Model", path: "Instrument -> Model", modal: "micrograph", editLevel: "micrograph" },
  { id: 63, keyword: "Instrument University", path: "Instrument -> University", modal: "micrograph", editLevel: "micrograph" },
  { id: 64, keyword: "Instrument Laboratory", path: "Instrument -> Laboratory", modal: "micrograph", editLevel: "micrograph" },
  { id: 65, keyword: "Instrument Data Collection Software", path: "Instrument -> Data Collection Software", modal: "micrograph", editLevel: "micrograph" },
  { id: 66, keyword: "Instrument Post Processing Software", path: "Instrument -> Post Processing Software", modal: "micrograph", editLevel: "micrograph" },
  { id: 67, keyword: "Instrument Filament Type", path: "Instrument -> Filament Type", modal: "micrograph", editLevel: "micrograph" },
  { id: 68, keyword: "Instrument Detector", path: "Instrument -> Detector", modal: "micrograph", editLevel: "micrograph" },
  { id: 69, keyword: "Instrument Notes", path: "Instrument -> Notes", modal: "micrograph", editLevel: "micrograph" },

  // Spot (4 keywords) - spot level only
  { id: 70, keyword: "Spot Name", path: "Spot -> Name", modal: "spot", editLevel: "spot" },
  { id: 71, keyword: "Spot Label Color", path: "Spot -> Label Color", modal: "spot", editLevel: "spot" },
  { id: 72, keyword: "Spot Visibility", path: "Spot -> Visibility", modal: "spot", editLevel: "spot" },
  { id: 73, keyword: "Spot Notes", path: "Spot -> Notes", modal: "spot", editLevel: "spot" },

  // Fold (35 keywords)
  { id: 74, keyword: "Fold Geometry", path: "Fold -> Geometry", modal: "fold", editLevel: "both" },
  { id: 75, keyword: "Fold Inter-Limb Angle", path: "Fold -> Inter-Limb Angle", modal: "fold", editLevel: "both" },
  { id: 76, keyword: "Fold Gentle", path: "Fold -> Gentle", modal: "fold", editLevel: "both" },
  { id: 77, keyword: "Fold Open", path: "Fold -> Open", modal: "fold", editLevel: "both" },
  { id: 78, keyword: "Fold Close", path: "Fold -> Close", modal: "fold", editLevel: "both" },
  { id: 79, keyword: "Fold Tight", path: "Fold -> Tight", modal: "fold", editLevel: "both" },
  { id: 80, keyword: "Fold Isoclinal", path: "Fold -> Isoclinal", modal: "fold", editLevel: "both" },
  { id: 81, keyword: "Fold Fan", path: "Fold -> Fan", modal: "fold", editLevel: "both" },
  { id: 82, keyword: "Fold Closure", path: "Fold -> Closure", modal: "fold", editLevel: "both" },
  { id: 83, keyword: "Fold Rounded", path: "Fold -> Rounded", modal: "fold", editLevel: "both" },
  { id: 84, keyword: "Fold Angular (Chevron/Kink)", path: "Fold -> Angular (Chevron/Kink)", modal: "fold", editLevel: "both" },
  { id: 85, keyword: "Fold Axial Trace", path: "Fold -> Axial Trace", modal: "fold", editLevel: "both" },
  { id: 86, keyword: "Fold Upright", path: "Fold -> Upright", modal: "fold", editLevel: "both" },
  { id: 87, keyword: "Fold Inclined", path: "Fold -> Inclined", modal: "fold", editLevel: "both" },
  { id: 88, keyword: "Fold Overturned", path: "Fold -> Overturned", modal: "fold", editLevel: "both" },
  { id: 89, keyword: "Fold Recumbent", path: "Fold -> Recumbent", modal: "fold", editLevel: "both" },
  { id: 90, keyword: "Fold Symmetry", path: "Fold -> Symmetry", modal: "fold", editLevel: "both" },
  { id: 91, keyword: "Fold Symmetric", path: "Fold -> Symmetric", modal: "fold", editLevel: "both" },
  { id: 92, keyword: "Fold Asymmetric", path: "Fold -> Asymmetric", modal: "fold", editLevel: "both" },
  { id: 93, keyword: "Fold Wavelength", path: "Fold -> Wavelength", modal: "fold", editLevel: "both" },
  { id: 94, keyword: "Fold Amplitude", path: "Fold -> Amplitude", modal: "fold", editLevel: "both" },
  { id: 95, keyword: "Fold Parallel (Concentric)", path: "Fold -> Parallel (Concentric)", modal: "fold", editLevel: "both" },
  { id: 96, keyword: "Fold Similar", path: "Fold -> Similar", modal: "fold", editLevel: "both" },
  { id: 97, keyword: "Fold Ptygmatic", path: "Fold -> Ptygmatic", modal: "fold", editLevel: "both" },
  { id: 98, keyword: "Fold Fault-Related", path: "Fold -> Fault-Related", modal: "fold", editLevel: "both" },
  { id: 99, keyword: "Fold Box", path: "Fold -> Box", modal: "fold", editLevel: "both" },
  { id: 100, keyword: "Fold Kink", path: "Fold -> Kink", modal: "fold", editLevel: "both" },
  { id: 101, keyword: "Fold Continuity", path: "Fold -> Continuity", modal: "fold", editLevel: "both" },
  { id: 102, keyword: "Fold Harmonic", path: "Fold -> Harmonic", modal: "fold", editLevel: "both" },
  { id: 103, keyword: "Fold Disharmonic", path: "Fold -> Disharmonic", modal: "fold", editLevel: "both" },
  { id: 104, keyword: "Fold Facing", path: "Fold -> Facing", modal: "fold", editLevel: "both" },
  { id: 105, keyword: "Fold Syncline", path: "Fold -> Syncline", modal: "fold", editLevel: "both" },
  { id: 106, keyword: "Fold Anticline", path: "Fold -> Anticline", modal: "fold", editLevel: "both" },
  { id: 107, keyword: "Fold Antiformal Syncline", path: "Fold -> Antiformal Syncline", modal: "fold", editLevel: "both" },
  { id: 108, keyword: "Fold Synformal Anticline", path: "Fold -> Synformal Anticline", modal: "fold", editLevel: "both" },

  // Pseudotachylyte (15 keywords)
  { id: 109, keyword: "Pseudotachylyte Matrix/Groundmass", path: "Pseudotachylyte -> Matrix/Groundmass", modal: "pseudotachylyte", editLevel: "both" },
  { id: 110, keyword: "Pseudotachylyte Constraints", path: "Pseudotachylyte -> Constraints", modal: "pseudotachylyte", editLevel: "both" },
  { id: 111, keyword: "Pseudotachylyte Crystallites", path: "Pseudotachylyte -> Crystallites", modal: "pseudotachylyte", editLevel: "both" },
  { id: 112, keyword: "Pseudotachylyte Mineralogy", path: "Pseudotachylyte -> Mineralogy", modal: "pseudotachylyte", editLevel: "both" },
  { id: 113, keyword: "Pseudotachylyte Shapes", path: "Pseudotachylyte -> Shapes", modal: "pseudotachylyte", editLevel: "both" },
  { id: 114, keyword: "Pseudotachylyte Zoning", path: "Pseudotachylyte -> Zoning", modal: "pseudotachylyte", editLevel: "both" },
  { id: 115, keyword: "Pseudotachylyte Survivor Clasts", path: "Pseudotachylyte -> Survivor Clasts", modal: "pseudotachylyte", editLevel: "both" },
  { id: 116, keyword: "Pseudotachylyte Margin Description", path: "Pseudotachylyte -> Margin Description", modal: "pseudotachylyte", editLevel: "both" },
  { id: 117, keyword: "Pseudotachylyte Distribution", path: "Pseudotachylyte -> Distribution", modal: "pseudotachylyte", editLevel: "both" },
  { id: 118, keyword: "Pseudotachylyte Sulphide/Oxide Droplets", path: "Pseudotachylyte -> Sulphide/Oxide Droplets", modal: "pseudotachylyte", editLevel: "both" },
  { id: 119, keyword: "Pseudotachylyte Fabric", path: "Pseudotachylyte -> Fabric", modal: "pseudotachylyte", editLevel: "both" },
  { id: 120, keyword: "Pseudotachylyte Injection Features", path: "Pseudotachylyte -> Injection Features", modal: "pseudotachylyte", editLevel: "both" },
  { id: 121, keyword: "Pseudotachylyte Aperture", path: "Pseudotachylyte -> Aperture", modal: "pseudotachylyte", editLevel: "both" },
  { id: 122, keyword: "Pseudotachylyte Chilled Margins", path: "Pseudotachylyte -> Chilled Margins", modal: "pseudotachylyte", editLevel: "both" },
  { id: 123, keyword: "Pseudotachylyte Vescicles/Amygdules", path: "Pseudotachylyte -> Vescicles/Amygdules", modal: "pseudotachylyte", editLevel: "both" },

  // Vein (6 keywords)
  { id: 124, keyword: "Vein Mineralogy", path: "Vein -> Mineralogy", modal: "vein", editLevel: "both" },
  { id: 125, keyword: "Vein Crystal Shape", path: "Vein -> Crystal Shape", modal: "vein", editLevel: "both" },
  { id: 126, keyword: "Vein Growth Morphology", path: "Vein -> Growth Morphology", modal: "vein", editLevel: "both" },
  { id: 127, keyword: "Vein Inclusion Trails", path: "Vein -> Inclusion Trails", modal: "vein", editLevel: "both" },
  { id: 128, keyword: "Vein Kinematics", path: "Vein -> Kinematics", modal: "vein", editLevel: "both" },
  { id: 129, keyword: "Vein Notes", path: "Vein -> Notes", modal: "vein", editLevel: "both" },

  // Clastic Deformation Bands (4 keywords)
  { id: 130, keyword: "Clastic Deformation Band Type", path: "Clastic Deformation Bands -> Band Type", modal: "clastic", editLevel: "both" },
  { id: 131, keyword: "Clastic Deformation Band Thickness", path: "Clastic Deformation Bands -> Thickness", modal: "clastic", editLevel: "both" },
  { id: 132, keyword: "Clastic Deformation Band Cements", path: "Clastic Deformation Bands -> Cements", modal: "clastic", editLevel: "both" },
  { id: 133, keyword: "Clastic Deformation Band Notes", path: "Clastic Deformation Bands -> Notes", modal: "clastic", editLevel: "both" },

  // Grain Boundary/Contact (4 keywords)
  { id: 134, keyword: "Grain Boundary/Contact Phases", path: "Grain Boundary/Contact -> Phases", modal: "grainBoundary", editLevel: "both" },
  { id: 135, keyword: "Grain Boundary/Contact Morphology", path: "Grain Boundary/Contact -> Morphology", modal: "grainBoundary", editLevel: "both" },
  { id: 136, keyword: "Grain Boundary/Contact Descriptors", path: "Grain Boundary/Contact -> Descriptors", modal: "grainBoundary", editLevel: "both" },
  { id: 137, keyword: "Grain Boundary/Contact Notes", path: "Grain Boundary/Contact -> Notes", modal: "grainBoundary", editLevel: "both" },

  // Intragrain (3 keywords)
  { id: 138, keyword: "Intragrain Grain Shape", path: "Intragrain -> Grain Shape", modal: "intraGrain", editLevel: "both" },
  { id: 139, keyword: "Intragrain Textural Feature", path: "Intragrain -> Textural Feature", modal: "intraGrain", editLevel: "both" },
  { id: 140, keyword: "Intragrain Notes", path: "Intragrain -> Notes", modal: "intraGrain", editLevel: "both" },

  // Faults/Shear Zones (4 keywords)
  { id: 141, keyword: "Faults/Shear Zones Shear Sense", path: "Faults/Shear Zones -> Shear Sense", modal: "faultsShearZones", editLevel: "both" },
  { id: 142, keyword: "Faults/Shear Zones Shear Sense Indicators", path: "Faults/Shear Zones -> Shear Sense Indicators", modal: "faultsShearZones", editLevel: "both" },
  { id: 143, keyword: "Faults/Shear Zones Offset", path: "Faults/Shear Zones -> Offset", modal: "faultsShearZones", editLevel: "both" },
  { id: 144, keyword: "Faults/Shear Zones Width", path: "Faults/Shear Zones -> Width", modal: "faultsShearZones", editLevel: "both" },

  // Extinction Microstructures (5 keywords)
  { id: 145, keyword: "Extinction Microstructures Phase Involved", path: "Extinction Microstructures -> Phase Involved", modal: "extinctionMicrostructures", editLevel: "both" },
  { id: 146, keyword: "Extinction Microstructures Dislocations", path: "Extinction Microstructures -> Dislocations", modal: "extinctionMicrostructures", editLevel: "both" },
  { id: 147, keyword: "Extinction Microstructures Heterogeneous Extinction", path: "Extinction Microstructures -> Heterogeneous Extinction", modal: "extinctionMicrostructures", editLevel: "both" },
  { id: 148, keyword: "Extinction Microstructures Subgrain Structures", path: "Extinction Microstructures -> Subgrain Structures", modal: "extinctionMicrostructures", editLevel: "both" },
  { id: 149, keyword: "Extinction Microstructures Bands", path: "Extinction Microstructures -> Bands", modal: "extinctionMicrostructures", editLevel: "both" },

  // Fracture (7 keywords) - from spec, not in legacy DB
  { id: 150, keyword: "Fracture Kinematics", path: "Fracture -> Kinematics", modal: "fracture", editLevel: "both" },
  { id: 151, keyword: "Fracture Opening", path: "Fracture -> Opening", modal: "fracture", editLevel: "both" },
  { id: 152, keyword: "Fracture Shear", path: "Fracture -> Shear", modal: "fracture", editLevel: "both" },
  { id: 153, keyword: "Fracture Hybrid", path: "Fracture -> Hybrid", modal: "fracture", editLevel: "both" },
  { id: 154, keyword: "Fracture Sealed/Healed", path: "Fracture -> Sealed/Healed", modal: "fracture", editLevel: "both" },
  { id: 155, keyword: "Fracture Aperture", path: "Fracture -> Aperture", modal: "fracture", editLevel: "both" },
  { id: 156, keyword: "Fracture Offset", path: "Fracture -> Offset", modal: "fracture", editLevel: "both" },

  // Associated Files & Links (2 keywords)
  { id: 157, keyword: "Associated Files", path: "Files -> Associated Files", modal: "files", editLevel: "both" },
  { id: 158, keyword: "Links", path: "Links -> Links", modal: "links", editLevel: "both" },
];

/**
 * Filter keywords by edit level (context)
 */
export function filterKeywordsByContext(
  keywords: ModalKeyword[],
  context: 'micrograph' | 'spot'
): ModalKeyword[] {
  return keywords.filter(
    (kw) => kw.editLevel === context || kw.editLevel === 'both'
  );
}

/**
 * Search keywords by query string (case-insensitive)
 */
export function searchKeywords(
  keywords: ModalKeyword[],
  query: string,
  maxResults: number = 10
): ModalKeyword[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  return keywords
    .filter((kw) => kw.keyword.toLowerCase().includes(lowerQuery))
    .slice(0, maxResults);
}
