// Keyboard shortcuts beyond shuffle: K, P, ? and ⌘S; and the labeled more-like-this button.
import { choose, expect, openApp, test } from './support/app';

test('K keeps or releases the favourite', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Add to favourites' })).toBeVisible();
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

test('the shortcut list and the tips and tricks card link to each other', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  const keys = page.getByRole('complementary', { name: 'Shortcuts' });
  const tricks = page.getByRole('complementary', { name: 'Tips' });
  await keys.getByRole('button', { name: 'tricks' }).click();
  await expect(tricks).toContainText('harmony');
  await expect(keys).toHaveCount(0);
  await tricks.getByRole('button', { name: 'all keys' }).click();
  await expect(keys).toBeVisible();
  await expect(tricks).toHaveCount(0);
});

test('D rolls the pattern dice of the current pattern and V the warp dice', async ({ page }) => {
  await openApp(page);
  const gradient = page.getByLabel('Gradient', { exact: true });

  // The dice buttons carry their seed, so a roll shows as a new value.
  for (const [kind, dice] of [
    ['planes', 'New layout'],
    ['aurora', 'New aurora layout'],
    ['blobs', 'New blobs layout'],
    ['noise', 'New pattern variation'],
    ['cells', 'New pattern variation'],
  ]) {
    await choose(gradient, kind);
    const button = page.getByRole('button', { name: dice });
    await expect(button).toHaveAttribute('title', /\(D\)$/);
    const seed = await button.getAttribute('data-seed');
    await page.keyboard.press('d');
    await expect(button).not.toHaveAttribute('data-seed', seed ?? '');
  }

  await choose(page.getByLabel('Warp shape', { exact: true }), 'waves');
  const warp = page.getByRole('button', { name: 'New variation' });
  await expect(warp).toHaveAttribute('title', /\(V\)$/);
  const seed = await warp.getAttribute('data-seed');
  await page.keyboard.press('v');
  await expect(warp).not.toHaveAttribute('data-seed', seed ?? '');
});

test('D steps the band style of a mesh, A to B to C and round', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  const style = page.getByRole('group', { name: 'Band style' }).locator('[aria-pressed="true"]');
  await expect(style).toHaveText('A');
  for (const next of ['B', 'C', 'A']) {
    await page.keyboard.press('d');
    await expect(style).toHaveText(next);
  }
});

test('a button glows when its key is pressed and when it is clicked', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'planes');
  await choose(page.getByLabel('Warp shape', { exact: true }), 'waves');
  // A focused dropdown would take Space for itself.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const keyed: [key: string, button: string | RegExp][] = [
    ['w', 'Shuffle colors'],
    ['r', 'Shuffle color order'],
    ['d', 'New layout'],
    ['v', 'New variation'],
    ['k', /^(Add to|Remove from) favourites$/],
    ['p', /^(Collapse|Expand) panel$/],
  ];
  for (const [key, name] of keyed) {
    const button = page.getByRole('button', { name, exact: typeof name === 'string' });
    await expect(button).not.toHaveClass(/glow/);
    await page.keyboard.press(key);
    await expect(button).toHaveClass(/glow/);
    // The class goes when the animation ends, so the next press starts it again.
    await expect(button).not.toHaveClass(/glow/);
  }
  // The panel is folded now, and the colors button with it.
  await page.keyboard.press('p');
  await page.getByRole('button', { name: 'Shuffle colors' }).click();
  await expect(page.getByRole('button', { name: 'Shuffle colors' })).toHaveClass(/glow/);

  // Last, since a shuffle can swap the pattern and its dice for another.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Shuffle', exact: true })).toHaveClass(/glow/);
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
