/**
 * Unit tests of what the header's sync status chip says (src/utils/syncChipState.ts, spec v3 16ad).
 *
 *   npm run test:sync-chip
 */

import { describeDifferences } from '@/utils/describeDifferences';
import {
  syncChipState, lastSyncedText, incomingText, editWaitText, liveNote, describeProgress, type SyncChipInput, type SyncChipAuth,
} from '@/utils/syncChipState';

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
  notice: null, progress: null, incoming: 0, incomingFrom: [], linking: null, live: true,
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
is('download progress: n of total, no file ids', describeProgress({ projectId: 'p', phase: 'download', done: 12, total: 128 }), 'Downloading files (12 of 128)');
is('download progress: a step in words (older uploads) as it is', describeProgress({ projectId: 'p', phase: 'download', item: 'Converting a.tif...' }), 'Converting a.tif...');
is('syncing notice is the detail', syncChipState({ ...synced, activity: 'syncing', notice: 'Sync will run when you finish editing' }, auth).detail,
  'Sync will run when you finish editing');

// Icons: the slashed cloud only for connection trouble, never for Manual waiting
const icon = (s: Partial<SyncChipInput>) => syncChipState({ ...synced, ...s }, auth).icon;
is('icon: manual with changes', icon({ mode: 'manual', pending: 1, activity: 'waiting' }), 'waiting');
is('icon: manual, first upload waiting', icon({ mode: 'manual', phase: 'uploading' }), 'waiting');
is('icon: offline', icon({ problem: { kind: 'offline', message: '' } }), 'offline');
is('icon: server trouble', icon({ mode: 'manual', problem: { kind: 'server', message: '' } }), 'offline');
is('icon: sync unavailable', icon({ problem: { kind: 'disabled', message: '' } }), 'offline');
is('icon: synced', icon({}), 'ok');
is('icon: local only', icon({ synced: false }), 'local');
is('icon: syncing', icon({ activity: 'syncing' }), 'busy');
is('icon: decisions', icon({ conflicts: 1 }), 'attention');

// Incoming (16ah)
is('synced with incoming', label({ incoming: 3 }), 'Synced · 3 incoming');
is('manual with changes and incoming', label({ mode: 'manual', pending: 2, activity: 'waiting', incoming: 3 }), 'Manual · 2 to sync · 3 incoming');
is('incoming icon', icon({ incoming: 3 }), 'incoming');
is('incoming not shown over decisions', label({ incoming: 3, conflicts: 1 }), '1 needs your decision');
is('incoming not shown while syncing', label({ incoming: 3, activity: 'syncing' }), 'Syncing…');
is('incoming not shown when offline', label({ incoming: 3, problem: { kind: 'offline', message: '' } }), 'Offline');
is('incoming not shown on a local-only project', label({ synced: false, incoming: 3 }), 'Local only');
is('incoming text: my other computer', incomingText(5, []), '5 changes from your other computer are waiting on StraboSpot.');
is('incoming text: one change', incomingText(1, []), '1 change from your other computer is waiting on StraboSpot.');
is('incoming text: people and my computer', incomingText(5, [{ name: 'Jane Doe', count: 3 }]),
  '5 changes are waiting on StraboSpot: Jane Doe (3), your other computer (2).');
is('incoming text: people only', incomingText(3, [{ name: 'Jane Doe', count: 3 }]), '3 changes are waiting on StraboSpot: Jane Doe (3).');

// Linking a local-only copy (16an)
is('comparing, percent', label({ synced: false, linking: { percent: 40 } }), 'Comparing with StraboSpot 40%');
is('comparing, not started', label({ synced: false, linking: { percent: null } }), 'Comparing with StraboSpot…');
is('comparing icon', icon({ synced: false, linking: { percent: 40 } }), 'busy');
is('differences, ordered and plural', describeDifferences({ spot: 12, micrograph: 2 }), '2 micrographs, 12 spots');
is('differences, one each and project details', describeDifferences({ project: 1, sample: 1 }), 'project details, 1 sample');
is('differences, unknown type', describeDifferences({ point_count: 2, preset_thing: 1 }), '2 point counts, 1 preset thing');

// Changes held by an open edit (17ap)
is('edit wait: one person, dialog', editWaitText(3, [{ name: 'Ben', count: 3 }], true),
  "Ben made 3 changes; they'll appear when you close this dialog.");
is('edit wait: one change, field', editWaitText(1, [{ name: 'Ben', count: 1 }], false),
  "Ben made 1 change; it'll appear when you finish editing.");
is('edit wait: two people', editWaitText(5, [{ name: 'Ben', count: 2 }, { name: 'Cleo', count: 3 }], true),
  "Ben and Cleo made 5 changes; they'll appear when you close this dialog.");
is('edit wait: three people and my other computer', editWaitText(7, [{ name: 'Ben', count: 2 }, { name: 'Cleo', count: 3 }], true),
  "Ben, Cleo and your other computer made 7 changes; they'll appear when you close this dialog.");
is('edit wait: only my other computer', editWaitText(2, [], false),
  "Your other computer made 2 changes; they'll appear when you finish editing.");

// Live channel down (17ao): a popover line, the chip unchanged
const st = (s: Partial<SyncChipInput>, a: Partial<SyncChipAuth> = {}) => syncChipState({ ...synced, ...s }, { ...auth, ...a });
const note = (s: Partial<SyncChipInput>, a: Partial<SyncChipAuth> = {}) => liveNote({ ...synced, ...s }, st(s, a));
is('live: no note', String(note({})), 'null');
is('live down: the note', String(note({ live: false })), 'Live updates paused, checking every 30 s.');
is('live down: chip unchanged', st({ live: false }).label, 'Synced');
is('live down, offline: the problem says it', String(note({ live: false, problem: { kind: 'offline', message: '' } })), 'null');
is('live down, logged out: the login says it', String(note({ live: false }, { loggedIn: false })), 'null');
is('local only: no note', String(note({ synced: false, live: false })), 'null');

// Last synced
const now = Date.parse('2026-10-02T12:00:00Z');
is('last synced: never', lastSyncedText(null, now), 'Not synced yet since the project opened');
is('last synced: just now', lastSyncedText(now - 20_000, now), 'Last synced just now');
is('last synced: one minute', lastSyncedText(now - 60_000, now), 'Last synced 1 minute ago');
is('last synced: minutes', lastSyncedText(now - 5 * 60_000, now), 'Last synced 5 minutes ago');
check('last synced: over an hour shows the time', lastSyncedText(now - 2 * 3600_000, now).startsWith('Last synced at '));

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
