import { test, expect, type Page } from '@playwright/test';

async function googleSignIn(page: Page, email: string, reuse = false) {
  const popupReady = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  const popup = await popupReady;
  await popup.waitForURL(/127\.0\.0\.1:9299/);
  if (reuse) await popup.locator('.js-reuse-account').filter({ hasText: email }).click();
  else {
    await popup.getByRole('button', { name: 'Add new account' }).click();
    await popup.locator('#email-input').fill(email);
    await popup.locator('#display-name-input').fill('Google Table Player');
    await popup.locator('#profile-photo-input').fill('https://lh3.googleusercontent.com/test-avatar');
    await popup.locator('#sign-in').click();
  }
  await expect(page.locator('#account-label')).toContainText('Google Table Player');
}

test('Google login preserves a guest session, supplies name/photo, supports new sessions and signs out', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://lh3.googleusercontent.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDV8AAAAASUVORK5CYII=', 'base64') }));
  await page.goto('/');
  await expect(page.locator('#entry-submit')).toBeEnabled();
  await page.getByLabel('What should we call you?').fill('Temporary Guest');
  await page.locator('#entry-submit').click();
  await expect(page.locator('#header-code')).toHaveText(/^[A-F0-9]{15}$/);
  const code = await page.locator('#header-code').innerText();
  const email = `player-${Date.now()}@example.test`;
  await googleSignIn(page, email);
  await expect(page.locator('#header-code')).toHaveText(code);
  await expect(page.locator('#player-label')).toHaveText('Playing as Google Table Player');
  await page.locator('[data-page="session"]').click();
  await expect(page.locator('#roster img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/test-avatar');
  await page.reload(); await expect(page.locator('#account-label')).toContainText('Google Table Player');
  await page.locator('[data-page="session"]').click();
  await page.locator('#leave-session').click(); await page.locator('#confirm-leave').click();
  await expect(page.locator('#player-name')).toBeHidden();
  await page.locator('#open-rewards').click(); await expect(page.locator('#saved-rewards')).toBeVisible();
  await page.locator('#entry-submit').click();
  await expect(page.locator('#header-code')).not.toHaveText(code);
  await expect(page.locator('#player-label')).toHaveText('Playing as Google Table Player');
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'screenshots/google-account-mobile.png', fullPage: true });
  await page.locator('#google-sign-out').click();
  await expect(page.locator('#account-label')).toContainText('Guest player');
  await expect(page.locator('#player-name')).toBeVisible();
  await expect(page.locator('#saved-rewards')).toBeHidden();
  await page.getByLabel('What should we call you?').fill('Another guest');
  await page.locator('#entry-submit').click();
  await expect(page.locator('#hub')).toBeVisible();
  await expect(page.locator('#header-code')).toHaveText(/^[A-F0-9]{15}$/);
  const newCode = await page.locator('#header-code').innerText();
  await googleSignIn(page, email, true); // Exercises credential-already-in-use recovery.
  await expect(page.locator('#header-code')).toHaveText(newCode);
  await expect(page.locator('#player-label')).toHaveText('Playing as Google Table Player');
  expect(errors).toEqual([]);
});
