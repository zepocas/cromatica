import { expect, test, type Page } from '@playwright/test';
import { WARP_SHAPES } from '../../src/design/design';
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

  test('every warp shape: small ragged tiles match single-pass, gradient and mesh', async ({ page }) => {
    test.setTimeout(300_000);
    for (const pattern of ['linear', 'mesh'] as const) {
      for (const shape of WARP_SHAPES) {
        const r = await call(page, 'exportVsSinglePass', 600, 450, 256, pattern, shape);
        expect(r.tiles, `${pattern}/${shape}`).toBe(3 * 2);
        expect(r.firstMismatch, `${pattern}/${shape}`).toBeNull();
      }
    }
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

/** Screenshots of the rendered image only (panel and handles hidden), after the sharp redraw. */
function previewProbe(page: Page) {
  const canvas = page.getByTestId('preview-canvas');
  const settled = async () => {
    await page.waitForTimeout(400);
    return canvas.screenshot({ style: 'aside, [data-testid="mesh-overlay"] { visibility: hidden; }' });
  };
  const expectPreviewChanged = async (before: Awaited<ReturnType<typeof settled>>) => {
    await expect.poll(async () => (await settled()).equals(before), { timeout: 5_000 }).toBe(false);
  };
  return { canvas, settled, expectPreviewChanged };
}

async function readPoints(page: Page) {
  return page.locator('[data-point]').evaluateAll((els) =>
    els.map((el) => ({
      pos: `${el.getAttribute('data-x')} ${el.getAttribute('data-y')} ${el.getAttribute('data-r')}`,
      color: el.getAttribute('data-color')!,
    })),
  );
}

async function readWarp(page: Page) {
  return {
    shape: await page.getByLabel('Warp shape').inputValue(),
    amount: await page.getByLabel('Warp', { exact: true }).inputValue(),
    size: await page.getByLabel('Warp size').inputValue(),
    seed: await page.getByRole('button', { name: 'New variation' }).getAttribute('data-seed'),
  };
}

const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test('shuffle: button, Space, color and layout locks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  const { canvas, settled, expectPreviewChanged } = previewProbe(page);
  await expect(canvas).toBeVisible();
  const shuffle = page.getByRole('button', { name: /^Shuffle/ });
  const lockColors = page.getByRole('button', { name: 'Lock colors' });
  const lockLayout = page.getByRole('button', { name: 'Lock layout' });
  await expect(page.locator('[data-point]')).toHaveCount(5);

  // Plain shuffle changes the image.
  let before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);

  // Colors locked: layout changes, every color is one of the old ones.
  await lockColors.click();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'true');
  let pts = await readPoints(page);
  await shuffle.click();
  let next = await readPoints(page);
  expect(next.map((p) => p.pos)).not.toEqual(pts.map((p) => p.pos));
  const oldColors = new Set(pts.map((p) => p.color));
  for (const p of next) expect(oldColors.has(p.color)).toBe(true);

  // Space shuffles, even with a button focused (without clicking that button).
  await lockColors.click();
  await expect(lockColors).toBeFocused();
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  pts = await readPoints(page);
  before = await settled();
  await page.keyboard.press('Space');
  await expect(lockColors).toHaveAttribute('aria-pressed', 'false');
  await expectPreviewChanged(before);
  expect(await readPoints(page)).not.toEqual(pts);

  // ...but not while typing into a field.
  await page.getByLabel('Device preset').selectOption('custom');
  pts = await readPoints(page);
  await page.getByLabel('Custom width').focus();
  await page.keyboard.press('Space');
  expect(await readPoints(page)).toEqual(pts);

  // Layout locked: positions, radii and warp stay, colors change.
  await lockLayout.click();
  pts = await readPoints(page);
  const warp = await readWarp(page);
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  next = await readPoints(page);
  expect(next.map((p) => p.pos)).toEqual(pts.map((p) => p.pos));
  expect(next.map((p) => p.color)).not.toEqual(pts.map((p) => p.color));
  expect(await readWarp(page)).toEqual(warp);

  // Both locked: nothing to shuffle.
  await lockColors.click();
  await expect(shuffle).toBeDisabled();
  pts = await readPoints(page);
  await blur(page);
  await page.keyboard.press('Space');
  expect(await readPoints(page)).toEqual(pts);

  // Only the active pattern is shuffled: a gradient shuffle leaves the mesh alone.
  await lockColors.click();
  await lockLayout.click();
  await page.getByRole('radio', { name: 'Gradient' }).click();
  before = await settled();
  await shuffle.click();
  await expectPreviewChanged(before);
  await page.getByRole('radio', { name: 'Mesh' }).click();
  expect(await readPoints(page)).toEqual(pts);
  expect(errors).toEqual([]);
});

test('warp controls: shape, amount, size, new variation and [ ] cycling', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  const { canvas, settled, expectPreviewChanged } = previewProbe(page);
  await expect(canvas).toBeVisible();
  const shape = page.getByLabel('Warp shape');
  await expect(shape).toHaveValue('domain');
  await expect(shape.locator('option')).toHaveCount(WARP_SHAPES.length);

  let before = await settled();
  await shape.selectOption('fbm');
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

  // ] and [ step through the shapes (wrapping), each one rendering differently.
  await blur(page);
  before = await settled();
  await page.keyboard.press(']');
  await expect(shape).toHaveValue('simplex');
  await expectPreviewChanged(before);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(shape).toHaveValue('none');
  await expect(page.getByLabel('Warp size')).toBeDisabled();
  await page.keyboard.press('[');
  await expect(shape).toHaveValue('curl');
  await page.keyboard.press(']');
  await expect(shape).toHaveValue('none');
  expect(errors).toEqual([]);
});

test('grain sliders change the preview', async ({ page }) => {
  await page.goto('/');
  const { canvas, settled, expectPreviewChanged } = previewProbe(page);
  await expect(canvas).toBeVisible();
  let before = await settled();
  await page.getByLabel('Grain amount').fill('0');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Grain amount').fill('1');
  await expectPreviewChanged(before);
  before = await settled();
  await page.getByLabel('Grain size').fill('1');
  await expectPreviewChanged(before);
});

test('panel collapses to a bar so handles under it can be reached', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('aside');
  const first = page.getByRole('button', { name: 'Point 1', exact: true });
  await expect(first).toBeVisible();

  // The first default point sits under the expanded panel.
  const center = async () => {
    const b = (await first.boundingBox())!;
    return [b.x + b.width / 2, b.y + b.height / 2] as const;
  };
  const [x, y] = await center();
  const covered = () => page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('aside'), [x, y]);
  expect(await covered()).toBe(true);

  await page.getByRole('button', { name: 'Collapse panel' }).click();
  const expand = page.getByRole('button', { name: 'Expand panel' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Warp shape')).toHaveCount(0);
  await expect(page.getByLabel('Device preset')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Shuffle/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  expect((await panel.boundingBox())!.height).toBeLessThan(70);
  expect(await covered()).toBe(false);

  await page.getByRole('button', { name: 'Point 2', exact: true }).click();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');

  await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse panel' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Warp shape')).toBeVisible();
});

test('screenshots: six shuffles in a row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const { canvas, settled } = previewProbe(page);
  await expect(canvas).toBeVisible();
  await settled();
  await page.screenshot({ path: '/tmp/m3-panel.png' });
  await page.getByRole('button', { name: 'Collapse panel' }).click();
  await page.keyboard.press('h');
  for (let i = 1; i <= 6; i++) {
    await page.getByRole('button', { name: /^Shuffle/ }).click();
    await settled();
    await page.screenshot({ path: `/tmp/m3-shuffle-${i}.png` });
  }
});
