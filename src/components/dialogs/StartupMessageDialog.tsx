import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Box,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';

interface StartupMessageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  onDismiss: () => void;
}

export function StartupMessageDialog({ isOpen, onClose, message, onDismiss }: StartupMessageDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = () => {
    if (dontShowAgain) {
      onDismiss();
    }
    setDontShowAgain(false);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Message from StraboSpot</DialogTitle>
      <DialogContent>
        <Box
          sx={{
            '& a': { color: 'primary.main' },
            '& p': { mt: 0, mb: 1 },
            '& ul, & ol': { mt: 0, mb: 1, pl: 3 },
            '& code': {
              bgcolor: 'action.hover',
              px: 0.5,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.875em',
            },
            '& pre': {
              bgcolor: 'action.hover',
              p: 1.5,
              borderRadius: 1,
              overflow: 'auto',
            },
            '& img': { maxWidth: '100%' },
          }}
        >
          <ReactMarkdown>{message}</ReactMarkdown>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              size="small"
            />
          }
          label="Don't show this again"
        />
        <Button onClick={handleClose} variant="outlined">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
