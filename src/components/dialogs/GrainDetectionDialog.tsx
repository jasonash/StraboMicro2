/**
 * Grain Detection Dialog
 *
 * Allows users to detect grain boundaries using computer vision (OpenCV.js).
 * Features:
 * - Interactive preview with detected boundaries overlaid
 * - Adjustable detection parameters (sensitivity, min size, edge contrast)
 * - Preset selection for common rock types
 * - Spot generation from detected grains
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Stack,
  Slider,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  Divider,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  FormControlLabel,
  Checkbox,
  TextField,
} from '@mui/material';
import {
  ZoomIn,
  ZoomOut,
  FitScreen,
} from '@mui/icons-material';
import { Stage, Layer, Image as KonvaImage, Line, Rect } from 'react-konva';
import { useAppStore } from '@/store';
import {
  type DetectionSettings,
  type DetectionResult,
  BUILT_IN_PRESETS,
  DEFAULT_DETECTION_SETTINGS,
  DEFAULT_SPOT_GENERATION_OPTIONS,
} from '@/services/grainDetection';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

interface GrainDetectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId: string | null;
}

type LoadingState = 'idle' | 'loading-opencv' | 'loading-image' | 'detecting' | 'ready' | 'error';

// ============================================================================
// CONSTANTS
// ============================================================================

const CANVAS_HEIGHT = 400;
const MAX_ZOOM = 10;
const ZOOM_STEP = 1.2;
const DETECTION_DEBOUNCE_MS = 500;

// Colors for detected grains overlay
const GRAIN_STROKE_COLOR = '#FF9800'; // Orange
const GRAIN_STROKE_WIDTH = 2;
const GRAIN_FILL_COLOR = 'rgba(255, 152, 0, 0.15)';

// ============================================================================
// COMPONENT
// ============================================================================

export function GrainDetectionDialog({
  isOpen,
  onClose,
  micrographId,
}: GrainDetectionDialogProps) {
  // Refs
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Container width (responsive)
  const [containerWidth, setContainerWidth] = useState(600);

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);

  // View state
  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(0.1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointerPos, setLastPointerPos] = useState<{ x: number; y: number } | null>(null);

  // Detection settings
  const [settings, setSettings] = useState<DetectionSettings>(DEFAULT_DETECTION_SETTINGS);
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  // Detection results
  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState({ step: '', percent: 0 });

  // Spot generation options
  const [namingPattern, setNamingPattern] = useState(DEFAULT_SPOT_GENERATION_OPTIONS.namingPattern);
  const [spotColor, setSpotColor] = useState(DEFAULT_SPOT_GENERATION_OPTIONS.color);
  const [spotOpacity, setSpotOpacity] = useState(DEFAULT_SPOT_GENERATION_OPTIONS.opacity);

  // Store
  const project = useAppStore((s) => s.project);
  const micrographIndex = useAppStore((s) => s.micrographIndex);
  const addSpot = useAppStore((s) => s.addSpot);
  const micrograph = micrographId ? micrographIndex.get(micrographId) : null;

  // Image dimensions - use actual loaded image size, not original micrograph size
  // This ensures polygon coordinates align with the displayed image
  const imageWidth = image?.width || micrograph?.imageWidth || micrograph?.width || 1000;
  const imageHeight = image?.height || micrograph?.imageHeight || micrograph?.height || 1000;

  // Canvas dimensions
  const width = containerWidth;
  const height = CANVAS_HEIGHT;

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Measure container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    setContainerWidth(container.clientWidth || 600);

    return () => observer.disconnect();
  }, []);

  // Load OpenCV and image when dialog opens
  useEffect(() => {
    if (!isOpen || !micrograph || !project) return;

    let mounted = true;

    const loadImage = async () => {
      try {
        setLoadingState('loading-image');
        setError(null);
        console.log('[GrainDetection] Loading image...');

        const folderPaths = await window.api?.getProjectFolderPaths(project.id);
        if (!folderPaths || !mounted) {
          throw new Error('Failed to get project paths');
        }

        const imagePath = micrograph.imagePath || '';
        const fullPath = `${folderPaths.images}/${imagePath}`;
        console.log('[GrainDetection] Image path:', fullPath);

        // Load tile data to get hash
        const tileData = await window.api?.loadImageWithTiles(fullPath);
        if (!tileData || !mounted) {
          throw new Error('Failed to load tile data');
        }

        // Load medium resolution for detection
        let dataUrl = await window.api?.loadMedium(tileData.hash);
        if (!dataUrl) {
          console.log('[GrainDetection] No medium, trying thumbnail');
          dataUrl = await window.api?.loadThumbnail(tileData.hash);
        }

        if (!dataUrl || !mounted) {
          throw new Error('Failed to load image data');
        }

        // Create image element
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to decode image'));
          img.src = dataUrl!;
        });

        if (!mounted) return;

        console.log('[GrainDetection] Image loaded:', img.width, 'x', img.height);
        setImage(img);

        // Extract ImageData for detection
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        setImageData(imgData);

        setLoadingState('ready');

        // Run initial detection (Web Worker handles OpenCV loading)
        runDetection(imgData, settings);
      } catch (err) {
        console.error('[GrainDetection] Initialization error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize');
          setLoadingState('error');
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
      // Terminate worker on cleanup
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [isOpen, micrograph, project]);

  // Fit image to canvas when it first loads
  useEffect(() => {
    if (!image || loadingState !== 'ready') return;

    const scaleX = width / image.width;
    const scaleY = height / image.height;
    const initialZoom = Math.min(scaleX, scaleY) * 0.9;
    setZoom(initialZoom);
    setFitZoom(initialZoom);

    const x = (width - image.width * initialZoom) / 2;
    const y = (height - image.height * initialZoom) / 2;
    setPosition({ x, y });
  }, [image, loadingState, width, height]);

  // Debounced detection when settings change
  useEffect(() => {
    if (!imageData || loadingState !== 'ready') return;

    // Clear previous timeout
    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
    }

    // Debounce detection
    detectionTimeoutRef.current = setTimeout(() => {
      runDetection(imageData, settings);
    }, DETECTION_DEBOUNCE_MS);

    return () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [settings, imageData, loadingState]);

  // ============================================================================
  // DETECTION
  // ============================================================================

  const runDetection = useCallback((imgData: ImageData, detectionSettings: DetectionSettings) => {
    console.log('[GrainDetection] Running detection with settings:', detectionSettings);
    setIsDetecting(true);
    setError(null);
    setDetectionProgress({ step: 'Starting...', percent: 0 });

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Create new worker
    const worker = new Worker(
      new URL('@/services/grainDetection/worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data;

      if (message.type === 'progress') {
        setDetectionProgress({ step: message.step, percent: message.percent });
      } else if (message.type === 'result') {
        console.log('[GrainDetection] Detection complete:', message.grains.length, 'grains in', message.processingTimeMs.toFixed(0), 'ms');
        setDetectionResult({
          grains: message.grains,
          processingTimeMs: message.processingTimeMs,
          settings: detectionSettings,
          imageDimensions: message.imageDimensions,
          scaleFactor: message.scaleFactor,
        });
        setIsDetecting(false);
        worker.terminate();
        workerRef.current = null;
      } else if (message.type === 'error') {
        console.error('[GrainDetection] Detection error:', message.message);
        setError(message.message);
        setIsDetecting(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (error) => {
      console.error('[GrainDetection] Worker error:', error);
      setError('Detection worker failed');
      setIsDetecting(false);
      worker.terminate();
      workerRef.current = null;
    };

    // Send detection request to worker
    worker.postMessage({
      type: 'detect',
      imageData: imgData,
      settings: {
        sensitivity: detectionSettings.sensitivity,
        minGrainSize: detectionSettings.minGrainSize,
        edgeContrast: detectionSettings.edgeContrast,
        simplifyOutlines: detectionSettings.simplifyOutlines,
        simplifyTolerance: detectionSettings.simplifyTolerance,
      },
    });
  }, []);

  // ============================================================================
  // SETTINGS HANDLERS
  // ============================================================================

  const handlePresetChange = useCallback((presetId: string) => {
    setSelectedPreset(presetId);

    if (presetId === 'custom') return;

    const preset = BUILT_IN_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSettings({
        ...preset.settings,
        presetName: preset.name,
      });
    }
  }, []);

  const handleSettingChange = useCallback((key: keyof DetectionSettings, value: number | boolean) => {
    setSelectedPreset('custom');
    setSettings((prev) => ({
      ...prev,
      [key]: value,
      presetName: 'custom',
    }));
  }, []);

  // ============================================================================
  // VIEW CONTROLS
  // ============================================================================

  const handleFitToScreen = useCallback(() => {
    const scaleX = width / imageWidth;
    const scaleY = height / imageHeight;
    const newZoom = Math.min(scaleX, scaleY) * 0.9;
    setZoom(newZoom);
    setFitZoom(newZoom);

    const x = (width - imageWidth * newZoom) / 2;
    const y = (height - imageHeight * newZoom) / 2;
    setPosition({ x, y });
  }, [width, height, imageWidth, imageHeight]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / ZOOM_STEP, fitZoom));
  }, [fitZoom]);

  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldZoom = zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - position.x) / oldZoom,
      y: (pointer.y - position.y) / oldZoom,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newZoom = direction > 0
      ? Math.min(oldZoom * ZOOM_STEP, MAX_ZOOM)
      : Math.max(oldZoom / ZOOM_STEP, fitZoom);

    const newPos = {
      x: pointer.x - mousePointTo.x * newZoom,
      y: pointer.y - mousePointTo.y * newZoom,
    };

    setZoom(newZoom);
    setPosition(newPos);
  }, [zoom, position, fitZoom]);

  const handleMouseDown = useCallback((e: any) => {
    if (e.evt.button !== 0) return;
    setIsPanning(true);
    const stage = stageRef.current;
    if (stage) {
      setLastPointerPos(stage.getPointerPosition());
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    if (!isPanning || !lastPointerPos) return;
    const stage = stageRef.current;
    if (!stage) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;

    const dx = pos.x - lastPointerPos.x;
    const dy = pos.y - lastPointerPos.y;

    setPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
    setLastPointerPos(pos);
  }, [isPanning, lastPointerPos]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setLastPointerPos(null);
  }, []);

  // ============================================================================
  // SPOT GENERATION
  // ============================================================================

  const handleGenerate = useCallback(() => {
    if (!detectionResult || !micrographId) return;

    const grains = detectionResult.grains;
    console.log('[GrainDetection] Generating', grains.length, 'spots');

    // Create spots from detected grains
    grains.forEach((grain, index) => {
      const spotName = namingPattern.replace('{n}', String(index + 1));

      // Convert contour to spot points format
      const points = grain.contour.map((p) => ({ X: p.x, Y: p.y }));

      addSpot(micrographId, {
        id: uuidv4(),
        name: spotName,
        geometryType: 'polygon',
        points,
        color: spotColor,
        opacity: Math.round(spotOpacity * 100), // Convert 0-1 to 0-100 for SpotRenderer
        // Mark as generated by grain detection
        generationMethod: 'grain-detection' as const,
        generationTimestamp: new Date().toISOString(),
        areaPixels: grain.area,
        centroid: { X: grain.centroid.x, Y: grain.centroid.y },
      });
    });

    console.log('[GrainDetection] Generated', grains.length, 'spots');
    onClose();
  }, [detectionResult, micrographId, namingPattern, spotColor, spotOpacity, addSpot, onClose]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const grainCount = detectionResult?.grains.length ?? 0;
  const processingTime = detectionResult?.processingTimeMs ?? 0;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Grain Detection</Typography>
          {micrograph && (
            <Typography variant="body2" color="text.secondary">
              {micrograph.name}
            </Typography>
          )}
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {/* Error display */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Preview Canvas */}
          <Box ref={containerRef} sx={{ width: '100%' }}>
            <Box sx={{ position: 'relative', width, height, bgcolor: 'grey.900', borderRadius: 1 }}>
              {/* Loading overlay */}
              {(loadingState === 'loading-opencv' || loadingState === 'loading-image') && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20,
                    bgcolor: 'rgba(0,0,0,0.7)',
                  }}
                >
                  <CircularProgress size={40} />
                  <Typography color="white" sx={{ mt: 2 }}>
                    {loadingState === 'loading-opencv' ? 'Loading OpenCV.js...' : 'Loading image...'}
                  </Typography>
                </Box>
              )}

              {/* Detecting overlay - covers entire image */}
              {isDetecting && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 15,
                    bgcolor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <CircularProgress size={48} sx={{ color: 'white' }} />
                  <Typography variant="body1" color="white" fontWeight="medium">
                    Detecting grains...
                  </Typography>
                  <Typography variant="body2" color="rgba(255,255,255,0.8)">
                    {detectionProgress.step || 'Starting...'}
                  </Typography>
                  {detectionProgress.percent > 0 && (
                    <Box sx={{ width: 200, mt: 1 }}>
                      <Box
                        sx={{
                          height: 4,
                          bgcolor: 'rgba(255,255,255,0.2)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            height: '100%',
                            width: `${detectionProgress.percent}%`,
                            bgcolor: 'primary.main',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              {/* Zoom controls */}
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 10,
                  bgcolor: 'rgba(0, 0, 0, 0.6)',
                  borderRadius: 1,
                  p: 0.5,
                }}
              >
                <Tooltip title="Zoom In">
                  <IconButton size="small" onClick={handleZoomIn} sx={{ color: 'white' }}>
                    <ZoomIn fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Zoom Out">
                  <IconButton size="small" onClick={handleZoomOut} sx={{ color: 'white' }}>
                    <ZoomOut fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Fit to View">
                  <IconButton size="small" onClick={handleFitToScreen} sx={{ color: 'white' }}>
                    <FitScreen fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              {/* Status indicators */}
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  zIndex: 10,
                  bgcolor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                }}
              >
                {grainCount} grains detected
                {processingTime > 0 && ` • ${processingTime.toFixed(0)}ms`}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  zIndex: 10,
                  bgcolor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  px: 1,
                  py: 0.25,
                  borderRadius: 0.5,
                }}
              >
                {Math.round(zoom * 100)}%
              </Typography>

              {/* Canvas */}
              {loadingState === 'ready' && (
                <Stage
                  ref={stageRef}
                  width={width}
                  height={height}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                >
                  {/* Background */}
                  <Layer>
                    <Rect x={0} y={0} width={width} height={height} fill="#1a1a1a" />
                  </Layer>

                  {/* Image and grains layer */}
                  <Layer x={position.x} y={position.y} scaleX={zoom} scaleY={zoom}>
                    {/* Micrograph image */}
                    {image && (
                      <KonvaImage
                        image={image}
                        x={0}
                        y={0}
                        width={imageWidth}
                        height={imageHeight}
                      />
                    )}

                    {/* Detected grain polygons */}
                    {detectionResult?.grains.map((grain) => {
                      // Flatten contour for Konva Line
                      const flatPoints = grain.contour.flatMap((p) => [p.x, p.y]);
                      const strokeWidth = GRAIN_STROKE_WIDTH / zoom;

                      return (
                        <Line
                          key={grain.tempId}
                          points={flatPoints}
                          closed
                          stroke={GRAIN_STROKE_COLOR}
                          strokeWidth={strokeWidth}
                          fill={GRAIN_FILL_COLOR}
                          listening={false}
                        />
                      );
                    })}
                  </Layer>
                </Stage>
              )}
            </Box>
          </Box>

          <Divider />

          {/* Detection Settings */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Detection Settings
            </Typography>

            <Stack spacing={2}>
              {/* Preset selector */}
              <FormControl size="small" fullWidth>
                <FormLabel sx={{ mb: 0.5, fontSize: '0.875rem' }}>Preset</FormLabel>
                <Select
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <MenuItem value="custom">Custom</MenuItem>
                  <Divider />
                  {BUILT_IN_PRESETS.map((preset) => (
                    <MenuItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Sensitivity slider */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormLabel sx={{ fontSize: '0.875rem' }}>
                    Sensitivity
                  </FormLabel>
                  <Typography variant="caption" color="text.secondary">
                    {settings.sensitivity}%
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary">Fewer</Typography>
                  <Slider
                    value={settings.sensitivity}
                    onChange={(_, v) => handleSettingChange('sensitivity', v as number)}
                    min={0}
                    max={100}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">More</Typography>
                </Stack>
              </Box>

              {/* Min grain size slider */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormLabel sx={{ fontSize: '0.875rem' }}>
                    Minimum Grain Size
                  </FormLabel>
                  <Typography variant="caption" color="text.secondary">
                    {settings.minGrainSize} px²
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary">Small</Typography>
                  <Slider
                    value={settings.minGrainSize}
                    onChange={(_, v) => handleSettingChange('minGrainSize', v as number)}
                    min={10}
                    max={500}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">Large</Typography>
                </Stack>
              </Box>

              {/* Edge contrast slider */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormLabel sx={{ fontSize: '0.875rem' }}>
                    Edge Contrast
                  </FormLabel>
                  <Typography variant="caption" color="text.secondary">
                    {settings.edgeContrast}%
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary">Soft</Typography>
                  <Slider
                    value={settings.edgeContrast}
                    onChange={(_, v) => handleSettingChange('edgeContrast', v as number)}
                    min={0}
                    max={100}
                    size="small"
                  />
                  <Typography variant="caption" color="text.secondary">Sharp</Typography>
                </Stack>
              </Box>

              {/* Simplify outlines checkbox */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.simplifyOutlines}
                    onChange={(e) => handleSettingChange('simplifyOutlines', e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    Simplify outlines (fewer vertices)
                  </Typography>
                }
              />
            </Stack>
          </Box>

          <Divider />

          {/* Spot Generation Options */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Spot Generation
            </Typography>

            <Stack spacing={2}>
              {/* Naming pattern */}
              <TextField
                label="Naming Pattern"
                value={namingPattern}
                onChange={(e) => setNamingPattern(e.target.value)}
                size="small"
                fullWidth
                helperText="Use {n} for sequential number"
              />

              {/* Color picker */}
              <Stack direction="row" spacing={2} alignItems="center">
                <FormLabel sx={{ fontSize: '0.875rem', minWidth: 60 }}>Color</FormLabel>
                <input
                  type="color"
                  value={spotColor}
                  onChange={(e) => setSpotColor(e.target.value)}
                  style={{ width: 40, height: 30, border: 'none', cursor: 'pointer' }}
                />
                <TextField
                  value={spotColor}
                  onChange={(e) => setSpotColor(e.target.value)}
                  size="small"
                  sx={{ width: 100 }}
                />
              </Stack>

              {/* Opacity slider */}
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <FormLabel sx={{ fontSize: '0.875rem' }}>Opacity</FormLabel>
                  <Typography variant="caption" color="text.secondary">
                    {Math.round(spotOpacity * 100)}%
                  </Typography>
                </Stack>
                <Slider
                  value={spotOpacity}
                  onChange={(_, v) => setSpotOpacity(v as number)}
                  min={0}
                  max={1}
                  step={0.05}
                  size="small"
                />
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={!detectionResult || detectionResult.grains.length === 0 || isDetecting}
        >
          Generate {grainCount} Spots
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default GrainDetectionDialog;
