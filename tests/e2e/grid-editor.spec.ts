// The grid mesh in the app: dragging nodes, the fold guard, and resizing.
import { expect, openApp, previewProbe, test } from './support/app';

test('grid: drag bends, nodes cannot pass their neighbors, edges stay on the frame, resize keeps nodes', async ({
  page,
}) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await page.getByLabel('Gradient', { exact: true }).selectOption('grid');
  await page.getByLabel('Rows').fill('3');
  await page.getByLabel('Columns').fill('3');
  const nodes = page.locator('[data-node]');
  await expect(nodes).toHaveCount(9);
  await expect(page.getByTestId('stop-strip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add color' })).toHaveCount(0);

  // Drag the middle node far to the right: it stops short of its right neighbor.
  const middle = page.getByRole('button', { name: 'Node 2, 2' });
  const right = page.locator('[data-node="5"]');
  const box = (await middle.boundingBox())!;
  let before = await settled();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 2000, box.y, { steps: 10 });
  await page.mouse.up();
  await expectPreviewChanged(before);
  const mx = Number(await middle.getAttribute('data-x'));
  const rx = Number(await right.getAttribute('data-x'));
  expect(mx).toBeLessThan(rx);

  // An edge node only slides along its edge.
  const edge = page.locator('[data-node="1"]');
  const y0 = await edge.getAttribute('data-y');
  const ebox = (await edge.boundingBox())!;
  await page.mouse.move(ebox.x + ebox.width / 2, ebox.y + ebox.height / 2);
  await page.mouse.down();
  await page.mouse.move(ebox.x + 60, ebox.y - 80, { steps: 5 });
  await page.mouse.up();
  await expect(edge).toHaveAttribute('data-y', y0!);

  before = await settled();
  await page.getByLabel('Columns').fill('5');
  await expect(nodes).toHaveCount(15);
  await expectPreviewChanged(before);
});
