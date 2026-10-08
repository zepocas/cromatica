// The view section: OS context mockups, legibility warnings and crop frames (M9).
import { CONTEXT_SCREENS } from '../../src/context/screens';
import { choose, expect, openApp, previewProbe, test } from './support/app';

test('every context draws over the preview without changing it', async ({ page }) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const before = await settled();
  const overlay = page.getByTestId('context-overlay');
  for (const screen of CONTEXT_SCREENS) {
    await choose(page.getByLabel('Context'), screen.id);
    await expect(overlay.locator('[data-zone]')).toHaveCount(screen.zones.length);
  }
  // Overlays are DOM only (D48): the rendered image is untouched.
  expect((await settled()).equals(before)).toBe(true);
  await choose(page.getByLabel('Context'), 'off');
  await expect(overlay).toHaveCount(0);
});

test('the clock warning flags a busy area and stays quiet on a calm one', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await choose(page.getByLabel('Context'), 'ios-lock');
  const clock = page.locator('[data-zone="clock"]');
  await expect(clock).toHaveAttribute('data-issues', '');

  // Many crisp planes cross the clock; the default mesh is smooth there.
  await choose(page.getByLabel('Gradient', { exact: true }), 'planes');
  await page.getByLabel('Planes', { exact: true }).fill('1');
  await expect(clock).toHaveAttribute('data-issues', /busy/);
  await expect(clock.getByRole('status')).toContainText('busy');
});

test('phone outputs list the phone contexts first', async ({ page }) => {
  await openApp(page);
  const context = page.getByLabel('Context');
  await context.click();
  await expect(page.getByRole('listbox').getByRole('option').nth(1)).toHaveAttribute('data-value', 'macos');
  await page.keyboard.press('Escape');
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await context.click();
  await expect(page.getByRole('listbox').getByRole('option').nth(1)).toHaveAttribute('data-value', 'ios-lock');
});

test('crop frames outline only the narrower screens', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Show crops' }).click();
  const crops = page.locator('[data-crop]');
  await expect(crops).toHaveCount(3);
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await expect(crops).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide crops' }).click();
  await expect(page.getByTestId('context-overlay')).toHaveCount(0);
});
