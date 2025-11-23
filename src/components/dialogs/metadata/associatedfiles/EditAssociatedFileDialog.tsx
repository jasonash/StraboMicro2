/**
 * Edit Associated File Dialog
 *
 * Small modal for editing an existing associated file's metadata
 * LEGACY MATCH: editAssociatedFile.java + editAssociatedFile.fxml
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Typography,
} from '@mui/material';
import { AssociatedFileData } from './AssociatedFileAddForm';

interface EditAssociatedFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  file: AssociatedFileData;
  onSave: (updatedFile: AssociatedFileData) => void;
}

const FILE_TYPES = ['Image', 'Spreadsheet', 'PDF', 'Script', 'Other'];

export function EditAssociatedFileDialog({
  isOpen,
  onClose,
  file,
  onSave,
}: EditAssociatedFileDialogProps) {
  const [fileType, setFileType] = useState<string>(file.fileType);
  const [otherType, setOtherType] = useState<string>(file.otherType);
  const [notes, setNotes] = useState<string>(file.notes);

  useEffect(() => {
    if (isOpen) {
      setFileType(file.fileType);
      setOtherType(file.otherType);
      setNotes(file.notes);
    }
  }, [isOpen, file]);

  const handleFileTypeChange = (value: string) => {
    setFileType(value);
    if (value !== 'Other') {
      setOtherType('');
    }
  };

  const handleSave = () => {
    onSave({
      fileName: file.fileName,
      originalPath: file.originalPath,
      fileType: fileType,
      otherType: fileType === 'Other' ? otherType : '',
      notes: notes,
    });
    onClose();
  };

  const isValid = (() => {
    if (fileType === '') return false;
    if (fileType === 'Other' && otherType.trim() === '') return false;
    return true;
  })();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Edit File Metadata</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          {/* File Name - Read-only */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              File:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {file.fileName}
            </Typography>
          </Box>

          {/* File Type */}
          <FormControl fullWidth>
            <InputLabel>File Type</InputLabel>
            <Select
              value={fileType}
              label="File Type"
              onChange={(e) => handleFileTypeChange(e.target.value)}
            >
              <MenuItem value="">
                <em>Select...</em>
              </MenuItem>
              {FILE_TYPES.map(type => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Other Type - Conditional */}
          {fileType === 'Other' && (
            <TextField
              fullWidth
              label="Other File Type"
              value={otherType}
              onChange={(e) => setOtherType(e.target.value)}
              placeholder="Specify file type"
            />
          )}

          {/* Notes */}
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this file..."
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!isValid}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
