# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠ CRITICAL: Session Startup Protocol
1. Read PROJECT_STATUS.md first to understand current progress
2. Review recent git commits if unclear about latest changes
3. Ask clarifying questions before starting new work

**IMPORTANT**: NEVER commit PROJECT_STATUS.md to git - this file is private and should never be pushed to GitHub.

## ⚠ CRITICAL: Git Workflow Requirements

**IMPORTANT**: You MUST follow the Git workflow for ALL code changes:

1. ALWAYS create a feature branch BEFORE making changes
   ```bash
   git checkout -b feature/[feature-name] # or fix/[bug-name]
   ``` 
   
2. **Commit changes REGULARLY during development**
   - After completing each major step
   - When switching between different files/features
   - Before running build tests
   - Use meaningful commit messages with [Type] prefix

3. **Never work directly on main branch!**
   - All changes must go through feature branches
   - Create pull requests for review
	
4. **Commit message format:**
   ```bash
   git commit -m "[Type] Brief description"
   ```

   **IMPORTANT**: Do NOT include any Claude attribution, co-authorship, or "Generated with Claude Code" messages in commits.

   Commit messages should ONLY follow the format above.

   Examples:
   - `[Feature] Add user authentication`
   - `[Fix] Resolve database connection timeout`
   - `[Refactor] Simplify error handling logic`

   Do NOT add:
   - "🤖 Generated with [Claude Code]..."
   - "Co-Authored-By: Claude..."
   - Any other attribution or tool mentions

**Failure to follow Git workflow = Incomplete Task**

## Project Overview

**StraboMicro2** is a complete rewrite of StraboMicro (a JavaFX geological microanalysis application) using modern Electron + React + TypeScript architecture. The application enables geologists to manage, annotate, and analyze thin section micrographs with sophisticated hierarchical image organization and spatial registration.

**Current Stage**: Initial development - the project currently contains only documentation and legacy Java code reference. No Electron application has been built yet.

**Migration Source**: Legacy JavaFX codebase (187 Java files, 82 FXML layouts, 103 features) located in `docs/legacy-java-code/`

## Key Technical Challenges

### 1. Hierarchical Multi-Image Overlay System

The core technical challenge is rendering large (100MB+) TIFF micrographs with layered associated images:

- **Reference images**: Base micrographs requiring tiled rendering for performance
- **Associated images**: Child micrographs placed on parents (can also be 100MB+)
- **Hierarchy depth**: Unlimited nesting (associated → associated → associated...)
- **Interaction**: Users must be able to drag, resize, and rotate associated images in real-time (NOT via modal dialogs like legacy app)

**Approved Solution** (see `docs/overlay-strategy-discussion.md`):
- Use Konva.js canvas with dynamic Level-of-Detail (LOD) rendering
- Reference image: Full tiling system
- Associated images: Smart LOD based on screen coverage and zoom:
  - THUMBNAIL mode: <10% screen coverage or zoomed out
  - DOWNSAMPLED mode: 10-40% coverage, moderate zoom
  - TILED mode: >40% coverage or high zoom (upgrades to full tiling)
- Typical use case: 1 reference + ~20 smaller associated images (90% of usage)

### 2. Tile Caching Strategy

Large images (100MB+ TIFF files) must load quickly when switching between micrographs in a project.

**Approved Solution** (see `docs/tile-cache-discussion.md`):
- Disk-based tile cache in app user data directory
- Cache structure: `<image-hash>/metadata.json` + `tile_0_0.png`, etc.
- Multi-resolution caching: thumbnail (512x512), medium (2048x2048), full tiles
- Cache invalidation: Hash-based keys with LRU eviction
- Background tile generation after initial display

### 3. Data Model Complexity

The application manages **78 different geological feature types** including:
- Microstructures: grains, fractures, fabrics, veins, folds
- Analytical data: SEM, TEM, EBSD, optical microscopy metadata
- Hierarchical organization: Project → Dataset → Sample → Micrograph → Spot

Refer to `docs/FEATURE_INVENTORY.md` for complete feature list and `docs/PRD.md` sections 4-5 for detailed requirements.

## Project File Format

Projects are saved as `.smz` files (ZIP archives containing):
- JSON data structure with all metadata
- Original TIFF images
- Cached tiles (optionally bundled)
- Export artifacts (PDFs, CSV data)

**Critical**: Must maintain backward compatibility with JavaFX `.smz` format for migration.

## Development Approach

Follow the incremental build strategy outlined in `docs/build_strategy.txt`:

### Phase 0: Validation (2 weeks)
Build throwaway prototypes to validate:
- TIFF decoding with `sharp` library
- Konva.js performance with large images
- Spatial registration algorithm portability

### Phase 1: Walking Skeleton (2 weeks)
Minimal end-to-end app:
- Create project, add ONE micrograph, draw ONE polygon, save to `.smz`
- Proves architecture works before building full feature set

### Phase 2+: Incremental Feature Development
Refer to PRD Section 9 for detailed timeline (32-46 weeks total)

**Key Principle**: Do NOT attempt to build all 103 features at once. Start with core image viewing + basic drawing tools, then iterate.

## UI Architecture

### Main Application Layout (from PRD Section 6.2.1)

Three-pane layout:
- **Left pane (narrow)**: Sample tree navigation - hierarchical view of Project → Dataset → Sample → Micrograph
- **Center pane (main)**: Canvas viewer - Konva.js stage for image display and annotation
- **Right pane (narrow)**: Properties panel - metadata editors for selected features

Reference screenshot: `docs/screenshots/legacy_main_interface.png`

### Technology Stack (from PRD Section 5)

**Main Process (Node.js)**:
- File I/O: .smz ZIP reading/writing
- Image processing: `sharp` for TIFF decoding, tile generation
- Database: SQLite for minerals/lithology reference data
- API: REST client for StraboSpot.org integration

**Renderer Process (Browser)**:
- Framework: React + TypeScript
- Canvas: Konva.js for image rendering and drawing tools
- State: Zustand for global state management
- UI: Modern component library (TBD - see PRD Section 5.1)

**IPC Communication**: Main ↔ Renderer via Electron contextBridge preload script

## Critical Implementation Notes

### Image Rendering Performance

From `docs/overlay-strategy-discussion.md`:
- NEVER tile all 50 images simultaneously (memory explosion)
- Only the focused image gets full tiling
- Use screen coverage calculation to determine render mode dynamically
- Aggressive viewport culling for off-screen images
- Memory budget enforcement with LRU tile eviction

### Why NOT Java Patterns

Do NOT port JavaFX code line-by-line:
- JavaFX ObservableList → React state + Zustand stores
- FXML layouts → React components
- Controller monoliths → Modular service architecture
- Embrace JavaScript/TypeScript idioms, not Java patterns

### File Organization (When App is Built)

Future structure from `docs/build_strategy.txt`:
```
strabomicro-electron/
├── docs/              (requirements, architecture, epic breakdowns)
├── prototypes/        (throwaway spike code - keep separate)
├── electron/          (main process: services, handlers, utils)
├── src/               (renderer: components, store, services, types)
└── tests/             (unit, integration, e2e)
```

## Common Pitfalls to Avoid

From `docs/build_strategy.txt` Section 6:

1. **DO NOT** try to match JavaFX UI pixel-for-pixel - use this as opportunity to improve UX
2. **DO NOT** translate Java to TypeScript verbatim - rethink patterns for web technologies
3. **DO NOT** implement all 78 feature type editors on day one - build top 10 most-used first
4. **DO NOT** aim for perfection - ship "good enough" MVP and iterate with user feedback

## External Integration

**StraboSpot.org API** (from legacy code context):
- User authentication
- Project upload/download and sync
- Cloud backup and sharing
- Conflict resolution for collaborative editing

API details referenced in legacy Java code at `docs/legacy-java-code/src/main/java/org/strabospot/straboREST/`

## Current Project Status

See `docs/PROJECT_STATUS.md` for the current state. As of last update:
- **Phase**: Initial setup
- **Goal**: Create simple Electron app with three-pane layout
- **Reference**: PRD Section 6.2.1 Main Application Layout
- **Screenshot**: `docs/screenshots/legacy_main_interface.png`

No code has been written yet - start with Electron boilerplate setup.

## Key Documentation Files

- `docs/PRD.md` - Complete product requirements (comprehensive, 41K+ tokens)
- `docs/FEATURE_INVENTORY.md` - All 103 features from legacy app
- `docs/build_strategy.txt` - Incremental development approach and roadmap
- `docs/overlay-strategy-discussion.md` - Multi-image overlay rendering solution
- `docs/tile-cache-discussion.md` - Tile caching architecture
- `docs/legacy-java-code/` - Original JavaFX implementation for reference
