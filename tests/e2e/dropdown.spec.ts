// The panel's dropdowns: keyboard, click outside, and app shortcuts kept out.
import { expect, openApp, readHexes, test, valueOf } from './support/app';

test('dropdown: keys pick an option, Space opens instead of shuffling', async ({ page }) => {
  await openApp(page);
  const gradient = page.getByLabel('Gradient', { exact: true });
  const list = page.getByRole('listbox');
  const hexes = await readHexes(page);

  await gradient.focus();
  await page.keyboard.press('Space');
  await expect(list).toBeVisible();
  expect(await readHexes(page)).toEqual(hexes);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  expect(await valueOf(gradient)).toBe('grid');

  // Type-ahead jumps to the first label starting with the letter.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('p');
  await page.keyboard.press('Enter');
  expect(await valueOf(gradient)).toBe('planes');

  // Escape and a click outside close without changing anything.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await gradient.click();
  await page.mouse.click(900, 400);
  await expect(list).toBeHidden();
  expect(await valueOf(gradient)).toBe('planes');
});
