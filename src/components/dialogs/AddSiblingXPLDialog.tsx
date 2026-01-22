/**
 * Add Sibling XPL Dialog
 *
 * Simple dialog for adding a corresponding XPL image to an existing PPL micrograph.
 * This provides a streamlined way to add the XPL sibling if the user forgot during
 * initial PPL creation.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  LinearProgress,
  Alert,
} from '@mui/material';
import { Image as ImageIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { MicrographMetadata } from '@/types/project-types';

interface AddSiblingXPLDialogProps {
  open: boolean;
  onClose: () => void;
  pplMicrographId: string | null;
}

export function AddSiblingXPLDialog({
  open,
  onClose,
  pplMicrographId,
}: AddSiblingXPLDialogProps) {
  const [xplName, setXplName] = useState('');
  const [xplFileName, setXplFileName] = useState('');
  const [scratchIdentifier, setScratchIdentifier] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState<number>(0);
  const [imageHeight, setImageHeight] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{
    stage: string;
    percent: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const project = useAppStore((state) => state.project);
  const addMicrograph = useAppStore((state) => state.addMicrograph);
  const linkSiblingImages = useAppStore((state) => state.linkSiblingImages);

  // Find the PPL micrograph and its sample
  const { pplMicrograph, sampleId } = (() => {
    if (!project || !pplMicrographId) return { pplMicrograph: null, sampleId: null };

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find(m => m.id === pplMicrographId);
        if (micro) {
          return { pplMicrograph: micro, sampleId: sample.id };
        }
      }
    }
    return { pplMicrograph: null, sampleId: null };
  })();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setXplName('');
      setXplFileName('');
      setScratchIdentifier(null);
      setPreviewUrl(null);
      setImageWidth(0);
      setImageHeight(0);
      setLoading(false);
      setConversionProgress(null);
      setError(null);
    }
  }, [open]);

  // Handle file selection
  const handleBrowseImage = useCallback(async () => {
    if (!window.api?.openTiffDialog) return;

    try {
      setError(null);
      const filePath = await window.api.openTiffDialog();
      if (!filePath) return;

      setLoading(true);
      setConversionProgress({ stage: 'Converting image...', percent: 0 });

      // Extract filename (handle both Unix and Windows paths)
      const fileName = filePath.split(/[\\/]/).pop() || 'image.tif';
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

      setXplFileName(fileName);
      setXplName(nameWithoutExt);

      // Listen for progress updates
      if (window.api.onConversionProgress) {
        window.api.onConversionProgress((progress: { stage: string; percent: number }) => {
          setConversionProgress(progress);
        });
      }

      // Convert to JPEG and store in scratch
      const conversionResult = await window.api.convertToScratchJPEG(filePath);

      if (!conversionResult) {
        throw new Error('Image conversion failed');
      }

      setScratchIdentifier(conversionResult.identifier);
      setImageWidth(conversionResult.jpegWidth);
      setImageHeight(conversionResult.jpegHeight);

      // Load preview thumbnail
      const tileData = await window.api.loadImageWithTiles(conversionResult.scratchPath);
      if (tileData) {
        const thumbDataUrl = await window.api.loadThumbnail(tileData.hash);
        setPreviewUrl(thumbDataUrl);
      }

      setConversionProgress(null);
    } catch (err) {
      console.error('[AddSiblingXPLDialog] Error loading image:', err);
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle adding the XPL image
  const handleAdd = useCallback(async () => {
    if (!pplMicrograph || !sampleId || !scratchIdentifier || !project || !window.api) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const xplMicrographId = crypto.randomUUID();

      // Move image from scratch to project folder
      console.log(`[AddSiblingXPLDialog] Moving XPL image to project folder: ${xplMicrographId}`);
      await window.api.moveFromScratch(scratchIdentifier, project.id, xplMicrographId);

      // Create XPL micrograph - inherits position and instrument from PPL
      const xplMicrograph: MicrographMetadata = {
        id: xplMicrographId,
        name: xplName || xplFileName || 'XPL Image',
        imageFilename: xplFileName,
        imagePath: xplMicrographId,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
        width: imageWidth,
        height: imageHeight,
        opacity: pplMicrograph.opacity ?? 1.0,
        imageType: 'Cross Polarized Light',
        // Inherit parent and position from PPL
        parentID: pplMicrograph.parentID,
        offsetInParent: pplMicrograph.offsetInParent
          ? { ...pplMicrograph.offsetInParent }
          : undefined,
        rotation: pplMicrograph.rotation,
        scaleX: pplMicrograph.scaleX,
        scaleY: pplMicrograph.scaleY,
        pointInParent: pplMicrograph.pointInParent
          ? { ...pplMicrograph.pointInParent }
          : undefined,
        // Inherit instrument settings from PPL
        instrument: pplMicrograph.instrument
          ? { ...pplMicrograph.instrument }
          : undefined,
        // Inherit scale from PPL
        scalePixelsPerCentimeter: pplMicrograph.scalePixelsPerCentimeter,
        // Default visibility
        isMicroVisible: true,
        isFlipped: false,
      };

      // Add to store
      addMicrograph(sampleId, xplMicrograph);
      console.log('[AddSiblingXPLDialog] XPL micrograph created:', xplMicrographId);

      // Link as siblings (PPL is primary, XPL is secondary)
      linkSiblingImages(pplMicrograph.id, xplMicrographId);
      console.log('[AddSiblingXPLDialog] Sibling link created:', pplMicrograph.id, '<->', xplMicrographId);

      // Close dialog first
      onClose();

      // Generate thumbnails in the background
      setTimeout(async () => {
        try {
          const freshProject = useAppStore.getState().project;
          if (!freshProject || !window.api) return;

          // Generate XPL thumbnail
          await window.api.generateCompositeThumbnail(freshProject.id, xplMicrographId, freshProject);
          window.dispatchEvent(
            new CustomEvent('thumbnail-generated', { detail: { micrographId: xplMicrographId } })
          );

          // Regenerate parent thumbnail if this is an associated micrograph
          if (pplMicrograph.parentID) {
            await window.api.generateCompositeThumbnail(
              freshProject.id,
              pplMicrograph.parentID,
              freshProject
            );
            window.dispatchEvent(
              new CustomEvent('thumbnail-generated', { detail: { micrographId: pplMicrograph.parentID } })
            );
          }

          console.log('[AddSiblingXPLDialog] Thumbnails generated');
        } catch (err) {
          console.error('[AddSiblingXPLDialog] Error generating thumbnails:', err);
        }
      }, 100);

    } catch (err) {
      console.error('[AddSiblingXPLDialog] Error adding XPL:', err);
      setError(err instanceof Error ? err.message : 'Failed to add XPL image');
      setLoading(false);
    }
  }, [pplMicrograph, sampleId, scratchIdentifier, project, xplName, xplFileName, imageWidth, imageHeight, addMicrograph, linkSiblingImages, onClose]);

  const canAdd = scratchIdentifier && xplName && !loading;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="add-sibling-xpl-dialog-title"
    >
      <DialogTitle id="add-sibling-xpl-dialog-title">
        Add Corresponding XPL Image
      </DialogTitle>
      <DialogContent>
        {!pplMicrograph ? (
          <Alert severity="error">PPL micrograph not found.</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Add a Cross Polarized Light (XPL) image to pair with "{pplMicrograph.name || pplMicrograph.imageFilename}".
              The XPL will inherit the position and settings from the PPL.
            </Typography>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* File Selection */}
            <Box>
              <Button
                variant="outlined"
                onClick={handleBrowseImage}
                disabled={loading}
                startIcon={<ImageIcon />}
                fullWidth
              >
                {scratchIdentifier ? 'Change Image...' : 'Select XPL Image...'}
              </Button>
            </Box>

            {/* Conversion Progress */}
            {conversionProgress && (
              <Box sx={{ width: '100%' }}>
                <Typography variant="caption" color="text.secondary">
                  {conversionProgress.stage}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={conversionProgress.percent}
                  sx={{ mt: 0.5 }}
                />
              </Box>
            )}

            {/* Preview and Name */}
            {previewUrl && (
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box
                  component="img"
                  src={previewUrl}
                  alt="XPL Preview"
                  sx={{
                    width: 120,
                    height: 90,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
                <Box sx={{ flex: 1 }}>
                  <TextField
                    label="Name"
                    value={xplName}
                    onChange={(e) => setXplName(e.target.value)}
                    fullWidth
                    size="small"
                    disabled={loading}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {imageWidth} × {imageHeight} pixels
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {xplFileName}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleAdd}
          variant="contained"
          disabled={!canAdd}
        >
          {loading ? 'Adding...' : 'Add XPL Image'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
