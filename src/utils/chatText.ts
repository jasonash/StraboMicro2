/**
 * Chat window helpers (collaboration spec v3 17bd-17bi): web links in a
 * message, which messages share an author line, day and time labels, where
 * the "New" line goes, and what a link to a spot or micrograph says.
 * Pure functions (npm run test:chat-text).
 */

/** Characters as the server counts them (code points; MsChat MAX_CHARS) */
export const CHAT_MAX_CHARS = 4000;

export function charCount(text: string): number {
  return Array.from(text).length;
}

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
/** Punctuation that ends a sentence, not the address */
const TRAILING_RE = /[.,;:!?)\]}'"]+$/;

/** A message's text with http(s) addresses as links (17bf d) */
export function splitLinks(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trail = url.match(TRAILING_RE);
    // Keep a closing parenthesis that belongs to the address, as in Wikipedia links
    if (trail && !(trail[0] === ')' && url.includes('('))) url = url.slice(0, url.length - trail[0].length);
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) });
    out.push({ kind: 'link', text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Messages within this long of the one before, by the same person, share its name line */
export const RUN_MS = 5 * 60_000;

export interface ChatLine {
  message: ChatMessage;
  /** Show the author and time (first of a run) */
  head: boolean;
  /** A day label before this message ("Today", "Yesterday", "Mon, Oct 5") */
  day: string | null;
  /** The "New" line goes before this message */
  firstNew: boolean;
}

/** The list as the window shows it, oldest first */
export function chatLines(messages: ChatMessage[], lastRead: number, me: number, now: Date = new Date()): ChatLine[] {
  const lines: ChatLine[] = [];
  let prev: ChatMessage | null = null;
  let newPlaced = false;
  for (const m of messages) {
    const day = dayLabel(m.createdAt, now);
    const prevDay = prev ? dayLabel(prev.createdAt, now) : null;
    const showDay = day !== prevDay;
    const sameRun = prev !== null && !showDay && prev.author.pkey === m.author.pkey
      && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < RUN_MS && !prev.deletedAt;
    const firstNew = !newPlaced && lastRead > 0 && m.id > lastRead && m.author.pkey !== me && !m.deletedAt;
    if (firstNew) newPlaced = true;
    lines.push({ message: m, head: !sameRun || firstNew, day: showDay ? day : null, firstNew });
    prev = m;
  }
  return lines;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Yesterday", "Mon, Oct 5", or "Mon, Oct 5, 2025" in another year */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/** "10:42 AM" */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** The text of a link chip: the item's name, or "(deleted spot)" (17bf e) */
export function refLabel(ref: ChatRef, resolved: ResolvedChatRef | undefined): string {
  const word = ref.type === 'spot' ? 'spot' : 'micrograph';
  if (!resolved) return word;
  if (resolved.name === null) return `(deleted ${word})`;
  return resolved.name.trim() === '' ? `Unnamed ${word}` : resolved.name;
}

export function refKey(ref: { type: string; id: string }): string {
  return `${ref.type}:${ref.id}`;
}

/** The newest message id the window has shown (marks read up to it) */
export function newestId(messages: ChatMessage[]): number {
  return messages.reduce((n, m) => Math.max(n, m.id), 0);
}

/** What an outgoing message's status line says */
export function outgoingNote(o: ChatOutgoing, now: number = Date.now()): string {
  if (o.status === 'sending') return 'Sending...';
  if (o.status === 'failed') return o.error || 'Not sent';
  if (o.retryAt && o.retryAt > now) return `Sending too fast; trying again in ${Math.ceil((o.retryAt - now) / 1000)} s`;
  return 'Not sent yet';
}
