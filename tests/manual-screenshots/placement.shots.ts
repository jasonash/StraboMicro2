/**
 * Manual figures for Place automatically on parent and Place children
 * automatically (section 5): Claire's Toxaway 160328-4 images
 * (~/Desktop/AutoPlace_Test, or MANUAL_PLACE_IMAGES). The PPL overview gets
 * three unplaced children, as after a Batch Import: two garnet details that
 * match and the XZB folds image, which does not.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { makeProject } from '../e2e/lib/fixtures';
import { openSmz } from '../e2e/lib/actions';
import { setWindowSize, settle, shot } from './lib';

const IMAGES = process.env.MANUAL_PLACE_IMAGES || path.join(os.homedir(), 'Desktop', 'AutoPlace_Test');

async function jpeg(file: string) {
  const image = sharp(path.join(IMAGES, file));
  const { width = 0, height = 0 } = await image.metadata();
  return { data: await image.jpeg({ quality: 92 }).toBuffer(), width, height };
}

test('place automatically', async ({ launch, runDir }) => {
  if (!fs.existsSync(IMAGES)) throw new Error(`Toxaway images missing: ${IMAGES} (set MANUAL_PLACE_IMAGES)`);
  const overview = await jpeg('160328-4_ppl_merge.tif');
  const children = [
    { id: randomUUID(), name: '160328-4-XZA pplgar1', ...(await jpeg('160328-4-XZA_pplgar1.tif')) },
    { id: randomUUID(), name: '160328-4-XZA pplgar2', ...(await jpeg('160328-4-XZA_pplgar2.tif')) },
    { id: randomUUID(), name: '160328-4XZB folds PPL', ...(await jpeg('160328-4XZB_folds_PPL - Copy.tif')) },
  ];
  const overviewId = randomUUID();
  const p = await makeProject(`${runDir}/fixtures`, 'Toxaway 160328-4', [], {
    overviewId,
    overviewImage: overview.data,
    overview: {
      name: '160328-4 PPL', width: overview.width, height: overview.height,
      imageWidth: overview.width, imageHeight: overview.height, scalePixelsPerCentimeter: 1100,
    },
    micrographs: children.map((c) => ({
      id: c.id, name: c.name, parentID: overviewId, imageType: 'Plane Polarized Light',
      width: c.width, height: c.height, imageWidth: c.width, imageHeight: c.height, opacity: 1,
      polish: false, description: '', notes: '', spots: [], orientationInfo: { orientationMethod: 'unoriented' },
      associatedFiles: [], links: [], isMicroVisible: true, isExpanded: false, isSpotExpanded: false, isFlipped: false, tags: [],
    })),
    images: Object.fromEntries(children.map((c) => [c.id, c.data])),
  });

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1600, 1000);
  await openSmz(ana, p.smzPath, p.id);
  // Composite thumbnails, as Batch Import makes them (the list shows them)
  await ana.page.evaluate(async (ids) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const project = w.__STRABO_STORE__.getState().project;
    for (const id of ids) await w.api.generateCompositeThumbnail(project.id, id, project);
  }, children.map((c) => c.id));
  await ana.page.getByText('160328-4 PPL (Reference)', { exact: true }).locator('xpath=..')
    .locator('[data-testid="ChevronRightIcon"]').first().click();
  await settle(ana);

  // Clicking an unplaced child: the offer
  await ana.page.getByText(children[0].name, { exact: true }).click();
  const offer = ana.page.getByRole('dialog', { name: 'Place all children automatically?' });
  await expect(offer).toBeVisible();
  await settle(ana, 800);
  await shot(ana, 'place-children-offer', offer);

  // Just this one: Edit Micrograph Location, Place automatically on parent
  await offer.getByRole('button', { name: 'Just this one' }).click();
  const edit = ana.page.getByRole('dialog', { name: 'Edit Micrograph Location' });
  await expect(edit).toBeVisible();
  await edit.getByText('Place automatically on parent', { exact: true }).click();
  await edit.getByRole('button', { name: 'Next' }).click();
  await expect(edit.getByText(/^Found it/)).toBeVisible({ timeout: 120_000 });
  await expect(edit.getByLabel('X (px)')).toBeEnabled({ timeout: 30_000 });
  await settle(ana, 2500);
  await shot(ana, 'place-auto-found', edit);
  await edit.getByRole('button', { name: 'Cancel' }).click();
  await expect(edit).toBeHidden();

  // Three-dot menu > Place children automatically...
  await ana.page.getByText('160328-4 PPL (Reference)', { exact: true }).locator('xpath=../..')
    .locator('button:has([data-testid="MoreVertIcon"])').first().click();
  await ana.page.getByRole('menuitem', { name: 'Place children automatically...' }).click();
  const dialog = ana.page.getByRole('dialog', { name: /^Place children automatically on/ });
  await expect(dialog.getByRole('button', { name: /^Place \d+ micrographs?$/ })).toBeEnabled({ timeout: 180_000 });
  await settle(ana, 2500);
  await shot(ana, 'place-children', dialog);
});
