/**
 * Color pickers (Edit Spot, New Spot, tags, presets) keep colors as hex, so
 * the picker's transparency slider could never move: hex drops the alpha and
 * the handle snapped back to fully opaque (a user's report, 2026-10-28).
 * Opacity has its own control in each dialog, so the pickers hide that
 * slider; the Hue slider drags as before.
 */

import { test, expect } from '../lib/test';
import { ACCOUNTS } from '../lib/copy';
import { openSmz, viewMicrograph } from '../lib/actions';

test('the spot color picker has no transparency slider and its Hue slider drags', async ({ launch, project }) => {
  const p = await project('E2E Color Picker', ['Grain 1']);
  const ana = await launch('Ana', ACCOUNTS.ana, { login: false });
  await openSmz(ana, p.smzPath, p.id);
  await viewMicrograph(ana, p.micrographId);
  const page = ana.page;

  await ana.state(new Function('e', `return e.app.getState().selectActiveSpot(${JSON.stringify(p.spots[0].id)})`) as never);
  await page.getByPlaceholder('Select or search data type...').click();
  await ana.caption('opens Spot Data, then the Spot Color picker');
  await page.getByRole('option', { name: 'Spot Data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Spot' });
  await expect(dialog).toBeVisible();
  const input = dialog.locator('.MuiColorInput-TextField input');
  await expect(input).toHaveValue('#00ff00');
  await dialog.locator('.MuiColorInput-Button').click();

  // The open popover hides the dialog from role queries, so CSS locators from here
  const hue = page.locator('.MuiColorInput-HueSlider');
  await expect(hue).toBeVisible();
  await expect(page.locator('.MuiColorInput-AlphaSlider')).toHaveCount(0);

  await ana.caption('drags the Hue handle toward red-orange');
  const thumb = (await hue.locator('.MuiSlider-thumb').boundingBox())!;
  const rail = (await hue.boundingBox())!;
  const x = thumb.x + thumb.width / 2, y = thumb.y + thumb.height / 2;
  const toX = rail.x + rail.width * 0.05;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (toX - x) * i / 10, y);
  await page.mouse.up();
  await expect(page.locator('.MuiColorInput-TextField input').first()).not.toHaveValue('#00ff00');
  // The handle followed the mouse (it was at a third of the rail for green)
  await expect.poll(async () => Number(await hue.locator('input').getAttribute('aria-valuenow'))).toBeLessThan(10);
});
