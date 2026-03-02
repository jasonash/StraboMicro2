/**
 * Grain Info Dialog Component
 *
 * CRITICAL: Multi-array architecture dialog
 * This dialog manages THREE SEPARATE ARRAYS with THREE SEPARATE NOTES:
 * - grainSizeInfo[] + grainSizeNotes
 * - grainShapeInfo[] + grainShapeNotes
 * - grainOrientationInfo[] + grainOrientationNotes
 *
 * Each tab manages its own array using inline list management logic.
 * Cannot use standard ListManager component due to multi-array structure.
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
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { useAppStore } from '@/store';
import {
  findMicrographById,
  findSpotById,
  getAvailablePhasesFromMicrograph,
  getAvailablePhasesFromSpot,
} from '@/store/helpers';
import {
  GrainInfoType,
  GrainSizeType,
  GrainShapeType,
  GrainOrientationType,
} from '@/types/legacy-types';
import { GrainSizeAddForm } from './GrainSizeAddForm';
import { GrainShapeAddForm } from './GrainShapeAddForm';
import { GrainOrientationAddForm } from './GrainOrientationAddForm';
import { GrainSizeListItem } from './GrainSizeListItem';
import { GrainShapeListItem } from './GrainShapeListItem';
import { GrainOrientationListItem } from './GrainOrientationListItem';

interface GrainInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
  // Preset mode props
  presetMode?: boolean;
  initialData?: GrainInfoType | null;
  onSavePresetData?: (data: GrainInfoType | null) => void;
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

export function GrainInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
  presetMode,
  initialData,
  onSavePresetData,
}: GrainInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [currentTab, setCurrentTab] = useState(0);

  // THREE SEPARATE ARRAYS
  const [grainSizeInfo, setGrainSizeInfo] = useState<GrainSizeType[]>([]);
  const [grainShapeInfo, setGrainShapeInfo] = useState<GrainShapeType[]>([]);
  const [grainOrientationInfo, setGrainOrientationInfo] = useState<GrainOrientationType[]>([]);

  // THREE SEPARATE NOTES
  const [grainSizeNotes, setGrainSizeNotes] = useState('');
  const [grainShapeNotes, setGrainShapeNotes] = useState('');
  const [grainOrientationNotes, setGrainOrientationNotes] = useState('');

  // Add/Edit mode tracking for each tab
  const [sizeAddMode, setSizeAddMode] = useState(false);
  const [sizeEditIndex, setSizeEditIndex] = useState<number | null>(null);
  const [shapeAddMode, setShapeAddMode] = useState(false);
  const [shapeEditIndex, setShapeEditIndex] = useState<number | null>(null);
  const [orientationAddMode, setOrientationAddMode] = useState(false);
  const [orientationEditIndex, setOrientationEditIndex] = useState<number | null>(null);

  // Get available phases
  const availablePhases: string[] = micrographId
    ? getAvailablePhasesFromMicrograph(findMicrographById(project, micrographId))
    : spotId
      ? getAvailablePhasesFromSpot(findSpotById(project, spotId))
      : [];

  // Load existing data when dialog opens
  useEffect(() => {
    if (!isOpen) return;

    // Preset mode: load from props instead of store
    if (presetMode) {
      setGrainSizeInfo(initialData?.grainSizeInfo || []);
      setGrainShapeInfo(initialData?.grainShapeInfo || []);
      setGrainOrientationInfo(initialData?.grainOrientationInfo || []);
      setGrainSizeNotes(initialData?.grainSizeNotes || '');
      setGrainShapeNotes(initialData?.grainShapeNotes || '');
      setGrainOrientationNotes(initialData?.grainOrientationNotes || '');

      // Reset add/edit modes
      setSizeAddMode(false);
      setSizeEditIndex(null);
      setShapeAddMode(false);
      setShapeEditIndex(null);
      setOrientationAddMode(false);
      setOrientationEditIndex(null);
      return;
    }

    // Normal mode: load from store
    const existingData: GrainInfoType | undefined | null = micrographId
      ? findMicrographById(project, micrographId)?.grainInfo
      : spotId
        ? findSpotById(project, spotId)?.grainInfo
        : null;

    setGrainSizeInfo(existingData?.grainSizeInfo || []);
    setGrainShapeInfo(existingData?.grainShapeInfo || []);
    setGrainOrientationInfo(existingData?.grainOrientationInfo || []);
    setGrainSizeNotes(existingData?.grainSizeNotes || '');
    setGrainShapeNotes(existingData?.grainShapeNotes || '');
    setGrainOrientationNotes(existingData?.grainOrientationNotes || '');

    // Reset add/edit modes
    setSizeAddMode(false);
    setSizeEditIndex(null);
    setShapeAddMode(false);
    setShapeEditIndex(null);
    setOrientationAddMode(false);
    setOrientationEditIndex(null);
  }, [isOpen, micrographId, spotId, project, presetMode, initialData]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const handleSave = () => {
    const hasData =
      grainSizeInfo.length > 0 ||
      grainShapeInfo.length > 0 ||
      grainOrientationInfo.length > 0 ||
      grainSizeNotes ||
      grainShapeNotes ||
      grainOrientationNotes;

    const grainInfo: GrainInfoType = {
      grainSizeInfo: grainSizeInfo.length > 0 ? grainSizeInfo : null,
      grainShapeInfo: grainShapeInfo.length > 0 ? grainShapeInfo : null,
      grainOrientationInfo: grainOrientationInfo.length > 0 ? grainOrientationInfo : null,
      grainSizeNotes: grainSizeNotes || null,
      grainShapeNotes: grainShapeNotes || null,
      grainOrientationNotes: grainOrientationNotes || null,
    };

    // Preset mode: return data via callback
    if (presetMode && onSavePresetData) {
      onSavePresetData(hasData ? grainInfo : null);
      onClose();
      return;
    }

    // Normal mode: save to store
    if (micrographId) {
      updateMicrographMetadata(micrographId, { grainInfo });
    } else if (spotId) {
      updateSpotData(spotId, { grainInfo });
    }

    onClose();
  };

  const handleCancel = () => {
    setCurrentTab(0);
    onClose();
  };

  // Grain Size handlers
  const handleSizeAdd = (item: GrainSizeType) => {
    if (sizeEditIndex !== null) {
      // Update existing
      const updated = [...grainSizeInfo];
      updated[sizeEditIndex] = item;
      setGrainSizeInfo(updated);
      setSizeEditIndex(null);
    } else {
      // Add new
      setGrainSizeInfo([...grainSizeInfo, item]);
    }
    setSizeAddMode(false);
  };

  const handleSizeEdit = (index: number) => {
    setSizeEditIndex(index);
    setSizeAddMode(true);
  };

  const handleSizeDelete = (index: number) => {
    setGrainSizeInfo(grainSizeInfo.filter((_, i) => i !== index));
  };

  const handleSizeCancel = () => {
    setSizeAddMode(false);
    setSizeEditIndex(null);
  };

  // Grain Shape handlers
  const handleShapeAdd = (item: GrainShapeType) => {
    if (shapeEditIndex !== null) {
      const updated = [...grainShapeInfo];
      updated[shapeEditIndex] = item;
      setGrainShapeInfo(updated);
      setShapeEditIndex(null);
    } else {
      setGrainShapeInfo([...grainShapeInfo, item]);
    }
    setShapeAddMode(false);
  };

  const handleShapeEdit = (index: number) => {
    setShapeEditIndex(index);
    setShapeAddMode(true);
  };

  const handleShapeDelete = (index: number) => {
    setGrainShapeInfo(grainShapeInfo.filter((_, i) => i !== index));
  };

  const handleShapeCancel = () => {
    setShapeAddMode(false);
    setShapeEditIndex(null);
  };

  // Grain Orientation handlers
  const handleOrientationAdd = (item: GrainOrientationType) => {
    if (orientationEditIndex !== null) {
      const updated = [...grainOrientationInfo];
      updated[orientationEditIndex] = item;
      setGrainOrientationInfo(updated);
      setOrientationEditIndex(null);
    } else {
      setGrainOrientationInfo([...grainOrientationInfo, item]);
    }
    setOrientationAddMode(false);
  };

  const handleOrientationEdit = (index: number) => {
    setOrientationEditIndex(index);
    setOrientationAddMode(true);
  };

  const handleOrientationDelete = (index: number) => {
    setGrainOrientationInfo(grainOrientationInfo.filter((_, i) => i !== index));
  };

  const handleOrientationCancel = () => {
    setOrientationAddMode(false);
    setOrientationEditIndex(null);
  };

  const title = presetMode
    ? 'Preset Grain Information'
    : micrographId
      ? 'Micrograph Grain Information'
      : spotId
        ? 'Spot Grain Information'
        : 'Grain Information';

  // In preset mode, don't block on mineralogy since presets are standalone
  const hasNoMineralogy = !presetMode && availablePhases.length === 0;

  return (
    <Dialog open={isOpen} onClose={handleCancel} maxWidth="md" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange}>
            <Tab label="Grain Size" />
            <Tab label="Shape" />
            <Tab label="Orientation" />
          </Tabs>
        </Box>

        {/* Tab 1: Grain Size */}
        <TabPanel value={currentTab} index={0}>
          {hasNoMineralogy ? (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.primary" sx={{ fontStyle: 'italic' }}>
                No mineralogy data available. Please add minerals in the Mineralogy/Lithology
                dialog first.
              </Typography>
            </Box>
          ) : (
            <Box>
              {/* List of existing items */}
              {grainSizeInfo.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {grainSizeInfo.map((item, index) => (
                    <GrainSizeListItem
                      key={index}
                      item={item}
                      onEdit={() => handleSizeEdit(index)}
                      onDelete={() => handleSizeDelete(index)}
                    />
                  ))}
                </Box>
              )}

              {/* Add/Edit form */}
              {sizeAddMode ? (
                <GrainSizeAddForm
                  availablePhases={availablePhases}
                  onAdd={handleSizeAdd}
                  onCancel={handleSizeCancel}
                  initialData={sizeEditIndex !== null ? grainSizeInfo[sizeEditIndex] : undefined}
                />
              ) : (
                <Button
                  startIcon={<Add />}
                  onClick={() => setSizeAddMode(true)}
                  variant="outlined"
                  fullWidth
                >
                  Add Grain Size
                </Button>
              )}

              {/* Notes field */}
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={grainSizeNotes}
                onChange={(e) => setGrainSizeNotes(e.target.value)}
                sx={{ mt: 3 }}
              />
            </Box>
          )}
        </TabPanel>

        {/* Tab 2: Shape */}
        <TabPanel value={currentTab} index={1}>
          {hasNoMineralogy ? (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.primary" sx={{ fontStyle: 'italic' }}>
                No mineralogy data available. Please add minerals in the Mineralogy/Lithology
                dialog first.
              </Typography>
            </Box>
          ) : (
            <Box>
              {grainShapeInfo.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {grainShapeInfo.map((item, index) => (
                    <GrainShapeListItem
                      key={index}
                      item={item}
                      onEdit={() => handleShapeEdit(index)}
                      onDelete={() => handleShapeDelete(index)}
                    />
                  ))}
                </Box>
              )}

              {shapeAddMode ? (
                <GrainShapeAddForm
                  availablePhases={availablePhases}
                  onAdd={handleShapeAdd}
                  onCancel={handleShapeCancel}
                  initialData={shapeEditIndex !== null ? grainShapeInfo[shapeEditIndex] : undefined}
                />
              ) : (
                <Button
                  startIcon={<Add />}
                  onClick={() => setShapeAddMode(true)}
                  variant="outlined"
                  fullWidth
                >
                  Add Grain Shape
                </Button>
              )}

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={grainShapeNotes}
                onChange={(e) => setGrainShapeNotes(e.target.value)}
                sx={{ mt: 3 }}
              />
            </Box>
          )}
        </TabPanel>

        {/* Tab 3: Orientation */}
        <TabPanel value={currentTab} index={2}>
          {hasNoMineralogy ? (
            <Box
              sx={{
                p: 2,
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'background.paper',
              }}
            >
              <Typography variant="body2" color="text.primary" sx={{ fontStyle: 'italic' }}>
                No mineralogy data available. Please add minerals in the Mineralogy/Lithology
                dialog first.
              </Typography>
            </Box>
          ) : (
            <Box>
              {grainOrientationInfo.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {grainOrientationInfo.map((item, index) => (
                    <GrainOrientationListItem
                      key={index}
                      item={item}
                      onEdit={() => handleOrientationEdit(index)}
                      onDelete={() => handleOrientationDelete(index)}
                    />
                  ))}
                </Box>
              )}

              {orientationAddMode ? (
                <GrainOrientationAddForm
                  availablePhases={availablePhases}
                  onAdd={handleOrientationAdd}
                  onCancel={handleOrientationCancel}
                  initialData={
                    orientationEditIndex !== null
                      ? grainOrientationInfo[orientationEditIndex]
                      : undefined
                  }
                />
              ) : (
                <Button
                  startIcon={<Add />}
                  onClick={() => setOrientationAddMode(true)}
                  variant="outlined"
                  fullWidth
                >
                  Add Grain Orientation
                </Button>
              )}

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes"
                value={grainOrientationNotes}
                onChange={(e) => setGrainOrientationNotes(e.target.value)}
                sx={{ mt: 3 }}
              />
            </Box>
          )}
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={hasNoMineralogy}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
