// The preview draws in a worker where it can (D93) and on the main thread otherwise (`?mainthread`); both show the same picture.
import type { Locator, Page } from '@playwright/test';
import { expect, previewProbe, test } from './support/app';

/** Whether the page can use the canvas's own WebGL context (it cannot once a worker owns the canvas). */
const pageOwnsCanvas = (canvas: Locator) =>
  canvas.evaluate((c: HTMLCanvasElement) => {
    try {
      return c.getContext('webgl2') !== null;
    } catch {
      return false;
    }
  });

const draws = async (page: Page, url: string) => {
  await page.goto(url);
  const { canvas, settled, expectPreviewChanged } = previewProbe(page);
  const first = await settled();
  await page.keyboard.press('Space');
  await expectPreviewChanged(first);
  return { canvas, first };
};

test('the preview draws and follows a shuffle in a worker and on the main thread', async ({ page }) => {
  const inWorker = await draws(page, '/?default');
  // A canvas handed to a worker can no longer be given a context on the page.
  expect(await pageOwnsCanvas(inWorker.canvas)).toBe(false);

  const onPage = await draws(page, '/?default&mainthread');
  expect(await pageOwnsCanvas(onPage.canvas)).toBe(true);

  // Same design, same pixels, wherever the drawing runs.
  expect(onPage.first.equals(inWorker.first)).toBe(true);
});
