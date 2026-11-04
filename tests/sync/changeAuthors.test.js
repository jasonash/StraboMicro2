/**
 * Unit tests of who made the changes sync could not settle
 * (electron/sync/changeAuthors.js).
 *
 *   npm run test:change-authors
 */

const { authorOf, byEntity, creditFields, questionAuthors, distinctNewestFirst } = require('../../electron/sync/changeAuthors');

let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 2000)}` : ''}`);
  }
}
const J = (v) => JSON.stringify(v);

const key = (type, id) => `${type}:${id}`;
/** A feed entry as the server sends it. */
const entry = (op, id, body, user, at, extra = {}) => ({
  op, type: 'spot', id, parentType: 'micrograph', parentId: 'm1', body, user, at, ...extra,
});
const stateOf = (e) => (e.op === 'delete' ? null : { type: e.type, id: e.id, parentType: e.parentType, parentId: e.parentId, body: e.body || {} });
const st = (id, body) => ({ type: 'spot', id, parentType: 'micrograph', parentId: 'm1', body });

const FRED = { pkey: 11, name: 'Fred Smith' };
const ANN = { pkey: 12, name: 'Ann Lee' };

// --- authorOf ----------------------------------------------------------------
check('author with name and time', J(authorOf({ user: FRED, at: '2026-10-27T10:21:00Z' })) === J({ pkey: 11, name: 'Fred Smith', at: '2026-10-27T10:21:00Z' }));
check('no user, no author', authorOf({ user: null }) === null && authorOf({}) === null);
check('server without a name: empty name', authorOf({ user: { pkey: 5, name: '' } }).name === '');

// --- creditFields ------------------------------------------------------------
{
  // Fred changes the notes, then Ann changes them again in the same pull: Ann
  const before = st('s1', { notes: 'base', label: 'L' });
  const es = [
    entry('update', 's1', { notes: 'fred', label: 'L' }, FRED, '2026-10-27T10:00:00Z'),
    entry('update', 's1', { notes: 'ann', label: 'L' }, ANN, '2026-10-27T10:05:00Z'),
  ];
  const [f] = creditFields([{ path: ['notes'] }], es, before, stateOf, []);
  check('two people in one pull: the newest change is named', f.by && f.by.pkey === ANN.pkey && f.by.at === '2026-10-27T10:05:00Z', J(f));
}
{
  // Ann's later entry does not touch the notes: Fred stays
  const before = st('s1', { notes: 'base', label: 'L' });
  const es = [
    entry('update', 's1', { notes: 'fred', label: 'L' }, FRED, '2026-10-27T10:00:00Z'),
    entry('update', 's1', { notes: 'fred', label: 'ann label' }, ANN, '2026-10-27T10:05:00Z'),
  ];
  const [f] = creditFields([{ path: ['notes'] }], es, before, stateOf, []);
  check('a later change of another field does not take the credit', f.by && f.by.pkey === FRED.pkey, J(f));
}
{
  // Nested path inside an id-keyed list
  const before = st('s1', { mineralogy: { minerals: [{ id: 'q', name: 'Qtz', percentage: 10 }] } });
  const es = [
    entry('update', 's1', { mineralogy: { minerals: [{ id: 'q', name: 'Qtz', percentage: 20 }] } }, FRED, 't1'),
    entry('update', 's1', { mineralogy: { minerals: [{ id: 'q', name: 'Quartz', percentage: 20 }] } }, ANN, 't2'),
  ];
  const fields = creditFields([{ path: ['mineralogy', 'minerals', '[q]', 'percentage'] }, { path: ['mineralogy', 'minerals', '[q]', 'name'] }],
    es, before, stateOf, []);
  check('list items: each field its own author', fields[0].by.pkey === FRED.pkey && fields[1].by.pkey === ANN.pkey, J(fields));
}
{
  // Location (parent) conflicts
  const before = st('s1', {});
  const es = [entry('update', 's1', {}, ANN, 't1', { parentId: 'm2' })];
  const [f] = creditFields([{ path: ['@parent'] }], es, before, stateOf, []);
  check('a move is credited', f.by && f.by.pkey === ANN.pkey, J(f));
}
{
  // Nothing in this pull changed the field: the stored author stays
  const before = st('s1', { notes: 'fred', label: 'L' });
  const es = [entry('update', 's1', { notes: 'fred', label: 'new' }, ANN, 't2')];
  const previous = [{ path: ['notes'], by: { ...FRED, at: 't1' } }];
  const [f] = creditFields([{ path: ['notes'] }], es, before, stateOf, previous);
  check('carried conflict keeps its author', f.by && f.by.pkey === FRED.pkey, J(f));
  const [g] = creditFields([{ path: ['notes'] }], [], before, stateOf, []);
  check('no entry, no stored author: no by (old conflicts show "Theirs")', g.by === undefined, J(g));
}
{
  // A created entity (no base): its creator
  const es = [entry('create', 's9', { notes: 'x' }, FRED, 't1')];
  const [f] = creditFields([{ path: ['notes'] }], es, null, stateOf, []);
  check('created elsewhere: the creator', f.by && f.by.pkey === FRED.pkey, J(f));
}

// --- questionAuthors ---------------------------------------------------------
{
  const es = [
    entry('update', 'm1', { name: 'x' }, ANN, 't1'),
    entry('delete', 'm1', null, FRED, 't2'),
  ];
  const by = questionAuthors({ key: key('spot', 'm1'), kind: 'theirs_deleted', keys: [key('spot', 'm1')] }, byEntity(es, key), {}, stateOf);
  check('their delete: who deleted it', by.length === 1 && by[0].pkey === FRED.pkey, J(by));
}
{
  const base = { [key('spot', 'a')]: st('a', { n: 0 }), [key('spot', 'b')]: st('b', { n: 0 }) };
  const es = [
    entry('update', 'a', { n: 1 }, FRED, '2026-10-27T10:00:00Z'),
    entry('update', 'b', { n: 1 }, ANN, '2026-10-27T10:02:00Z'),
    entry('update', 'a', { n: 2 }, FRED, '2026-10-27T10:01:00Z'),
  ];
  const q = { key: key('spot', 'a'), kind: 'mine_deleted', keys: [key('spot', 'a'), key('spot', 'b')] };
  const by = questionAuthors(q, byEntity(es, key), base, stateOf);
  check('my delete: who changed things in it, newest first, once each', J(by.map((b) => b.pkey)) === J([ANN.pkey, FRED.pkey]), J(by));
  const had = [{ pkey: 99, name: 'Old Person', at: '2026-10-20T00:00:00Z' }];
  const by2 = questionAuthors(q, byEntity(es, key), base, stateOf, had);
  check('earlier authors of the question stay, after the new ones', J(by2.map((b) => b.pkey)) === J([ANN.pkey, FRED.pkey, 99]), J(by2));
}
{
  const base = { [key('spot', 'a')]: st('a', { n: 0 }) };
  const es = [entry('update', 'a', { n: 0 }, ANN, 't1', { childOrder: undefined })];
  const by = questionAuthors({ key: key('spot', 'a'), kind: 'mine_deleted', keys: [key('spot', 'a')] }, byEntity(es, key), base, stateOf);
  check('an entry that changed nothing is not counted', by.length === 0, J(by));
}

// --- distinctNewestFirst -----------------------------------------------------
check('distinct, newest first', J(distinctNewestFirst([{ ...FRED, at: 1 }, { ...ANN, at: 2 }, { ...FRED, at: 3 }, null]).map((b) => [b.pkey, b.at]))
  === J([[11, 3], [12, 2]]));

console.log(failures === 0 ? `ALL PASSED (${passes} checks)` : `${failures} FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
