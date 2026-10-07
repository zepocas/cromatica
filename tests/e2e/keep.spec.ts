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
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^Open favourite/ })).toHaveCount(1);
  // Taken with the section open, as it is after a reload.
  const kept = await settled();

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

test('favourites section: folded while empty, opens when one is added, and stays open on removal', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('button', { name: 'Expand favourites' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Open favourite/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Collapse favourites' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open favourite 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse favourites' }).click();
  await expect(page.getByRole('button', { name: /^Open favourite/ })).toHaveCount(0);
  // The heart stays on the folded title line.
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();

  await page.getByRole('button', { name: 'Expand favourites' }).click();
  await page.getByRole('button', { name: 'Remove favourite 1' }).click();
  await expect(page.getByRole('button', { name: 'Collapse favourites' })).toBeVisible();
});

test('more like this: a grid of variations; a pick is one undo step, Esc closes', async ({ page }) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const before = await settled();
  const grid = page.getByTestId('more-like-this');

  await page.keyboard.press('m');
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('button', { name: /^Variation \d$/ })).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(grid).toBeHidden();

  // Time until every cell has drawn, on the test browser's software GPU.
  const ms = await page.evaluate(async () => {
    const t0 = performance.now();
    document.querySelector<HTMLButtonElement>('[aria-label="More like this"]')!.click();
    const cells = () => [...document.querySelectorAll<HTMLCanvasElement>('[data-testid="more-like-this"] canvas')];
    const drawn = () =>
      cells().length === 9 &&
      cells().every((c) => {
        const px = c.getContext('2d')!.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
        return px[3] > 0;
      });
    while (!drawn()) await new Promise(requestAnimationFrame);
    return performance.now() - t0;
  });
  console.log(`more like this: 9 thumbnails drawn in ${ms.toFixed(0)} ms`);

  await grid.getByRole('button', { name: 'Variation 1' }).click();
  await expect(grid).toBeHidden();
  await expect.poll(async () => (await settled()).equals(before)).toBe(false);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await settled()).equals(before)).toBe(true);
});

test('pickers: hovering or arrowing through options previews them without an undo step, a click commits', async ({
  page,
}) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const before = await settled();
  const undo = page.getByRole('button', { name: 'Undo' });

  await page.getByLabel('Gradient', { exact: true }).click();
  const options = page.locator('[role="option"]');
  await options.filter({ hasText: 'aurora' }).hover();
  await expect.poll(async () => (await settled()).equals(before)).toBe(false);
  await expect(undo).toBeDisabled();

  // Esc closes without committing: the canvas goes back and nothing changed. (The
  // screenshot hid the panel, which took focus off the dropdown.)
  await page.getByLabel('Gradient', { exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await settled()).equals(before)).toBe(true);
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'mesh');

  // Arrow keys move through the open list and preview each option.
  await page.getByLabel('Gradient', { exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('aria-activedescendant', /-1$/);
  await expect.poll(async () => (await settled()).equals(before)).toBe(false);
  await page.getByLabel('Gradient', { exact: true }).focus();
  await page.keyboard.press('Escape');

  await page.getByLabel('Gradient', { exact: true }).click();
  await options.filter({ hasText: 'aurora' }).click();
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'aurora');
  await undo.click();
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'mesh');
});

test('tips: shown on a first visit, gone for good once dismissed, back from the ? button', async ({ page }) => {
  await openApp(page, { shuffled: true, tips: true });
  const tips = page.getByRole('complementary', { name: 'Tips' });
  await expect(tips).toBeVisible();
  await expect(tips).toContainText('exports keep the design');
  await tips.getByRole('button', { name: '[ got it ]' }).click();
  await expect(tips).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect(tips).toBeHidden();
  await page.getByRole('button', { name: 'Tips' }).click();
  await expect(tips).toBeVisible();
});
