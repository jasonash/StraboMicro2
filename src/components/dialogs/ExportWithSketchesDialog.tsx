/**
 * Export With Sketches Dialog
 *
 * Allows users to export the current micrograph view with selected sketch layers.
 * Supports PNG and JPEG formats with configurable resolution.
 */

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
  RadioGroup,
  Radio,
  Slider,
  Divider,
  Alert,
} from '@mui/material';
import { useAppStore } from '@/store';
import { SketchLayer } from '@/types/project-types';

interface ExportWithSketchesDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => Promise<void>;
}

export interface ExportOptions {
  includeImage: boolean;
  includeSpots: boolean;
  includedLayerIds: string[];
  format: 'png' | 'jpeg';
  scale: number;
}

export function ExportWithSketchesDialog({
  open,
  onClose,
  onExport,
}: ExportWithSketchesDialogProps) {
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const getSketchLayers = useAppStore((state) => state.getSketchLayers);

  // Get sketch layers for the active micrograph
  const layers: SketchLayer[] = useMemo(() => {
    return activeMicrographId ? getSketchLayers(activeMicrographId) : [];
  }, [activeMicrographId, getSketchLayers]);

  // Export options state
  const [includeImage, setIncludeImage] = useState(true);
  const [includeSpots, setIncludeSpots] = useState(true);
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(() => {
    // Default to all visible layers selected
    return new Set(layers.filter((l) => l.visible).map((l) => l.id));
  });
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [scale, setScale] = useState(2); // 2x resolution by default
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedLayerIds(new Set(layers.filter((l) => l.visible).map((l) => l.id)));
      setError(null);
      setIsExporting(false);
    }
  }, [open, layers]);

  const handleLayerToggle = (layerId: string) => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const handleSelectAllLayers = () => {
    setSelectedLayerIds(new Set(layers.map((l) => l.id)));
  };

  const handleDeselectAllLayers = () => {
    setSelectedLayerIds(new Set());
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      await onExport({
        includeImage,
        includeSpots,
        includedLayerIds: Array.from(selectedLayerIds),
        format,
        scale,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const hasAnythingToExport =
    includeImage || includeSpots || selectedLayerIds.size > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Export Image with Sketches</DialogTitle>
      <DialogContent>
        <Box sx={{ py: 1 }}>
          {/* Content options */}
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Include</FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeImage}
                    onChange={(e) => setIncludeImage(e.target.checked)}
                  />
                }
                label="Micrograph image"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeSpots}
                    onChange={(e) => setIncludeSpots(e.target.checked)}
                  />
                }
                label="Spot annotations"
              />
            </FormGroup>
          </FormControl>

          <Divider sx={{ my: 2 }} />

          {/* Sketch layers selection */}
          <FormControl component="fieldset" fullWidth>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <FormLabel component="legend">Sketch Layers</FormLabel>
              <Box>
                <Button size="small" onClick={handleSelectAllLayers}>
                  All
                </Button>
                <Button size="small" onClick={handleDeselectAllLayers}>
                  None
                </Button>
              </Box>
            </Box>
            {layers.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                No sketch layers on this micrograph
              </Typography>
            ) : (
              <FormGroup sx={{ ml: 1 }}>
                {layers.map((layer) => (
                  <FormControlLabel
                    key={layer.id}
                    control={
                      <Checkbox
                        checked={selectedLayerIds.has(layer.id)}
                        onChange={() => handleLayerToggle(layer.id)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {layer.name}
                        {!layer.visible && (
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                            sx={{ ml: 1 }}
                          >
                            (hidden)
                          </Typography>
                        )}
                      </Typography>
                    }
                  />
                ))}
              </FormGroup>
            )}
          </FormControl>

          <Divider sx={{ my: 2 }} />

          {/* Format selection */}
          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Format</FormLabel>
            <RadioGroup
              row
              value={format}
              onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}
            >
              <FormControlLabel
                value="png"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">PNG</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Lossless, supports transparency
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="jpeg"
                control={<Radio size="small" />}
                label={
                  <Box>
                    <Typography variant="body2">JPEG</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Smaller file size
                    </Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>

          {/* Resolution slider */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel>Resolution: {scale}x</FormLabel>
            <Slider
              value={scale}
              onChange={(_, value) => setScale(value as number)}
              min={1}
              max={4}
              step={0.5}
              marks={[
                { value: 1, label: '1x' },
                { value: 2, label: '2x' },
                { value: 3, label: '3x' },
                { value: 4, label: '4x' },
              ]}
              sx={{ mt: 2 }}
            />
            <Typography variant="caption" color="text.secondary">
              Higher resolution = larger file size
            </Typography>
          </FormControl>

          {/* Warnings */}
          {!includeImage && selectedLayerIds.size > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Exporting sketches without the micrograph image will create a
              transparent PNG (format will be changed to PNG).
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={isExporting || !hasAnythingToExport}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ExportWithSketchesDialog;
