/**
 * Activity panel (collaboration spec v3 §6.3, 17m, 17u, 17v): who changed
 * what in the open synced project, newest first, grouped into bursts.
 * A non-modal drawer over the right pane, opened from the sync chip's
 * "Activity..." or View > Activity. A click on a line selects its spot or
 * micrograph. Changes not in this copy yet are marked, with Sync Now.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, Paper, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSyncStore } from '@/store/useSyncStore';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getRestServerUrl } from './dialogs/PreferencesDialog';
import { groupActivity, lineText, whenText, type ActivityGroup, type ActivityLookup } from '@/utils/activityFeed';
import { syncNowFromUser } from '@/services/syncActions';
import type { ProjectMetadata } from '@/types/project-types';

export const ACTIVITY_PANEL_WIDTH = 360;

/** 'type:id' => name of every entity in my copy */
function namesOf(project: ProjectMetadata | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!project) return out;
  const put = (type: string, id: string | undefined, name: string | null | undefined) => {
    if (id) out.set(`${type}:${id}`, name ?? '');
  };
  for (const d of project.datasets ?? []) {
    put('dataset', d.id, d.name);
    for (const s of d.samples ?? []) {
      put('sample', s.id, s.name || s.sampleID);
      for (const m of s.micrographs ?? []) {
        put('micrograph', m.id, m.name);
        for (const sp of m.spots ?? []) put('spot', sp.id, sp.name);
      }
    }
  }
  for (const t of project.tags ?? []) put('tag', t.id, t.name);
  for (const g of project.groups ?? []) put('group', g.id, g.name);
  return out;
}

export function ActivityPanel() {
  const open = useSyncStore((s) => s.activityOpen);
  const synced = useSyncStore((s) => s.synced);
  const projectId = useSyncStore((s) => s.projectId);
  const incoming = useSyncStore((s) => s.incoming);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const loggedIn = useAuthStore((s) => s.isAuthenticated);
  const project = useAppStore((s) => s.project);

  const [rows, setRows] = useState<SyncHistoryRow[]>([]);
  const [me, setMe] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const loadSeq = useRef(0);
  const rowsRef = useRef<SyncHistoryRow[]>([]);
  rowsRef.current = rows;

  const visible = open && synced && projectId !== null && project?.id === projectId;

  /** The newest page; older pages already loaded are kept below it */
  const loadNewest = useCallback(async () => {
    if (!projectId || !window.api) return;
    const n = ++loadSeq.current;
    setLoading(true);
    const r = await window.api.sync.history(projectId, getRestServerUrl()).catch(() => null);
    if (n !== loadSeq.current) return;
    setLoading(false);
    if (!r || !r.ok) {
      setError(r?.message ?? 'The activity could not be loaded.');
      return;
    }
    setError(null);
    setMe(r.me);
    const oldest = r.changes.length ? r.changes[r.changes.length - 1].seq : Infinity;
    const older = rowsRef.current.filter((x) => x.seq < oldest);
    if (older.length === 0) setMore(r.more);
    setRows([...r.changes, ...older]);
    setNow(new Date());
  }, [projectId]);

  const loadOlder = async () => {
    if (!projectId || !window.api || rows.length === 0) return;
    setLoading(true);
    const r = await window.api.sync.history(projectId, getRestServerUrl(), rows[rows.length - 1].seq).catch(() => null);
    setLoading(false);
    if (!r || !r.ok) {
      setError(r?.message ?? 'The activity could not be loaded.');
      return;
    }
    const last = rowsRef.current[rowsRef.current.length - 1]?.seq ?? Infinity;
    setRows([...rowsRef.current, ...r.changes.filter((x) => x.seq < last)]);
    setMore(r.more);
  };

  // A different project starts empty
  useEffect(() => {
    setRows([]);
    setMore(false);
    setError(null);
  }, [projectId]);

  // Opening, each finished sync, and new changes waiting refresh the newest page
  useEffect(() => {
    if (visible && loggedIn) void loadNewest();
  }, [visible, loggedIn, lastSyncedAt, incoming, loadNewest]);

  // "5 min ago" stays current
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [visible]);

  const names = useMemo(() => namesOf(project), [project]);
  const groups = useMemo(() => {
    const look: ActivityLookup = {
      me,
      nameOf: (t, id) => names.get(`${t}:${id}`) || null,
      exists: (t, id) => names.has(`${t}:${id}`),
    };
    return groupActivity(rows, look);
  }, [rows, names, me]);

  const close = () => useSyncStore.getState().update({ activityOpen: false });

  const show = (g: ActivityGroup) => {
    const t = g.target;
    if (!t) return;
    const app = useAppStore.getState();
    if (t.type === 'spot') void app.selectActiveSpot(t.id);
    else if (t.type === 'micrograph') void app.selectMicrograph(t.id);
  };
  const clickable = (g: ActivityGroup) => g.target !== null && (g.target.type === 'spot' || g.target.type === 'micrograph');

  if (!visible) return null;

  return (
    <Paper
      elevation={6}
      square
      sx={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: ACTIVITY_PANEL_WIDTH, maxWidth: '100%',
        zIndex: 20, display: 'flex', flexDirection: 'column', borderLeft: 1, borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1 }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>Activity</Typography>
        {loading && <CircularProgress size={16} sx={{ mr: 1 }} />}
        <IconButton size="small" onClick={close} aria-label="Close activity"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!loggedIn ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Log in to see project activity.</Typography>
        ) : (
          <>
            {incoming > 0 && (
              <Alert
                severity="info"
                action={<Button size="small" onClick={() => void syncNowFromUser()}>Sync Now</Button>}
              >
                {incoming === 1 ? '1 change is' : `${incoming} changes are`} not in your copy yet.
              </Alert>
            )}
            {error && (
              <Alert severity="error" action={<Button size="small" onClick={() => void loadNewest()}>Retry</Button>}>
                {error}
              </Alert>
            )}
            {!error && !loading && groups.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>No changes yet.</Typography>
            )}
            {groups.map((g) => (
              <Box
                key={g.key}
                onClick={clickable(g) ? () => show(g) : undefined}
                sx={{
                  px: 1, py: 0.75, borderRadius: 1,
                  cursor: clickable(g) ? 'pointer' : 'default',
                  '&:hover': clickable(g) ? { bgcolor: 'action.hover' } : undefined,
                }}
              >
                <Typography variant="body2">{lineText(g)}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{whenText(g.at, now)}</Typography>
                  {g.pending && <Chip size="small" variant="outlined" color="info" label="Not in your copy yet" sx={{ height: 18 }} />}
                </Box>
              </Box>
            ))}
            {more && (
              <Button size="small" disabled={loading} onClick={() => void loadOlder()} sx={{ alignSelf: 'center' }}>
                Show older
              </Button>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}
