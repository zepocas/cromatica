/// <reference types="node" />
// Shared helpers for the app tests: a fixture that fails on page errors, and
// readers for the panel and the preview.
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { hexToOklch } from '../../../src/color/hex';

/** Playwright's test, failing any test that hits an uncaught page error. */
export const test = base.extend<{ failOnPageErrors: void }>({
  failOnPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await use();
      expect(errors, 'uncaught page errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

const tipsHidden = new WeakSet<Page>();

/** Open the app on the built-in design (default), or on its opening shuffle; first-visit tips only when asked for. */
export async function openApp(page: Page, { shuffled = false, tips = false } = {}): Promise<void> {
  if (!tips && !tipsHidden.has(page)) {
    tipsHidden.add(page);
    // Runs on every later navigation too, about:blank included, where storage throws.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('cromatica.tips', 'dismissed');
      } catch {
        // No storage on this page.
      }
    });
  }
  await page.goto(shuffled ? '/' : '/?default');
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
}

/** Pick an option of a dropdown, by value or by its shown label. */
export async function choose(dropdown: Locator, option: string | { label: string }): Promise<void> {
  await dropdown.click();
  const list = dropdown.page().getByRole('listbox');
  const item =
    typeof option === 'string'
      ? list.locator(`[data-value="${option}"]`)
      : list.getByRole('option', { name: option.label });
  await item.click();
}

/** The value of a dropdown. */
export async function valueOf(dropdown: Locator): Promise<string> {
  return (await dropdown.getAttribute('data-value')) ?? '';
}

/** Open a section's "+ more" controls. */
export async function openMore(page: Page, section: 'adjust' | 'colors'): Promise<void> {
  await page.getByRole('button', { name: `More ${section} settings` }).click();
}

/** Hex values in the colors list, in list order. */
export function readHexes(page: Page): Promise<string[]> {
  return page.locator('li input.hex').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

/** Oklch lightness of each color in the list. */
export async function readLightness(page: Page): Promise<number[]> {
  return (await readHexes(page)).map((hex) => hexToOklch(hex)[0]);
}

/** Each mesh handle's stored position, radius and color, as strings. */
export function readPoints(page: Page): Promise<{ pos: string; color: string }[]> {
  return page.locator('[data-point]').evaluateAll((els) =>
    els.map((el) => ({
      pos: `${el.getAttribute('data-x')} ${el.getAttribute('data-y')} ${el.getAttribute('data-r')}`,
      color: el.getAttribute('data-color')!,
    })),
  );
}

/** Warp controls' values. */
export async function readWarp(page: Page) {
  return {
    shape: await valueOf(page.getByLabel('Warp shape')),
    amount: await page.getByLabel('Warp', { exact: true }).inputValue(),
    size: await page.getByLabel('Warp size').inputValue(),
    seed: await page.getByRole('button', { name: 'New variation' }).getAttribute('data-seed'),
  };
}

/** Drop keyboard focus, so app shortcuts reach the window. */
export function blur(page: Page): Promise<void> {
  return page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Screen composition coords (height 1, origin at the center, +y up) of a page point over the preview. */
export async function toComposition(page: Page, x: number, y: number): Promise<[number, number]> {
  const c = (await page.getByTestId('preview-canvas').boundingBox())!;
  return [(x - c.x - c.width / 2) / c.height, (c.y + c.height / 2 - y) / c.height];
}

/** Center of an element, in page coords. */
export async function centerOf(locator: Locator): Promise<[number, number]> {
  const b = (await locator.boundingBox())!;
  return [b.x + b.width / 2, b.y + b.height / 2];
}

/**
 * Screenshots of the rendered image only (panel and handles hidden), taken
 * once the preview has drawn its sharp full-resolution frame.
 */
export function previewProbe(page: Page) {
  const canvas = page.getByTestId('preview-canvas');
  const settled = async () => {
    await expect(canvas).toHaveAttribute('data-settled', 'true');
    return canvas.screenshot({ style: 'aside, [data-testid="mesh-overlay"] { visibility: hidden; }' });
  };
  /** Poll until the settled preview differs from `before`. */
  const expectPreviewChanged = async (before: Buffer) => {
    await expect.poll(async () => (await settled()).equals(before), { timeout: 5_000 }).toBe(false);
  };
  return { canvas, settled, expectPreviewChanged };
}
