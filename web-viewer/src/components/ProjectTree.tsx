/**
 * ProjectTree — Hierarchical project navigation
 *
 * Displays Dataset → Sample → Micrograph tree with composite thumbnails,
 * collapse/expand, and active highlighting. Read-only (no drag-drop, context menus).
 * Built from scratch — the desktop version (1986 lines) is too editing-heavy to adapt.
 */

import { useState, useEffect, useMemo } from 'react';
import { colors, fonts } from '../styles/theme';
import { HttpTileLoader } from '../services/tileLoader';
import type { ProjectMetadata, DatasetMetadata, SampleMetadata, MicrographMetadata } from '../types/project-types';

interface ProjectTreeProps {
  project: ProjectMetadata;
  allMicrographs: MicrographMetadata[];
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}

export function ProjectTree({
  project,
  allMicrographs,
  activeMicrographId,
  tileLoader,
  onSelectMicrograph,
}: ProjectTreeProps) {
  return (
    <div style={{ padding: '0' }}>
      {(project.datasets || []).map(dataset => (
        <DatasetNode
          key={dataset.id}
          dataset={dataset}
          allMicrographs={allMicrographs}
          activeMicrographId={activeMicrographId}
          tileLoader={tileLoader}
          onSelectMicrograph={onSelectMicrograph}
        />
      ))}
    </div>
  );
}

// ============================================================================
// DATASET NODE
// ============================================================================

function DatasetNode({
  dataset,
  allMicrographs,
  activeMicrographId,
  tileLoader,
  onSelectMicrograph,
}: {
  dataset: DatasetMetadata;
  allMicrographs: MicrographMetadata[];
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}) {
  const samples = dataset.samples || [];

  // If only one dataset, skip the dataset header
  return (
    <div>
      {samples.map(sample => (
        <SampleNode
          key={sample.id}
          sample={sample}
          allMicrographs={allMicrographs}
          activeMicrographId={activeMicrographId}
          tileLoader={tileLoader}
          onSelectMicrograph={onSelectMicrograph}
        />
      ))}
    </div>
  );
}

// ============================================================================
// SAMPLE NODE
// ============================================================================

function SampleNode({
  sample,
  allMicrographs,
  activeMicrographId,
  tileLoader,
  onSelectMicrograph,
}: {
  sample: SampleMetadata;
  allMicrographs: MicrographMetadata[];
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Root micrographs belonging to this sample (no parent)
  const rootMicrographs = useMemo(() => {
    const sampleMicroIds = new Set((sample.micrographs || []).map(m => m.id));
    return allMicrographs.filter(m => sampleMicroIds.has(m.id) && !m.parentID);
  }, [sample, allMicrographs]);

  const micrographCount = (sample.micrographs || []).length;

  return (
    <div>
      {/* Sample header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '6px 8px',
          fontSize: fonts.sizeBase,
          fontWeight: 'bold',
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          backgroundColor: colors.bgDark,
          borderBottom: `1px solid ${colors.border}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: '9px',
          transition: 'transform 0.15s',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          &#9654;
        </span>
        <span style={{ flex: 1 }}>{sample.label || sample.name}</span>
        <span style={{
          fontSize: fonts.sizeXs,
          color: colors.textDim,
          fontWeight: 'normal',
          textTransform: 'none',
        }}>
          {micrographCount}
        </span>
      </div>

      {/* Micrographs */}
      {isExpanded && rootMicrographs.map(micro => (
        <MicrographNode
          key={micro.id}
          micrograph={micro}
          allMicrographs={allMicrographs}
          depth={0}
          activeMicrographId={activeMicrographId}
          tileLoader={tileLoader}
          onSelectMicrograph={onSelectMicrograph}
        />
      ))}
    </div>
  );
}

// ============================================================================
// MICROGRAPH NODE (recursive)
// ============================================================================

function MicrographNode({
  micrograph,
  allMicrographs,
  depth,
  activeMicrographId,
  tileLoader,
  onSelectMicrograph,
}: {
  micrograph: MicrographMetadata;
  allMicrographs: MicrographMetadata[];
  depth: number;
  activeMicrographId: string | null;
  tileLoader: HttpTileLoader;
  onSelectMicrograph: (id: string) => void;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(true);

  const children = useMemo(
    () => allMicrographs.filter(m => m.parentID === micrograph.id),
    [micrograph.id, allMicrographs]
  );

  const isActive = micrograph.id === activeMicrographId;
  const hasChildren = children.length > 0;

  useEffect(() => {
    tileLoader.loadCompositeThumbnail(micrograph.id).then(setThumbnailUrl);
  }, [micrograph.id, tileLoader]);

  return (
    <div>
      <div
        onClick={() => onSelectMicrograph(micrograph.id)}
        style={{
          paddingLeft: `${8 + depth * 16}px`,
          paddingRight: '8px',
          paddingTop: '4px',
          paddingBottom: '4px',
          cursor: 'pointer',
          backgroundColor: isActive ? colors.bgActive : 'transparent',
          borderLeft: isActive ? `3px solid ${colors.accent}` : '3px solid transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Expand/collapse for items with children */}
          {hasChildren && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              style={{
                fontSize: '9px',
                cursor: 'pointer',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
                color: colors.textMuted,
                padding: '2px',
              }}
            >
              &#9654;
            </span>
          )}
          {!hasChildren && <span style={{ width: '13px' }} />}

          <span style={{
            fontWeight: isActive ? 'bold' : 'normal',
            fontSize: fonts.sizeBase,
            color: isActive ? colors.textPrimary : colors.textSecondary,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {micrograph.name}
          </span>

          {hasChildren && (
            <span style={{ fontSize: fonts.sizeXs, color: colors.textDim }}>
              {children.length}
            </span>
          )}
        </div>

        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={micrograph.name}
            style={{
              width: `${Math.max(60, 160 - depth * 20)}px`,
              height: 'auto',
              borderRadius: '3px',
              border: isActive ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
              marginTop: '3px',
              marginLeft: hasChildren ? '19px' : '13px',
              display: 'block',
            }}
          />
        )}
      </div>

      {/* Children */}
      {isExpanded && children.map(child => (
        <MicrographNode
          key={child.id}
          micrograph={child}
          allMicrographs={allMicrographs}
          depth={depth + 1}
          activeMicrographId={activeMicrographId}
          tileLoader={tileLoader}
          onSelectMicrograph={onSelectMicrograph}
        />
      ))}
    </div>
  );
}
