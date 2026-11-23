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
import { useStickyExpanded } from '@/hooks/useStickyExpanded';
import type { GrainAnalysisResults } from '@/services/grainAnalysis/types';
import type { MicrographMetadata, SavedGrainAnalysis } from '@/types/project-types';
import { allMicrographs, polygonSpotsOf, runGrainAnalysis } from '@/utils/grainAnalysisRun';
import {
  missingSpotsText,
  resolveAnalysisSpots,
  type AnalysisHome,
  type SavedAnalysisRef,
} from '@/utils/savedGrainAnalyses';

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
      <Typography variant="caption" sx={{
        color: 'text.secondary'
      }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, ml: 1, textAlign: 'right' }}>{value}</Typography>
    </Box>
  );
}

/** The stats shown for one analysis (the live one and each saved one) */
function GrainStatsDetails({
  results,
  onOpen,
  note,
}: {
  results: GrainAnalysisResults;
  onOpen: () => void;
  note?: string;
}) {
  const { sizeStats, sortingCoefficient, sortingClass, mineralGroups, preferredOrientation } = results;
  return (
    <Stack spacing={1}>
      {note && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {note}
        </Typography>
      )}

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
          value={results.aspectRatioStats.mean.toFixed(2)}
        />
        <StatRow
          label="Mean Circularity"
          value={results.circularityStats.mean.toFixed(2)}
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
            sx={{
              color: 'text.secondary',
              display: 'block',
              mb: 0.5
            }}>
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
        onClick={onOpen}
        sx={{ textTransform: 'none', alignSelf: 'flex-start', mt: 0.5 }}
      >
        Open Full Analysis...
      </Button>
    </Stack>
  );
}

/** Open the Grain Size Analysis dialog (App.tsx listens), with a saved analysis or a new one */
function openGrainAnalysis(ref: SavedAnalysisRef | null) {
  window.dispatchEvent(new CustomEvent('open-grain-size-analysis', { detail: ref }));
}

export function GrainSizeSummary({ micrographId }: GrainSizeSummaryProps) {
  const [expanded, onExpandedChange] = useStickyExpanded('grainSize', false);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const project = useAppStore((s) => s.project);
  const grainSpotFilter = useAppStore((s) => s.grainAnalysisSpotFilter);
  const grainSelectedIds = useAppStore((s) => s.grainAnalysisSelectedSpotIds);

  const micrograph = micrographIndex.get(micrographId);

  // Build a set of selected IDs for fast lookup (only when filter is 'selected')
  const selectedIdSet = useMemo(() => {
    if (grainSpotFilter !== 'selected' || grainSelectedIds.length === 0) return null;
    return new Set(grainSelectedIds);
  }, [grainSpotFilter, grainSelectedIds]);

  // Every polygon spot of the micrograph (for the "X of Y" indicator)
  const allItems = useMemo(() => (micrograph ? polygonSpotsOf([micrograph]) : []), [micrograph]);

  // Compute analysis results (same run as the dialog's Current micrograph)
  const analysisResults = useMemo(() => {
    if (!micrograph?.scalePixelsPerCentimeter) return null;
    const items = selectedIdSet ? allItems.filter(({ spot }) => selectedIdSet.has(spot.id)) : allItems;
    return runGrainAnalysis(project, [micrograph], items, (id) => micrographIndex.get(id), 'current', 'sedimentary').results;
  }, [micrograph, project, allItems, selectedIdSet, micrographIndex]);

  // Don't render if no results
  if (!analysisResults || analysisResults.grains.length === 0) {
    return null;
  }

  const totalPolygonCount = allItems.length;
  const count = analysisResults.sizeStats.count;
  const isFiltered = selectedIdSet !== null && count < totalPolygonCount;

  return (
    <StyledAccordion disableGutters expanded={expanded} onChange={onExpandedChange}>
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Grain Size Analysis</Typography>
        <Chip
          label={isFiltered ? `${count} of ${totalPolygonCount}` : `${count} grains`}
          size="small"
        />
      </StyledAccordionSummary>
      <AccordionDetails sx={{ py: 1 }}>
        <GrainStatsDetails results={analysisResults} onOpen={() => openGrainAnalysis(null)} />
      </AccordionDetails>
    </StyledAccordion>
  );
}

/** One saved analysis as its own right-pane section */
function SavedAnalysisSection({ analysis, home }: { analysis: SavedGrainAnalysis; home: AnalysisHome }) {
  const [expanded, onExpandedChange] = useStickyExpanded('savedGrainAnalysis', false);
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);

  const run = useMemo(() => {
    const micrographs = home.kind === 'project'
      ? allMicrographs(project)
      : [micrographIndex.get(home.micrographId)].filter((m): m is MicrographMetadata => m !== undefined);
    const { items, missing } = resolveAnalysisSpots(analysis, polygonSpotsOf(micrographs));
    const scope = home.kind === 'project' ? 'all' : 'current';
    const { results } = runGrainAnalysis(project, micrographs, items, (id) => micrographIndex.get(id), scope, analysis.rockType);
    return { results, missing };
  }, [analysis, home, project, micrographIndex]);

  const count = run.results?.sizeStats.count ?? 0;
  return (
    <StyledAccordion disableGutters expanded={expanded} onChange={onExpandedChange} data-testid="saved-grain-analysis">
      <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" noWrap sx={{ minWidth: 0 }}>
          Grain Size: {analysis.name}
        </Typography>
        <Chip label={`${count} ${count === 1 ? 'grain' : 'grains'}`} size="small" />
      </StyledAccordionSummary>
      <AccordionDetails sx={{ py: 1 }}>
        {run.results ? (
          <GrainStatsDetails
            results={run.results}
            note={missingSpotsText(run.missing) || undefined}
            onOpen={() => openGrainAnalysis({ home, id: analysis.id })}
          />
        ) : (
          <Stack spacing={1}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              None of the spots saved in this analysis can be measured now (deleted, archived, or no scale set).
            </Typography>
            <Button
              size="small"
              variant="text"
              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              onClick={() => openGrainAnalysis({ home, id: analysis.id })}
              sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
            >
              Open Full Analysis...
            </Button>
          </Stack>
        )}
      </AccordionDetails>
    </StyledAccordion>
  );
}

/**
 * Saved Grain Size analyses, one section each, in saved order (Claire #64):
 * a micrograph's own, or the project's All-micrograph ones (Project tab).
 */
export function SavedGrainAnalysesSummary({ micrographId }: { micrographId?: string }) {
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const home: AnalysisHome = micrographId ? { kind: 'micrograph', micrographId } : { kind: 'project' };
  const list = micrographId ? micrographIndex.get(micrographId)?.grainAnalyses : project?.grainAnalyses;
  if (!list || list.length === 0) return null;
  return (
    <>
      {list.map((analysis) => (
        <SavedAnalysisSection key={analysis.id} analysis={analysis} home={home} />
      ))}
    </>
  );
}
