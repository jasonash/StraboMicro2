/**
 * Unit tests of what the header's sync status chip says (src/utils/syncChipState.ts, spec v3 16ad).
 *
 *   npm run test:sync-chip
 */

import { syncChipState, lastSyncedText, type SyncChipInput, type SyncChipAuth } from '@/utils/syncChipState';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const SERVER = 'https://strabospot.org';
const synced: SyncChipInput = {
  synced: true, mode: 'automatic', phase: 'ready', email: 'a@b.org', pkey: '5', server: SERVER,
  activity: 'idle', problem: null, pending: 0, refused: 0, conflicts: 0, questions: 0, downloads: 0,
  notice: null, progress: null,
};
const auth: SyncChipAuth = { loggedIn: true, pkey: '5', restServer: SERVER };
const label = (s: Partial<SyncChipInput>, a: Partial<SyncChipAuth> = {}) =>
  syncChipState({ ...synced, ...s }, { ...auth, ...a }).label;
const is = (name: string, got: string, want: string) => check(name, got === want, { got, want });

// Basics
is('local only', label({ synced: false }), 'Local only');
is('synced', label({}), 'Synced');
check('synced is ok tone', syncChipState(synced, auth).tone === 'ok');

// Decisions win over everything
is('decisions: one', label({ conflicts: 1 }), '1 needs your decision');
is('decisions: sum of conflicts, questions, refused', label({ conflicts: 1, questions: 1, refused: 1 }), '3 need your decision');
is('decisions beat the first upload', label({ conflicts: 2, phase: 'uploading', activity: 'syncing' }), '2 need your decision');
is('decisions beat offline', label({ questions: 1, problem: { kind: 'offline', message: '' } }), '1 needs your decision');

// First upload
const up = { phase: 'uploading' as const, activity: 'syncing' as const };
is('first upload percent', label({ ...up, progress: { projectId: 'p', phase: 'images', bytesDone: 42, bytesTotal: 100 } }), 'Uploading 42%');
is('first upload, no progress yet', label(up), 'Uploading…');
is('first upload after the originals', label({ ...up, progress: { projectId: 'p', phase: 'tiles' } }), 'Finishing upload…');
is('first upload stopped by offline shows offline',
  label({ phase: 'uploading', activity: 'waiting', pending: 12, problem: { kind: 'offline', message: '' } }), 'Offline · 12 queued');
is('first upload percent never above 100',
  label({ ...up, progress: { projectId: 'p', phase: 'images', bytesDone: 150, bytesTotal: 100 } }), 'Uploading 100%');

// Login, account, server
is('automatic, logged out', label({}, { loggedIn: false, pkey: null }), 'Log in to sync');
check('logged out offers Log in', syncChipState(synced, { ...auth, loggedIn: false, pkey: null }).needsLogin);
is('manual, logged out: no warning (16af)', label({ mode: 'manual' }, { loggedIn: false, pkey: null }), 'Synced');
is('manual, logged out with changes', label({ mode: 'manual', pending: 3 }, { loggedIn: false, pkey: null }), 'Manual · 3 to sync');
is('manual, a click that failed for the login does show', label({ mode: 'manual', problem: { kind: 'auth', message: '' } }), 'Log in to sync');
is('automatic, other account', label({}, { pkey: '9' }), 'Different account');
is('automatic, other server', label({}, { restServer: 'http://localhost:8080' }), 'Different server');
is('server compare ignores case and trailing slash', label({}, { restServer: 'https://StraboSpot.org/' }), 'Synced');
is('account problem from main', label({ problem: { kind: 'account', message: '' } }), 'Different account');

// Problems
is('offline with queue', label({ pending: 12, activity: 'waiting', problem: { kind: 'offline', message: '' } }), 'Offline · 12 queued');
is('offline, nothing counted', label({ pending: null, problem: { kind: 'offline', message: '' } }), 'Offline');
is('server trouble, automatic', label({ problem: { kind: 'server', message: 'HTTP 500' } }), 'Server unavailable, retrying');
is('server trouble, manual', label({ mode: 'manual', problem: { kind: 'server', message: 'HTTP 500' } }), 'Server unavailable');
is('sync turned off on the server', label({ problem: { kind: 'disabled', message: 'off' } }), 'Sync unavailable');
is('other errors', label({ problem: { kind: 'error', message: 'boom' } }), 'Sync problem');
is('a retry running shows syncing', label({ activity: 'syncing', problem: { kind: 'offline', message: '' } }), 'Syncing…');

// Syncing, Manual, downloads
is('syncing', label({ activity: 'syncing' }), 'Syncing…');
is('automatic, changes in the debounce', label({ activity: 'waiting', pending: null }), 'Syncing…');
is('manual with changes', label({ mode: 'manual', pending: 5, activity: 'waiting' }), 'Manual · 5 to sync');
is('manual, changes not counted yet', label({ mode: 'manual', pending: null, activity: 'waiting' }), 'Manual · changes to sync');
is('manual, first upload waiting', label({ mode: 'manual', phase: 'uploading' }), 'Manual · upload waiting');
is('manual, syncing', label({ mode: 'manual', activity: 'syncing', pending: 5 }), 'Syncing…');
is('downloads', label({ downloads: 2 }), 'Downloading…');
is('syncing notice is the detail', syncChipState({ ...synced, activity: 'syncing', notice: 'Sync will run when you finish editing' }, auth).detail,
  'Sync will run when you finish editing');

// Last synced
const now = Date.parse('2026-10-02T12:00:00Z');
is('last synced: never', lastSyncedText(null, now), 'Not synced yet since the project opened');
is('last synced: just now', lastSyncedText(now - 20_000, now), 'Last synced just now');
is('last synced: one minute', lastSyncedText(now - 60_000, now), 'Last synced 1 minute ago');
is('last synced: minutes', lastSyncedText(now - 5 * 60_000, now), 'Last synced 5 minutes ago');
check('last synced: over an hour shows the time', lastSyncedText(now - 2 * 3600_000, now).startsWith('Last synced at '));

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
