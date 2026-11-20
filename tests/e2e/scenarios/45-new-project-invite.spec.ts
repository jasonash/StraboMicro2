/**
 * New Project > Create and Invite Collaborators... (Claire): greyed out with
 * a note while "On this computer only" is chosen; synced, it creates the
 * project and opens Collaborators on it, which waits for the first upload
 * (the server takes no invitation before it) and then invites.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { acceptInvitationFromChip, waitSettled } from '../lib/actions';

test('Create and Invite Collaborators: only for a synced project, then invites once the first upload is done', async ({ launch }) => {
  const ana = await launch('Ana', ACCOUNTS.ana);
  const cleo = await launch('Cleo', ACCOUNTS.cleo);
  const name = `E2E Invite At Creation ${Date.now()}`;

  await ana.menu('File', 'New Project');
  const dialog = ana.page.getByRole('dialog', { name: 'New Project' });
  await dialog.getByLabel('Project Name').fill(name);
  const createAndInvite = dialog.getByRole('button', { name: 'Create and Invite Collaborators...' });

  await dialog.getByLabel('On this computer only').check();
  await expect(createAndInvite).toBeDisabled();
  await expect(dialog.getByText('To invite collaborators, choose synced to StraboSpot.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create Project' })).toBeEnabled();

  await dialog.getByLabel(/synced to StraboSpot/).check();
  await expect(dialog.getByText('To invite collaborators, choose synced to StraboSpot.')).toHaveCount(0);
  await expect(createAndInvite).toBeEnabled();

  // Whether the dialog showed the wait for the first upload (it can be short)
  await ana.page.evaluate(() => {
    const w = window as unknown as { __sawUploadWait?: boolean };
    w.__sawUploadWait = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="collaborators-waiting-for-upload"]')) w.__sawUploadWait = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await ana.caption('creates the project and invites at once');
  await createAndInvite.click();
  await expect(dialog).toBeHidden();

  const collab = ana.page.getByRole('dialog', { name: 'Collaborators' });
  await expect(collab).toBeVisible();
  await expect(collab.getByText(ACCOUNTS.ana.email)).toBeVisible({ timeout: 30_000 });
  const projectId = await ana.state((e) => e.app.getState().project?.id ?? null);
  expect(await ana.state((e) => e.app.getState().project?.name ?? null)).toBe(name);

  // The invite part appears once the first upload is done; no "not finished" error
  await expect(collab.getByLabel('Email address')).toBeVisible({ timeout: 60_000 });
  expect(await ana.page.evaluate(() => (window as unknown as { __sawUploadWait?: boolean }).__sawUploadWait)).toBe(true);
  expect(await ana.state((e) => e.sync.getState().phase)).toBe('ready');
  expect(await ana.state((e) => e.sync.getState().projectId)).toBe(projectId);

  await collab.getByLabel('Email address').fill(ACCOUNTS.cleo.email);
  await collab.getByRole('button', { name: 'Invite', exact: true }).click();
  await expect(collab.getByText(`Invitation sent to ${ACCOUNTS.cleo.email}.`)).toBeVisible();
  await expect(collab.getByText("hasn't finished yet")).toHaveCount(0);
  await collab.getByRole('button', { name: 'Close' }).click();
  await expect(collab).toBeHidden();

  await acceptInvitationFromChip(cleo, name);
  await waitSettled(ana);
  expect(await cleo.state((e) => e.app.getState().project?.id ?? null)).toBe(projectId);
});
