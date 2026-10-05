/**
 * Presence: who else is in the open synced project, as the live channel
 * reports it (collaboration spec v3, 17al-17an). Pure, so the rules are
 * testable (npm run test:presence).
 *
 * The live service lists every connection following the project; here
 * they become one person per account: my own account is left out (my other
 * computers are not shown, 17an), and a person on two computers shows once,
 * as the connection that is here (else the latest).
 */

export interface PresenceTarget {
  type: string;
  id: string;
}

export interface PresencePerson {
  user: number;
  name: string;
  initials: string;
  color: string;
  state: 'here' | 'away';
  viewing: PresenceTarget | null;
  editing: PresenceTarget | null;
  /** When the current state (here or away) began */
  since: string;
}

/** What the live service accepts for a target (livesvc/server.js); anything else is not sent */
const TYPE_RE = /^[a-z_]{1,24}$/;
const ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;

export function sendableTarget(t: PresenceTarget | null | undefined): PresenceTarget | null {
  if (!t || !TYPE_RE.test(t.type) || !ID_RE.test(t.id)) return null;
  return { type: t.type, id: t.id };
}

/** A stable color per account, the same on every screen (17an) */
export function presenceColor(pkey: number): string {
  const hue = Math.round((Math.abs(pkey) * 137.508) % 360);
  return `hsl(${hue}, 55%, 42%)`;
}

/** "Ben Ito" -> "BI", "ben" -> "B", "" -> "?" */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

const sameTarget = (a: PresenceTarget | null, b: PresenceTarget | null) =>
  a !== null && b !== null && a.type === b.type && a.id === b.id;

/**
 * Everyone else following the project, one per account, sorted by name.
 * @param me - My account (left out); null = not known (nobody is left out)
 * @param names - pkey => name, from the Collaborators list
 */
export function peopleFrom(raw: SyncLivePerson[], me: number | null, names: Record<number, string>): PresencePerson[] {
  const byUser = new Map<number, SyncLivePerson[]>();
  for (const p of raw) {
    if (me !== null && p.user === me) continue;
    const list = byUser.get(p.user) ?? [];
    list.push(p);
    byUser.set(p.user, list);
  }
  const out: PresencePerson[] = [];
  for (const [user, conns] of byUser) {
    const sorted = [...conns].sort((a, b) =>
      (a.state === b.state ? 0 : a.state === 'here' ? -1 : 1) || b.since.localeCompare(a.since));
    const best = sorted[0];
    const name = names[user] || 'Someone';
    out.push({
      user,
      name,
      initials: initialsOf(name),
      color: presenceColor(user),
      state: best.state,
      viewing: best.viewing,
      // Editing on any of their computers counts
      editing: best.editing ?? sorted.find((c) => c.editing)?.editing ?? null,
      since: best.since,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function viewersOf(people: PresencePerson[], target: PresenceTarget): PresencePerson[] {
  return people.filter((p) => sameTarget(p.viewing, target));
}

export function editorsOf(people: PresencePerson[], target: PresenceTarget): PresencePerson[] {
  return people.filter((p) => sameTarget(p.editing, target));
}

/** Whole minutes since an ISO time (0 when unknown or in the future) */
export function minutesSince(since: string, now: number): number {
  const t = Date.parse(since);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60_000)) : 0;
}

/**
 * One line about a person: "Ben Ito, editing spot Garnet 1",
 * "Ben Ito, viewing 160328-4 XPL", "Ben Ito, away (12 min)", "Ben Ito".
 * describe names a target ("spot Garnet 1", "160328-4 XPL") or null.
 */
export function presenceLine(p: PresencePerson, describe: (t: PresenceTarget, editing: boolean) => string | null, now: number): string {
  if (p.state === 'away') {
    const m = minutesSince(p.since, now);
    return `${p.name}, away${m > 0 ? ` (${m} min)` : ''}`;
  }
  const editing = p.editing ? describe(p.editing, true) : null;
  if (editing) return `${p.name}, editing ${editing}`;
  const viewing = p.viewing ? describe(p.viewing, false) : null;
  return viewing ? `${p.name}, viewing ${viewing}` : p.name;
}

/** "Ben Ito", "Ben Ito and Cleo Park", "Ana, Ben and Cleo" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The line at the top of an edit dialog when others edit the same item (17am) */
export function editingNotice(names: string[], typeWord: string): string {
  const verb = names.length === 1 ? 'is' : 'are';
  return `${joinNames(names)} ${verb} editing this ${typeWord} right now. ` +
    "You can still edit; if you both change the same field you'll be asked which to keep.";
}

/** The word for a target type in sentences */
export function typeWord(type: string): string {
  return type === 'project' ? 'project' : type === 'dataset' ? 'dataset' : type === 'sample' ? 'sample'
    : type === 'micrograph' ? 'micrograph' : type === 'spot' ? 'spot' : 'item';
}

/** Dialogs of the side panels that edit the micrograph even when a spot is selected */
const MICROGRAPH_DIALOGS = new Set(['micrograph', 'polish-description', 'instrument-notes', 'post-processing-notes']);
/** Dialogs that only show, never change */
const VIEW_DIALOGS = new Set(['detailedNotes']);

/**
 * What a side panel's open dialog edits (PropertiesPanel, BottomPanel):
 * project, dataset, sample and micrograph dialogs by name; the metadata
 * dialogs edit the selected spot, else the micrograph.
 */
export function panelDialogTarget(openDialog: string | null, ids: {
  projectId: string | null; datasetId: string | null; sampleId: string | null; micrographId: string | null; spotId: string | null;
}): PresenceTarget | null {
  if (!openDialog || VIEW_DIALOGS.has(openDialog)) return null;
  const t = (type: string, id: string | null | undefined) => (id ? { type, id } : null);
  if (openDialog === 'project') return t('project', ids.projectId);
  if (openDialog === 'dataset') return t('dataset', ids.datasetId);
  if (openDialog === 'sample') return t('sample', ids.sampleId);
  if (MICROGRAPH_DIALOGS.has(openDialog)) return t('micrograph', ids.micrographId);
  if (openDialog === 'spot') return t('spot', ids.spotId);
  return t('spot', ids.spotId) ?? t('micrograph', ids.micrographId);
}
