// The adjust section: warp, noise and the whole-image transform.
import { WARP_SHAPES } from '../../src/design/design';
import {
  blur,
  centerOf,
  choose,
  expect,
  openApp,
  openFinish,
  openMore,
  previewProbe,
  readPoints,
  test,
  toComposition,
} from './support/app';

test('warp controls: shape, amount, size, new variation and , . cycling', async ({ page }) => {
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
  await page.keyboard.press('.');
  await expect(shape).toHaveAttribute('data-value', 'simplex');
  await expectPreviewChanged(before);
  await page.keyboard.press(',');
  await page.keyboard.press(',');
  await page.keyboard.press(',');
  await expect(shape).toHaveAttribute('data-value', 'none');
  await expect(page.getByLabel('Warp size')).toBeDisabled();
  await page.keyboard.press(',');
  await expect(shape).toHaveAttribute('data-value', WARP_SHAPES[WARP_SHAPES.length - 1]);
  await page.keyboard.press('.');
  await expect(shape).toHaveAttribute('data-value', 'none');
});

test('noise slider changes the preview', async ({ page }) => {
  await openApp(page);
  await openFinish(page, 'noise');
  const { settled, expectPreviewChanged } = previewProbe(page);
  let before = await settled();
  await page.getByLabel('Noise amount').fill('1');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Noise amount').fill('0');
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
  await page.getByRole('slider', { name: 'Zoom', exact: true }).fill('1');
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

test('transform: alt-drag moves the image and the handles with it, even from a handle; reset centres it', async ({
  page,
}) => {
  await openApp(page);
  const handle = page.locator('[data-point="1"]');
  const onScreen = async () => toComposition(page, ...(await centerOf(handle)));
  const [x0, y0] = await onScreen();
  const pts = await readPoints(page);
  await openMore(page, 'adjust');
  const reset = page.getByRole('button', { name: 'Reset' });
  await expect(reset).toBeDisabled();

  // Grabbing a handle with Alt moves the image, not the point.
  const [cx, cy] = await centerOf(handle);
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy - 30, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');

  // Up and to the right on screen is +x, +y; the frame is canvas.height tall, one unit.
  const [x, y] = await onScreen();
  expect(x - x0).toBeCloseTo(60 / canvas.height, 2);
  expect(y - y0).toBeCloseTo(30 / canvas.height, 2);
  expect(await readPoints(page)).toEqual(pts);
  await expect(reset).toBeEnabled();

  await reset.click();
  await expect(reset).toBeDisabled();
  const [x1, y1] = await onScreen();
  expect(x1).toBeCloseTo(x0, 2);
  expect(y1).toBeCloseTo(y0, 2);
});

test('transform: the move pad is a view and a heavy one: slow drags move it less, fast ones more, Shift least', async ({
  page,
}) => {
  await openApp(page);
  const handle = page.locator('[data-point="1"]');
  const onScreen = async () => toComposition(page, ...(await centerOf(handle)));
  const [x0, y0] = await onScreen();
  await openMore(page, 'adjust');
  const pad = page.getByRole('button', { name: /^Move, x/ });
  const centre = page.getByRole('button', { name: 'Centre the image' });
  await expect(centre).toBeDisabled();
  const box = (await pad.boundingBox())!;
  const mid = [box.x + box.width / 2, box.y + box.height / 2];
  const reading = async () => {
    const m = /x ([+−]\d\.\d+), y ([+−]\d\.\d+)/.exec((await pad.getAttribute('aria-label'))!)!;
    return [m[1], m[2]].map((v) => Number(v.replace('−', '-')));
  };
  /** One drag of 20 px to the right in `steps` moves, `pause` ms apart, from the centre; leaves the pad centred again. */
  const drag = async (steps: number, pause: number, shift = false) => {
    await pad.dblclick();
    await page.mouse.move(mid[0], mid[1]);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(mid[0] + (20 * i) / steps, mid[1]);
      if (pause) await page.waitForTimeout(pause);
    }
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
    return (await reading())[0];
  };

  const fast = await drag(1, 0);
  const slow = await drag(10, 60);
  const fine = await drag(1, 0, true);
  expect(slow).toBeGreaterThan(0);
  expect(slow).toBeLessThan(fast * 0.7);
  expect(fine).toBeLessThan(slow);
  // Even a fast drag is not faster than the pointer: 20 px of a 96 px pad is at most 20/96 of its span.
  expect(fast).toBeLessThanOrEqual((20 / box.width) * 2 + 1e-9);

  // The dot going right and up looks right and up: the image goes left and down (a handle near the top
  // would leave the frame going up). The arrows step exactly.
  await pad.dblclick();
  await pad.focus();
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(key);
  await expect(pad).toHaveAccessibleName(/x \+0\.03, y \+0\.02/);
  await page.keyboard.press('ArrowLeft');
  await expect(pad).toHaveAccessibleName(/x \+0\.02/);
  let [x, y] = await onScreen();
  expect(x - x0).toBeCloseTo(-0.02, 2);
  expect(y - y0).toBeCloseTo(-0.02, 2);
  await expect(centre).toBeEnabled();

  // Double-click on the pad centres.
  await pad.dblclick();
  await expect(centre).toBeDisabled();
  [x, y] = await onScreen();
  expect(x).toBeCloseTo(x0, 2);
  expect(y).toBeCloseTo(y0, 2);
});

test('transform: a ghost tip always lists the image gestures; alt-scroll zooms about the pointer', async ({ page }) => {
  await openApp(page);
  const tip = page.getByRole('note').filter({ hasText: 'alt-drag move the image' });
  await expect(tip).toContainText('alt-scroll zoom it');

  // The point under the pointer stays under it, so what is zoomed into is what was pointed at.
  const handle = page.locator('[data-point="1"]');
  const [cx, cy] = await centerOf(handle);
  const before = await toComposition(page, cx, cy);
  await openMore(page, 'adjust');
  const viewport = page.locator('.viewport');
  await viewport.dispatchEvent('wheel', { deltaY: -20, altKey: true, cancelable: true, clientX: cx, clientY: cy });
  await viewport.dispatchEvent('wheel', { deltaY: -20, altKey: true, cancelable: true, clientX: cx, clientY: cy });
  await expect(page.getByRole('slider', { name: 'Zoom', exact: true })).not.toHaveValue('0');
  const [x, y] = await toComposition(page, ...(await centerOf(handle)));
  expect(x).toBeCloseTo(before[0], 2);
  expect(y).toBeCloseTo(before[1], 2);

  // Still there after moving the image, and with the view zoomed in on its own.
  await expect(tip).toBeVisible();
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
