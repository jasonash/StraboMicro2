/**
 * "Discard this mosaic?": asked when a dialog that holds a mosaic from the Image Stitcher as its
 * image (New Micrograph, the New Project wizard) is cancelled. A mosaic can take minutes to
 * make, so it can still be saved as an image file here.
 *
 * Design: docs/image-stitcher-design.md (phase 4)
 */

import React, { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { StitchedMosaic } from '@/services/stitch/stitchApp';

interface DiscardMosaicDialogProps {
  open: boolean;
  mosaic: StitchedMosaic | null;
  onKeepWorking: () => void;
  /** Go on with the cancel (after Discard, or after the mosaic was saved as a file) */
  onLeave: () => void;
}

export const DiscardMosaicDialog: React.FC<DiscardMosaicDialogProps> = ({ open, mosaic, onKeepWorking, onLeave }) => {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const handleSave = async () => {
    if (!mosaic || !window.api) return;
    setSaving(true);
    setProblem(null);
    try {
      const result = await window.api.stitch.saveHandedWithDialog(mosaic.path, mosaic.name);
      if (result.success) onLeave();
      else if (!result.canceled) setProblem(`The mosaic could not be saved: ${result.error ?? 'unknown error'}`);
    } catch (error) {
      setProblem(`The mosaic could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { if (!saving) onKeepWorking(); }} maxWidth="xs" fullWidth>
      <DialogTitle>Discard this mosaic?</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          The mosaic has not been added to the project. It will be lost unless you save it as an image file.
        </Typography>
        {problem && <Typography variant="body2" color="error" sx={{ mt: 1 }}>{problem}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onKeepWorking} disabled={saving}>Keep Working</Button>
        <Button onClick={handleSave} disabled={saving}>Save as an Image File...</Button>
        <Button color="error" onClick={onLeave} disabled={saving}>Discard</Button>
      </DialogActions>
    </Dialog>
  );
};
