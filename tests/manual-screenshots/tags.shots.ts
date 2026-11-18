/**
 * Manual figures for 2.0.60 (section 4, Data Entry Section): a spot's tags in
 * the right pane (Claire's issue #61). The Tags dialog from Add Data > Tags,
 * and the spot's Tags section. The image is the Image Stitcher's demo mosaic
 * (~/Desktop/ImageStitcherPrototype/handheld-mosaic.jpg, or MANUAL_TAGS_IMAGE).
 *
 *   npm run manual:screenshots -- tags
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { test, expect } from '../e2e/lib/test';
import { ACCOUNTS } from '../e2e/lib/copy';
import { makeProject } from '../e2e/lib/fixtures';
import { openSmz, viewMicrograph } from '../e2e/lib/actions';
import { setWindowSize, settle, shot, unionBox, shotRect } from './lib';

const IMAGE = process.env.MANUAL_TAGS_IMAGE
  || path.join(os.homedir(), 'Desktop', 'ImageStitcherPrototype', 'handheld-mosaic.jpg');

test('2.0.60 tags in the right pane', async ({ launch, runDir }) => {
  if (!fs.existsSync(IMAGE)) throw new Error(`image missing: ${IMAGE} (set MANUAL_TAGS_IMAGE)`);
  const base = await sharp(IMAGE).resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const { width = 0, height = 0 } = await sharp(base).metadata();
  const p = await makeProject(`${runDir}/fixtures`, 'Thin Section Demo', ['Garnet 1'], {
    overviewImage: base,
    overview: { name: 'Overview PPL', width, height, imageWidth: width, imageHeight: height },
  });

  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await setWindowSize(ana, 1500, 950);
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const page = ana.page;

  await ana.state(new Function('e', `
    const st = e.app.getState();
    st.createTag({ id: 'tag-garnet', name: 'Garnet porphyroblast', tagType: 'other', fillColor: '#aa3333', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-inclusions', name: 'Inclusion trails', tagType: 'other', fillColor: '#2e7d32', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    st.createTag({ id: 'tag-shear', name: 'Shear band', tagType: 'other', fillColor: '#3333aa', lineColor: '#000000', transparency: 100, tagSize: 10, spotIDs: [] });
    const spot = st.project.datasets[0].samples[0].micrographs[0].spots[0];
    st.selectActiveSpot(spot.id);`) as never);
  await expect(page.getByText('Spot Details')).toBeVisible();
  await settle(ana, 1000);

  // Add Data > Tags: the dialog with two tags chosen
  await page.getByPlaceholder('Select or search data type...').click();
  await page.getByRole('option', { name: 'Tags', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tags of "Garnet 1"' });
  await expect(dialog).toBeVisible();
  for (const name of ['Garnet porphyroblast', 'Inclusion trails']) {
    await dialog.getByRole('combobox', { name: 'Tags' }).click();
    await page.getByRole('option', { name }).click();
  }
  // Close the tag list only (Escape would close the dialog)
  await dialog.getByText('New tags are made in the Tags tab (left pane).').click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await settle(ana, 500);
  await shot(ana, 'spot-tags-dialog', dialog, 0);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  // The spot's Tags section, opened, with Add Data above it
  const header = page.getByRole('button', { name: /^Tags\s*2 tags$/ });
  await expect(header).toBeVisible();
  await header.click();
  const body = page.locator('.MuiAccordion-root', { has: header });
  await expect(body.getByText('Inclusion trails')).toBeVisible();
  await settle(ana, 600);
  const box = await unionBox(page.getByPlaceholder('Select or search data type...'), body);
  await shotRect(ana, 'spot-tags-section', { x: box.x - 16, y: box.y - 16, width: box.width + 32, height: box.height + 32 });
});
