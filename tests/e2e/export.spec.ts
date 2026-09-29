import { expect, test, type Page } from '@playwright/test';
import type { Harness } from './harness/export';

async function openHarness(page: Page) {
  await page.goto('/tests/e2e/harness/export.html');
  await page.waitForFunction(() => window.harnessReady === true);
}

function call<K extends keyof Harness>(page: Page, name: K, ...args: Parameters<Harness[K]>) {
  return page.evaluate(
    ([n, a]) => (window.harness[n] as (...x: unknown[]) => unknown)(...a),
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<Harness[K]>>>;
}

test.describe('export pipeline', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', (err) => console.log('[pageerror]', err.message));
    await openHarness(page);
  });

  test('tiled 5120×2880 PNG is byte-identical (RGB) to a single-pass render', async ({ page }) => {
    test.setTimeout(300_000);
    const r = await call(page, 'exportVsSinglePass', 5120, 2880);
    console.log(`5K PNG export: ${r.exportMs.toFixed(0)} ms, ${r.tiles} tiles; single-pass ${r.referenceMs.toFixed(0)} ms`);
    expect([r.width, r.height]).toEqual([5120, 2880]);
    expect(r.tiles).toBeGreaterThan(1);
    expect(r.firstMismatch).toBeNull();
    expect(r.mismatches).toBe(0);
  });

  test('small tiles with ragged edges also match single-pass', async ({ page }) => {
    const r = await call(page, 'exportVsSinglePass', 1000, 777, 256);
    expect([r.width, r.height]).toEqual([1000, 777]);
    expect(r.tiles).toBe(4 * 4);
    expect(r.firstMismatch).toBeNull();
  });

  test('preview render at W×H equals exported PNG at W×H', async ({ page }) => {
    const r = await call(page, 'previewVsExport', 2560, 1440);
    expect([r.width, r.height]).toEqual([2560, 1440]);
    expect(r.firstMismatch).toBeNull();
    expect(r.mismatches).toBe(0);
  });

  test('main thread stays responsive during a 5K export', async ({ page }) => {
    test.setTimeout(300_000);
    const r = await call(page, 'responsiveness', 5120, 2880);
    console.log(
      `responsiveness: export ${r.exportMs.toFixed(0)} ms, ${r.frames} frames, max rAF gap ${r.maxGap.toFixed(1)} ms, ` +
        `longtasks ${r.longtaskCount} (longest ${r.longestLongtask.toFixed(0)} ms, total ${r.totalLongtaskMs.toFixed(0)} ms)`,
    );
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.maxGap).toBeLessThan(200);
  });

  test('abort rejects with AbortError and a later export succeeds', async ({ page }) => {
    const r = await call(page, 'cancelThenExport');
    expect(r.errorName).toBe('AbortError');
    expect(r.tilesAtAbort).toBeLessThan(r.tilesTotal);
    expect(r.preAborted).toBe('AbortError');
    expect(r.after).toEqual({ type: 'image/png', width: 320, height: 200 });
  });

  test('JPEG export returns image/jpeg with correct dimensions', async ({ page }) => {
    const r = await call(page, 'exportJpeg', 3440, 1440);
    expect(r.type).toBe('image/jpeg');
    expect([r.width, r.height]).toEqual([3440, 1440]);
  });
});

test('app loads, shows a canvas, and Export downloads a file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  const canvas = page.getByTestId('preview-canvas');
  await expect(canvas).toBeVisible();

  await page.getByLabel('Device preset').selectOption('custom');
  await page.getByLabel('Custom width').fill('320');
  await page.getByLabel('Custom width').press('Tab');
  await page.getByLabel('Custom height').fill('200');
  await page.getByLabel('Custom height').press('Tab');

  // Letterboxed to 16:10 (layout is applied on the next animation frame).
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return box ? box.width / box.height : 0;
    })
    .toBeCloseTo(1.6, 2);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('gradient-320x200.png');
  expect(errors).toEqual([]);
});

test('stop editor: add, drag, blend mode and delete update the preview', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  const canvas = page.getByTestId('preview-canvas');
  const strip = page.getByTestId('stop-strip');
  const handles = page.getByRole('slider', { name: /^Stop \d+$/ });
  await expect(canvas).toBeVisible();
  await expect(handles).toHaveCount(3);

  // The preview drops to low resolution while editing; wait for the sharp redraw.
  const settled = async () => {
    await page.waitForTimeout(400);
    return canvas.screenshot();
  };
  // Poll until the settled preview differs from `before`.
  const expectPreviewChanged = async (before: Awaited<ReturnType<typeof settled>>) => {
    await expect.poll(async () => (await settled()).equals(before), { timeout: 5_000 }).toBe(false);
  };

  // Click on the empty strip at 25% → new stop there, selected.
  let before = await settled();
  const box = (await strip.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + 6);
  await expect(handles).toHaveCount(4);
  const added = page.getByRole('slider', { name: 'Stop 4' });
  await expect(added).toHaveAttribute('aria-valuenow', '25');
  await expect(added).toBeFocused();

  // Dragging a handle moves the stop and changes the image.
  before = await settled();
  const mid = page.getByRole('slider', { name: 'Stop 2' });
  const hb = (await mid.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, hb.y + hb.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(mid).toHaveAttribute('aria-valuenow', '80');
  await expectPreviewChanged(before);

  // Keyboard: arrows nudge the focused stop.
  await mid.focus();
  await mid.press('ArrowLeft');
  await expect(mid).toHaveAttribute('aria-valuenow', '79');

  // Blend mode of the selected stop's segment.
  before = await settled();
  await page.getByLabel('Blend to next stop').selectOption({ label: 'Hue (long)' });
  await expectPreviewChanged(before);

  // Picking a color through the picker updates the stop.
  before = await settled();
  await page.getByLabel('Stop color').fill('#00ff80');
  await expectPreviewChanged(before);

  // Delete removes stops but never below 2.
  const first = page.getByRole('slider', { name: 'Stop 1' });
  for (let i = 0; i < 4; i++) {
    await first.focus();
    await first.press('Delete');
  }
  await expect(handles).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Remove stop' })).toBeDisabled();
  expect(errors).toEqual([]);
});
