/**
 * What the header's sync status chip says (collaboration spec v3, 16ad).
 *
 * One state at a time, first match wins: decisions waiting, the first
 * upload, a login / account / server mismatch, offline, server trouble,
 * other problems, syncing, Manual with changes waiting, downloading, synced.
 * A local-only project reads "Local only". Pure, so the order is testable
 * (npm run test:sync-chip).
 *
 * Manual mode never warns about a missing login by itself (16af): only a
 * Sync click that failed does; the click asks for the login first.
 */

import type { SyncStoreState } from '@/store/useSyncStore';
import { decisionsWaiting } from '@/store/useSyncStore';

export type SyncChipTone = 'attention' | 'active' | 'quiet' | 'ok' | 'muted';
/** offline: no connection or the server is not answering; waiting: Manual mode, changes go up on the click */
export type SyncChipIcon = 'busy' | 'ok' | 'attention' | 'local' | 'offline' | 'waiting';

export interface SyncChipState {
  label: string;
  tone: SyncChipTone;
  /** Work is running (spinner) */
  busy: boolean;
  /** First upload percentage, when known */
  percent: number | null;
  /** One or two sentences for the popover */
  detail: string;
  /** The popover offers Log in */
  needsLogin: boolean;
  icon: SyncChipIcon;
}

export type SyncChipInput = Pick<SyncStoreState,
  'synced' | 'mode' | 'phase' | 'email' | 'pkey' | 'server' | 'activity' | 'problem' | 'pending' |
  'refused' | 'conflicts' | 'questions' | 'downloads' | 'notice' | 'progress'>;

export interface SyncChipAuth {
  loggedIn: boolean;
  pkey: string | null;
  /** The REST server the app is set to (Preferences) */
  restServer: string;
}

/** Same rule as main's sameServer (electron/sync/syncService.js) */
function sameServer(a: string | null, b: string): boolean {
  const norm = (u: string | null) => String(u ?? '').trim().replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What the current sync step is doing, for the popover */
export function describeProgress(progress: SyncProgress | null): string | null {
  if (!progress) return null;
  switch (progress.phase) {
    case 'images': return progress.item ? `Uploading ${progress.item}` : 'Uploading images';
    case 'push': return 'Sending changes';
    case 'tiles': return 'Preparing image tiles';
    case 'files': return 'Uploading files';
    case 'pull': return 'Getting changes';
    case 'download': return progress.item ? `Downloading ${progress.item}` : 'Downloading files';
    default: return null;
  }
}

export function syncChipState(s: SyncChipInput, auth: SyncChipAuth): SyncChipState {
  const state = chipState(s, auth);
  return { ...state, icon: iconFor(state, s) };
}

function iconFor(state: Omit<SyncChipState, 'icon'>, s: SyncChipInput): SyncChipIcon {
  if (state.busy) return 'busy';
  if (state.tone === 'ok') return 'ok';
  if (state.tone === 'attention') return 'attention';
  if (state.tone === 'muted') return 'local';
  // Quiet: a connection problem (the only quiet states with a problem), or Manual mode waiting for the click
  return s.problem ? 'offline' : 'waiting';
}

function chipState(s: SyncChipInput, auth: SyncChipAuth): Omit<SyncChipState, 'icon'> {
  const base = { busy: false, percent: null, needsLogin: false };
  if (!s.synced) {
    return {
      ...base,
      label: 'Local only',
      tone: 'muted',
      detail: 'This project is on this computer only. Syncing it to StraboSpot keeps a backup, ' +
        'puts it on your other computers, and lets you share it later.',
    };
  }

  const automatic = s.mode === 'automatic';
  const email = s.email ?? 'the account it belongs to';
  const waiting = decisionsWaiting(s);
  if (waiting > 0) {
    return {
      ...base,
      label: `${waiting} ${plural(waiting, 'needs', 'need')} your decision`,
      tone: 'attention',
      detail: `Sync needs your decision on ${waiting} ${plural(waiting, 'item', 'items')}. ` +
        'Everything else keeps syncing.',
    };
  }

  const syncing = s.activity === 'syncing';
  const problem = s.problem;

  // First upload, while it runs (a problem that stopped it shows instead)
  if (s.phase === 'uploading' && syncing) {
    const p = s.progress;
    const bytes = p?.phase === 'images' && p.bytesTotal ? Math.min(1, (p.bytesDone ?? 0) / p.bytesTotal) : null;
    const percent = bytes === null ? null : Math.floor(bytes * 100);
    const afterImages = p !== null && p.phase !== 'images';
    return {
      ...base,
      busy: true,
      percent,
      label: percent !== null ? `Uploading ${percent}%` : afterImages ? 'Finishing upload…' : 'Uploading…',
      tone: 'active',
      detail: 'The first upload of this project is running. You can keep working.',
    };
  }

  // Login, account and server: from a failed sync, or (Automatic only) from
  // the current login, so the chip says so before the next change
  let binding: 'auth' | 'account' | 'wrong_server' | null = null;
  if (problem && (problem.kind === 'auth' || problem.kind === 'account' || problem.kind === 'wrong_server')) {
    binding = problem.kind;
  } else if (automatic && s.server !== null) {
    if (!sameServer(s.server, auth.restServer)) binding = 'wrong_server';
    else if (!auth.loggedIn) binding = 'auth';
    else if (s.pkey !== null && auth.pkey !== s.pkey) binding = 'account';
  }
  if (binding === 'auth') {
    return {
      ...base,
      needsLogin: true,
      label: 'Log in to sync',
      tone: 'attention',
      detail: `Log in as ${email} to sync this project. Your changes are kept on this computer until then.`,
    };
  }
  if (binding === 'account') {
    return {
      ...base,
      label: 'Different account',
      tone: 'attention',
      detail: `This copy belongs to ${email}. Log in as ${email} to sync it. ` +
        'Your changes are kept on this computer until then.',
    };
  }
  if (binding === 'wrong_server') {
    return {
      ...base,
      label: 'Different server',
      tone: 'attention',
      detail: problem?.kind === 'wrong_server' ? problem.message
        : `This project syncs with ${s.server}, but the app is set to ${auth.restServer} (Preferences).`,
    };
  }

  if (problem && !syncing) {
    const queued = s.pending ?? 0;
    switch (problem.kind) {
      case 'offline':
        return {
          ...base,
          label: queued > 0 ? `Offline · ${queued} queued` : 'Offline',
          tone: 'quiet',
          detail: "Can't reach StraboSpot. Your changes are kept on this computer and sync " +
            (automatic ? 'when the connection returns.' : 'when you click Sync Now while online.'),
        };
      case 'server':
        return {
          ...base,
          label: automatic ? 'Server unavailable, retrying' : 'Server unavailable',
          tone: 'quiet',
          detail: `StraboSpot did not answer as expected (${problem.message}). Your changes are kept on this computer.`,
        };
      case 'disabled':
      case 'old_server':
        return { ...base, label: 'Sync unavailable', tone: 'quiet', detail: problem.message };
      default:
        return { ...base, label: 'Sync problem', tone: 'attention', detail: problem.message };
    }
  }

  if (syncing || (automatic && s.activity === 'waiting')) {
    return {
      ...base,
      busy: true,
      label: 'Syncing…',
      tone: 'active',
      detail: s.notice ?? describeProgress(s.progress) ?? 'Sending your changes to StraboSpot.',
    };
  }

  if (!automatic) {
    if (s.phase === 'uploading') {
      return {
        ...base,
        label: 'Manual · upload waiting',
        tone: 'quiet',
        detail: 'The first upload of this project runs when you click Sync Now.',
      };
    }
    if ((s.pending ?? 0) > 0 || s.activity === 'waiting') {
      const n = s.pending ?? 0;
      return {
        ...base,
        label: n > 0 ? `Manual · ${n} to sync` : 'Manual · changes to sync',
        tone: 'quiet',
        detail: n > 0
          ? `${n} ${plural(n, 'change is', 'changes are')} waiting. They sync when you click Sync Now.`
          : 'Changes are waiting. They sync when you click Sync Now.',
      };
    }
  }

  if (s.downloads > 0) {
    return {
      ...base,
      busy: true,
      label: 'Downloading…',
      tone: 'active',
      detail: describeProgress(s.progress) ?? `Downloading ${s.downloads} ${plural(s.downloads, 'file', 'files')} from StraboSpot.`,
    };
  }

  return {
    ...base,
    label: 'Synced',
    tone: 'ok',
    detail: automatic
      ? 'Your changes sync a few seconds after you stop editing.'
      : 'Nothing is waiting. Changes sync when you click Sync Now.',
  };
}

/** "Last synced just now" / "... 5 minutes ago" / "... at 3:42 PM" */
export function lastSyncedText(at: number | null, now: number): string {
  if (at === null) return 'Not synced yet since the project opened';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Last synced just now';
  if (minutes < 60) return `Last synced ${minutes} ${plural(minutes, 'minute', 'minutes')} ago`;
  return `Last synced at ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
