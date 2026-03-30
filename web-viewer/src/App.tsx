/**
 * StraboMicro Web Viewer — Main Application
 *
 * Read-only viewer for StraboMicro2 projects.
 * Loads project.json from the server and displays micrographs with tile-based rendering.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TiledViewer } from './components/TiledViewer';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ProjectTree } from './components/ProjectTree';
import { Header } from './components/Header';
import { BreadcrumbsBar } from './components/BreadcrumbsBar';
import { HttpTileLoader } from './services/tileLoader';
import type { ProjectMetadata, MicrographMetadata, SampleMetadata, Spot } from './types/project-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Base URL for project files — configure for your server
// In development, Vite proxy or a local server can serve the files
const getBaseUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('base') || './smzFiles';
};

const getProjectId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('p') || null;
};

// ============================================================================
// HELPERS
// ============================================================================

/** Flatten all micrographs from project hierarchy */
function collectAllMicrographs(project: ProjectMetadata): MicrographMetadata[] {
  const micrographs: MicrographMetadata[] = [];
  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        micrographs.push(micro);
      }
    }
  }
  return micrographs;
}

/** Get children of a micrograph */
function getChildren(micrographId: string, allMicrographs: MicrographMetadata[]): MicrographMetadata[] {
  return allMicrographs.filter(m => m.parentID === micrographId);
}

/** Find the parent sample for a micrograph */
function findParentSample(project: ProjectMetadata, micrographId: string): SampleMetadata | null {
  for (const dataset of project.datasets || []) {
    for (const sample of dataset.samples || []) {
      for (const micro of sample.micrographs || []) {
        if (micro.id === micrographId) return sample;
      }
    }
  }
  return null;
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [project, setProject] = useState<ProjectMetadata | null>(null);
  const [activeMicrographId, setActiveMicrographId] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const projectId = useMemo(() => getProjectId(), []);
  const baseUrl = useMemo(() => getBaseUrl(), []);

  const tileLoader = useMemo(() => {
    if (!projectId) return null;
    return new HttpTileLoader(baseUrl, projectId);
  }, [baseUrl, projectId]);

  const allMicrographs = useMemo(() => {
    if (!project) return [];
    return collectAllMicrographs(project);
  }, [project]);

  // Active micrograph data
  const activeMicrograph = useMemo(() => {
    if (!activeMicrographId) return null;
    return allMicrographs.find(m => m.id === activeMicrographId) || null;
  }, [activeMicrographId, allMicrographs]);

  // Spots for active micrograph
  const activeSpots = useMemo(() => {
    return activeMicrograph?.spots || [];
  }, [activeMicrograph]);

  // Parent sample for active micrograph
  const activeSample = useMemo(() => {
    if (!project || !activeMicrographId) return null;
    // For child micrographs, find the root micrograph's sample
    let rootId = activeMicrographId;
    const micro = allMicrographs.find(m => m.id === rootId);
    if (micro?.parentID) {
      // Walk up to root
      let current = micro;
      while (current?.parentID) {
        const parent = allMicrographs.find(m => m.id === current!.parentID);
        if (!parent) break;
        current = parent;
      }
      rootId = current?.id || rootId;
    }
    return findParentSample(project, rootId);
  }, [project, activeMicrographId, allMicrographs]);

  // ============================================================================
  // LOAD PROJECT
  // ============================================================================

  useEffect(() => {
    if (!projectId) {
      setError('No project ID provided. Use ?p=<projectId> in the URL.');
      return;
    }

    const loadProject = async () => {
      try {
        const url = `${baseUrl}/${projectId}/project.json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load project: ${response.status}`);
        const data: ProjectMetadata = await response.json();
        setProject(data);

        // Auto-select first root micrograph
        const allMicros = collectAllMicrographs(data);
        const firstRoot = allMicros.find(m => !m.parentID);
        if (firstRoot) {
          setActiveMicrographId(firstRoot.id);
        }
      } catch (err) {
        setError(`Unable to load project ${projectId}.`);
        console.error(err);
      }
    };

    loadProject();
  }, [projectId, baseUrl]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelectMicrograph = useCallback((id: string) => {
    setActiveMicrographId(id);
    setSelectedSpot(null);
  }, []);

  const handleSpotClick = useCallback((spot: Spot) => {
    setSelectedSpot(spot);
  }, []);

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: '18px',
      }}>
        {error}
      </div>
    );
  }

  if (!project || !tileLoader) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        color: '#fff',
        fontFamily: 'sans-serif',
        fontSize: '18px',
      }}>
        Loading project...
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <Header projectName={project.name} tileLoader={tileLoader} />

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar — Project Tree */}
        <div style={{
          width: '220px',
          backgroundColor: '#1a1a2e',
          borderRight: '1px solid #333',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          <ProjectTree
            project={project}
            allMicrographs={allMicrographs}
            activeMicrographId={activeMicrographId}
            tileLoader={tileLoader}
            onSelectMicrograph={handleSelectMicrograph}
          />
        </div>

        {/* Canvas area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BreadcrumbsBar
            micrograph={activeMicrograph}
            allMicrographs={allMicrographs}
            selectedSpotName={selectedSpot?.name}
            onNavigate={handleSelectMicrograph}
          />
          <div style={{ flex: 1, position: 'relative' }}>
            <TiledViewer
              micrographId={activeMicrographId}
              spots={activeSpots}
              sketchLayers={activeMicrograph?.sketchLayers}
              scalePixelsPerCentimeter={activeMicrograph?.scalePixelsPerCentimeter}
              tileLoader={tileLoader}
              onSpotClick={handleSpotClick}
            />
          </div>
        </div>

        {/* Right panel — properties */}
        <div style={{
          width: '300px',
          backgroundColor: '#1a1a2e',
          borderLeft: '1px solid #333',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <PropertiesPanel
            project={project}
            micrograph={activeMicrograph}
            spot={selectedSpot}
            sample={activeSample}
            allMicrographs={allMicrographs}
            onDeselectSpot={() => setSelectedSpot(null)}
          />
        </div>
      </div>
    </div>
  );
}

