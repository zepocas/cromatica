// The docked and collapsed panel.
import { centerOf, expect, openApp, test } from './support/app';

test('docked panel never covers the preview; collapsing gives it the full width', async ({ page }) => {
  await openApp(page);
  const panel = page.locator('aside');
  const canvas = page.getByTestId('preview-canvas');

  // Docked: the preview sits entirely to the right of the panel.
  const pb = (await panel.boundingBox())!;
  const docked = (await canvas.boundingBox())!;
  expect(docked.x).toBeGreaterThanOrEqual(pb.x + pb.width);
  const [x, y] = await centerOf(page.getByRole('button', { name: 'Point 1', exact: true }));
  const covered = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('aside'), [x, y]);
  expect(covered).toBe(false);

  await page.getByRole('button', { name: 'Collapse panel' }).click();
  const expand = page.getByRole('button', { name: 'Expand panel' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Warp shape')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Shuffle( Space)?$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  expect((await panel.boundingBox())!.height).toBeLessThan(70);
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeGreaterThan(docked.width);

  await expand.click();
  await expect(page.getByLabel('Warp shape')).toBeVisible();
});
