import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:8788', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: '**/iphone.spec.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'iphone-webkit',
      testMatch: [
        '**/iphone.spec.ts',
        '**/auth.spec.ts',
        '**/collection.spec.ts',
        '**/features.spec.ts',
      ],
      use: { ...devices['iPhone 13'], browserName: 'webkit' },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:8788',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
