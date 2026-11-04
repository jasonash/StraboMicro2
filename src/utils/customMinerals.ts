/**
 * Custom mineral names: names that are not in the mineral database (e.g.
 * "lithic fragments", "glass"; Peter, 2026-10-29). They are stored like any
 * other mineral, as the plain name (Mineralogy minerals[].name, phases[],
 * point count classes, shortcut and color entries); nothing marks them as
 * custom. The picker (AutocompleteMineralSearch) offers 'Use "..."' when the
 * typed text matches no mineral, and offers custom names already used in the
 * project again so the same thing is not entered twice with different spelling.
 *
 * No database import here (the caller passes isKnown), so Node tests can load it.
 */

/** The name as it is saved: trimmed, inner runs of spaces made single */
export function normalizeMineralName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Every mineral name used in the project: Mineralogy minerals[].name, any
 * phases[] list (fabrics, grain info, veins, ...), intra-grain mineral, and
 * mineral color entries. Walks the whole project so new places are found too.
 * Distinct case-insensitively; the first spelling met wins.
 */
export function projectMineralNames(project: unknown): string[] {
  const byLower = new Map<string, string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const name = normalizeMineralName(value);
    if (name && !byLower.has(name.toLowerCase())) byLower.set(name.toLowerCase(), name);
  };
  const seen = new Set<object>();
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'phases' && Array.isArray(value)) value.forEach(add);
      else if (key === 'minerals' && Array.isArray(value)) {
        for (const m of value) if (m && typeof m === 'object' && 'name' in m) add(m.name);
      } else if (key === 'mineral') add(value);
      walk(value);
    }
  };
  walk(project);
  return [...byLower.values()];
}

/** The custom names (not in the database) among names, matching query: starts-with first, then contains */
export function matchCustomNames(query: string, names: string[], isKnown: (name: string) => boolean): string[] {
  const q = normalizeMineralName(query).toLowerCase();
  const custom = names.filter((n) => !isKnown(n));
  if (!q) return custom;
  const starts = custom.filter((n) => n.toLowerCase().startsWith(q));
  const contains = custom.filter((n) => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
  return [...starts, ...contains];
}

/**
 * The name to offer as 'Use "..."', or null: the typed text, normalized, when it
 * is not blank and is not already one of the offered names (case-insensitive)
 */
export function typedNameToOffer(query: string, offeredNames: string[]): string | null {
  const name = normalizeMineralName(query);
  if (!name) return null;
  const lower = name.toLowerCase();
  return offeredNames.some((n) => n.toLowerCase() === lower) ? null : name;
}
