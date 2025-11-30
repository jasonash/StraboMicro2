/**
 * Link Add/Edit Form
 *
 * LEGACY MATCH: editLink.java + editLink.fxml
 * Simple form for adding web links with label and URL
 */

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
} from '@mui/material';

export interface LinkData {
  label: string; // Display name for the link
  url: string; // Full URL (must start with http:// or https://)
}

interface LinkAddFormProps {
  onAdd: (link: LinkData) => void;
  onCancel?: () => void;
  initialData?: LinkData;
}

// LEGACY: Lines 102-127 in editLink.java
// URL validation regex (must start with http:// or https://)
function isValidURL(url: string): boolean {
  if (!url) return false;

  // Simple validation: must start with http:// or https://
  const hasProtocol = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('ftp://');
  if (!hasProtocol) return false;

  // Must have a domain after protocol
  const urlWithoutProtocol = url.replace(/^(http|https|ftp):\/\//, '');
  if (urlWithoutProtocol.length === 0) return false;

  // Must contain at least one dot (domain.tld)
  return urlWithoutProtocol.includes('.');
}

export function LinkAddForm({ onAdd, onCancel, initialData }: LinkAddFormProps) {
  const [label, setLabel] = useState<string>(initialData?.label || '');
  const [url, setUrl] = useState<string>(initialData?.url || '');

  useEffect(() => {
    if (initialData) {
      setLabel(initialData.label || '');
      setUrl(initialData.url || '');
    }
  }, [initialData]);

  const handleSubmit = () => {
    onAdd({
      label: label,
      url: url,
    });

    // Reset form if adding (not editing)
    if (!initialData) {
      setLabel('');
      setUrl('');
    }
  };

  // LEGACY VALIDATION: lines 65-76
  // Must have label AND valid URL
  const isValid = label.trim() !== '' && isValidURL(url);

  // Show URL format error if URL is entered but invalid
  const showUrlError = url.trim() !== '' && !isValidURL(url);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Link Label - LEGACY: lines 42-46 (FXML), 20, 23-25, 56 (Java) */}
      <TextField
        fullWidth
        required
        label="Link Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Enter a descriptive label"
      />

      {/* Link URL - LEGACY: lines 48-52 (FXML), 21, 27-29, 57, 70 (Java) */}
      <Box>
        <TextField
          fullWidth
          required
          label="Link URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.example.com"
          error={showUrlError}
          helperText={showUrlError ? "Invalid URL format" : ""}
        />

        {/* Help text - LEGACY: lines 54-58 (FXML) */}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          Link URL must begin with http:// or https://
        </Typography>
      </Box>

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
