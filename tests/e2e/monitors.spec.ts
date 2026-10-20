// The view section: the multi-monitor layout over the wallpaper (Phase 2).
import type { Locator, Page } from '@playwright/test';
import { choose, expect, openApp, previewProbe, test } from './support/app';

const toggle = (page: Page) => page.getByRole('button', { name: 'Monitors', exact: true });
const monitor = (page: Page, id: number) => page.locator(`[data-monitor="${id}"]`);
/** Position and size in physical units (hundredths of an inch). */
const physical = async (m: Locator) => ({
  x: Number(await m.getAttribute('data-x')),
  y: Number(await m.getAttribute('data-y')),
  w: Number(await m.getAttribute('data-w')),
  h: Number(await m.getAttribute('data-h')),
});

async function drag(page: Page, m: Locator, dx: number, dy: number, shift = false) {
  const box = (await m.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test('the monitors button lays two joined monitors over the preview without changing it', async ({ page }) => {
  await openApp(page);
  const { settled } = previewProbe(page);
  const before = await settled();
  await expect(page.getByTestId('monitors-overlay')).toHaveCount(0);
  await toggle(page).click();
  await expect(page.getByTestId('monitors-overlay')).toBeVisible();
  await expect(page.locator('[data-monitor]')).toHaveCount(2);
  const [a, b] = [await physical(monitor(page, 1)), await physical(monitor(page, 2))];
  expect(b.x).toBe(a.x + a.w);
  expect(b.y).toBe(a.y);
  expect((await settled()).equals(before)).toBe(true);
  await toggle(page).click();
  await expect(page.getByTestId('monitors-overlay')).toHaveCount(0);
});

test('a monitor has an aspect ratio and a diagonal, and can be turned', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const before = await physical(monitor(page, 2));
  expect(before.w / before.h).toBeCloseTo(16 / 9, 1);

  await page.getByLabel('Monitor 2 diagonal in inches').fill('32');
  await page.getByLabel('Monitor 2 diagonal in inches').blur();
  const bigger = await physical(monitor(page, 2));
  expect(bigger.w / before.w).toBeCloseTo(32 / 27, 1);

  await choose(page.getByLabel('Monitor 2 aspect ratio'), '21:9');
  const wide = await physical(monitor(page, 2));
  expect(wide.w / wide.h).toBeCloseTo(43 / 18, 1);

  await page.getByRole('button', { name: 'Turn monitor 2' }).click();
  const turned = await physical(monitor(page, 2));
  expect([turned.w, turned.h]).toEqual([wide.h, wide.w]);
  expect(turned.x).toBe((await physical(monitor(page, 1))).w);
});

test('a dragged monitor snaps against the other and never floats free', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const before = await physical(monitor(page, 2));
  await drag(page, monitor(page, 2), -30, 100);
  const a = await physical(monitor(page, 1));
  const b = await physical(monitor(page, 2));
  expect(b).not.toEqual(before);
  const sideBySide = b.x === a.x + a.w || a.x === b.x + b.w;
  const stacked = b.y === a.y + a.h || a.y === b.y + b.h;
  expect(sideBySide || stacked).toBe(true);
  expect(a).toEqual(await physical(monitor(page, 1)));
});

test('span: Shift-drag slides the wallpaper under the block, the monitors keep their layout', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const first = monitor(page, 1);
  const [phys0, box0, box0b] = [
    await physical(first),
    (await first.boundingBox())!,
    (await monitor(page, 2).boundingBox())!,
  ];
  await drag(page, first, 0, 20, true);
  expect(await physical(first)).toEqual(phys0);
  const [box, boxb] = [(await first.boundingBox())!, (await monitor(page, 2).boundingBox())!];
  expect(box.y).toBeGreaterThan(box0.y);
  expect(box.y - box0.y).toBeCloseTo(boxb.y - box0b.y, 0);
  expect(box.x).toBeCloseTo(box0.x, 0);
});

test('span: moving one monitor never re-centres the wallpaper, and the block can reach the top corner', async ({
  page,
}) => {
  await openApp(page);
  await toggle(page).click();
  const first = monitor(page, 1);
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  const before = (await first.boundingBox())!;
  // Slide the second monitor under the first and back out: the first stays where it is on the image.
  await drag(page, monitor(page, 2), -100, 150);
  await drag(page, monitor(page, 2), 100, -150);
  const after = (await first.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeCloseTo(before.y, 0);
  // All the way up and to the left with Shift-drag: the block meets the corner of the image.
  await drag(page, first, -3000, -3000, true);
  const corner = (await first.boundingBox())!;
  expect(corner.y).toBeCloseTo(canvas.y, 0);
  expect(corner.x).toBeCloseTo(canvas.x, 0);
});

test('span: a monitor cannot be dragged off the wallpaper', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const canvas = (await page.getByTestId('preview-canvas').boundingBox())!;
  for (const [dx, dy] of [
    [2000, 2000],
    [-2000, -2000],
  ]) {
    await drag(page, monitor(page, 2), dx, dy);
    const box = (await monitor(page, 2).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(canvas.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(canvas.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);
  }
});

test('a 32 inch and a 27 inch can be stacked, and the wallpaper follows the new block', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  await page.getByLabel('Monitor 1 diagonal in inches').fill('32');
  await page.getByLabel('Monitor 1 diagonal in inches').blur();
  const canvas = page.getByTestId('preview-canvas');
  await drag(page, monitor(page, 2), -300, 400);
  const [a, b] = [await physical(monitor(page, 1)), await physical(monitor(page, 2))];
  expect(b.y).toBe(a.y + a.h);
  // Stacked, the block is taller than the old image covered, so the image was re-fitted to it.
  const frame = (await canvas.boundingBox())!;
  for (const id of [1, 2]) {
    const box = (await monitor(page, id).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }
});

test('the 16:18 DualUp shape is there', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  await choose(page.getByLabel('Monitor 2 aspect ratio'), '16:18');
  const m = await physical(monitor(page, 2));
  expect(m.w / m.h).toBeCloseTo(16 / 18, 1);
});

test('a secondary monitor turned to portrait draws the OS at the same size, not blown up', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('OS context'), 'macos');
  await toggle(page).click();
  const menuBar = (m: Locator) => m.locator('[data-zone="menu bar"]').boundingBox();
  const wide = (await menuBar(monitor(page, 2)))!;
  await page.getByRole('button', { name: 'Turn monitor 2' }).click();
  const tall = (await menuBar(monitor(page, 2)))!;
  const screen = (await monitor(page, 2).boundingBox())!;
  // The menu bar is as high, against the screen's width, as it was against the landscape one's height.
  expect(tall.height / screen.width).toBeCloseTo(wide.height / (wide.width / (16 / 9)), 1);
});

test('stretch: the wallpaper is bent to the monitors, which keep their shape, and nothing slides', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const canvas = page.getByTestId('preview-canvas');
  expect((await canvas.boundingBox())!.width / (await canvas.boundingBox())!.height).toBeCloseTo(16 / 9, 1);
  await page.getByRole('button', { name: 'stretch' }).click();
  // Two 16:9 monitors side by side: the frame is 32:9 and each monitor is still 16:9.
  await expect
    .poll(async () => {
      const box = (await canvas.boundingBox())!;
      return box.width / box.height;
    })
    .toBeCloseTo(32 / 9, 1);
  const box0 = (await monitor(page, 1).boundingBox())!;
  expect(box0.width / box0.height).toBeCloseTo(16 / 9, 1);
  await drag(page, monitor(page, 1), 0, 20, true);
  expect((await monitor(page, 1).boundingBox())!.y).toBeCloseTo(box0.y, 0);
  await page.getByRole('button', { name: 'span' }).click();
  await expect
    .poll(async () => {
      const box = (await canvas.boundingBox())!;
      return box.width / box.height;
    })
    .toBeCloseTo(16 / 9, 1);
});

test('arrow keys move one monitor, Shift slides the wallpaper', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  const b0 = await physical(monitor(page, 2));
  await monitor(page, 2).focus();
  await page.keyboard.press('ArrowDown');
  const b1 = await physical(monitor(page, 2));
  expect(b1.y).toBeGreaterThan(b0.y);
  const box = (await monitor(page, 1).boundingBox())!;
  await page.keyboard.press('Shift+ArrowDown');
  expect(await physical(monitor(page, 2))).toEqual(b1);
  expect((await monitor(page, 1).boundingBox())!.y).toBeGreaterThan(box.y);
});

test('monitors can be added, removed and reset', async ({ page }) => {
  await openApp(page);
  await toggle(page).click();
  await page.getByRole('button', { name: 'add monitor' }).click();
  await expect(page.locator('[data-monitor]')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove monitor 2' }).click();
  await expect(page.locator('[data-monitor]')).toHaveCount(2);
  await page.getByRole('button', { name: 'reset' }).click();
  await expect(page.locator('[data-monitor]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Remove monitor 1' })).toBeEnabled();
});

test('the OS context is drawn inside each monitor: all of it on the primary, a secondary screen on the rest', async ({
  page,
}) => {
  await openApp(page);
  await choose(page.getByLabel('OS context'), 'macos');
  await toggle(page).click();
  // One context per monitor, none over the whole image.
  await expect(page.getByTestId('context-overlay')).toHaveCount(2);
  const first = monitor(page, 1);
  const second = monitor(page, 2);
  await expect(first.locator('[data-zone="dock"]')).toHaveCount(1);
  await expect(first.locator('[data-zone="notch"]')).toHaveCount(1);
  await expect(second.locator('[data-zone="menu bar"]')).toHaveCount(1);
  await expect(second.locator('[data-zone="dock"]')).toHaveCount(1);
  await expect(second.locator('[data-zone="notch"]')).toHaveCount(0);
  await expect(second.locator('[data-zone="desktop icons"]')).toHaveCount(0);
  await choose(page.getByLabel('OS context'), 'windows');
  await expect(second.locator('[data-zone="taskbar"]')).toHaveCount(1);
  await expect(second.locator('[data-zone="taskbar apps"]')).toHaveCount(1);
  await expect(second.locator('[data-zone="desktop icons"]')).toHaveCount(0);
  await expect(first.locator('[data-zone="desktop icons"]')).toHaveCount(1);
});

test('the phone contexts are greyed out while the monitors are on, and a chosen one is dropped', async ({ page }) => {
  await openApp(page);
  await choose(page.getByLabel('OS context'), 'ios-lock');
  await toggle(page).click();
  await expect(page.getByLabel('OS context')).toHaveAttribute('data-value', 'off');
  await page.getByLabel('OS context').click();
  const list = page.getByRole('listbox');
  await expect(list.locator('[data-value="ios-lock"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(list.locator('[data-value="android-home"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(list.locator('[data-value="macos"]')).not.toHaveAttribute('aria-disabled', 'true');
  // A click on a greyed-out phone does nothing.
  await list.locator('[data-value="ios-lock"]').click({ force: true });
  await expect(page.getByLabel('OS context')).toHaveAttribute('data-value', 'off');
  await page.keyboard.press('Escape');
  await toggle(page).click();
  await choose(page.getByLabel('OS context'), 'ios-lock');
  await expect(page.getByLabel('OS context')).toHaveAttribute('data-value', 'ios-lock');
});
