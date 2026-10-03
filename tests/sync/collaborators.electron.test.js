/**
 * Test of collaborators through syncService (Phase 2 stage 2: sync:members,
 * sync:change-members, sync:invites, sync:answer-invite, and Open Remote
 * for a project shared with me) against the local dev server, with two
 * fixture accounts (owner@ and editor@test.strabospot.org, plus maya.chen@
 * for a decline). Also the 17b guard: a local-only copy with the id of a
 * project shared with me (a share-code copy) is never offered for linking.
 * Runs inside Electron with Documents and userData in a temporary folder.
 *
 *   npm run test:collaborators
 *
 * Needs the dev Docker stack with MICROSYNC_ENABLED and the server branch
 * with the membership endpoints. Server projects use the mscli- prefix and
 * are removed at the end (tests/microsync/client_fixture.php).
 */

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { applyEntityChanges } = require('../../electron/shared/entityModel.mjs');

const SERVER = 'http://localhost';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smcollab-'));
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

    const svc = require(`${E}/sync/syncService`);
    const projectFolders = require(`${E}/projectFolders`);
    const ser = require(`${E}/projectSerializer`);

    fixture('cleanup');
    const people = {
      owner: fixture('token'),
      editor: fixture('token', 'editor@test.strabospot.org'),
      maya: fixture('token', 'maya.chen@test.strabospot.org'),
    };
    const loginAs = async (who) => {
      const t = people[who];
      await tokenService.saveTokens(t.token, 'not-a-real-refresh-token', 3600, { pkey: String(t.pkey), email: t.email, name: who });
    };

    // The owner's synced project (no micrographs: membership needs none)
    await loginAs('owner');
    const straboId = `mscli-${crypto.randomUUID()}`;
    const local = path.join(projectFolders.getStraboMicro2DataPath(), straboId);
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'project.json'), JSON.stringify({ id: straboId, name: 'Collaborators test', datasets: [] }, null, 2));
    await ser.saveProjectJson(await ser.loadProjectJson(straboId), straboId);
    const on = await svc.turnOn(straboId, SERVER, 'automatic');
    const pushed = on.ok ? await svc.push(straboId, SERVER, () => {}) : on;
    check('owner: project synced and ready', on.ok && pushed.ok && pushed.ready, JSON.stringify({ on, pushed }));
    const serverPid = on.pid;

    // The owner's side of the Collaborators dialog
    let m = await svc.members(straboId, SERVER);
    check('owner: member list, I am the owner', m.ok && m.myRole === 'owner' && m.members.length === 1 &&
      m.members[0].user.pkey === people.owner.pkey, JSON.stringify(m));
    let r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.editor.email, role: 'contributor' });
    check('owner: invite -> invited, emailed', r.ok && r.status === 'invited' && r.emailed === true, JSON.stringify(r));
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: `nobody-${crypto.randomUUID()}@test.strabospot.org`, role: 'viewer' });
    check('owner: unknown email -> no_account with the agreed wording', !r.ok && r.kind === 'no_account' &&
      r.message.includes('Ask them to create one'), JSON.stringify(r));
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.owner.email, role: 'viewer' });
    check('owner: inviting myself refused with a message', !r.ok && r.kind === 'self' && r.message.length > 0, JSON.stringify(r));
    m = await svc.members(straboId, SERVER);
    const invited = m.ok && m.members.find((x) => x.user.pkey === people.editor.pkey);
    check('owner: the editor is listed as invited Contributor', invited && invited.state === 'invited' && invited.role === 'contributor', JSON.stringify(m));
    r = await svc.changeMembers(straboId, SERVER, { action: 'role', pkey: people.editor.pkey, role: 'editor' });
    check('owner: role of a pending invitation changes', r.ok && r.member.role === 'editor', JSON.stringify(r));
    check('owner: a local-only project has no members to show', (await svc.members('not-a-project', SERVER)).kind === 'not_synced');

    // The invitee already has a share-code copy with the same id (made before 17b)
    await loginAs('editor');
    const shareCopy = path.join(projectFolders.getStraboMicro2DataPath(), straboId);
    const ownerCopy = projectFolders.getAccountCopyPath(straboId, SERVER, people.owner.pkey);
    check('owner copy is in the owner\'s account folder', fs.existsSync(path.join(ownerCopy, 'project.json')));
    fs.mkdirSync(shareCopy, { recursive: true });
    fs.writeFileSync(path.join(shareCopy, 'project.json'), JSON.stringify({ id: straboId, name: 'Share-code copy', datasets: [] }, null, 2));

    check('invitee: the owner\'s copy is not mine to manage (account binding)', (await svc.members(straboId, SERVER)).ok === false);
    let inv = await svc.invites(SERVER);
    const mine = inv.ok && inv.invitations.find((i) => i.pid === serverPid);
    check('invitee: the invitation is listed (role, name, from)', mine && mine.role === 'editor' && mine.name === 'Collaborators test' &&
      mine.invitedBy && mine.invitedBy.pkey === people.owner.pkey, JSON.stringify(inv));
    let list = await svc.listServerProjects(SERVER);
    check('invitee: not in Open Remote before accepting', list.ok && !list.projects.some((p) => p.pid === serverPid));
    r = await svc.answerInvite(SERVER, serverPid, true);
    check('invitee: accept -> what the download needs', r.ok && r.straboId === straboId && r.role === 'editor', JSON.stringify(r));
    inv = await svc.invites(SERVER);
    check('invitee: accepted invitation leaves the list', inv.ok && !inv.invitations.some((i) => i.pid === serverPid));
    list = await svc.listServerProjects(SERVER);
    const row = list.ok && list.projects.find((p) => p.pid === serverPid);
    check('invitee: shared project in Open Remote, owner named, NOT matched to the share-code copy (17b)',
      row && row.role === 'editor' && row.owner && row.owner.pkey === people.owner.pkey && row.here === null, JSON.stringify(row));
    // On the invitee's computer the id means the share-code copy (the owner's
    // copy is here only because both accounts share this test computer)
    projectFolders.forgetProjectCopy(straboId);
    check('invitee: the id resolves to the share-code copy', projectFolders.getProjectFolderPath(straboId) === shareCopy);
    const prompt = await svc.serverProject(straboId, SERVER);
    check('invitee: no one-time link prompt for the share-code copy (17b)', prompt.ok && prompt.row === null, JSON.stringify(prompt));

    const opened = await svc.openRemote(serverPid, SERVER, 'automatic', () => {});
    const editorCopy = projectFolders.getAccountCopyPath(straboId, SERVER, people.editor.pkey);
    check('invitee: download makes a synced copy in my account folder', opened.ok && opened.projectId === straboId &&
      fs.existsSync(path.join(editorCopy, 'sync', 'state.json')), JSON.stringify(opened));
    const kept = JSON.parse(fs.readFileSync(path.join(shareCopy, 'project.json'), 'utf8'));
    check('invitee: the share-code copy is untouched', kept.name === 'Share-code copy' && !fs.existsSync(path.join(shareCopy, 'sync')));
    m = await svc.members(straboId, SERVER);
    check('invitee: member list from my synced copy, I am an Editor', m.ok && m.myRole === 'editor' && m.members.length === 2, JSON.stringify(m));
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.maya.email, role: 'viewer' });
    check('invitee: an Editor cannot invite', !r.ok && r.kind === 'forbidden', JSON.stringify(r));

    // Role checks need my role and who created what (17h, 17i)
    let perms = await svc.permissions(straboId);
    check('invitee: creators from the snapshot (the owner made the project)', perms.ok &&
      perms.authors[`project:${straboId}`] === people.owner.pkey && perms.me === people.editor.pkey, JSON.stringify(perms));
    const act = await svc.activity(straboId, SERVER);
    check('invitee: the activity poll tells my role', act.ok && act.role === 'editor', JSON.stringify(act));
    perms = await svc.permissions(straboId);
    check('invitee: my role is kept for opening offline', perms.ok && perms.role === 'editor', JSON.stringify(perms));

    // The owner adds a dataset; the invitee's pull records who made it
    const editorCopy2 = projectFolders.getAccountCopyPath(straboId, SERVER, people.editor.pkey);
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    const ownerProject = await ser.loadProjectJson(straboId);
    ownerProject.datasets = [...(ownerProject.datasets || []), { id: 'D-owner', name: 'Owner dataset', samples: [] }];
    await ser.saveProjectJson(ownerProject, straboId);
    const ownerPush = await svc.push(straboId, SERVER, () => {});
    check('owner: dataset pushed', ownerPush.ok && ownerPush.pushed >= 1, JSON.stringify(ownerPush));
    let hist = await svc.history(straboId, SERVER);
    const mineHere = hist.ok && hist.changes.find((c) => c.type === 'dataset' && c.id === 'D-owner');
    check('activity (owner): my own change from here is not pending, newest first', mineHere && mineHere.here === true &&
      mineHere.pending === false && hist.changes[0].seq >= mineHere.seq && hist.me === people.owner.pkey,
      JSON.stringify(hist).slice(0, 400));
    await loginAs('editor');
    projectFolders.useProjectCopy(straboId, editorCopy2);
    hist = await svc.history(straboId, SERVER);
    let theirs = hist.ok && hist.changes.find((c) => c.type === 'dataset' && c.id === 'D-owner');
    check('activity (member): the owner\'s new dataset is listed as not in my copy yet, with name and who', theirs &&
      theirs.pending === true && theirs.here === false && theirs.op === 'create' && theirs.name === 'Owner dataset' &&
      theirs.user.pkey === people.owner.pkey && !('body' in theirs), JSON.stringify(theirs));
    const pulled = await svc.pull(straboId, SERVER, () => {});
    if (pulled.ok) {
      const appProject = await ser.loadProjectJson(straboId);
      applyEntityChanges(appProject, pulled.changes, 'redo');
      await ser.saveProjectJson(appProject, straboId);
      await svc.commitPull(straboId, pulled.pullId);
    }
    perms = await svc.permissions(straboId);
    check('invitee: a pulled create records its creator', pulled.ok && perms.ok && perms.authors['dataset:D-owner'] === people.owner.pkey,
      JSON.stringify({ pulled: pulled.ok, authors: perms.authors }));
    hist = await svc.history(straboId, SERVER);
    theirs = hist.ok && hist.changes.find((c) => c.type === 'dataset' && c.id === 'D-owner');
    check('activity (member): after the pull it is in my copy', theirs && theirs.pending === false, JSON.stringify(theirs));
    const afterPull = await svc.getStatus(straboId);
    check('a pulled dataset saved here is not a new edit (its time is kept, nothing to push)', afterPull.synced && afterPull.pending === 0,
      JSON.stringify(afterPull));

    // Decline, and the owner's role change and removal
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.maya.email, role: 'viewer' });
    check('owner: invite a second person', r.ok, JSON.stringify(r));
    await loginAs('maya');
    r = await svc.answerInvite(SERVER, serverPid, false);
    check('second person declines', r.ok && r.status === 'declined', JSON.stringify(r));
    r = await svc.answerInvite(SERVER, serverPid, true);
    check('a declined invitation cannot be accepted', !r.ok && r.kind === 'not_found', JSON.stringify(r));
    await loginAs('owner');
    m = await svc.members(straboId, SERVER);
    check('owner sees the declined invitation', m.ok && m.members.some((x) => x.user.pkey === people.maya.pkey && x.state === 'declined'), JSON.stringify(m));
    r = await svc.changeMembers(straboId, SERVER, { action: 'role', pkey: people.editor.pkey, role: 'viewer' });
    check('owner: editor becomes a viewer', r.ok && r.member.role === 'viewer', JSON.stringify(r));
    r = await svc.changeMembers(straboId, SERVER, { action: 'remove', pkey: people.editor.pkey });
    check('owner: remove the member', r.ok && r.status === 'removed', JSON.stringify(r));
    m = await svc.members(straboId, SERVER);
    check('owner: removed member gone from the list', m.ok && !m.members.some((x) => x.user.pkey === people.editor.pkey), JSON.stringify(m));

    // Removed, invited again, accepted: the synced copy still on that computer is used, not refused
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.editor.email, role: 'viewer' });
    check('owner: the removed member invited again', r.ok && r.status === 'invited', JSON.stringify(r));
    await loginAs('editor');
    r = await svc.answerInvite(SERVER, serverPid, true);
    check('invitee: accepts again', r.ok && r.role === 'viewer', JSON.stringify(r));
    const again = await svc.openRemote(serverPid, SERVER, 'automatic', () => {});
    check('invitee: the synced copy already here is used (no "already has a synced copy" error)',
      again.ok && again.existing === true && again.projectId === straboId, JSON.stringify(again));
    check('invitee: the id now resolves to that copy', projectFolders.getProjectFolderPath(straboId) === editorCopy2);

    // Stage 4 (17j, 17k). Edit the owner's dataset in the editor's copy and push
    const editDataset = async (name) => {
      const p = await ser.loadProjectJson(straboId);
      const d = (p.datasets || []).find((x) => x.id === 'D-owner');
      d.name = name;
      await ser.saveProjectJson(p, straboId);
      return svc.push(straboId, SERVER, () => {});
    };
    // A downgrade parks what the new role refuses (owner: viewer -> contributor counts as a role change)
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    r = await svc.changeMembers(straboId, SERVER, { action: 'role', pkey: people.editor.pkey, role: 'contributor' });
    check('owner: the member becomes a Contributor', r.ok && r.member.role === 'contributor', JSON.stringify(r));
    await loginAs('editor');
    projectFolders.useProjectCopy(straboId, editorCopy2);
    let p4 = await editDataset('Renamed by a Contributor');
    check('member: an edit of someone else\'s item is turned down', p4.ok && p4.notAccepted === 1, JSON.stringify(p4));
    let dec = await svc.listDecisions(straboId);
    const parkedItem = dec.ok && dec.refused.find((x) => x.reason === 'contributor_not_creator');
    check('member: the turned-down change says it was sent to the owner (parked)', parkedItem && parkedItem.parked === true,
      JSON.stringify(dec));

    // Removed with unsynced work: the next push is parked, the poll says removed, by whom
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    r = await svc.changeMembers(straboId, SERVER, { action: 'remove', pkey: people.editor.pkey });
    check('owner: remove the member again', r.ok, JSON.stringify(r));
    await loginAs('editor');
    projectFolders.useProjectCopy(straboId, editorCopy2);
    const appProject4 = await ser.loadProjectJson(straboId);
    // With a new micrograph: its image goes up first and is refused (access_removed),
    // the entity changes must still go up to be parked (found in stage 5c testing)
    appProject4.datasets = [...appProject4.datasets, { id: 'D-mine', name: 'Mine', samples: [
      { id: 'S-mine', name: 'My sample', micrographs: [{ id: 'M-mine', name: 'My micrograph', imageWidth: 10, imageHeight: 10 }] },
    ] }];
    await ser.saveProjectJson(appProject4, straboId);
    fs.mkdirSync(path.join(editorCopy2, 'images'), { recursive: true });
    fs.writeFileSync(path.join(editorCopy2, 'images', 'M-mine'), crypto.randomBytes(2048));
    p4 = await svc.push(straboId, SERVER, () => {});
    check('removed: the push is parked for the owner (access_removed, parked, removed by the owner)', !p4.ok &&
      p4.kind === 'access_removed' && p4.removal && p4.removal.parked === true && p4.removal.left === false &&
      p4.removal.removedBy && p4.removal.removedBy.pkey === people.owner.pkey && p4.removal.removedBy.name !== '' &&
      p4.removal.projectName === 'Collaborators test', JSON.stringify(p4));
    const act4 = await svc.activity(straboId, SERVER);
    check('removed: the activity poll says removed (not a plain failure)', !act4.ok && act4.kind === 'access_removed' &&
      act4.removal.parked === false && act4.removal.left === false, JSON.stringify(act4));
    const sep = await svc.separate(straboId);
    const sepFolder = sep.ok ? path.join(projectFolders.getStraboMicro2DataPath(), sep.projectId) : '';
    const sepJson = sep.ok ? JSON.parse(fs.readFileSync(path.join(sepFolder, 'project.json'), 'utf8')) : null;
    check('removed: the copy becomes separate (new id, my unsynced dataset kept, no sync state)', sep.ok &&
      sep.projectId !== straboId && !fs.existsSync(editorCopy2) && !fs.existsSync(path.join(sepFolder, 'sync')) &&
      sepJson.id === sep.projectId && sepJson.datasets.some((d) => d.id === 'D-mine'), JSON.stringify(sep));
    check('removed: a separate copy is not synced', (await svc.separate(sep.projectId)).kind === 'not_synced');

    // Leaving (17j): a member leaves; the server answers as left
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    r = await svc.changeMembers(straboId, SERVER, { action: 'invite', email: people.maya.email, role: 'contributor' });
    check('owner: invite someone who will leave', r.ok, JSON.stringify(r));
    await loginAs('maya');
    r = await svc.answerInvite(SERVER, serverPid, true);
    const mayaOpen = r.ok ? await svc.openRemote(serverPid, SERVER, 'automatic', () => {}) : r;
    const mayaCopy = projectFolders.getAccountCopyPath(straboId, SERVER, people.maya.pkey);
    check('member: joined with a synced copy', mayaOpen.ok && fs.existsSync(path.join(mayaCopy, 'sync', 'state.json')), JSON.stringify(mayaOpen));
    projectFolders.useProjectCopy(straboId, mayaCopy);
    r = await svc.leave(straboId, SERVER);
    check('member: leave -> left', r.ok && r.status === 'left', JSON.stringify(r));
    const act5 = await svc.activity(straboId, SERVER);
    check('member: afterwards the poll says I left (no one named)', !act5.ok && act5.kind === 'access_removed' &&
      act5.removal.left === true && act5.removal.removedBy === null, JSON.stringify(act5));
    await loginAs('owner');
    projectFolders.useProjectCopy(straboId, ownerCopy);
    r = await svc.leave(straboId, SERVER);
    check('owner: cannot leave (transfer first)', !r.ok && r.kind === 'owner_must_transfer', JSON.stringify(r));

    // The owner's review of parked changes (17o, 17x, 17y)
    const pk = await svc.parked(straboId, SERVER);
    const roleParked = pk.ok && pk.parked.find((x) => x.reason === 'role_changed' && x.user.pkey === people.editor.pkey);
    const removedParked = pk.ok && pk.parked.find((x) => x.reason === 'removed' && x.user.pkey === people.editor.pkey);
    check('owner: both parked pushes listed (role change: the rename; removal: the new dataset)', roleParked && removedParked &&
      roleParked.changes.some((c) => c.id === 'D-owner' && c.fields && c.fields.name === 'Renamed by a Contributor') &&
      removedParked.changes.some((c) => c.op === 'create' && c.id === 'D-mine') &&
      removedParked.changes.some((c) => c.op === 'create' && c.type === 'micrograph' && c.id === 'M-mine'), JSON.stringify(pk).slice(0, 600));
    // Accept the rename as the app does: apply it to my project, mark it, push
    let own = await ser.loadProjectJson(straboId);
    own.datasets.find((d) => d.id === 'D-owner').name = 'Renamed by a Contributor';
    await ser.saveProjectJson(own, straboId);
    r = await svc.reviewParked(straboId, SERVER, roleParked.id, { 'dataset:D-owner': 'accepted' }, people.editor.pkey);
    check('owner: accepting the only item settles it', r.ok && r.status === 'accepted' && r.left === 0, JSON.stringify(r));
    r = await svc.push(straboId, SERVER, () => {});
    hist = await svc.history(straboId, SERVER);
    const accepted = hist.ok && hist.changes.find((c) => c.id === 'D-owner' && c.op === 'update');
    check('owner: the accepted change is logged as mine, on behalf of the member', r.ok && accepted &&
      accepted.user.pkey === people.owner.pkey && accepted.onBehalfOf && accepted.onBehalfOf.pkey === people.editor.pkey,
      JSON.stringify(accepted));
    const st5 = await require(`${E}/sync/sidecar`).loadState(ownerCopy);
    check('owner: the on-behalf mark is gone once it is up', !st5.onBehalf || !st5.onBehalf['dataset:D-owner'], JSON.stringify(st5.onBehalf));
    const decisions = Object.fromEntries(removedParked.changes.map((c) => [`${c.type}:${c.id}`, 'discarded']));
    r = await svc.reviewParked(straboId, SERVER, removedParked.id, decisions, people.editor.pkey);
    check('owner: discarding everything settles the removal', r.ok && r.status === 'discarded', JSON.stringify(r));
    const pk2 = await svc.parked(straboId, SERVER);
    check('owner: nothing left to review', pk2.ok && pk2.parked.length === 0, JSON.stringify(pk2).slice(0, 300));
    const act6 = await svc.activity(straboId, SERVER);
    check('owner: the poll counts none waiting', act6.ok && act6.parkedCount === 0, JSON.stringify(act6));

    // Restore from the activity panel (17n): the restore goes up, the next pull brings the items back
    const pullApply = async () => {
      const pl = await svc.pull(straboId, SERVER, () => {});
      if (!pl.ok) return pl;
      const proj = await ser.loadProjectJson(straboId);
      applyEntityChanges(proj, pl.changes, 'redo');
      await ser.saveProjectJson(proj, straboId);
      return svc.commitPull(straboId, pl.pullId);
    };
    let op = await ser.loadProjectJson(straboId);
    op.datasets = [...op.datasets, { id: 'D-gone', name: 'Soon gone', samples: [{ id: 'SMP-gone', name: 'Inside', micrographs: [] }] }];
    await ser.saveProjectJson(op, straboId);
    r = await svc.push(straboId, SERVER, () => {});
    op = await ser.loadProjectJson(straboId);
    op.datasets = op.datasets.filter((d) => d.id !== 'D-gone');
    await ser.saveProjectJson(op, straboId);
    r = r.ok ? await svc.push(straboId, SERVER, () => {}) : r;
    check('owner: a dataset with a sample made and deleted', r.ok, JSON.stringify(r));
    hist = await svc.history(straboId, SERVER);
    const delRow = hist.ok && hist.changes.find((c) => c.op === 'delete' && c.id === 'D-gone');
    check('activity: the delete is listed with its name', delRow && delRow.name === 'Soon gone', JSON.stringify(delRow));
    r = await svc.restoreDeleted(straboId, SERVER, [{ type: 'dataset', id: 'D-gone' }]);
    check('restore: accepted', r.ok && r.results.length === 1 && r.results[0].ok === true, JSON.stringify(r));
    r = await pullApply();
    op = await ser.loadProjectJson(straboId);
    const back = op.datasets.find((d) => d.id === 'D-gone');
    check('restore: the next pull brings the dataset back with its sample', r.ok && back && back.samples.some((x) => x.id === 'SMP-gone'),
      JSON.stringify({ r, back }));
    r = await svc.restoreDeleted(straboId, SERVER, [{ type: 'dataset', id: 'D-gone' }]);
    check('restore again: counts as restored (not_deleted)', r.ok && r.results[0].ok === true && r.results[0].reason === 'not_deleted', JSON.stringify(r));
  } catch (err) {
    failures++;
    console.log(`  FAIL  unexpected error: ${err && err.stack ? err.stack : err}`);
  } finally {
    try {
      fixture('cleanup');
    } catch (_) { /* reported by the next run's cleanup */ }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`} (${passes} checks passed)`);
    app.exit(failures === 0 ? 0 : 1);
  }
});
