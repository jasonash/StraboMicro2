/**
 * The owner's review of parked changes (collaboration spec v3 §3.2, 17o,
 * 17x to 17aa): what a removed member sent after removal, or what a
 * member's new role refused. Each item is shown next to the project as it
 * is now; Accept applies the member's values as the owner's own edit (it
 * can be undone, and syncs on behalf of the member), Discard drops it.
 * Opened from the Activity panel and the sync chip.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import { useSyncStore } from '@/store/useSyncStore';
import { useAppStore } from '@/store/useAppStore';
import { applyRemoteChanges } from '@/store/remoteChanges';
import { getRestServerUrl } from './PreferencesDialog';
import { acceptChanges, buildReview, currentEntities, type ParkedUnit } from '@/utils/parkedReview';
import { whenText } from '@/utils/activityFeed';
import { loadParked } from '@/services/parkedLoad';
import { roleLabel } from '@/utils/collaboratorRoles';

export function ParkedReviewDialog() {
  const open = useSyncStore((s) => s.reviewOpen);
  const projectId = useSyncStore((s) => s.projectId);
  const project = useAppStore((s) => s.project);
  const [pushes, setPushes] = useState<SyncParkedPush[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !window.api) return;
    setError(null);
    const r = await loadParked(projectId);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setPushes(r.parked);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setPushes(null);
    void load();
  }, [open, load]);

  const cur = useMemo(() => currentEntities(project), [project]);
  const reviews = useMemo(() => (pushes ?? []).map((p) => ({ push: p, ...buildReview(p, cur) })), [pushes, cur]);

  const close = () => {
    if (!busy) useSyncStore.getState().update({ reviewOpen: false });
  };

  /**
   * Decide units of one parked push: accepted ones are applied to the
   * project first (one undo step), then the decisions go to the server.
   * Child-order items are decided with the last open unit.
   */
  const decide = async (push: SyncParkedPush, units: ParkedUnit[], decision: 'accepted' | 'discarded') => {
    if (!projectId || !window.api || units.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const review = buildReview(push, currentEntities(useAppStore.getState().project));
      const decisions: Record<string, 'accepted' | 'discarded'> = {};
      if (decision === 'accepted') {
        const changes = units.flatMap((u) => acceptChanges(push, review.units.find((x) => x.key === u.key) ?? u,
          currentEntities(useAppStore.getState().project)));
        if (changes.length > 0) {
          applyRemoteChanges(changes, { undoable: true });
          useAppStore.getState().markDirty();
        }
      }
      for (const u of units) for (const k of u.keys) decisions[k] = decision;
      const openLeft = review.units.filter((u) => !u.decided && !units.some((x) => x.key === u.key));
      if (openLeft.length === 0) {
        const anyAccepted = decision === 'accepted' || review.units.some((u) => u.decided === 'accepted');
        for (const k of review.silentKeys) decisions[k] = anyAccepted ? 'accepted' : 'discarded';
      }
      const r = await window.api.sync.reviewParked(projectId, getRestServerUrl(), push.id, decisions, push.user.pkey);
      if (!r.ok) setError(r.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reasonText = (p: SyncParkedPush) => p.reason === 'removed'
    ? 'sent after they were removed from the project'
    : `refused after their role changed${p.role ? ` to ${roleLabel(p.role)}` : ''}`;

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Changes waiting for your review</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Accept puts a change into the project as your own edit (you can undo it); the project keeps any newer work.
            Discard drops it.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {pushes === null && !error && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Loading…</Typography>
            </Box>
          )}
          {pushes !== null && reviews.length === 0 && (
            <Typography variant="body2">Nothing is waiting for your review.</Typography>
          )}
          {reviews.map(({ push, units }) => {
            const open = units.filter((u) => !u.decided);
            const acceptable = open.filter((u) => !u.blocked);
            return (
              <Box key={push.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ flex: 1 }}>
                    {push.user.name || 'Someone'}: {open.length} {open.length === 1 ? 'change' : 'changes'} {reasonText(push)} · {whenText(push.parkedAt)}
                  </Typography>
                  <Button size="small" disabled={busy || open.length === 0} onClick={() => void decide(push, open, 'discarded')}>
                    Discard all
                  </Button>
                  <Button size="small" variant="outlined" disabled={busy || acceptable.length === 0}
                    onClick={() => void decide(push, acceptable, 'accepted')}>
                    Accept all
                  </Button>
                </Box>
                {units.map((u) => (
                  <Box key={u.key} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25, opacity: u.decided ? 0.6 : 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ flex: 1 }}>{u.text}</Typography>
                      {u.decided ? (
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {u.decided === 'accepted' ? 'Accepted' : 'Discarded'}
                        </Typography>
                      ) : (
                        <>
                          <Button size="small" disabled={busy} onClick={() => void decide(push, [u], 'discarded')}>Discard</Button>
                          <Button size="small" variant="contained" disabled={busy || u.blocked !== null}
                            onClick={() => void decide(push, [u], 'accepted')}>
                            Accept
                          </Button>
                        </>
                      )}
                    </Box>
                    {u.fields.length > 0 && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr 1fr', columnGap: 1.5, rowGap: 0.25, mt: 0.75 }}>
                        <span />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{push.user.name || 'Their'} change</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Now</Typography>
                        {u.fields.map((f) => (
                          <Box key={f.id} sx={{ display: 'contents' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{f.label}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{f.theirs}</Typography>
                            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{f.now}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    {u.blocked && !u.decided && (
                      <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', mt: 0.5 }}>{u.blocked}</Typography>
                    )}
                  </Box>
                ))}
                <Divider />
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        {busy && <CircularProgress size={18} sx={{ mr: 'auto', ml: 2 }} />}
        <Button onClick={close} disabled={busy}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
