/**
 * Edit Micrograph Location > Locate by an approximate point saves the scale
 * entered on the placement step (2026-10-29: it saved the parent's scale
 * whatever was entered, because a point placement has no size on the canvas
 * and the save read the canvas's scale). Pixel Conversion Factor 500 px per
 * 100 μm = 50000 px/cm. One copy, not synced.
 */

import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { makeProject } from '../lib/fixtures';
import { openSmz } from '../lib/actions';

test('a point placement saves the Pixel Conversion Factor scale, not the parent\'s', async ({ launch, runDir }) => {
  const overviewId = randomUUID();
  const id = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'E2E Point Placement Scale', [], {
    overviewId,
    micrographs: [{
      id, name: 'Spot photo', parentID: overviewId, imageType: 'Plane Polarized Light',
      width: 800, height: 600, imageWidth: 800, imageHeight: 600, opacity: 1,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    }],
    images: { [id]: await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 90, g: 90, b: 120 } } }).jpeg().toBuffer() },
  });
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await ana.page.getByText('Overview (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();

  await ana.caption('Edit Micrograph Location: approximate point, Pixel Conversion Factor');
  await ana.page.getByText('Spot photo', { exact: true }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await edit.getByRole('radio', { name: 'Locate by an approximate point' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();
  await edit.getByRole('radio', { name: 'Pixel Conversion Factor' }).check();
  await edit.getByRole('button', { name: 'Next' }).click();

  await ana.caption('places the point, enters 500 px per 100 μm, Save');
  await edit.getByRole('button', { name: 'Point Tool (Click to Place Location)' }).click();
  const stage = (await edit.locator('.konvajs-content').first().boundingBox())!;
  await ana.page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await edit.getByLabel('Number of Pixels').fill('500');
  await edit.getByLabel('Physical Length').fill('100');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toBeHidden();

  const saved = await ana.state(new Function('e', `
    const m = e.app.getState().micrographIndex.get(${JSON.stringify(id)});
    return { scale: m?.scalePixelsPerCentimeter ?? null, point: m?.pointInParent ?? null };`) as never) as unknown as { scale: number | null; point: unknown };
  expect(saved.point).not.toBeNull();
  // The parent is at 40000 px/cm (fixtures.ts): the old save kept that
  expect(saved.scale).toBeCloseTo(50000, 3);
});
