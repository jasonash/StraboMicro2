/**
 * Grain Size Analysis Dialog
 *
 * Provides quantitative grain size analysis for polygon spots.
 * Features:
 * - Size distribution histogram with rock-type classification overlay
 * - Orientation rose diagram
 * - Population statistics (mean, median, sorting, etc.)
 * - Grouping by mineral
 * - CSV and PDF export (src/services/grainAnalysisPdf.ts)
 * - Named, saved analyses on the micrograph or the project (Claire #64)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Divider,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  TextField,
  Tooltip,
  InputLabel,
  ListItemIcon,
  type SelectChangeEvent,
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Save as SaveIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import { type RockType } from '@/services/grainAnalysis';
import { SizeHistogram, RoseDiagram } from '@/components/charts';
import type { SavedGrainAnalysis } from '@/types/project-types';
import {
  micrographsInScope,
  polygonSpotsOf,
  runGrainAnalysis,
  orientationSpreadDegrees,
  type AnalysisScope,
} from '@/utils/grainAnalysisRun';
import {
  homeForScope,
  scopeOfHome,
  analysisNameProblem,
  cleanAnalysisName,
  nextAnalysisName,
  orderedSpotIds,
  resolveAnalysisSpots,
  missingSpotsText,
  analysisUnchanged,
  mineralChoices,
  tagChoices,
  spotMatchesListFilter,
  isSpotListFilterOn,
  NO_SPOT_LIST_FILTER,
  type SavedAnalysisRef,
  type SpotListFilter,
} from '@/utils/savedGrainAnalyses';
import { SPOT_DATA_SECTIONS, type SpotDataSectionId } from '@/utils/spotDataSections';
import { useReadOnlyReason } from '@/hooks/usePermissions';
import { exportGrainAnalysisPdf } from '@/services/grainAnalysisPdf';

// =============================================================================
// Types
// =============================================================================

interface GrainSizeAnalysisDialogProps {
  open: boolean;
  onClose: () => void;
  /** Open with this saved analysis loaded (from the right pane) */
  initialAnalysis?: SavedAnalysisRef | null;
}

/** The name prompt of Save As... and Rename... */
interface NamePrompt {
  mode: 'saveAs' | 'rename';
  value: string;
}

const SMALL_BUTTON = { minWidth: 0, fontSize: '0.7rem', px: 1, py: 0 } as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a number with appropriate precision
 */
function formatNumber(value: number, decimals = 1): string {
  if (value >= 10000) {
    return (value / 1000).toFixed(decimals) + 'k';
  }
  if (value >= 1000) {
    return value.toFixed(0);
  }
  if (value >= 100) {
    return value.toFixed(1);
  }
  return value.toFixed(decimals);
}

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
 * Format area value with appropriate units
 * Input is in µm², output switches to mm² for large values
 */
function formatArea(microns2: number): string {
  const mm2 = microns2 / 1e6;
  if (mm2 >= 1) {
    return mm2.toFixed(2) + ' mm²';
  }
  if (mm2 >= 0.01) {
    return mm2.toFixed(3) + ' mm²';
  }
  if (mm2 >= 0.001) {
    return mm2.toFixed(4) + ' mm²';
  }
  // For very small areas, show in µm²
  if (microns2 >= 1000) {
    return formatNumber(microns2, 0) + ' µm²';
  }
  return microns2.toFixed(1) + ' µm²';
}

/**
 * Get mineral color from spot mineralogy
 */
function getMineralColor(mineral: string): string {
  const colors: Record<string, string> = {
    'Quartz': '#E0E0E0',
    'Feldspar': '#FFB6C1',
    'K-Feldspar': '#FFA07A',
    'Plagioclase': '#DDA0DD',
    'Biotite': '#8B4513',
    'Muscovite': '#F5F5DC',
    'Hornblende': '#2F4F4F',
    'Pyroxene': '#556B2F',
    'Olivine': '#9ACD32',
    'Calcite': '#FFFAF0',
    'Dolomite': '#FAEBD7',
    'Garnet': '#8B0000',
    'Unclassified': '#9E9E9E',
  };
  return colors[mineral] || '#4CAF50';
}

/**
 * A small multi-choice dropdown for the spot-list filters. Nothing chosen = any.
 * Disabled when there is nothing to choose from.
 */
function FilterSelect({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  testId: string;
}) {
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <FormControl size="small" sx={{ minWidth: 120, maxWidth: 220 }} disabled={options.length === 0}>
      <Select
        multiple
        displayEmpty
        value={value}
        data-testid={testId}
        onChange={(e) => {
          const v = e.target.value;
          onChange(typeof v === 'string' ? v.split(',') : v);
        }}
        renderValue={(selected) =>
          selected.length === 0 ? `${label}: any` : `${label}: ${selected.map(labelOf).join(', ')}`
        }
        sx={{ fontSize: '0.75rem', '& .MuiSelect-select': { py: 0.5 } }}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value} dense>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <Checkbox size="small" checked={value.includes(o.value)} sx={{ p: 0 }} />
            </ListItemIcon>
            <ListItemText primary={o.label} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

// =============================================================================
// Component
// =============================================================================

export function GrainSizeAnalysisDialog({ open, onClose, initialAnalysis = null }: GrainSizeAnalysisDialogProps) {
  // Store state
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const saveGrainAnalysis = useAppStore((s) => s.saveGrainAnalysis);
  const deleteGrainAnalysis = useAppStore((s) => s.deleteGrainAnalysis);

  // Persisted grain analysis selection from store (each person's own working selection)
  const storeSpotFilter = useAppStore((s) => s.grainAnalysisSpotFilter);
  const setGrainAnalysisSpotFilter = useAppStore((s) => s.setGrainAnalysisSpotFilter);
  const setGrainAnalysisSelectedSpotIds = useAppStore((s) => s.setGrainAnalysisSelectedSpotIds);

  // Dialog state
  const [rockType, setRockType] = useState<RockType>('sedimentary');
  const [scope, setScope] = useState<AnalysisScope>('current');
  const [spotFilter, setSpotFilter] = useState<'all' | 'selected'>(storeSpotFilter);
  const [selectedSpotIds, setSelectedSpotIds] = useState<Set<string>>(new Set());
  const [useLogScale, setUseLogScale] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Saved analyses (Claire #64): the one loaded (null = a new, unsaved analysis)
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [listFilter, setListFilter] = useState<SpotListFilter>(NO_SPOT_LIST_FILTER);

  // Get current micrograph
  const currentMicrograph = useMemo(() => {
    if (!activeMicrographId) return null;
    return micrographIndex.get(activeMicrographId) || null;
  }, [activeMicrographId, micrographIndex]);

  // Where analyses of this scope are saved, and the ones saved there
  const home = useMemo(() => homeForScope(scope, currentMicrograph?.id), [scope, currentMicrograph]);
  const savedList = useMemo((): SavedGrainAnalysis[] => {
    if (!home) return [];
    return (home.kind === 'project' ? project?.grainAnalyses : currentMicrograph?.grainAnalyses) ?? [];
  }, [home, project, currentMicrograph]);
  const loaded = useMemo(() => savedList.find((a) => a.id === loadedId) ?? null, [savedList, loadedId]);
  const readOnlyReason = useReadOnlyReason(
    home ? (home.kind === 'project' ? 'project' : 'micrograph') : null,
    home ? (home.kind === 'project' ? project?.id : home.micrographId) : null
  );

  // Collect all micrographs based on scope
  const micrographsToAnalyze = useMemo(
    () => micrographsInScope(project, scope, currentMicrograph),
    [project, scope, currentMicrograph]
  );

  // Collect all polygon spots (always polygon-only)
  const allPolygonSpots = useMemo(() => polygonSpotsOf(micrographsToAnalyze), [micrographsToAnalyze]);

  // Each time the dialog opens: a new analysis, or the one the right pane asked for
  useEffect(() => {
    if (!open) return;
    setListFilter(NO_SPOT_LIST_FILTER);
    setNamePrompt(null);
    setConfirmDelete(false);
    if (initialAnalysis) {
      setScope(scopeOfHome(initialAnalysis.home));
      setLoadedId(initialAnalysis.id);
    } else {
      setLoadedId(null);
      setSpotFilter(useAppStore.getState().grainAnalysisSpotFilter);
    }
  }, [open, initialAnalysis]);

  // A loaded analysis brings its rock type
  useEffect(() => {
    if (loaded) setRockType(loaded.rockType);
    // Only when another analysis is loaded, not when it is saved again
  }, [loaded?.id]);

  // Initialize selectedSpotIds when the dialog opens, the available spots change, or an
  // analysis is loaded. A loaded analysis checks its saved spots. Otherwise the persisted
  // working selection is intersected with the available spots (none saved = all).
  // The persisted list is read from the store here instead of being a dependency: the
  // dialog writes it on every checkbox change, and an empty list means "nothing saved"
  // (= all), so reacting to our own writes turned Select None (or unchecking the last
  // spot) back into Select All.
  const loadedKey = loaded ? `${loaded.id}:${loaded.spotIds.join(',')}` : '';
  useEffect(() => {
    if (!open) return;
    if (loaded) {
      setSelectedSpotIds(new Set(resolveAnalysisSpots(loaded, allPolygonSpots).items.map(({ spot }) => spot.id)));
      return;
    }
    const allIds = new Set(allPolygonSpots.map(({ spot }) => spot.id));
    const persistedIds = useAppStore.getState().grainAnalysisSelectedSpotIds;
    if (persistedIds.length > 0) {
      // Keep only IDs that still exist in the current spot set
      const persisted = new Set(persistedIds.filter((id) => allIds.has(id)));
      setSelectedSpotIds(persisted.size > 0 ? persisted : allIds);
    } else {
      setSelectedSpotIds(allIds);
    }
  }, [open, allPolygonSpots, loadedKey]);

  // A loaded analysis always uses its checked spots
  const effectiveSpotFilter = loaded ? 'selected' : spotFilter;

  /** Change the checked spots; only the unsaved working selection is remembered per person */
  const changeSelection = useCallback((next: Set<string>) => {
    setSelectedSpotIds(next);
    if (!loadedId) setGrainAnalysisSelectedSpotIds(Array.from(next));
  }, [loadedId, setGrainAnalysisSelectedSpotIds]);

  // Apply spot filter
  const spots = useMemo(() => {
    if (effectiveSpotFilter === 'all') return allPolygonSpots;
    return allPolygonSpots.filter(({ spot }) => selectedSpotIds.has(spot.id));
  }, [allPolygonSpots, effectiveSpotFilter, selectedSpotIds]);

  // The spot list as shown (the filters only narrow what is shown for checking)
  const shownSpots = useMemo(
    () => allPolygonSpots.filter(({ spot }) => spotMatchesListFilter(project, spot, listFilter)),
    [allPolygonSpots, project, listFilter]
  );
  const filterOn = isSpotListFilterOn(listFilter);
  const minerals = useMemo(() => mineralChoices(allPolygonSpots), [allPolygonSpots]);
  const tags = useMemo(() => tagChoices(project, allPolygonSpots), [project, allPolygonSpots]);
  const sectionsWithData = useMemo(
    () => SPOT_DATA_SECTIONS.filter((section) => allPolygonSpots.some(({ spot }) => section.has(spot))),
    [allPolygonSpots]
  );

  // The spots a save would keep, in list order
  const spotIdsToSave = useMemo(
    () => (effectiveSpotFilter === 'all'
      ? allPolygonSpots.map(({ spot }) => spot.id)
      : orderedSpotIds(allPolygonSpots, selectedSpotIds)),
    [effectiveSpotFilter, allPolygonSpots, selectedSpotIds]
  );
  const missingInLoaded = loaded ? resolveAnalysisSpots(loaded, allPolygonSpots).missing : 0;
  const loadedChanged = loaded !== null && !analysisUnchanged(loaded, spotIdsToSave, rockType);

  // Calculate grain metrics and the analysis (src/utils/grainAnalysisRun.ts, shared with the
  // right pane and the PDF). With All micrographs, orientations are turned into each grain's
  // reference micrograph frame, so associated micrographs placed rotated on their parent are
  // comparable; Current micrograph keeps that image's own frame.
  const { results: analysisResults, frames: orientationFrames, measured } = useMemo(
    () => runGrainAnalysis(project, micrographsToAnalyze, spots, (id) => micrographIndex.get(id), scope, rockType),
    [project, micrographsToAnalyze, spots, micrographIndex, scope, rockType]
  );

  // Extract data for charts
  const chartData = useMemo(() => {
    if (!analysisResults) {
      return { sizes: [], orientations: [], aspectRatios: [] };
    }

    return {
      sizes: analysisResults.grains.map(g => g.equivalentDiameterMicrons),
      orientations: analysisResults.grains.map(g => g.orientationDegrees),
      aspectRatios: analysisResults.grains.map(g => g.aspectRatio),
    };
  }, [analysisResults]);

  // Which image's right side 0° points to (rose caption), and the note when unrelated frames are combined
  const frameDescription = scope === 'all'
    ? "each polygon's reference micrograph, measured as the polygon lies on the reference, including any rotation of the associated micrograph it was drawn on"
    : 'the micrograph image';
  const framesWarning = orientationFrames.length > 1
    ? `Polygons from ${orientationFrames.length} reference micrographs are combined ` +
      `(${orientationFrames.map((f) => `${f.name}: ${f.grains}`).join(', ')}). Each is measured from its own ` +
      "reference micrograph's horizontal, and those are not related unless the sections were imaged the same way round."
    : '';

  // PDF export: the analysis as shown (charts, caption, statistics, By Mineral)
  const handleExportPdf = useCallback(async () => {
    if (!analysisResults) return;
    setExporting(true);
    try {
      await exportGrainAnalysisPdf({
        results: analysisResults,
        name: loaded?.name ?? null,
        projectName: project?.name || 'Untitled project',
        scopeText: scope === 'all' ? 'All micrographs' : `Current micrograph: ${currentMicrograph?.name || 'Unnamed'}`,
        rockType,
        useLogScale,
        frameDescription,
        roseNote: framesWarning || undefined,
        missingNote: missingSpotsText(missingInLoaded) || undefined,
      });
    } catch (error) {
      console.error('Failed to export PDF:', error);
    } finally {
      setExporting(false);
    }
  }, [analysisResults, loaded, project, scope, currentMicrograph, rockType, useLogScale, frameDescription, framesWarning, missingInLoaded]);

  // ---- Saved analyses ----------------------------------------------------------------

  const handlePickAnalysis = (e: SelectChangeEvent<string>) => {
    const id = e.target.value;
    if (id === '') {
      // Back to the working selection
      setLoadedId(null);
      setSpotFilter(useAppStore.getState().grainAnalysisSpotFilter);
      return;
    }
    setLoadedId(id);
  };

  const handleScopeChange = (next: AnalysisScope) => {
    setScope(next);
    // Saved analyses belong to one scope
    setLoadedId(null);
    setSpotFilter(useAppStore.getState().grainAnalysisSpotFilter);
  };

  const handleSave = () => {
    if (!loaded || !home) return;
    saveGrainAnalysis(home, { ...loaded, spotIds: spotIdsToSave, rockType });
  };

  const handleNameConfirm = () => {
    if (!namePrompt || !home) return;
    const name = cleanAnalysisName(namePrompt.value);
    if (analysisNameProblem(name, savedList, namePrompt.mode === 'rename' ? loaded?.id : undefined)) return;
    if (namePrompt.mode === 'rename' && loaded) {
      saveGrainAnalysis(home, { ...loaded, name });
    } else {
      const analysis: SavedGrainAnalysis = {
        id: uuidv4(),
        name,
        spotIds: spotIdsToSave,
        rockType,
        date: new Date().toISOString(),
      };
      saveGrainAnalysis(home, analysis);
      setLoadedId(analysis.id);
    }
    setNamePrompt(null);
  };

  const handleDelete = () => {
    if (!loaded || !home) return;
    deleteGrainAnalysis(home, loaded.id);
    setConfirmDelete(false);
    setLoadedId(null);
    setSpotFilter(useAppStore.getState().grainAnalysisSpotFilter);
  };

  const nameProblem = namePrompt
    ? analysisNameProblem(namePrompt.value, savedList, namePrompt.mode === 'rename' ? loaded?.id : undefined)
    : null;

  // CSV Export handler
  const handleExportCSV = useCallback(async () => {
    if (!analysisResults) return;

    setExporting(true);
    try {
      // Build CSV content
      const headers = [
        'SpotID',
        'SpotName',
        'Mineral',
        'AreaPixels',
        'AreaMicrons2',
        'PerimeterMicrons',
        'EquivDiameterMicrons',
        'MajorAxisMicrons',
        'MinorAxisMicrons',
        'AspectRatio',
        'OrientationDegrees',
        'Circularity',
        'OrientationFrame',
      ];

      const rows = analysisResults.grains.map(g => [
        g.spotId,
        g.spotName,
        g.mineral || '',
        g.areaPixels.toFixed(2),
        g.areaMicrons2.toFixed(2),
        g.perimeterMicrons.toFixed(2),
        g.equivalentDiameterMicrons.toFixed(2),
        g.majorAxisMicrons.toFixed(2),
        g.minorAxisMicrons.toFixed(2),
        g.aspectRatio.toFixed(3),
        g.orientationDegrees.toFixed(1),
        g.circularity.toFixed(3),
        g.orientationFrame ?? '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.join(',')),
      ].join('\n');

      // Save via IPC
      const defaultName = `grain-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
      await window.api?.saveTextFile(csvContent, defaultName, 'csv');
    } catch (error) {
      console.error('Failed to export CSV:', error);
    } finally {
      setExporting(false);
    }
  }, [analysisResults]);

  // Copy statistics to clipboard
  const handleCopyStats = useCallback(async () => {
    if (!analysisResults) return;

    const stats = analysisResults.sizeStats;
    const text = [
      `Grain Size Analysis Results`,
      `Date: ${new Date().toLocaleDateString()}`,
      ``,
      `Grains: ${stats.count}`,
      `Total Area: ${formatArea(analysisResults.totalAreaMicrons2)}`,
      `Coverage: ${analysisResults.totalAreaPercent.toFixed(1)}%`,
      ``,
      `SIZE (Equiv. Diameter)`,
      `  Mean: ${formatSize(stats.mean)}`,
      `  Median: ${formatSize(stats.median)}`,
      `  Std Dev: ${formatSize(stats.stdDev)}`,
      `  Range: ${formatSize(stats.min)} - ${formatSize(stats.max)}`,
      analysisResults.sortingCoefficient !== null
        ? `  Sorting: ${analysisResults.sortingCoefficient.toFixed(2)} (${analysisResults.sortingClass})`
        : '',
      `  Skewness: ${stats.skewness >= 0 ? '+' : ''}${stats.skewness.toFixed(2)}`,
      ``,
      `SHAPE`,
      `  Mean Aspect Ratio: ${analysisResults.aspectRatioStats.mean.toFixed(2)}`,
      `  Mean Circularity: ${analysisResults.circularityStats.mean.toFixed(2)}`,
      analysisResults.preferredOrientation !== null
        ? `  Preferred Orientation: ${analysisResults.preferredOrientation.toFixed(0)}° ± ${orientationSpreadDegrees(analysisResults).toFixed(0)}°`
        : '',
    ].filter(line => line !== '').join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [analysisResults]);

  // Reset copied state when dialog closes
  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: { height: '85vh', maxHeight: 800 },
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap>
            Grain Size Analysis{loaded ? `: ${loaded.name}` : ''}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {/* Saved analyses (Claire #64) */}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 260 }} disabled={!home}>
            {/* The empty value (new analysis) still shows text, so the label stays up in the border */}
            <InputLabel id="grain-analysis-pick-label" shrink>Analysis</InputLabel>
            <Select
              labelId="grain-analysis-pick-label"
              label="Analysis"
              notched
              value={loaded ? loaded.id : ''}
              onChange={handlePickAnalysis}
              displayEmpty
              data-testid="grain-analysis-pick"
              renderValue={(v) => (v === '' ? 'New analysis (not saved)' : savedList.find((a) => a.id === v)?.name ?? '')}
            >
              <MenuItem value="">
                <em>New analysis (not saved)</em>
              </MenuItem>
              {savedList.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                  <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                    {a.spotIds.length} {a.spotIds.length === 1 ? 'spot' : 'spots'}
                  </Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={readOnlyReason ?? ''}>
            <span>
              <Button
                size="small"
                variant={loadedChanged ? 'contained' : 'text'}
                startIcon={<SaveIcon />}
                disabled={!loaded || !loadedChanged || readOnlyReason !== null}
                onClick={handleSave}
              >
                Save
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={readOnlyReason ?? ''}>
            <span>
              <Button
                size="small"
                disabled={!home || spotIdsToSave.length === 0 || readOnlyReason !== null}
                onClick={() => setNamePrompt({ mode: 'saveAs', value: nextAnalysisName(savedList) })}
              >
                Save As...
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={readOnlyReason ?? ''}>
            <span>
              <Button
                size="small"
                disabled={!loaded || readOnlyReason !== null}
                onClick={() => loaded && setNamePrompt({ mode: 'rename', value: loaded.name })}
              >
                Rename...
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={readOnlyReason ?? ''}>
            <span>
              <Button
                size="small"
                color="error"
                disabled={!loaded || readOnlyReason !== null}
                onClick={() => setConfirmDelete(true)}
              >
                Delete...
              </Button>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ color: 'text.secondary', flex: '1 1 200px' }}>
            {loadedChanged
              ? 'Changed since it was saved.'
              : scope === 'all'
                ? 'All-micrograph analyses are saved with the project.'
                : 'Saved with this micrograph.'}
          </Typography>
        </Stack>

        {missingInLoaded > 0 && (
          <Alert severity="info" sx={{ mb: 2, py: 0 }}>
            {missingSpotsText(missingInLoaded)}
          </Alert>
        )}

        {/* Controls Row */}
        <Stack
          direction="row"
          spacing={4}
          sx={{
            flexWrap: 'wrap',
            mb: 2
          }}>
          {/* Rock Type */}
          <FormControl component="fieldset" size="small">
            <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>Rock Type</FormLabel>
            <RadioGroup
              row
              value={rockType}
              onChange={(e) => setRockType(e.target.value as RockType)}
            >
              <FormControlLabel value="sedimentary" control={<Radio size="small" />} label="Sedimentary" />
              <FormControlLabel value="igneous" control={<Radio size="small" />} label="Igneous" />
              <FormControlLabel value="metamorphic" control={<Radio size="small" />} label="Metamorphic" />
            </RadioGroup>
          </FormControl>

          {/* Scope */}
          <FormControl component="fieldset" size="small">
            <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>Scope</FormLabel>
            <RadioGroup
              row
              value={scope}
              onChange={(e) => handleScopeChange(e.target.value as AnalysisScope)}
            >
              <FormControlLabel
                value="current"
                control={<Radio size="small" />}
                label="Current micrograph"
                disabled={!currentMicrograph}
              />
              <FormControlLabel value="all" control={<Radio size="small" />} label="All micrographs" />
            </RadioGroup>
          </FormControl>

          {/* Spot Filter (a saved analysis always uses its checked spots) */}
          {!loaded && (
            <FormControl component="fieldset" size="small">
              <FormLabel component="legend" sx={{ fontSize: '0.75rem' }}>Spots</FormLabel>
              <RadioGroup
                row
                value={spotFilter}
                onChange={(e) => {
                  const val = e.target.value as 'all' | 'selected';
                  setSpotFilter(val);
                  setGrainAnalysisSpotFilter(val);
                }}
              >
                <FormControlLabel value="all" control={<Radio size="small" />} label="All spots" />
                <FormControlLabel value="selected" control={<Radio size="small" />} label="Selected spots" />
              </RadioGroup>
            </FormControl>
          )}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* Spot Selection List */}
        {effectiveSpotFilter === 'selected' && allPolygonSpots.length > 0 && (
          <Paper
            variant="outlined"
            sx={{ mb: 2, maxHeight: 260, display: 'flex', flexDirection: 'column' }}
          >
            {/* Filters: they only narrow the list shown for checking */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, px: 1.5, pt: 1, pb: 0.5 }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Show:</Typography>
              <FilterSelect
                label="Mineral"
                testId="grain-filter-mineral"
                options={minerals.map((m) => ({ value: m, label: m }))}
                value={listFilter.minerals}
                onChange={(minerals) => setListFilter((f) => ({ ...f, minerals }))}
              />
              <FilterSelect
                label="Tag"
                testId="grain-filter-tag"
                options={tags.map((t) => ({ value: t.id, label: t.name }))}
                value={listFilter.tagIds}
                onChange={(tagIds) => setListFilter((f) => ({ ...f, tagIds }))}
              />
              <FilterSelect
                label="Has data"
                testId="grain-filter-data"
                options={sectionsWithData.map((sct) => ({ value: sct.id, label: sct.label }))}
                value={listFilter.sections}
                onChange={(sections) => setListFilter((f) => ({ ...f, sections: sections as SpotDataSectionId[] }))}
              />
              {filterOn && (
                <Button size="small" sx={SMALL_BUTTON} onClick={() => setListFilter(NO_SPOT_LIST_FILTER)}>
                  Clear filters
                </Button>
              )}
            </Stack>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{
                color: 'text.secondary'
              }} data-testid="grain-spot-count">
                {selectedSpotIds.size} of {allPolygonSpots.length} polygon spots checked
                {filterOn && ` · ${shownSpots.length} shown`}
              </Typography>
              <Stack direction="row" spacing={0.5}>
                <Button
                  size="small"
                  sx={SMALL_BUTTON}
                  onClick={() => {
                    const next = new Set(selectedSpotIds);
                    for (const { spot } of shownSpots) next.add(spot.id);
                    changeSelection(next);
                  }}
                >
                  {filterOn ? 'Check Shown' : 'Select All'}
                </Button>
                <Button
                  size="small"
                  sx={SMALL_BUTTON}
                  onClick={() => {
                    const next = new Set(selectedSpotIds);
                    for (const { spot } of shownSpots) next.delete(spot.id);
                    changeSelection(next);
                  }}
                >
                  {filterOn ? 'Uncheck Shown' : 'Select None'}
                </Button>
              </Stack>
            </Box>
            <List dense disablePadding sx={{ overflow: 'auto', flex: 1 }}>
              {shownSpots.map(({ spot, micrograph }) => {
                const mineral = spot.mineralogy?.minerals?.[0]?.name;
                return (
                  <ListItem
                    key={spot.id}
                    disablePadding
                    sx={{ px: 1.5, py: 0 }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedSpotIds.has(spot.id)}
                      onChange={(e) => {
                        const next = new Set(selectedSpotIds);
                        if (e.target.checked) next.add(spot.id);
                        else next.delete(spot.id);
                        changeSelection(next);
                      }}
                      sx={{ p: 0.25, mr: 1 }}
                    />
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap>
                          {spot.name || spot.id.slice(0, 8)}
                          {mineral && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                ml: 1
                              }}>
                              {mineral}
                            </Typography>
                          )}
                          {scope === 'all' && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{
                                color: 'text.secondary',
                                ml: 1
                              }}>
                              ({micrograph.name})
                            </Typography>
                          )}
                        </Typography>
                      }
                    />
                  </ListItem>
                );
              })}
              {shownSpots.length === 0 && (
                <ListItem sx={{ px: 1.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    No polygon spots match these filters.
                  </Typography>
                </ListItem>
              )}
            </List>
          </Paper>
        )}

        {/* Main Content */}
        {measured === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No polygon spots found to analyze.
            {scope === 'current' && currentMicrograph
              ? ` The current micrograph "${currentMicrograph.name}" has no polygon annotations.`
              : ' Try changing the scope or filter settings.'}
          </Alert>
        ) : analysisResults ? (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {/* Left Column: Charts */}
            <Box sx={{ flex: '2 1 550px', minWidth: 450 }}>
              {/* Histogram */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2">Size Distribution</Typography>
                  <Stack direction="row" spacing={1}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={useLogScale}
                          onChange={(e) => setUseLogScale(e.target.checked)}
                          size="small"
                        />
                      }
                      label="Log scale"
                      sx={{ mr: 0 }}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          size="small"
                        />
                      }
                      label="Grid"
                      sx={{ mr: 0 }}
                    />
                  </Stack>
                </Box>
                <SizeHistogram
                  values={chartData.sizes}
                  rockType={rockType}
                  width={520}
                  height={300}
                  useLogScale={useLogScale}
                  showGrid={showGrid}
                />
              </Paper>

              {/* Rose Diagram */}
              {chartData.aspectRatios.some(ar => ar > 1.2) && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Orientation</Typography>
                  {orientationFrames.length > 1 && (
                    <Alert severity="warning" sx={{ mb: 1.5, py: 0 }}>
                      {framesWarning}
                    </Alert>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <RoseDiagram
                      orientations={chartData.orientations}
                      size={280}
                      showMean={true}
                      frameDescription={frameDescription}
                    />
                  </Box>
                </Paper>
              )}
            </Box>

            {/* Right Column: Statistics */}
            <Box sx={{ flex: '1 1 300px', minWidth: 280 }}>
              {/* Summary Stats */}
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Statistics</Typography>

                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="caption" sx={{
                      color: 'text.secondary'
                    }}>SUMMARY</Typography>
                    <Typography variant="body2">
                      Grains: <strong>{analysisResults.sizeStats.count}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Total Area: <strong>{formatArea(analysisResults.totalAreaMicrons2)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Coverage: <strong>{analysisResults.totalAreaPercent.toFixed(1)}%</strong>
                    </Typography>
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="caption" sx={{
                      color: 'text.secondary'
                    }}>SIZE (Equiv. Diameter)</Typography>
                    <Typography variant="body2">
                      Mean: <strong>{formatSize(analysisResults.sizeStats.mean)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Median: <strong>{formatSize(analysisResults.sizeStats.median)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Std Dev: <strong>{formatSize(analysisResults.sizeStats.stdDev)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Range: <strong>{formatSize(analysisResults.sizeStats.min)} - {formatSize(analysisResults.sizeStats.max)}</strong>
                    </Typography>
                    {analysisResults.sortingCoefficient !== null && (
                      <Typography variant="body2" component="div">
                        Sorting: <strong>{analysisResults.sortingCoefficient.toFixed(2)}</strong>
                        {' '}
                        <Chip
                          label={analysisResults.sortingClass}
                          size="small"
                          sx={{ height: 18, fontSize: '0.7rem' }}
                        />
                      </Typography>
                    )}
                    <Typography variant="body2">
                      Skewness: <strong>{analysisResults.sizeStats.skewness >= 0 ? '+' : ''}{analysisResults.sizeStats.skewness.toFixed(2)}</strong>
                    </Typography>
                  </Box>

                  <Divider />

                  <Box>
                    <Typography variant="caption" sx={{
                      color: 'text.secondary'
                    }}>SHAPE</Typography>
                    <Typography variant="body2">
                      Mean Aspect Ratio: <strong>{analysisResults.aspectRatioStats.mean.toFixed(2)}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Mean Circularity: <strong>{analysisResults.circularityStats.mean.toFixed(2)}</strong>
                    </Typography>
                    {analysisResults.preferredOrientation !== null && (
                      <Typography variant="body2">
                        Preferred Orientation: <strong>{analysisResults.preferredOrientation.toFixed(0)}°</strong>
                        {' ± '}
                        {orientationSpreadDegrees(analysisResults).toFixed(0)}°
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </Paper>

              {/* By Mineral */}
              {analysisResults.mineralGroups.length > 1 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>By Mineral</Typography>
                  <List dense disablePadding>
                    {analysisResults.mineralGroups.slice(0, 8).map((group) => (
                      <ListItem key={group.mineral} disablePadding sx={{ py: 0.5 }}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: getMineralColor(group.mineral),
                            border: '1px solid rgba(0,0,0,0.2)',
                            mr: 1,
                            flexShrink: 0,
                          }}
                        />
                        <ListItemText
                          primary={
                            <Typography variant="body2">
                              <strong>{group.mineral}</strong> ({group.count})
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" sx={{
                              color: 'text.secondary'
                            }}>
                              mean={formatSize(group.sizeStats.mean)}, AR={group.meanAspectRatio.toFixed(1)}
                              {group.meanAspectRatio > 1.2 && `, θ=${group.meanOrientation.toFixed(0)}°`}
                            </Typography>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              )}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button
          startIcon={<DownloadIcon />}
          onClick={handleExportCSV}
          disabled={!analysisResults || exporting}
        >
          Export CSV
        </Button>
        <Button
          startIcon={<PdfIcon />}
          onClick={handleExportPdf}
          disabled={!analysisResults || exporting}
        >
          Export PDF
        </Button>
        <Button
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          onClick={handleCopyStats}
          disabled={!analysisResults}
          color={copied ? 'success' : 'primary'}
        >
          {copied ? 'Copied!' : 'Copy Statistics'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      {/* Save As... / Rename... */}
      <Dialog open={namePrompt !== null} onClose={() => setNamePrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{namePrompt?.mode === 'rename' ? 'Rename Analysis' : 'Save Analysis'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {namePrompt?.mode === 'rename'
              ? 'The new name is shown here and in the right pane.'
              : `Saves the ${spotIdsToSave.length} checked ${spotIdsToSave.length === 1 ? 'spot' : 'spots'} and the rock type ${
                scope === 'all' ? 'with the project' : 'with this micrograph'}. The numbers are worked out again each time it is shown.`}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Name"
            value={namePrompt?.value ?? ''}
            onChange={(e) => setNamePrompt((p) => (p ? { ...p, value: e.target.value } : p))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !nameProblem) handleNameConfirm();
            }}
            error={nameProblem !== null && (namePrompt?.value ?? '') !== ''}
            helperText={nameProblem ?? ' '}
            slotProps={{ htmlInput: { maxLength: 120, 'data-testid': 'grain-analysis-name' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNamePrompt(null)}>Cancel</Button>
          <Button variant="contained" disabled={nameProblem !== null} onClick={handleNameConfirm}>
            {namePrompt?.mode === 'rename' ? 'Rename' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete... */}
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Saved Analysis</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete the saved analysis &quot;{loaded?.name}&quot;? The spots themselves are not changed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
