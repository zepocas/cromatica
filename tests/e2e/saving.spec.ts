// Saving: autosave and restore on reload, and undo / redo.
import type { Page } from '@playwright/test';
import { choose, expect, openApp, previewProbe, readHexes, readWarp, test } from './support/app';

const AUTOSAVE_KEY = 'cromatica.design';
const readSave = (page: Page) => page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY);

test('a reload restores the design exactly', async ({ page }) => {
  await openApp(page, { shuffled: true });
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  await shuffle.click();
  await shuffle.click();
  await expect.poll(() => readSave(page)).not.toBeNull();
  const { settled } = previewProbe(page);
  const before = await settled();
  const hexes = await readHexes(page);
  const warp = await readWarp(page);

  await page.reload();
  expect(await settled()).toEqual(before);
  expect(await readHexes(page)).toEqual(hexes);
  expect(await readWarp(page)).toEqual(warp);
});

test('?default neither restores nor overwrites the save', async ({ page }) => {
  await openApp(page, { shuffled: true });
  await expect.poll(() => readSave(page)).not.toBeNull();
  const saved = await readSave(page);
  await openApp(page);
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  await page.waitForTimeout(500);
  await page.goto('about:blank');
  await openApp(page, { shuffled: true });
  expect(await readSave(page)).toBe(saved);
});

test('an unreadable save falls back to a shuffle', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{"version":99}'), AUTOSAVE_KEY);
  await openApp(page, { shuffled: true });
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('data-settled', 'true');
});

test('undo and redo: a slider drag is one step, shuffles are one each', async ({ page }) => {
  await openApp(page);
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  // Drag the warp slider across in many small steps.
  const slider = page.getByLabel('Warp', { exact: true });
  const start = await slider.inputValue();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  const dragged = await slider.inputValue();
  expect(dragged).not.toBe(start);

  await undo.click();
  await expect(slider).toHaveValue(start);
  await expect(undo).toBeDisabled();
  await redo.click();
  await expect(slider).toHaveValue(dragged);

  // Two shuffles undo one at a time, by button and by keyboard.
  const shuffle = page.getByRole('button', { name: /^Shuffle( Space)?$/ });
  const h0 = await readHexes(page);
  await shuffle.click();
  const h1 = await readHexes(page);
  await shuffle.click();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await readHexes(page)).toEqual(h1);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await readHexes(page)).toEqual(h0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await readHexes(page)).toEqual(h1);
});

test('undo leaves text fields their own undo', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();
  const hexes = await readHexes(page);
  await choose(page.getByLabel('Size preset'), 'custom');
  await page.getByLabel('Width').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await readHexes(page)).toEqual(hexes);
});
