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
