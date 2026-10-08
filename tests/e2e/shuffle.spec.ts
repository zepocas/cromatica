// Shuffle: the button, Space, the color and pattern locks, and the opening shuffle.
import { blur, choose, expect, openApp, previewProbe, readHexes, readPoints, readWarp, test } from './support/app';

test('shuffle: button, Space, color and pattern locks', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  const lockColors = page.getByRole('button', { name: 'Lock colors' });
  const lockPattern = page.getByRole('button', { name: 'Lock pattern' });
  const lockAdjust = page.getByRole('button', { name: 'Lock adjust' });
  await expect(page.locator('[data-point]')).toHaveCount(5);

  // A plain shuffle changes the image.
  let before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);

  // Colors locked: the image changes (possibly to another pattern kind), and every color is one of the old ones.
  await lockColors.click();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'true');
  const oldColors = new Set(await readHexes(page));
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  for (const hex of await readHexes(page)) expect(oldColors.has(hex)).toBe(true);

  // Space shuffles, even with a button focused (without clicking that button).
  await lockColors.click();
  await expect(lockColors).toBeFocused();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  before = await settled();
  await page.keyboard.press('Space');
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  await expectPreviewChanged(before);

  // ...but not while typing into a field.
  const hexes = await readHexes(page);
  await page.getByLabel('Width').focus();
  await page.keyboard.press('Space');
  expect(await readHexes(page)).toEqual(hexes);

  // Pattern locked: the kind, positions, radii and warp stay, colors change.
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  await lockPattern.click();
  let pts = await readPoints(page);
  const warp = await readWarp(page);
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  const next = await readPoints(page);
  await expect(page.getByLabel('Gradient', { exact: true })).toHaveAttribute('data-value', 'mesh');
  expect(next.map((p) => p.pos)).toEqual(pts.map((p) => p.pos));
  expect(next.map((p) => p.color)).not.toEqual(pts.map((p) => p.color));
  // The warp's shape and variation belong to the pattern; its amount and size are adjust settings.
  const kept = await readWarp(page);
  expect({ shape: kept.shape, seed: kept.seed }).toEqual({ shape: warp.shape, seed: warp.seed });

  // All three locked: nothing to shuffle; any one unlocked brings the button back.
  await lockColors.click();
  await expect(shuffle).toBeEnabled();
  await lockAdjust.click();
  await expect(shuffle).toBeDisabled();
  pts = await readPoints(page);
  await blur(page);
  await page.keyboard.press('Space');
  expect(await readPoints(page)).toEqual(pts);

  // Only the active pattern is shuffled: a linear shuffle leaves the mesh alone (pattern locked, so it stays linear).
  await lockColors.click();
  await lockAdjust.click();
  await choose(page.getByLabel('Gradient', { exact: true }), 'linear');
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  expect(await readPoints(page)).toEqual(pts);
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

test('shuffle: pattern kept, adjust shuffled — the warp amount and size move, its shape and variation stay', async ({
  page,
}) => {
  await openApp(page);
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  await page.getByRole('button', { name: 'Lock pattern' }).click();
  await page.getByRole('button', { name: 'Lock colors' }).click();
  const before = await readWarp(page);
  await shuffle.click();
  const after = await readWarp(page);
  expect({ shape: after.shape, seed: after.seed }).toEqual({ shape: before.shape, seed: before.seed });
  expect(after.amount === before.amount && after.size === before.size).toBe(false);

  // With adjust kept as well, nothing is left to shuffle.
  await page.getByRole('button', { name: 'Lock adjust' }).click();
  await expect(shuffle).toBeDisabled();
});
