/**
 * StraboTools Dialog
 *
 * A full-screen modal providing 4 geological image analysis tools:
 * - Edge Fabric: gradient-based fabric orientation analysis
 * - Color Index: threshold-based mineral area measurement
 * - Edge Detect: Sobel edge detection visualization
 * - Mode Tool: K-means color phase segmentation
 *
 * Follows the ImageComparatorDialog pattern for the full-screen modal,
 * micrograph selector with thumbnails, and image loading via loadMedium.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Dialog,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  Tab,
  Tabs,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Avatar,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LayersIcon from '@mui/icons-material/Layers';
import { useAppStore } from '@/store';
import {
  toGrayscale,
  applySobel,
  edgeDetect,
  edgeFabric,
  renderEdgeFabricImage,
  buildIntegralImage,
  buildAvgMatrix,
  colorIndexGlobal,
  colorIndexAdaptive,
  kMeansClustering,
  PHASE_COLORS,
  PHASE_NAMES,
} from '@/services/straboToolsProcessing';
import type { SobelResult, EdgeFabricResult, HighlightColor } from '@/services/straboToolsProcessing';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StraboToolsDialogProps {
  open: boolean;
  onClose: () => void;
  initialMicrographId?: string | null;
}

type ToolTab = 'edge-fabric' | 'color-index' | 'edge-detect' | 'mode';

interface MicrographOption {
  id: string;
  name: string;
  sampleName?: string;
  datasetName?: string;
  thumbnail?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StraboToolsDialog({ open, onClose, initialMicrographId }: StraboToolsDialogProps) {
  const project = useAppStore((state) => state.project);

  // Tab state
  const [activeTab, setActiveTab] = useState<ToolTab>('edge-fabric');

  // Micrograph selection
  const [selectedMicrographId, setSelectedMicrographId] = useState<string | null>(null);
  const [micrographOptions, setMicrographOptions] = useState<MicrographOption[]>([]);

  // Image loading
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Canvas refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Store the original ImageData for processing
  const originalImageDataRef = useRef<ImageData | null>(null);
  // Cached Sobel results (shared between Edge Detect and Edge Fabric)
  const sobelResultRef = useRef<SobelResult | null>(null);

  // Cached Edge Fabric result
  const fabricResultRef = useRef<EdgeFabricResult | null>(null);

  // Edge Detect state
  const [edgeThreshold, setEdgeThreshold] = useState(128);

  // Color Index state
  const [ciThreshold, setCiThreshold] = useState(128);
  const [ciAdaptive, setCiAdaptive] = useState(false);
  const [ciHighlightColor, setCiHighlightColor] = useState<HighlightColor>('red');
  const [ciPercentage, setCiPercentage] = useState(0);

  // Cached Color Index data (integral image + average matrix)
  const grayDataRef = useRef<Float32Array | null>(null);
  const avgMatrixRef = useRef<Float64Array | null>(null);

  // Mode Tool state
  const [modeNumPhases, setModeNumPhases] = useState(4);
  const [modePercentages, setModePercentages] = useState<number[]>([]);

  // ─── Reset state when dialog opens ───────────────────────────────────────

  useEffect(() => {
    if (open) {
      setActiveTab('edge-fabric');
      setSelectedMicrographId(initialMicrographId || null);
      setImageLoaded(false);
      setEdgeThreshold(128);
      setCiThreshold(128);
      setCiAdaptive(false);
      setCiHighlightColor('red');
      setCiPercentage(0);
      setModeNumPhases(4);
      setModePercentages([]);
      originalImageDataRef.current = null;

      sobelResultRef.current = null;
      fabricResultRef.current = null;
      grayDataRef.current = null;
      avgMatrixRef.current = null;
    }
  }, [open, initialMicrographId]);

  // ─── Build micrograph options with thumbnails ────────────────────────────

  useEffect(() => {
    if (!open || !project) {
      setMicrographOptions([]);
      return;
    }

    const buildOptions = async () => {
      const options: MicrographOption[] = [];
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);

      for (const dataset of project.datasets || []) {
        for (const sample of dataset.samples || []) {
          for (const micro of sample.micrographs || []) {
            options.push({
              id: micro.id,
              name: micro.name || 'Unnamed',
              sampleName: sample.label || sample.sampleID || undefined,
              datasetName: dataset.name || undefined,
            });
          }
        }
      }

      // Load thumbnails in parallel
      if (folderPaths) {
        const thumbnailPromises = options.map(async (option) => {
          try {
            const imagePath = `${folderPaths.images}/${option.id}`;
            const cacheInfo = await window.api?.checkImageCache(imagePath);
            if (cacheInfo?.cached && cacheInfo.hash) {
              const dataUrl = await window.api?.loadThumbnail(cacheInfo.hash);
              return { id: option.id, dataUrl };
            }
          } catch {
            // Ignore thumbnail load errors
          }
          return null;
        });

        const results = await Promise.all(thumbnailPromises);
        for (const result of results) {
          if (result?.dataUrl) {
            const option = options.find((o) => o.id === result.id);
            if (option) {
              option.thumbnail = result.dataUrl;
            }
          }
        }
      }

      setMicrographOptions(options);
    };

    buildOptions();
  }, [open, project]);

  // ─── Canvas resize observer ──────────────────────────────────────────────

  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const updateSize = () => {
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setCanvasSize({ width: rect.width, height: rect.height });
        }
      }
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasContainerRef.current);

    return () => observer.disconnect();
  }, [open]);

  // ─── Load selected micrograph image ──────────────────────────────────────

  const loadMicrographImage = useCallback(async (micrographId: string) => {
    if (!project) return;

    setIsLoading(true);
    setImageLoaded(false);
    originalImageDataRef.current = null;
    sobelResultRef.current = null;
    fabricResultRef.current = null;
    grayDataRef.current = null;
    avgMatrixRef.current = null;

    try {
      const folderPaths = await window.api?.getProjectFolderPaths(project.id);
      if (!folderPaths) return;

      const imagePath = `${folderPaths.images}/${micrographId}`;
      const tileResult = await window.api?.loadImageWithTiles(imagePath);
      if (!tileResult?.hash) return;

      // Load the 2048px medium resolution image
      const mediumDataUrl = await window.api?.loadMedium(tileResult.hash);
      if (!mediumDataUrl) return;

      // Load into an Image element
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load medium image'));
        img.src = mediumDataUrl;
      });

      // Draw to offscreen canvas to get ImageData
      const offscreen = document.createElement('canvas');
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      offCtx.drawImage(img, 0, 0);
      const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);

      originalImageDataRef.current = imageData;


      setImageLoaded(true);
    } catch (err) {
      console.error('StraboTools: Failed to load micrograph:', err);
    } finally {
      setIsLoading(false);
    }
  }, [project]);

  // ─── Draw ImageData to display canvas (scaled to fit) ───────────────────

  const drawImageDataToCanvas = useCallback((imageData: ImageData) => {
    const canvas = displayCanvasRef.current;
    const container = canvasContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read container's actual dimensions directly to avoid stale canvasSize state
    // (on first open, the ResizeObserver may not have fired yet)
    const rect = container.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    if (cw <= 0 || ch <= 0) return;

    const imgW = imageData.width;
    const imgH = imageData.height;

    // Set canvas bitmap to actual container size
    canvas.width = cw;
    canvas.height = ch;

    // Calculate fit scale
    const scaleX = cw / imgW;
    const scaleY = ch / imgH;
    const scale = Math.min(scaleX, scaleY) * 0.95;

    // Center the image
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (cw - drawW) / 2;
    const offsetY = (ch - drawH) / 2;

    // Clear and draw
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create a temporary canvas with the imageData to draw scaled
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgW;
    tempCanvas.height = imgH;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, offsetX, offsetY, drawW, drawH);
    }
  }, []);

  // ─── Ensure Sobel results are computed (cached) ────────────────────────

  const ensureSobelResult = useCallback((): SobelResult | null => {
    if (sobelResultRef.current) return sobelResultRef.current;

    const imageData = originalImageDataRef.current;
    if (!imageData) return null;

    const gray = toGrayscale(imageData);
    const result = applySobel(gray, imageData.width, imageData.height);
    sobelResultRef.current = result;
    return result;
  }, []);

  // ─── Render current tab's visualization ────────────────────────────────

  // ─── Ensure Edge Fabric result is computed (cached) ─────────────────────

  const ensureFabricResult = useCallback((): EdgeFabricResult | null => {
    if (fabricResultRef.current) return fabricResultRef.current;

    const sobel = ensureSobelResult();
    if (!sobel) return null;

    const result = edgeFabric(sobel.gx, sobel.gy, sobel.width, sobel.height);
    fabricResultRef.current = result;
    return result;
  }, [ensureSobelResult]);

  // ─── Ensure grayscale + avgMatrix are computed (cached for Color Index) ──

  const ensureColorIndexData = useCallback(() => {
    const imageData = originalImageDataRef.current;
    if (!imageData) return;

    if (!grayDataRef.current) {
      grayDataRef.current = toGrayscale(imageData);
    }
    if (!avgMatrixRef.current) {
      const ii = buildIntegralImage(grayDataRef.current, imageData.width, imageData.height);
      avgMatrixRef.current = buildAvgMatrix(ii, imageData.width, imageData.height);
    }
  }, []);

  const renderCurrentVisualization = useCallback(() => {
    if (!imageLoaded || !originalImageDataRef.current) return;

    switch (activeTab) {
      case 'edge-detect': {
        const sobel = ensureSobelResult();
        if (!sobel) return;
        const result = edgeDetect(sobel.magnitude, sobel.width, sobel.height, edgeThreshold);
        drawImageDataToCanvas(result);
        break;
      }
      case 'edge-fabric': {
        const sobel = ensureSobelResult();
        const fabric = ensureFabricResult();
        if (!sobel || !fabric) return;
        const result = renderEdgeFabricImage(sobel, fabric);
        drawImageDataToCanvas(result);
        break;
      }
      case 'color-index': {
        ensureColorIndexData();
        const imageData = originalImageDataRef.current;
        const gray = grayDataRef.current;
        const avgMatrix = avgMatrixRef.current;
        if (!imageData) break;

        if (ciAdaptive && gray && avgMatrix) {
          const { resultImage, percentage } = colorIndexAdaptive(
            imageData, gray, avgMatrix, ciThreshold, ciHighlightColor,
          );
          drawImageDataToCanvas(resultImage);
          setCiPercentage(percentage);
        } else {
          const { resultImage, percentage } = colorIndexGlobal(
            imageData, ciThreshold, ciHighlightColor,
          );
          drawImageDataToCanvas(resultImage);
          setCiPercentage(percentage);
        }
        break;
      }
      case 'mode': {
        const imageData = originalImageDataRef.current;
        if (!imageData) break;
        const { resultImage, phasePercentages } = kMeansClustering(imageData, modeNumPhases);
        drawImageDataToCanvas(resultImage);
        setModePercentages(phasePercentages);
        break;
      }
      default:
        drawImageDataToCanvas(originalImageDataRef.current);
        break;
    }
  }, [activeTab, edgeThreshold, ciThreshold, ciAdaptive, ciHighlightColor, modeNumPhases, imageLoaded, ensureSobelResult, ensureFabricResult, ensureColorIndexData, drawImageDataToCanvas]);

  // Redraw when canvas size, tab, or tool params change
  useEffect(() => {
    if (imageLoaded) {
      renderCurrentVisualization();
    }
  }, [imageLoaded, renderCurrentVisualization, canvasSize]);

  // Load image when micrograph selection changes
  useEffect(() => {
    if (selectedMicrographId && open) {
      loadMicrographImage(selectedMicrographId);
    }
  }, [selectedMicrographId, open, loadMicrographImage]);

  // ─── Handle micrograph selection ─────────────────────────────────────────

  const handleMicrographChange = useCallback((newId: string | null) => {
    setSelectedMicrographId(newId);
    setImageLoaded(false);
    originalImageDataRef.current = null;
    sobelResultRef.current = null;
    fabricResultRef.current = null;
    grayDataRef.current = null;
    avgMatrixRef.current = null;
  }, []);

  // ─── Handle tab change ──────────────────────────────────────────────────

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: ToolTab) => {
    setActiveTab(newValue);
  }, []);

  // ─── Handle escape key ──────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ─── Tab content renderers ──────────────────────────────────────────────

  const renderTabContent = () => {
    if (!imageLoaded) return null;

    switch (activeTab) {
      case 'edge-fabric': {
        const fabric = fabricResultRef.current;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, px: 3, py: 1.5 }}>
            <Typography variant="body2">
              <strong>Azimuth:</strong> {fabric ? fabric.azimuth.toFixed(2) : '—'}°
            </Typography>
            <Typography variant="body2">
              <strong>Axial Ratio:</strong> {fabric ? fabric.axialRatio.toFixed(2) : '—'}
            </Typography>
          </Box>
        );
      }
      case 'color-index':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap', minWidth: 70 }}>
              Threshold
            </Typography>
            <Slider
              value={ciThreshold}
              onChange={(_, value) => setCiThreshold(value as number)}
              min={0}
              max={255}
              valueLabelDisplay="auto"
              sx={{ flex: 1, minWidth: 150, maxWidth: 300 }}
            />
            <Typography variant="body2" sx={{ minWidth: 30, textAlign: 'right' }}>
              {ciThreshold}
            </Typography>
            <ToggleButtonGroup
              value={ciAdaptive ? 'adaptive' : 'global'}
              exclusive
              onChange={(_, val) => { if (val) setCiAdaptive(val === 'adaptive'); }}
              size="small"
            >
              <ToggleButton value="global">Global</ToggleButton>
              <ToggleButton value="adaptive">Adaptive</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              value={ciHighlightColor}
              exclusive
              onChange={(_, val) => { if (val) setCiHighlightColor(val as HighlightColor); }}
              size="small"
            >
              <ToggleButton value="red" sx={{ color: 'error.main' }}>Red</ToggleButton>
              <ToggleButton value="blue" sx={{ color: 'info.main' }}>Blue</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ fontWeight: 'bold', ml: 1 }}>
              Color Index: {ciPercentage.toFixed(1)}%
            </Typography>
          </Box>
        );
      case 'edge-detect':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5 }}>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap', minWidth: 70 }}>
              Threshold
            </Typography>
            <Slider
              value={edgeThreshold}
              onChange={(_, value) => setEdgeThreshold(value as number)}
              min={0}
              max={255}
              valueLabelDisplay="auto"
              sx={{ flex: 1, maxWidth: 400 }}
            />
            <Typography variant="body2" sx={{ minWidth: 30, textAlign: 'right' }}>
              {edgeThreshold}
            </Typography>
          </Box>
        );
      case 'mode':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              Number of Phases
            </Typography>
            <ToggleButtonGroup
              value={modeNumPhases}
              exclusive
              onChange={(_, val) => { if (val !== null) setModeNumPhases(val as number); }}
              size="small"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <ToggleButton key={n} value={n}>{n}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            {modePercentages.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 2 }}>
                {modePercentages.map((pct, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box
                      sx={{
                        width: 14,
                        height: 14,
                        borderRadius: '2px',
                        bgcolor: `rgb(${PHASE_COLORS[i][0]},${PHASE_COLORS[i][1]},${PHASE_COLORS[i][2]})`,
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                    <Typography variant="caption">
                      {PHASE_NAMES[i]}: {pct.toFixed(1)}%
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{
        sx: { bgcolor: 'background.default' },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
          StraboTools
        </Typography>

        {/* Micrograph selector */}
        <FormControl size="small" sx={{ minWidth: 300 }}>
          <Select
            value={selectedMicrographId || ''}
            onChange={(e) => handleMicrographChange(e.target.value || null)}
            displayEmpty
            renderValue={(selected) => {
              if (!selected) return <em>Select micrograph...</em>;
              const option = micrographOptions.find((o) => o.id === selected);
              return option?.name || 'Unknown';
            }}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {micrographOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Avatar
                    src={option.thumbnail}
                    variant="rounded"
                    sx={{ width: 32, height: 32 }}
                  >
                    <LayersIcon fontSize="small" />
                  </Avatar>
                </ListItemIcon>
                <ListItemText
                  primary={option.name}
                  secondary={option.sampleName}
                  primaryTypographyProps={{ noWrap: true }}
                  secondaryTypographyProps={{ noWrap: true }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Tooltip title="Close (Escape)">
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tab bar */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="standard"
          sx={{ minHeight: 40, px: 1 }}
        >
          <Tab label="Edge Fabric" value="edge-fabric" sx={{ minHeight: 40, py: 0 }} />
          <Tab label="Color Index" value="color-index" sx={{ minHeight: 40, py: 0 }} />
          <Tab label="Edge Detect" value="edge-detect" sx={{ minHeight: 40, py: 0 }} />
          <Tab label="Mode" value="mode" sx={{ minHeight: 40, py: 0 }} />
        </Tabs>
      </Box>

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Canvas area */}
        <Box
          ref={canvasContainerRef}
          sx={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLoading && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                bgcolor: 'rgba(0, 0, 0, 0.5)',
              }}
            >
              <CircularProgress />
            </Box>
          )}

          {!selectedMicrographId && !isLoading && (
            <Typography variant="body1" color="text.secondary">
              Select a micrograph to begin analysis
            </Typography>
          )}

          <canvas
            ref={displayCanvasRef}
            style={{
              display: imageLoaded ? 'block' : 'none',
              width: '100%',
              height: '100%',
            }}
          />
        </Box>

        {/* Tool-specific controls (below canvas) */}
        {renderTabContent()}
      </Box>
    </Dialog>
  );
}
