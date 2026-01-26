/**
 * Properties Panel Component
 *
 * Displays metadata for the currently selected micrograph or spot.
 * Provides a dropdown menu to add/edit various types of geological data.
 *
 * Tab layout:
 * - Micrograph/Spot tab: Shows metadata for the selected micrograph or spot
 * - Sketches tab: Sketch layer management (only shown when micrograph is selected)
 * - Project tab: Shows project-level metadata
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CircleIcon from '@mui/icons-material/Circle';
import { useAppStore } from '@/store';
import { BreadcrumbsBar } from './BreadcrumbsBar';
import { CombinedDataTypeSelector } from './CombinedDataTypeSelector';
import { ConfirmDialog } from './dialogs/ConfirmDialog';
import { NotesDialog } from './dialogs/metadata/NotesDialog';
import { SampleInfoDialog } from './dialogs/metadata/SampleInfoDialog';
import { EditMicrographDialog } from './dialogs/metadata/EditMicrographDialog';
import { EditSpotDialog } from './dialogs/metadata/EditSpotDialog';
import { EditDatasetDialog } from './dialogs/EditDatasetDialog';
import { EditProjectDialog } from './dialogs/EditProjectDialog';
import { MineralogyDialog } from './dialogs/metadata/MineralogyDialog';
import { GrainInfoDialog } from './dialogs/metadata/graininfo/GrainInfoDialog';
import { FabricsDialog } from './dialogs/metadata/fabrics/FabricsDialog';
import { FracturesDialog } from './dialogs/metadata/fractures/FracturesDialog';
import { VeinsDialog } from './dialogs/metadata/veins/VeinsDialog';
import { FoldsDialog } from './dialogs/metadata/folds/FoldsDialog';
import { GrainBoundaryInfoDialog } from './dialogs/metadata/grainboundary/GrainBoundaryInfoDialog';
import { IntraGrainInfoDialog } from './dialogs/metadata/intragrain/IntraGrainInfoDialog';
import { ClasticDeformationBandInfoDialog } from './dialogs/metadata/clasticdeformationband/ClasticDeformationBandInfoDialog';
import { PseudotachylyteInfoDialog } from './dialogs/metadata/pseudotachylyte/PseudotachylyteInfoDialog';
import { FaultsShearZonesInfoDialog } from './dialogs/metadata/faultsshearzon es/FaultsShearZonesInfoDialog';
import { ExtinctionMicrostructureInfoDialog } from './dialogs/metadata/extinctionmicrostructure/ExtinctionMicrostructureInfoDialog';
import { AssociatedFilesInfoDialog } from './dialogs/metadata/associatedfiles/AssociatedFilesInfoDialog';
import { LinksInfoDialog } from './dialogs/metadata/links/LinksInfoDialog';
import { MetadataSummary } from './MetadataSummary';
import { ProjectMetadataSection } from './ProjectMetadataSection';
import { SketchLayersPanel } from './SketchLayersPanel';
import { getPresetSummary } from '@/types/preset-types';
import type { PresetWithScope } from '@/types/preset-types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`properties-tabpanel-${index}`}
      aria-labelledby={`properties-tab-${index}`}
      style={{ height: '100%', overflow: 'auto' }}
      {...other}
    >
      {value === index && <Box sx={{ height: '100%' }}>{children}</Box>}
    </div>
  );
}

export function PropertiesPanel() {
  const project = useAppStore((state) => state.project);
  const activeMicrographId = useAppStore((state) => state.activeMicrographId);
  const activeSpotId = useAppStore((state) => state.activeSpotId);
  const deleteMicrograph = useAppStore((state) => state.deleteMicrograph);
  const deleteSpot = useAppStore((state) => state.deleteSpot);
  const selectMicrograph = useAppStore((state) => state.selectMicrograph);
  const selectActiveSpot = useAppStore((state) => state.selectActiveSpot);

  // Quick Spot Presets
  const getAllPresetsWithScope = useAppStore((state) => state.getAllPresetsWithScope);
  const applyPresetToSpot = useAppStore((state) => state.applyPresetToSpot);

  // Sketch mode state
  const sketchModeActive = useAppStore((state) => state.sketchModeActive);

  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<'micrograph' | 'spot' | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Apply Preset menu state
  const [presetMenuAnchor, setPresetMenuAnchor] = useState<HTMLElement | null>(null);

  // Auto-switch to Micrograph/Spot tab when selection changes
  useEffect(() => {
    if (activeMicrographId || activeSpotId) {
      setActiveTab(0);
    }
  }, [activeMicrographId, activeSpotId]);

  // Auto-switch to Sketches tab when entering sketch mode
  useEffect(() => {
    if (sketchModeActive && activeMicrographId && !activeSpotId) {
      setActiveTab(1); // Sketches tab
    }
  }, [sketchModeActive, activeMicrographId, activeSpotId]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  // Export feedback state
  const [isExporting, setIsExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

  // Find the sample ID for the active micrograph
  const findSampleIdForMicrograph = (): string | undefined => {
    if (!activeMicrographId || !project) return undefined;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (sample.micrographs?.some((m) => m.id === activeMicrographId)) {
          return sample.id;
        }
      }
    }
    return undefined;
  };

  // Find the dataset ID for the active micrograph
  const findDatasetIdForMicrograph = (): string | undefined => {
    if (!activeMicrographId || !project) return undefined;
    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        if (sample.micrographs?.some((m) => m.id === activeMicrographId)) {
          return dataset.id;
        }
      }
    }
    return undefined;
  };

  const sampleId = findSampleIdForMicrograph();
  const datasetId = findDatasetIdForMicrograph();

  // Determine what type of entity is selected (check spot first since it's more specific)
  const selectionType = activeSpotId ? 'spot' : activeMicrographId ? 'micrograph' : null;

  // Handle download micrograph as JPEG
  const handleDownloadJpeg = async () => {
    if (!activeMicrographId || !project?.id || isExporting) return;

    setIsExporting(true);
    setSnackbar({ open: true, message: 'Exporting as JPEG...', severity: 'info' });

    try {
      const result = await window.api?.exportCompositeMicrograph(
        project.id,
        activeMicrographId,
        project,
        { includeSpots: true, includeLabels: true }
      );

      if (result?.success) {
        setSnackbar({ open: true, message: 'JPEG exported successfully', severity: 'success' });
      } else if (result?.canceled) {
        setSnackbar({ open: false, message: '', severity: 'info' });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle download micrograph as SVG (vector)
  const handleDownloadSvg = async () => {
    if (!activeMicrographId || !project?.id || isExporting) return;

    setIsExporting(true);
    setSnackbar({ open: true, message: 'Exporting as SVG...', severity: 'info' });

    try {
      const result = await window.api?.exportMicrographAsSvg(
        project.id,
        activeMicrographId,
        project
      );

      if (result?.success) {
        setSnackbar({ open: true, message: 'SVG exported successfully', severity: 'success' });
      } else if (result?.canceled) {
        setSnackbar({ open: false, message: '', severity: 'info' });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    if (confirmDelete === 'micrograph' && activeMicrographId) {
      deleteMicrograph(activeMicrographId);
      selectMicrograph(null);
    } else if (confirmDelete === 'spot' && activeSpotId) {
      deleteSpot(activeSpotId);
      selectActiveSpot(null);
    }
    setConfirmDelete(null);
  };

  // Handle Apply Preset menu
  const handleOpenPresetMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setPresetMenuAnchor(event.currentTarget);
  };

  const handleClosePresetMenu = () => {
    setPresetMenuAnchor(null);
  };

  const handleApplyPreset = (preset: PresetWithScope) => {
    if (activeSpotId) {
      applyPresetToSpot(preset.id, activeSpotId);
      setSnackbar({
        open: true,
        message: `Applied preset "${preset.name}"`,
        severity: 'success',
      });
    }
    handleClosePresetMenu();
  };

  // Get available presets for the menu
  const availablePresets = getAllPresetsWithScope();
  const globalPresets = availablePresets.filter((p) => p.scope === 'global');
  const projectPresets = availablePresets.filter((p) => p.scope === 'project');

  // Determine the first tab label based on selection
  const firstTabLabel = activeSpotId ? 'Spot' : 'Micrograph';

  // Determine if we should show the Sketches tab (only for micrographs, not spots)
  const showSketchesTab = !activeSpotId && activeMicrographId;

  // Calculate tab indices based on whether Sketches tab is shown
  const projectTabIndex = showSketchesTab ? 2 : 1;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab Bar */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': {
            color: 'text.primary',
            '&.Mui-selected': {
              color: 'text.primary',
            },
          },
          '& .MuiTabs-indicator': {
            backgroundColor: 'primary.main',
          },
        }}
      >
        <Tab label={firstTabLabel} disableRipple />
        {showSketchesTab && <Tab label="Sketches" disableRipple />}
        <Tab label="Project" disableRipple />
      </Tabs>

      {/* Micrograph/Spot Tab */}
      <TabPanel value={activeTab} index={0}>
        {!selectionType ? (
          <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Select a micrograph or spot to view and edit metadata
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Panel Title */}
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
              {selectionType === 'spot' ? 'Spot Details' : 'Micrograph Details'}
            </Typography>

            {/* Breadcrumbs Navigation Bar */}
            <BreadcrumbsBar
              onDownloadJpeg={handleDownloadJpeg}
              onDownloadSvg={handleDownloadSvg}
              onDeleteMicrograph={() => setConfirmDelete('micrograph')}
              onDeleteSpot={() => setConfirmDelete('spot')}
              isDownloading={isExporting}
            />

            {/* Combined Data Type Selector */}
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              Add Data:
            </Typography>
            <Box sx={{ mb: 3 }}>
              <CombinedDataTypeSelector
                context={selectionType}
                onSelectModal={(modal) => setOpenDialog(modal)}
              />
            </Box>

            {/* Apply Preset Button (spots only) */}
            {selectionType === 'spot' && availablePresets.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AutoFixHighIcon />}
                  onClick={handleOpenPresetMenu}
                  sx={{ textTransform: 'none' }}
                >
                  Apply Preset
                </Button>
                <Menu
                  anchorEl={presetMenuAnchor}
                  open={Boolean(presetMenuAnchor)}
                  onClose={handleClosePresetMenu}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                >
                  {globalPresets.length > 0 && (
                    <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>
                      Global Presets
                    </MenuItem>
                  )}
                  {globalPresets.map((preset) => (
                    <MenuItem
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                    >
                      <ListItemIcon>
                        <CircleIcon sx={{ color: preset.color, fontSize: 16 }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={preset.name}
                        secondary={getPresetSummary(preset).slice(0, 2).join(', ') || 'No data'}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </MenuItem>
                  ))}
                  {globalPresets.length > 0 && projectPresets.length > 0 && <Divider />}
                  {projectPresets.length > 0 && (
                    <MenuItem disabled sx={{ opacity: 0.7, fontSize: '0.75rem' }}>
                      Project Presets
                    </MenuItem>
                  )}
                  {projectPresets.map((preset) => (
                    <MenuItem
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset)}
                    >
                      <ListItemIcon>
                        <CircleIcon sx={{ color: preset.color, fontSize: 16 }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={preset.name}
                        secondary={getPresetSummary(preset).slice(0, 2).join(', ') || 'No data'}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </MenuItem>
                  ))}
                </Menu>
              </Box>
            )}

            {/* Metadata Summary Section */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Collected Data
              </Typography>

              <MetadataSummary
                micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
                spotId={activeSpotId || undefined}
                onEditSection={(sectionId) => setOpenDialog(sectionId)}
              />
            </Box>
          </Box>
        )}
      </TabPanel>

      {/* Sketches Tab (only shown for micrographs) */}
      {showSketchesTab && (
        <TabPanel value={activeTab} index={1}>
          <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Sketch Layers
            </Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <SketchLayersPanel />
            </Box>
          </Box>
        </TabPanel>
      )}

      {/* Project Tab */}
      <TabPanel value={activeTab} index={projectTabIndex}>
        {!project ? (
          <Box sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              No project open
            </Typography>
          </Box>
        ) : (
          <Box sx={{ p: 2 }}>
            <ProjectMetadataSection
              onEditProject={() => setOpenDialog('project')}
            />
          </Box>
        )}
      </TabPanel>

      {/* Dialogs */}
      {openDialog === 'notes' && (
        <NotesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'project' && project && (
        <EditProjectDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
        />
      )}

      {openDialog === 'dataset' && datasetId && (
        <EditDatasetDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          datasetId={datasetId}
        />
      )}

      {openDialog === 'sample' && sampleId && (
        <SampleInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          sampleId={sampleId}
        />
      )}

      {openDialog === 'micrograph' && activeMicrographId && (
        <EditMicrographDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeMicrographId}
        />
      )}

      {openDialog === 'spot' && activeSpotId && (
        <EditSpotDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          spotId={activeSpotId}
        />
      )}

      {openDialog === 'mineralogy' && (
        <MineralogyDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grain' && (
        <GrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fabric' && (
        <FabricsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fracture' && (
        <FracturesDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'vein' && (
        <VeinsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'fold' && (
        <FoldsDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'grainBoundary' && (
        <GrainBoundaryInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'intraGrain' && (
        <IntraGrainInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'clastic' && (
        <ClasticDeformationBandInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'pseudotachylyte' && (
        <PseudotachylyteInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'faultsShearZones' && (
        <FaultsShearZonesInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'extinctionMicrostructures' && (
        <ExtinctionMicrostructureInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'files' && (
        <AssociatedFilesInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {openDialog === 'links' && (
        <LinksInfoDialog
          isOpen={true}
          onClose={() => setOpenDialog(null)}
          micrographId={activeSpotId ? undefined : (activeMicrographId || undefined)}
          spotId={activeSpotId || undefined}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title={confirmDelete === 'micrograph' ? 'Delete Micrograph' : 'Delete Spot'}
        message={
          confirmDelete === 'micrograph'
            ? 'Are you sure you want to delete this micrograph? This action cannot be undone.'
            : 'Are you sure you want to delete this spot? This action cannot be undone.'
        }
        confirmLabel="Delete"
        confirmColor="error"
      />

      {/* Export Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'info' ? null : 4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{
            width: '100%',
            color: '#fff', // White text for all messages
            // Use app's primary pinkish-red for info messages
            ...(snackbar.severity === 'info' && {
              backgroundColor: '#e44c65',
            }),
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
