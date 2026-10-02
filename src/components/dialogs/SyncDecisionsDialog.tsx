/**
 * Sync Decisions Dialog: "Sync needs your decision" (collaboration spec v3
 * 16x to 16aa)
 *
 * One list of what sync could not settle on its own, grouped by kind:
 * fields changed on both sides, items deleted on one side and changed on the
 * other, and changes the server did not accept. Nothing is chosen for the
 * user; whatever is left open stays held (not pushed) and keeps the local
 * values. Each answer is settled through the sync controller, which syncs
 * right after it (either mode); the last answer closes the dialog. Opened from the store's decisionsOpen flag (the notice, a Sync
 * click that left new items, the Debug menu). Sync keeps running while it is
 * open (data-sync-decisions tells the controller not to wait for it).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { useSyncStore } from '@/store/useSyncStore';
import { useAppStore } from '@/store';
import {
  containsLabel,
  fieldLabel,
  itemLabel,
  refusedReason,
  valueText,
} from '@/utils/syncDecisionText';
import SyncGeometryPreview from './SyncGeometryPreview';

type Lists = { conflicts: SyncConflictItem[]; questions: SyncQuestionItem[]; refused: SyncRefusedItem[] };
type Decide = (decision: SyncDecision) => Promise<void>;

const EMPTY: Lists = { conflicts: [], questions: [], refused: [] };

/** A value as text, with "Show all" for long ones. */
function ValueBox({ path, value }: { path: string[]; value: unknown }) {
  const [open, setOpen] = useState(false);
  const text = valueText(path, value);
  return (
    <Box component="span" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {open && text.full ? text.full : text.short}
      {text.full && (
        <Link
          component="button"
          type="button"
          variant="body2"
          sx={{ ml: 1, verticalAlign: 'baseline' }}
          onClick={(e) => {
            e.preventDefault();
            setOpen(!open);
          }}
        >
          {open ? 'Show less' : 'Show all'}
        </Link>
      )}
    </Box>
  );
}

/** Yours / Theirs radio columns of one row. */
function SidePicker({ value, busy, onPick, render }: {
  value: string;
  busy: boolean;
  onPick: (side: 'mine' | 'theirs') => void;
  render: (side: 'mine' | 'theirs') => ReactNode;
}) {
  return (
    <RadioGroup
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'mine' || v === 'theirs') onPick(v);
      }}
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}
    >
      {(['mine', 'theirs'] as const).map((side) => (
        <FormControlLabel
          key={side}
          value={side}
          disabled={busy}
          control={<Radio size="small" sx={{ alignSelf: 'flex-start', pt: 0.25 }} />}
          sx={{ m: 0, alignItems: 'flex-start' }}
          label={
            <Box>
              <Typography variant="caption" color="text.secondary">{side === 'mine' ? 'Yours' : 'Theirs'}</Typography>
              {render(side)}
            </Box>
          }
        />
      ))}
    </RadioGroup>
  );
}

function ConflictItem({ item, busy, decide }: { item: SyncConflictItem; busy: boolean; decide: Decide }) {
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const decided = Object.keys(choices).length;
  const all = (choice: 'mine' | 'theirs') => setChoices(Object.fromEntries(item.fields.map((f) => [f.id, choice])));
  // Shape or placement fields: one picture and one pick for all of them
  const preview = item.preview;
  const grouped = new Set(preview?.fieldIds ?? []);
  const groupChoice = preview ? choices[preview.fieldIds[0]] ?? '' : '';
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>{itemLabel(item)}</Typography>
        <Button size="small" onClick={() => all('mine')} disabled={busy}>Keep all mine</Button>
        <Button size="small" onClick={() => all('theirs')} disabled={busy}>Keep all theirs</Button>
      </Stack>
      <Stack spacing={1.5} divider={<Divider flexItem />}>
        {preview && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {preview.group === 'shape' ? 'Shape' : 'Placement'}
            </Typography>
            <SidePicker
              value={groupChoice}
              busy={busy}
              onPick={(side) => setChoices({ ...choices, ...Object.fromEntries(preview.fieldIds.map((id) => [id, side])) })}
              render={(side) => <SyncGeometryPreview preview={preview} side={side} />}
            />
          </Box>
        )}
        {item.fields.filter((f) => !grouped.has(f.id)).map((f) => (
          <Box key={f.id}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{fieldLabel(f.path)}</Typography>
            <SidePicker
              value={choices[f.id] ?? ''}
              busy={busy}
              onPick={(side) => setChoices({ ...choices, [f.id]: side })}
              render={(side) => (
                <Typography variant="body2" component="div">
                  <ValueBox path={f.path} value={side === 'mine' ? f.mine : f.theirs} />
                </Typography>
              )}
            />
          </Box>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center', mt: 1.5 }}>
        {decided > 0 && decided < item.fields.length && (
          <Typography variant="caption" color="text.secondary">
            {decided} of {item.fields.length} decided; the rest stay open
          </Typography>
        )}
        <Button
          variant="contained"
          size="small"
          disabled={busy || decided === 0}
          onClick={() => void decide({ kind: 'conflict', key: item.key, choices })}
        >
          Apply
        </Button>
      </Stack>
    </Paper>
  );
}

function QuestionItem({ item, busy, decide }: { item: SyncQuestionItem; busy: boolean; decide: Decide }) {
  const theirsDeleted = item.kind === 'theirs_deleted';
  const n = theirsDeleted ? item.localChanges : item.theirChanges;
  const what = `${itemLabel(item)}${containsLabel(item.contains)}`;
  const text = theirsDeleted
    ? `They deleted ${what}. You changed ${n} of these since.`
    : `You deleted ${what}. They changed ${n} ${n === 1 ? 'item' : 'items'} in it since.`;
  const answer = (a: 'restore' | 'delete' | 'keep_deleted' | 'bring_back') =>
    void decide({ kind: 'question', key: item.key, answer: a });
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" sx={{ mb: 1.5 }}>{text}</Typography>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {theirsDeleted ? (
          <>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => answer('delete')}>Delete it</Button>
            <Button size="small" variant="contained" disabled={busy} onClick={() => answer('restore')}>Restore with my changes</Button>
          </>
        ) : (
          <>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => answer('keep_deleted')}>Keep deleted</Button>
            <Button size="small" variant="contained" disabled={busy} onClick={() => answer('bring_back')}>Bring back with their changes</Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

function RefusedItem({ item, busy, decide }: { item: SyncRefusedItem; busy: boolean; decide: Decide }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2">{itemLabel(item)}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        The server did not accept this change. {refusedReason(item)}
      </Typography>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button
          size="small"
          variant="outlined"
          disabled={busy}
          onClick={() => void decide({ kind: 'refused', key: item.key, answer: 'discard' })}
        >
          Discard my change
        </Button>
      </Stack>
    </Paper>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{title}</Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

export default function SyncDecisionsDialog() {
  const open = useSyncStore((s) => s.decisionsOpen);
  const projectId = useSyncStore((s) => s.projectId);
  const synced = useSyncStore((s) => s.synced);
  // Reload when sync changes what is waiting (a pull, a push, an answer)
  const counts = useSyncStore((s) => `${s.conflicts}/${s.questions}/${s.refused}`);
  const appProjectId = useAppStore((s) => s.project?.id ?? null);
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => useSyncStore.getState().update({ decisionsOpen: false }), []);

  /** Returns what is waiting (null when the list could not be read). */
  const load = useCallback(async (): Promise<Lists | null> => {
    if (!projectId || !window.api) return null;
    const { listSyncDecisions } = await import('@/services/syncController');
    const r = await listSyncDecisions();
    setLoaded(true);
    if (!r.ok) {
      setError(r.message);
      return null;
    }
    const next = { conflicts: r.conflicts, questions: r.questions, refused: r.refused };
    setLists(next);
    setError(null);
    return next;
  }, [projectId]);

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      setError(null);
      return;
    }
    void load();
  }, [open, load, counts]);

  // The project closed or stopped syncing
  useEffect(() => {
    if (open && (!synced || projectId !== appProjectId)) close();
  }, [open, synced, projectId, appProjectId, close]);

  const decide: Decide = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      const { decideSync } = await import('@/services/syncController');
      const r = await decideSync(decision);
      const left = await load();
      const kind = { conflict: 'conflicts', question: 'questions', refused: 'refused' } as const;
      const stillThere = left ? left[kind[decision.kind]].some((x) => x.key === decision.key) : true;
      // An item that changed meanwhile (e.g. deleted here) is shown as it is now, no error
      if (!r.ok && stillThere) setError(r.message);
      // The last answer: the dialog closes and the sync after it runs (16ab)
      else if (r.ok && left && left.conflicts.length + left.questions.length + left.refused.length === 0) close();
    } finally {
      setBusy(false);
    }
  };

  const total = lists.conflicts.length + lists.questions.length + lists.refused.length;

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth data-sync-decisions="">
      <DialogTitle>Sync needs your decision</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loaded && total === 0 ? (
          <Typography variant="body2">Nothing is waiting for a decision.</Typography>
        ) : (
          <Stack spacing={3}>
            <Typography variant="body2" color="text.secondary">
              These were not synced. Anything you leave open stays as it is on this computer and waits for you.
            </Typography>
            {lists.conflicts.length > 0 && (
              <Section title="Changed on both sides">
                {lists.conflicts.map((c) => (
                  <ConflictItem key={`${c.key}:${c.fields.map((f) => f.id).join('|')}`} item={c} busy={busy} decide={decide} />
                ))}
              </Section>
            )}
            {lists.questions.length > 0 && (
              <Section title="Deleted on one side, changed on the other">
                {lists.questions.map((q) => <QuestionItem key={q.key} item={q} busy={busy} decide={decide} />)}
              </Section>
            )}
            {lists.refused.length > 0 && (
              <Section title="Not accepted by the server">
                {lists.refused.map((r) => <RefusedItem key={r.key} item={r} busy={busy} decide={decide} />)}
              </Section>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
