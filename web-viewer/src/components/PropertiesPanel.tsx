/**
 * PropertiesPanel — Right-side panel with tabbed metadata display
 * Uses MUI components matching the desktop app's styling.
 */

import { useState, useMemo } from 'react';
import { Box, Tab, Tabs, Typography, IconButton, Stack, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { MetadataSummary } from './MetadataSummary';
import { StraboToolsSummary } from './StraboToolsSummary';
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

  const tabLabels = useMemo(() => {
    const t = [spot ? 'SPOT' : 'MICROGRAPH'];
    if (micrograph?.sketchLayers && micrograph.sketchLayers.length > 0 && !spot) {
      t.push('SKETCHES');
    }
    t.push('PROJECT');
    return t;
  }, [micrograph, spot]);

  const [activeTab, setActiveTab] = useState(0);

  // Reset tab when selection changes
  const tabKey = spot?.id || micrograph?.id || 'none';
  const [prevTabKey, setPrevTabKey] = useState(tabKey);
  if (tabKey !== prevTabKey) {
    setPrevTabKey(tabKey);
    setActiveTab(0);
  }

  if (!micrograph) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Select a micrograph to view details
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: '0.75rem', fontWeight: 600 },
        }}
      >
        {tabLabels.map((label, i) => <Tab key={i} label={label} />)}
      </Tabs>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* ============ Data Tab ============ */}
        {activeTab === 0 && (
          <>
            {/* Spot header */}
            {spot && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                p: 1,
                borderBottom: 1,
                borderColor: 'divider',
              }}>
                <Typography variant="subtitle2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {spot.name}
                </Typography>
                <IconButton size="small" onClick={onDeselectSpot}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}

            {/* Collected Data header */}
            <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                Collected Data:
              </Typography>
            </Box>

            <MetadataSummary
              micrograph={spot ? null : micrograph}
              spot={spot}
              sample={sample}
              isMicrograph={isMicrograph}
            />

            {isMicrograph && micrograph.straboTools && (
              <StraboToolsSummary straboTools={micrograph.straboTools} />
            )}
          </>
        )}

        {/* ============ Sketches Tab ============ */}
        {tabLabels[activeTab] === 'SKETCHES' && micrograph?.sketchLayers && (
          <Box sx={{ p: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 600, letterSpacing: 0.5 }}>
              Sketch Layers ({micrograph.sketchLayers.length})
            </Typography>
            <Stack spacing={0.5}>
              {micrograph.sketchLayers.map(layer => (
                <Box key={layer.id} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  opacity: layer.visible ? 1 : 0.5,
                  '&:hover': { bgcolor: 'action.hover' },
                }}>
                  {layer.visible
                    ? <VisibilityIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    : <VisibilityOffIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                  }
                  <Typography variant="body2" sx={{ flex: 1 }}>{layer.name}</Typography>
                  <Chip label={layer.strokes.length + layer.textItems.length} size="small" variant="outlined" />
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {/* ============ Project Tab ============ */}
        {tabLabels[activeTab] === 'PROJECT' && (
          <Box sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Project Info</Typography>
            <Stack spacing={0.5}>
              {[
                ['Name', project.name],
                ['Description', project.description],
                ['Owner', project.owner],
                ['Affiliation', project.ownerAffiliation],
                ['PI', project.principalInvestigator],
                ['Grant', project.grantNumber],
                ['Funding', project.fundingSource],
                ['Purpose', project.purposeOfStudy],
                ['Area of Interest', project.areaOfInterest],
                ['Instruments', project.instrumentsUsed],
                ['Team Members', project.otherTeamMembers],
                ['Start Date', project.startDate],
                ['End Date', project.endDate],
                ['Notes', project.notes],
              ].filter(([, v]) => v).map(([label, value]) => (
                <Box key={label as string}>
                  <Typography variant="caption" color="text.secondary">{label}: </Typography>
                  <Typography variant="body2" component="span">{value}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}
