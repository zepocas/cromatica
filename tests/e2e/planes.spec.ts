// Planes and aurora: their controls and the colors they share with the ramp.
import { choose, expect, openApp, previewProbe, readHexes, test } from './support/app';

test('planes: shares the ramp colors, has count, torn and new layout, no bands or stop strip', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await choose(gradient, 'linear');
  const rampColors = await readHexes(page);

  let before = await settled();
  await choose(gradient, 'planes');
  await expectPreviewChanged(before);
  expect(await readHexes(page)).toEqual(rampColors);
  await expect(page.getByLabel('Bands')).toHaveCount(0);
  await expect(page.getByLabel('Angle')).toHaveCount(0);
  await expect(page.getByTestId('stop-strip')).toHaveCount(0);

  before = await settled();
  await page.getByLabel('Planes').fill('1');
  await expectPreviewChanged(before);

  before = await settled();
  await page.getByLabel('Torn').fill('0');
  await expectPreviewChanged(before);

  const layout = page.getByRole('button', { name: 'New layout' });
  const seed = await layout.getAttribute('data-seed');
  before = await settled();
  await layout.click();
  await expect(layout).not.toHaveAttribute('data-seed', seed!);
  await expectPreviewChanged(before);

  // With the pattern kept, shuffle stays on planes.
  await page.getByRole('button', { name: 'Lock pattern' }).click();
  before = await settled();
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expectPreviewChanged(before);
  await expect(gradient).toHaveAttribute('data-value', 'planes');
});

test('aurora: shares the ramp colors, has ribbons, glow and new layout', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await choose(gradient, 'linear');
  const rampColors = await readHexes(page);
  let before = await settled();
  await choose(gradient, 'aurora');
  await expectPreviewChanged(before);
  expect(await readHexes(page)).toEqual(rampColors);
  await expect(page.getByTestId('stop-strip')).toHaveCount(0);
  await expect(page.getByLabel('Bands')).toHaveCount(0);

  before = await settled();
  await page.getByLabel('Ribbons').fill('1');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Glow').fill('0.9');
  await expectPreviewChanged(before);
  const layout = page.getByRole('button', { name: 'New aurora layout' });
  const seed = await layout.getAttribute('data-seed');
  before = await settled();
  await layout.click();
  await expect(layout).not.toHaveAttribute('data-seed', seed!);
  await expectPreviewChanged(before);
});

test('planes: drag a plane on the image, reorder the stack, undo and reset', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'planes');
  await page.getByRole('button', { name: 'Arrange layout' }).click();
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();

  // The topmost plane whose center is in the frame: its outline polygon is where the pointer lands.
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const planes = page.locator('[data-plane]');
  const centers = await planes.evaluateAll((els) =>
    els.map((el) => {
      const poly = el as SVGPolygonElement;
      const pts = Array.from(poly.points);
      const m = poly.ownerSVGElement!.getScreenCTM()!;
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      return { id: poly.dataset.plane!, x: m.a * cx + m.e, y: m.d * cy + m.f };
    }),
  );
  const inside = (c: { x: number; y: number }) =>
    c.x > canvas.x + 20 &&
    c.x < canvas.x + canvas.width - 20 &&
    c.y > canvas.y + 20 &&
    c.y < canvas.y + canvas.height - 20;
  const target = centers.filter(inside).at(-1)!;
  expect(target).toBeTruthy();
  const plane = page.locator(`[data-plane="${target.id}"]`);
  const outline = await plane.getAttribute('points');

  const before = await settled();
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x + canvas.height * 0.15, target.y + canvas.height * 0.1, { steps: 6 });
  await page.mouse.up();
  await expect(plane).toHaveAttribute('aria-pressed', 'true');
  expect(await plane.getAttribute('points')).not.toBe(outline);
  await expectPreviewChanged(before);
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeEnabled();

  // One drag is one undo step.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(plane).toHaveAttribute('points', outline!);
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo' }).click();
  expect(await plane.getAttribute('points')).not.toBe(outline);

  // Stack buttons move the plane one step; the readout and the drawing order follow (the outlines are in drawing order).
  const readout = page.getByLabel('Picked plane');
  const order = () => planes.evaluateAll((els) => els.map((el) => (el as SVGElement).dataset.plane!));
  const place = Number((await readout.textContent())!.split(' / ')[0]);
  expect(place).toBeGreaterThan(1);
  const stacked = await order();
  expect(stacked.indexOf(target.id)).toBe(place - 1);
  await page.getByRole('button', { name: 'back', exact: true }).click();
  await expect(readout).toHaveText(`${place - 1} / ${stacked.length}`);
  const behind = await order();
  expect(behind.indexOf(target.id)).toBe(place - 2);
  expect([...behind].sort()).toEqual([...stacked].sort());
  await page.getByRole('button', { name: 'forward', exact: true }).click();
  expect(await order()).toEqual(stacked);

  await page.getByRole('button', { name: 'Reset all' }).click();
  await expect(plane).toHaveAttribute('points', outline!);
  await expect(page.getByRole('button', { name: 'Reset all' })).toBeDisabled();

  // The default design has a warp: the group says the outlines are close, not exact, and none of it breaks without one.
  await expect(page.getByText('outlines are close')).toBeVisible();
  await choose(page.getByLabel('Warp shape'), 'none');
  await expect(page.getByText('outlines are close')).toHaveCount(0);
  await expect(page.locator('[data-plane]')).not.toHaveCount(0);
});

test('planes and blobs: stay pickable when the mesh points toggle is off', async ({ page }) => {
  await openApp(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  await choose(page.getByLabel('Mesh points'), 'off');
  await choose(gradient, 'planes');
  await expect(page.locator('[data-plane]').first()).toBeAttached();
  await expect(page.getByTestId('planes-overlay')).not.toHaveCSS('pointer-events', 'none');
  await choose(gradient, 'blobs');
  await expect(page.getByTestId('planes-overlay')).not.toHaveCSS('pointer-events', 'none');
});
