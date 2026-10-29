/**
 * Placing all unplaced children of one micrograph in one go, two ways (Peter,
 * 2026-10-29), both from the micrograph's three-dot menu in the tree and at
 * the end of Batch Import:
 * - "Place unplaced children on its full area...": each covers the parent
 *   exactly ("Same area as parent"; EDS maps nested in the BSE image they
 *   were collected with).
 * - "Place unplaced children like...": each copies the placement of a placed
 *   child chosen as the model (a stack of EDS maps of one area), with the
 *   rules of "Copy location and scale from an existing micrograph".
 * Children that cannot (other proportions) are listed and left unplaced. The
 * checked ones are saved in one go (one undo step). Logic in
 * src/utils/copySizePlacement.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import { asOwnUndoStep } from '@/store/undoHistory';
import type { MicrographMetadata } from '@/types/project-types';
import {
  bakeAffineTilesForCopy,
  computeCopiedPlacement,
  computeParentAreaPlacement,
  copyPlacementUnavailableReason,
  describeCopyPlacementCandidate,
  listPlacedChildren,
  parentAreaUnavailableReason,
} from '@/utils/copySizePlacement';
import { unplacedChildren } from '@/utils/micrographLocation';
import { regenerateComposites } from '@/utils/compositeRefresh';

export type PlaceChildrenHow = 'parent-area' | 'like-sibling';

interface PlaceUnplacedChildrenDialogProps {
  open: boolean;
  how: PlaceChildrenHow;
  /** The parent whose unplaced children are placed */
  parentMicrographId: string | null;
  onClose: () => void;
}

export function PlaceUnplacedChildrenDialog({ open, how, parentMicrographId, onClose }: PlaceUnplacedChildrenDialogProps) {
  const project = useAppStore((state) => state.project);
  const placeMicrograph = useAppStore((state) => state.placeMicrograph);
  const parent = parentMicrographId ? findMicrographById(project, parentMicrographId) : null;
  const parentName = parent?.name || 'the parent';

  // "like-sibling": the placed child whose placement is copied
  const models = useMemo(() => listPlacedChildren(project, parentMicrographId), [project, parentMicrographId]);
  const [modelId, setModelId] = useState('');
  const model = how === 'like-sibling' && modelId ? findMicrographById(project, modelId) : null;

  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setUnchecked(new Set());
    setModelId(models[0]?.id ?? '');
    setSaving(null);
    setError(null);
    // Only when the dialog opens (models changes as children are placed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, parentMicrographId, how]);

  const reasonFor = (child: MicrographMetadata): string | null =>
    how === 'parent-area'
      ? parentAreaUnavailableReason(parent, child.imageWidth, child.imageHeight)
      : copyPlacementUnavailableReason(model, child.imageWidth, child.imageHeight);

  const rows = (parentMicrographId ? unplacedChildren(project, parentMicrographId) : []).map((child) => {
    const reason = reasonFor(child);
    const copied = how === 'like-sibling' && model && reason === null
      ? computeCopiedPlacement(model, child.imageWidth, child.imageHeight)
      : null;
    return {
      id: child.id,
      label: child.name || child.imageFilename || 'Unnamed Micrograph',
      reason,
      note: copied?.scaleAssumedFromWidthRatio
        ? `${child.imageWidth} × ${child.imageHeight} pixels: the scale is adjusted on the assumption that it covers the same width.`
        : null,
    };
  });
  const toPlace = rows.filter((r) => r.reason === null && !unchecked.has(r.id));

  /** The fields to save for one child; affine copies get their overlay tiles baked first */
  const placementFor = async (child: MicrographMetadata, imagesFolder: string) => {
    if (how === 'parent-area') return computeParentAreaPlacement(parent, child.imageWidth, child.imageHeight);
    const copied = model ? computeCopiedPlacement(model, child.imageWidth, child.imageHeight) : null;
    if (!copied) return null;
    if (copied.placementType === 'affine' && copied.affineMatrix) {
      // The tiles hold this image's warped pixels, under its own id (as Edit Micrograph Location's copy)
      await bakeAffineTilesForCopy(`${imagesFolder}/${child.imagePath}`, child.id, copied.affineMatrix);
      return { ...copied.metadata, affineTileHash: child.id };
    }
    return copied.metadata;
  };

  const handlePlace = async () => {
    if (!parentMicrographId || !parent || !project) return;
    setError(null);
    setSaving({ done: 0, total: toPlace.length });
    const folders = await window.api?.getProjectFolderPaths(project.id);
    const latest = useAppStore.getState().project;
    const updates: Array<{ id: string; fields: Partial<MicrographMetadata> }> = [];
    const failed: string[] = [];
    for (const row of toPlace) {
      const child = findMicrographById(latest, row.id);
      try {
        const fields = child ? await placementFor(child, folders?.images ?? '') : null;
        if (child && fields) updates.push({ id: row.id, fields: { ...fields, opacity: child.opacity ?? 1 } });
      } catch (e) {
        console.error('[PlaceUnplacedChildren]', row.label, e);
        failed.push(row.label);
      }
      setSaving((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
    }
    asOwnUndoStep(() => {
      for (const { id, fields } of updates) placeMicrograph(id, fields);
    });
    console.log(`[PlaceUnplacedChildren] ${how}: placed ${updates.length} on ${parent.name}`);
    if (updates.length > 0) {
      regenerateComposites([...updates.map((u) => u.id), parentMicrographId], () => useAppStore.getState().project);
    }
    setSaving(null);
    if (failed.length > 0) {
      setError(`These could not be placed (their overlay tiles could not be made): ${failed.join(', ')}`);
      return;
    }
    onClose();
  };

  const title = how === 'parent-area' ? `Place on the Full Area of ${parentName}` : 'Place Like a Placed Micrograph';

  return (
    <Dialog open={open && !!parent} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {how === 'parent-area' ? (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Each checked micrograph is placed to cover {parentName} exactly, at the same position and
              scale (for example element maps collected with it). Micrographs with other proportions
              cannot cover it exactly and stay unplaced.
            </Typography>
          ) : (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Each checked micrograph gets the location, scale and rotation of the micrograph you
                choose (for example a stack of element maps of one area). Micrographs with other
                proportions stay unplaced.
              </Typography>
              {models.length === 0 ? (
                <Alert severity="info">No micrograph on {parentName} is placed yet. Place one first, then copy it.</Alert>
              ) : (
                <FormControl size="small">
                  <InputLabel id="place-like-model-label">Place them like</InputLabel>
                  <Select
                    labelId="place-like-model-label"
                    value={modelId}
                    label="Place them like"
                    onChange={(e) => setModelId(e.target.value)}
                    disabled={!!saving}
                  >
                    {models.map((m) => (
                      <MenuItem key={m.id} value={m.id}>{describeCopyPlacementCandidate(m)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          )}
          {rows.length === 0 && <Alert severity="info">{parentName} has no unplaced micrographs.</Alert>}
          <Stack>
            {rows.map((row) => (
              <Stack key={row.id} data-testid="place-unplaced-row">
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={row.reason === null && !unchecked.has(row.id)}
                      disabled={row.reason !== null || !!saving}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUnchecked((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(row.id);
                          else next.add(row.id);
                          return next;
                        });
                      }}
                    />
                  }
                  label={row.label}
                />
                {(row.reason ?? row.note) && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4, mt: -1 }}>
                    {row.reason ?? row.note}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
          {saving && (
            <Stack spacing={0.5}>
              <LinearProgress variant="determinate" value={(saving.done / Math.max(saving.total, 1)) * 100} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Placing {saving.done} of {saving.total}...
              </Typography>
            </Stack>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={!!saving}>Cancel</Button>
        <Button onClick={() => void handlePlace()} variant="contained" disabled={toPlace.length === 0 || !!saving}>
          {toPlace.length === 1 ? 'Place 1 micrograph' : `Place ${toPlace.length} micrographs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
