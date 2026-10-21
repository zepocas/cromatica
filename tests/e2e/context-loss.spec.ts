// The preview survives the GPU taking its WebGL context away: it redraws once the context is back.
import { expect, openApp, test } from './support/app';

test('context loss: the preview redraws after the context is restored', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');
  await expect(canvas).toHaveAttribute('data-settled', 'true');
  // The canvas is drawn on in a worker, so the test asks the preview to take the context away and give it back.
  const lose = (action: 'loseContext' | 'restoreContext') =>
    page.evaluate((a) => {
      document
        .querySelector('[data-testid="preview-canvas"]')!
        .dispatchEvent(new CustomEvent('preview-debug', { detail: a }));
    }, action);

  // Compare with buf.equals: a toEqual mismatch on screenshot buffers hangs the worker.
  const before = await canvas.screenshot();

  // Losing and restoring with nothing changed draws the same picture again.
  await lose('loseContext');
  await lose('restoreContext');
  await expect(canvas).toHaveAttribute('data-settled', 'true');
  expect((await canvas.screenshot()).equals(before)).toBe(true);

  // Edits while the context is lost don't throw (the fixture fails on page errors), can't be drawn yet,
  // and show once it is back.
  await lose('loseContext');
  await page.keyboard.press(']');
  await expect(canvas).toHaveAttribute('data-settled', 'false');
  await lose('restoreContext');
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await expect(canvas).toHaveAttribute('data-settled', 'true');
});
