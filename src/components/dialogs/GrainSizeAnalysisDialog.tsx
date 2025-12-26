/**
 * Grain Size Analysis Dialog
 *
 * Provides quantitative grain size analysis for polygon spots.
 * Features:
 * - Size distribution histogram with rock-type classification overlay
 * - Orientation rose diagram
 * - Population statistics (mean, median, sorting, etc.)
 * - Grouping by mineral
 * - CSV and PDF export
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
} from '@mui/material';
import {
  Close as CloseIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import { calculateAllGrainMetrics, type GrainMetrics } from '@/utils/grainMetrics';
import {
  analyzeGrains,
  type RockType,
  type GrainAnalysisResults,
} from '@/services/grainAnalysis';
import { SizeHistogram, RoseDiagram } from '@/components/charts';
import type { MicrographMetadata, Spot } from '@/types/project-types';

// =============================================================================
// Types
// =============================================================================

interface GrainSizeAnalysisDialogProps {
  open: boolean;
  onClose: () => void;
}

type AnalysisScope = 'current' | 'all';

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

// =============================================================================
// Component
// =============================================================================

export function GrainSizeAnalysisDialog({ open, onClose }: GrainSizeAnalysisDialogProps) {
  // Store state
  const project = useAppStore((s) => s.project);
  const activeMicrographId = useAppStore((s) => s.activeMicrographId);
  const micrographIndex = useAppStore((s) => s.micrographIndex);

  // Dialog state
  const [rockType, setRockType] = useState<RockType>('sedimentary');
  const [scope, setScope] = useState<AnalysisScope>('current');
  const [polygonOnly, setPolygonOnly] = useState(true);
  const [classifiedOnly, setClassifiedOnly] = useState(false);
  const [useLogScale, setUseLogScale] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Get current micrograph
  const currentMicrograph = useMemo(() => {
    if (!activeMicrographId) return null;
    return micrographIndex.get(activeMicrographId) || null;
  }, [activeMicrographId, micrographIndex]);

  // Collect all micrographs based on scope
  const micrographsToAnalyze = useMemo(() => {
    if (!project) return [];

    if (scope === 'current') {
      return currentMicrograph ? [currentMicrograph] : [];
    }

    // All micrographs
    const all: MicrographMetadata[] = [];
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        for (const micrograph of sample.micrographs || []) {
          all.push(micrograph);
        }
      }
    }
    return all;
  }, [project, scope, currentMicrograph]);

  // Collect and filter spots
  const spots = useMemo(() => {
    const allSpots: Array<{ spot: Spot; micrograph: MicrographMetadata }> = [];

    for (const micrograph of micrographsToAnalyze) {
      for (const spot of micrograph.spots || []) {
        // Filter by geometry type
        if (polygonOnly && spot.geometryType !== 'polygon') continue;

        // Filter by classification
        if (classifiedOnly) {
          const hasMineral = spot.mineralogy?.minerals && spot.mineralogy.minerals.length > 0;
          if (!hasMineral) continue;
        }

        // Skip archived spots
        if (spot.archived) continue;

        allSpots.push({ spot, micrograph });
      }
    }

    return allSpots;
  }, [micrographsToAnalyze, polygonOnly, classifiedOnly]);

  // Calculate grain metrics
  const grainMetrics = useMemo(() => {
    const metrics: GrainMetrics[] = [];

    for (const { spot, micrograph } of spots) {
      const scale = micrograph.scalePixelsPerCentimeter || 100;
      const m = calculateAllGrainMetrics([spot], scale);
      metrics.push(...m);
    }

    return metrics;
  }, [spots]);

  // Perform full analysis
  const analysisResults = useMemo((): GrainAnalysisResults | null => {
    if (grainMetrics.length === 0) return null;

    // Use scale from first micrograph (or average)
    const firstMicrograph = micrographsToAnalyze[0];
    if (!firstMicrograph) return null;

    const scale = firstMicrograph.scalePixelsPerCentimeter || 100;
    const µmPerPixel = 10000 / scale;
    const micrographAreaMicrons2 =
      (firstMicrograph.width || 1000) *
      (firstMicrograph.height || 1000) *
      µmPerPixel * µmPerPixel;

    // Get sample name
    let sampleName = '';
    if (project) {
      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          if (sample.micrographs?.some(m => m.id === firstMicrograph.id)) {
            sampleName = sample.label || sample.sampleID || '';
            break;
          }
        }
      }
    }

    return analyzeGrains(
      grainMetrics,
      firstMicrograph.id,
      firstMicrograph.name || 'Unknown',
      sampleName,
      scale,
      micrographAreaMicrons2,
      rockType
    );
  }, [grainMetrics, micrographsToAnalyze, rockType, project]);

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
        ? `  Preferred Orientation: ${analysisResults.preferredOrientation.toFixed(0)}° ± ${(Math.sqrt(-2 * Math.log(analysisResults.orientationStrength)) * 180 / Math.PI / 2).toFixed(0)}°`
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
      PaperProps={{
        sx: { height: '85vh', maxHeight: 800 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Grain Size Analysis</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {/* Controls Row */}
        <Stack direction="row" spacing={4} sx={{ mb: 2 }} flexWrap="wrap">
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
              onChange={(e) => setScope(e.target.value as AnalysisScope)}
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

          {/* Filters */}
          <Box>
            <FormLabel component="legend" sx={{ fontSize: '0.75rem', mb: 0.5 }}>Filter</FormLabel>
            <FormControlLabel
              control={
                <Checkbox
                  checked={polygonOnly}
                  onChange={(e) => setPolygonOnly(e.target.checked)}
                  size="small"
                />
              }
              label="Polygon spots only"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={classifiedOnly}
                  onChange={(e) => setClassifiedOnly(e.target.checked)}
                  size="small"
                />
              }
              label="Classified only"
            />
          </Box>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* Main Content */}
        {grainMetrics.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No polygon spots found to analyze.
            {scope === 'current' && currentMicrograph
              ? ` The current micrograph "${currentMicrograph.name}" has no polygon annotations.`
              : ' Try changing the scope or filter settings.'}
          </Alert>
        ) : analysisResults ? (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {/* Left Column: Charts */}
            <Box sx={{ flex: '1 1 400px', minWidth: 350 }}>
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
                  width={400}
                  height={250}
                  useLogScale={useLogScale}
                  showGrid={showGrid}
                />
              </Paper>

              {/* Rose Diagram */}
              {chartData.aspectRatios.some(ar => ar > 1.2) && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Orientation</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <RoseDiagram
                      orientations={chartData.orientations}
                      size={220}
                      showMean={true}
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
                    <Typography variant="caption" color="text.secondary">SUMMARY</Typography>
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
                    <Typography variant="caption" color="text.secondary">SIZE (Equiv. Diameter)</Typography>
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
                      <Typography variant="body2">
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
                    <Typography variant="caption" color="text.secondary">SHAPE</Typography>
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
                        {(Math.sqrt(-2 * Math.log(analysisResults.orientationStrength)) * 180 / Math.PI / 2).toFixed(0)}°
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
                            <Typography variant="caption" color="text.secondary">
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
    </Dialog>
  );
}
