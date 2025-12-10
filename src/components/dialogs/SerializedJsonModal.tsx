/**
 * Serialized JSON Modal
 *
 * Displays the serialized project JSON that will be sent to the server or saved in .smz files.
 * This is useful for debugging upload issues before the actual upload.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
  Grow,
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';

interface SerializedJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SerializedJsonModal: React.FC<SerializedJsonModalProps> = ({ isOpen, onClose }) => {
  const project = useAppStore(state => state.project);
  const [serializedJson, setSerializedJson] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setIsLoading(true);
      setError(null);
      setSerializedJson(null);

      window.api?.getSerializedProjectJson(project)
        .then((json) => {
          setSerializedJson(json);
        })
        .catch((err) => {
          setError(err.message || 'Failed to serialize project');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, project]);

  const handleCopyToClipboard = () => {
    if (serializedJson) {
      navigator.clipboard.writeText(serializedJson);
      alert('Serialized JSON copied to clipboard!');
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionComponent={Grow}
      transitionDuration={300}
    >
      <DialogTitle>Serialized Project JSON (for upload/export)</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This is the exact JSON that will be sent to the server or saved in .smz files.
          Numeric values are rounded and null values are removed for database compatibility.
        </Typography>

        {!project && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">No project currently loaded.</Typography>
          </Box>
        )}

        {project && isLoading && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={40} />
            <Typography color="text.secondary" sx={{ mt: 2 }}>Serializing project...</Typography>
          </Box>
        )}

        {project && error && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {project && serializedJson && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {(serializedJson.length / 1024).toFixed(1)} KB
              </Typography>
              <Button
                size="small"
                startIcon={<CopyIcon />}
                onClick={handleCopyToClipboard}
              >
                Copy to Clipboard
              </Button>
            </Box>
            <Box
              component="pre"
              sx={{
                bgcolor: 'background.default',
                p: 2,
                borderRadius: 1,
                maxHeight: 500,
                overflow: 'auto',
                fontSize: 11,
                lineHeight: 1.4,
                fontFamily: 'monospace',
              }}
            >
              {serializedJson}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
