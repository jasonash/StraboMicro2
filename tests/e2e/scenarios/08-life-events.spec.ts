/**
 * Life events around sync: the app quits in the middle of a sync and starts
 * again, logging out with changes not synced yet (16as), the same account
 * on two computers (also a new micrograph's image: its file refs once
 * counted as the other computer's own, found on prod 2026-10-05), and a
 * local-only copy (an exported .smz) opened on a
 * computer while the project is on StraboSpot (linking, 16an, 16am). And
 * changing the server in Preferences: a login belongs to one server (found
 * 2026-10-05: main kept the old server's account, so the new server's copy
 * would not open until a restart).
 */

import { test, expect } from '../lib/test';
import fs from 'fs';
import { ACCOUNTS, PASSWORD, SERVER, type Account, type Copy } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import {
  share, waitSettled, spotField, editSpot, addSpot, setOffline, setMode, openSmz, turnOnSync, downloadRemote, syncChip,
  exportSmz, clickAccount, logoutDialog, waitLoggedOut, answerAlsoOnStraboSpot, waitSynced, openActivity, activityLine,
  addReferenceMicrograph, micrograph, waitImageArrived, viewMicrograph, holdFileRefs, releaseFileRefs,
} from '../lib/actions';
import { changeCount, serverField } from '../lib/server';

/** Start a copy again after it quit: same computer (its own userData and Documents), the project it had open */
async function restart(launch: (label: string, account: Account, opts?: { login?: boolean }) => Promise<Copy>,
  copy: Copy, projectId: string): Promise<Copy> {
  await copy.caption('quits the app');
  await copy.close();
  const again = await launch(copy.label, copy.account, { login: false });
  await again.caption('starts the app again');
  await expect.poll(() => again.state((e) => e.app.getState().project?.id ?? null), { timeout: 60_000 }).toBe(projectId);
  if (!(await again.state((e) => e.auth.getState().isAuthenticated))) await again.login();
  return again;
}

test('a push that reached StraboSpot but whose answer was lost is sent again after a restart, and counted once', async ({ launch, project }) => {
  const p = await project('E2E Restart Lost Reply');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  let ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true, 'lost-reply');
  await editSpot(ben, spot.id, { notes: 'Sent, answer lost' });
  const added = await addSpot(ben, p.micrographId, 'Added, answer lost');
  // StraboSpot has both (Ana gets them); Ben never heard back
  await expect.poll(() => spotField(ana, spot.id, 'notes'), { timeout: 60_000 }).toBe('Sent, answer lost');
  await expect.poll(() => spotField(ana, added, 'name'), { timeout: 60_000 }).toBe('Added, answer lost');
  await expect.poll(() => ben.state((e) => e.sync.getState().problem?.kind ?? null), { timeout: 30_000 }).toBe('offline');

  ben = await restart(launch, ben, p.id);
  await waitSettled(ben, 120_000);
  expect(await spotField(ben, spot.id, 'notes')).toBe('Sent, answer lost');
  expect(changeCount(p.id, 'spot', spot.id, 'update')).toBe(1);
  expect(changeCount(p.id, 'spot', added, 'create')).toBe(1);
  expect(changeCount(p.id, 'spot', added, 'update')).toBe(0);
  expect(await ben.state((e) => {
    const s = e.sync.getState();
    return s.conflicts + s.questions + s.refused;
  })).toBe(0);

  // And sync carries on both ways
  await editSpot(ana, spot.id, { name: 'After the restart' });
  await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 60_000 }).toBe('After the restart');
});

test('a change made offline goes up when the app starts again online', async ({ launch, project }) => {
  const p = await project('E2E Restart Offline');
  const spot = p.spots[1];
  const ana = await launch('Ana', ACCOUNTS.ana);
  let ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true);
  await editSpot(ben, spot.id, { name: 'Made offline' });
  await expect(syncChip(ben)).toHaveText(/^Offline/, { timeout: 30_000 });

  ben = await restart(launch, ben, p.id);
  await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 60_000 }).toBe('Made offline');
  await waitSettled(ben, 120_000);
  expect(changeCount(p.id, 'spot', spot.id, 'update')).toBe(1);
});

test("logging out with changes not synced: 'Sync and log out' sends them first", async ({ launch, project }) => {
  const p = await project('E2E Logout Sync');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana, 'Sync when I click');
  await waitSettled(ana);

  await editSpot(ana, spot.id, { name: 'Sent at logout' });
  await clickAccount(ana);
  const dialog = logoutDialog(ana);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`You have 1 change in ${p.name} not yet synced.`);
  await expect(dialog).toContainText('If you log out anyway, they stay on this computer and sync the next time you log in as Ana.');
  await ana.caption('Sync and log out');
  await dialog.getByRole('button', { name: 'Sync and log out' }).click();
  await waitLoggedOut(ana);
  expect(serverField(p.id, 'spot', spot.id, 'name')).toBe('Sent at logout');
});

test("logging out anyway keeps the changes, and they sync at the next login", async ({ launch, project }) => {
  const p = await project('E2E Logout Anyway');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana, 'Sync when I click');
  await waitSettled(ana);

  await editSpot(ana, spot.id, { name: 'Kept through logout' });
  await clickAccount(ana);
  await ana.caption('Log out anyway');
  await logoutDialog(ana).getByRole('button', { name: 'Log out anyway' }).click();
  await waitLoggedOut(ana);
  expect(serverField(p.id, 'spot', spot.id, 'name')).not.toBe('Kept through logout');
  expect(await spotField(ana, spot.id, 'name')).toBe('Kept through logout');

  await ana.login();
  await setMode(ana, 'Sync automatically');
  await expect.poll(() => serverField(p.id, 'spot', spot.id, 'name'), { timeout: 60_000 }).toBe('Kept through logout');
});

test("Account > Logout asks the same question when changes are not synced", async ({ launch, project }) => {
  const p = await project('E2E Logout Menu');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana, 'Sync when I click');
  await waitSettled(ana);

  await editSpot(ana, spot.id, { name: 'Logout from the menu' });
  await ana.menu('Account', 'Logout');
  const dialog = logoutDialog(ana);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await ana.caption('Cancel');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await ana.state((e) => e.auth.getState().isAuthenticated)).toBe(true);

  await ana.menu('Account', 'Logout');
  await ana.caption('Sync and log out');
  await dialog.getByRole('button', { name: 'Sync and log out' }).click();
  await waitLoggedOut(ana);
  expect(serverField(p.id, 'spot', spot.id, 'name')).toBe('Logout from the menu');
});

test('Account > Logout with everything synced logs out at once', async ({ launch, project }) => {
  const p = await project('E2E Logout Menu Synced');
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await ana.menu('Account', 'Logout');
  await waitLoggedOut(ana);
  await expect(logoutDialog(ana)).toHaveCount(0);
});

test('the same account on two computers: changes go both ways, and Activity counts the other computer as "You"', async ({ launch, project }) => {
  const p = await project('E2E Two Computers');
  const [garnet, quartz] = p.spots;
  const ana = await launch('Ana', ACCOUNTS.ana);
  const laptop = await launch('Ana laptop', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await downloadRemote(laptop, p.name, p.id);

  await editSpot(ana, garnet.id, { notes: 'From the desktop' });
  await editSpot(laptop, quartz.id, { notes: 'From the laptop' });
  await expect.poll(() => spotField(laptop, garnet.id, 'notes'), { timeout: 60_000 }).toBe('From the desktop');
  await expect.poll(() => spotField(ana, quartz.id, 'notes'), { timeout: 60_000 }).toBe('From the laptop');
  await waitSettled(ana);
  await waitSettled(laptop);

  // One account, one burst (17v): the laptop's change joins the desktop's own
  const panel = await openActivity(ana);
  await expect(activityLine(ana, "You changed 2 spots on micrograph 'Overview'")).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(/^Ana Ruiz /)).toHaveCount(0);
});

test("the same account on two computers: a new micrograph's image reaches the other computer", async ({ launch, project, runDir }) => {
  const p = await project('E2E Two Computers Image');
  const img = await writeImage(`${runDir}/images/two-computers.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const laptop = await launch('Ana laptop', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  await downloadRemote(laptop, p.name, p.id);

  // The micrograph arrives in one push, its image in file refs after the
  // upload; held here so the desktop pulls the micrograph first, as on prod
  await holdFileRefs(laptop);
  const id = await addReferenceMicrograph(laptop, 'TX-01', img, 'From the laptop');
  await expect.poll(async () => (await micrograph(ana, id))?.name ?? null, { timeout: 60_000 }).toBe('From the laptop');
  await waitSettled(ana);
  await releaseFileRefs(laptop);
  await waitSettled(laptop, 120_000);
  await waitImageArrived(ana, id);
  await ana.caption("opens the laptop's new micrograph");
  await viewMicrograph(ana, id);
});

test('an exported copy opened on another computer links to StraboSpot at once when nothing differs', async ({ launch, project, runDir }) => {
  const p = await project('E2E Link Identical');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);
  const exported = `${runDir}/exports/identical.smz`;
  await exportSmz(ana, exported);
  // The laptop starts after the upload: it keeps its list of Ana's server
  // projects for 5 minutes, so a laptop already running would not know yet
  const laptop = await launch('Ana laptop', ACCOUNTS.ana);

  await openSmz(laptop, exported, p.id);
  await answerAlsoOnStraboSpot(laptop, 'Sync automatically');
  await expect(laptop.page.getByRole('dialog', { name: 'This copy differs from the one on StraboSpot' })).toHaveCount(0);
  await waitSynced(laptop, p.id);

  await editSpot(laptop, spot.id, { name: 'Linked laptop edit' });
  await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 60_000 }).toBe('Linked laptop edit');
});

for (const use of ['Use the StraboSpot copy', 'Use my copy'] as const) {
  test(`an exported copy that differs from StraboSpot: '${use}'`, async ({ launch, project, runDir }) => {
    const p = await project(`E2E Link ${use === 'Use my copy' ? 'Mine' : 'Theirs'}`);
    const spot = p.spots[0];
    const ana = await launch('Ana', ACCOUNTS.ana);
    await openSmz(ana, p.smzPath, p.id);
    await turnOnSync(ana);
    await waitSettled(ana);
    const exported = `${runDir}/exports/older.smz`;
    await exportSmz(ana, exported);
    // StraboSpot moves on after the export
    await editSpot(ana, spot.id, { name: 'Changed after the export' });
    await waitSettled(ana);
    const laptop = await launch('Ana laptop', ACCOUNTS.ana);

    await openSmz(laptop, exported, p.id);
    await answerAlsoOnStraboSpot(laptop, 'Sync automatically');
    const differs = laptop.page.getByRole('dialog', { name: 'This copy differs from the one on StraboSpot' });
    await expect(differs).toBeVisible({ timeout: 60_000 });
    await laptop.caption(use);
    await differs.getByRole('button', { name: use, exact: true }).click();
    await waitSynced(laptop, p.id);

    const expected = use === 'Use my copy' ? 'Garnet 1' : 'Changed after the export';
    expect(await spotField(laptop, spot.id, 'name')).toBe(expected);
    await expect.poll(() => spotField(ana, spot.id, 'name'), { timeout: 60_000 }).toBe(expected);
    expect(serverField(p.id, 'spot', spot.id, 'name')).toBe(expected);
  });
}

test("changing the server in Preferences logs out of the old one; the new server's copy opens and syncs", async ({ launch, project }) => {
  // The dev server under another name: another server to the app
  const other = SERVER.replace('://localhost', '://127.0.0.1');
  test.skip(other === SERVER, 'needs STRABO_E2E_SERVER on localhost');
  const p = await project('E2E Change Server');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);

  await ana.menu('File', 'Preferences...');
  const prefs = ana.page.getByRole('dialog', { name: 'Preferences' });
  await prefs.getByLabel('Server URL').fill(other);
  await expect(prefs.getByText(`Saving logs you out of ${SERVER}. You can then log in to ${other}.`)).toBeVisible();
  await ana.caption(`sets the server to ${other}`);
  await prefs.getByRole('button', { name: 'Save' }).click();
  const login = ana.page.getByRole('dialog', { name: 'Sign in to StraboSpot' });
  await expect(login.getByText(`Log in to ${other}.`)).toBeVisible({ timeout: 30_000 });
  expect(await ana.state((e) => e.auth.getState().isAuthenticated)).toBe(false);
  await login.getByLabel('Email').fill(ACCOUNTS.ana.email);
  await login.getByLabel('Password').fill(PASSWORD);
  await ana.caption(`signs in to ${other}`);
  await login.getByRole('button', { name: 'Sign In' }).click();
  await expect(login).toBeHidden({ timeout: 30_000 });

  // The open copy is the old server's (16ax), the new server's copy opens and syncs
  const owner = ana.page.getByRole('dialog', { name: 'This copy syncs with another server' });
  await expect(owner).toBeVisible({ timeout: 30_000 });
  await owner.getByRole('button', { name: 'Close project' }).click();
  await downloadRemote(ana, p.name, p.id);
  await editSpot(ana, spot.id, { notes: `Through ${other}` });
  await waitSettled(ana);
  expect(serverField(p.id, 'spot', spot.id, 'notes')).toBe(`Through ${other}`);

  // Started again, the app is set to the old server (e2e launch) and the
  // saved login is the new server's: logged out
  await ana.caption('quits the app');
  await ana.close();
  const again = await launch('Ana', ACCOUNTS.ana, { login: false });
  await expect.poll(() => fs.readFileSync(again.logFile, 'utf8').includes(`The saved login is for ${other}`), { timeout: 30_000 }).toBe(true);
  expect(await again.state((e) => e.auth.getState().isAuthenticated)).toBe(false);
});
