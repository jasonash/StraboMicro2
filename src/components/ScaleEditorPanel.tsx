/**
 * Scale Editor Panel
 *
 * Reusable single-panel UI for setting/editing a micrograph's scale. Used inline by
 * the Edit Micrograph Metadata wizard's scale step. Supports the same three methods
 * as the initial reference-micrograph load (Trace Scale Bar, Pixel Conversion Factor,
 * Provide Width/Height of Image) — see SetScaleDialog for the original implementation.
 *
 * The panel is "controlled-output, uncontrolled-input": it manages its own form state
 * and notifies the parent of the computed scalePixelsPerCentimeter via onScaleChange.
 * The value is null when inputs are incomplete or invalid.
 */

import { useState, useEffect, useRef } from 'react';
import {
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
import { ScaleBarCanvas, type ScaleBarCanvasRef } from './ScaleBarCanvas';
import type { MicrographMetadata } from '@/types/project-types';

export type ScaleMethod =
  | 'Trace Scale Bar'
  | 'Pixel Conversion Factor'
  | 'Provide Width/Height of Image';

interface ScaleEditorPanelProps {
  micrograph: MicrographMetadata;
  /** Medium-resolution preview URL of the micrograph (loaded by the parent). */
  previewUrl: string | null;
  /** True while the parent is still loading previewUrl. Shows a spinner inside the canvas slot. */
  isLoadingPreview: boolean;
  /** Called whenever the computed scale changes. Receives null when inputs are incomplete. */
  onScaleChange: (scale: number | null) => void;
}

const UNITS = ['μm', 'mm', 'cm', 'm', 'inches'];
const CONVERSION_TO_CM: Record<string, number> = {
  μm: 10000,
  mm: 10,
  cm: 1,
  m: 0.01,
  inches: 0.393701,
};

export function ScaleEditorPanel({
  micrograph,
  previewUrl,
  isLoadingPreview,
  onScaleChange,
}: ScaleEditorPanelProps) {
  const [method, setMethod] = useState<ScaleMethod>('Trace Scale Bar');

  // Trace Scale Bar
  const [tracePixels, setTracePixels] = useState('');
  const [tracePhysical, setTracePhysical] = useState('');
  const [traceUnits, setTraceUnits] = useState('μm');
  const [canvasTool, setCanvasTool] = useState<'pointer' | 'line'>('pointer');
  const canvasRef = useRef<ScaleBarCanvasRef>(null);

  // Pixel Conversion Factor
  const [pixels, setPixels] = useState('');
  const [physicalLength, setPhysicalLength] = useState('');
  const [pixelUnits, setPixelUnits] = useState('μm');

  // Width/Height
  const [widthPhysical, setWidthPhysical] = useState('');
  const [heightPhysical, setHeightPhysical] = useState('');
  const [sizeUnits, setSizeUnits] = useState('μm');

  useEffect(() => {
    let scale: number | null = null;

    if (method === 'Trace Scale Bar') {
      const px = parseFloat(tracePixels);
      const phys = parseFloat(tracePhysical);
      if (px > 0 && phys > 0) {
        scale = (px / phys) * (CONVERSION_TO_CM[traceUnits] || 1);
      }
    } else if (method === 'Pixel Conversion Factor') {
      const px = parseFloat(pixels);
      const phys = parseFloat(physicalLength);
      if (px > 0 && phys > 0) {
        scale = (px / phys) * (CONVERSION_TO_CM[pixelUnits] || 1);
      }
    } else if (method === 'Provide Width/Height of Image') {
      if (widthPhysical && micrograph.imageWidth) {
        const physW = parseFloat(widthPhysical);
        if (physW > 0) {
          scale = (micrograph.imageWidth / physW) * (CONVERSION_TO_CM[sizeUnits] || 1);
        }
      } else if (heightPhysical && micrograph.imageHeight) {
        const physH = parseFloat(heightPhysical);
        if (physH > 0) {
          scale = (micrograph.imageHeight / physH) * (CONVERSION_TO_CM[sizeUnits] || 1);
        }
      }
    }

    onScaleChange(scale);
  }, [
    method,
    tracePixels,
    tracePhysical,
    traceUnits,
    pixels,
    physicalLength,
    pixelUnits,
    widthPhysical,
    heightPhysical,
    sizeUnits,
    micrograph.imageWidth,
    micrograph.imageHeight,
    onScaleChange,
  ]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          How do you wish to set the scale?
        </Typography>
        <RadioGroup value={method} onChange={(e) => setMethod(e.target.value as ScaleMethod)}>
          <FormControlLabel
            value="Trace Scale Bar"
            control={<Radio />}
            label="Trace Scale Bar"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Draw a line over the scale bar in the micrograph (most accurate)
          </Typography>
          <FormControlLabel
            value="Pixel Conversion Factor"
            control={<Radio />}
            label="Pixel Conversion Factor"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
            Enter the number of pixels per unit directly
          </Typography>
          <FormControlLabel
            value="Provide Width/Height of Image"
            control={<Radio />}
            label="Provide Width/Height of Image"
          />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 4 }}>
            Enter the physical dimensions of the entire image
          </Typography>
        </RadioGroup>
      </Box>

      {method === 'Trace Scale Bar' && (
        <Stack spacing={2}>
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
              flexWrap: 'wrap',
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
              value={tracePixels}
              InputProps={{ readOnly: true }}
              size="small"
              sx={{ width: 180 }}
            />
            <TextField
              required
              label="Physical Length"
              type="number"
              value={tracePhysical}
              onChange={(e) => setTracePhysical(e.target.value)}
              size="small"
              sx={{ width: 150 }}
            />
            <TextField
              select
              required
              label="Units"
              value={traceUnits}
              onChange={(e) => setTraceUnits(e.target.value)}
              size="small"
              sx={{ width: 100 }}
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {previewUrl ? (
            <ScaleBarCanvas
              ref={canvasRef}
              imageUrl={previewUrl}
              originalWidth={micrograph.imageWidth || 1000}
              originalHeight={micrograph.imageHeight || 1000}
              showToolbar={false}
              currentTool={canvasTool}
              onToolChange={setCanvasTool}
              onLineDrawn={(lineData) => {
                setTracePixels(lineData.lengthPixels.toFixed(2));
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
                <Typography color="text.secondary">Preview unavailable</Typography>
              )}
            </Box>
          )}
        </Stack>
      )}

      {method === 'Pixel Conversion Factor' && (
        <Stack spacing={2}>
          {previewUrl && (
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
                src={previewUrl}
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
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      )}

      {method === 'Provide Width/Height of Image' && (
        <Stack spacing={2}>
          {previewUrl && (
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
                src={previewUrl}
                alt="Micrograph preview"
                sx={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }}
              />
            </Box>
          )}
          <Typography variant="body2" color="text.secondary">
            Enter the physical width and/or height of the entire micrograph image. At least one
            dimension is required.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Image Width"
              type="number"
              value={widthPhysical}
              onChange={(e) => setWidthPhysical(e.target.value)}
              helperText={micrograph.imageWidth ? `${micrograph.imageWidth} pixels` : ''}
            />
            <TextField
              fullWidth
              label="Image Height"
              type="number"
              value={heightPhysical}
              onChange={(e) => setHeightPhysical(e.target.value)}
              helperText={micrograph.imageHeight ? `${micrograph.imageHeight} pixels` : ''}
            />
            <TextField
              fullWidth
              select
              required
              label="Units"
              value={sizeUnits}
              onChange={(e) => setSizeUnits(e.target.value)}
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
