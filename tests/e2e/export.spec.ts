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

  test('tiled 5120×2880 mesh PNG is byte-identical (RGB) to a single-pass render', async ({ page }) => {
    test.setTimeout(300_000);
    const r = await call(page, 'exportVsSinglePass', 5120, 2880, undefined, 'mesh');
    console.log(`5K mesh PNG export: ${r.exportMs.toFixed(0)} ms, ${r.tiles} tiles; single-pass ${r.referenceMs.toFixed(0)} ms`);
    expect([r.width, r.height]).toEqual([5120, 2880]);
    expect(r.tiles).toBeGreaterThan(1);
    expect(r.firstMismatch).toBeNull();
    expect(r.mismatches).toBe(0);
  });

  test('mesh: small ragged tiles match single-pass', async ({ page }) => {
    const r = await call(page, 'exportVsSinglePass', 1000, 777, 256, 'mesh');
    expect(r.tiles).toBe(4 * 4);
    expect(r.firstMismatch).toBeNull();
  });

  test('mesh: preview render at W×H equals exported PNG at W×H', async ({ page }) => {
    const r = await call(page, 'previewVsExport', 2560, 1440, 'mesh');
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
  await page.getByRole('radio', { name: 'Gradient' }).click();
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

test('mesh editor: drag, add, delete, switch pattern and hide handles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  const canvas = page.getByTestId('preview-canvas');
  const overlay = page.getByTestId('mesh-overlay');
  const points = page.getByRole('button', { name: /^Point \d+$/ });
  await expect(canvas).toBeVisible();

  // Starts on Mesh with the default points.
  await expect(page.getByRole('radio', { name: 'Mesh' })).toHaveAttribute('aria-checked', 'true');
  await expect(points).toHaveCount(5);

  // Screenshot of the rendered image only (overlay and panel hidden), after the sharp redraw.
  const settled = async () => {
    await page.waitForTimeout(400);
    return canvas.screenshot({ style: 'aside, [data-testid="mesh-overlay"] { visibility: hidden; }' });
  };
  const expectPreviewChanged = async (before: Awaited<ReturnType<typeof settled>>) => {
    await expect.poll(async () => (await settled()).equals(before), { timeout: 5_000 }).toBe(false);
  };
  const coords = async (i: number) => {
    const h = page.locator(`[data-point="${i}"]`);
    return [Number(await h.getAttribute('data-x')), Number(await h.getAttribute('data-y'))];
  };

  // The overlay covers the canvas exactly.
  const cb = (await canvas.boundingBox())!;
  const ob = (await overlay.boundingBox())!;
  expect(ob.x).toBeCloseTo(cb.x, 0);
  expect(ob.y).toBeCloseTo(cb.y, 0);
  expect(ob.width).toBeCloseTo(cb.width, 0);
  expect(ob.height).toBeCloseTo(cb.height, 0);

  // Handle sits where the composition convention puts its point.
  const [x0, y0] = await coords(1);
  const hb = (await points.nth(1).boundingBox())!;
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  expect(hx).toBeCloseTo(cb.x + cb.width / 2 + x0 * cb.height, 0);
  expect(hy).toBeCloseTo(cb.y + cb.height / 2 - y0 * cb.height, 0);

  // Drag right and down → x grows, y shrinks (+y is up), image changes.
  let before = await settled();
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + cb.height * 0.2, hy + cb.height * 0.1, { steps: 6 });
  await page.mouse.up();
  const [x1, y1] = await coords(1);
  expect(x1 - x0).toBeCloseTo(0.2, 1);
  expect(y1 - y0).toBeCloseTo(-0.1, 1);
  await expect(points.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expectPreviewChanged(before);

  // Arrow keys nudge the selected point.
  await page.keyboard.press('ArrowUp');
  expect((await coords(1))[1]).toBeCloseTo(y1 + 0.01, 3);

  // Double-click empty canvas adds a selected point there.
  before = await settled();
  const ax = cb.x + cb.width * 0.3;
  const ay = cb.y + cb.height * 0.75;
  await page.mouse.dblclick(ax, ay);
  await expect(points).toHaveCount(6);
  await expect(points.nth(5)).toHaveAttribute('aria-pressed', 'true');
  const [nx, ny] = await coords(5);
  expect(nx).toBeCloseTo((ax - cb.x - cb.width / 2) / cb.height, 2);
  expect(ny).toBeCloseTo((cb.y + cb.height / 2 - ay) / cb.height, 2);
  await expect(page.getByText('Point 6 of 6')).toBeVisible();

  // Editing the selected point's color changes the image.
  await page.getByLabel('Point color').fill('#00ff80');
  await expectPreviewChanged(before);

  // "Add point" then a click also adds one.
  await page.getByRole('button', { name: 'Add point' }).click();
  await page.mouse.click(cb.x + cb.width * 0.8, cb.y + cb.height * 0.5);
  await expect(points).toHaveCount(7);

  // Delete removes the selected point.
  await page.keyboard.press('Delete');
  await expect(points).toHaveCount(6);
  await page.keyboard.press('Backspace');
  await expect(points).toHaveCount(5);
  const edited = await coords(1);

  // Switch to Gradient and back: the mesh edits are kept.
  await page.getByRole('radio', { name: 'Gradient' }).click();
  await expect(points).toHaveCount(0);
  await expect(page.getByTestId('stop-strip')).toBeVisible();
  await page.getByRole('radio', { name: 'Mesh' }).click();
  await expect(points).toHaveCount(5);
  expect(await coords(1)).toEqual(edited);

  // H hides the handles (and the image stays the same), H again shows them.
  before = await settled();
  await page.keyboard.press('h');
  await expect(points).toHaveCount(0);
  expect((await settled()).equals(before)).toBe(true);
  await page.keyboard.press('h');
  await expect(points).toHaveCount(5);
  await page.getByRole('button', { name: /Hide points/ }).click();
  await expect(points).toHaveCount(0);
  expect(errors).toEqual([]);
});
