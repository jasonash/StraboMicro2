/**
 * "Place unplaced children on its full area...": every unplaced child of one
 * micrograph that has the parent's proportions is placed to cover the parent
 * exactly ("Same area as parent", src/utils/copySizePlacement.ts; Peter,
 * 2026-10-29: EDS element maps nested in the BSE image they were collected
 * with). Children with other proportions are listed and left unplaced. The
 * checked ones are saved in one go (one undo step).
 *
 * Opened from the micrograph's three-dot menu in the tree.
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
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { useAppStore } from '@/store';
import { findMicrographById } from '@/store/helpers';
import { asOwnUndoStep } from '@/store/undoHistory';
import { computeParentAreaPlacement, parentAreaUnavailableReason } from '@/utils/copySizePlacement';
import { unplacedChildren } from '@/utils/micrographLocation';
import { regenerateComposites } from '@/utils/compositeRefresh';

interface PlaceOnParentAreaDialogProps {
  open: boolean;
  /** The parent whose unplaced children are placed */
  parentMicrographId: string | null;
  onClose: () => void;
}

export function PlaceOnParentAreaDialog({ open, parentMicrographId, onClose }: PlaceOnParentAreaDialogProps) {
  const project = useAppStore((state) => state.project);
  const placeMicrograph = useAppStore((state) => state.placeMicrograph);
  const parent = parentMicrographId ? findMicrographById(project, parentMicrographId) : null;

  const rows = useMemo(
    () =>
      parentMicrographId
        ? unplacedChildren(project, parentMicrographId).map((child) => ({
            id: child.id,
            label: child.name || child.imageFilename || 'Unnamed Micrograph',
            reason: parentAreaUnavailableReason(parent, child.imageWidth, child.imageHeight),
          }))
        : [],
    [project, parentMicrographId, parent]
  );
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setUnchecked(new Set());
  }, [open, parentMicrographId]);

  const toPlace = rows.filter((r) => r.reason === null && !unchecked.has(r.id));
  const parentName = parent?.name || 'the parent';

  const handlePlace = () => {
    if (!parentMicrographId || !parent) return;
    const latest = useAppStore.getState().project;
    const placed: string[] = [];
    asOwnUndoStep(() => {
      for (const row of toPlace) {
        const child = findMicrographById(latest, row.id);
        const placement = child ? computeParentAreaPlacement(parent, child.imageWidth, child.imageHeight) : null;
        if (!child || !placement) continue;
        placeMicrograph(row.id, { ...placement, opacity: child.opacity ?? 1 });
        placed.push(row.id);
      }
    });
    console.log(`[PlaceOnParentArea] placed ${placed.length} on ${parent.name}`);
    if (placed.length > 0) {
      regenerateComposites([...placed, parentMicrographId], () => useAppStore.getState().project);
    }
    onClose();
  };

  return (
    <Dialog open={open && !!parent} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Place on the Full Area of {parentName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Each checked micrograph is placed to cover {parentName} exactly, at the same position and
            scale (for example element maps collected with it). Micrographs with other proportions
            cannot cover it exactly and stay unplaced.
          </Typography>
          {rows.length === 0 && <Alert severity="info">{parentName} has no unplaced micrographs.</Alert>}
          <Stack>
            {rows.map((row) => (
              <Stack key={row.id} data-testid="parent-area-row">
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={row.reason === null && !unchecked.has(row.id)}
                      disabled={row.reason !== null}
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
                {row.reason !== null && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4, mt: -1 }}>
                    {row.reason}
                  </Typography>
                )}
              </Stack>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handlePlace} variant="contained" disabled={toPlace.length === 0}>
          {toPlace.length === 1 ? 'Place 1 micrograph' : `Place ${toPlace.length} micrographs`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
