import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Exercise the deployed policy in Chromium: the emulator tests otherwise run
// behind Vite, which does not apply Firebase Hosting's production headers.
const config = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const policy = config.hosting.headers.find((entry: { source: string }) => entry.source === '**').headers.find((header: { key: string }) => header.key === 'Content-Security-Policy').value as string;
const origin = 'https://between-turns-paul.web.app';

test('production CSP permits Google helper scripts and same-origin auth frames while blocking unrelated scripts', async ({ page }) => {
  await page.route(`${origin}/__policy-check`, route => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': policy }, body: '<div id="policy-status">Loading helpers</div><script src="/policy-bootstrap.js"></script>' }));
  await page.route(`${origin}/policy-bootstrap.js`, route => route.fulfill({ contentType: 'text/javascript', body: `
    window.policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.policyViolations.push(event.blockedURI));
    addEventListener('message', event => {
      if (event.origin === location.origin && event.data === 'auth-frame-ready' && window.googleHelperLoaded) document.querySelector('#policy-status').textContent = 'Google helpers ready';
    });
    const google = document.createElement('script'); google.src = 'https://apis.google.com/js/api.js';
    google.onload = () => { const frame = document.createElement('iframe'); frame.src = '/__/auth/iframe'; document.body.append(frame); };
    document.head.append(google);
    const unrelated = document.createElement('script'); unrelated.src = 'https://untrusted.example.test/script.js'; document.head.append(unrelated);
  ` }));
  await page.route('https://apis.google.com/js/api.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.googleHelperLoaded = true;' }));
  await page.route(`${origin}/__/auth/iframe`, route => route.fulfill({ contentType: 'text/html', body: '<script src="/policy-frame.js"></script>' }));
  await page.route(`${origin}/policy-frame.js`, route => route.fulfill({ contentType: 'text/javascript', body: "parent.postMessage('auth-frame-ready', location.origin);" }));
  await page.route('https://untrusted.example.test/script.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.untrustedExecuted = true;' }));
  await page.goto(`${origin}/__policy-check`);
  await expect(page.locator('#policy-status')).toHaveText('Google helpers ready');
  const state = await page.evaluate(() => {
    const values = window as unknown as { untrustedExecuted?: boolean; policyViolations: string[] };
    return { untrustedExecuted: !!values.untrustedExecuted, violations: values.policyViolations };
  });
  expect(state.untrustedExecuted).toBe(false);
  expect(state.violations).toContain('https://untrusted.example.test/script.js');
});
