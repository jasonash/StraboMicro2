/**
 * Image Export Options Panel
 *
 * The one set of export controls shared by both export entry points
 * (File > Export Images... and the per-micrograph export button), so the two
 * always offer the same choices: file format, what to draw (image, overlays,
 * spots, labels) and which sketch layers to include.
 *
 * In single-micrograph mode (`sketchLayers` provided) the micrograph's layers
 * are listed individually. In batch mode the choice is a per-micrograph rule
 * (visible layers or none).
 */

import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import type { SketchLayer } from '@/types/project-types';
import type { ImageExportFormat, ImageExportOptions } from '@/types/image-export-types';

/** Above this many images, a full-resolution PNG ZIP gets a size warning. */
const PNG_WARNING_THRESHOLD = 5;

interface ImageExportOptionsPanelProps {
  value: ImageExportOptions;
  onChange: (next: ImageExportOptions) => void;
  /** Layers of the single micrograph being exported; omit for batch mode. */
  sketchLayers?: SketchLayer[];
  /** How many images the export will produce (drives the PNG size warning). */
  imageCount: number;
  disabled?: boolean;
}

const FORMAT_CHOICES: Array<{ value: ImageExportFormat; label: string; hint: string }> = [
  { value: 'jpeg', label: 'JPEG', hint: 'Smaller files' },
  { value: 'png', label: 'PNG', hint: 'Lossless, supports transparency' },
  { value: 'svg', label: 'SVG', hint: 'Editable spots, labels and sketches in Illustrator, Inkscape, etc.' },
];

export function ImageExportOptionsPanel({
  value,
  onChange,
  sketchLayers,
  imageCount,
  disabled = false,
}: ImageExportOptionsPanelProps) {
  const singleMode = sketchLayers !== undefined;
  const selectedLayerIds = new Set(Array.isArray(value.sketchLayers) ? value.sketchLayers : []);

  const update = (patch: Partial<ImageExportOptions>) => {
    const next = { ...value, ...patch };
    // JPEG has no transparency, so an annotation-only export must be PNG.
    if (!next.includeImage && next.format === 'jpeg') {
      next.format = 'png';
    }
    onChange(next);
  };

  const toggleLayer = (layerId: string) => {
    const next = new Set(selectedLayerIds);
    if (next.has(layerId)) {
      next.delete(layerId);
    } else {
      next.add(layerId);
    }
    update({ sketchLayers: Array.from(next) });
  };

  const showPngWarning = value.format === 'png' && imageCount > PNG_WARNING_THRESHOLD;

  return (
    <Box>
      {/* Format */}
      <FormControl component="fieldset" disabled={disabled} sx={{ mb: 2 }}>
        <FormLabel component="legend">Format</FormLabel>
        <RadioGroup
          value={value.format}
          onChange={(e) => update({ format: e.target.value as ImageExportFormat })}
        >
          {FORMAT_CHOICES.map((choice) => (
            <FormControlLabel
              key={choice.value}
              value={choice.value}
              disabled={disabled || (choice.value === 'jpeg' && !value.includeImage)}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2">{choice.label}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {choice.hint}
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>

      {/* Content */}
      <FormControl component="fieldset" disabled={disabled} sx={{ mb: 2, display: 'block' }}>
        <FormLabel component="legend">Include</FormLabel>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={value.includeImage}
                onChange={(e) => update({ includeImage: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Micrograph image</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={value.includeOverlays}
                onChange={(e) => update({ includeOverlays: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Associated micrograph overlays</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={value.includeSpots}
                onChange={(e) => update({ includeSpots: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Spot shapes</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={value.includeLabels}
                onChange={(e) => update({ includeLabels: e.target.checked })}
              />
            }
            label={<Typography variant="body2">Spot labels</Typography>}
          />
        </FormGroup>
      </FormControl>

      {/* Sketch layers */}
      <FormControl component="fieldset" disabled={disabled} sx={{ display: 'block' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <FormLabel component="legend">Sketch Layers</FormLabel>
          {singleMode && sketchLayers.length > 0 && (
            <Box>
              <Button
                size="small"
                disabled={disabled}
                onClick={() => update({ sketchLayers: sketchLayers.map((l) => l.id) })}
              >
                All
              </Button>
              <Button size="small" disabled={disabled} onClick={() => update({ sketchLayers: [] })}>
                None
              </Button>
            </Box>
          )}
        </Box>

        {singleMode ? (
          sketchLayers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2, mt: 0.5 }}>
              No sketch layers on this micrograph
            </Typography>
          ) : (
            <FormGroup>
              {sketchLayers.map((layer) => (
                <FormControlLabel
                  key={layer.id}
                  control={
                    <Checkbox
                      size="small"
                      checked={selectedLayerIds.has(layer.id)}
                      onChange={() => toggleLayer(layer.id)}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {layer.name}
                      {!layer.visible && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (hidden)
                        </Typography>
                      )}
                    </Typography>
                  }
                />
              ))}
            </FormGroup>
          )
        ) : (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={value.sketchLayers !== 'none'}
                onChange={(e) => update({ sketchLayers: e.target.checked ? 'visible' : 'none' })}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Visible sketch layers</Typography>
                <Typography variant="caption" color="text.secondary">
                  Each micrograph's currently visible layers
                </Typography>
              </Box>
            }
          />
        )}
      </FormControl>

      {!value.includeImage && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Without the micrograph image the export is a transparent overlay of the selected
          annotations{value.format === 'svg' ? '' : ' (PNG)'}.
        </Alert>
      )}

      {showPngWarning && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          PNG files are full resolution and lossless; exporting {imageCount} images as PNG may
          produce a very large ZIP archive.
        </Alert>
      )}
    </Box>
  );
}

export default ImageExportOptionsPanel;
