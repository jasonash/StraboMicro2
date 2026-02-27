/**
 * Add Sibling Dialog
 *
 * Dialog for adding a corresponding PPL or XPL image to an existing micrograph.
 * Works bidirectionally: can add XPL to PPL, or PPL to XPL.
 * The direction is derived from the source micrograph's imageType.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
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

interface AddSiblingDialogProps {
  open: boolean;
  onClose: () => void;
  sourceMicrographId: string | null;
}

const PPL_TYPES = ['PPL', 'Plane Polarized Light', 'Plane-Polarized Light'];

function isPPLType(imageType: string | undefined | null): boolean {
  if (!imageType) return false;
  const normalized = imageType.toUpperCase();
  return PPL_TYPES.some(t => normalized.includes(t.toUpperCase()));
}


export function AddSiblingDialog({
  open,
  onClose,
  sourceMicrographId,
}: AddSiblingDialogProps) {
  const [siblingName, setSiblingName] = useState('');
  const [siblingFileName, setSiblingFileName] = useState('');
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
  const [dimensionError, setDimensionError] = useState<string | null>(null);

  const project = useAppStore((state) => state.project);
  const addMicrograph = useAppStore((state) => state.addMicrograph);
  const linkSiblingImages = useAppStore((state) => state.linkSiblingImages);

  // Aspect ratio tolerance for sibling matching (1%)
  const ASPECT_RATIO_TOLERANCE = 0.01;

  // Find the source micrograph and its sample
  const { sourceMicrograph, sampleId } = (() => {
    if (!project || !sourceMicrographId) return { sourceMicrograph: null, sampleId: null };

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find(m => m.id === sourceMicrographId);
        if (micro) {
          return { sourceMicrograph: micro, sampleId: sample.id };
        }
      }
    }
    return { sourceMicrograph: null, sampleId: null };
  })();

  // Derive direction from source micrograph's imageType
  const { sourceIsPPL, siblingType, siblingLabel, sourceLabel } = useMemo(() => {
    const srcIsPPL = isPPLType(sourceMicrograph?.imageType);
    return {
      sourceIsPPL: srcIsPPL,
      siblingType: srcIsPPL ? 'Cross Polarized Light' as const : 'Plane Polarized Light' as const,
      siblingLabel: srcIsPPL ? 'XPL' : 'PPL',
      sourceLabel: srcIsPPL ? 'PPL' : 'XPL',
    };
  }, [sourceMicrograph?.imageType]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSiblingName('');
      setSiblingFileName('');
      setScratchIdentifier(null);
      setPreviewUrl(null);
      setImageWidth(0);
      setImageHeight(0);
      setLoading(false);
      setConversionProgress(null);
      setError(null);
      setDimensionError(null);
    }
  }, [open]);

  // Handle file selection
  const handleBrowseImage = useCallback(async () => {
    if (!window.api?.openTiffDialog || !sourceMicrograph) return;

    try {
      setError(null);
      setDimensionError(null);
      const filePath = await window.api.openTiffDialog();
      if (!filePath) return;

      // Validate the file is readable and has a recognized image format
      const [validation] = await window.api.validateImageFiles([filePath]);
      if (!validation?.valid) {
        setError(validation?.error || 'The selected file could not be read. If it is stored in cloud storage, please download it locally first.');
        return;
      }

      setLoading(true);
      setConversionProgress({ stage: 'Converting image...', percent: 0 });

      // Extract filename (handle both Unix and Windows paths)
      const fileName = filePath.split(/[\\/]/).pop() || 'image.tif';
      const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;

      setSiblingFileName(fileName);
      setSiblingName(nameWithoutExt);

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

      // Get source dimensions for validation
      const sourceWidth = sourceMicrograph?.width || sourceMicrograph?.imageWidth || 0;
      const sourceHeight = sourceMicrograph?.height || sourceMicrograph?.imageHeight || 0;
      const newWidth = conversionResult.jpegWidth;
      const newHeight = conversionResult.jpegHeight;

      // Validate aspect ratios match
      if (sourceWidth > 0 && sourceHeight > 0 && newWidth > 0 && newHeight > 0) {
        const sourceAspectRatio = sourceWidth / sourceHeight;
        const newAspectRatio = newWidth / newHeight;
        const aspectDiff = Math.abs(sourceAspectRatio - newAspectRatio);
        const tolerance = ASPECT_RATIO_TOLERANCE * Math.max(sourceAspectRatio, newAspectRatio);

        if (aspectDiff > tolerance) {
          // Aspect ratios don't match - clean up and show error
          if (window.api.deleteScratchImage) {
            await window.api.deleteScratchImage(conversionResult.identifier);
          }
          setDimensionError(
            `The ${siblingLabel} image dimensions (${newWidth} \u00d7 ${newHeight}) are not compatible with ` +
            `the ${sourceLabel} image (${sourceWidth} \u00d7 ${sourceHeight}). Both images must have the same aspect ratio.`
          );
          setConversionProgress(null);
          setLoading(false);
          return;
        }
      }

      // Dimensions are compatible
      setDimensionError(null);
      setScratchIdentifier(conversionResult.identifier);
      setImageWidth(newWidth);
      setImageHeight(newHeight);

      // Load preview thumbnail
      const tileData = await window.api.loadImageWithTiles(conversionResult.scratchPath);
      if (tileData) {
        const thumbDataUrl = await window.api.loadThumbnail(tileData.hash);
        setPreviewUrl(thumbDataUrl);
      }

      setConversionProgress(null);
    } catch (err) {
      console.error('[AddSiblingDialog] Error loading image:', err);
      setError(err instanceof Error ? err.message : 'Failed to load image');
    } finally {
      setLoading(false);
    }
  }, [sourceMicrograph, ASPECT_RATIO_TOLERANCE, siblingLabel, sourceLabel]);

  // Handle adding the sibling image
  const handleAdd = useCallback(async () => {
    if (!sourceMicrograph || !sampleId || !scratchIdentifier || !project || !window.api) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const siblingMicrographId = crypto.randomUUID();

      // Get source dimensions
      const sourceWidth = sourceMicrograph.width || sourceMicrograph.imageWidth || 0;
      const sourceHeight = sourceMicrograph.height || sourceMicrograph.imageHeight || 0;

      // If sibling has different dimensions than source, resize it to match
      let finalWidth = imageWidth;
      let finalHeight = imageHeight;

      if (sourceWidth > 0 && sourceHeight > 0 && (sourceWidth !== imageWidth || sourceHeight !== imageHeight)) {
        console.log(`[AddSiblingDialog] Resizing ${siblingLabel} from ${imageWidth}x${imageHeight} to ${sourceWidth}x${sourceHeight}`);
        setConversionProgress({ stage: `Resizing to match ${sourceLabel}...`, percent: 50 });

        await window.api.resizeScratchImage(scratchIdentifier, sourceWidth, sourceHeight);
        finalWidth = sourceWidth;
        finalHeight = sourceHeight;

        console.log(`[AddSiblingDialog] ${siblingLabel} resized to ${sourceWidth}x${sourceHeight}`);
      }

      setConversionProgress({ stage: 'Saving image...', percent: 75 });

      // Move image from scratch to project folder
      console.log(`[AddSiblingDialog] Moving ${siblingLabel} image to project folder: ${siblingMicrographId}`);
      await window.api.moveFromScratch(scratchIdentifier, project.id, siblingMicrographId);

      // Create sibling micrograph - inherits position and instrument from source
      const newSiblingMicrograph: MicrographMetadata = {
        id: siblingMicrographId,
        name: siblingName || siblingFileName || `${siblingLabel} Image`,
        imageFilename: siblingFileName,
        imagePath: siblingMicrographId,
        imageWidth: finalWidth,
        imageHeight: finalHeight,
        width: finalWidth,
        height: finalHeight,
        opacity: sourceMicrograph.opacity ?? 1.0,
        imageType: siblingType,
        // Inherit parent and position from source
        parentID: sourceMicrograph.parentID,
        offsetInParent: sourceMicrograph.offsetInParent
          ? { ...sourceMicrograph.offsetInParent }
          : undefined,
        rotation: sourceMicrograph.rotation,
        // Inherit scaleX/scaleY for overlay placement
        scaleX: sourceMicrograph.scaleX,
        scaleY: sourceMicrograph.scaleY,
        pointInParent: sourceMicrograph.pointInParent
          ? { ...sourceMicrograph.pointInParent }
          : undefined,
        // Inherit instrument settings from source
        instrument: sourceMicrograph.instrument
          ? { ...sourceMicrograph.instrument }
          : undefined,
        // Same scale as source since dimensions now match
        scalePixelsPerCentimeter: sourceMicrograph.scalePixelsPerCentimeter,
        // Default visibility
        isMicroVisible: true,
        isFlipped: false,
      };

      // Add to store
      addMicrograph(sampleId, newSiblingMicrograph);
      console.log(`[AddSiblingDialog] ${siblingLabel} micrograph created:`, siblingMicrographId);

      // Link as siblings - PPL is always primary, XPL is always secondary
      if (sourceIsPPL) {
        // Source is PPL (primary), new sibling is XPL (secondary)
        linkSiblingImages(sourceMicrograph.id, siblingMicrographId);
      } else {
        // Source is XPL, new sibling is PPL (primary) → PPL first
        linkSiblingImages(siblingMicrographId, sourceMicrograph.id);
      }
      console.log(`[AddSiblingDialog] Sibling link created: PPL <-> XPL`);

      // Close dialog first
      onClose();

      // Generate thumbnails in the background
      setTimeout(async () => {
        try {
          const freshProject = useAppStore.getState().project;
          if (!freshProject || !window.api) return;

          // Generate sibling thumbnail
          await window.api.generateCompositeThumbnail(freshProject.id, siblingMicrographId, freshProject);
          window.dispatchEvent(
            new CustomEvent('thumbnail-generated', { detail: { micrographId: siblingMicrographId } })
          );

          // Regenerate parent thumbnail if this is an associated micrograph
          if (sourceMicrograph.parentID) {
            await window.api.generateCompositeThumbnail(
              freshProject.id,
              sourceMicrograph.parentID,
              freshProject
            );
            window.dispatchEvent(
              new CustomEvent('thumbnail-generated', { detail: { micrographId: sourceMicrograph.parentID } })
            );
          }

          console.log('[AddSiblingDialog] Thumbnails generated');
        } catch (err) {
          console.error('[AddSiblingDialog] Error generating thumbnails:', err);
        }
      }, 100);

    } catch (err) {
      console.error(`[AddSiblingDialog] Error adding ${siblingLabel}:`, err);
      setError(err instanceof Error ? err.message : `Failed to add ${siblingLabel} image`);
      setLoading(false);
    }
  }, [sourceMicrograph, sampleId, scratchIdentifier, project, siblingName, siblingFileName, imageWidth, imageHeight, addMicrograph, linkSiblingImages, onClose, sourceIsPPL, siblingLabel, sourceLabel, siblingType]);

  const canAdd = scratchIdentifier && siblingName && !loading && !dimensionError;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="add-sibling-dialog-title"
    >
      <DialogTitle id="add-sibling-dialog-title">
        Add Corresponding {siblingLabel} Image
      </DialogTitle>
      <DialogContent>
        {!sourceMicrograph ? (
          <Alert severity="error">Source micrograph not found.</Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Add a {siblingType} ({siblingLabel}) image to pair with &quot;{sourceMicrograph.name || sourceMicrograph.imageFilename}&quot;.
              The {siblingLabel} will inherit the position and settings from the {sourceLabel}.
            </Typography>

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {dimensionError && (
              <Alert severity="error" onClose={() => setDimensionError(null)}>
                {dimensionError}
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
                {scratchIdentifier ? 'Change Image...' : `Select ${siblingLabel} Image...`}
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
                  alt={`${siblingLabel} Preview`}
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
                    value={siblingName}
                    onChange={(e) => setSiblingName(e.target.value)}
                    fullWidth
                    size="small"
                    disabled={loading}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {imageWidth} × {imageHeight} pixels
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {siblingFileName}
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
          {loading ? 'Adding...' : `Add ${siblingLabel} Image`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
