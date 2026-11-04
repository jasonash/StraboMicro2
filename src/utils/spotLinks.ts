/**
 * Adding links to many spots at once (Edit n Spots dialog).
 *
 * New links go on the end of each spot's list. A link whose URL the spot
 * already has is skipped, so applying the same links twice adds nothing.
 * URLs compare after trimming; the label plays no part.
 */

import type { LinkType } from '@/types/project-types';

function urlKey(url: string | null | undefined): string {
  return (url ?? '').trim();
}

/**
 * The spot's links with the new ones appended, or null when every new link
 * is already there (the caller leaves that spot untouched).
 */
export function addLinks(
  existing: LinkType[] | null | undefined,
  toAdd: LinkType[]
): LinkType[] | null {
  const current = existing ?? [];
  const seen = new Set(current.map((link) => urlKey(link.url)));
  const added: LinkType[] = [];
  for (const link of toAdd) {
    const key = urlKey(link.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    added.push({ label: link.label ?? '', url: key });
  }
  return added.length ? [...current, ...added] : null;
}
