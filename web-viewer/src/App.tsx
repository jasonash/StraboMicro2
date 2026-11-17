/**
 * StraboMicro Web Viewer — Main Application
 *
 * Read-only viewer for StraboMicro2 projects.
 * Loads project.json from the server and displays micrographs with tile-based rendering.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Typography, Tabs, Tab, List, ListItemButton, ListItemText } from '@mui/material';
import { TiledViewer } from './components/TiledViewer';
import { PropertiesPanel } from './components/PropertiesPanel';
import { ProjectTree } from './components/ProjectTree';
import { GroupsPanel } from './components/GroupsPanel';
import { Header } from './components/Header';
import { BreadcrumbsBar } from './components/BreadcrumbsBar';
import { SpotsPanel } from './components/SpotsPanel';
import { Footer } from './components/Footer';
import { HttpTileLoader } from './services/tileLoader';
import { readViewerConfig, viewerLinks } from './config/viewerConfig';
import { fileExists } from './services/fileExists';
import type { ProjectMetadata, MicrographMetadata, SampleMetadata, Spot } from './types/project-types';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Server build: ?base= and ?p= from the address. Standalone build
// (vite --mode standalone): the deployer's config.js plus ?p=.
// See src/config/viewerConfig.ts.
const getViewerConfig = () => readViewerConfig(
  import.meta.env.MODE === 'standalone' ? 'standalone' : 'server',
  window.location.search,
  window.StraboMicroViewerConfig,
);

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
  const [sidebarTab, setSidebarTab] = useState(0);

  const [hasPdf, setHasPdf] = useState(false);

  const config = useMemo(() => getViewerConfig(), []);
  const { projectId, baseUrl } = config;

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

  // Child micrographs (overlays) for the active micrograph
  const childMicrographs = useMemo(() => {
    if (!activeMicrographId) return [];
    return allMicrographs.filter(m => m.parentID === activeMicrographId);
  }, [activeMicrographId, allMicrographs]);

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
      setError(new URLSearchParams(window.location.search).get('p')
        ? 'This project id is not valid. Use ?p=<projectId> in the URL.'
        : 'No project ID provided. Use ?p=<projectId> in the URL.');
      return;
    }

    // Standalone: offer project.pdf only when the folder has one (v1 local
    // saves and failed v2 PDF steps have none)
    if (config.mode === 'standalone' && config.showPdfLink) {
      fileExists(`${baseUrl}/${projectId}/project.pdf`).then(setHasPdf);
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
  }, [projectId, baseUrl, config]);

  const links = useMemo(
    () => (projectId ? viewerLinks(config, projectId, hasPdf) : null),
    [config, projectId, hasPdf],
  );

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
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
        <Typography sx={{
          color: 'text.secondary'
        }}>{error}</Typography>
      </Box>
    );
  }

  if (!project || !tileLoader || !links) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
        <Typography sx={{
          color: 'text.secondary'
        }}>Loading project...</Typography>
      </Box>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <Header projectName={project.name} links={links} showLogo={config.showHeader} />

      {/* Main content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{
          width: 240,
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Tabs
            value={sidebarTab}
            onChange={(_, v) => setSidebarTab(v)}
            variant="fullWidth"
            sx={{
              minHeight: 32,
              borderBottom: 1,
              borderColor: 'divider',
              '& .MuiTab-root': {
                minHeight: 32,
                py: 0.5,
                px: 0.5,
                fontSize: '0.7rem',
                fontWeight: 600,
                minWidth: 0,
              },
              '& .MuiTabs-indicator': {
                backgroundColor: 'primary.main',
              },
            }}
          >
            <Tab label="Samples" disableRipple />
            <Tab label="Groups" disableRipple />
            <Tab label="Spots" disableRipple />
            <Tab label="Tags" disableRipple />
          </Tabs>

          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {/* Samples tab */}
            {sidebarTab === 0 && (
              <ProjectTree
                project={project}
                allMicrographs={allMicrographs}
                activeMicrographId={activeMicrographId}
                tileLoader={tileLoader}
                onSelectMicrograph={handleSelectMicrograph}
              />
            )}

            {/* Groups tab */}
            {sidebarTab === 1 && (
              <GroupsPanel
                project={project}
                allMicrographs={allMicrographs}
                activeMicrographId={activeMicrographId}
                tileLoader={tileLoader}
                onSelectMicrograph={handleSelectMicrograph}
              />
            )}

            {/* Spots tab */}
            {sidebarTab === 2 && (
              <SpotsPanel
                project={project}
                onSpotClick={(spot, micrographId) => {
                  setActiveMicrographId(micrographId);
                  setSelectedSpot(spot);
                }}
              />
            )}

            {/* Tags tab */}
            {sidebarTab === 3 && (
              <Box sx={{ p: 1 }}>
                {(project.tags || []).length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      p: 1
                    }}>No tags</Typography>
                ) : (
                  <List dense disablePadding>
                    {(project.tags || []).map(tag => (
                      <ListItemButton key={tag.id} sx={{ borderRadius: 1, py: 0.5 }}>
                        <ListItemText primary={tag.name} slotProps={{
                          primary: { variant: 'body2' }
                        }} />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Canvas area */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <BreadcrumbsBar
            micrograph={activeMicrograph}
            allMicrographs={allMicrographs}
            selectedSpotName={selectedSpot?.name}
            onNavigate={handleSelectMicrograph}
          />
          <Box sx={{ flex: 1, position: 'relative' }}>
            <TiledViewer
              micrographId={activeMicrographId}
              spots={activeSpots}
              sketchLayers={activeMicrograph?.sketchLayers}
              scalePixelsPerCentimeter={activeMicrograph?.scalePixelsPerCentimeter}
              childMicrographs={childMicrographs}
              imageWidth={activeMicrograph?.width || activeMicrograph?.imageWidth}
              imageHeight={activeMicrograph?.height || activeMicrograph?.imageHeight}
              selectedSpotId={selectedSpot?.id || null}
              tileLoader={tileLoader}
              onSpotClick={handleSpotClick}
              onCanvasClick={() => setSelectedSpot(null)}
              onOverlayClick={handleSelectMicrograph}
            />
          </Box>
        </Box>

        {/* Right panel — properties */}
        <Box sx={{
          width: 300,
          bgcolor: 'background.paper',
          borderLeft: 1,
          borderColor: 'divider',
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
            onSelectSpot={handleSpotClick}
          />
        </Box>
      </Box>

      {config.showFooter && <Footer appDownloadUrl={links.appDownload} />}
    </Box>
  );
}

