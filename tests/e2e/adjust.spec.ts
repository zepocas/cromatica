// The adjust section: warp, noise and the whole-image transform.
import { WARP_SHAPES } from '../../src/design/design';
import {
  blur,
  centerOf,
  choose,
  expect,
  openApp,
  openMore,
  previewProbe,
  readPoints,
  test,
  toComposition,
} from './support/app';

test('warp controls: shape, amount, size, new variation and [ ] cycling', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const shape = page.getByLabel('Warp shape');
  await expect(shape).toHaveAttribute('data-value', 'domain');
  // The open list shows every shape without scrolling.
  await shape.click();
  const list = page.getByRole('listbox');
  await expect(list.getByRole('option')).toHaveCount(WARP_SHAPES.length);
  expect(await list.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();

  let before = await settled();
  await choose(shape, 'fbm');
  await expectPreviewChanged(before);

  before = await settled();
  await page.getByLabel('Warp', { exact: true }).fill('0.8');
  await expectPreviewChanged(before);

  before = await settled();
  await page.getByLabel('Warp size').fill('0.8');
  await expectPreviewChanged(before);

  const variation = page.getByRole('button', { name: 'New variation' });
  const seed = await variation.getAttribute('data-seed');
  before = await settled();
  await variation.click();
  await expect(variation).not.toHaveAttribute('data-seed', seed!);
  await expectPreviewChanged(before);

  // ] and [ step through the shapes (wrapping), each rendering differently.
  await blur(page);
  before = await settled();
  await page.keyboard.press(']');
  await expect(shape).toHaveAttribute('data-value', 'simplex');
  await expectPreviewChanged(before);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(shape).toHaveAttribute('data-value', 'none');
  await expect(page.getByLabel('Warp size')).toBeDisabled();
  await page.keyboard.press('[');
  await expect(shape).toHaveAttribute('data-value', WARP_SHAPES[WARP_SHAPES.length - 1]);
  await page.keyboard.press(']');
  await expect(shape).toHaveAttribute('data-value', 'none');
});

test('noise slider changes the preview', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  let before = await settled();
  await page.getByLabel('Noise').fill('0');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Noise').fill('1');
  await expectPreviewChanged(before);
});

test('transform: rotate, flip, zoom and reset move the image and the handles together', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  const handle = page.locator('[data-point="1"]');
  /** The handle's position on screen, in composition coords. */
  const onScreen = async () => toComposition(page, ...(await centerOf(handle)));
  const [x0, y0] = await onScreen();
  const pts = await readPoints(page);
  await openMore(page, 'adjust');
  const reset = page.getByRole('button', { name: 'Reset' });
  await expect(reset).toBeDisabled();

  // A quarter turn left: (x, y) → (-y, x) on screen; the stored point doesn't move.
  let before = await settled();
  await page.getByRole('button', { name: 'Rotate left' }).click();
  await expect(page.getByLabel('Rotate', { exact: true })).toHaveValue('90');
  await expectPreviewChanged(before);
  let [x, y] = await onScreen();
  expect(x).toBeCloseTo(-y0, 2);
  expect(y).toBeCloseTo(x0, 2);
  expect(await readPoints(page)).toEqual(pts);

  // Flipping horizontally mirrors what's on screen: x → -x.
  before = await settled();
  await page.getByRole('button', { name: 'Flip horizontally' }).click();
  await expectPreviewChanged(before);
  [x, y] = await onScreen();
  expect(x).toBeCloseTo(y0, 2);
  expect(y).toBeCloseTo(x0, 2);
  await expect(page.getByLabel('Rotate', { exact: true })).toHaveValue('270');

  // Zoom 2× doubles distances from the center.
  before = await settled();
  await page.getByLabel('Zoom').fill('1');
  await expect(page.locator('output', { hasText: '2.0×' })).toBeVisible();
  await expectPreviewChanged(before);
  [x, y] = await onScreen();
  expect(x).toBeCloseTo(2 * y0, 2);
  expect(y).toBeCloseTo(2 * x0, 2);

  // Reset brings back the original image exactly.
  await reset.click();
  await expect(reset).toBeDisabled();
  [x, y] = await onScreen();
  expect(x).toBeCloseTo(x0, 2);
  expect(y).toBeCloseTo(y0, 2);
});

test('vignette darkens the image; bands and edge work on every style', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  // Bands and edge are main controls; edge waits for bands.
  await expect(page.getByLabel('Edge')).toBeDisabled();
  for (const kind of ['mesh', 'linear']) {
    await choose(page.getByLabel('Gradient', { exact: true }), kind);
    let before = await settled();
    await page.getByLabel('Bands').fill('0.5');
    await expectPreviewChanged(before);
    before = await settled();
    await page.getByLabel('Edge').fill('0.6');
    await expectPreviewChanged(before);
    await page.getByLabel('Edge').fill('0');
    await page.getByLabel('Bands').fill('0');
  }

  await openMore(page, 'adjust');
  const before = await settled();
  await page.getByLabel('Vignette').fill('0.8');
  await expectPreviewChanged(before);
});

test('the band style segments pick A, B or C on a mesh and are absent on other styles', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'mesh');
  const group = page.getByRole('group', { name: 'Band style' });
  await page.getByLabel('Bands').fill('0.5');
  await expect(group.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
  for (const letter of ['B', 'C', 'A']) {
    const before = await settled();
    await group.getByRole('button', { name: letter }).click();
    await expect(group.getByRole('button', { name: letter })).toHaveAttribute('aria-pressed', 'true');
    await expectPreviewChanged(before);
  }
  await choose(page.getByLabel('Gradient', { exact: true }), 'linear');
  await expect(group).toHaveCount(0);
});

test('grid: the lines slider draws the bent grid over the colors', async ({ page }) => {
  await openApp(page);
  const { settled, expectPreviewChanged } = previewProbe(page);
  await choose(page.getByLabel('Gradient', { exact: true }), 'grid');
  const before = await settled();
  await page.getByLabel('Lines').fill('0.6');
  await expectPreviewChanged(before);
});
