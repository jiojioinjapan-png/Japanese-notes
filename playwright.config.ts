import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:8788', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npm run build && wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e && wrangler dev --port 8788 --persist-to .wrangler/e2e --var ADMIN_TOKEN:e2e-test-import-key',
    url: 'http://127.0.0.1:8788',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
