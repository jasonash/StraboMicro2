/**
 * StraboMicro Web Viewer — Main Application
 *
 * Read-only viewer for StraboMicro2 projects.
 * Loads project.json from the server and displays micrographs with tile-based rendering.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { TiledViewer } from './components/TiledViewer';
import { HttpTileLoader } from './services/tileLoader';
import type { ProjectMetadata, MicrographMetadata, Spot } from './types/project-types';

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

// ============================================================================
// SIDEBAR MICROGRAPH ITEM
// ============================================================================

interface SidebarItemProps {
  micrograph: MicrographMetadata;
  allMicrographs: MicrographMetadata[];
  depth: number;
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelect: (id: string) => void;
}

function SidebarItem({ micrograph, allMicrographs, depth, activeMicrographId, tileLoader, onSelect }: SidebarItemProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const children = useMemo(() => getChildren(micrograph.id, allMicrographs), [micrograph.id, allMicrographs]);
  const isActive = micrograph.id === activeMicrographId;

  useEffect(() => {
    tileLoader.loadCompositeThumbnail(micrograph.id).then(setThumbnailUrl);
  }, [micrograph.id, tileLoader]);

  return (
    <>
      <div
        onClick={() => onSelect(micrograph.id)}
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          paddingTop: '4px',
          paddingBottom: '4px',
          cursor: 'pointer',
          backgroundColor: isActive ? '#2a4a7f' : 'transparent',
          borderLeft: isActive ? '3px solid #5b9aff' : '3px solid transparent',
        }}
      >
        <div style={{
          fontWeight: 'bold',
          fontSize: '12px',
          color: isActive ? '#fff' : '#ccc',
          marginBottom: '2px',
        }}>
          {micrograph.name}
        </div>
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={micrograph.name}
            style={{
              width: `${Math.max(80, 180 - depth * 20)}px`,
              height: 'auto',
              borderRadius: '3px',
              border: isActive ? '2px solid #5b9aff' : '1px solid #444',
            }}
          />
        )}
      </div>
      {children.map(child => (
        <SidebarItem
          key={child.id}
          micrograph={child}
          allMicrographs={allMicrographs}
          depth={depth + 1}
          activeMicrographId={activeMicrographId}
          tileLoader={tileLoader}
          onSelect={onSelect}
        />
      ))}
    </>
  );
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

  // Root micrographs (no parent)
  const rootMicrographs = useMemo(() => {
    return allMicrographs.filter(m => !m.parentID);
  }, [allMicrographs]);

  // Active micrograph data
  const activeMicrograph = useMemo(() => {
    if (!activeMicrographId) return null;
    return allMicrographs.find(m => m.id === activeMicrographId) || null;
  }, [activeMicrographId, allMicrographs]);

  // Spots for active micrograph
  const activeSpots = useMemo(() => {
    return activeMicrograph?.spots || [];
  }, [activeMicrograph]);

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
      <div style={{
        height: '48px',
        backgroundColor: '#16213e',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid #333',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>StraboMicro</span>
        <span style={{ margin: '0 12px', color: '#666' }}>|</span>
        <span style={{ fontSize: '14px', color: '#aaa' }}>{project.name}</span>
        <div style={{ flex: 1 }} />
        {tileLoader && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <a href={tileLoader.getPdfUrl()} target="_blank" rel="noopener noreferrer"
              style={{ color: '#5b9aff', textDecoration: 'none', fontSize: '13px' }}>
              Download PDF
            </a>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: '220px',
          backgroundColor: '#1a1a2e',
          borderRight: '1px solid #333',
          overflowY: 'auto',
          flexShrink: 0,
        }}>
          {/* Sample labels and micrographs */}
          {(project.datasets || []).map(dataset => (
            (dataset.samples || []).map(sample => (
              <div key={sample.id}>
                <div style={{
                  padding: '8px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#888',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  backgroundColor: '#111',
                  borderBottom: '1px solid #333',
                }}>
                  {sample.label || sample.name}
                </div>
                {rootMicrographs
                  .filter(m => (sample.micrographs || []).some(sm => sm.id === m.id))
                  .map(micro => (
                    <SidebarItem
                      key={micro.id}
                      micrograph={micro}
                      allMicrographs={allMicrographs}
                      depth={0}
                      activeMicrographId={activeMicrographId}
                      tileLoader={tileLoader}
                      onSelect={handleSelectMicrograph}
                    />
                  ))
                }
              </div>
            ))
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1 }}>
          <TiledViewer
            micrographId={activeMicrographId}
            spots={activeSpots}
            tileLoader={tileLoader}
            onSpotClick={handleSpotClick}
          />
        </div>

        {/* Right panel — spot details */}
        {selectedSpot && (
          <div style={{
            width: '280px',
            backgroundColor: '#1a1a2e',
            borderLeft: '1px solid #333',
            overflowY: 'auto',
            padding: '12px',
            color: '#ccc',
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: '1px solid #333',
            }}>
              Spot: {selectedSpot.name}
            </div>
            <DetailRow label="Type" value={selectedSpot.geometryType || selectedSpot.geometry?.type} />
            {selectedSpot.notes && <DetailRow label="Notes" value={selectedSpot.notes} />}
            {selectedSpot.date && <DetailRow label="Date" value={selectedSpot.date} />}
            <div style={{ marginTop: '16px' }}>
              <button
                onClick={() => setSelectedSpot(null)}
                style={{
                  background: 'none',
                  border: '1px solid #555',
                  color: '#aaa',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '6px', fontSize: '12px' }}>
      <span style={{ color: '#888' }}>{label}: </span>
      <span style={{ color: '#ddd' }}>{value}</span>
    </div>
  );
}
