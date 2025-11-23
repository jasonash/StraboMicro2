/**
 * Associated Files Info Dialog Component
 *
 * LEGACY MATCH: editAssociatedFilesInfo.java + editAssociatedFilesInfo.fxml
 * Shows list of existing files + file picker for adding new files
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import { useAppStore } from '@/store';
import { AssociatedFileType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { ListManager } from '../reusable/ListManager';
import { AssociatedFileAddForm, AssociatedFileData } from './AssociatedFileAddForm';
import { AssociatedFileListItem } from './AssociatedFileListItem';

interface AssociatedFilesInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  micrographId?: string;
  spotId?: string;
}

export function AssociatedFilesInfoDialog({
  isOpen,
  onClose,
  micrographId,
  spotId,
}: AssociatedFilesInfoDialogProps) {
  const project = useAppStore((state) => state.project);
  const updateMicrographMetadata = useAppStore((state) => state.updateMicrographMetadata);
  const updateSpotData = useAppStore((state) => state.updateSpotData);

  const [files, setFiles] = useState<AssociatedFileData[]>([]);

  // New file form state (LEGACY: lines 33-36, 57-85 in editAssociatedFilesInfo.fxml)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [newFileType, setNewFileType] = useState<string>('');
  const [newOtherType, setNewOtherType] = useState<string>('');
  const [newFileNotes, setNewFileNotes] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !project) return;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      setFiles((micrograph?.associatedFiles || []) as AssociatedFileData[]);
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      setFiles((spot?.associatedFiles || []) as AssociatedFileData[]);
    }

    // Reset new file form
    setSelectedFilePath('');
    setNewFileType('');
    setNewOtherType('');
    setNewFileNotes('');
  }, [isOpen, micrographId, spotId, project]);

  const handleSave = () => {
    if (micrographId) {
      updateMicrographMetadata(micrographId, { associatedFiles: files as AssociatedFileType[] });
    } else if (spotId) {
      updateSpotData(spotId, { associatedFiles: files as AssociatedFileType[] });
    }

    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // Handle file selection (LEGACY: lines 61-63, 121-131 in editAssociatedFilesInfo.java)
  const handleBrowseFile = async () => {
    // In Electron, we should use the native file dialog via IPC
    // For now, use the web file input and store the File object
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        // For web, we only get the filename. In Electron, this would use dialog.showOpenDialog
        setSelectedFilePath(file.name);
      }
    };
    input.click();
  };

  // Handle adding new file (LEGACY: lines 133-172 in editAssociatedFilesInfo.java)
  const handleAddFile = () => {
    if (!selectedFilePath) return;

    // Extract filename from path
    const fileName = selectedFilePath.split(/[/\\]/).pop() || selectedFilePath;

    const newFile: AssociatedFileData = {
      fileName: fileName,
      originalPath: selectedFilePath,
      fileType: newFileType,
      otherType: newFileType === 'Other' ? newOtherType : '',
      notes: newFileNotes,
    };

    setFiles([...files, newFile]);

    // Reset form
    setSelectedFilePath('');
    setNewFileType('');
    setNewOtherType('');
    setNewFileNotes('');
  };

  // Validation for add button (LEGACY: lines 96-114 in editAssociatedFilesInfo.java)
  const canAddFile = (() => {
    if (!selectedFilePath) return false;
    if (newFileType === '') return false;
    if (newFileType === 'Other' && newOtherType.trim() === '') return false;
    return true;
  })();

  const title = micrographId
    ? 'Micrograph Associated Files'
    : spotId
      ? 'Spot Associated Files'
      : 'Associated Files';

  return (
    <Dialog
      open={isOpen}
      onClose={handleCancel}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 3 }}>
        {/* List of existing files - LEGACY: lines 45-50 in editAssociatedFilesInfo.fxml */}
        <ListManager<AssociatedFileData>
          items={files}
          notes=""
          onItemsChange={setFiles}
          hideButtons={true}
          hideAddForm={true}
          hideNotes={true}
          title="Files"
          addSectionTitle="Add/Edit File Metadata"
          emptyMessage="No associated files added yet."
          renderItem={(file) => (
            <AssociatedFileListItem file={file} />
          )}
          renderAddForm={({ onAdd, onCancel, initialData }) => (
            <AssociatedFileAddForm
              onAdd={onAdd}
              onCancel={onCancel}
              initialData={initialData}
            />
          )}
        />

        <Divider sx={{ my: 3 }} />

        {/* Add New File Section - LEGACY: lines 52-85 in editAssociatedFilesInfo.fxml */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
            Add New File
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Choose File - LEGACY: lines 57-67 */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Choose File:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  value={selectedFilePath}
                  placeholder="No file selected"
                  InputProps={{
                    readOnly: true,
                  }}
                  onClick={handleBrowseFile}
                  sx={{ cursor: 'pointer' }}
                />
                <Button variant="outlined" onClick={handleBrowseFile}>
                  Browse
                </Button>
              </Box>
            </Box>

            {/* File Type - LEGACY: lines 68-73 */}
            <FormControl fullWidth>
              <InputLabel>File Type</InputLabel>
              <Select
                value={newFileType}
                label="File Type"
                onChange={(e) => setNewFileType(e.target.value)}
              >
                <MenuItem value="">
                  <em>Select...</em>
                </MenuItem>
                <MenuItem value="Image">Image</MenuItem>
                <MenuItem value="Spreadsheet">Spreadsheet</MenuItem>
                <MenuItem value="PDF">PDF</MenuItem>
                <MenuItem value="Script">Script</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>

            {/* Other Type - Conditional - LEGACY: lines 74, 84-93 */}
            {newFileType === 'Other' && (
              <TextField
                fullWidth
                label="Other File Type"
                value={newOtherType}
                onChange={(e) => setNewOtherType(e.target.value)}
                placeholder="Specify file type"
              />
            )}

            {/* Notes - LEGACY: lines 75-80 */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Notes"
              value={newFileNotes}
              onChange={(e) => setNewFileNotes(e.target.value)}
              placeholder="Add notes about this file..."
            />

            {/* Add Button - LEGACY: lines 81-85 */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={handleAddFile}
                disabled={!canAddFile}
              >
                Add
              </Button>
            </Box>
          </Box>
        </Box>
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
