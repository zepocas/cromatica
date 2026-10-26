// The first-visit walkthrough: each step waits for its own key, and it never comes back once left.
import { expect, openApp, test } from './support/app';

test('walkthrough: steps advance on their keys, Esc leaves for good', async ({ page }) => {
  await openApp(page, { shuffled: true, tips: true });
  const card = page.getByRole('complementary', { name: 'Walkthrough' });
  await expect(card).toContainText('1/18');

  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await expect(card).toContainText('1/18');
  await page.keyboard.press(' ');
  await expect(card).toContainText('2/18');

  await page.keyboard.press('ArrowLeft');
  await expect(card).toContainText('2/18');
  await page.keyboard.press('ArrowRight');
  await expect(card).toContainText('3/18');

  await page.keyboard.press('m');
  await expect(page.getByTestId('more-like-this')).toBeVisible();
  await expect(card).toContainText('3/18');
  await page.getByRole('button', { name: 'Variation 1' }).click();
  await expect(card).toContainText('4/18');

  await page.keyboard.press('q');
  await expect(card).toContainText('5/18');
  await page.keyboard.press('w');
  await expect(card).toContainText('6/18');

  await page.keyboard.press('o');
  await expect(card).toContainText('7/18');
  await page.keyboard.press('p');
  await expect(card).toContainText('8/18');
  await page.keyboard.press('l');
  await expect(card).toContainText('9/18');
  await page.keyboard.press(',');
  await expect(card).toContainText('10/18');
  await page.getByLabel('Noise amount').fill('0.5');
  await expect(card).toContainText('11/18');

  // The arrange step starts on planes or blobs, but the user can still step away and change the warp.
  const gradient = page.getByLabel('Gradient', { exact: true });
  await expect(gradient).toHaveAttribute('data-value', /^(planes|blobs)$/);
  const kind = await gradient.getAttribute('data-value');
  await page.keyboard.press(';');
  await expect(gradient).not.toHaveAttribute('data-value', kind!);
  const warp = page.getByLabel('Warp shape');
  const shape = await warp.getAttribute('data-value');
  await page.keyboard.press(',');
  await expect(warp).not.toHaveAttribute('data-value', shape!);
  await expect(gradient).not.toHaveAttribute('data-value', kind!);
  await expect(card).toContainText('11/18');

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect(card).toBeHidden();
});

test('Esc in more like this closes the grid and keeps the walkthrough', async ({ page }) => {
  await openApp(page, { shuffled: true, tips: true });
  const card = page.getByRole('complementary', { name: 'Walkthrough' });
  await page.keyboard.press('m');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('more-like-this')).toBeHidden();
  await expect(card).toBeVisible();
});

test('q shuffles the look and w the colors, e exports, l and ; step through the gradients', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('q');
  await page.keyboard.press('w');
  const download = page.waitForEvent('download');
  await page.keyboard.press('e');
  expect((await download).suggestedFilename()).toMatch(/^cromatica-\d+x\d+\.png$/);

  const gradient = page.getByLabel('Gradient', { exact: true });
  const before = await gradient.getAttribute('data-value');
  await page.keyboard.press(';');
  await expect(gradient).not.toHaveAttribute('data-value', before!);
  await page.keyboard.press('l');
  await expect(gradient).toHaveAttribute('data-value', before!);
});

test('a first visit starts from the device: panel folded, a desktop canvas, OS screen off until o', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page, { shuffled: true, tips: true });
  await expect(page.getByRole('button', { name: 'Expand panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More like this' })).toBeVisible();
  await expect(page.getByTestId('context-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Shuffle', exact: true })).toHaveClass(/nudge/);

  await page.keyboard.press('o');
  await expect(page.getByTestId('context-overlay')).toBeVisible();
  await expect(page.getByLabel('OS context')).toHaveAttribute('data-value', /^(macos|windows)$/);
  await page.keyboard.press('o');
  await expect(page.getByTestId('context-overlay')).toHaveCount(0);

  const download = page.waitForEvent('download');
  await page.keyboard.press('e');
  expect((await download).suggestedFilename()).toMatch(/^cromatica-\d+x\d+\.png$/);
});

test('?walkthrough starts it again after it was left', async ({ page }) => {
  await openApp(page, { shuffled: true, tips: true });
  await page.keyboard.press('Escape');
  await page.goto('/?walkthrough');
  await expect(page.getByRole('complementary', { name: 'Walkthrough' })).toBeVisible();
});

test('?debug logs each key with the design fields it changed', async ({ page }) => {
  await page.goto('/?default&debug');
  await page.waitForFunction(() => '__cromaticaLog' in window);
  await page.keyboard.press('.');
  const log = (await page.evaluate(() =>
    (window as unknown as { __cromaticaLog: () => unknown }).__cromaticaLog(),
  )) as {
    entries: { action: string; changes: string[] }[];
  };
  const entry = log.entries.at(-1)!;
  expect(entry.action).toBe('key .');
  expect(entry.changes.join()).toContain('warp.shape');
});
