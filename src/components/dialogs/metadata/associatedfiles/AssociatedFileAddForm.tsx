/**
 * Associated File Add/Edit Form
 *
 * LEGACY MATCH: editAssociatedFile.java + editAssociatedFile.fxml
 * Simple form for file metadata (type and notes)
 * Note: fileName is read-only, set externally when file is added
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';

export interface AssociatedFileData {
  fileName: string; // Read-only, set when file is uploaded
  originalPath: string; // Original file path
  fileType: string; // Image, Spreadsheet, PDF, Script, Other
  otherType: string; // Custom type when fileType is "Other"
  notes: string; // User notes
}

interface AssociatedFileAddFormProps {
  onAdd: (file: AssociatedFileData) => void;
  onCancel?: () => void;
  initialData?: AssociatedFileData;
}

// LEGACY: Lines 28-33 in editAssociatedFile.java
const FILE_TYPES = ['Image', 'Spreadsheet', 'PDF', 'Script', 'Other'];

export function AssociatedFileAddForm({ onAdd, onCancel, initialData }: AssociatedFileAddFormProps) {
  const [fileType, setFileType] = useState<string>(initialData?.fileType || '');
  const [otherType, setOtherType] = useState<string>(initialData?.otherType || '');
  const [notes, setNotes] = useState<string>(initialData?.notes || '');

  useEffect(() => {
    if (initialData) {
      setFileType(initialData.fileType || '');
      setOtherType(initialData.otherType || '');
      setNotes(initialData.notes || '');
    }
  }, [initialData]);

  const handleFileTypeChange = (value: string) => {
    setFileType(value);
    // Clear otherType when changing away from "Other" - LEGACY: lines 105-112
    if (value !== 'Other') {
      setOtherType('');
    }
  };

  const handleSubmit = () => {
    if (!initialData) return; // Can't add without initialData (fileName must be set)

    onAdd({
      fileName: initialData.fileName,
      originalPath: initialData.originalPath,
      fileType: fileType,
      otherType: fileType === 'Other' ? otherType : '',
      notes: notes,
    });
  };

  // LEGACY VALIDATION: lines 117-130
  const isValid = (() => {
    // Must have file type selected
    if (fileType === '') return false;

    // If "Other" is selected, must have otherType filled
    if (fileType === 'Other' && otherType.trim() === '') return false;

    return true;
  })();

  if (!initialData) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Error: No file selected</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* File Name - Read-only display - LEGACY: line 23, 43 */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          File: {initialData.fileName}
        </Typography>
      </Box>

      {/* File Type - LEGACY: lines 46-48 (FXML), 27-48 (Java) */}
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

      {/* Other Type - Conditional - LEGACY: lines 50 (FXML), 39-44, 107-112 (Java) */}
      {fileType === 'Other' && (
        <TextField
          fullWidth
          label="Other File Type"
          value={otherType}
          onChange={(e) => setOtherType(e.target.value)}
          placeholder="Specify file type"
        />
      )}

      {/* Notes - LEGACY: lines 51-56 (FXML), 24, 54-56, 97 (Java) */}
      <TextField
        fullWidth
        multiline
        rows={4}
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes about this file..."
      />

      {/* Submit Button */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
        {onCancel && (
          <Button onClick={onCancel} variant="outlined">
            Cancel Edit
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!isValid}
        >
          {initialData ? 'Update' : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}
