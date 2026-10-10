// Keyboard shortcuts beyond shuffle: K, 1 2 3, P, ? and ⌘S; and the labeled more-like-this button.
import { expect, openApp, test } from './support/app';

test('K keeps or releases the favourite; 1 2 3 toggle the keep locks', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();

  for (const [key, name] of [
    ['1', 'Lock colors'],
    ['2', 'Lock pattern'],
    ['3', 'Lock adjust'],
  ]) {
    const toggle = page.getByRole('button', { name });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press(key);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press(key);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
});

test('P folds and unfolds the panel; ? opens the shortcut list and Esc closes it', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Expand panel' })).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toBeVisible();

  const card = page.getByRole('complementary', { name: 'Shortcuts' });
  await page.keyboard.press('?');
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Shortcuts' }).click();
  await expect(card).toBeVisible();
  // The tips and the list never stack.
  await page.getByRole('button', { name: 'Tips' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Tips' })).toBeVisible();
});

test('shortcuts leave text fields alone', async ({ page }) => {
  await openApp(page);
  await page.getByRole('textbox').first().focus();
  await page.keyboard.press('p');
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();
});

test('⌘S and Ctrl+S download instead of saving the page', async ({ page }) => {
  await openApp(page);
  const download = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  expect((await download).suggestedFilename()).toMatch(/^cromatica-\d+x\d+\.png$/);
});

test('more like this is a labeled button beside shuffle, and the panel does not overflow', async ({ page }) => {
  await openApp(page);
  const button = page.getByRole('button', { name: 'More like this' });
  await expect(button).toContainText('more like this');
  const shuffle = await page.getByRole('button', { name: 'Shuffle', exact: true }).boundingBox();
  const more = (await button.boundingBox())!;
  expect(Math.abs(more.y - shuffle!.y)).toBeLessThan(4);
  const panel = (await page.locator('aside.panel').first().boundingBox())!;
  expect(more.x + more.width).toBeLessThanOrEqual(panel.x + panel.width);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});
