/**
 * Quick Spot Preset Editor Dialog
 *
 * Dialog for creating and editing Quick Spot Presets.
 * Presets store metadata templates that can be quickly applied to spots.
 *
 * Features:
 * - Basic preset info (name, description, scope)
 * - Spot appearance settings (color, opacity)
 * - All geological feature types via existing dialogs
 * - Scope selection (global vs project)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Alert,
  Stack,
  Chip,
  Menu,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { MuiColorInput } from 'mui-color-input';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { QuickApplyPreset, PresetData, PresetScope } from '@/types/preset-types';
import { getPresetSummary, PRESET_FEATURE_FIELDS, PRESET_FEATURE_DISPLAY_NAMES } from '@/types/preset-types';
import type {
  MineralogyType,
  LithologyInfoType,
  GrainInfoType,
  FabricInfoType,
  FractureInfoType,
  VeinInfoType,
  FoldInfoType,
  ClasticDeformationBandInfoType,
  GrainBoundaryInfoType,
  IntraGrainInfoType,
  PseudotachylyteInfoType,
  FaultsShearZonesInfoType,
  ExtinctionMicrostructureInfoType,
} from '@/types/project-types';
import { MineralogyDialog } from './metadata/MineralogyDialog';
import { GrainInfoDialog } from './metadata/graininfo/GrainInfoDialog';
import { FabricsDialog } from './metadata/fabrics/FabricsDialog';
import { FracturesDialog } from './metadata/fractures/FracturesDialog';
import { VeinsDialog } from './metadata/veins/VeinsDialog';
import { FoldsDialog } from './metadata/folds/FoldsDialog';
import { ClasticDeformationBandInfoDialog } from './metadata/clasticdeformationband/ClasticDeformationBandInfoDialog';
import { GrainBoundaryInfoDialog } from './metadata/grainboundary/GrainBoundaryInfoDialog';
import { IntraGrainInfoDialog } from './metadata/intragrain/IntraGrainInfoDialog';
import { PseudotachylyteInfoDialog } from './metadata/pseudotachylyte/PseudotachylyteInfoDialog';
import { FaultsShearZonesInfoDialog } from './metadata/faultsshearzon es/FaultsShearZonesInfoDialog';
import { ExtinctionMicrostructureInfoDialog } from './metadata/extinctionmicrostructure/ExtinctionMicrostructureInfoDialog';

interface QuickApplyPresetEditorDialogProps {
  open: boolean;
  onClose: () => void;
  editPreset?: QuickApplyPreset | null;
  editScope?: PresetScope;
  defaultScope?: PresetScope;
  onSaved?: (preset: QuickApplyPreset) => void;
}

/**
 * Feature type options for the Add Data dropdown
 */
interface FeatureTypeOption {
  id: string;
  label: string;
  dataKey: keyof PresetData;
}

const FEATURE_TYPE_OPTIONS: FeatureTypeOption[] = [
  { id: 'mineralogy', label: 'Mineralogy/Lithology', dataKey: 'mineralogy' },
  { id: 'grain', label: 'Grain Size/Shape/SPO', dataKey: 'grainInfo' },
  { id: 'fabric', label: 'Fabrics', dataKey: 'fabricInfo' },
  { id: 'fracture', label: 'Fractures', dataKey: 'fractureInfo' },
  { id: 'vein', label: 'Veins', dataKey: 'veinInfo' },
  { id: 'fold', label: 'Folds', dataKey: 'foldInfo' },
  { id: 'clastic', label: 'Clastic Deformation Bands', dataKey: 'clasticDeformationBandInfo' },
  { id: 'grainBoundary', label: 'Grain Boundaries', dataKey: 'grainBoundaryInfo' },
  { id: 'intraGrain', label: 'Intragranular Structures', dataKey: 'intraGrainInfo' },
  { id: 'pseudotachylyte', label: 'Pseudotachylyte', dataKey: 'pseudotachylyteInfo' },
  { id: 'faultsShearZones', label: 'Faults/Shear Zones', dataKey: 'faultsShearZonesInfo' },
  { id: 'extinction', label: 'Extinction Microstructures', dataKey: 'extinctionMicrostructureInfo' },
  { id: 'lithology', label: 'Lithology', dataKey: 'lithologyInfo' },
];

export function QuickApplyPresetEditorDialog({
  open,
  onClose,
  editPreset,
  editScope,
  defaultScope = 'global',
  onSaved,
}: QuickApplyPresetEditorDialogProps) {
  const createPreset = useAppStore((state) => state.createPreset);
  const updatePreset = useAppStore((state) => state.updatePreset);
  const project = useAppStore((state) => state.project);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const spotIndex = useAppStore((state) => state.spotIndex);

  // Form state - basic info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<PresetScope>(defaultScope);
  const [error, setError] = useState('');

  // Spot appearance
  const [spotColor, setSpotColor] = useState<string | null>(null);
  const [spotOpacity, setSpotOpacity] = useState<number | null>(null);

  // Feature data - stored as a single object matching PresetData structure
  const [featureData, setFeatureData] = useState<Partial<PresetData>>({});

  // Expanded state for accordions
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Add Data menu state
  const [addDataAnchor, setAddDataAnchor] = useState<HTMLElement | null>(null);

  // Dialog state for feature type editing
  const [openFeatureDialog, setOpenFeatureDialog] = useState<string | null>(null);

  // Edit mode check
  const isEditMode = !!editPreset;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (isEditMode && editPreset) {
        // Edit mode - load existing preset data
        setName(editPreset.name);
        setDescription(editPreset.description || '');
        setScope(editScope || defaultScope);

        // Load spot appearance
        setSpotColor(editPreset.data.color || null);
        setSpotOpacity(editPreset.data.opacity ?? null);

        // Load all feature data
        const data: Partial<PresetData> = {};
        for (const field of PRESET_FEATURE_FIELDS) {
          const value = editPreset.data[field];
          if (value != null) {
            (data as Record<string, unknown>)[field] = structuredClone(value);
          }
        }
        setFeatureData(data);

        // Determine which sections to expand
        const expanded: string[] = [];
        if (editPreset.data.color || editPreset.data.opacity != null) {
          expanded.push('appearance');
        }
        if (Object.keys(data).length > 0) {
          expanded.push('featureData');
        }
        setExpandedSections(expanded);
      } else {
        // Create mode - reset to defaults
        setName('');
        setDescription('');
        setScope(defaultScope);
        setSpotColor(null);
        setSpotOpacity(null);
        setFeatureData({});
        setExpandedSections([]);
      }
      setError('');
      setOpenFeatureDialog(null);
    }
  }, [open, isEditMode, editPreset, editScope, defaultScope]);

  const handleAccordionChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSections((prev) =>
      isExpanded ? [...prev, panel] : prev.filter((p) => p !== panel)
    );
  };

  // Build preset data for saving
  const buildPresetData = useCallback((): PresetData => {
    const data: PresetData = {};

    // Spot appearance
    if (spotColor) {
      data.color = spotColor;
    }
    if (spotOpacity != null) {
      data.opacity = spotOpacity;
    }

    // Include all feature data
    for (const [key, value] of Object.entries(featureData)) {
      if (value != null) {
        (data as Record<string, unknown>)[key] = value;
      }
    }

    return data;
  }, [spotColor, spotOpacity, featureData]);

  const handleSave = () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Preset name is required');
      return;
    }

    const presetData = buildPresetData();
    const now = new Date().toISOString();

    if (isEditMode && editPreset) {
      // Update existing preset
      const updatedPreset: QuickApplyPreset = {
        ...editPreset,
        name: trimmedName,
        description: description.trim() || undefined,
        modifiedAt: now,
        data: presetData,
      };
      updatePreset(editPreset.id, updatedPreset, scope);
      onSaved?.(updatedPreset);
    } else {
      // Create new preset
      const newPreset: QuickApplyPreset = {
        id: uuidv4(),
        name: trimmedName,
        description: description.trim() || undefined,
        createdAt: now,
        modifiedAt: now,
        data: presetData,
      };
      createPreset(newPreset, scope);
      onSaved?.(newPreset);
    }

    onClose();
  };

  // Copy data from the currently selected spot
  const handleCopyFromSpot = () => {
    if (!activeSpotId) return;

    const spot = spotIndex.get(activeSpotId);
    if (!spot) return;

    // Copy spot appearance
    if (spot.color) {
      setSpotColor(spot.color);
    }
    if (spot.opacity != null) {
      setSpotOpacity(spot.opacity);
    }

    // Copy all feature data from spot
    const data: Partial<PresetData> = {};
    for (const field of PRESET_FEATURE_FIELDS) {
      const value = spot[field];
      if (value != null) {
        (data as Record<string, unknown>)[field] = structuredClone(value);
      }
    }
    setFeatureData(data);

    // Expand sections that have data
    const expanded: string[] = [];
    if (spot.color || spot.opacity != null) {
      expanded.push('appearance');
    }
    if (Object.keys(data).length > 0) {
      expanded.push('featureData');
    }
    setExpandedSections(expanded);

    // If no name is set, use the spot's name as a suggestion
    if (!name.trim()) {
      setName(`From ${spot.name}`);
    }
  };

  // Handle Add Data menu
  const handleOpenAddData = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAddDataAnchor(event.currentTarget);
  };

  const handleCloseAddData = () => {
    setAddDataAnchor(null);
  };

  const handleSelectFeatureType = (featureId: string) => {
    handleCloseAddData();
    setOpenFeatureDialog(featureId);
  };

  // Handle feature dialog save
  const handleMineralogySave = (
    mineralogy: MineralogyType | null,
    lithology: LithologyInfoType | null
  ) => {
    setFeatureData((prev) => ({
      ...prev,
      mineralogy: mineralogy || undefined,
      lithologyInfo: lithology || undefined,
    }));
    expandFeatureDataSection();
  };

  const handleGrainInfoSave = (data: GrainInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, grainInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleFabricSave = (data: FabricInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, fabricInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleFractureSave = (data: FractureInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, fractureInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleVeinSave = (data: VeinInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, veinInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleFoldSave = (data: FoldInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, foldInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleClasticDeformationBandSave = (data: ClasticDeformationBandInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, clasticDeformationBandInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleGrainBoundarySave = (data: GrainBoundaryInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, grainBoundaryInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleIntraGrainSave = (data: IntraGrainInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, intraGrainInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handlePseudotachylyteSave = (data: PseudotachylyteInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, pseudotachylyteInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleFaultsShearZonesSave = (data: FaultsShearZonesInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, faultsShearZonesInfo: data || undefined }));
    expandFeatureDataSection();
  };

  const handleExtinctionMicrostructureSave = (data: ExtinctionMicrostructureInfoType | null) => {
    setFeatureData((prev) => ({ ...prev, extinctionMicrostructureInfo: data || undefined }));
    expandFeatureDataSection();
  };

  // Helper to expand feature data section
  const expandFeatureDataSection = () => {
    if (!expandedSections.includes('featureData')) {
      setExpandedSections((prev) => [...prev, 'featureData']);
    }
  };

  // Remove a feature type from the preset
  const handleRemoveFeature = (dataKey: keyof PresetData) => {
    setFeatureData((prev) => {
      const next = { ...prev };
      delete next[dataKey];
      return next;
    });
  };

  // Get display name for a feature key
  const getFeatureDisplayName = (key: string): string => {
    const option = FEATURE_TYPE_OPTIONS.find((o) => o.dataKey === key);
    return option?.label || PRESET_FEATURE_DISPLAY_NAMES[key as keyof typeof PRESET_FEATURE_DISPLAY_NAMES] || key;
  };

  // Check if preset has any data
  const hasData = spotColor || spotOpacity != null || Object.keys(featureData).length > 0;

  // Get list of configured features
  const configuredFeatures = Object.keys(featureData).filter((k) => featureData[k as keyof PresetData] != null);

  // Get summary of current preset data
  const summary = buildPresetData();
  const summaryItems = getPresetSummary({ id: '', name: '', createdAt: '', modifiedAt: '', data: summary });

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Preset' : 'Create New Preset'}</DialogTitle>

        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            {/* Basic Info */}
            <TextField
              autoFocus
              fullWidth
              label="Preset Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              error={!!error}
              helperText={error}
              placeholder="e.g., Quartz grain"
            />

            <TextField
              fullWidth
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this preset"
              multiline
              rows={2}
            />

            {/* Copy from Spot Button */}
            {activeSpotId && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyFromSpot}
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
              >
                Copy from Selected Spot
              </Button>
            )}

            {/* Scope */}
            <FormControl sx={{ minWidth: 140 }}>
              <InputLabel>Scope</InputLabel>
              <Select
                value={scope}
                label="Scope"
                onChange={(e) => setScope(e.target.value as PresetScope)}
                disabled={isEditMode} // Can't change scope in edit mode
              >
                <MenuItem value="global">Global</MenuItem>
                <MenuItem value="project" disabled={!project}>
                  Project
                </MenuItem>
              </Select>
            </FormControl>

            <Divider />

            {/* Preset Data Section */}
            <Typography variant="subtitle2" color="text.secondary">
              Preset Data
            </Typography>

            {/* Spot Appearance */}
            <Accordion
              expanded={expandedSections.includes('appearance')}
              onChange={handleAccordionChange('appearance')}
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Spot Appearance</Typography>
                {(spotColor || spotOpacity != null) && (
                  <Typography variant="caption" color="primary" sx={{ ml: 1 }}>
                    (configured)
                  </Typography>
                )}
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <MuiColorInput
                      label="Spot Color"
                      value={spotColor || '#808080'}
                      onChange={(newColor) => setSpotColor(newColor)}
                      format="hex"
                      disabled={!spotColor}
                      sx={{ flex: 1 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setSpotColor(spotColor ? null : '#3498db')}
                    >
                      {spotColor ? 'Clear' : 'Set'}
                    </Button>
                  </Box>

                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Opacity: {spotOpacity != null ? `${spotOpacity}%` : 'Not set'}
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setSpotOpacity(spotOpacity != null ? null : 70)}
                      >
                        {spotOpacity != null ? 'Clear' : 'Set'}
                      </Button>
                    </Box>
                    {spotOpacity != null && (
                      <Slider
                        value={spotOpacity}
                        onChange={(_e, value) => setSpotOpacity(value as number)}
                        min={0}
                        max={100}
                        valueLabelDisplay="auto"
                      />
                    )}
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* Feature Data */}
            <Accordion
              expanded={expandedSections.includes('featureData')}
              onChange={handleAccordionChange('featureData')}
              disableGutters
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Geological Data</Typography>
                {configuredFeatures.length > 0 && (
                  <Chip
                    label={`${configuredFeatures.length} type${configuredFeatures.length !== 1 ? 's' : ''}`}
                    size="small"
                    sx={{ ml: 1 }}
                  />
                )}
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  {/* Add Data Button */}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleOpenAddData}
                    sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                  >
                    Add Data Type
                  </Button>

                  {/* Configured features list */}
                  {configuredFeatures.length > 0 && (
                    <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                      {configuredFeatures.map((key) => (
                        <ListItem key={key}>
                          <ListItemText
                            primary={getFeatureDisplayName(key)}
                            secondary="Click edit to modify"
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => {
                                // Find the feature option and open its dialog
                                const option = FEATURE_TYPE_OPTIONS.find((o) => o.dataKey === key);
                                if (option) {
                                  setOpenFeatureDialog(option.id);
                                }
                              }}
                              sx={{ mr: 0.5 }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => handleRemoveFeature(key as keyof PresetData)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}

                  {configuredFeatures.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No geological data configured. Click "Add Data Type" to add mineralogy, grain info, fabrics, and more.
                    </Typography>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>

            {/* Summary */}
            {!hasData && (
              <Alert severity="info" sx={{ mt: 1 }}>
                This preset has no data configured yet. Expand a section above to add data.
              </Alert>
            )}

            {hasData && summaryItems.length > 0 && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Preset will apply: {summaryItems.join(', ')}
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
            {isEditMode ? 'Save' : 'Create'}
          </Button>
        </DialogActions>

        {/* Add Data Menu */}
        <Menu
          anchorEl={addDataAnchor}
          open={Boolean(addDataAnchor)}
          onClose={handleCloseAddData}
        >
          {FEATURE_TYPE_OPTIONS.map((option) => (
            <MenuItem
              key={option.id}
              onClick={() => handleSelectFeatureType(option.id)}
              disabled={featureData[option.dataKey] != null}
            >
              {option.label}
              {featureData[option.dataKey] != null && (
                <Chip label="Added" size="small" sx={{ ml: 1 }} />
              )}
            </MenuItem>
          ))}
        </Menu>
      </Dialog>

      {/* Mineralogy Dialog */}
      <MineralogyDialog
        isOpen={openFeatureDialog === 'mineralogy'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialMineralogy={featureData.mineralogy}
        initialLithology={featureData.lithologyInfo}
        onSavePresetData={handleMineralogySave}
      />

      {/* Grain Info Dialog */}
      <GrainInfoDialog
        isOpen={openFeatureDialog === 'grain'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.grainInfo}
        onSavePresetData={handleGrainInfoSave}
      />

      {/* Fabrics Dialog */}
      <FabricsDialog
        isOpen={openFeatureDialog === 'fabric'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.fabricInfo}
        onSavePresetData={handleFabricSave}
      />

      {/* Fractures Dialog */}
      <FracturesDialog
        isOpen={openFeatureDialog === 'fracture'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.fractureInfo}
        onSavePresetData={handleFractureSave}
      />

      {/* Veins Dialog */}
      <VeinsDialog
        isOpen={openFeatureDialog === 'vein'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.veinInfo}
        onSavePresetData={handleVeinSave}
      />

      {/* Folds Dialog */}
      <FoldsDialog
        isOpen={openFeatureDialog === 'fold'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.foldInfo}
        onSavePresetData={handleFoldSave}
      />

      {/* Clastic Deformation Bands Dialog */}
      <ClasticDeformationBandInfoDialog
        isOpen={openFeatureDialog === 'clastic'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.clasticDeformationBandInfo}
        onSavePresetData={handleClasticDeformationBandSave}
      />

      {/* Grain Boundaries Dialog */}
      <GrainBoundaryInfoDialog
        isOpen={openFeatureDialog === 'grainBoundary'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.grainBoundaryInfo}
        onSavePresetData={handleGrainBoundarySave}
      />

      {/* Intra-Grain Dialog */}
      <IntraGrainInfoDialog
        isOpen={openFeatureDialog === 'intraGrain'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.intraGrainInfo}
        onSavePresetData={handleIntraGrainSave}
      />

      {/* Pseudotachylyte Dialog */}
      <PseudotachylyteInfoDialog
        isOpen={openFeatureDialog === 'pseudotachylyte'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.pseudotachylyteInfo}
        onSavePresetData={handlePseudotachylyteSave}
      />

      {/* Faults/Shear Zones Dialog */}
      <FaultsShearZonesInfoDialog
        isOpen={openFeatureDialog === 'faultsShearZones'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.faultsShearZonesInfo}
        onSavePresetData={handleFaultsShearZonesSave}
      />

      {/* Extinction Microstructures Dialog */}
      <ExtinctionMicrostructureInfoDialog
        isOpen={openFeatureDialog === 'extinction'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialData={featureData.extinctionMicrostructureInfo}
        onSavePresetData={handleExtinctionMicrostructureSave}
      />

      {/* Lithology-only Dialog - same as mineralogy but navigates to tab 2 */}
      {/* Note: lithology is handled via MineralogyDialog which has a Lithology tab */}
      <MineralogyDialog
        isOpen={openFeatureDialog === 'lithology'}
        onClose={() => setOpenFeatureDialog(null)}
        presetMode={true}
        initialMineralogy={featureData.mineralogy}
        initialLithology={featureData.lithologyInfo}
        onSavePresetData={handleMineralogySave}
      />
    </>
  );
}
