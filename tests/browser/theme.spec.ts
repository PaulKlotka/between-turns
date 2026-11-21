import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/src/client.ts*', route => route.fulfill({
    contentType: 'text/javascript', body: `export const local = true;
      export async function initialize() {}
      export async function command() { return null; }`,
  }));
});

test('device theme, keyboard switching, and saved preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(245, 239, 227)');
  await page.getByRole('button', { name: 'Switch to dark mode' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(48, 35, 55)');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('dark device theme and usable header at phone and desktop widths', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of ['Switch to light mode', 'Switch to dark mode']) {
      const toggle = page.getByRole('button', { name: label });
      await expect(toggle).toBeVisible();
      const bounds = await toggle.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await toggle.click();
    }
  }
});
