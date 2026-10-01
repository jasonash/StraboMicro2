/**
 * End-to-end test of sync decisions (electron/sync/decisions.js through the
 * sync service) against the local dev server: field conflicts (keep mine,
 * take theirs), delete-vs-edit questions (restore with my changes, delete
 * it, keep deleted, bring back with their changes) and changes the server
 * turned down (held until edited, discard). The app's part is done the way
 * the app does it: decide, apply to the project, save, commit.
 *
 *   npm run test:decisions
 *
 * Needs the dev Docker stack (strabo-php) with MICROSYNC_ENABLED and the
 * fixture user owner@test.strabospot.org. Uses two micrographs of the copied
 * prod folder straboMicroFiles/727 (M2 nested in M1). Server projects use
 * the mscli- prefix and are removed at the end.
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FIXTURE = path.join(os.homedir(), 'Desktop/Work/StraboBackendDevKit/www/straboMicroFiles/727');
const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smdecide-'));
app.setPath('documents', path.join(tmp, 'Documents'));
app.setPath('userData', path.join(tmp, 'userData'));
fs.mkdirSync(path.join(tmp, 'Documents'), { recursive: true });

const E = path.join(__dirname, '../../electron');
let failures = 0;
let passes = 0;
function check(label, ok, detail = '') {
  if (ok) passes++;
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `\n        ${String(detail).slice(0, 2000)}` : ''}`);
  }
  return ok;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fixture(...args) {
  const out = execFileSync('docker', ['exec', 'strabo-php', 'php', '/srv/app/www/tests/microsync/client_fixture.php', ...args.map(String)],
    { maxBuffer: 1 << 28 }).toString();
  return JSON.parse(out);
}

app.whenReady().then(async () => {
  try {
    const tokenService = require(`${E}/tokenService`);
    let stored = null;
    tokenService.getTokens = async () => (stored ? JSON.parse(JSON.stringify(stored)) : null);
    tokenService.saveTokens = async (accessToken, refreshToken, expiresIn, user) => {
      stored = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000, user };
    };
    tokenService.clearTokens = async () => { stored = null; };

    const { createSyncClient, hashFile } = require(`${E}/sync/client`);
    const svc = require(`${E}/sync/syncService`);
    const sidecar = require(`${E}/sync/sidecar`);
    const ser = require(`${E}/projectSerializer`);
    const projectFolders = require(`${E}/projectFolders`);
    const { applyEntityChanges } = require(`${E}/shared/entityModel.mjs`);

    fixture('cleanup');
    const who = fixture('token');
    await tokenService.saveTokens(who.token, 'r', 3600, { pkey: String(who.pkey), email: who.email, name: 'Owner' });
    const other = createSyncClient({ restServer: SERVER, getAccessToken: async () => who.token });
    const OTHER = 'other-machine-' + crypto.randomUUID();

    // A local-only project: a reference micrograph and one child with 3 spots
    const pid = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), pid);
    const p0 = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'project.json'), 'utf8'));
    const ms0 = p0.datasets[0].samples[0].micrographs;
    const keep = [ms0[0], ms0[1]];
    p0.id = pid;
    p0.name = 'Decisions test';
    p0.datasets = [{ ...p0.datasets[0], samples: [{ ...p0.datasets[0].samples[0], micrographs: keep }] }];
    for (const sub of ['images', 'compositeThumbnails']) {
      fs.mkdirSync(path.join(local, sub), { recursive: true });
      for (const mm of keep) {
        const src = path.join(FIXTURE, sub, mm.id);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(local, sub, mm.id));
      }
    }
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify(p0, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(pid), pid);

    const M1 = keep[0].id;
    const M2 = keep[1].id;
    const [S1, S2, S3] = keep[1].spots.map((s) => s.id);
    const SAMPLE = p0.datasets[0].samples[0].id;

    const on = await svc.turnOn(pid, SERVER, 'manual');
    check('turn on', on.ok, JSON.stringify(on));
    const first = await svc.push(pid, SERVER, () => {});
    check('first upload', first.ok && first.ready, JSON.stringify(first));
    const folder = on.folder;
    const serverPid = on.pid;
    const base = async () => (await sidecar.loadState(folder)).base;

    /** What the app does: prepare, apply to its project, save, commit. */
    const appPull = async () => {
      const r = await svc.pull(pid, SERVER, () => {});
      if (!r.ok) throw new Error(`pull failed: ${JSON.stringify(r)}`);
      const appProject = await ser.loadProjectJson(pid);
      applyEntityChanges(appProject, r.changes, 'redo');
      await ser.saveProjectJson(appProject, pid);
      const c = await svc.commitPull(pid, r.pullId);
      if (!c.ok) throw new Error(`commit failed: ${JSON.stringify(c)}`);
      return { ...r, downloads: c.downloads };
    };
    /** Local edit, as the app saves it. */
    const appEdit = async (fn) => {
      const appProject = await ser.loadProjectJson(pid);
      fn(appProject);
      await ser.saveProjectJson(appProject, pid);
    };
    const disk = () => JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
    const micro = (p, id) => p.datasets[0].samples[0].micrographs.find((m) => m.id === id);
    const otherPush = async (changes) => (await other.push(serverPid, crypto.randomUUID(), OTHER, changes)).results;
    const v = async (type, id) => (await base())[`${type}:${id}`].version;
    /** What the app does for one answer: decide, apply to its project, save, commit. */
    const appDecide = async (decision) => {
      const r = await svc.decide(pid, decision);
      if (!r.ok) return r;
      const appProject = await ser.loadProjectJson(pid);
      applyEntityChanges(appProject, r.changes, 'redo');
      await ser.saveProjectJson(appProject, pid);
      const c = await svc.decideCommit(pid, r.decisionId);
      if (!c.ok) throw new Error(`decide commit failed: ${JSON.stringify(c)}`);
      return { ...r, downloads: c.downloads };
    };
    const push = () => svc.push(pid, SERVER, () => {});
    const status = () => svc.getStatus(pid);
    const onServer = async () => Object.fromEntries((await other.snapshot(serverPid)).entities.map((e) => [`${e.type}:${e.id}`, e]));
    const KM1 = `micrograph:${M1}`;
    const KM2 = `micrograph:${M2}`;
    const field = (...p) => JSON.stringify(p);

    await appPull();

    // --- Conflicts: keep mine for one field, take theirs for the other -------------------------
    await appEdit((p) => { micro(p, M1).notes = 'my notes'; micro(p, M1).name = 'my name'; });
    await otherPush([{ op: 'update', type: 'micrograph', id: M1, baseVersion: await v('micrograph', M1), fields: { notes: 'their notes', name: 'their name' } }]);
    await push();
    await appPull();
    let L = await svc.listDecisions(pid);
    const c0 = L.ok && L.conflicts[0];
    check('list: one conflicted micrograph with two fields', L.ok && L.conflicts.length === 1 && c0.key === KM1 && c0.fields.length === 2 &&
      c0.name === 'my name' && c0.parentType === 'sample', JSON.stringify(L));
    const notes = c0 && c0.fields.find((f) => f.id === field('notes'));
    check('list: field shows mine and theirs', notes && notes.mine === 'my notes' && notes.theirs === 'their notes', JSON.stringify(notes));
    const none = await svc.decide(pid, { kind: 'conflict', key: KM1, choices: {} });
    check('a conflict answer with no field decided is refused', !none.ok, JSON.stringify(none));
    const k1 = await appDecide({ kind: 'conflict', key: KM1, choices: { [field('name')]: 'mine' } });
    check('keep mine: nothing to apply, undoable kind', k1.ok && k1.changes.length === 0 && k1.undoable === true, JSON.stringify(k1));
    const left = (await sidecar.loadState(folder)).conflicts[KM1];
    check('keep mine settles only that field', left && left.length === 1 && eq(left[0].path, ['notes']), JSON.stringify(left));
    const held = await push();
    check('an entity with a field still open stays held', held.ok && held.pushed === 0, JSON.stringify(held));
    const t1 = await appDecide({ kind: 'conflict', key: KM1, choices: { [field('notes')]: 'theirs' } });
    check('take theirs: one change applied locally', t1.ok && t1.changes.length === 1 && micro(disk(), M1).notes === 'their notes' &&
      micro(disk(), M1).name === 'my name', JSON.stringify(t1));
    check('all fields decided: conflict gone', (await status()).conflicts === 0);
    const p1 = await push();
    const s1 = await onServer();
    check('the settled entity pushes: my name, their notes', p1.ok && p1.pushed === 1 && s1[KM1].body.name === 'my name' &&
      s1[KM1].body.notes === 'their notes', JSON.stringify(p1));
    check('nothing waiting after the conflict', (await status()).pending === 0);

    // --- Geometry conflicts carry a preview (one pick for the group) -----------------------------
    const pts = (dx) => [{ X: 100 + dx, Y: 100 }, { X: 300 + dx, Y: 100 }, { X: 200 + dx, Y: 250 }];
    await appEdit((p) => {
      const sp = micro(p, M2).spots.find((s) => s.id === S1);
      sp.geometryType = 'polygon';
      sp.points = pts(0);
      micro(p, M2).rotation = 10;
    });
    await otherPush([
      { op: 'update', type: 'spot', id: S1, baseVersion: await v('spot', S1), fields: { geometryType: 'polygon', points: pts(50) } },
      { op: 'update', type: 'micrograph', id: M2, baseVersion: await v('micrograph', M2), fields: { rotation: 20 } },
    ]);
    await push();
    await appPull();
    L = await svc.listDecisions(pid);
    const shapeItem = L.ok && L.conflicts.find((c) => c.key === `spot:${S1}`);
    const placeItem = L.ok && L.conflicts.find((c) => c.key === KM2);
    check('shape conflict: preview with both shapes on the spot\'s micrograph', shapeItem && shapeItem.preview &&
      shapeItem.preview.group === 'shape' && shapeItem.preview.micrographId === M2 && eq(shapeItem.preview.fieldIds, [field('points')]) &&
      shapeItem.preview.mine.points[0].X === 100 && shapeItem.preview.theirs.points[0].X === 150, JSON.stringify(shapeItem));
    check('placement conflict: preview on the parent micrograph', placeItem && placeItem.preview &&
      placeItem.preview.group === 'placement' && placeItem.preview.micrographId === M1 && eq(placeItem.preview.fieldIds, [field('rotation')]) &&
      placeItem.preview.mine.rotation === 10 && placeItem.preview.theirs.rotation === 20 && placeItem.preview.mine.width > 0,
      JSON.stringify(placeItem && placeItem.preview));
    await appDecide({ kind: 'conflict', key: `spot:${S1}`, choices: { [field('points')]: 'theirs' } });
    await appDecide({ kind: 'conflict', key: KM2, choices: { [field('rotation')]: 'mine' } });
    const pg = await push();
    check('geometry conflicts settled and pushed', pg.ok && (await status()).conflicts === 0 && (await status()).pending === 0 &&
      (await onServer())[KM2].body.rotation === 10, JSON.stringify(pg));

    // --- Their delete vs my edit: restore with my changes --------------------------------------
    await appEdit((p) => { micro(p, M2).spots.find((s) => s.id === S1).name = 'edited by me'; });
    await otherPush([{ op: 'delete', type: 'micrograph', id: M2, baseVersion: await v('micrograph', M2) }]);
    await appPull();
    L = await svc.listDecisions(pid);
    const q0 = L.ok && L.questions[0];
    check('list: their delete as one question with counts', L.ok && L.questions.length === 1 && q0.kind === 'theirs_deleted' &&
      q0.key === KM2 && q0.contains.spot === 3 && q0.localChanges === 1, JSON.stringify(L.questions));
    const wrong = await svc.decide(pid, { kind: 'question', key: KM2, answer: 'keep_deleted' });
    check('an answer that does not fit the question is refused', !wrong.ok, JSON.stringify(wrong));
    const r1 = await appDecide({ kind: 'question', key: KM2, answer: 'restore' });
    const stR = await sidecar.loadState(folder);
    check('restore: nothing applied, restore queued, still held', r1.ok && r1.changes.length === 0 && r1.undoable === false &&
      stR.questions.length === 0 && stR.restores.length === 1 && !stR.restores[0].sent, JSON.stringify(stR.restores));
    const again = await svc.decide(pid, { kind: 'question', key: KM2, answer: 'restore' });
    check('an answered question cannot be answered again', !again.ok);
    const pr = await push();
    check('the push sends the restore', pr.ok && pr.restored === 1 && pr.pushed === 0, JSON.stringify(pr));
    // They edit a restored spot before this copy pulls: an ordinary change on top of the restored state
    const s2v = (await onServer())[`spot:${S2}`];
    const late = await otherPush([{ op: 'update', type: 'spot', id: S2, baseVersion: s2v && s2v.version, fields: { name: 'theirs after restore' } }]);
    check('other machine edits a restored spot', late[0] && late[0].status === 'accepted', JSON.stringify({ late, s2v: s2v && s2v.version }));
    const pl = await appPull();
    check('their edit after the restore applies without a conflict', (await status()).conflicts === 0 &&
      micro(disk(), M2).spots.find((s) => s.id === S2).name === 'theirs after restore', JSON.stringify(pl.summary));
    const stR2 = await sidecar.loadState(folder);
    check('the pull takes the restored states into the base', pl.changes.length === 1 &&
      stR2.restores.length === 0 && stR2.base[KM2] && stR2.base[`spot:${S1}`] && stR2.questions.length === 0, JSON.stringify(pl.summary));
    const pr2 = await push();
    const s2 = await onServer();
    check('then my edit pushes on the restored spot', pr2.ok && pr2.pushed === 1 && s2[KM2] && s2[`spot:${S1}`].body.name === 'edited by me',
      JSON.stringify(pr2));
    check('nothing waiting after the restore', (await status()).pending === 0 && (await status()).questions === 0);

    // --- My delete vs their edit: bring back with their changes --------------------------------
    const dropM2 = (p) => { p.datasets[0].samples[0].micrographs = p.datasets[0].samples[0].micrographs.filter((m) => m.id !== M2); };
    await appEdit(dropM2);
    await otherPush([{ op: 'update', type: 'spot', id: S2, baseVersion: await v('spot', S2), fields: { name: 'their spot name' } }]);
    // Sync Now pushes before it pulls: the delete must not take their edit beneath away
    const early = await push();
    check('my delete pushed before pulling is turned down (their edit beneath)', early.ok && early.conflicts === 1 &&
      (await onServer())[KM2] && (await onServer())[`spot:${S2}`].body.name === 'their spot name', JSON.stringify(early));
    await appPull();
    L = await svc.listDecisions(pid);
    const q1 = L.ok && L.questions[0];
    check('list: my delete as one question at the micrograph', L.ok && L.questions.length === 1 && q1.kind === 'mine_deleted' &&
      q1.key === KM2 && q1.theirChanges === 1 && q1.contains.spot === 3, JSON.stringify(L.questions));
    const b1 = await appDecide({ kind: 'question', key: KM2, answer: 'bring_back' });
    const m2back = micro(disk(), M2);
    check('bring back: the micrograph returns with their change', b1.ok && m2back && m2back.spots.length === 3 &&
      m2back.spots.find((s) => s.id === S2).name === 'their spot name', JSON.stringify(b1.changes.map((c) => c.key)));
    check('brought back: nothing waiting, no question', (await status()).pending === 0 && (await status()).questions === 0,
      JSON.stringify(await status()));

    // --- Turned down: held until edited, then discarded ---------------------------------------
    // M1 has M2 nested in it; moving it to another sample is not allowed
    const SAMPLE2 = crypto.randomUUID();
    await appEdit((p) => {
      const s0 = p.datasets[0].samples[0];
      const s2 = { ...JSON.parse(JSON.stringify(s0)), id: SAMPLE2, name: 'Second sample', label: 'Second sample', micrographs: [] };
      s2.micrographs.push(s0.micrographs.find((m) => m.id === M1));
      s0.micrographs = s0.micrographs.filter((m) => m.id !== M1);
      p.datasets[0].samples.push(s2);
    });
    const rf = await push();
    const stF = await sidecar.loadState(folder);
    check('the move is turned down and recorded with the entity as it was', rf.ok && rf.notAccepted === 1 && stF.refused.length === 1 &&
      stF.refused[0].key === KM1 && stF.refused[0].local && stF.refused[0].local.parentId === SAMPLE2, JSON.stringify(stF.refused));
    const rf2 = await push();
    const stF2 = await status();
    check('a turned-down change is not sent again', rf2.ok && rf2.pushed === 0 && rf2.notAccepted === 0 && stF2.refused === 1 &&
      stF2.pending === 0, JSON.stringify({ rf2, stF2 }));
    L = await svc.listDecisions(pid);
    check('list: the turned-down change with its reason', L.ok && L.refused.length === 1 && L.refused[0].key === KM1 &&
      L.refused[0].reason === 'parent_other_sample' && L.refused[0].op === 'update', JSON.stringify(L.refused));
    await appEdit((p) => { p.datasets[0].samples[1].micrographs[0].notes = 'edited after refusal'; });
    const rf3 = await push();
    check('an edit since sends it again (turned down again)', rf3.ok && rf3.notAccepted === 1, JSON.stringify(rf3));
    const dsc = await appDecide({ kind: 'refused', key: KM1, answer: 'discard' });
    const m1back = micro(disk(), M1);
    check('discard: back to the server\'s version, in its sample', dsc.ok && m1back && m1back.notes === 'their notes' &&
      disk().datasets[0].samples[1].micrographs.length === 0, JSON.stringify(dsc.changes.map((c) => c.key)));
    const rf4 = await push();
    check('discarded: nothing turned down, nothing waiting', rf4.ok && rf4.notAccepted === 0 && (await status()).refused === 0 &&
      (await status()).pending === 0, JSON.stringify({ rf4, st: await status() }));

    // --- Membership ids: their deleted tag leaves my new tagging (§4.5) -----------------------
    const TAG = crypto.randomUUID();
    const GROUP = crypto.randomUUID();
    await appEdit((p) => {
      p.tags = [...(p.tags || []), { id: TAG, name: 'Test tag', tagType: 'other' }];
      p.groups = [...(p.groups || []), { id: GROUP, name: 'Test group', micrographs: [M1, M2] }];
    });
    const pt = await push();
    check('tag and group pushed', pt.ok && pt.pushed >= 2 && (await onServer())[`tag:${TAG}`] && (await onServer())[`group:${GROUP}`], JSON.stringify(pt));
    await appEdit((p) => { micro(p, M2).spots.find((s) => s.id === S3).tags = [TAG]; });
    await otherPush([{ op: 'delete', type: 'tag', id: TAG, baseVersion: await v('tag', TAG) }]);
    await appPull();
    const s3 = micro(disk(), M2).spots.find((s) => s.id === S3);
    check('pull: their deleted tag is dropped from my spot', !(disk().tags || []).some((t) => t.id === TAG) && !(s3.tags || []).includes(TAG),
      JSON.stringify(s3.tags));
    const ptg = await push();
    check('the spot pushes without the tag', ptg.ok && ptg.notAccepted === 0 && !((await onServer())[`spot:${S3}`].body.tags || []).includes(TAG) &&
      (await status()).pending === 0, JSON.stringify(ptg));

    // --- Their delete vs my edit: delete it -----------------------------------------------------
    await appEdit((p) => { micro(p, M2).spots.find((s) => s.id === S2).name = 'mine again'; });
    await otherPush([{ op: 'delete', type: 'micrograph', id: M2, baseVersion: await v('micrograph', M2) }]);
    await appPull();
    const dl = await appDecide({ kind: 'question', key: KM2, answer: 'delete' });
    check('delete it: the micrograph and its spots go locally', dl.ok && !micro(disk(), M2) &&
      dl.changes.filter((c) => c.after === null).length === 4, JSON.stringify(dl.changes && dl.changes.map((c) => c.key)));
    check('delete it: the group no longer lists the micrograph', eq(disk().groups.find((g) => g.id === GROUP).micrographs, [M1]),
      JSON.stringify(disk().groups));
    const pd = await push();
    check('deleted: only the group pushes, nothing waiting', pd.ok && pd.pushed === 1 && pd.notAccepted === 0 && (await status()).pending === 0 &&
      !(await onServer())[KM2] && eq((await onServer())[`group:${GROUP}`].body.micrographs, [M1]), JSON.stringify(pd));

    // --- My delete vs their edit: keep deleted --------------------------------------------------
    await appEdit((p) => { p.datasets[0].samples[0].micrographs = p.datasets[0].samples[0].micrographs.filter((m) => m.id !== M1); });
    await otherPush([{ op: 'update', type: 'micrograph', id: M1, baseVersion: await v('micrograph', M1), fields: { name: 'their late rename' } }]);
    await appPull();
    check('my delete vs their rename: question', (await status()).questions === 1 && !micro(disk(), M1));
    const kd = await appDecide({ kind: 'question', key: KM1, answer: 'keep_deleted' });
    check('keep deleted: only the group drops the micrograph', kd.ok && kd.changes.length === 1 &&
      eq(disk().groups.find((g) => g.id === GROUP).micrographs, []), JSON.stringify(kd.changes));
    const pk = await push();
    check('keep deleted: the delete is pushed (with the sample\'s child order)', pk.ok && pk.pushed >= 1 && !(await onServer())[KM1] && (await status()).pending === 0,
      JSON.stringify(pk));

    // --- Dev test tools (Debug > Sync Test) ----------------------------------------------------
    const cmp1 = await svc.testCompare(pid, SERVER);
    check('compare: in sync after the last push', cmp1.ok && cmp1.differences.length === 0 && cmp1.same > 0, JSON.stringify(cmp1));
    const other1 = await svc.testOther(pid, SERVER, [{ op: 'update', type: 'sample', id: SAMPLE, fields: { label: 'relabeled by the other computer' } }]);
    check('other computer: versions from the server, accepted', other1.ok && other1.results[0].status === 'accepted', JSON.stringify(other1));
    const cmp2 = await svc.testCompare(pid, SERVER);
    check('compare: their unpulled rename shows as one difference', cmp2.ok && cmp2.differences.length === 1 &&
      cmp2.differences[0].startsWith('Different: sample') && cmp2.differences[0].includes('label'), JSON.stringify(cmp2));
    await appPull();
    const cmp3 = await svc.testCompare(pid, SERVER);
    check('compare: in sync again after the pull', cmp3.ok && cmp3.differences.length === 0, JSON.stringify(cmp3));
  } catch (e) {
    failures++;
    console.log('ERROR', e && e.stack);
  }
  try { fixture('cleanup'); } catch (_) { /* reported above */ }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} FAILED (${passes} passed)` : `\nALL PASSED (${passes} checks)`);
  app.exit(failures ? 1 : 0);
});
