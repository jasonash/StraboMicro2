/**
 * Link Sibling Dialog
 *
 * Dialog for linking two micrographs as PPL/XPL siblings.
 * Shows candidate images from the same sample with complementary imageType.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Image as ImageIcon } from '@mui/icons-material';
import { useAppStore } from '@/store';
import type { MicrographMetadata } from '@/types/project-types';

interface LinkSiblingDialogProps {
  open: boolean;
  onClose: () => void;
  micrographId: string | null;
}

// Aspect ratio tolerance for sibling matching (1%)
const ASPECT_RATIO_TOLERANCE = 0.01;

/**
 * Check if two aspect ratios are compatible (within tolerance)
 */
function aspectRatiosMatch(ratio1: number, ratio2: number): boolean {
  const diff = Math.abs(ratio1 - ratio2);
  return diff <= ASPECT_RATIO_TOLERANCE * Math.max(ratio1, ratio2);
}

/**
 * Get complementary image types for PPL/XPL pairing
 */
function getComplementaryImageTypes(imageType: string | undefined | null): string[] {
  if (!imageType) return [];

  // PPL <-> XPL mappings
  const pplTypes = ['PPL', 'Plane Polarized Light', 'Plane-Polarized Light'];
  const xplTypes = ['XPL', 'Cross Polarized Light', 'Cross-Polarized Light', 'Crossed Polarized Light'];

  const normalizedType = imageType.toUpperCase();

  if (pplTypes.some(t => normalizedType.includes(t.toUpperCase()))) {
    return xplTypes;
  }
  if (xplTypes.some(t => normalizedType.includes(t.toUpperCase()))) {
    return pplTypes;
  }

  // If not specifically PPL/XPL, allow pairing with any optical image
  return [...pplTypes, ...xplTypes];
}

export function LinkSiblingDialog({
  open,
  onClose,
  micrographId,
}: LinkSiblingDialogProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [loadingThumbnails, setLoadingThumbnails] = useState(false);

  const project = useAppStore((state) => state.project);
  const linkSiblingImages = useAppStore((state) => state.linkSiblingImages);

  // Find the source micrograph and its sample
  const { sourceMicrograph, sourceSample } = useMemo(() => {
    if (!project || !micrographId) return { sourceMicrograph: null, sourceSample: null };

    for (const dataset of project.datasets || []) {
      for (const sample of dataset.samples || []) {
        const micro = sample.micrographs?.find(m => m.id === micrographId);
        if (micro) {
          return { sourceMicrograph: micro, sourceSample: sample };
        }
      }
    }
    return { sourceMicrograph: null, sourceSample: null };
  }, [project, micrographId]);

  // Find candidate micrographs for linking
  const candidates = useMemo((): MicrographMetadata[] => {
    if (!sourceMicrograph || !sourceSample) return [];

    const sourceWidth = sourceMicrograph.width || 0;
    const sourceHeight = sourceMicrograph.height || 0;
    if (sourceWidth === 0 || sourceHeight === 0) return [];

    const sourceAspectRatio = sourceWidth / sourceHeight;
    const complementaryTypes = getComplementaryImageTypes(sourceMicrograph.imageType);

    return (sourceSample.micrographs || []).filter(m => {
      // Not the source micrograph itself
      if (m.id === sourceMicrograph.id) return false;

      // Not already linked to another sibling
      if (m.siblingImageId) return false;

      // Must have dimensions
      const candidateWidth = m.width || 0;
      const candidateHeight = m.height || 0;
      if (candidateWidth === 0 || candidateHeight === 0) return false;

      // Check aspect ratio compatibility
      const candidateAspectRatio = candidateWidth / candidateHeight;
      if (!aspectRatiosMatch(sourceAspectRatio, candidateAspectRatio)) return false;

      // Optionally check complementary imageType (but allow if no imageType set)
      if (m.imageType && complementaryTypes.length > 0) {
        const normalizedCandidateType = m.imageType.toUpperCase();
        const isComplementary = complementaryTypes.some(t =>
          normalizedCandidateType.includes(t.toUpperCase())
        );
        if (!isComplementary) return false;
      }

      return true;
    });
  }, [sourceMicrograph, sourceSample]);

  // Load thumbnails for candidates
  useEffect(() => {
    if (!open || !project || candidates.length === 0) return;

    const loadThumbnails = async () => {
      setLoadingThumbnails(true);
      const urls = new Map<string, string>();

      for (const candidate of candidates) {
        try {
          const dataUrl = await window.api?.loadCompositeThumbnail(project.id, candidate.id);
          if (dataUrl) {
            urls.set(candidate.id, dataUrl);
          }
        } catch (error) {
          console.error('[LinkSiblingDialog] Error loading thumbnail:', error);
        }
      }

      setThumbnailUrls(urls);
      setLoadingThumbnails(false);
    };

    loadThumbnails();
  }, [open, project, candidates]);

  // Reset selection when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedCandidateId(null);
    }
  }, [open]);

  const handleLink = useCallback(async () => {
    if (!sourceMicrograph || !selectedCandidateId || !project) return;

    // Determine which is primary (PPL) and which is secondary (XPL)
    // PPL is typically considered the primary view
    const sourceType = sourceMicrograph.imageType?.toUpperCase() || '';
    const isPPL = sourceType.includes('PPL') || sourceType.includes('PLANE');

    if (isPPL) {
      // Source is PPL (primary), candidate is XPL (secondary)
      linkSiblingImages(sourceMicrograph.id, selectedCandidateId);
    } else {
      // Source is XPL (secondary), candidate is PPL (primary)
      linkSiblingImages(selectedCandidateId, sourceMicrograph.id);
    }

    // Close dialog first, then regenerate thumbnail in the background
    onClose();

    // Regenerate parent's composite thumbnail since XPL position changed
    // Use setTimeout to ensure state update has fully propagated
    const parentId = sourceMicrograph.parentID;
    if (parentId) {
      setTimeout(async () => {
        try {
          // Get fresh project state after linking
          const freshProject = useAppStore.getState().project;
          if (freshProject) {
            console.log('[LinkSiblingDialog] Regenerating parent thumbnail for:', parentId);
            await window.api?.generateCompositeThumbnail(freshProject.id, parentId, freshProject);
            console.log('[LinkSiblingDialog] Parent thumbnail regenerated');
            // Dispatch event to notify thumbnail components to reload
            window.dispatchEvent(
              new CustomEvent('thumbnail-generated', { detail: { micrographId: parentId } })
            );
          }
        } catch (error) {
          console.error('[LinkSiblingDialog] Error regenerating parent thumbnail:', error);
        }
      }, 100);
    }
  }, [sourceMicrograph, selectedCandidateId, project, linkSiblingImages, onClose]);

  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="link-sibling-dialog-title"
    >
      <DialogTitle id="link-sibling-dialog-title">
        Link Sibling PPL/XPL Image
      </DialogTitle>
      <DialogContent>
        {!sourceMicrograph ? (
          <Alert severity="error">Source micrograph not found.</Alert>
        ) : candidates.length === 0 ? (
          <Alert severity="info">
            No compatible micrographs found in this sample. Candidates must:
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
              <li>Be in the same sample</li>
              <li>Have the same aspect ratio (within 1%)</li>
              <li>Not already be linked to another sibling</li>
              <li>Have a complementary image type (PPL/XPL)</li>
            </ul>
          </Alert>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select a micrograph to link as the PPL/XPL sibling of "{sourceMicrograph.name || sourceMicrograph.imageFilename || 'Unnamed'}":
            </Typography>

            {loadingThumbnails ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                {candidates.map((candidate) => (
                  <ListItem key={candidate.id} disablePadding>
                    <ListItemButton
                      selected={selectedCandidateId === candidate.id}
                      onClick={() => setSelectedCandidateId(candidate.id)}
                    >
                      <ListItemAvatar>
                        {thumbnailUrls.has(candidate.id) ? (
                          <Avatar
                            variant="rounded"
                            src={thumbnailUrls.get(candidate.id)}
                            sx={{ width: 48, height: 36 }}
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 48, height: 36 }}>
                            <ImageIcon />
                          </Avatar>
                        )}
                      </ListItemAvatar>
                      <ListItemText
                        primary={candidate.name || candidate.imageFilename || 'Unnamed'}
                        secondary={candidate.imageType || 'No image type'}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}

            {selectedCandidate && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Selected: {selectedCandidate.name || selectedCandidate.imageFilename}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Image type: {selectedCandidate.imageType || 'Not specified'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Dimensions: {selectedCandidate.width} × {selectedCandidate.height}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleLink}
          variant="contained"
          disabled={!selectedCandidateId}
        >
          Link Images
        </Button>
      </DialogActions>
    </Dialog>
  );
}
