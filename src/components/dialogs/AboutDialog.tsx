/**
 * About Dialog Component
 *
 * Displays app information including version, license, and copyright.
 * Matches the legacy JavaFX About dialog.
 */

import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
} from '@mui/material';
import appIcon from '@/assets/app-icon.png';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// MIT License text
const LICENSE_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  // Get version from package.json (injected at build time)
  const version = __APP_VERSION__ || '0.1.0';
  const currentYear = new Date().getFullYear();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '80vh' },
      }}
    >
      <DialogContent sx={{ textAlign: 'center', py: 3 }}>
        {/* Logo and Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
          <Box
            component="img"
            src={appIcon}
            alt="StraboMicro Logo"
            sx={{ width: 48, height: 48, borderRadius: 1 }}
          />
          <Typography variant="h5" sx={{ fontWeight: 600, letterSpacing: 2 }}>
            STRABOMICRO
          </Typography>
        </Box>

        {/* Version */}
        <Typography variant="h6" sx={{ mb: 2 }}>
          Version {version}
        </Typography>

        {/* License */}
        <Typography variant="body2" sx={{ mb: 1 }}>
          The MIT License (MIT)
        </Typography>

        {/* Copyright */}
        <Typography variant="body2" sx={{ mb: 3 }}>
          Copyright (c) {currentYear} StraboSpot
        </Typography>

        {/* License Text */}
        <Box
          sx={{
            textAlign: 'left',
            px: 2,
            py: 1,
            bgcolor: 'action.hover',
            borderRadius: 1,
            maxHeight: 250,
            overflowY: 'auto',
          }}
        >
          <Typography
            variant="caption"
            component="div"
            sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
          >
            {LICENSE_TEXT}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
        <Button onClick={onClose} variant="outlined">
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
