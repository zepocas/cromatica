// Share links: copy a link to the design, open it, and leave it behind on the first edit.
import type { Page } from '@playwright/test';
import { expect, expectSameColors, openApp, readHexes, test } from './support/app';

const AUTOSAVE_KEY = 'cromatica.design';
const readSave = (page: Page) => page.evaluate((key) => localStorage.getItem(key), AUTOSAVE_KEY);
const shuffle = (page: Page) => page.getByRole('button', { name: /^Shuffle( Space)?$/ }).click();

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function copyLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.getByText('link copied')).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

test('the copied link opens the same design, and keeps its fragment until the first edit', async ({ page }) => {
  await openApp(page);
  await shuffle(page);
  const hexes = await readHexes(page);
  const link = await copyLink(page);
  expect(link).toMatch(/#v1\.[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(2000);

  await page.goto('about:blank');
  await page.goto(link);
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  expectSameColors(await readHexes(page), hexes);
  expect(page.url()).toContain('#v1.');

  await shuffle(page);
  await expect.poll(() => page.url()).not.toContain('#');
  expect(await readHexes(page)).not.toEqual(hexes);
});

test('opening a link leaves the visitor’s autosave alone until they edit', async ({ page, context }) => {
  await openApp(page, { shuffled: true });
  await expect.poll(() => readSave(page)).not.toBeNull();
  const mine = await readSave(page);
  await shuffle(page);
  const link = await copyLink(page);
  await expect.poll(async () => (await readSave(page)) !== mine).toBe(true);

  // The earlier save stands in for the visitor's own; the link opens in a second tab, so this page never unloads over it.
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [AUTOSAVE_KEY, mine!]);
  const other = await context.newPage();
  await other.addInitScript(() => localStorage.setItem('cromatica.tips', 'dismissed'));
  await other.goto(link);
  await expect(other.getByTestId('preview-canvas')).toBeVisible();
  await other.waitForTimeout(600);
  expect(await readSave(other)).toBe(mine);

  await shuffle(other);
  await expect.poll(async () => (await readSave(other)) !== mine).toBe(true);
});

test('a link pasted into the open tab opens its design without a reload', async ({ page }) => {
  // Not ?default: the link has no query, so from there it would be a reload.
  await openApp(page, { shuffled: true });
  await shuffle(page);
  const hexes = await readHexes(page);
  const link = await copyLink(page);
  await shuffle(page);
  const shuffled = (await readHexes(page)).join();
  expect(shuffled).not.toBe(hexes.join());

  await page.evaluate((url) => (location.href = url), link);
  await expect.poll(async () => (await readHexes(page)).join()).not.toBe(shuffled);
  expectSameColors(await readHexes(page), hexes);
});

test('a damaged link falls back to the normal startup and says so', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cromatica.tips', 'dismissed'));
  await page.goto('/?default#v1.not-a-design');
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText("couldn't be opened");
});
