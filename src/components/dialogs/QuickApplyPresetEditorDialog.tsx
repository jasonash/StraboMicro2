/**
 * Quick Apply Preset Editor Dialog
 *
 * Dialog for creating and editing Quick Apply Presets.
 * Presets store metadata templates that can be quickly applied to spots.
 *
 * Features:
 * - Basic preset info (name, description, color)
 * - Spot appearance settings (color, opacity)
 * - Mineralogy configuration
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
  Divider,
  Alert,
  Stack,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import { MuiColorInput } from 'mui-color-input';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import type { QuickApplyPreset, PresetData, PresetScope } from '@/types/preset-types';
import { DEFAULT_PRESET_COLORS, getPresetSummary } from '@/types/preset-types';
import { AutocompleteMineralSearch } from './metadata/reusable/AutocompleteMineralSearch';

interface QuickApplyPresetEditorDialogProps {
  open: boolean;
  onClose: () => void;
  editPreset?: QuickApplyPreset | null;
  editScope?: PresetScope;
  defaultScope?: PresetScope;
  onSaved?: (preset: QuickApplyPreset) => void;
}

interface MineralEntry {
  name: string;
  operator: string;
  percentage: number;
}

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

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [presetColor, setPresetColor] = useState(DEFAULT_PRESET_COLORS[0]);
  const [scope, setScope] = useState<PresetScope>(defaultScope);
  const [error, setError] = useState('');

  // Spot appearance
  const [spotColor, setSpotColor] = useState<string | null>(null);
  const [spotOpacity, setSpotOpacity] = useState<number | null>(null);

  // Mineralogy
  const [minerals, setMinerals] = useState<MineralEntry[]>([]);
  const [selectedMineral, setSelectedMineral] = useState<string[]>([]);
  const [mineralOperator, setMineralOperator] = useState('eq');
  const [mineralPercentage, setMineralPercentage] = useState<number>(0);

  // Expanded state for accordions
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  // Edit mode check
  const isEditMode = !!editPreset;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (isEditMode && editPreset) {
        // Edit mode - load existing preset data
        setName(editPreset.name);
        setDescription(editPreset.description || '');
        setPresetColor(editPreset.color);
        setScope(editScope || defaultScope);

        // Load spot appearance
        setSpotColor(editPreset.data.color || null);
        setSpotOpacity(editPreset.data.opacity ?? null);

        // Load mineralogy
        const existingMinerals = editPreset.data.mineralogy?.minerals || [];
        setMinerals(
          existingMinerals.map((m) => ({
            name: m.name || '',
            operator: m.operator || 'eq',
            percentage: m.percentage || 0,
          }))
        );

        // Determine which sections to expand based on preset data
        const expanded: string[] = [];
        if (editPreset.data.color || editPreset.data.opacity != null) {
          expanded.push('appearance');
        }
        if (existingMinerals.length > 0) {
          expanded.push('mineralogy');
        }
        setExpandedSections(expanded);
      } else {
        // Create mode - reset to defaults
        setName('');
        setDescription('');
        setPresetColor(DEFAULT_PRESET_COLORS[Math.floor(Math.random() * DEFAULT_PRESET_COLORS.length)]);
        setScope(defaultScope);
        setSpotColor(null);
        setSpotOpacity(null);
        setMinerals([]);
        setExpandedSections([]);
      }
      setSelectedMineral([]);
      setMineralOperator('eq');
      setMineralPercentage(0);
      setError('');
    }
  }, [open, isEditMode, editPreset, editScope, defaultScope]);

  const handleAccordionChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedSections((prev) =>
      isExpanded ? [...prev, panel] : prev.filter((p) => p !== panel)
    );
  };

  const handleAddMineral = () => {
    if (selectedMineral.length > 0 && mineralPercentage > 0) {
      setMinerals((prev) => [
        ...prev,
        {
          name: selectedMineral[0],
          operator: mineralOperator,
          percentage: mineralPercentage,
        },
      ]);
      setSelectedMineral([]);
      setMineralOperator('eq');
      setMineralPercentage(0);
    }
  };

  const handleRemoveMineral = (index: number) => {
    setMinerals((prev) => prev.filter((_, i) => i !== index));
  };

  const buildPresetData = useCallback((): PresetData => {
    const data: PresetData = {};

    // Spot appearance
    if (spotColor) {
      data.color = spotColor;
    }
    if (spotOpacity != null) {
      data.opacity = spotOpacity;
    }

    // Mineralogy
    if (minerals.length > 0) {
      data.mineralogy = {
        minerals: minerals.map((m) => ({
          name: m.name,
          operator: m.operator,
          percentage: m.percentage,
        })),
      };
    }

    return data;
  }, [spotColor, spotOpacity, minerals]);

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
        color: presetColor,
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
        color: presetColor,
        createdAt: now,
        modifiedAt: now,
        data: presetData,
      };
      createPreset(newPreset, scope);
      onSaved?.(newPreset);
    }

    onClose();
  };

  // Check if preset has any data
  const hasData = spotColor || spotOpacity != null || minerals.length > 0;

  // Get summary of current preset data
  const summary = buildPresetData();
  const summaryItems = getPresetSummary({ id: '', name: '', color: '', createdAt: '', modifiedAt: '', data: summary });

  return (
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

          {/* Preset Color and Scope */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <MuiColorInput
                label="Preset Color"
                value={presetColor}
                onChange={(newColor) => setPresetColor(newColor)}
                format="hex"
                fullWidth
                sx={{ '& input': { caretColor: 'transparent', cursor: 'pointer' } }}
                onKeyDown={(e) => e.preventDefault()}
              />
              <Typography variant="caption" color="text.secondary">
                Used for pie chart indicator on spots
              </Typography>
            </Box>

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
          </Box>

          {/* Quick color presets */}
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {DEFAULT_PRESET_COLORS.map((color) => (
              <Box
                key={color}
                onClick={() => setPresetColor(color)}
                sx={{
                  width: 28,
                  height: 28,
                  bgcolor: color,
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: presetColor === color ? '2px solid white' : '1px solid rgba(255,255,255,0.3)',
                  '&:hover': { transform: 'scale(1.1)' },
                  transition: 'transform 0.1s',
                }}
              />
            ))}
          </Box>

          <Divider />

          {/* Preset Data Sections */}
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

          {/* Mineralogy */}
          <Accordion
            expanded={expandedSections.includes('mineralogy')}
            onChange={handleAccordionChange('mineralogy')}
            disableGutters
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Mineralogy</Typography>
              {minerals.length > 0 && (
                <Typography variant="caption" color="primary" sx={{ ml: 1 }}>
                  ({minerals.length} mineral{minerals.length !== 1 ? 's' : ''})
                </Typography>
              )}
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {/* Add mineral form */}
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <AutocompleteMineralSearch
                      selectedMinerals={selectedMineral}
                      onChange={setSelectedMineral}
                      multiple={false}
                      label="Mineral"
                      placeholder="Search..."
                    />
                  </Box>
                  <TextField
                    select
                    label="Op"
                    value={mineralOperator}
                    onChange={(e) => setMineralOperator(e.target.value)}
                    sx={{ width: 70 }}
                    size="small"
                  >
                    <MenuItem value="eq">=</MenuItem>
                    <MenuItem value="gt">&gt;</MenuItem>
                    <MenuItem value="lt">&lt;</MenuItem>
                  </TextField>
                  <TextField
                    type="number"
                    label="%"
                    value={mineralPercentage || ''}
                    onChange={(e) => setMineralPercentage(parseFloat(e.target.value) || 0)}
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    sx={{ width: 80 }}
                    size="small"
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleAddMineral}
                    disabled={selectedMineral.length === 0 || mineralPercentage <= 0}
                    sx={{ height: 40 }}
                  >
                    Add
                  </Button>
                </Box>

                {/* Minerals list */}
                {minerals.length > 0 && (
                  <List dense sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    {minerals.map((mineral, index) => {
                      const opSymbol = mineral.operator === 'eq' ? '=' : mineral.operator === 'gt' ? '>' : '<';
                      return (
                        <ListItem
                          key={index}
                          secondaryAction={
                            <IconButton edge="end" size="small" onClick={() => handleRemoveMineral(index)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          }
                        >
                          <ListItemText
                            primary={mineral.name}
                            secondary={`${opSymbol} ${mineral.percentage}%`}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
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
    </Dialog>
  );
}
