/**
 * Unit tests of chat notifications and the unread badge (electron/chatNotify.js,
 * spec v3 17bh): only in the background and with the switch on, one per
 * project per 30 s with later messages grouped, nothing for what was read
 * or seen meanwhile, the badge total, the Windows overlay bitmap.
 *
 *   npm run test:chat-notify
 */

const { createChatNotifier, overlayBitmap, firstLine, names, GROUP_MS } = require('../../electron/chatNotify');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${JSON.stringify(detail).slice(0, 2000)}` : ''}`);
  }
}

/** A notifier with a fake clock and timers; flags and records are on the returned object */
function rig({ enabled = true, focused = false } = {}) {
  const t = { now: 0, timers: [], shown: [], badges: [], enabled, focused };
  t.n = createChatNotifier({
    enabled: () => t.enabled,
    anyFocused: () => t.focused,
    projectName: (id) => ({ p1: 'Toxaway', p2: 'Bedretto' })[id] || '',
    show: (n) => t.shown.push(n),
    setBadge: (count) => t.badges.push(count),
    now: () => t.now,
    setTimer: (fn, ms) => {
      const timer = { at: t.now + ms, fn, done: false };
      t.timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.done = true;
    },
  });
  /** Move the clock, running timers that come due */
  t.advance = (ms) => {
    t.now += ms;
    for (const timer of t.timers) {
      if (!timer.done && timer.at <= t.now) {
        timer.done = true;
        timer.fn();
      }
    }
  };
  return t;
}

const msg = (id, name, text) => ({ id, text, author: { pkey: id + 100, name } });
const incoming = (projectId, ...messages) => ({ projectId, type: 'incoming', messages });
const unread = (projectId, n) => ({ projectId, type: 'state', state: { unread: n } });

// --- One message in the background ---
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana Ruiz', '\n  Look at the garnet rim  \nsecond line')));
  check('background: one notification', t.shown.length === 1, t.shown);
  check('background: "<name> in <project>"', t.shown[0]?.title === 'Ana Ruiz in Toxaway', t.shown[0]);
  check('background: first non-empty line, trimmed', t.shown[0]?.body === 'Look at the garnet rim', t.shown[0]);
  check('background: knows its project (click opens that chat)', t.shown[0]?.projectId === 'p1');
}

// --- Not when a window is focused or the switch is off ---
{
  const t = rig({ focused: true });
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'hi')));
  check('focused: no notification', t.shown.length === 0, t.shown);
  check('focused: the badge still counts', t.badges.at(-1) === 1, t.badges);
}
{
  const t = rig({ enabled: false });
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'hi')));
  check('switch off: no notification', t.shown.length === 0, t.shown);
  check('switch off: the badge still counts', t.badges.at(-1) === 1, t.badges);
}

// --- One per project per 30 s; later ones grouped ---
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana Ruiz', 'one')));
  t.advance(5_000);
  t.n.handle(unread('p1', 2));
  t.n.handle(incoming('p1', msg(2, 'Ben Ito', 'two')));
  t.advance(5_000);
  t.n.handle(unread('p1', 3));
  t.n.handle(incoming('p1', msg(3, 'Ana Ruiz', 'three')));
  check('within 30 s: nothing more yet', t.shown.length === 1, t.shown);
  t.advance(GROUP_MS - 10_000 - 1);
  check('just before 30 s: still nothing more', t.shown.length === 1, t.shown);
  t.advance(1);
  check('at 30 s: one grouped notification', t.shown.length === 2, t.shown);
  check('grouped: count and project', t.shown[1]?.title === '2 new messages in Toxaway', t.shown[1]);
  check('grouped: who wrote', t.shown[1]?.body === 'From Ben Ito and Ana Ruiz', t.shown[1]);
  t.n.handle(unread('p1', 4));
  t.n.handle(incoming('p1', msg(4, 'Ben Ito', 'four')));
  check('right after the grouped one: waits again', t.shown.length === 2, t.shown);
  t.advance(GROUP_MS);
  check('the next 30 s: a single one shows as a message', t.shown.length === 3 && t.shown[2].title === 'Ben Ito in Toxaway' && t.shown[2].body === 'four', t.shown[2]);
  t.advance(GROUP_MS * 2);
  t.n.handle(unread('p1', 5));
  t.n.handle(incoming('p1', msg(5, 'Ana Ruiz', 'five')));
  check('long after: at once', t.shown.length === 4 && t.shown[3].body === 'five', t.shown);
}

// --- Read (here or on another computer) or seen before the 30 s are up ---
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'one')));
  t.advance(1_000);
  t.n.handle(unread('p1', 2));
  t.n.handle(incoming('p1', msg(2, 'Ana', 'two')));
  t.n.handle(unread('p1', 0));
  t.advance(GROUP_MS);
  check('read before the 30 s: the waiting one is dropped', t.shown.length === 1, t.shown);
}
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'one')));
  t.advance(1_000);
  t.n.handle(unread('p1', 2));
  t.n.handle(incoming('p1', msg(2, 'Ana', 'two')));
  t.n.handle(unread('p1', 0));
  t.advance(1_000);
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(3, 'Ben', 'three')));
  t.advance(GROUP_MS);
  check('read, then a new one: only the new one shows', t.shown.length === 2 && t.shown[1].title === 'Ben in Toxaway' && t.shown[1].body === 'three', t.shown);
}
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'one')));
  t.advance(1_000);
  t.n.handle(unread('p1', 2));
  t.n.handle(incoming('p1', msg(2, 'Ana', 'two')));
  t.n.focused();
  t.advance(GROUP_MS);
  check('a window focused before the 30 s: dropped', t.shown.length === 1, t.shown);
}
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'one')));
  t.advance(1_000);
  t.n.handle(unread('p1', 2));
  t.n.handle(incoming('p1', msg(2, 'Ana', 'two')));
  t.focused = true;
  t.advance(GROUP_MS);
  check('focused when the 30 s are up: nothing', t.shown.length === 1, t.shown);
}
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'one')));
  t.advance(1_000);
  t.n.handle(incoming('p1', msg(2, 'Ana', 'two')));
  t.n.handle({ projectId: 'p1', type: 'closed' });
  t.advance(GROUP_MS);
  check('closed before the 30 s: nothing', t.shown.length === 1, t.shown);
}

// --- Projects are separate ---
{
  const t = rig();
  t.n.handle(unread('p1', 1));
  t.n.handle(incoming('p1', msg(1, 'Ana', 'in p1')));
  t.n.handle(unread('p2', 1));
  t.n.handle(incoming('p2', msg(2, 'Ben', 'in p2')));
  check('two projects: one each at once', t.shown.length === 2 && t.shown[1].title === 'Ben in Bedretto', t.shown);
}

// --- Badge ---
{
  const t = rig();
  t.n.handle(unread('p1', 3));
  t.n.handle(unread('p1', 3));
  t.n.handle(unread('p2', 2));
  check('badge: the total, set only when it changes', JSON.stringify(t.badges) === JSON.stringify([3, 5]), t.badges);
  t.n.handle({ projectId: 'p1', type: 'closed' });
  check('badge: a closed chat leaves it', t.badges.at(-1) === 2 && t.n.badgeCount() === 2, t.badges);
  t.n.handle(unread('p2', 0));
  check('badge: cleared when all is read', t.badges.at(-1) === 0, t.badges);
}

// --- Ignored input ---
{
  const t = rig();
  t.n.handle(null);
  t.n.handle({ type: 'incoming', messages: [msg(1, 'Ana', 'x')] });
  t.n.handle(incoming('p1'));
  check('bad or empty events: nothing', t.shown.length === 0 && t.badges.length === 0, { shown: t.shown, badges: t.badges });
}

// --- Text helpers ---
check('firstLine: blank lines skipped', firstLine('\n\n  hello \n world') === 'hello');
check('firstLine: long line shortened', firstLine('x'.repeat(300)).length === 120 && firstLine('x'.repeat(300)).endsWith('…'));
check('firstLine: empty', firstLine('') === '' && firstLine(undefined) === '');
check('names: one, two, many', names(['Ana']) === 'Ana' && names(['Ana', 'Ben', 'Ana']) === 'Ana and Ben'
  && names(['Ana', 'Ben', 'Cleo']) === 'Ana, Ben and 1 other' && names(['Ana', 'Ben', 'Cleo', 'Dev']) === 'Ana, Ben and 2 others' && names([]) === 'Someone');

// --- Windows overlay bitmap ---
{
  const one = overlayBitmap(1);
  check('overlay: 16 x 16 BGRA', one.length === 16 * 16 * 4);
  const px = (buf, x, y) => [...buf.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)];
  check('overlay: corner transparent', px(one, 0, 0)[3] === 0, px(one, 0, 0));
  check('overlay: edge of the disc red (BGRA)', JSON.stringify(px(one, 8, 1)) === JSON.stringify([47, 47, 211, 255]), px(one, 8, 1));
  const whites = (buf) => { let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] === 255 && buf[i + 1] === 255 && buf[i + 2] === 255) n++; return n; };
  check('overlay: digits drawn', whites(one) > 0 && whites(overlayBitmap(8)) > whites(one));
  check('overlay: each count 1 to 9 looks different', new Set([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => overlayBitmap(n).toString('hex'))).size === 9);
  check('overlay: 10 and up show 9+', overlayBitmap(10).equals(overlayBitmap(57)) && !overlayBitmap(10).equals(overlayBitmap(9)));
}

console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
