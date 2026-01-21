/**
 * Mineralogy Dialog Component
 *
 * Two-tab dialog for editing mineralogy and lithology data.
 * Tab 1: Mineralogy - Add minerals with percentages, determination method
 * Tab 2: Lithology - Hierarchical lithology selection (Level 1-3)
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  TextField,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAppStore } from '@/store';
import { AutocompleteMineralSearch } from './reusable/AutocompleteMineralSearch';
import { LithologyPicker, LithologySelection } from './reusable/LithologyPicker';
import { OtherTextField } from './reusable/OtherTextField';
import type { MineralogyType, LithologyInfoType } from '@/types/project-types';

interface MineralogyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
  // Preset mode: when true, uses initialData and calls onSavePresetData instead of updating store
  presetMode?: boolean;
  initialMineralogy?: MineralogyType | null;
  initialLithology?: LithologyInfoType | null;
  onSavePresetData?: (
    mineralogy: MineralogyType | null,
    lithology: LithologyInfoType | null
  ) => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

interface MineralWithPercentage {
  name: string;
  operator: string; // "eq" (=), "gt" (>), "lt" (<)
  percentage: number;
}

interface MineralogyData {
  minerals: MineralWithPercentage[];
  determinationMethod: string;
  percentageCalculationMethod: string;
  mineralogyNotes: string;
  lithologies: LithologySelection[];
  lithologyNotes: string;
}

const DETERMINATION_METHODS = [
  'Point Counting',
  'Visual Estimation',
  'XRD',
  'Electron Microprobe',
  'SEM-EDS',
];

const PERCENTAGE_CALCULATION_METHODS = [
  'Modal',
  'Normative',
  'Area',
  'Volume',
];

export function MineralogyDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
  presetMode,
  initialMineralogy,
  initialLithology,
  onSavePresetData,
}: MineralogyDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [currentTab, setCurrentTab] = useState(0);
  const [formData, setFormData] = useState<MineralogyData>({
    minerals: [],
    determinationMethod: '',
    percentageCalculationMethod: '',
    mineralogyNotes: '',
    lithologies: [],
    lithologyNotes: '',
  });

  // Mineralogy tab - temporary state for adding new mineral
  const [selectedMinerals, setSelectedMinerals] = useState<string[]>([]);
  const [currentOperator, setCurrentOperator] = useState<string>('eq');
  const [currentPercentage, setCurrentPercentage] = useState<number | null>(null);

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // Preset mode: load from props instead of store
    if (presetMode) {
      setFormData({
        minerals: initialMineralogy?.minerals?.map(m => ({
          name: m.name || '',
          operator: m.operator || 'eq',
          percentage: m.percentage || 0,
        })) || [],
        determinationMethod: initialMineralogy?.mineralogyMethod || '',
        percentageCalculationMethod: initialMineralogy?.percentageCalculationMethod || '',
        mineralogyNotes: initialMineralogy?.notes || '',
        lithologies: initialLithology?.lithologies?.map(l => ({
          level1: l.level1 || '',
          level2: l.level2 || '',
          level3: l.level3 || '',
        })) || [],
        lithologyNotes: initialLithology?.notes || '',
      });
      return;
    }

    // Normal mode: load from store
    if (!project) return;

    // Load from TWO separate fields: mineralogy and lithologyInfo
    let existingMineralogy = null;
    let existingLithology = null;

    if (micrographId) {
      const micrograph = project.datasets?.flatMap(d => d.samples || [])
        .flatMap(s => s.micrographs || [])
        .find(m => m.id === micrographId);
      existingMineralogy = micrograph?.mineralogy;
      existingLithology = micrograph?.lithologyInfo;
    } else if (spotId) {
      const spot = project.datasets?.flatMap(d => d.samples || [])
        .flatMap(s => s.micrographs || [])
        .flatMap(m => m.spots || [])
        .find(s => s.id === spotId);
      existingMineralogy = spot?.mineralogy;
      existingLithology = spot?.lithologyInfo;
    }

    setFormData({
      minerals: existingMineralogy?.minerals?.map((m: any) => ({
        name: m.name || '',
        operator: m.operator || 'eq',
        percentage: m.percentage || 0,
      })) || [],
      determinationMethod: existingMineralogy?.mineralogyMethod || '',
      percentageCalculationMethod: existingMineralogy?.percentageCalculationMethod || '',
      mineralogyNotes: existingMineralogy?.notes || '',
      lithologies: (existingLithology?.lithologies || []) as LithologySelection[],
      lithologyNotes: existingLithology?.notes || '',
    });
    setSelectedMinerals([]);
    setCurrentOperator('eq');
    setCurrentPercentage(null);
  }, [isOpen, micrographId, spotId, project, presetMode, initialMineralogy, initialLithology]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // Add selected mineral with percentage to list
  const handleAddMineral = () => {
    if (selectedMinerals.length > 0) {
      const newMineral: MineralWithPercentage = {
        name: selectedMinerals[0],
        operator: currentPercentage != null ? currentOperator : '', // Only set operator if percentage is specified
        percentage: currentPercentage ?? 0, // Use 0 for storage but we track null state separately
      };

      // Only include percentage info if actually entered
      if (currentPercentage == null) {
        newMineral.operator = '';
        newMineral.percentage = 0;
      }

      setFormData(prev => ({
        ...prev,
        minerals: [...prev.minerals, newMineral],
      }));

      // Reset selection
      setSelectedMinerals([]);
      setCurrentOperator('eq');
      setCurrentPercentage(null);
    }
  };

  // Remove a mineral from the list
  const handleRemoveMineral = (index: number) => {
    setFormData(prev => ({
      ...prev,
      minerals: prev.minerals.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    // Save to TWO separate fields: mineralogy and lithologyInfo
    // Legacy app uses one dialog to edit both fields (by design)
    console.log('Saving mineralogy and lithology data:', formData);

    // Build mineralogy object (Tab 1)
    const mineralogy = {
      minerals: formData.minerals.map(m => ({
        name: m.name,
        operator: m.operator,
        percentage: m.percentage,
      })),
      mineralogyMethod: formData.determinationMethod || null,
      percentageCalculationMethod: formData.percentageCalculationMethod || null,
      notes: formData.mineralogyNotes || null,
    };

    // Build lithologyInfo object (Tab 2)
    const lithologyInfo = {
      lithologies: formData.lithologies || null,
      notes: formData.lithologyNotes || null,
    };

    // Check if mineralogy has any data worth saving (minerals OR notes OR methods)
    const hasMineralogyData = mineralogy.minerals.length > 0 ||
      mineralogy.notes ||
      mineralogy.mineralogyMethod ||
      mineralogy.percentageCalculationMethod;

    // Check if lithology has any data worth saving (lithologies OR notes)
    const hasLithologyData = (lithologyInfo.lithologies && lithologyInfo.lithologies.length > 0) ||
      lithologyInfo.notes;

    // Preset mode: return data via callback
    if (presetMode && onSavePresetData) {
      console.log('[MineralogyDialog] Preset mode save:', {
        presetMode,
        hasMineralogyData,
        hasLithologyData,
        mineralogy: hasMineralogyData ? mineralogy : null,
        lithologyInfo: hasLithologyData ? lithologyInfo : null,
      });
      onSavePresetData(
        hasMineralogyData ? mineralogy : null,
        hasLithologyData ? lithologyInfo : null
      );
      onClose();
      return;
    } else {
      console.log('[MineralogyDialog] NOT in preset mode or no callback:', { presetMode, hasCallback: !!onSavePresetData });
    }

    // Normal mode: save to store
    if (micrographId) {
      updateMicrographMetadata(micrographId, {
        mineralogy: hasMineralogyData ? mineralogy : null,
        lithologyInfo: hasLithologyData ? lithologyInfo : null,
      });
    } else if (spotId) {
      updateSpotData(spotId, {
        mineralogy: hasMineralogyData ? mineralogy : null,
        lithologyInfo: hasLithologyData ? lithologyInfo : null,
      });
    }

    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    setCurrentTab(0);
    onClose();
  };

  const title = presetMode
    ? 'Preset Mineralogy/Lithology'
    : micrographId
      ? 'Micrograph Mineralogy/Lithology'
      : spotId
        ? 'Spot Mineralogy/Lithology'
      : 'Mineralogy/Lithology';

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange}>
            <Tab label="Mineralogy" />
            <Tab label="Lithology" />
          </Tabs>
        </Box>

        {/* Tab 1: Mineralogy */}
        <TabPanel value={currentTab} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="subtitle1">Enter Mineral Name</Typography>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <AutocompleteMineralSearch
                  selectedMinerals={selectedMinerals}
                  onChange={setSelectedMinerals}
                  multiple={false}
                  label="Mineral"
                  placeholder="Search for a mineral..."
                />
              </Box>
              <TextField
                select
                label="Operator"
                value={currentOperator}
                onChange={(e) => setCurrentOperator(e.target.value)}
                sx={{ width: 80 }}
              >
                <MenuItem value="eq">=</MenuItem>
                <MenuItem value="gt">&gt;</MenuItem>
                <MenuItem value="lt">&lt;</MenuItem>
              </TextField>
              <TextField
                type="number"
                label="Percentage"
                value={currentPercentage ?? ''}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setCurrentPercentage(val === '' ? null : parseFloat(val) || 0);
                }}
                inputProps={{ min: 0, max: 100, step: 0.1 }}
                sx={{ width: 120 }}
              />
              <Button
                variant="outlined"
                onClick={handleAddMineral}
                disabled={selectedMinerals.length === 0}
                sx={{ height: 56 }}
              >
                Add
              </Button>
            </Box>

            <Divider />

            {/* Minerals list */}
            {formData.minerals.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Minerals
                </Typography>
                <List sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  {formData.minerals.map((mineral, index) => {
                    const operatorSymbol = mineral.operator === 'eq' ? '=' : mineral.operator === 'gt' ? '>' : '<';
                    return (
                      <ListItem
                        key={index}
                        secondaryAction={
                          <IconButton edge="end" onClick={() => handleRemoveMineral(index)}>
                            <DeleteIcon />
                          </IconButton>
                        }
                      >
                        <ListItemText
                          primary={mineral.name}
                          secondary={`${operatorSymbol} ${mineral.percentage}%`}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            )}

            <Divider />

            <OtherTextField
              options={DETERMINATION_METHODS}
              value={formData.determinationMethod}
              onChange={(value) =>
                setFormData(prev => ({ ...prev, determinationMethod: value }))
              }
              label="How was mineralogy determined?"
            />

            <OtherTextField
              options={PERCENTAGE_CALCULATION_METHODS}
              value={formData.percentageCalculationMethod}
              onChange={(value) =>
                setFormData(prev => ({ ...prev, percentageCalculationMethod: value }))
              }
              label="How were percentages calculated?"
            />

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Mineralogy Notes"
              value={formData.mineralogyNotes}
              onChange={(e) =>
                setFormData(prev => ({ ...prev, mineralogyNotes: e.target.value }))
              }
            />
          </Box>
        </TabPanel>

        {/* Tab 2: Lithology */}
        <TabPanel value={currentTab} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <LithologyPicker
              selectedLithologies={formData.lithologies}
              onChange={(lithologies) =>
                setFormData(prev => ({ ...prev, lithologies }))
              }
            />

            <Divider />

            <TextField
              fullWidth
              multiline
              rows={4}
              label="Lithology Notes"
              value={formData.lithologyNotes}
              onChange={(e) =>
                setFormData(prev => ({ ...prev, lithologyNotes: e.target.value }))
              }
            />
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
