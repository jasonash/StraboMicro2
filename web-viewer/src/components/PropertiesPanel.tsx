/**
 * PropertiesPanel — Right-side panel with tabbed metadata display
 *
 * Shows micrograph/spot metadata, StraboTools results, and project info.
 * Read-only adaptation of the desktop app's PropertiesPanel.
 */

import { useState, useMemo } from 'react';
import { Tabs } from './ui/Tabs';
import { StatRow } from './ui/StatRow';
import { CollapsibleSection } from './ui/CollapsibleSection';
import { MetadataSummary } from './MetadataSummary';
import { StraboToolsSummary } from './StraboToolsSummary';
import { colors, fonts } from '../styles/theme';
import type {
  ProjectMetadata,
  MicrographMetadata,
  SampleMetadata,
  Spot,
} from '../types/project-types';

interface PropertiesPanelProps {
  project: ProjectMetadata;
  micrograph: MicrographMetadata | null;
  spot: Spot | null;
  sample: SampleMetadata | null;
  allMicrographs: MicrographMetadata[];
  onDeselectSpot: () => void;
}

export function PropertiesPanel({
  project,
  micrograph,
  spot,
  sample,
  onDeselectSpot,
}: PropertiesPanelProps) {
  const isMicrograph = micrograph != null && spot == null;

  // Build tab list
  const tabs = useMemo(() => {
    const t = [{ label: spot ? 'Spot' : 'Micrograph', key: 'data' }];
    if (micrograph?.sketchLayers && micrograph.sketchLayers.length > 0 && !spot) {
      t.push({ label: 'Sketches', key: 'sketches' });
    }
    t.push({ label: 'Project', key: 'project' });
    return t;
  }, [micrograph, spot]);

  const [activeTab, setActiveTab] = useState('data');

  // Reset to data tab when selection changes
  const tabKey = spot?.id || micrograph?.id || 'none';
  const [prevTabKey, setPrevTabKey] = useState(tabKey);
  if (tabKey !== prevTabKey) {
    setPrevTabKey(tabKey);
    if (activeTab !== 'data' && activeTab !== 'project') {
      setActiveTab('data');
    }
  }

  if (!micrograph) {
    return (
      <div style={{
        padding: '16px',
        color: colors.textMuted,
        fontSize: fonts.sizeBase,
        fontStyle: 'italic',
      }}>
        Select a micrograph to view details
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ============ Data Tab ============ */}
        {activeTab === 'data' && (
          <>
            {/* Spot header with close button */}
            {spot && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                borderBottom: `1px solid ${colors.border}`,
                gap: '8px',
              }}>
                <span style={{
                  fontSize: fonts.sizeLg,
                  fontWeight: 'bold',
                  color: colors.textPrimary,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {spot.name}
                </span>
                <button
                  onClick={onDeselectSpot}
                  style={{
                    background: 'none',
                    border: `1px solid ${colors.border}`,
                    color: colors.textMuted,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: fonts.sizeSm,
                  }}
                >
                  Close
                </button>
              </div>
            )}

            <MetadataSummary
              micrograph={spot ? null : micrograph}
              spot={spot}
              sample={sample}
              isMicrograph={isMicrograph}
            />

            {/* StraboTools Summary (micrograph only) */}
            {isMicrograph && micrograph.straboTools && (
              <StraboToolsSummary straboTools={micrograph.straboTools} />
            )}
          </>
        )}

        {/* ============ Sketches Tab ============ */}
        {activeTab === 'sketches' && micrograph?.sketchLayers && (
          <div style={{ padding: '8px' }}>
            <div style={{
              fontSize: fonts.sizeSm,
              color: colors.textMuted,
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Sketch Layers ({micrograph.sketchLayers.length})
            </div>
            {micrograph.sketchLayers.map(layer => (
              <div key={layer.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '4px',
                backgroundColor: layer.visible ? 'transparent' : colors.bgDark,
                opacity: layer.visible ? 1 : 0.5,
              }}>
                <span style={{
                  fontSize: fonts.sizeSm,
                  color: layer.visible ? colors.textSecondary : colors.textMuted,
                }}>
                  {layer.visible ? '\u{1F441}' : '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}'}
                </span>
                <span style={{
                  fontSize: fonts.sizeBase,
                  color: colors.textSecondary,
                  flex: 1,
                }}>
                  {layer.name}
                </span>
                <span style={{ fontSize: fonts.sizeXs, color: colors.textMuted }}>
                  {layer.strokes.length + layer.textItems.length} items
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ============ Project Tab ============ */}
        {activeTab === 'project' && (
          <div style={{ padding: '4px 0' }}>
            <CollapsibleSection title="Project Info" defaultOpen>
              <StatRow label="Name" value={project.name} />
              <StatRow label="Description" value={project.description} />
              <StatRow label="Owner" value={project.owner} />
              <StatRow label="Affiliation" value={project.ownerAffiliation} />
              <StatRow label="PI" value={project.principalInvestigator} />
              <StatRow label="Grant" value={project.grantNumber} />
              <StatRow label="Funding" value={project.fundingSource} />
              <StatRow label="Purpose" value={project.purposeOfStudy} />
              <StatRow label="Area of Interest" value={project.areaOfInterest} />
              <StatRow label="Instruments" value={project.instrumentsUsed} />
              <StatRow label="Team Members" value={project.otherTeamMembers} />
              <StatRow label="Start Date" value={project.startDate} />
              <StatRow label="End Date" value={project.endDate} />
              <StatRow label="Notes" value={project.notes} />
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}
