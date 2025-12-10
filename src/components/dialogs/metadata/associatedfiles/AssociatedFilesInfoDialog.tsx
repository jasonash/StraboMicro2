/**
 * Associated Files Info Dialog Component
 *
 * LEGACY MATCH: editAssociatedFilesInfo.java + editAssociatedFilesInfo.fxml
 * Shows list of existing files + file picker for adding new files
 * ENHANCED: Supports bulk import of multiple files at once
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
  Chip,
  CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
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
  const [initialFiles, setInitialFiles] = useState<AssociatedFileData[]>([]);
  const [editingFile, setEditingFile] = useState<AssociatedFileData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // New file form state - now supports multiple files
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [newFileType, setNewFileType] = useState<string>('');
  const [newOtherType, setNewOtherType] = useState<string>('');
  const [newFileNotes, setNewFileNotes] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !project) return;

    if (micrographId) {
      const micrograph = findMicrographById(project, micrographId);
      const existingFiles = (micrograph?.associatedFiles || []) as AssociatedFileData[];
      setFiles(existingFiles);
      setInitialFiles(existingFiles);
    } else if (spotId) {
      const spot = findSpotById(project, spotId);
      const existingFiles = (spot?.associatedFiles || []) as AssociatedFileData[];
      setFiles(existingFiles);
      setInitialFiles(existingFiles);
    }

    // Reset new file form
    setSelectedFilePaths([]);
    setNewFileType('');
    setNewOtherType('');
    setNewFileNotes('');
    setIsAdding(false);
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

  // Handle file selection using native Electron dialog (multi-select)
  const handleBrowseFiles = async () => {
    if (!window.api?.openFilesDialog) {
      console.error('File dialog API not available');
      return;
    }

    try {
      const filePaths = await window.api.openFilesDialog();
      if (filePaths && filePaths.length > 0) {
        // Add to existing selection (avoid duplicates)
        setSelectedFilePaths(prev => {
          const newPaths = filePaths.filter(p => !prev.includes(p));
          return [...prev, ...newPaths];
        });
      }
    } catch (error) {
      console.error('Error opening file dialog:', error);
    }
  };

  // Remove a file from selection
  const handleRemoveFromSelection = (pathToRemove: string) => {
    setSelectedFilePaths(prev => prev.filter(p => p !== pathToRemove));
  };

  // Handle adding multiple files at once
  const handleAddFiles = async () => {
    if (selectedFilePaths.length === 0 || !project?.id) return;

    setIsAdding(true);
    const newFiles: AssociatedFileData[] = [];
    const duplicateFiles: string[] = [];
    const otherErrors: string[] = [];

    for (const filePath of selectedFilePaths) {
      // Extract filename from path
      const fileName = filePath.split(/[/\\]/).pop() || filePath;

      try {
        // Copy file to project's associatedFiles folder
        if (window.api?.copyToAssociatedFiles) {
          await window.api.copyToAssociatedFiles(filePath, project.id, fileName);
          console.log(`File copied to associatedFiles: ${fileName}`);
        }

        const newFile: AssociatedFileData = {
          fileName: fileName,
          originalPath: filePath,
          fileType: newFileType,
          otherType: newFileType === 'Other' ? newOtherType : '',
          notes: newFileNotes,
        };

        newFiles.push(newFile);
      } catch (error: any) {
        console.error('Error copying file:', error);
        // Check if it's a duplicate file error
        if (error?.message?.includes('already exists')) {
          duplicateFiles.push(fileName);
        } else {
          otherErrors.push(fileName);
        }
      }
    }

    // Add all successfully copied files
    if (newFiles.length > 0) {
      setFiles([...files, ...newFiles]);
    }

    // Reset form
    setSelectedFilePaths([]);
    setNewFileType('');
    setNewOtherType('');
    setNewFileNotes('');
    setIsAdding(false);

    // Show specific error messages
    const messages: string[] = [];
    if (duplicateFiles.length > 0) {
      messages.push(`Already added: ${duplicateFiles.join(', ')}`);
    }
    if (otherErrors.length > 0) {
      messages.push(`Failed to add: ${otherErrors.join(', ')}`);
    }
    if (messages.length > 0) {
      alert(messages.join('\n\n'));
    }
  };

  // Validation for add button
  const canAddFiles = (() => {
    if (selectedFilePaths.length === 0) return false;
    if (newFileType === '') return false;
    if (newFileType === 'Other' && newOtherType.trim() === '') return false;
    if (isAdding) return false;
    return true;
  })();

  // Check if any changes have been made (for Save button)
  const hasChanges = (() => {
    if (files.length !== initialFiles.length) return true;
    // Deep compare files array
    return JSON.stringify(files) !== JSON.stringify(initialFiles);
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
                    <AssociatedFileListItem file={file} projectId={project?.id} />
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

        {/* Add New Files Section - supports bulk import */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
            Add Files
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Choose Files - supports multiple selection */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Choose Files:
              </Typography>
              <Button
                variant="outlined"
                onClick={handleBrowseFiles}
                fullWidth
                sx={{ mb: 1 }}
              >
                Browse Files...
              </Button>

              {/* Show selected files as chips */}
              {selectedFilePaths.length > 0 && (
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1,
                    p: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  {selectedFilePaths.map((filePath, index) => {
                    const fileName = filePath.split(/[/\\]/).pop() || filePath;
                    return (
                      <Chip
                        key={index}
                        label={fileName}
                        size="small"
                        onDelete={() => handleRemoveFromSelection(filePath)}
                        deleteIcon={<CloseIcon />}
                      />
                    );
                  })}
                </Box>
              )}

              {selectedFilePaths.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {selectedFilePaths.length} file{selectedFilePaths.length !== 1 ? 's' : ''} selected
                </Typography>
              )}
            </Box>

            {/* File Type - applied to all selected files */}
            <FormControl fullWidth>
              <InputLabel>File Type (for all files)</InputLabel>
              <Select
                value={newFileType}
                label="File Type (for all files)"
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

            {/* Other Type - Conditional */}
            {newFileType === 'Other' && (
              <TextField
                fullWidth
                label="Other File Type"
                value={newOtherType}
                onChange={(e) => setNewOtherType(e.target.value)}
                placeholder="Specify file type"
              />
            )}

            {/* Notes - applied to all selected files */}
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Notes (added to each file)"
              value={newFileNotes}
              onChange={(e) => setNewFileNotes(e.target.value)}
              placeholder="Add notes about these files..."
            />

            {/* Add Button */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={handleAddFiles}
                disabled={!canAddFiles}
                startIcon={isAdding ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {isAdding
                  ? 'Adding...'
                  : selectedFilePaths.length > 1
                    ? `Add ${selectedFilePaths.length} Files`
                    : 'Add'}
              </Button>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!hasChanges}>
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
