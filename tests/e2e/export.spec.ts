// The export pipeline (D3): tiled, worker-rendered PNG/JPEG against
// single-pass renders, plus the app's download.
import { readFile } from 'node:fs/promises';
import { WARP_SHAPES } from '../../src/design/design';
import { choose, expect, openApp, previewProbe, readHexes, test } from './support/app';
import { exportHarness, logBench, openExportHarness } from './support/harness';

test.describe('export pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await openExportHarness(page);
  });

  for (const pattern of ['linear', 'mesh'] as const) {
    test(`${pattern}: tiled 5120×2880 PNG is byte-identical (RGB) to a single-pass render`, async ({ page }) => {
      test.setTimeout(300_000);
      const r = await exportHarness(page, 'exportVsSinglePass', 5120, 2880, undefined, pattern);
      logBench(
        `5K ${pattern} PNG: ${r.exportMs.toFixed(0)} ms, ${r.tiles} tiles; single ${r.referenceMs.toFixed(0)} ms`,
      );
      expect([r.width, r.height]).toEqual([5120, 2880]);
      expect(r.tiles).toBeGreaterThan(1);
      expect(r.firstMismatch).toBeNull();
      expect(r.mismatches).toBe(0);
    });

    test(`${pattern}: small ragged tiles match a single-pass render`, async ({ page }) => {
      const r = await exportHarness(page, 'exportVsSinglePass', 1000, 777, 256, pattern);
      expect([r.width, r.height]).toEqual([1000, 777]);
      expect(r.tiles).toBe(4 * 4);
      expect(r.firstMismatch).toBeNull();
    });

    test(`${pattern}: the preview at W×H equals the exported PNG at W×H`, async ({ page }) => {
      const r = await exportHarness(page, 'previewVsExport', 2560, 1440, pattern);
      expect([r.width, r.height]).toEqual([2560, 1440]);
      expect(r.firstMismatch).toBeNull();
      expect(r.mismatches).toBe(0);
    });
  }

  test('every warp shape: small ragged tiles match single-pass, linear and mesh', async ({ page }) => {
    test.setTimeout(300_000);
    for (const pattern of ['linear', 'mesh'] as const) {
      for (const shape of WARP_SHAPES) {
        const r = await exportHarness(page, 'exportVsSinglePass', 600, 450, 256, pattern, shape);
        expect(r.tiles, `${pattern}/${shape}`).toBe(3 * 2);
        expect(r.firstMismatch, `${pattern}/${shape}`).toBeNull();
      }
    }
  });

  test('the main thread stays responsive during a 5K export', async ({ page }) => {
    test.setTimeout(300_000);
    const r = await exportHarness(page, 'responsiveness', 5120, 2880);
    logBench(
      `responsiveness: export ${r.exportMs.toFixed(0)} ms, ${r.frames} frames, max rAF gap ${r.maxGap.toFixed(1)} ms, ` +
        `longtasks ${r.longtaskCount} (longest ${r.longestLongtask.toFixed(0)} ms, total ${r.totalLongtaskMs.toFixed(0)} ms)`,
    );
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.maxGap).toBeLessThan(200);
  });

  test('abort rejects with AbortError and a later export succeeds', async ({ page }) => {
    const r = await exportHarness(page, 'cancelThenExport');
    expect(r.errorName).toBe('AbortError');
    expect(r.tilesAtAbort).toBeLessThan(r.tilesTotal);
    expect(r.preAborted).toBe('AbortError');
    expect(r.after).toEqual({ type: 'image/png', width: 320, height: 200 });
  });

  test('JPEG export returns image/jpeg with the right dimensions', async ({ page }) => {
    const r = await exportHarness(page, 'exportJpeg', 3440, 1440);
    expect(r.type).toBe('image/jpeg');
    expect([r.width, r.height]).toEqual([3440, 1440]);
  });
});

test('a custom size letterboxes the preview and names the download', async ({ page }) => {
  await openApp(page);
  const canvas = page.getByTestId('preview-canvas');

  // Typing a size switches the preset to custom.
  await page.getByLabel('Width').fill('320');
  await page.getByLabel('Width').press('Tab');
  await page.getByLabel('Height').fill('200');
  await page.getByLabel('Height').press('Tab');
  await expect(page.getByLabel('Size preset')).toHaveAttribute('data-value', 'custom');

  // Letterboxed to 16:10 (layout is applied on the next animation frame).
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return box ? box.width / box.height : 0;
    })
    .toBeCloseTo(1.6, 2);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('cromatica-320x200.png');
});

test('an exported PNG dropped back reopens its design at its size', async ({ page }) => {
  await openApp(page, { shuffled: true });
  await page.getByLabel('Width').fill('320');
  await page.getByLabel('Width').press('Tab');
  await page.getByLabel('Height').fill('200');
  await page.getByLabel('Height').press('Tab');
  const { settled, expectPreviewChanged } = previewProbe(page);
  const before = await settled();
  const hexes = await readHexes(page);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const png = await readFile(await (await downloadPromise).path());

  await choose(page.getByLabel('Size preset'), '1920x1080');
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await expectPreviewChanged(before);

  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array(bytes)], 'gradient.png', { type: 'image/png' }));
      return d;
    },
    [...png],
  );
  await page.dispatchEvent('body', 'drop', { dataTransfer });
  await expect(page.getByLabel('Size preset')).toHaveAttribute('data-value', 'custom');
  await expect(page.getByLabel('Width')).toHaveValue('320');
  await expect(page.getByLabel('Height')).toHaveValue('200');
  await expect.poll(async () => (await settled()).equals(before)).toBe(true);
  expect(await readHexes(page)).toEqual(hexes);

  // One undo step back to the shuffle before the drop.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expectPreviewChanged(before);
});
