// Pinch/zoom, pan and reset of the preview frame; the design and export are untouched.
import { expect, openApp, test } from './support/app';

test('canvas zoom: pinch zooms the frame only, drag pans, 0 and [ fit ] reset', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');
  const fit = page.getByRole('button', { name: /fit/ });
  const rect = async () => (await canvas.boundingBox())!;
  const home = await rect();
  await expect(fit).toHaveCount(0);

  // A trackpad pinch is a ctrl + wheel; it must not zoom the page.
  const viewport = page.locator('.viewport');
  const centre = { clientX: home.x + home.width / 2, clientY: home.y + home.height / 2 };
  const pinch = (deltaY: number) =>
    viewport.dispatchEvent('wheel', { deltaY, ctrlKey: true, cancelable: true, ...centre });
  await pinch(-69.3); // e^0.693 = 2
  await expect(fit).toHaveText('[ 200% · fit ]');
  const zoomed = await rect();
  expect(zoomed.width).toBeCloseTo(home.width * 2, 0);
  expect(zoomed.x + zoomed.width / 2).toBeCloseTo(home.x + home.width / 2, 0);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);

  // Dragging the background pans.
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
  await page.mouse.down();
  await page.mouse.move(home.x + home.width / 2 - 80, home.y + home.height / 2 - 40, { steps: 4 });
  await page.mouse.up();
  const panned = await rect();
  expect(panned.x - zoomed.x).toBeCloseTo(-80, 0);
  expect(panned.y - zoomed.y).toBeCloseTo(-40, 0);

  // 0 fits again.
  await page.keyboard.press('0');
  await expect(fit).toHaveCount(0);
  const back = await rect();
  expect([back.x, back.y, back.width, back.height]).toEqual([home.x, home.y, home.width, home.height]);

  // So does the button.
  await pinch(-69.3);
  await fit.click();
  await expect(fit).toHaveCount(0);
});

test('canvas zoom: handles keep their size and still drag to the right place', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');
  const home = (await canvas.boundingBox())!;
  await page.locator('.viewport').dispatchEvent('wheel', {
    deltaY: -69.3,
    ctrlKey: true,
    cancelable: true,
    clientX: home.x + home.width / 2,
    clientY: home.y + home.height / 2,
  });
  const view = (await page.locator('.viewport').boundingBox())!;

  // A handle that is on screen: zoomed in, the others are off the edge.
  let handle = page.locator('[data-point="0"]');
  for (let i = 0; i < 5; i++) {
    const b = (await page.locator(`[data-point="${i}"]`).boundingBox())!;
    if (b.x > view.x && b.x + b.width < view.x + view.width && b.y > view.y && b.y + b.height < view.y + view.height) {
      handle = page.locator(`[data-point="${i}"]`);
      break;
    }
  }
  const box = (await handle.boundingBox())!;
  expect([18, 22]).toContain(Math.round(box.width)); // 14px + border, or 18px selected: not 2x
  const before = [Number(await handle.getAttribute('data-x')), Number(await handle.getAttribute('data-y'))];
  const zoomedHeight = (await canvas.boundingBox())!.height;
  const hx = box.x + box.width / 2;
  const hy = box.y + box.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx - zoomedHeight * 0.05, hy, { steps: 5 });
  await page.mouse.up();
  expect(Number(await handle.getAttribute('data-x')) - before[0]).toBeCloseTo(-0.05, 2);
  expect(Number(await handle.getAttribute('data-y'))).toBeCloseTo(before[1], 2);
});
