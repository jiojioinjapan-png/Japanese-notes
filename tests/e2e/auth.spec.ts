import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('账号', { exact: true }).fill('e2e-reader');
  await page.getByLabel('密码', { exact: true }).fill('e2e-test-password');
  await page.getByRole('button', { name: '登录书库', exact: true }).click();
  await expect(page.locator('.note-card').first()).toBeVisible();
}

for (const width of [320, 393, 430]) {
  test(`login ${width}px: private library, iPhone form sizes, password visibility, and retained session`, async ({
    page,
    context,
    request,
  }) => {
    await page.setViewportSize({ width, height: 852 });
    const noteRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/notes') noteRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '欢迎回到书库' })).toBeVisible();
    expect(noteRequests).toHaveLength(0);
    expect((await request.get('/api/notes')).status()).toBe(401);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const input of await page
      .getByRole('form', { name: '账号密码登录' })
      .locator('input')
      .all()) {
      expect(
        await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
      expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('账号', { exact: true }).fill('e2e-reader');
    const password = page.getByLabel('密码', { exact: true });
    await password.fill('wrong-password');
    await page.getByRole('button', { name: '显示密码' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: '隐藏密码' }).click();
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '登录书库', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('账号或密码不正确');
    await expect(password).toHaveValue('');
    await signIn(page);
    await page.reload();
    await expect(page.locator('.note-card').first()).toBeVisible();
    expect(
      (await context.cookies()).find((cookie) => cookie.name === 'kotoba_session_dev')?.httpOnly,
    ).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain('kotoba_session');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
      'e2e-test-password',
    );
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '欢迎回到书库' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '欢迎回到书库' })).toBeVisible();
    await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toHaveCount(0);
  });
}

test('an expired API session immediately removes notes and returns to login', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await page.route('**/api/notes?**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: '登录已过期，请重新登录。', code: 'AUTH_REQUIRED' }),
    }),
  );
  await page.getByRole('button', { name: '查看语法', exact: false }).click();
  await expect(page.getByRole('heading', { name: '欢迎回到书库' })).toBeVisible();
  await expect(page.getByText('登录已过期，请重新登录。')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toHaveCount(0);
});

test('returning to the app checks that the server session is still active', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  expect((await page.request.post('/api/auth/logout')).status()).toBe(200);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.getByRole('heading', { name: '欢迎回到书库' })).toBeVisible();
});
