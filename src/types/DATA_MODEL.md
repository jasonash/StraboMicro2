# StraboMicro Data Model Documentation

**Version:** 2.0.0
**Last Updated:** 2025-11-14
**Status:** Initial Definition

## Overview

This document describes the complete data model for StraboMicro projects, derived from the legacy JavaFX application datatypes. The model represents geological microanalysis data including thin section micrographs, annotations, and analytical results.

## File Format

Projects are saved as `.smz` files (ZIP archives) containing:
- `project.json` - Complete project metadata conforming to `project-schema.json`
- `images/` - Original TIFF micrograph files
- `tiles/` - Pre-generated image tiles for performance (optional)
- `exports/` - Generated PDFs, CSVs, etc. (optional)

## Schema Files

- **`project-schema.json`** - JSON Schema definition (draft-07)
- **`project-types.ts`** - TypeScript interfaces and type guards
- **`DATA_MODEL.md`** - This documentation file

## Hierarchical Structure

```
ProjectMetadata (root)
├── datasets[]
│   └── DatasetMetadata
│       └── samples[]
│           └── SampleMetadata
│               └── micrographs[]
│                   └── MicrographMetadata
│                       ├── spots[] → Spot
│                       └── [feature collections]
├── groups[]
│   └── GroupMetadata
└── tags[]
    └── Tag
```

### Primary Hierarchy

1. **Project** - Top-level container with metadata
2. **Dataset** - Logical grouping of samples
3. **Sample** - Physical rock sample
4. **Micrograph** - Thin section image (TIFF file)
5. **Spot** - Annotated region on micrograph

### Secondary Relationships

- **Parent-child micrographs**: `MicrographMetadata.parentID` creates unlimited overlay nesting
- **Groups**: Cross-cutting collections of spots via `spotIDs[]`
- **Tags**: User-defined labels for spots via `spotIDs[]`

## Core Data Types

### ProjectMetadata (Root)

The top-level container representing a complete StraboMicro project.

**Key Fields:**
- `id` (required) - Unique identifier (UUID)
- `name` (required) - Project name
- `datasets[]` - Array of dataset containers
- `groups[]` - Cross-cutting spot groupings
- `tags[]` - User-defined labels

**Metadata Fields:**
- Owner information (name, affiliation, email, ORCID)
- Principal investigator details
- Grant/funding information
- Start/end dates

**Usage:**
```typescript
const project: ProjectMetadata = {
  id: crypto.randomUUID(),
  name: "Alpine Shear Zone Study",
  owner: "Dr. Jane Smith",
  datasets: [...]
};
```

### DatasetMetadata

Logical grouping of related samples (e.g., all samples from one field area).

**Fields:**
- `id`, `name` (required)
- `samples[]` - Array of SampleMetadata

### SampleMetadata

Represents a physical rock sample with associated thin sections.

**Key Fields:**
- `lithology` - Rock type
- `rockType`, `mainLithCategory`, `mainRockType` - Lithology classification
- `orientation`, `orientationQuality` - Structural orientation
- `tectSetting`, `physiographicSetting` - Geological context
- `micrographs[]` - Array of thin section images

### MicrographMetadata

Represents a thin section micrograph (TIFF image) with annotations.

**Image Properties:**
- `imageFilename` - Original TIFF filename
- `imageWidth`, `imageHeight` - Pixel dimensions
- `micronPerPixel` - Scale calibration

**Spatial Registration (for overlay images):**
- `parentID` - Reference to parent micrograph (creates hierarchy)
- `xOffset`, `yOffset` - Position on parent image (pixels)
- `rotation` - Rotation angle (degrees)
- `opacity` - Transparency (0-1)
- `visible` - Show/hide toggle

**Annotations:**
- `spots[]` - Vector annotations (points, lines, polygons)
- 10 feature collection arrays (same as Spot)

**Critical Implementation Notes:**

1. **Unlimited Nesting**: Micrographs can be associated images of other micrographs via `parentID`, creating a hierarchy of arbitrary depth (reference → associated → associated → ...).

2. **Feature Collections**: Both Micrographs AND Spots can contain the same 10 geological feature types:
   - `grainInfos[]`
   - `fabricInfos[]`
   - `boundaryInfos[]`
   - `mineralogies[]`
   - `veinInfos[]`
   - `fractureInfos[]`
   - `foldInfos[]`
   - `porosity[]`
   - `pseudotachylytes[]`
   - `otherFeatures[]`

3. **Micrograph-level vs Spot-level Features**: Features can be attached to either:
   - Entire micrograph (general observations)
   - Specific spots (localized annotations)

### Spot

Vector annotation on a micrograph (point, line, or polygon).

**Fields:**
- `id`, `name` (required)
- `notes` - User notes
- `geometry` - GeoJSON-like geometry definition
- 10 feature collection arrays (same as Micrograph)

**Geometry Types:**
- **Point**: Single location `[x, y]`
- **LineString**: Multi-point line `[[x1, y1], [x2, y2], ...]`
- **Polygon**: Closed shape `[[[x1, y1], [x2, y2], ...]]`

**Usage:**
```typescript
const grainSpot: Spot = {
  id: crypto.randomUUID(),
  name: "Quartz grain 1",
  geometry: {
    type: 'Polygon',
    coordinates: [[[100, 100], [200, 100], [200, 200], [100, 200], [100, 100]]]
  },
  mineralogies: [{
    mineral: 'Quartz',
    abundance: 100
  }],
  grainInfos: [{
    grainSize: '0.5 mm',
    boundaryShape: 'lobate'
  }]
};
```

## Geological Feature Types

### Feature Collection Pattern

Both `MicrographMetadata` and `Spot` contain identical feature collections. Each collection is an array of feature objects.

**10 Feature Types:**

1. **GrainInfo** - Grain microstructure (size, shape, boundaries)
2. **FabricInfo** - Rock fabric/texture (foliation, lineation, metamorphic grade)
3. **BoundaryInfo** - Grain boundary characteristics
4. **Mineralogy** - Mineral identification and optical properties
5. **VeinInfo** - Vein geometry and fill
6. **FractureInfo** - Fracture characteristics
7. **FoldInfo** - Fold geometry
8. **Porosity** - Pore space measurements
9. **Pseudotachylyte** - Fault-related melts (56 fields!)
10. **OtherFeature** - Extensible generic type

### GrainInfo

Describes grain microstructure characteristics.

**Key Fields:**
- `grainSize`, `grainSizeRange` - Dimensional measurements
- `aspectRatio`, `aspectRatioRange` - Shape metrics
- `boundaryShape` - Geometric description
- `contacts` - Contact relationships
- `grainBoundaries[]` - Detailed boundary analysis
- `chemistries[]` - Geochemical analyses
- `geochronologies[]` - Dating results

**Example:**
```typescript
const grain: GrainInfo = {
  grainSize: '0.5-2.0 mm',
  aspectRatio: '1:3',
  boundaryShape: 'lobate',
  contacts: 'sutured',
  chemistries: [{
    instrument: { instrumentType: 'EPMA' },
    oxides: { SiO2: 99.8 }
  }]
};
```

### Mineralogy

Mineral identification with optical and chemical properties.

**Optical Properties:**
- `mineral` - Mineral name
- `abundance` - Percentage (0-100)
- `color`, `pleochroism` - Color characteristics
- `interference` - Interference colors
- `relief` - Optical relief
- `cleavage`, `twinning`, `zoning` - Crystal properties
- `extinctionAngle` - Angle in degrees

**Chemical Data:**
- `chemistries[]` - Array of Chemistry analyses

### Chemistry

Geochemical analysis results from various instruments.

**Fields:**
- `instrument` - Instrument configuration (see Instrument type)
- `elements` - Element concentrations `{ "Si": 467000, "Al": 82000 }`
- `oxides` - Oxide weight percentages `{ "SiO2": 99.8, "Al2O3": 0.15 }`
- `total` - Sum of oxides (should be ~100%)
- `analyst`, `analysisDate` - Metadata

**Supported Techniques:**
- SEM, TEM, EPMA
- SIMS, LA-ICP-MS
- XRF, Raman, FTIR
- Optical microscopy

### Instrument

Analytical instrument configuration (65 fields in legacy code, simplified here).

**Common Fields:**
- `instrumentType` - Enum: SEM, TEM, EPMA, SIMS, etc.
- `acceleratingVoltage` - kV
- `beamCurrent` - nA
- `spotSize` - µm
- `workingDistance` - mm
- `magnification` - dimensionless
- `detector` - Detector type

**Implementation Note**: The legacy Java code has 65 instrument-related fields across multiple types (SEMType, TEMType, etc.). We've simplified to a single Instrument type with optional fields.

### Pseudotachylyte

Special feature type for fault-related pseudotachylyte veins.

**Why So Complex?** Pseudotachylytes are scientifically significant (evidence of seismic slip) and require detailed characterization.

**Key Fields (12 shown, 56 in legacy):**
- `veinType`, `veinThickness`, `veinOrientation`
- `matrixColor`, `matrixTexture`
- `clastComposition`, `clastSize`, `clastShape`, `clastDistribution`
- `injectionVeins` - Boolean flag
- `wallRockAlteration`
- `crosscuttingRelationships`

## Organization Structures

### GroupMetadata

User-defined groupings of spots (cross-cutting the hierarchical structure).

**Fields:**
- `id`, `name`
- `spotIDs[]` - Array of spot ID references

**Use Cases:**
- "All mylonitic shear zones"
- "Samples from Field Area A"
- "High-temperature features"

### Tag

User-defined labels for categorization.

**Fields:**
- `id`, `name`
- `color` - Hex color code (#RRGGBB)
- `spotIDs[]` - Tagged spot references

**Use Cases:**
- "Needs review" (red)
- "Published in Paper X" (green)
- "High priority" (yellow)

## Type Guards and Utilities

### Geometry Type Guards

```typescript
import { isPointGeometry, isLineStringGeometry, isPolygonGeometry } from './project-types';

if (isPointGeometry(spot.geometry)) {
  const [x, y] = spot.geometry.coordinates;  // Type-safe access
}
```

### Feature Type Utilities

```typescript
// Union type of all geological features
type GeologicalFeature = GrainInfo | FabricInfo | Mineralogy | ...;

// Type-safe feature collection names
type FeatureTypeName = 'grainInfos' | 'fabricInfos' | 'mineralogies' | ...;

// Shared interface for objects with feature collections
interface FeatureCollections {
  grainInfos?: GrainInfo[];
  fabricInfos?: FabricInfo[];
  // ... all 10 types
}
```

## Implementation Guidelines

### 1. Micrograph Overlay Hierarchy

When rendering micrographs:

```typescript
function buildMicrographTree(micrographs: MicrographMetadata[]): Map<string, MicrographMetadata[]> {
  const tree = new Map<string, MicrographMetadata[]>();

  for (const micro of micrographs) {
    const parentId = micro.parentID || 'ROOT';
    if (!tree.has(parentId)) tree.set(parentId, []);
    tree.get(parentId)!.push(micro);
  }

  return tree;
}
```

**Rendering Strategy** (see `docs/overlay-strategy-discussion.md`):
- Reference images (no parentID): Full tiling
- Associated images: Dynamic LOD based on screen coverage and zoom

### 2. Feature Collection Access

Both Micrographs and Spots share the same feature collections:

```typescript
function extractAllMineralogies(container: MicrographMetadata | Spot): Mineralogy[] {
  return container.mineralogies || [];
}

function addMineralogy(container: MicrographMetadata | Spot, mineral: Mineralogy): void {
  if (!container.mineralogies) container.mineralogies = [];
  container.mineralogies.push(mineral);
}
```

### 3. ID Management

All entities use string UUIDs:

```typescript
import { randomUUID } from 'crypto';

const newProject: ProjectMetadata = {
  id: randomUUID(),
  name: "My Project",
  datasets: []
};
```

### 4. Data Validation

Use the JSON Schema for runtime validation:

```typescript
import Ajv from 'ajv';
import schema from './project-schema.json';

const ajv = new Ajv();
const validate = ajv.compile(schema);

function validateProject(data: unknown): data is ProjectMetadata {
  const valid = validate(data);
  if (!valid) {
    console.error(validate.errors);
    return false;
  }
  return true;
}
```

### 5. State Management (Future)

When implementing Zustand stores:

```typescript
interface ProjectStore {
  project: ProjectMetadata | null;

  // Hierarchical accessors
  getDataset: (datasetId: string) => DatasetMetadata | undefined;
  getSample: (sampleId: string) => SampleMetadata | undefined;
  getMicrograph: (microId: string) => MicrographMetadata | undefined;
  getSpot: (spotId: string) => Spot | undefined;

  // Mutations
  addDataset: (dataset: DatasetMetadata) => void;
  addMicrograph: (sampleId: string, micrograph: MicrographMetadata) => void;
  addSpot: (microId: string, spot: Spot) => void;

  // Feature operations
  addFeature: <T extends GeologicalFeature>(
    containerId: string,
    featureType: FeatureTypeName,
    feature: T
  ) => void;
}
```

## Legacy Java Mapping

### Types NOT Included

The following Java types from the legacy code were excluded as they represent UI state or helper utilities, not persistence data:

**UI State Types:**
- `MicrographNode`, `SampleNode`, `SpotNode` - JavaFX TreeView nodes
- `BreadcrumbBarSkin` - UI component
- `SpotTableView` - UI component
- `PolylineROI`, `PolygonROI`, `PointROI` - ImageJ ROI wrappers (replaced by Geometry)

**Helper/Utility Types:**
- `GlobalStrings` - String constants
- `SpotIDComparator` - Comparator implementation
- `ProjectMetadataType.SpotsOnlyFilter` - Inner filter class

**Replaced Patterns:**
- JavaFX `ObservableList` → TypeScript arrays
- Java getter/setter methods → Direct property access
- Java inner classes → Separate interfaces or inline types

### Field Name Conventions

Java → TypeScript mappings:

- Java: `getImageFilename()` → TypeScript: `imageFilename`
- Java: `setMicronPerPixel(double)` → TypeScript: `micronPerPixel: number`
- Java: `isVisible()` → TypeScript: `visible: boolean`
- Java: `ObservableList<Spot>` → TypeScript: `Spot[]`

### Type Simplifications

1. **Instrument Types**: Java had separate `SEMType`, `TEMType`, `EPMAType` (65 total fields). TypeScript uses single `Instrument` with optional fields.

2. **Geometry**: Java used ImageJ `Roi` classes. TypeScript uses GeoJSON-like `Geometry` interface.

3. **Nullability**: Java's `@Nullable` annotations → TypeScript optional properties (`field?: type`)

## Schema Versioning

**Current Version:** 2.0.0

The schema includes a `version` field in the root to support future migrations:

```json
{
  "version": "2.0.0",
  "id": "...",
  "name": "..."
}
```

**Version History:**
- **2.0.0** (2025-11-14): Initial TypeScript/Electron rewrite schema
- **1.x** (legacy): JavaFX application format (backward compatibility TBD)

## File I/O Examples

### Saving a Project

```typescript
import JSZip from 'jszip';
import { ProjectMetadata } from './project-types';

async function saveProject(project: ProjectMetadata, filePath: string): Promise<void> {
  const zip = new JSZip();

  // Add JSON metadata
  zip.file('project.json', JSON.stringify(project, null, 2));

  // Add image files (simplified)
  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        if (micro.imageFilename) {
          const imageData = await readImageFile(micro.imageFilename);
          zip.file(`images/${micro.id}.tif`, imageData);
        }
      }
    }
  }

  // Write ZIP file
  const content = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.promises.writeFile(filePath, content);
}
```

### Loading a Project

```typescript
async function loadProject(filePath: string): Promise<ProjectMetadata> {
  const zipData = await fs.promises.readFile(filePath);
  const zip = await JSZip.loadAsync(zipData);

  // Read JSON metadata
  const projectJson = await zip.file('project.json')?.async('string');
  if (!projectJson) throw new Error('Invalid .smz file: missing project.json');

  const project: ProjectMetadata = JSON.parse(projectJson);

  // Validate against schema
  if (!validateProject(project)) {
    throw new Error('Invalid project data');
  }

  return project;
}
```

## References

- **JSON Schema Spec**: https://json-schema.org/draft-07/schema
- **GeoJSON**: https://geojson.org/ (inspiration for Geometry)
- **Legacy Java Code**: `docs/legacy-java-code/src/main/java/org/strabospot/datatypes/`
- **PRD**: `docs/PRD.md` Section 4 (Data Model) and Section 5 (Tech Stack)
- **Overlay Strategy**: `docs/overlay-strategy-discussion.md`

## Future Enhancements

### Phase 1 Priorities
1. Implement basic ProjectMetadata → Dataset → Sample → Micrograph creation
2. Simple Spot geometry (Polygon only)
3. Basic Mineralogy feature type

### Phase 2+ Additions
1. Complete all 10 feature types with full field implementations
2. Chemistry and Geochronology data entry
3. Advanced Instrument configurations
4. Group and Tag management UI
5. Schema migration utilities for version upgrades

## Questions?

See `docs/PRD.md` for complete product requirements or `docs/legacy-java-code/` for original Java implementations.
