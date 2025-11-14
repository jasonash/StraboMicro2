# StraboMicro Store Usage Guide

This directory contains the Zustand store implementation for StraboMicro.

## Files

- **`useAppStore.ts`** - Main Zustand store with all state and actions
- **`helpers.ts`** - Helper functions for traversing and updating nested data
- **`index.ts`** - Barrel export for easy imports

## Quick Start

### Basic Usage

```typescript
import { useAppStore } from '@/store';

function MyComponent() {
  // Select specific state (component only re-renders when this changes)
  const project = useAppStore(state => state.project);
  const isDirty = useAppStore(state => state.isDirty);

  // Select actions
  const loadProject = useAppStore(state => state.loadProject);
  const markDirty = useAppStore(state => state.markDirty);

  return (
    <div>
      <h1>{project?.name || 'No project loaded'}</h1>
      {isDirty && <span>*</span>}
    </div>
  );
}
```

### Optimized Selectors

Only select what you need to minimize re-renders:

```typescript
// ❌ BAD - Component re-renders on ANY state change
const state = useAppStore();

// ✅ GOOD - Component only re-renders when zoom changes
const zoom = useAppStore(state => state.zoom);

// ✅ GOOD - Multiple selections (re-renders when either changes)
const { zoom, pan } = useAppStore(state => ({
  zoom: state.zoom,
  pan: state.pan
}));
```

## State Categories

### 1. Project State

```typescript
const project = useAppStore(state => state.project);
const projectFilePath = useAppStore(state => state.projectFilePath);
const isDirty = useAppStore(state => state.isDirty);
```

### 2. Navigation State

```typescript
const activeDatasetId = useAppStore(state => state.activeDatasetId);
const activeSampleId = useAppStore(state => state.activeSampleId);
const activeMicrographId = useAppStore(state => state.activeMicrographId);
```

### 3. Selection State

```typescript
const selectedSpotIds = useAppStore(state => state.selectedSpotIds);
```

### 4. Viewer State

```typescript
const activeTool = useAppStore(state => state.activeTool);
const zoom = useAppStore(state => state.zoom);
const pan = useAppStore(state => state.pan);
const showSpotLabels = useAppStore(state => state.showSpotLabels);
```

### 5. UI Preferences (Persisted)

```typescript
const sidebarTab = useAppStore(state => state.sidebarTab);
const detailsPanelOpen = useAppStore(state => state.detailsPanelOpen);
```

## Common Patterns

### Loading a Project

```typescript
import { useAppStore } from '@/store';

function FileMenu() {
  const loadProject = useAppStore(state => state.loadProject);

  const handleOpenProject = async () => {
    const filePath = await electron.openFileDialog({ extension: '.smz' });
    const projectData = await electron.loadProjectFile(filePath);

    loadProject(projectData, filePath);
  };

  return <button onClick={handleOpenProject}>Open Project</button>;
}
```

### Creating a New Dataset

```typescript
import { useAppStore } from '@/store';
import { randomUUID } from 'crypto';

function NewDatasetButton() {
  const addDataset = useAppStore(state => state.addDataset);

  const handleClick = () => {
    const newDataset = {
      id: randomUUID(),
      name: 'New Dataset',
      samples: [],
    };

    addDataset(newDataset);
  };

  return <button onClick={handleClick}>New Dataset</button>;
}
```

### Adding a Spot

```typescript
import { useAppStore } from '@/store';
import { randomUUID } from 'crypto';

function DrawingCanvas() {
  const activeMicrographId = useAppStore(state => state.activeMicrographId);
  const addSpot = useAppStore(state => state.addSpot);

  const handleDrawComplete = (geometry: Geometry) => {
    if (!activeMicrographId) return;

    const newSpot = {
      id: randomUUID(),
      name: 'New Spot',
      geometry,
      notes: '',
    };

    addSpot(activeMicrographId, newSpot);
  };

  // ... canvas drawing logic
}
```

### Updating Spot Properties

```typescript
import { useAppStore } from '@/store';

function SpotEditor({ spotId }: { spotId: string }) {
  const updateSpot = useAppStore(state => state.updateSpotData);
  const spot = useAppStore(state => state.spotIndex.get(spotId));

  const handleNameChange = (name: string) => {
    updateSpot(spotId, { name });
  };

  return (
    <input
      value={spot?.name || ''}
      onChange={(e) => handleNameChange(e.target.value)}
    />
  );
}
```

### Multi-Selection

```typescript
import { useAppStore } from '@/store';

function SpotList() {
  const selectedSpotIds = useAppStore(state => state.selectedSpotIds);
  const selectSpot = useAppStore(state => state.selectSpot);

  const handleSpotClick = (spotId: string, ctrlKey: boolean) => {
    selectSpot(spotId, ctrlKey); // Multi-select if Ctrl pressed
  };

  // ... render spot list
}
```

### Checking if Project is Dirty

```typescript
import { useAppStore } from '@/store';

function SaveButton() {
  const isDirty = useAppStore(state => state.isDirty);
  const saveProject = useAppStore(state => state.saveProject);

  return (
    <button
      onClick={saveProject}
      disabled={!isDirty}
    >
      Save {isDirty && '*'}
    </button>
  );
}
```

## Using Helper Functions

### Finding Entities by ID

```typescript
import { findMicrographById } from '@/store';

function MicrographViewer() {
  const project = useAppStore(state => state.project);
  const activeMicrographId = useAppStore(state => state.activeMicrographId);

  // Helper function finds micrograph in nested hierarchy
  const activeMicrograph = findMicrographById(project, activeMicrographId);

  if (!activeMicrograph) return <div>No micrograph selected</div>;

  return <div>{activeMicrograph.name}</div>;
}
```

### Using Indexes for Performance

```typescript
import { useAppStore } from '@/store';

function SpotProperties({ spotId }: { spotId: string }) {
  // Fast lookup via index (no nested loops)
  const spot = useAppStore(state => state.spotIndex.get(spotId));

  if (!spot) return null;

  return <div>{spot.name}</div>;
}
```

### Getting Child Micrographs

```typescript
import { getChildMicrographs } from '@/store';

function MicrographOverlays({ parentId }: { parentId: string }) {
  const project = useAppStore(state => state.project);

  const children = getChildMicrographs(project, parentId);

  return (
    <ul>
      {children.map(child => (
        <li key={child.id}>{child.name}</li>
      ))}
    </ul>
  );
}
```

## Undo/Redo

```typescript
import { useTemporalStore } from '@/store';

function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo } = useTemporalStore();

  return (
    <>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </>
  );
}
```

## DevTools

The store includes Redux DevTools support. Install the browser extension:

- **Chrome:** [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)
- **Firefox:** [Redux DevTools](https://addons.mozilla.org/en-US/firefox/addon/reduxdevtools/)

Open DevTools → Redux tab to see:
- Current state
- Action history
- Time-travel debugging
- State diffs

## Persistence

UI preferences are automatically persisted to localStorage:
- `sidebarTab`
- `detailsPanelOpen`
- `showSpotLabels`
- `showMicrographOutlines`
- `spotOverlayOpacity`

**Note:** Project data is NOT persisted to localStorage (too large). Projects are saved/loaded via `.smz` files.

## Performance Tips

### 1. Use Shallow Selectors

```typescript
// ❌ BAD - Deep equality check on every render
const project = useAppStore(state => state.project);

// ✅ GOOD - Only re-render when specific field changes
const projectName = useAppStore(state => state.project?.name);
```

### 2. Use Indexes for Lookups

```typescript
// ❌ BAD - Loops through entire hierarchy
const spot = findSpotById(project, spotId);

// ✅ GOOD - O(1) lookup via index
const spot = useAppStore(state => state.spotIndex.get(spotId));
```

### 3. Combine Related Selections

```typescript
// ❌ BAD - Three separate subscriptions
const zoom = useAppStore(state => state.zoom);
const pan = useAppStore(state => state.pan);
const tool = useAppStore(state => state.activeTool);

// ✅ GOOD - Single subscription
const viewerState = useAppStore(state => ({
  zoom: state.zoom,
  pan: state.pan,
  tool: state.activeTool,
}));
```

### 4. Keep Transient State Local

For high-frequency updates (e.g., mouse position during drawing), use local React state:

```typescript
function DrawingCanvas() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const addSpot = useAppStore(state => state.addSpot);

  // Mouse position doesn't go in Zustand (updated 60+ times/sec)
  const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });

  // Only save to Zustand when drawing is complete
  const handleMouseUp = () => {
    const spot = createSpotFromPath(/* ... */);
    addSpot(activeMicrographId, spot);
  };
}
```

## Testing

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@/store';

describe('useAppStore', () => {
  it('should load a project', () => {
    const { result } = renderHook(() => useAppStore());

    const mockProject = {
      id: '123',
      name: 'Test Project',
      datasets: [],
    };

    act(() => {
      result.current.loadProject(mockProject, '/path/to/project.smz');
    });

    expect(result.current.project).toEqual(mockProject);
    expect(result.current.projectFilePath).toBe('/path/to/project.smz');
    expect(result.current.isDirty).toBe(false);
  });

  it('should mark project as dirty when adding a spot', () => {
    const { result } = renderHook(() => useAppStore());

    // ... load project with micrograph

    act(() => {
      result.current.addSpot('micrograph-id', {
        id: 'spot-1',
        name: 'Test Spot'
      });
    });

    expect(result.current.isDirty).toBe(true);
  });
});
```

## Migration from Legacy Java

The legacy JavaFX app loaded/saved the entire project on every operation:

```java
// OLD: Every operation hit disk
public static void saveNewSpot(SpotMetadataType spot, String currentMicrographId) {
    ProjectMetadataType currentProject = straboMicroUtil.getCurrentProject(); // Load from disk!
    // ... modify
    straboMicroUtil.saveProjectToFile(currentProject); // Save to disk!
}
```

**New Zustand approach:**
- Project lives in memory (fast updates)
- Save to disk only on explicit "Save" or auto-save timer
- All CRUD operations update in-memory state immediately

```typescript
// NEW: In-memory updates
const addSpot = useAppStore(state => state.addSpot);
addSpot(micrographId, spot); // Instant, no disk I/O

// Save to disk only when needed
const saveProject = useAppStore(state => state.saveProject);
saveProject(); // Single save operation
```

## Next Steps

- [ ] Implement Electron IPC for file save/load
- [ ] Add auto-save timer
- [ ] Implement Groups and Tags CRUD
- [ ] Add feature collection helpers (GrainInfo, Mineralogy, etc.)
- [ ] Implement search/filter functions
