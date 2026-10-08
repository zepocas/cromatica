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

test('the warning flags a zone no text color reads over and stays quiet on a calm one', async ({ page }) => {
  await openApp(page);
  // The default mesh is one flat pink behind the iOS clock...
  await choose(page.getByLabel('Size preset'), '1206x2622');
  await choose(page.getByLabel('OS context'), 'ios-lock');
  const clock = page.locator('[data-zone="clock"]');
  await expect(clock).toHaveAttribute('data-contrast', /\d/);
  await expect(clock).toHaveAttribute('data-warn', '');

  // ...but runs from dark navy to light orange under the macOS menu bar.
  await choose(page.getByLabel('Size preset'), '3840x2160');
  await choose(page.getByLabel('OS context'), 'macos');
  const menuBar = page.locator('[data-zone="menu bar"]');
  await expect(menuBar).toHaveAttribute('data-warn', 'mid-tone');
  await expect(menuBar.getByRole('status')).toContainText('mid-tone');
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
