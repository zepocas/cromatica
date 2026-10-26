// Shuffle: the button, Space, q and w, and the opening shuffle.
import { choose, expect, openApp, previewProbe, readHexes, readPoints, readWarp, test } from './support/app';

test('shuffle: button and Space', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  await expect(page.locator('[data-point]')).toHaveCount(5);

  let before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);

  // Space shuffles, even with a button focused (without clicking that button).
  await shuffle.focus();
  before = await settled();
  await page.keyboard.press('Space');
  await expectPreviewChanged(before);

  // ...but not while typing into a field.
  const hexes = await readHexes(page);
  await choose(page.getByLabel('Size preset'), 'custom');
  await page.getByLabel('Width').focus();
  await page.keyboard.press('Space');
  expect(await readHexes(page)).toEqual(hexes);
});

test('w shuffles only the colors: the kind, positions and warp stay', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  const pts = await readPoints(page);
  const warp = await readWarp(page);
  const before = await settled();
  await page.keyboard.press('w');
  await expectPreviewChanged(before);
  const next = await readPoints(page);
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'mesh');
  expect(next.map((p) => p.pos)).toEqual(pts.map((p) => p.pos));
  expect(next.map((p) => p.color)).not.toEqual(pts.map((p) => p.color));
  expect(await readWarp(page)).toEqual(warp);
});

test('q shuffles the pattern and adjust and keeps the palette', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const oldColors = new Set(await readHexes(page));
  const before = await settled();
  await page.keyboard.press('q');
  await expectPreviewChanged(before);
  for (const hex of await readHexes(page)) expect(oldColors.has(hex)).toBe(true);
});

test('opens on a shuffled design unless ?default', async ({ page }) => {
  await openApp(page);
  await expect(page.getByLabel('Warp shape')).toHaveAttribute('data-value', 'domain');
  const defaults = await readPoints(page);
  const seen = new Set<string>();
  for (let i = 0; i < 2; i++) {
    // A first visit each time. Cleared from ?default, which doesn't save on leaving.
    await openApp(page);
    await page.evaluate(() => localStorage.clear());
    await openApp(page, { shuffled: true });
    const pts = await readPoints(page);
    expect(pts).not.toEqual(defaults);
    seen.add(JSON.stringify(pts));
  }
  expect(seen.size).toBe(2);
});
