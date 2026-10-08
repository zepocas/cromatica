// The view section: OS context mockups, legibility warnings (M9).
import { CONTEXT_SCREENS } from '../../src/context/screens';
import { choose, expect, openApp, previewProbe, test } from './support/app';

test('every context draws over the preview without changing it', async ({ page }) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const before = await settled();
  const overlay = page.getByTestId('context-overlay');
  for (const screen of CONTEXT_SCREENS) {
    await choose(page.getByLabel('OS context'), screen.id);
    await expect(overlay.locator('[data-zone]')).toHaveCount(screen.zones.length);
  }
  // Overlays are DOM only (D48): the rendered image is untouched.
  expect((await settled()).equals(before)).toBe(true);
  await choose(page.getByLabel('OS context'), 'off');
  await expect(overlay).toHaveCount(0);
});

test('the clock warning flags a busy area and stays quiet on a calm one', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await choose(page.getByLabel('OS context'), 'ios-lock');
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
  const context = page.getByLabel('OS context');
  await context.click();
  await expect(page.getByRole('listbox').getByRole('option').nth(1)).toHaveAttribute('data-value', 'macos');
  await page.keyboard.press('Escape');
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await context.click();
  await expect(page.getByRole('listbox').getByRole('option').nth(1)).toHaveAttribute('data-value', 'ios-lock');
});

test('arrowing through the list previews each context; Escape goes back', async ({ page }) => {
  await openApp(page);
  const context = page.getByLabel('OS context');
  const overlay = page.getByTestId('context-overlay');
  await context.click();
  await page.keyboard.press('ArrowDown');
  await expect(overlay).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(context).toHaveAttribute('data-value', 'off');
});
