/**
 * Chat window helpers (src/utils/chatText.ts, spec v3 17bd-17bi): links in
 * text, author runs, day labels, the "New" line, link chip labels.
 *
 *   npm run test:chat-text
 */

import { splitLinks, chatLines, dayLabel, refLabel, charCount, newestId, outgoingNote, RUN_MS } from '../src/utils/chatText.ts';

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail: unknown = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}\n        ${JSON.stringify(detail)}`);
  }
}

const links = (t: string) => splitLinks(t).filter((p) => p.kind === 'link').map((p) => p.text);
check('plain text: one part', JSON.stringify(splitLinks('no links here')) === '[{"kind":"text","text":"no links here"}]');
check('a link in a sentence, trailing period left out', JSON.stringify(links('See https://strabospot.org/x.')) === '["https://strabospot.org/x"]', splitLinks('See https://strabospot.org/x.'));
check('two links', links('a http://a.org b https://b.org/c?d=1 e').length === 2);
check('a closing parenthesis that belongs to the address stays', links('https://en.wikipedia.org/wiki/Quartz_(mineral)')[0] === 'https://en.wikipedia.org/wiki/Quartz_(mineral)');
check('a parenthesis around the link is left out', links('(https://a.org/x)')[0] === 'https://a.org/x');
check('the text around a link is kept exactly', splitLinks('x https://a.org y').map((p) => p.text).join('') === 'x https://a.org y');
check('no javascript: or file: links', links('javascript:alert(1) file:///etc/passwd').length === 0);

check('characters counted as code points', charCount('\u{1F600}\u{1F600}') === 2 && charCount('ab') === 2);

const now = new Date(2026, 9, 6, 12, 0);
check('today', dayLabel(new Date(2026, 9, 6, 1, 0).toISOString(), now) === 'Today');
check('yesterday', dayLabel(new Date(2026, 9, 5, 23, 0).toISOString(), now) === 'Yesterday');
check('earlier this year', dayLabel(new Date(2026, 9, 1, 9, 0).toISOString(), now) === 'Thu, Oct 1', dayLabel(new Date(2026, 9, 1, 9, 0).toISOString(), now));
check('another year has the year', /2025/.test(dayLabel(new Date(2025, 11, 31, 9, 0).toISOString(), now)));

const at = (h: number, min: number) => new Date(2026, 9, 6, h, min).toISOString();
const msg = (id: number, pkey: number, createdAt: string, deleted = false): ChatMessage => ({
  id, rev: id, clientMsgId: `c${id}`, author: { pkey, name: `U${pkey}` }, text: deleted ? '' : `m${id}`, refs: [],
  createdAt, deletedAt: deleted ? createdAt : null, deletedBy: null,
});
const list = [msg(1, 5, at(9, 0)), msg(2, 5, at(9, 2)), msg(3, 6, at(9, 3)), msg(4, 6, at(9, 30)), msg(5, 5, at(10, 0)), msg(6, 5, at(10, 1))];
let lines = chatLines(list, 0, 7, now);
check('runs: same author within 5 min share the name line', lines.map((l) => (l.head ? 'H' : '-')).join('') === 'H-HHH-', lines.map((l) => l.head));
check('one day label, on the first', lines[0].day === 'Today' && lines.slice(1).every((l) => l.day === null));
check('nothing read yet (lastRead 0): no New line (first open shows history)', lines.every((l) => !l.firstNew));
lines = chatLines(list, 2, 7, now);
check('New line before the first unread message by someone else', lines.findIndex((l) => l.firstNew) === 2);
lines = chatLines(list, 4, 5, now);
check('my own messages never start the New line', lines.every((l) => !l.firstNew), lines.map((l) => l.firstNew));
lines = chatLines([msg(1, 5, at(9, 0)), msg(2, 5, at(9, 1)), msg(3, 6, at(9, 2))], 1, 7, now);
check('the New line also starts a name line', lines[1].firstNew && lines[1].head);
lines = chatLines([msg(1, 5, at(9, 0), true), msg(2, 5, at(9, 1))], 0, 7, now);
check('after a deleted message the name shows again', lines[1].head);
check('RUN_MS is 5 minutes', RUN_MS === 300_000);

check('ref label: the name', refLabel({ type: 'spot', id: 's' }, { type: 'spot', id: 's', name: 'Grain 4' }) === 'Grain 4');
check('ref label: not in this copy', refLabel({ type: 'micrograph', id: 'm' }, { type: 'micrograph', id: 'm', name: null }) === '(deleted micrograph)');
check('ref label: no name', refLabel({ type: 'spot', id: 's' }, { type: 'spot', id: 's', name: ' ' }) === 'Unnamed spot');
check('ref label: not resolved yet', refLabel({ type: 'spot', id: 's' }, undefined) === 'spot');

check('newestId', newestId(list) === 6 && newestId([]) === 0);
const o = (x: Partial<ChatOutgoing>): ChatOutgoing => ({ clientMsgId: 'c', text: 't', refs: [], createdAt: at(9, 0), status: 'waiting', error: null, retryAt: null, ...x });
check('outgoing: waiting', outgoingNote(o({})) === 'Not sent yet');
check('outgoing: sending', outgoingNote(o({ status: 'sending' })) === 'Sending...');
check('outgoing: refused shows the reason', outgoingNote(o({ status: 'failed', error: 'Too long' })) === 'Too long');
check('outgoing: slowed down says when', outgoingNote(o({ retryAt: 10_000 }), 7_500) === 'Sending too fast; trying again in 3 s');

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${passes + failures} checks)`);
process.exit(failures === 0 ? 0 : 1);
