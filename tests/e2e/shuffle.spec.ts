// Shuffle: the button, Space, the color and layout locks, and the opening shuffle.
import { blur, expect, openApp, openMore, previewProbe, readPoints, readWarp, test } from './support/app';

test('shuffle: button, Space, color and layout locks', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  const lockColors = page.getByRole('button', { name: 'Lock colors' });
  const lockLayout = page.getByRole('button', { name: 'Lock layout' });
  await expect(page.locator('[data-point]')).toHaveCount(5);
  // readWarp reads the warp size, which is under "more".
  await openMore(page, 'adjust');

  // A plain shuffle changes the image.
  let before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);

  // Colors locked: the layout changes, and every color is one of the old ones.
  await lockColors.click();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'true');
  let pts = await readPoints(page);
  await shuffle.click();
  let next = await readPoints(page);
  expect(next.map((p) => p.pos)).not.toEqual(pts.map((p) => p.pos));
  const oldColors = new Set(pts.map((p) => p.color));
  for (const p of next) expect(oldColors.has(p.color)).toBe(true);

  // Space shuffles, even with a button focused (without clicking that button).
  await lockColors.click();
  await expect(lockColors).toBeFocused();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  pts = await readPoints(page);
  before = await settled();
  await page.keyboard.press('Space');
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  await expectPreviewChanged(before);
  expect(await readPoints(page)).not.toEqual(pts);

  // ...but not while typing into a field.
  pts = await readPoints(page);
  await page.getByLabel('Width').focus();
  await page.keyboard.press('Space');
  expect(await readPoints(page)).toEqual(pts);

  // Layout locked: positions, radii and warp stay, colors change.
  await lockLayout.click();
  pts = await readPoints(page);
  const warp = await readWarp(page);
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  next = await readPoints(page);
  expect(next.map((p) => p.pos)).toEqual(pts.map((p) => p.pos));
  expect(next.map((p) => p.color)).not.toEqual(pts.map((p) => p.color));
  expect(await readWarp(page)).toEqual(warp);

  // Both locked: nothing to shuffle.
  await lockColors.click();
  await expect(shuffle).toBeDisabled();
  pts = await readPoints(page);
  await blur(page);
  await page.keyboard.press('Space');
  expect(await readPoints(page)).toEqual(pts);

  // Only the active pattern is shuffled: a linear shuffle leaves the mesh alone.
  await lockColors.click();
  await lockLayout.click();
  await page.getByLabel('Gradient', { exact: true }).selectOption('linear');
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  await page.getByLabel('Gradient', { exact: true }).selectOption('mesh');
  expect(await readPoints(page)).toEqual(pts);
});

test('opens on a shuffled design unless ?default', async ({ page }) => {
  await openApp(page);
  await expect(page.getByLabel('Warp shape')).toHaveValue('domain');
  const defaults = await readPoints(page);
  const seen = new Set<string>();
  for (let i = 0; i < 2; i++) {
    await openApp(page, { shuffled: true });
    const pts = await readPoints(page);
    expect(pts).not.toEqual(defaults);
    seen.add(JSON.stringify(pts));
  }
  expect(seen.size).toBe(2);
});
