/**
 * NewSpotDialog Component
 *
 * Modal dialog for creating new spots (point/line/polygon annotations).
 * Collects spot metadata including name, notes, colors, opacity, and optional
 * copy-from-existing functionality.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Slider,
  Stack,
} from '@mui/material';
import { MuiColorInput } from 'mui-color-input';
import { Spot, Geometry } from '@/types/project-types';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import { mergePresetIntoSpot } from '@/store/helpers';
import { legacyColorToHex, hexToLegacyColor } from '@/utils/colorUtils';
import { PresetSelector } from '../PresetSelector';

interface NewSpotDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (spot: Spot) => void;
  geometry: Geometry;
  micrographId: string;
  existingSpots?: Spot[];
}

export const NewSpotDialog: React.FC<NewSpotDialogProps> = ({
  open,
  onClose,
  onSave,
  geometry,
  existingSpots = [],
}) => {
  // Load default values from localStorage
  const getDefaultColor = (key: string, defaultValue: string) => {
    return localStorage.getItem(`spot_${key}`) || defaultValue;
  };

  const getDefaultOpacity = () => {
    const saved = localStorage.getItem('spot_opacity');
    return saved ? parseInt(saved, 10) : 50;
  };

  const getPresetById = useAppStore((state) => state.getPresetById);

  // Form state
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [labelColor, setLabelColor] = useState('#ffffff'); // Default to white for better readability with background box
  const [spotColor, setSpotColor] = useState(getDefaultColor('spotColor', '#00ff00'));
  const [opacity, setOpacity] = useState(getDefaultOpacity());
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);

  // Selecting a preset prefills the appearance controls (which the user can
  // still override — whatever is in the controls at save time wins)
  const handlePresetSelectionChange = (presetIds: string[]) => {
    const newlyAdded = presetIds.filter((id) => !selectedPresetIds.includes(id));
    for (const id of newlyAdded) {
      const preset = getPresetById(id);
      if (preset?.data.color) {
        setSpotColor(legacyColorToHex(preset.data.color));
      }
      if (preset?.data.opacity != null) {
        setOpacity(preset.data.opacity);
      }
    }
    setSelectedPresetIds(presetIds);
  };

  // Copy from existing spot state
  const [enableCopy, setEnableCopy] = useState(false);
  const [selectedSpotToCopy, setSelectedSpotToCopy] = useState<string | null>(null);
  const [copyFields, setCopyFields] = useState({
    allData: false,
    mineralogy: false,
    grainInfo: false,
    fabricInfo: false,
    clasticDeformationBandInfo: false,
    faultsShearZonesInfo: false,
    extinctionMicrostructureInfo: false,
    grainBoundaryInfo: false,
    intraGrainInfo: false,
    veinInfo: false,
    pseudotachylyteInfo: false,
    foldInfo: false,
    fractureInfo: false,
    links: false,
    tags: false,
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
      setNotes('');
      setLabelColor('#ffffff'); // Default to white
      setSpotColor(getDefaultColor('spotColor', '#00ff00'));
      setOpacity(getDefaultOpacity());
      setSelectedPresetIds([]);
      setEnableCopy(false);
      setSelectedSpotToCopy(null);
      setCopyFields({
        allData: false,
        mineralogy: false,
        grainInfo: false,
        fabricInfo: false,
        clasticDeformationBandInfo: false,
        faultsShearZonesInfo: false,
        extinctionMicrostructureInfo: false,
        grainBoundaryInfo: false,
        intraGrainInfo: false,
        veinInfo: false,
        pseudotachylyteInfo: false,
        foldInfo: false,
        fractureInfo: false,
        links: false,
        tags: false,
      });
    }
  }, [open]);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Spot name is required');
      return;
    }

    // Save preferences to localStorage
    localStorage.setItem('spot_labelColor', labelColor);
    localStorage.setItem('spot_spotColor', spotColor);
    localStorage.setItem('spot_opacity', opacity.toString());
    // Convert GeoJSON geometry to legacy format
    let points: Array<{ X: number; Y: number }> = [];
    let legacyGeometryType: string = '';

    if (geometry.type === 'Point') {
      legacyGeometryType = 'point'; // lowercase in legacy format
      const [x, y] = geometry.coordinates as [number, number];
      points = [{ X: x, Y: y }];
    } else if (geometry.type === 'LineString') {
      legacyGeometryType = 'line'; // "line" not "LineString" in legacy format
      points = (geometry.coordinates as Array<[number, number]>).map(([x, y]) => ({ X: x, Y: y }));
    } else if (geometry.type === 'Polygon') {
      legacyGeometryType = 'polygon'; // lowercase in legacy format
      // Polygon coordinates are nested: [[[x1, y1], [x2, y2], ...]]
      const ring = (geometry.coordinates as Array<Array<[number, number]>>)[0];
      points = ring.map(([x, y]) => ({ X: x, Y: y }));
    }

    // Create the new spot in legacy format
    const newSpot: Spot = {
      id: uuidv4(),
      name: name.trim(),
      notes: notes.trim() || '',
      labelColor: hexToLegacyColor(labelColor),
      color: hexToLegacyColor(spotColor),
      opacity,
      date: new Date().toISOString(),
      time: new Date().toISOString(),
      modifiedTimestamp: Date.now(),
      geometryType: legacyGeometryType,
      points,
    };

    // Merge selected presets (additive, same rules as Quick Edit), then
    // re-assert the dialog's appearance controls — controls win over preset
    // appearance since they were prefilled from it and may have been overridden
    if (selectedPresetIds.length > 0) {
      const appliedIds: string[] = [];
      for (const presetId of selectedPresetIds) {
        const preset = getPresetById(presetId);
        if (preset) {
          mergePresetIntoSpot(newSpot, preset.data);
          appliedIds.push(presetId);
        }
      }
      if (appliedIds.length > 0) {
        newSpot.appliedPresetIds = appliedIds;
      }
      newSpot.labelColor = hexToLegacyColor(labelColor);
      newSpot.color = hexToLegacyColor(spotColor);
      newSpot.opacity = opacity;
    }

    // If copying from existing spot, copy selected fields
    if (enableCopy && selectedSpotToCopy) {
      const sourceSpot = existingSpots.find((s) => s.id === selectedSpotToCopy);
      if (sourceSpot) {
        if (copyFields.allData || copyFields.mineralogy) {
          newSpot.mineralogy = sourceSpot.mineralogy;
        }
        if (copyFields.allData || copyFields.grainInfo) {
          newSpot.grainInfo = sourceSpot.grainInfo;
        }
        if (copyFields.allData || copyFields.fabricInfo) {
          newSpot.fabricInfo = sourceSpot.fabricInfo;
        }
        if (copyFields.allData || copyFields.clasticDeformationBandInfo) {
          newSpot.clasticDeformationBandInfo = sourceSpot.clasticDeformationBandInfo;
        }
        if (copyFields.allData || copyFields.faultsShearZonesInfo) {
          newSpot.faultsShearZonesInfo = sourceSpot.faultsShearZonesInfo;
        }
        if (copyFields.allData || copyFields.extinctionMicrostructureInfo) {
          newSpot.extinctionMicrostructureInfo = sourceSpot.extinctionMicrostructureInfo;
        }
        if (copyFields.allData || copyFields.grainBoundaryInfo) {
          newSpot.grainBoundaryInfo = sourceSpot.grainBoundaryInfo;
        }
        if (copyFields.allData || copyFields.intraGrainInfo) {
          newSpot.intraGrainInfo = sourceSpot.intraGrainInfo;
        }
        if (copyFields.allData || copyFields.veinInfo) {
          newSpot.veinInfo = sourceSpot.veinInfo;
        }
        if (copyFields.allData || copyFields.pseudotachylyteInfo) {
          newSpot.pseudotachylyteInfo = sourceSpot.pseudotachylyteInfo;
        }
        if (copyFields.allData || copyFields.foldInfo) {
          newSpot.foldInfo = sourceSpot.foldInfo;
        }
        if (copyFields.allData || copyFields.fractureInfo) {
          newSpot.fractureInfo = sourceSpot.fractureInfo;
        }
        if (copyFields.allData || copyFields.links) {
          newSpot.links = sourceSpot.links;
        }
        if (copyFields.allData || copyFields.tags) {
          newSpot.tags = sourceSpot.tags;
        }
      }
    }

    onSave(newSpot);
    onClose();
  };

  // Handler for copy field checkboxes (currently not used, will be implemented in future version)
  // @ts-expect-error - Will be used when copy feature UI is fully implemented
  const handleCopyFieldChange = (field: keyof typeof copyFields) => {
    if (field === 'allData') {
      const newValue = !copyFields.allData;
      setCopyFields({
        allData: newValue,
        mineralogy: newValue,
        grainInfo: newValue,
        fabricInfo: newValue,
        clasticDeformationBandInfo: newValue,
        faultsShearZonesInfo: newValue,
        extinctionMicrostructureInfo: newValue,
        grainBoundaryInfo: newValue,
        intraGrainInfo: newValue,
        veinInfo: newValue,
        pseudotachylyteInfo: newValue,
        foldInfo: newValue,
        fractureInfo: newValue,
        links: newValue,
        tags: newValue,
      });
    } else {
      setCopyFields((prev) => ({
        ...prev,
        [field]: !prev[field],
        allData: false, // Uncheck "All Data" when individual field changes
      }));
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Spot ({geometry.type})</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {/* Name */}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoFocus
            helperText="Required"
          />

          {/* Notes */}
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
          />

          {/* Quick Spot Presets (hidden when none exist) */}
          <PresetSelector
            selectedPresetIds={selectedPresetIds}
            onChange={handlePresetSelectionChange}
          />

          {/* Label Color - Commented out for now, defaulting to white for better readability */}
          {/* <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Label Color
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map(
                (color) => (
                  <Box
                    key={color}
                    onClick={() => setLabelColor(color)}
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: color,
                      border: labelColor === color ? '3px solid #1976d2' : '1px solid #ccc',
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { opacity: 0.8 },
                    }}
                  />
                )
              )}
            </Box>
          </Box> */}

          {/* Spot Color */}
          <MuiColorInput
            label="Spot Color"
            value={spotColor}
            onChange={(newColor) => setSpotColor(newColor)}
            format="hex"
            fullWidth
            sx={{ '& input': { caretColor: 'transparent', cursor: 'pointer' } }}
            onKeyDown={(e) => e.preventDefault()}
          />

          {/* Opacity */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Opacity: {opacity}%
            </Typography>
            <Slider
              value={opacity}
              onChange={(_, value) => setOpacity(value as number)}
              min={0}
              max={100}
              step={5}
              marks={[
                { value: 0, label: '0%' },
                { value: 50, label: '50%' },
                { value: 100, label: '100%' },
              ]}
            />
          </Box>

          {/* Copy from Existing Spot - Collapsed for now, can be expanded later */}
          {existingSpots.length > 0 && (
            <Box>
              <FormControlLabel
                control={<Checkbox checked={enableCopy} onChange={(e) => setEnableCopy(e.target.checked)} />}
                label="Copy from existing spot"
              />
              {enableCopy && (
                <Box sx={{ ml: 4, mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Copy feature available - select spot and fields in future version
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!isValid}>
          Create Spot
        </Button>
      </DialogActions>
    </Dialog>
  );
};
