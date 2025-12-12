/**
 * Generate Spots Dialog
 *
 * Unified dialog for generating spots on a micrograph using either:
 * 1. Point Counting - Regular grid of points for modal analysis
 * 2. Grain Detection - Computer vision to detect grain boundaries (future)
 *
 * This is the Phase 1 shell - method-specific implementations will be added later.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Stack,
  Slider,
  TextField,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
  Divider,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  GridOn,
  Grain,
  Info,
} from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { Spot } from '@/types/project-types';
import { v4 as uuidv4 } from 'uuid';
import { GenerateSpotsPreview, type GeneratedPoint, type RegionBounds } from './GenerateSpotsPreview';

// ============================================================================
// TYPES
// ============================================================================

export type GenerationMethod = 'point-count' | 'grain-detection';
export type GridType = 'regular' | 'random' | 'stratified';

interface PointCountOptions {
  gridType: GridType;
  pointCount: number;
  offsetByHalfSpacing: boolean;
  pointSize: number;
  color: string;
  opacity: number;
  namingPattern: string;
}

interface GrainDetectionOptions {
  sensitivity: number;
  minGrainSize: number;
  edgeContrast: number;
  simplifyOutlines: boolean;
  outputType: 'polygons' | 'points';
  presetName: string;
  color: string;
  opacity: number;
  namingPattern: string;
}

interface GenerateSpotsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string | null;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_POINT_COUNT_OPTIONS: PointCountOptions = {
  gridType: 'regular',
  pointCount: 400,
  offsetByHalfSpacing: true,
  pointSize: 8,
  color: '#FF6600',
  opacity: 80,
  namingPattern: 'Point {n}',
};

const DEFAULT_GRAIN_DETECTION_OPTIONS: GrainDetectionOptions = {
  sensitivity: 65,
  minGrainSize: 50,
  edgeContrast: 55,
  simplifyOutlines: true,
  outputType: 'polygons',
  presetName: 'Granite XPL',
  color: '#FFA500',
  opacity: 50,
  namingPattern: 'Grain {n}',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate confidence interval for a proportion (Chayes method)
 * @param count Number of points hitting this mineral
 * @param total Total number of classified points
 * @returns 95% confidence interval as ± percentage points
 */
function calculateConfidenceInterval(count: number, total: number): number {
  if (total === 0) return 0;
  const p = count / total;
  const z = 1.96; // 95% confidence
  const se = Math.sqrt((p * (1 - p)) / total);
  return z * se * 100;
}

// Note: calculateConfidenceInterval will be used in Phase 4 Statistics Panel
void calculateConfidenceInterval; // Suppress unused warning

/**
 * Generate regular grid points
 */
function generateRegularGrid(
  imageWidth: number,
  imageHeight: number,
  pointCount: number,
  offsetByHalfSpacing: boolean
): Array<{ x: number; y: number; row: number; col: number }> {
  const aspectRatio = imageWidth / imageHeight;
  const cols = Math.round(Math.sqrt(pointCount * aspectRatio));
  const rows = Math.round(pointCount / cols);

  const spacingX = imageWidth / cols;
  const spacingY = imageHeight / rows;

  const offsetX = offsetByHalfSpacing ? spacingX / 2 : 0;
  const offsetY = offsetByHalfSpacing ? spacingY / 2 : 0;

  const points: Array<{ x: number; y: number; row: number; col: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      points.push({
        x: offsetX + col * spacingX,
        y: offsetY + row * spacingY,
        row,
        col,
      });
    }
  }

  return points;
}

/**
 * Calculate grid dimensions for display
 */
function calculateGridDimensions(
  imageWidth: number,
  imageHeight: number,
  pointCount: number
): { rows: number; cols: number; spacingX: number; spacingY: number } {
  const aspectRatio = imageWidth / imageHeight;
  const cols = Math.round(Math.sqrt(pointCount * aspectRatio));
  const rows = Math.round(pointCount / cols);
  const spacingX = imageWidth / cols;
  const spacingY = imageHeight / rows;
  return { rows, cols, spacingX, spacingY };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GenerateSpotsDialog({
  isOpen,
  onClose,
  micrographId,
}: GenerateSpotsDialogProps) {
  // Store
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const addSpots = useAppStore((s) => s.addSpots);
  const lastPointCountSettings = useAppStore((s) => s.lastPointCountSettings);
  const lastGrainDetectionSettings = useAppStore((s) => s.lastGrainDetectionSettings);
  const setLastPointCountSettings = useAppStore((s) => s.setLastPointCountSettings);
  // Note: setLastGrainDetectionSettings will be used in Phase 5
  const _setLastGrainDetectionSettings = useAppStore((s) => s.setLastGrainDetectionSettings);
  void _setLastGrainDetectionSettings; // Suppress unused warning until Phase 5
  const setQuickClassifyVisible = useAppStore((s) => s.setQuickClassifyVisible);

  // Get micrograph data
  const micrograph = micrographId ? micrographIndex.get(micrographId) : null;
  const imageWidth = micrograph?.imageWidth || micrograph?.width || 1000;
  const imageHeight = micrograph?.imageHeight || micrograph?.height || 1000;

  // State
  const [method, setMethod] = useState<GenerationMethod>('point-count');
  const [pointCountOptions, setPointCountOptions] = useState<PointCountOptions>(
    lastPointCountSettings || DEFAULT_POINT_COUNT_OPTIONS
  );
  const [grainDetectionOptions, setGrainDetectionOptions] = useState<GrainDetectionOptions>(
    lastGrainDetectionSettings || DEFAULT_GRAIN_DETECTION_OPTIONS
  );
  const [regionBounds, setRegionBounds] = useState<RegionBounds | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Computed values
  const gridDimensions = useMemo(() => {
    if (method !== 'point-count') return null;
    return calculateGridDimensions(imageWidth, imageHeight, pointCountOptions.pointCount);
  }, [method, imageWidth, imageHeight, pointCountOptions.pointCount]);

  const actualPointCount = useMemo(() => {
    if (!gridDimensions) return pointCountOptions.pointCount;
    return gridDimensions.rows * gridDimensions.cols;
  }, [gridDimensions, pointCountOptions.pointCount]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPointCountOptions(lastPointCountSettings || DEFAULT_POINT_COUNT_OPTIONS);
      setGrainDetectionOptions(lastGrainDetectionSettings || DEFAULT_GRAIN_DETECTION_OPTIONS);
      setRegionBounds(null);
      setIsGenerating(false);
    }
  }, [isOpen, lastPointCountSettings, lastGrainDetectionSettings]);

  // Generate preview points
  const generatedPoints: GeneratedPoint[] = useMemo(() => {
    if (method !== 'point-count') return [];

    const allPoints = generateRegularGrid(
      imageWidth,
      imageHeight,
      pointCountOptions.pointCount,
      pointCountOptions.offsetByHalfSpacing
    );

    // Filter by region if set
    if (regionBounds) {
      return allPoints.filter(p =>
        p.x >= regionBounds.x &&
        p.x <= regionBounds.x + regionBounds.width &&
        p.y >= regionBounds.y &&
        p.y <= regionBounds.y + regionBounds.height
      );
    }

    return allPoints;
  }, [method, imageWidth, imageHeight, pointCountOptions.pointCount, pointCountOptions.offsetByHalfSpacing, regionBounds]);

  // Handlers
  const handleMethodChange = (newMethod: GenerationMethod) => {
    setMethod(newMethod);
  };

  const handlePointCountChange = (key: keyof PointCountOptions, value: unknown) => {
    setPointCountOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleGrainDetectionChange = (key: keyof GrainDetectionOptions, value: unknown) => {
    setGrainDetectionOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegionChange = (bounds: RegionBounds | null) => {
    setRegionBounds(bounds);
  };

  const handleGenerate = async () => {
    if (!micrographId || !micrograph) return;

    setIsGenerating(true);

    try {
      if (method === 'point-count') {
        // Convert preview points to Spot objects
        const timestamp = new Date().toISOString();
        const spots: Spot[] = generatedPoints.map((point, index) => ({
          id: uuidv4(),
          name: pointCountOptions.namingPattern.replace('{n}', String(index + 1)),
          color: pointCountOptions.color,
          opacity: pointCountOptions.opacity,
          geometryType: 'point',
          points: [{ X: point.x, Y: point.y }],
          generationMethod: 'point-count' as const,
          gridPosition: { row: point.row, col: point.col },
          generationTimestamp: timestamp,
          generationSettings: {
            gridType: pointCountOptions.gridType,
            pointCount: pointCountOptions.pointCount,
          },
        }));

        // Add spots to micrograph
        addSpots(micrographId, spots);

        // Save settings for next time
        setLastPointCountSettings(pointCountOptions);

        // Show Quick Classify toolbar
        setQuickClassifyVisible(true);
      } else {
        // Grain detection - Phase 5
        console.log('Grain detection not yet implemented');
      }

      onClose();
    } catch (error) {
      console.error('[GenerateSpotsDialog] Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = micrographId && micrograph;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '80vh', maxHeight: '90vh' },
      }}
    >
      <DialogTitle>Generate Spots</DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Method Selection Cards */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Point Counting Card */}
          <Card
            variant={method === 'point-count' ? 'outlined' : 'elevation'}
            sx={{
              flex: 1,
              border: method === 'point-count' ? '2px solid' : '1px solid',
              borderColor: method === 'point-count' ? 'primary.main' : 'divider',
            }}
          >
            <CardActionArea onClick={() => handleMethodChange('point-count')}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: method === 'point-count' ? 'primary.main' : 'action.hover',
                      borderRadius: 1,
                      color: method === 'point-count' ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    <GridOn fontSize="large" />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      Point Counting
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Generate a grid of points for modal analysis with statistical precision.
                      Works on any image.
                    </Typography>
                  </Box>
                  <Radio checked={method === 'point-count'} />
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>

          {/* Grain Detection Card */}
          <Card
            variant={method === 'grain-detection' ? 'outlined' : 'elevation'}
            sx={{
              flex: 1,
              border: method === 'grain-detection' ? '2px solid' : '1px solid',
              borderColor: method === 'grain-detection' ? 'primary.main' : 'divider',
              opacity: 0.6, // Dimmed until implemented
            }}
          >
            <CardActionArea onClick={() => handleMethodChange('grain-detection')}>
              <CardContent>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: method === 'grain-detection' ? 'primary.main' : 'action.hover',
                      borderRadius: 1,
                      color: method === 'grain-detection' ? 'primary.contrastText' : 'text.secondary',
                    }}
                  >
                    <Grain fontSize="large" />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      Grain Detection
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Automatically detect grain boundaries. Best for grain size/shape analysis.
                      Requires clear boundaries (XPL best).
                    </Typography>
                  </Box>
                  <Radio checked={method === 'grain-detection'} />
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        </Box>

        <Divider />

        {/* Method-specific Options */}
        {method === 'point-count' && (
          <PointCountOptionsPanel
            options={pointCountOptions}
            onChange={handlePointCountChange}
            gridDimensions={gridDimensions}
          />
        )}

        {method === 'grain-detection' && (
          <GrainDetectionOptionsPanel
            options={grainDetectionOptions}
            onChange={handleGrainDetectionChange}
          />
        )}

        {/* Preview Canvas */}
        {micrographId && (
          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 500,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              p: 2,
            }}
          >
            <GenerateSpotsPreview
              micrographId={micrographId}
              generatedPoints={generatedPoints}
              regionBounds={regionBounds}
              onRegionChange={handleRegionChange}
              pointColor={pointCountOptions.color}
              pointRadius={Math.max(2, pointCountOptions.pointSize / 2)}
            />
          </Paper>
        )}

        {/* Status Line */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Info fontSize="small" color="action" />
          {method === 'point-count' && gridDimensions && (
            <Typography variant="body2" color="text.secondary">
              Grid: {gridDimensions.rows}×{gridDimensions.cols} •
              Spacing: {Math.round(gridDimensions.spacingX)}×{Math.round(gridDimensions.spacingY)} px •
              {regionBounds
                ? ` Region: ${Math.round(regionBounds.width)}×${Math.round(regionBounds.height)} px (${generatedPoints.length} of ${actualPointCount} points)`
                : ` ${generatedPoints.length} points`}
            </Typography>
          )}
          {method === 'grain-detection' && (
            <Typography variant="body2" color="text.secondary">
              Grain detection will be implemented in Phase 5
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating || method === 'grain-detection' || generatedPoints.length === 0}
          startIcon={isGenerating ? <CircularProgress size={16} /> : undefined}
        >
          {isGenerating
            ? 'Generating...'
            : method === 'point-count'
            ? `Generate ${generatedPoints.length} Points`
            : 'Generate Spots'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================================================
// POINT COUNT OPTIONS PANEL
// ============================================================================

interface PointCountOptionsPanelProps {
  options: PointCountOptions;
  onChange: (key: keyof PointCountOptions, value: unknown) => void;
  gridDimensions: { rows: number; cols: number; spacingX: number; spacingY: number } | null;
}

function PointCountOptionsPanel({
  options,
  onChange,
  gridDimensions,
}: PointCountOptionsPanelProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        POINT COUNTING OPTIONS
      </Typography>

      <Box sx={{ display: 'flex', gap: 4 }}>
        {/* Left Column - Grid Settings */}
        <Box sx={{ flex: 1 }}>
          <FormControl component="fieldset">
            <FormLabel component="legend">Grid Type</FormLabel>
            <RadioGroup
              row
              value={options.gridType}
              onChange={(e) => onChange('gridType', e.target.value)}
            >
              <FormControlLabel value="regular" control={<Radio size="small" />} label="Regular grid" />
              <FormControlLabel value="random" control={<Radio size="small" />} label="Random points" />
              <FormControlLabel value="stratified" control={<Radio size="small" />} label="Stratified random" />
            </RadioGroup>
          </FormControl>

          <Box sx={{ mt: 2 }}>
            <Typography gutterBottom>
              Point Count: {options.pointCount}
            </Typography>
            <Slider
              value={options.pointCount}
              onChange={(_, value) => onChange('pointCount', value)}
              min={100}
              max={1000}
              step={50}
              marks={[
                { value: 100, label: '100' },
                { value: 300, label: '300' },
                { value: 500, label: '500' },
                { value: 700, label: '700' },
                { value: 1000, label: '1000' },
              ]}
              valueLabelDisplay="auto"
            />
          </Box>

          {gridDimensions && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {gridDimensions.rows}×{gridDimensions.cols} grid •
              Spacing: {Math.round(gridDimensions.spacingX)}×{Math.round(gridDimensions.spacingY)} px
            </Typography>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={options.offsetByHalfSpacing}
                onChange={(e) => onChange('offsetByHalfSpacing', e.target.checked)}
                size="small"
              />
            }
            label="Offset grid by half-spacing (avoids edges)"
            sx={{ mt: 1 }}
          />
        </Box>

        {/* Right Column - Recommended Points Info */}
        <Paper variant="outlined" sx={{ p: 2, minWidth: 250 }}>
          <Typography variant="subtitle2" gutterBottom>
            Recommended Points
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • 300 points: ±5.0% at 25%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • 400 points: ±4.2% at 25%
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • 500 points: ±3.8% at 25%
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
            (95% confidence interval)
          </Typography>
        </Paper>
      </Box>

      <Divider />

      <Typography variant="subtitle2" color="text.secondary">
        SPOT APPEARANCE
      </Typography>

      <Box sx={{ display: 'flex', gap: 4 }}>
        <Box sx={{ flex: 1 }}>
          <Typography gutterBottom>
            Point Size: {options.pointSize} px
          </Typography>
          <Slider
            value={options.pointSize}
            onChange={(_, value) => onChange('pointSize', value)}
            min={4}
            max={16}
            step={1}
            valueLabelDisplay="auto"
          />
        </Box>

        <Box sx={{ flex: 1 }}>
          <Typography gutterBottom>
            Opacity: {options.opacity}%
          </Typography>
          <Slider
            value={options.opacity}
            onChange={(_, value) => onChange('opacity', value)}
            min={20}
            max={100}
            step={5}
            valueLabelDisplay="auto"
          />
        </Box>

        <Box sx={{ width: 200 }}>
          <TextField
            label="Color"
            type="color"
            value={options.color}
            onChange={(e) => onChange('color', e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              sx: { '& input': { cursor: 'pointer' } },
            }}
          />
        </Box>
      </Box>

      <TextField
        label="Naming Pattern"
        value={options.namingPattern}
        onChange={(e) => onChange('namingPattern', e.target.value)}
        size="small"
        helperText="Use {n} for sequential number"
        sx={{ maxWidth: 300 }}
      />
    </Box>
  );
}

// ============================================================================
// GRAIN DETECTION OPTIONS PANEL (Placeholder for Phase 5)
// ============================================================================

interface GrainDetectionOptionsPanelProps {
  options: GrainDetectionOptions;
  onChange: (key: keyof GrainDetectionOptions, value: unknown) => void;
}

function GrainDetectionOptionsPanel({
  options,
  onChange,
}: GrainDetectionOptionsPanelProps) {
  // Suppress unused warnings - these will be used in Phase 5
  void options;
  void onChange;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        GRAIN DETECTION OPTIONS
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
        }}
      >
        <Stack alignItems="center" spacing={1}>
          <Grain sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography color="text.secondary">
            Grain detection will be implemented in Phase 5
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This feature uses OpenCV.js for edge detection and watershed segmentation.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export default GenerateSpotsDialog;
