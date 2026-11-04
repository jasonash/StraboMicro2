/**
 * Roles (spec v3 17h, 17i): what a Viewer and a Contributor can do in the
 * app, and that what they may not do is refused and put back, while their
 * copies keep receiving the others' work. Plus invitations: one that waits
 * for the app to start, and a declined one.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import {
  share, waitSettled, spotField, editSpot, deleteSpot, addSpot, renameProject, nextAlert, canAddMicrograph,
  addReferenceMicrograph, micrograph, openSmz, turnOnSync, invite, acceptInDialog,
} from '../lib/actions';
import { refChanges } from '../lib/server';

test('a Viewer sees everything, changes nothing, and still gets the others\' work', async ({ launch, project }) => {
  const p = await project('E2E Viewer');
  const spot = p.spots[0];
  const ana = await launch('Ana', ACCOUNTS.ana);
  const cleo = await launch('Cleo', ACCOUNTS.cleo);
  await share(ana, cleo, p.smzPath, p.id, p.name, 'Viewer');
  expect(await cleo.state((e) => e.sync.getState().role)).toBe('viewer');

  expect(await canAddMicrograph(cleo, 'TX-01')).toBe(false);

  const before = cleo.alerts.length;
  await editSpot(cleo, spot.id, { name: 'Viewer was here' });
  expect(await nextAlert(cleo, before)).toBe("You're a Viewer on this project, so it can't be changed here.");
  expect(await spotField(cleo, spot.id, 'name')).toBe('Garnet 1');

  await editSpot(ana, spot.id, { name: 'Garnet (by the owner)' });
  await waitSettled(ana);
  await expect.poll(() => spotField(cleo, spot.id, 'name'), { timeout: 30_000 }).toBe('Garnet (by the owner)');
  await waitSettled(cleo);
  expect(await cleo.state((e) => e.sync.getState().refused)).toBe(0);
  expect(refChanges(p.id).filter((r) => r.email === ACCOUNTS.cleo.email)).toEqual([]);
});

test('a Contributor adds and changes their own work, not anyone else\'s', async ({ launch, project, runDir }) => {
  const p = await project('E2E Contributor');
  const anasSpot = p.spots[0];
  const img = await writeImage(`${runDir}/images/bens-micrograph.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name, 'Contributor');
  expect(await ben.state((e) => e.sync.getState().role)).toBe('contributor');
  expect(await canAddMicrograph(ben, 'TX-01')).toBe(true);

  // His own: a micrograph and a spot on it, then a change to that spot
  const m = await addReferenceMicrograph(ben, 'TX-01', img, "Ben's area");
  const bensSpot = await addSpot(ben, m, 'Biotite 1');
  await waitSettled(ben, 120_000);
  await editSpot(ben, bensSpot, { notes: 'Chloritized' });
  await waitSettled(ben);
  await expect.poll(async () => (await micrograph(ana, m))?.name ?? null, { timeout: 60_000 }).toBe("Ben's area");
  await expect.poll(() => spotField(ana, bensSpot, 'notes'), { timeout: 30_000 }).toBe('Chloritized');

  // Not his: Ana's spot, Ana's micrograph (deleting it), the project settings
  let n = ben.alerts.length;
  await editSpot(ben, anasSpot.id, { name: 'Taken over' });
  expect(await nextAlert(ben, n)).toBe('Only the person who added it, or an Editor, can change or delete it.');
  expect(await spotField(ben, anasSpot.id, 'name')).toBe('Garnet 1');
  n = ben.alerts.length;
  await deleteSpot(ben, anasSpot.id);
  expect(await nextAlert(ben, n)).toBe('Only the person who added it, or an Editor, can change or delete it.');
  expect(await spotField(ben, anasSpot.id, 'name')).toBe('Garnet 1');
  n = ben.alerts.length;
  await renameProject(ben, 'Bens project now');
  expect(await nextAlert(ben, n)).toBe('Only the owner or an Editor can change the project settings.');
  expect(await ben.state((e) => e.app.getState().project?.name)).toBe(p.name);

  // The owner may change his spot; he gets it
  await editSpot(ana, bensSpot, { name: 'Biotite (checked by Ana)' });
  await waitSettled(ana);
  await expect.poll(() => spotField(ben, bensSpot, 'name'), { timeout: 30_000 }).toBe('Biotite (checked by Ana)');

  // And he may delete his own
  await deleteSpot(ben, bensSpot);
  await waitSettled(ben);
  await expect.poll(() => spotField(ana, bensSpot, 'name'), { timeout: 30_000 }).toBeUndefined();
  await waitSettled(ana);
  expect(await ben.state((e) => e.sync.getState().refused)).toBe(0);
});

test('an invitation sent while the app is closed opens at login; accept and open', async ({ launch, project }) => {
  const p = await project('E2E Invited While Closed');
  const ana = await launch('Ana', ACCOUNTS.ana);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await invite(ana, ACCOUNTS.dev.email, 'Editor');

  const dev = await launch('Dev', ACCOUNTS.dev);
  await expect(dev.page.getByRole('dialog', { name: 'You have an invitation' })).toBeVisible({ timeout: 30_000 });
  await expect(dev.page.getByText(`${ACCOUNTS.ana.name} invited you as an Editor.`)).toBeVisible();
  await acceptInDialog(dev, p.name);
  expect(await dev.state((e) => e.app.getState().project?.id)).toBe(p.id);
  await waitSettled(dev);
});

test('a declined invitation shows as Declined to the owner and leaves no copy', async ({ launch, project }) => {
  const p = await project('E2E Declined');
  const ana = await launch('Ana', ACCOUNTS.ana);
  const dev = await launch('Dev', ACCOUNTS.dev);
  await openSmz(ana, p.smzPath, p.id);
  await turnOnSync(ana);
  await invite(ana, ACCOUNTS.dev.email, 'Viewer');

  const chip = dev.page.getByRole('button', { name: /^\d+ invitations?$/ });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();
  const dialog = dev.page.getByRole('dialog', { name: /You have (an invitation|invitations)/ });
  await dev.caption('declines');
  await dialog.getByRole('listitem').filter({ hasText: p.name }).getByRole('button', { name: 'Decline' }).click();
  await expect(chip).toBeHidden({ timeout: 30_000 });
  expect(await dev.state((e) => e.app.getState().project?.id ?? null)).toBeNull();

  await ana.menu('File', 'Collaborate...');
  const collab = ana.page.getByRole('dialog', { name: 'Collaborators' });
  await expect(collab.getByRole('listitem').filter({ hasText: ACCOUNTS.dev.email }).getByText('Declined')).toBeVisible({ timeout: 30_000 });
});
