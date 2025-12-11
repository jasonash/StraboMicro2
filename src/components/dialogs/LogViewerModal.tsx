/**
 * LogViewerModal - Display application logs with copy and email options
 *
 * Features:
 * - Scrollable view of the log file contents
 * - Copy to clipboard button
 * - Email support button (mailto: link)
 * - Auto-scroll to bottom on open
 */

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  IconButton,
  Typography,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailIcon from '@mui/icons-material/Email';
import RefreshIcon from '@mui/icons-material/Refresh';

interface LogViewerModalProps {
  open: boolean;
  onClose: () => void;
}

const SUPPORT_EMAIL = 'strabospot@gmail.com';
const EMAIL_SUBJECT = 'StraboMicro Bug Report';

export function LogViewerModal({ open, onClose }: LogViewerModalProps) {
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const logContainerRef = useRef<HTMLPreElement>(null);

  // Load log content when modal opens
  useEffect(() => {
    if (open) {
      loadLogs();
    }
  }, [open]);

  // Auto-scroll to bottom when content loads
  useEffect(() => {
    if (logContent && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const content = await window.api?.logs?.read();
      setLogContent(content || 'No logs available');
    } catch (err) {
      console.error('Failed to load logs:', err);
      setLogContent('Error loading logs: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logContent);
      setCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  const handleEmail = () => {
    // Create mailto link with pre-filled subject
    // Note: Body is intentionally left empty - user will paste logs manually
    // (mailto body has character limits that would truncate logs)
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECT)}`;
    window.api?.openExternalLink(mailtoUrl);
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '80vh',
            maxHeight: '80vh',
          },
        }}
      >
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
            Error Logs
          </Typography>
          <IconButton
            onClick={loadLogs}
            disabled={loading}
            size="small"
            title="Refresh logs"
          >
            <RefreshIcon />
          </IconButton>
          <IconButton onClick={onClose} size="small" title="Close">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box
              component="pre"
              ref={logContainerRef}
              sx={{
                flex: 1,
                m: 0,
                p: 2,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark' ? '#1a1a1a' : '#f5f5f5',
                color: (theme) =>
                  theme.palette.mode === 'dark' ? '#e0e0e0' : '#333',
              }}
            >
              {logContent}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ flexGrow: 1, mr: 2 }}
          >
            Copy logs and paste into your email when reporting bugs
          </Typography>

          <Button
            onClick={handleEmail}
            startIcon={<EmailIcon />}
            variant="outlined"
            size="small"
          >
            Email Support
          </Button>

          <Button
            onClick={handleCopy}
            startIcon={<ContentCopyIcon />}
            variant="contained"
            size="small"
          >
            Copy to Clipboard
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={copySuccess}
        autoHideDuration={2000}
        onClose={() => setCopySuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setCopySuccess(false)}>
          Logs copied to clipboard
        </Alert>
      </Snackbar>
    </>
  );
}
