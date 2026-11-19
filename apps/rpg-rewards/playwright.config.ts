import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60000 },
  ],
});
