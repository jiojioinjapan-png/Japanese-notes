import { test as base, expect } from '@playwright/test';
export { expect };
export const test = base.extend<{ authenticatedSession: void }>({
  authenticatedSession: [
    async ({ context }, use) => {
      const response = await context.request.post('/api/auth/login', {
        data: { username: 'e2e-reader', password: 'e2e-test-password' },
      });
      expect(response.status()).toBe(200);
      await use();
    },
    { auto: true },
  ],
});
