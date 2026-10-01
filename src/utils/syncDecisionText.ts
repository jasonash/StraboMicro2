/**
 * Wording for the "Sync needs your decision" dialog (collaboration spec v3
 * 16x to 16aa): how items, fields and values are named, and why the server
 * turned a change down.
 */

const TYPE_LABELS: Record<string, string> = {
  project: 'project',
  dataset: 'dataset',
  sample: 'sample',
  micrograph: 'micrograph',
  spot: 'spot',
  tag: 'tag',
  group: 'group',
  preset: 'quick spot preset',
  point_count: 'point count session',
};

const TYPE_PLURALS: Record<string, string> = {
  dataset: 'datasets',
  sample: 'samples',
  micrograph: 'micrographs',
  spot: 'spots',
  point_count: 'point count sessions',
};

/** Fields with a name better than their key. */
const FIELD_LABELS: Record<string, string> = {
  '@parent': 'Location',
  name: 'Name',
  label: 'Label',
  notes: 'Notes',
  description: 'Description',
  color: 'Color',
  labelColor: 'Label color',
  showLabel: 'Show label',
  opacity: 'Opacity',
  tags: 'Tags',
  mineralogy: 'Mineralogy',
  minerals: 'Minerals',
  grainInfo: 'Grain info',
  fabricInfo: 'Fabrics',
  fractureInfo: 'Fractures',
  foldInfo: 'Folds',
  veinInfo: 'Veins',
  associatedFiles: 'Associated files',
  links: 'Links',
  scalePixelsPerCentimeter: 'Scale',
  sketchLayers: 'Sketch',
  strokes: 'Strokes',
  textItems: 'Text',
  geometry: 'Shape',
  points: 'Shape',
  geometryType: 'Shape type',
};

/** Fields shown as "Shape changed" when the conflict has no picture (sketch, or a spot that also moved; 16y, 16ac). */
const SHAPE_FIELDS = new Set(['geometry', 'points', 'sketchLayers']);

const isItemSegment = (s: string) => s.startsWith('[') && s.endsWith(']');

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "Spot 'Garnet 3' on micrograph 'TS-12 ppl'" */
export function itemLabel(item: SyncItemRef): string {
  if (item.type === 'project') return 'Project settings';
  const what = item.name ? `${capitalize(typeLabel(item.type))} '${item.name}'` : `Unnamed ${typeLabel(item.type)}`;
  if (!item.parentType) return what;
  const where = item.parentType === 'micrograph' ? 'on' : 'in';
  const parent = item.parentName ? `${typeLabel(item.parentType)} '${item.parentName}'` : `an unnamed ${typeLabel(item.parentType)}`;
  return `${what} ${where} ${parent}`;
}

/** " (3 micrographs, 40 spots)" or "" */
export function containsLabel(contains: Record<string, number>): string {
  const parts = Object.entries(contains)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, n]) => `${n} ${n === 1 ? typeLabel(type) : TYPE_PLURALS[type] ?? `${typeLabel(type)}s`}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/** "Mineralogy › Minerals"; list items show as "item". */
export function fieldLabel(path: string[]): string {
  const parts = path.map((seg) => {
    if (isItemSegment(seg)) return 'item';
    if (FIELD_LABELS[seg]) return FIELD_LABELS[seg];
    const words = seg.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase();
    return capitalize(words);
  });
  return parts.join(' › ');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function scalar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

/** A short name for a list item: its name, mineral, label or type, with a percentage. */
function itemName(item: unknown): string {
  if (!isPlainObject(item)) return scalar(item);
  const n = item.name ?? item.mineral ?? item.label ?? item.title ?? item.type ?? item.fileName;
  const base = typeof n === 'string' && n ? n : 'item';
  const pct = item.percentage ?? item.percent;
  return typeof pct === 'number' ? `${base} ${scalar(pct)}%` : base;
}

/** Every leaf as "key: value" lines (the "Show all" text). */
function fullText(v: unknown, indent = ''): string[] {
  if (Array.isArray(v)) {
    if (v.length === 0) return [`${indent}(none)`];
    return v.flatMap((x, i) => (isPlainObject(x) || Array.isArray(x)
      ? [`${indent}${i + 1}.`, ...fullText(x, `${indent}   `)]
      : [`${indent}${i + 1}. ${scalar(x)}`]));
  }
  if (isPlainObject(v)) {
    const lines: string[] = [];
    for (const [k, x] of Object.entries(v)) {
      if (x === null || x === undefined || k === 'id') continue;
      if (isPlainObject(x) || Array.isArray(x)) lines.push(`${indent}${fieldLabel([k])}:`, ...fullText(x, `${indent}   `));
      else lines.push(`${indent}${fieldLabel([k])}: ${scalar(x)}`);
    }
    return lines.length > 0 ? lines : [`${indent}(empty)`];
  }
  return [`${indent}${scalar(v)}`];
}

export interface ValueText {
  /** One line */
  short: string;
  /** Everything, for "Show all"; null when short already says it all */
  full: string | null;
}

/**
 * A conflict value as text (16y): plain values as they are, lists and
 * objects as a short summary, a parent by its name, shapes as "Shape
 * changed".
 */
export function valueText(path: string[], value: unknown): ValueText {
  if (value === undefined || value === null || value === '') return { short: '(empty)', full: null };
  if (path[0] === '@parent') {
    const p = value as { parentType?: string | null; name?: string };
    if (!p.parentType || p.parentType === 'project') return { short: 'Top level of the project', full: null };
    return { short: p.name ? `In ${typeLabel(p.parentType)} '${p.name}'` : `In an unnamed ${typeLabel(p.parentType)}`, full: null };
  }
  if (path.some((seg) => SHAPE_FIELDS.has(seg))) return { short: 'Shape changed', full: null };
  if (Array.isArray(value)) {
    if (value.length === 0) return { short: '(none)', full: null };
    const names = value.slice(0, 3).map(itemName).join(', ');
    const short = `${value.length} ${value.length === 1 ? 'item' : 'items'}: ${names}${value.length > 3 ? ', ...' : ''}`;
    return { short, full: fullText(value).join('\n') };
  }
  if (isPlainObject(value)) {
    const lines = fullText(value);
    const short = lines.filter((l) => !l.startsWith(' ') && !l.endsWith(':')).slice(0, 2).join('; ') || `${lines.length} values`;
    return { short: lines.length > 2 ? `${short}; ...` : short, full: lines.join('\n') };
  }
  const text = scalar(value);
  if (text.length > 200 || text.includes('\n')) {
    return { short: `${text.split('\n')[0].slice(0, 200)}...`, full: text };
  }
  return { short: text, full: null };
}

const REASONS: Record<string, string> = {
  parent_rejected: 'Its parent was not accepted.',
  parent_deleted: 'It belongs to something that was deleted on the server.',
  parent_other_sample: 'A micrograph with micrographs nested under it cannot move to another sample.',
  exists: 'Something with the same id already exists on the server, or was deleted there.',
  not_found: 'It no longer exists on the server.',
  schema: 'The server could not read the change.',
  moved: 'A point count session cannot move to another micrograph.',
  viewer: 'Your role in this project does not allow changes.',
  editor_required: 'Only owners and editors can do this.',
  settings: 'Only owners and editors can change project settings.',
  cascade_includes_others: 'It contains items other people created, which your role cannot delete.',
};

/** Why the server turned a change down, in plain words (16aa). */
export function refusedReason(item: SyncRefusedItem): string {
  if (REASONS[item.reason]) return REASONS[item.reason];
  if (item.message) return `${capitalize(item.message.replace(/\.$/, ''))}.`;
  return 'The server did not accept it.';
}
