/**
 * A bad connection while downloading a project and logging in (found in the
 * gap 4 test with a real 40-micrograph project on prod, 2026-10-05): the
 * download sat on a spinner that could not be closed until the network came
 * back, then said 'failed' with half the project already here; the login
 * said 'fetch failed'.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import {
  openSmz, turnOnSync, waitSettled, setOffline, holdDownloads, releaseDownloads, dropHeldDownloads, waitImageArrived,
  viewMicrograph,
} from '../lib/actions';

test('a download that loses the connection opens the project, and its files arrive once the connection is back', async ({ launch, project }) => {
  const p = await project('E2E Download Interrupted');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const laptop = await launch('Ana laptop', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);

  await holdDownloads(laptop);
  await laptop.menu('File', 'Open Remote Project...');
  const dialog = laptop.page.getByRole('dialog', { name: 'Open Remote Project' });
  const row = dialog.getByRole('listitem').filter({ hasText: p.name });
  await row.getByRole('button', { name: 'Download' }).click({ timeout: 30_000 });
  // Progress in words, not file ids
  await expect(row).toContainText(/Downloading files \(1 of \d+\)/, { timeout: 30_000 });
  await expect(row).toContainText('You can close this window');

  await setOffline(laptop, true);
  await dropHeldDownloads(laptop);
  // Not 'failed': the project opens with what is here
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect.poll(() => laptop.state((e) => e.app.getState().project?.id ?? null), { timeout: 30_000 }).toBe(p.id);
  // Its image is not here yet: the viewer says so, and nothing is reported as an error
  await laptop.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(p.micrographId)})`) as never);
  await expect(laptop.page.getByText("This micrograph's image is still downloading…")).toBeVisible({ timeout: 30_000 });
  expect(laptop.consoleErrors.filter((l) => /ENOENT|Failed to load image/.test(l))).toEqual([]);

  await setOffline(laptop, false);
  await waitImageArrived(laptop, p.micrographId);
  await laptop.caption('opens the micrograph whose image came after the connection');
  await viewMicrograph(laptop, p.micrographId);
});

test('closing Open Remote Project during a download lets it finish without opening the project', async ({ launch, project }) => {
  const p = await project('E2E Download Closed');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const laptop = await launch('Ana laptop', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await waitSettled(ana);

  await holdDownloads(laptop);
  await laptop.menu('File', 'Open Remote Project...');
  const dialog = laptop.page.getByRole('dialog', { name: 'Open Remote Project' });
  const row = dialog.getByRole('listitem').filter({ hasText: p.name });
  await row.getByRole('button', { name: 'Download' }).click({ timeout: 30_000 });
  await expect(row).toContainText('Downloading files', { timeout: 30_000 });
  await laptop.caption('closes the window while it downloads');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await releaseDownloads(laptop);

  // It finishes in the background: the copy is here, but nothing opened
  await laptop.menu('File', 'Open Remote Project...');
  const again = laptop.page.getByRole('dialog', { name: 'Open Remote Project' });
  await expect(again.getByRole('listitem').filter({ hasText: p.name }).getByRole('button', { name: 'Open' })).toBeVisible({ timeout: 60_000 });
  expect(await laptop.state((e) => e.app.getState().project?.id ?? null)).toBeNull();
  await again.getByRole('listitem').filter({ hasText: p.name }).getByRole('button', { name: 'Open' }).click();
  await expect.poll(() => laptop.state((e) => e.app.getState().project?.id ?? null), { timeout: 30_000 }).toBe(p.id);
  await viewMicrograph(laptop, p.micrographId);
});

test('logging in without a connection says so in words', async ({ launch }) => {
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setOffline(ana, true);
  await ana.menu('Account', 'Login...');
  const dialog = ana.page.getByRole('dialog', { name: 'Sign in to StraboSpot' });
  await dialog.getByLabel('Email').fill(ACCOUNTS.ana.email);
  await dialog.getByLabel('Password').fill('testpass123');
  await dialog.getByRole('button', { name: 'Sign In' }).click();
  await expect(dialog.getByText("Can't reach StraboSpot. Check your connection and try again.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText('fetch failed')).toHaveCount(0);
});
