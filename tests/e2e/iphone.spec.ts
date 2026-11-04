import { expect, test } from './fixtures';

for (const [width, height] of [
  [320, 568],
  [375, 667],
  [393, 852],
  [430, 932],
]) {
  test(`iPhone ${width}px: usable shelf, thumb navigation, search and full-screen reading`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: '主导航' });
    await expect(navigation).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const button of await navigation.getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const coverGlyphs = await page.locator('.cover-letter').evaluateAll((elements) =>
      elements.flatMap((element) =>
        [...element.textContent!].map((_, i) => {
          const range = document.createRange();
          range.setStart(element.firstChild!, i);
          range.setEnd(element.firstChild!, i + 1);
          return range.getBoundingClientRect().height;
        }),
      ),
    );
    for (const size of coverGlyphs) expect(size).toBeGreaterThan(15);
    await navigation.getByRole('button', { name: '搜索', exact: true }).tap();
    const search = page.getByRole('searchbox', { name: '搜索笔记' });
    await expect(search).toBeFocused();
    expect(
      await search.evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
    ).toBeGreaterThanOrEqual(16);
    await search.fill('たさい');
    const word = page.getByRole('button', { name: '阅读：多彩', exact: true });
    await expect(word).toBeVisible();
    await word.tap();
    const reader = page.getByRole('dialog', { name: '笔记阅读' });
    await expect(reader).toBeVisible();
    const box = (await reader.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(width);
    expect(box.height).toBe(height);
    await expect(reader.getByText('たさい', { exact: true })).toBeVisible();
    const fontButton = reader.getByRole('button', { name: '切换阅读字号' });
    await fontButton.tap();
    await expect(fontButton).toHaveAttribute('aria-pressed', 'true');
    await reader.getByRole('button', { name: '关闭阅读' }).tap();
    await word.tap();
    await expect(page.getByRole('button', { name: '切换阅读字号' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: '关闭阅读' }).tap();
    await navigation.getByRole('button', { name: '书库', exact: true }).tap();
    await expect(page.getByRole('searchbox', { name: '搜索笔记' })).toBeHidden();
    await expect(navigation.getByRole('button', { name: '书库', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
}

test('safe-area insets keep navigation, close and page-turn controls clear of iPhone hardware', async ({
  page,
}) => {
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --safe-top: 59px; --safe-bottom: 34px; }' });
  const navigation = page.getByRole('navigation', { name: '主导航' });
  const navBounds = (await navigation.boundingBox())!;
  const buttonBounds = (await navigation
    .getByRole('button', { name: '书库', exact: true })
    .boundingBox())!;
  expect(navBounds.height).toBeGreaterThanOrEqual(102);
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(
    page.viewportSize()!.height - 34,
  );
  await page.getByRole('button', { name: '阅读：多彩', exact: true }).tap();
  const close = (await page.getByRole('button', { name: '关闭阅读' }).boundingBox())!;
  const next = (await page.getByRole('button', { name: '下一篇', exact: true }).boundingBox())!;
  expect(close.y).toBeGreaterThanOrEqual(59);
  expect(next.y + next.height).toBeLessThanOrEqual(page.viewportSize()!.height - 34);
  await page.getByRole('button', { name: '关闭阅读' }).tap();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addStyleTag({
    content:
      ':root { --safe-top: 0px; --safe-bottom: 21px; --safe-left: 59px; --safe-right: 59px; }',
  });
  await expect(navigation).toBeVisible();
  expect(
    await page
      .locator('.main-content')
      .evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft)),
  ).toBeGreaterThanOrEqual(59);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('long examples scroll inside the reader while the page-turn controls stay in place', async ({
  page,
}) => {
  const term = `長文テスト${Date.now()}`;
  const imported = await page.request.post('/api/notes/import', {
    data: {
      notes: [
        {
          type: 'grammar',
          term,
          meaning: '用于验证长例句的阅读体验',
          example: 'これは読みやすさを確認するための長い例文です。'.repeat(60),
        },
      ],
    },
  });
  expect(imported.status()).toBe(201);
  await page.goto('/');
  await page.getByRole('button', { name: '搜索', exact: true }).tap();
  await page.getByRole('searchbox', { name: '搜索笔记' }).fill(term);
  await page.getByRole('button', { name: `阅读：${term}`, exact: true }).tap();
  const article = page.locator('.reader-page');
  const controlsBefore = (await page.locator('.reader-footer').boundingBox())!;
  expect(await article.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await article.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await article.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.reader-footer').boundingBox())!.y).toBe(controlsBefore.y);
  await expect(page.getByRole('button', { name: '关闭阅读' })).toBeVisible();
});

test('home-screen metadata, full-size icons, and mobile import form', async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#242522');
  await page.getByRole('button', { name: '切换浅色模式' }).tap();
  expect(
    await page.locator('html').evaluate((element) => getComputedStyle(element).colorScheme),
  ).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', '#faf9f6');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute(
    'content',
    '日语笔记',
  );
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: '/', display: 'standalone', start_url: '/', scope: '/' });
  for (const [path, size] of [
    ['/apple-touch-icon.png', 180],
    ['/icons/icon-192.png', 192],
    ['/icons/icon-512.png', 512],
    ['/icons/icon-maskable-512.png', 512],
    ['/icons/favicon-32.png', 32],
    ['/icons/favicon-16.png', 16],
  ] as const) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  const ico = await (await request.get('/favicon.ico')).body();
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(2);
  await page.getByRole('button', { name: '导入笔记', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '批量导入笔记' });
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBe(page.viewportSize()!.width);
  for (const input of await dialog.locator('textarea, input[type=password]').all()) {
    expect(
      await input.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16);
  }
  await dialog.getByRole('button', { name: '填入示例' }).tap();
  await expect(dialog.getByText('3 条笔记通过检查')).toBeVisible();
  await dialog.getByRole('button', { name: '上传笔记' }).tap();
  await expect(dialog.getByText(/导入完成，新增 0 条，跳过 3 条重复笔记。/)).toBeVisible();
  await dialog.getByRole('button', { name: '关闭导入' }).tap();
  await expect(dialog).toHaveCount(0);
});
