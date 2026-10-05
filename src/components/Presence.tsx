/**
 * Presence on screen (collaboration spec v3, 17al-17an): who else is in
 * the open synced project, from the live channel (usePresenceStore).
 *
 *   HeaderPresence    initials badges next to the sync chip
 *   PresenceMarks     on a tree row or a list row: who views this
 *                     micrograph (badges), who edits this item ("editing")
 *   HereNowList       the Activity panel's "Here now" list
 *   EditingScope      around the place that opens edit dialogs: says what I
 *                     am editing while a dialog is open, and puts "Ben is
 *                     editing this spot right now ..." at the top of the
 *                     dialog when someone else edits the same item (17am).
 *                     A hint only, nothing is locked.
 * Away people are faded; nothing shows while the live channel is down
 * (the store is empty then, 17ao).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, AvatarGroup, Box, Tooltip, Typography } from '@mui/material';
import { ThemeProvider, type Theme } from '@mui/material/styles';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useSyncStore } from '@/store/useSyncStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { findDatasetById, findMicrographById, findSampleById, findSpotById } from '@/store/helpers';
import { useReadOnly } from '@/components/ReadOnlyScope';
import {
  peopleFrom, viewersOf, editorsOf, presenceLine, editingNotice, typeWord,
  type PresencePerson, type PresenceTarget,
} from '@/utils/presence';

/** Everyone else in the project now, one per account */
export function usePeople(): PresencePerson[] {
  const raw = usePresenceStore((s) => s.people);
  const names = useSyncStore((s) => s.memberNames);
  const me = useAuthStore((s) => s.user?.pkey ?? null);
  return useMemo(() => peopleFrom(raw, me === null ? null : Number(me), names), [raw, names, me]);
}

/** The time, again every intervalMs (for "away (12 min)") */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "spot Garnet 1", "160328-4 XPL" (a micrograph is named by itself), or null */
function useDescribe(): (t: PresenceTarget, editing: boolean) => string | null {
  const project = useAppStore((s) => s.project);
  return useMemo(() => (t: PresenceTarget, editing: boolean) => {
    const name = (() => {
      switch (t.type) {
        case 'micrograph': {
          const m = findMicrographById(project, t.id);
          return m ? m.name || m.imageFilename || null : null;
        }
        case 'spot': return findSpotById(project, t.id)?.name ?? null;
        case 'sample': {
          const s = findSampleById(project, t.id);
          return s ? s.name || s.sampleID || null : null;
        }
        case 'dataset': return findDatasetById(project, t.id)?.name ?? null;
        case 'project': return project?.name ?? null;
        default: return null;
      }
    })();
    if (!name) return null;
    // "viewing 160328-4 XPL"; "editing spot Garnet 1"
    return editing || t.type !== 'micrograph' ? `${typeWord(t.type)} ${name}` : name;
  }, [project]);
}

export function PresenceAvatar({ person, size = 22 }: { person: PresencePerson; size?: number }) {
  const describe = useDescribe();
  const now = useNow();
  return (
    <Tooltip title={presenceLine(person, describe, now)}>
      <Avatar
        data-testid="presence-badge"
        data-user={person.user}
        data-state={person.state}
        sx={{
          width: size, height: size, fontSize: size * 0.45, fontWeight: 600,
          bgcolor: person.color, color: '#fff',
          opacity: person.state === 'away' ? 0.4 : 1,
        }}
      >
        {person.initials}
      </Avatar>
    </Tooltip>
  );
}

/** Next to the sync chip: everyone else in the project */
export function HeaderPresence() {
  const people = usePeople();
  if (people.length === 0) return null;
  return (
    <Box data-testid="header-presence" sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
      <AvatarGroup max={6} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: 11, borderColor: 'background.paper' } }}>
        {people.map((p) => <PresenceAvatar key={p.user} person={p} size={24} />)}
      </AvatarGroup>
    </Box>
  );
}

/**
 * On a row: badges of who views this micrograph (viewing), and "(BI)
 * editing" for who edits this item.
 */
export function PresenceMarks({ type, id, viewing = false }: { type: string; id: string; viewing?: boolean }) {
  const people = usePeople();
  const target = { type, id };
  const viewers = viewing ? viewersOf(people, target) : [];
  const editors = editorsOf(people, target);
  if (viewers.length === 0 && editors.length === 0) return null;
  return (
    <Box data-testid="presence-marks" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ml: 0.5, flexShrink: 0 }}>
      {editors.map((p) => (
        <Box key={`e${p.user}`} data-testid="presence-editing" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
          <PresenceAvatar person={p} size={16} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>editing</Typography>
        </Box>
      ))}
      {viewers.filter((p) => !editors.includes(p)).map((p) => <PresenceAvatar key={`v${p.user}`} person={p} size={16} />)}
    </Box>
  );
}

/** The Activity panel's "Here now" (17al): name and what they view, or away and for how long */
export function HereNowList() {
  const people = usePeople();
  const describe = useDescribe();
  const now = useNow();
  if (people.length === 0) return null;
  return (
    <Box data-testid="here-now">
      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>Here now</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
        {people.map((p) => (
          <Box key={p.user} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PresenceAvatar person={p} />
            <Typography variant="body2" sx={{ color: p.state === 'away' ? 'text.secondary' : 'text.primary' }}>
              {presenceLine(p, describe, now)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function editingTheme(outer: Theme, line: string): Theme {
  const components = {
    ...outer.components,
    MuiDialogContent: {
      ...outer.components?.MuiDialogContent,
      styleOverrides: {
        root: {
          '&::before': {
            content: JSON.stringify(line),
            display: 'block',
            marginBottom: 12,
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: '0.8rem',
            color: outer.palette.info.main,
            border: `1px solid ${outer.palette.info.main}`,
          },
        },
      },
    },
  };
  return { ...outer, components } as Theme;
}

/**
 * Around the dialogs a place opens: target = the item the open dialog
 * edits (null when none is open). View-only dialogs (ReadOnlyScope) are
 * not editing. Always renders its provider, so a change of target never
 * remounts what is inside.
 */
export function EditingScope({ target, children }: { target: PresenceTarget | null; children: ReactNode }) {
  const { readOnly } = useReadOnly();
  const type = target?.type ?? null;
  const id = target?.id ?? null;
  useEffect(() => {
    if (readOnly || type === null || id === null) return undefined;
    const key = usePresenceStore.getState().beginEditing({ type, id });
    return () => usePresenceStore.getState().endEditing(key);
  }, [readOnly, type, id]);

  const people = usePeople();
  const names = type !== null && id !== null ? editorsOf(people, { type, id }).map((p) => p.name) : [];
  const line = names.length > 0 && type !== null ? editingNotice(names, typeWord(type)) : null;
  const theme = useMemo(() => (outer: Theme) => (line ? editingTheme(outer, line) : outer), [line]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
