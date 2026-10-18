/**
 * A login that runs out on its own (the server refuses the refresh token,
 * as after days away) is no longer silent. Found by Jason (2026-10-18): a
 * copy left open for days was logged out, its chip stayed green "Synced",
 * and a collaborator's edit never arrived, with nothing saying why. Now the
 * window marks itself logged out, the chip says "Log in to sync" (in Manual
 * mode too) and a bottom-left notice offers Log in; after the login the
 * waiting change arrives (Automatic) or is counted as incoming (Manual).
 */

import fs from 'fs';
import { test, expect } from '../lib/test';
import { ACCOUNTS, PASSWORD, type Copy } from '../lib/copy';
import { share, waitSettled, spotField, editSpot, syncChip, setMode, expireSession, sessionEndedNotice } from '../lib/actions';

async function waitLoggedOutBySession(copy: Copy): Promise<void> {
  await expect.poll(() => copy.state((e) => e.auth.getState().sessionEnded !== null), { timeout: 30_000 }).toBe(true);
  expect(await copy.state((e) => e.auth.getState().isAuthenticated)).toBe(false);
}

test('Automatic: the session runs out; the chip and a notice say so; Log in brings the waiting change', async ({ launch, project }) => {
  const p = await project('E2E Session Ended');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  await waitSettled(ben);

  await expireSession(ben);
  await editSpot(ana, spot.id, { name: 'After the login' });
  await waitSettled(ana);

  // Ben's copy finds out (a poll or the live notice's pull is refused) and says so
  await waitLoggedOutBySession(ben);
  await expect(syncChip(ben)).toContainText('Log in to sync', { timeout: 10_000 });
  const notice = sessionEndedNotice(ben);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(`Log in as ${ACCOUNTS.ben.email} to keep syncing this project`);
  expect(await spotField(ben, spot.id, 'name')).not.toBe('After the login');
  expect(fs.readFileSync(ben.logFile, 'utf8')).toContain('The session ended (refresh token refused)');

  // Log in from the notice: the notice goes, the chip is green again and Ana's change arrives
  await ben.caption('clicks Log in on the notice');
  await notice.getByRole('button', { name: 'Log in' }).click();
  const login = ben.page.getByRole('dialog', { name: 'Sign in to StraboSpot' });
  await expect(login.getByText(`Log in as ${ACCOUNTS.ben.email} to keep syncing this project.`)).toBeVisible();
  await login.getByLabel('Email').fill(ACCOUNTS.ben.email);
  await login.getByLabel('Password').fill(PASSWORD);
  await login.getByRole('button', { name: 'Sign In' }).click();
  await expect(login).toBeHidden({ timeout: 30_000 });
  await expect(notice).toBeHidden();
  await expect.poll(() => spotField(ben, spot.id, 'name'), { timeout: 30_000 }).toBe('After the login');
  await waitSettled(ben);
  await expect(syncChip(ben)).toContainText('Synced');
  expect(await ben.state((e) => e.auth.getState().sessionEnded)).toBe(null);

  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});

test('Manual: the session runs out; the chip says so too; closing the notice keeps the chip; a login counts what waits', async ({ launch, project }) => {
  const p = await project('E2E Session Ended Manual');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);
  await waitSettled(ben);
  await setMode(ben, 'Sync when I click');

  await expireSession(ben);
  await waitLoggedOutBySession(ben);
  // Manual mode says nothing about a plain logged-out state (16af); a session that ran out it does
  await expect(syncChip(ben)).toContainText('Log in to sync', { timeout: 10_000 });
  const notice = sessionEndedNotice(ben);
  await expect(notice).toBeVisible();
  await ben.caption('closes the notice');
  await notice.getByRole('button', { name: 'Close' }).click();
  await expect(notice).toBeHidden();
  await expect(syncChip(ben)).toContainText('Log in to sync');

  await editSpot(ana, spot.id, { name: 'Waiting for Ben' });
  await waitSettled(ana);
  await ben.login();
  await expect(syncChip(ben)).toContainText('Synced · 1 incoming', { timeout: 30_000 });
  expect(await spotField(ben, spot.id, 'name')).not.toBe('Waiting for Ben');

  expect(await ana.unansweredDialogs()).toEqual([]);
  expect(await ben.unansweredDialogs()).toEqual([]);
});
