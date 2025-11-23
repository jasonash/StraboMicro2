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
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { useAppStore } from '@/store';
import { AssociatedFileType } from '@/types/project-types';
import { findMicrographById, findSpotById } from '@/store/helpers';
import { AssociatedFileData } from './AssociatedFileAddForm';
import { AssociatedFileListItem } from './AssociatedFileListItem';
import { EditAssociatedFileDialog } from './EditAssociatedFileDialog';

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
  const [editingFile, setEditingFile] = useState<AssociatedFileData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

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

  // Handle file deletion from filesystem
  const handleFileDelete = async (file: AssociatedFileData) => {
    if (!project?.id) return;

    try {
      // Delete file from associatedFiles folder
      if (window.api?.deleteFromAssociatedFiles) {
        await window.api.deleteFromAssociatedFiles(project.id, file.fileName);
        console.log(`File deleted from associatedFiles: ${file.fileName}`);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      // Don't block the UI deletion even if filesystem deletion fails
    }
  };

  // Handle opening edit dialog
  const handleEditFile = (file: AssociatedFileData, index: number) => {
    setEditingFile(file);
    setEditingIndex(index);
  };

  // Handle saving edited file
  const handleSaveEdit = (updatedFile: AssociatedFileData) => {
    if (editingIndex !== null) {
      const newFiles = [...files];
      newFiles[editingIndex] = updatedFile;
      setFiles(newFiles);
    }
    setEditingFile(null);
    setEditingIndex(null);
  };

  // Handle closing edit dialog
  const handleCloseEdit = () => {
    setEditingFile(null);
    setEditingIndex(null);
  };

  // Handle file selection using native Electron dialog
  const handleBrowseFile = async () => {
    if (!window.api?.openFileDialog) {
      console.error('File dialog API not available');
      return;
    }

    try {
      const filePath = await window.api.openFileDialog();
      if (filePath) {
        setSelectedFilePath(filePath);
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
    }
  };

  // Handle adding new file (LEGACY: lines 133-172 in editAssociatedFilesInfo.java)
  const handleAddFile = async () => {
    if (!selectedFilePath || !project?.id) return;

    // Extract filename from path
    const fileName = selectedFilePath.split(/[/\\]/).pop() || selectedFilePath;

    try {
      // Copy file to project's associatedFiles folder
      if (window.api?.copyToAssociatedFiles) {
        await window.api.copyToAssociatedFiles(selectedFilePath, project.id, fileName);
        console.log(`File copied to associatedFiles: ${fileName}`);
      }

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
    } catch (error: any) {
      console.error('Error copying file:', error);
      // Show user-friendly error message
      const errorMessage = error?.message || 'Failed to copy file. Please try again.';
      alert(errorMessage);
    }
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
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontSize: '1.1rem', fontWeight: 600 }}>
            Files:
          </Typography>

          {files.length === 0 ? (
            <Box
              sx={{
                p: 3,
                textAlign: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                No associated files added yet.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {files.map((file, index) => (
                <Box
                  key={index}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {/* File info */}
                  <Box sx={{ flex: 1 }}>
                    <AssociatedFileListItem file={file} />
                  </Box>

                  {/* Action buttons */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleEditFile(file, index)}
                      title="Edit"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={async () => {
                        await handleFileDelete(file);
                        setFiles(files.filter((_, i) => i !== index));
                      }}
                      title="Delete"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>

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

      {/* Edit File Dialog */}
      {editingFile && (
        <EditAssociatedFileDialog
          isOpen={true}
          onClose={handleCloseEdit}
          file={editingFile}
          onSave={handleSaveEdit}
        />
      )}
    </Dialog>
  );
}
