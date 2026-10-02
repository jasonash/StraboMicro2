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
    await loginAs('editor');
    projectFolders.useProjectCopy(straboId, editorCopy2);
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
