/**
 * Set Scale Dialog
 *
 * Dialog for setting the scale of a batch-imported reference micrograph.
 * Batch-imported micrographs don't have scale information - when clicked,
 * this dialog prompts the user to set the scale.
 *
 * Scale methods supported:
 * - Trace Scale Bar
 * - Pixel Conversion Factor
 * - Provide Width/Height of Image
 */

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  RadioGroup,
  Radio,
  FormControlLabel,
  TextField,
  MenuItem,
  Box,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { PanTool, Timeline, RestartAlt } from '@mui/icons-material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import { ScaleBarCanvas, type ScaleBarCanvasRef } from '../ScaleBarCanvas';
import type { MicrographMetadata } from '@/types/project-types';

interface SetScaleDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string;
}

type ScaleMethod = 'Trace Scale Bar' | 'Pixel Conversion Factor' | 'Provide Width/Height of Image';
type CanvasTool = 'pointer' | 'line';

export function SetScaleDialog({ open, onClose, micrographId }: SetScaleDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);

  // State
  const [step, setStep] = useState(0); // 0 = scale method, 1 = scale input
  const [scaleMethod, setScaleMethod] = useState<ScaleMethod>('Trace Scale Bar');
  const [micrograph, setMicrograph] = useState<MicrographMetadata | null>(null);
  const [micrographPreviewUrl, setMicrographPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Canvas tool
  const [canvasTool, setCanvasTool] = useState<CanvasTool>('pointer');
  const canvasRef = useRef<ScaleBarCanvasRef>(null);

  // Scale input state - Trace Scale Bar
  const [scaleBarLineLengthPixels, setScaleBarLineLengthPixels] = useState('');
  const [scaleBarPhysicalLength, setScaleBarPhysicalLength] = useState('');
  const [scaleBarUnits, setScaleBarUnits] = useState('μm');

  // Scale input state - Pixel Conversion Factor
  const [pixels, setPixels] = useState('');
  const [physicalLength, setPhysicalLength] = useState('');
  const [pixelUnits, setPixelUnits] = useState('μm');

  // Scale input state - Width/Height
  const [imageWidthPhysical, setImageWidthPhysical] = useState('');
  const [imageHeightPhysical, setImageHeightPhysical] = useState('');
  const [sizeUnits, setSizeUnits] = useState('μm');

  const units = ['μm', 'mm', 'cm', 'm', 'inches'];

  // Load micrograph data
  useEffect(() => {
    if (!open || !project || !micrographId) return;

    const foundMicrograph = findMicrographById(project, micrographId);
    if (foundMicrograph) {
      setMicrograph(foundMicrograph);
    }
  }, [open, project, micrographId]);

  // Load micrograph preview
  useEffect(() => {
    if (!micrograph || !project || !window.api) return;

    const loadPreview = async () => {
      setIsLoadingPreview(true);
      try {
        const paths = await window.api!.getProjectFolderPaths(project.id);
        const imagePath = `${paths.images}/${micrograph.id}.jpg`;

        const tileResult = await window.api!.loadImageWithTiles(imagePath);
        const mediumDataUrl = await window.api!.loadMedium(tileResult.hash);
        setMicrographPreviewUrl(mediumDataUrl);
      } catch (error) {
        console.error('[SetScaleDialog] Failed to load preview:', error);
      } finally {
        setIsLoadingPreview(false);
      }
    };

    loadPreview();
  }, [micrograph, project]);

  const handleSave = () => {
    if (!micrograph) return;

    // Calculate scalePixelsPerCentimeter based on method
    let scalePixelsPerCentimeter = 100; // Default fallback

    const conversionToCm: { [key: string]: number } = {
      'μm': 10000,
      'mm': 10,
      'cm': 1,
      'm': 0.01,
      'inches': 0.393701,
    };

    if (scaleMethod === 'Trace Scale Bar' && scaleBarLineLengthPixels && scaleBarPhysicalLength) {
      const lineLengthPx = parseFloat(scaleBarLineLengthPixels);
      const physicalLen = parseFloat(scaleBarPhysicalLength);
      const pixelsPerUnit = lineLengthPx / physicalLen;
      scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[scaleBarUnits] || 1);
    } else if (scaleMethod === 'Pixel Conversion Factor' && pixels && physicalLength) {
      const px = parseFloat(pixels);
      const physicalLen = parseFloat(physicalLength);
      const pixelsPerUnit = px / physicalLen;
      scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[pixelUnits] || 1);
    } else if (scaleMethod === 'Provide Width/Height of Image' && micrograph.imageWidth) {
      if (imageWidthPhysical) {
        const imageWidthPhys = parseFloat(imageWidthPhysical);
        const pixelsPerUnit = micrograph.imageWidth / imageWidthPhys;
        scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[sizeUnits] || 1);
      } else if (imageHeightPhysical && micrograph.imageHeight) {
        const imageHeightPhys = parseFloat(imageHeightPhysical);
        const pixelsPerUnit = micrograph.imageHeight / imageHeightPhys;
        scalePixelsPerCentimeter = pixelsPerUnit * (conversionToCm[sizeUnits] || 1);
      }
    }

    // Update micrograph with scale
    updateMicrographMetadata(micrograph.id, {
      scalePixelsPerCentimeter,
    });

    console.log('[SetScaleDialog] Saved scale:', scalePixelsPerCentimeter);
    handleClose();
  };

  const handleClose = () => {
    setStep(0);
    setScaleMethod('Trace Scale Bar');
    setScaleBarLineLengthPixels('');
    setScaleBarPhysicalLength('');
    setScaleBarUnits('μm');
    setPixels('');
    setPhysicalLength('');
    setPixelUnits('μm');
    setImageWidthPhysical('');
    setImageHeightPhysical('');
    setSizeUnits('μm');
    setCanvasTool('pointer');
    onClose();
  };

  const canProceed = () => {
    if (step === 0) return true;

    if (step === 1) {
      if (scaleMethod === 'Trace Scale Bar') {
        return scaleBarLineLengthPixels !== '' && scaleBarPhysicalLength !== '';
      } else if (scaleMethod === 'Pixel Conversion Factor') {
        return pixels !== '' && physicalLength !== '';
      } else if (scaleMethod === 'Provide Width/Height of Image') {
        return imageWidthPhysical !== '' || imageHeightPhysical !== '';
      }
    }
    return false;
  };

  const renderScaleMethodStep = () => (
    <Stack spacing={3}>
      <Typography variant="h6">Select Scale Method</Typography>
      <Typography variant="body2" color="text.secondary">
        Choose how you want to define the scale for this micrograph.
      </Typography>

      <RadioGroup
        value={scaleMethod}
        onChange={(e) => setScaleMethod(e.target.value as ScaleMethod)}
      >
        <FormControlLabel
          value="Trace Scale Bar"
          control={<Radio />}
          label="Trace Scale Bar"
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
          Draw a line over the scale bar in the image and enter its physical length.
        </Typography>

        <FormControlLabel
          value="Pixel Conversion Factor"
          control={<Radio />}
          label="Pixel Conversion Factor"
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
          Enter a known pixel-to-physical conversion (e.g., 100 pixels = 10 μm).
        </Typography>

        <FormControlLabel
          value="Provide Width/Height of Image"
          control={<Radio />}
          label="Provide Width/Height of Image"
        />
        <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 2 }}>
          Enter the physical dimensions of the entire image.
        </Typography>
      </RadioGroup>
    </Stack>
  );

  const renderScaleInputStep = () => {
    if (scaleMethod === 'Trace Scale Bar') {
      return (
        <Stack spacing={2}>
          <Typography variant="h6">Trace Scale Bar</Typography>
          <Typography variant="body2" color="text.secondary">
            Draw a line over the scale bar in the micrograph, then enter the physical length.
          </Typography>

          {/* Toolbar */}
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              alignItems: 'center',
              p: 1.5,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: 'background.paper',
            }}
          >
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Pointer Tool (Pan/Zoom)">
                <IconButton
                  size="small"
                  onClick={() => setCanvasTool('pointer')}
                  color={canvasTool === 'pointer' ? 'primary' : 'default'}
                >
                  <PanTool />
                </IconButton>
              </Tooltip>

              <Tooltip title="Line Tool (Draw Scale Bar)">
                <IconButton
                  size="small"
                  onClick={() => setCanvasTool('line')}
                  color={canvasTool === 'line' ? 'primary' : 'default'}
                >
                  <Timeline />
                </IconButton>
              </Tooltip>

              <Tooltip title="Reset Zoom">
                <IconButton size="small" onClick={() => canvasRef.current?.resetZoom()}>
                  <RestartAlt />
                </IconButton>
              </Tooltip>
            </Stack>

            <Divider orientation="vertical" flexItem />

            <TextField
              required
              label="Line Length (pixels)"
              value={scaleBarLineLengthPixels}
              InputProps={{ readOnly: true }}
              size="small"
              sx={{ width: 180 }}
            />

            <TextField
              required
              label="Physical Length"
              type="number"
              value={scaleBarPhysicalLength}
              onChange={(e) => setScaleBarPhysicalLength(e.target.value)}
              size="small"
              sx={{ width: 150 }}
            />

            <TextField
              select
              required
              label="Units"
              value={scaleBarUnits}
              onChange={(e) => setScaleBarUnits(e.target.value)}
              size="small"
              sx={{ width: 100 }}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Canvas */}
          {micrographPreviewUrl ? (
            <ScaleBarCanvas
              ref={canvasRef}
              imageUrl={micrographPreviewUrl}
              originalWidth={micrograph?.imageWidth || 1000}
              originalHeight={micrograph?.imageHeight || 1000}
              showToolbar={false}
              currentTool={canvasTool}
              onToolChange={setCanvasTool}
              onLineDrawn={(lineData: { start: { x: number; y: number }; end: { x: number; y: number }; lengthPixels: number }) => {
                setScaleBarLineLengthPixels(lineData.lengthPixels.toFixed(2));
              }}
            />
          ) : (
            <Box
              sx={{
                height: 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              {isLoadingPreview ? (
                <CircularProgress />
              ) : (
                <Typography color="text.secondary">Loading micrograph preview...</Typography>
              )}
            </Box>
          )}
        </Stack>
      );
    }

    if (scaleMethod === 'Pixel Conversion Factor') {
      return (
        <Stack spacing={2}>
          <Typography variant="h6">Pixel Conversion Factor</Typography>

          {/* Preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box
                component="img"
                src={micrographPreviewUrl}
                alt="Micrograph preview"
                sx={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
              />
            </Box>
          )}

          <Typography variant="body2" color="text.secondary">
            Enter the number of pixels that corresponds to a known physical length.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              required
              label="Number of Pixels"
              type="number"
              value={pixels}
              onChange={(e) => setPixels(e.target.value)}
            />
            <TextField
              fullWidth
              required
              label="Physical Length"
              type="number"
              value={physicalLength}
              onChange={(e) => setPhysicalLength(e.target.value)}
            />
            <TextField
              fullWidth
              select
              required
              label="Units"
              value={pixelUnits}
              onChange={(e) => setPixelUnits(e.target.value)}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      );
    }

    if (scaleMethod === 'Provide Width/Height of Image') {
      return (
        <Stack spacing={2}>
          <Typography variant="h6">Provide Width/Height of Image</Typography>

          {/* Preview */}
          {micrographPreviewUrl && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                p: 2,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Box
                component="img"
                src={micrographPreviewUrl}
                alt="Micrograph preview"
                sx={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
              />
            </Box>
          )}

          <Typography variant="body2" color="text.secondary">
            Enter the physical width and/or height of the entire micrograph image.
            At least one dimension is required.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Image Width"
              type="number"
              value={imageWidthPhysical}
              onChange={(e) => setImageWidthPhysical(e.target.value)}
              helperText={micrograph?.imageWidth ? `${micrograph.imageWidth} pixels` : ''}
            />
            <TextField
              fullWidth
              label="Image Height"
              type="number"
              value={imageHeightPhysical}
              onChange={(e) => setImageHeightPhysical(e.target.value)}
              helperText={micrograph?.imageHeight ? `${micrograph.imageHeight} pixels` : ''}
            />
            <TextField
              fullWidth
              select
              required
              label="Units"
              value={sizeUnits}
              onChange={(e) => setSizeUnits(e.target.value)}
            >
              {units.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      );
    }

    return null;
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '50vh' } }}
    >
      <DialogTitle>Set Micrograph Scale</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This micrograph was batch imported without scale information.
          Please set the scale to view it properly.
        </Typography>

        {step === 0 && renderScaleMethodStep()}
        {step === 1 && renderScaleInputStep()}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {step > 0 && (
          <Button onClick={() => setStep(step - 1)}>Back</Button>
        )}
        {step === 0 ? (
          <Button variant="contained" onClick={() => setStep(1)}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={handleSave} disabled={!canProceed()}>
            Save
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
