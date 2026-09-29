import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './scripts/browser', testMatch: '**/*.spec.mjs', outputDir: 'test-results',
  workers: 1, retries: 0, reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure' },
});
