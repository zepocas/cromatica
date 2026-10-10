// The preview survives the GPU taking its WebGL context away: it redraws once the context is back.
import { expect, openApp, test } from './support/app';

test('context loss: the preview redraws after the context is restored', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');
  await expect(canvas).toHaveAttribute('data-settled', 'true');
  // getExtension returns null while the context is lost, so keep the object from before.
  await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    (window as unknown as { loser: unknown }).loser = c.getContext('webgl2')!.getExtension('WEBGL_lose_context');
  });
  const lose = (action: 'loseContext' | 'restoreContext') =>
    page.evaluate((a) => (window as unknown as { loser: Record<string, () => void> }).loser[a](), action);

  // Compare with buf.equals: a toEqual mismatch on screenshot buffers hangs the worker.
  const before = await canvas.screenshot();
  await lose('loseContext');
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await lose('restoreContext');
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(true);
  await expect(canvas).toHaveAttribute('data-settled', 'true');

  // Edits while the context is lost don't throw (the fixture fails on page errors) and show once it is back.
  await lose('loseContext');
  await page.keyboard.press(']');
  await lose('restoreContext');
  await expect.poll(async () => (await canvas.screenshot()).equals(before)).toBe(false);
  await expect(canvas).toHaveAttribute('data-settled', 'true');
});
