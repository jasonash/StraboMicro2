/**
 * SendErrorReportModal - Send error reports directly to StraboSpot server
 *
 * Features:
 * - Description text field with 5K character limit
 * - Submit button only active when description is entered
 * - Automatic upload of error description + app version + log file
 * - Success message shown before closing
 */

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Typography,
  TextField,
  CircularProgress,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';

interface SendErrorReportModalProps {
  open: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  onLoginRequest: () => void;
}

const MAX_DESCRIPTION_LENGTH = 5000;

export function SendErrorReportModal({
  open,
  onClose,
  isLoggedIn,
  onLoginRequest,
}: SendErrorReportModalProps) {
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    // Reset state when closing
    setDescription('');
    setError(null);
    setSuccess(false);
    setSending(false);
    onClose();
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setDescription(value);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Please enter a description of the error.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const result = await window.api?.sendErrorReport?.(description.trim());

      if (result?.success) {
        setSuccess(true);
      } else if (result?.sessionExpired) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError(result?.error || 'Failed to send error report. Please try again.');
      }
    } catch (err) {
      console.error('Failed to send error report:', err);
      setError('Failed to send error report. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleLogin = () => {
    onLoginRequest();
    handleClose();
  };

  const charactersRemaining = MAX_DESCRIPTION_LENGTH - description.length;
  const isSubmitDisabled = !description.trim() || sending;

  // Show login prompt if not logged in
  if (!isLoggedIn) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
            Send Error Report
          </Typography>
          <IconButton onClick={handleClose} size="small" title="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            You must be logged in to send error reports.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Error reports are sent to the StraboSpot team and help us improve the application.
            Please log in to your StraboSpot account to submit a report.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={handleClose} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleLogin} variant="contained" color="primary">
            Log In
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Show success message
  if (success) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
            Error Report Sent
          </Typography>
          <IconButton onClick={handleClose} size="small" title="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Alert severity="success" sx={{ mb: 2 }}>
            Your error report has been sent successfully.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Thank you for helping us improve StraboMicro. Our team will review your report
            and may follow up if we need more information.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.5 }}>
          <Button onClick={handleClose} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Main form
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center' }}>
        <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
          Send Error Report
        </Typography>
        <IconButton onClick={handleClose} size="small" title="Close" disabled={sending}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Please describe the error you encountered. Your description and application logs
          will be sent to the StraboSpot team.
        </Typography>

        <TextField
          label="Error Description"
          placeholder="Please describe what you were doing when the error occurred and what happened..."
          multiline
          rows={6}
          fullWidth
          value={description}
          onChange={handleDescriptionChange}
          disabled={sending}
          error={!!error}
          helperText={
            error || `${charactersRemaining.toLocaleString()} characters remaining`
          }
          sx={{ mb: 1 }}
        />

        {error && !description.trim() && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="caption" color="text.secondary">
            App version and logs will be included automatically
          </Typography>
        </Box>
        <Button onClick={handleClose} color="inherit" disabled={sending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={isSubmitDisabled}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
        >
          {sending ? 'Sending...' : 'Send Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
