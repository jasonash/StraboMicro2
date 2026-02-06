/**
 * Grain Size Summary Component
 *
 * Read-only accordion that displays grain size analysis results inline
 * in the PropertiesPanel when viewing a micrograph. Only renders when
 * the micrograph has polygon spots and a scale is set.
 */

import { useMemo } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
  Stack,
  Chip,
  Button,
  styled,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useAppStore } from '@/store';
import { calculateAllGrainMetrics } from '@/utils/grainMetrics';
import { analyzeGrains } from '@/services/grainAnalysis/statistics';

interface GrainSizeSummaryProps {
  micrographId: string;
}

// Styled Accordion matching MetadataSummary pattern
const StyledAccordion = styled(Accordion)(({ theme }) => ({
  '&:before': { display: 'none' },
  borderLeft: '3px solid transparent',
  transition: 'border-color 0.2s ease',
  '&.Mui-expanded': {
    borderLeftColor: theme.palette.primary.main,
  },
}));

const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  minHeight: 32,
  padding: '0 12px',
  transition: 'background-color 0.2s ease',
  '& .MuiAccordionSummary-content': {
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  '&.Mui-expanded': {
    minHeight: 32,
  },
  '& .MuiAccordionSummary-content.Mui-expanded': {
    margin: '6px 0',
  },
  '.Mui-expanded &, &.Mui-expanded': {
    backgroundColor: theme.palette.mode === 'dark'
      ? 'rgba(228, 76, 101, 0.12)'
      : 'rgba(228, 76, 101, 0.08)',
  },
}));

/**
 * Format size value with appropriate units
 */
function formatSize(microns: number): string {
  if (microns >= 1000) {
    return (microns / 1000).toFixed(2) + ' mm';
  }
  return microns.toFixed(1) + ' µm';
}

/**
 * Stat row for the summary grid
 */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, ml: 1, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

export function GrainSizeSummary({ micrographId }: GrainSizeSummaryProps) {
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const project = useAppStore((s) => s.project);

  const micrograph = micrographIndex.get(micrographId);

  // Compute analysis results
  const analysisResults = useMemo(() => {
    if (!micrograph) return null;

    const scale = micrograph.scalePixelsPerCentimeter;
    if (!scale) return null;

    // Filter non-archived polygon spots
    const polygonSpots = (micrograph.spots || []).filter(
      (s) => !s.archived && s.geometryType === 'polygon' && (s.points?.length ?? 0) >= 3
    );

    if (polygonSpots.length === 0) return null;

    const metrics = calculateAllGrainMetrics(polygonSpots, scale);
    if (metrics.length === 0) return null;

    // Calculate micrograph area for coverage
    const µmPerPixel = 10000 / scale;
    const micrographAreaMicrons2 =
      (micrograph.width || 1000) * (micrograph.height || 1000) * µmPerPixel * µmPerPixel;

    // Get sample name
    let sampleName = '';
    if (project) {
      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.some((m) => m.id === micrographId)) {
            sampleName = sample.name || '';
          }
        }
      }
    }

    const results = analyzeGrains(
      metrics,
      micrographId,
      micrograph.name || '',
      sampleName,
      scale,
      micrographAreaMicrons2,
      'sedimentary'
    );

    return results;
  }, [micrograph, micrographId, project]);

  // Don't render if no results
  if (!analysisResults || analysisResults.grains.length === 0) {
    return null;
  }

  const { sizeStats, sortingCoefficient, sortingClass, mineralGroups, preferredOrientation } =
    analysisResults;

  const handleOpenFullAnalysis = () => {
    window.dispatchEvent(new CustomEvent('open-grain-size-analysis'));
  };

  return (
    <StyledAccordion disableGutters defaultExpanded={false}>
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Grain Size Analysis</Typography>
        <Chip label={`${sizeStats.count} grains`} size="small" />
      </StyledAccordionSummary>
      <AccordionDetails sx={{ py: 1 }}>
        <Stack spacing={1}>
          {/* Stats grid */}
          <Stack spacing={0.25}>
            <StatRow label="Mean Diameter" value={formatSize(sizeStats.mean)} />
            <StatRow label="Median Diameter" value={formatSize(sizeStats.median)} />
            <StatRow label="Std Dev" value={formatSize(sizeStats.stdDev)} />
            <StatRow
              label="Range"
              value={`${formatSize(sizeStats.min)} – ${formatSize(sizeStats.max)}`}
            />
          </Stack>

          {/* Sorting (sedimentary) */}
          {sortingCoefficient !== null && sortingClass && (
            <Box>
              <StatRow
                label="Sorting"
                value={`${sortingCoefficient.toFixed(2)} (${sortingClass})`}
              />
            </Box>
          )}

          {/* Shape metrics */}
          <Stack spacing={0.25}>
            <StatRow
              label="Mean Aspect Ratio"
              value={analysisResults.aspectRatioStats.mean.toFixed(2)}
            />
            <StatRow
              label="Mean Circularity"
              value={analysisResults.circularityStats.mean.toFixed(2)}
            />
          </Stack>

          {/* Preferred orientation */}
          {preferredOrientation !== null && (
            <StatRow
              label="Preferred Orientation"
              value={`${preferredOrientation.toFixed(1)}°`}
            />
          )}

          {/* Mineral breakdown (top minerals) */}
          {mineralGroups.length > 1 && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.5 }}
              >
                By Mineral:
              </Typography>
              {mineralGroups.slice(0, 5).map((group) => (
                <Box
                  key={group.mineral}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    ml: 1,
                  }}
                >
                  <Typography variant="caption">
                    {group.mineral} ({group.count})
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {formatSize(group.sizeStats.mean)}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Open Full Analysis button */}
          <Button
            size="small"
            variant="text"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={handleOpenFullAnalysis}
            sx={{ textTransform: 'none', alignSelf: 'flex-start', mt: 0.5 }}
          >
            Open Full Analysis...
          </Button>
        </Stack>
      </AccordionDetails>
    </StyledAccordion>
  );
}
