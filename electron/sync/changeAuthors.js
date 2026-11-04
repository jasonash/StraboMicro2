/**
 * Who made the changes sync could not settle (Peter, 2026-10-27: "theirs"
 * is not enough for a class sharing one project). Every feed entry carries
 * its author ({ pkey, name }) and time; a conflict field is credited to the
 * newest entry that changed its value, a delete question to whoever deleted
 * it or changed things in it. Plain data, so it is kept in sync/state.json
 * with the conflict or question it belongs to.
 */

const { valueAt, sameContent } = require('./merge');
const { deepEqual } = require('../deepEqual');

/**
 * @typedef {{ pkey: number, name: string, at: string | null }} ChangeAuthor
 */

/** null and undefined are both "absent" (as in merge.js). */
function sameValue(a, b) {
  const x = a === null ? undefined : a;
  const y = b === null ? undefined : b;
  if (x === undefined || y === undefined) return x === y;
  return deepEqual(x, y);
}

/**
 * The author of a feed entry (null when the server sent none).
 * @param {object} e
 * @returns {ChangeAuthor | null}
 */
function authorOf(e) {
  const u = e && e.user;
  if (!u || !(Number(u.pkey) > 0)) return null;
  return { pkey: Number(u.pkey), name: typeof u.name === 'string' ? u.name.trim() : '', at: typeof e.at === 'string' ? e.at : null };
}

/**
 * Entries per entity key, in feed order.
 * @param {object[]} entries
 * @param {(type: string, id: string) => string} keyOf
 * @returns {Map<string, object[]>}
 */
function byEntity(entries, keyOf) {
  const out = new Map();
  for (const e of entries) {
    const k = keyOf(e.type, e.id);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(e);
  }
  return out;
}

/**
 * Conflict fields with their author: the newest entry that changed the
 * field's value, walking from what this copy knew before the pull. A field
 * no entry of this pull changed keeps the author it had (an older conflict
 * carried over).
 * @param {object[]} fields - Conflict fields ({ path, ... })
 * @param {object[]} entityEntries - This entity's entries of the pull, in order
 * @param {object | null} before - The entity as this copy knew it before the pull
 * @param {(e: object) => object | null} stateOf - Entity state of an entry (null = deleted)
 * @param {object[]} previous - The entity's stored conflict fields
 * @returns {object[]}
 */
function creditFields(fields, entityEntries, before, stateOf, previous) {
  return fields.map((f) => {
    let prev = before;
    /** @type {ChangeAuthor | null} */
    let by = null;
    for (const e of entityEntries) {
      const s = stateOf(e);
      if (s === null) continue;
      if (!sameValue(valueAt(prev, f.path), valueAt(s, f.path))) by = authorOf(e) || by;
      prev = s;
    }
    if (!by) {
      const id = JSON.stringify(f.path);
      const old = previous.find((p) => JSON.stringify(p.path) === id);
      if (old && old.by) by = old.by;
    }
    return by ? { ...f, by } : f;
  });
}

/**
 * Authors, newest first, each once; a pkey's newest name and time win.
 * @param {Array<ChangeAuthor | null | undefined>} list - Oldest first
 * @returns {ChangeAuthor[]}
 */
function distinctNewestFirst(list) {
  const seen = new Set();
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (!a || seen.has(a.pkey)) continue;
    seen.add(a.pkey);
    out.push(a);
  }
  return out;
}

/**
 * Who a delete question is about: for theirs_deleted, who deleted it; for
 * mine_deleted, who changed things in it (newest first), joined with the
 * authors the question already had.
 * @param {object} q - Question ({ key, kind, keys })
 * @param {Map<string, object[]>} entries - byEntity of the pull
 * @param {Record<string, object>} base - What this copy knew before the pull
 * @param {(e: object) => object | null} stateOf
 * @param {ChangeAuthor[]} [had]
 * @returns {ChangeAuthor[]}
 */
function questionAuthors(q, entries, base, stateOf, had = []) {
  if (q.kind === 'theirs_deleted') {
    const del = (entries.get(q.key) || []).filter((e) => e.op === 'delete').pop();
    const a = del ? authorOf(del) : null;
    return a ? [a] : had;
  }
  /** @type {ChangeAuthor[]} */
  const list = [];
  for (const k of q.keys) {
    let prev = base[k] || null;
    for (const e of entries.get(k) || []) {
      const s = stateOf(e);
      if (s !== null && (!prev || !sameContent(prev, s))) list.push(authorOf(e));
      if (s !== null) prev = s;
    }
  }
  // Feed order across entities: by time
  list.sort((a, b) => String(a?.at ?? '').localeCompare(String(b?.at ?? '')));
  return distinctNewestFirst([...[...had].reverse(), ...list]);
}

module.exports = { authorOf, byEntity, creditFields, questionAuthors, distinctNewestFirst };
