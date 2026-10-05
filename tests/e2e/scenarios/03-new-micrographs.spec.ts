/**
 * A new micrograph made by one person reaches the other with its image,
 * and the image shows in the viewer (ec41106: a pull dropped imagePath and
 * the viewer said 'No micrograph loaded'). Also from a member, made while
 * offline (4cbb16d: the upload of a new original came first and could
 * stop the push). And a micrograph placed on another, pulled before its
 * image: the parent's composite thumbnail is not made without it (and
 * pushed over the right one, found on prod 2026-10-05) but once it arrives.
 */

import fs from 'fs';
import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { writeImage } from '../lib/fixtures';
import {
  share, waitSettled, addReferenceMicrograph, viewMicrograph, micrograph, setOffline, syncChip, holdDownloads, releaseDownloads,
  waitImageArrived, holdFileRefs, releaseFileRefs, addOverlayMicrograph, compositeSha,
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
  // Opening it before the image is here is scenario 3 below
  await waitImageArrived(ben, id);
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
  await waitImageArrived(ana, id);
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

for (const placement of ['offset', 'affine'] as const) {
  test(`a placed micrograph pulled before its image: the parent's composite waits for it (${placement})`, async ({ launch, project, runDir }) => {
    const p = await project(`E2E Composite Waits ${placement}`);
    const img = await writeImage(`${runDir}/images/overlay-${placement}.jpg`);
    const ana = await launch('Ana', ACCOUNTS.ana);
    const ben = await launch('Ben', ACCOUNTS.ben);
    await share(ana, ben, p.smzPath, p.id, p.name);

    // Prod's order (2026-10-05): Ana's composite reaches the server first,
    // Ben pulls the micrograph before its image, and a composite Ben made
    // without it would reach the server after Ana's
    await holdFileRefs(ana);
    await holdFileRefs(ben);
    const id = await addOverlayMicrograph(ana, p.sampleId, p.micrographId, img, 'Overlay', placement);
    const anas = await compositeSha(ana, p.id, p.micrographId);
    expect(anas).toBeTruthy();
    // Ana's composite shows it (an affine one makes the warped image itself)
    const anaLog = fs.readFileSync(ana.logFile, 'utf8');
    expect(anaLog).toMatch(placement === 'affine' ? /Added affine overlay to thumbnail/ : new RegExp(`Processing child ${id}`));
    expect(anaLog).not.toMatch(new RegExp(`Failed to composite child ${id}|No cached affine data for ${id}`));

    await expect.poll(async () => (await micrograph(ben, id))?.name ?? null, { timeout: 60_000 }).toBe('Overlay');
    await expect.poll(() => new RegExp(`Composite of ${p.micrographId} left as it was|Successfully generated composite thumbnail: .*${p.micrographId}`)
      .test(fs.readFileSync(ben.logFile, 'utf8')), { timeout: 30_000 }).toBe(true);
    // A composite Ben made would be on its way up now, its ref held
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await releaseFileRefs(ana);
    await waitSettled(ana, 120_000);
    await releaseFileRefs(ben);
    await waitImageArrived(ben, id);
    await waitSettled(ben, 120_000);
    await waitSettled(ana, 120_000);

    // Both have Ana's composite, the one with the overlay
    await expect.poll(() => compositeSha(ben, p.id, p.micrographId), { timeout: 60_000 }).toBe(anas);
    expect(await compositeSha(ana, p.id, p.micrographId)).toBe(anas);
    // Ben never sent a composite: the server's is Ana's
    expect(refChanges(p.id).filter((r) => r.email !== ACCOUNTS.ana.email && r.role === 'thumbnail')).toEqual([]);
    // Ben's waited for the image and was made once it arrived (the same as Ana's)
    expect(fs.readFileSync(ben.logFile, 'utf8')).toMatch(new RegExp(
      `Composite of ${p.micrographId} left as it was: waiting for the image of ${id}[\\s\\S]*Successfully generated composite thumbnail: .*${p.micrographId}`));
  });
}
