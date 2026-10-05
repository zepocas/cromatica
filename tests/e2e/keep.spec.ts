// Keep and explore (M7): shuffle history and favourites.
import { expect, openApp, previewProbe, readHexes, test } from './support/app';

test('← and → step through recent shuffles', async ({ page }) => {
  await openApp(page);
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  const start = await readHexes(page);
  await shuffle.click();
  const first = await readHexes(page);
  await shuffle.click();
  const second = await readHexes(page);
  await expect(page.getByLabel('Shuffle 3 of 3')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  expect(await readHexes(page)).toEqual(first);
  await page.keyboard.press('ArrowLeft');
  expect(await readHexes(page)).toEqual(start);
  await expect(page.getByRole('button', { name: 'Previous shuffle' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next shuffle' }).click();
  await page.keyboard.press('ArrowRight');
  expect(await readHexes(page)).toEqual(second);

  // Undo goes back across a step like any other change.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await readHexes(page)).toEqual(first);
});

test('arrows nudge a focused handle instead of stepping', async ({ page }) => {
  await openApp(page);
  // Layout locked, so the shuffle keeps the pattern and its handles.
  await page.getByLabel('Lock layout').click();
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  const hexes = await readHexes(page);
  const handle = page.locator('[data-point], [data-node]').first();
  await handle.focus();
  const x = await handle.getAttribute('data-x');
  await page.keyboard.press('ArrowLeft');
  await expect(handle).not.toHaveAttribute('data-x', x!);
  expect(await readHexes(page)).toEqual(hexes);
});

test('favourites: ♡ keeps the design, a click reopens it, and it survives a reload', async ({ page }) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const kept = await settled();
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Open favourite/ })).toHaveCount(1);

  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Open favourite 1' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
  await expect.poll(async () => (await settled()).equals(kept)).toBe(true);

  await page.getByRole('button', { name: 'Remove favourite 1' }).click();
  await expect(page.getByRole('button', { name: /^Open favourite/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();
});
