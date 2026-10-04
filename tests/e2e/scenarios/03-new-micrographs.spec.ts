/**
 * A new micrograph made by one person reaches the other with its image,
 * and the image shows in the viewer (ec41106: a pull dropped imagePath and
 * the viewer said 'No micrograph loaded'). Also from a member, made while
 * offline (4cbb16d: the upload of a new original came first and could
 * stop the push).
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import {
  share, waitSettled, addReferenceMicrograph, viewMicrograph, micrograph, setOffline, syncChip, holdDownloads, releaseDownloads,
} from '../lib/actions';
import { refChanges } from '../lib/server';

test("the owner's new micrograph reaches the editor and shows in the viewer", async ({ launch, project, runDir }) => {
  const p = await project('E2E New Micrograph Owner');
  const img = await writeImage(`${runDir}/images/rim-detail.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  const id = await addReferenceMicrograph(ana, 'TX-01', img, 'Rim detail');
  await waitSettled(ana, 120_000);
  await expect.poll(async () => (await micrograph(ben, id))?.name ?? null, { timeout: 60_000 }).toBe('Rim detail');
  await waitSettled(ben, 120_000);
  expect((await micrograph(ben, id))?.imagePath).toBeTruthy();
  await ben.caption("opens Ana's new micrograph");
  await viewMicrograph(ben, id);
  // Ben sent no files: not for the first micrograph, not for the new one
  expect(refChanges(p.id).filter((r) => r.email !== ACCOUNTS.ana.email)).toEqual([]);
});

test("an editor's micrograph made offline goes up when back online, image and all", async ({ launch, project, runDir }) => {
  const p = await project('E2E New Micrograph Offline');
  const img = await writeImage(`${runDir}/images/vein.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await setOffline(ben, true);
  const id = await addReferenceMicrograph(ben, 'TX-01', img, 'Vein');
  await expect(syncChip(ben)).toHaveText(/^Offline/, { timeout: 30_000 });
  await setOffline(ben, false);
  await expect.poll(async () => (await micrograph(ana, id))?.name ?? null, { timeout: 90_000 }).toBe('Vein');
  await waitSettled(ben, 120_000);
  await waitSettled(ana, 120_000);
  await ana.caption("opens Ben's new micrograph");
  await viewMicrograph(ana, id);
});

test('a micrograph opened while its image is still downloading appears once it arrives', async ({ launch, project, runDir }) => {
  const p = await project('E2E Open While Downloading');
  const img = await writeImage(`${runDir}/images/pressure-shadow.jpg`);
  const ana = await launch('Ana', ACCOUNTS.ana);
  const ben = await launch('Ben', ACCOUNTS.ben);
  await share(ana, ben, p.smzPath, p.id, p.name);

  await holdDownloads(ben);
  const id = await addReferenceMicrograph(ana, 'TX-01', img, 'Pressure shadow');
  await waitSettled(ana, 120_000);
  await expect.poll(async () => (await micrograph(ben, id))?.name ?? null, { timeout: 60_000 }).toBe('Pressure shadow');
  await expect.poll(() => ben.state((e) => e.sync.getState().downloads), { timeout: 30_000 }).toBeGreaterThan(0);

  await ben.caption('opens it before the image is here');
  await ben.state(new Function('e', `return e.app.getState().selectMicrograph(${JSON.stringify(id)})`) as never);
  await ben.page.waitForTimeout(1_500);
  const shownBefore = ben.consoleLines.length;

  await releaseDownloads(ben);
  await waitSettled(ben, 120_000);
  await expect.poll(() => ben.consoleLines.slice(shownBefore).some((l) => l.includes('Thumbnail displayed')), { timeout: 60_000 }).toBe(true);
  await expect(ben.page.getByText('Loading image...')).toHaveCount(0);
  expect(await ben.state((e) => e.app.getState().activeMicrographId)).toBe(id);
});
