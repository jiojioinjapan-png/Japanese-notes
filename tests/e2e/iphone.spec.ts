import { expect, test } from './fixtures';
import { expectFixedViewport, searchNotes, swipe } from './helpers';

for (const [width, height] of [
  [320, 568],
  [375, 667],
  [393, 852],
  [430, 932],
  [844, 390],
]) {
  test(`fixed iPhone ${width}x${height}: usable cards and no document scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.note-card').first()).toBeVisible();
    const navigation = page.getByRole('navigation', { name: '主导航' });
    await expect(navigation).toBeVisible();
    for (const button of await navigation.getByRole('button').all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const card = (await page.locator('.note-card').first().boundingBox())!;
    const pager = (await page.locator('.pagination').boundingBox())!;
    const nav = (await navigation.boundingBox())!;
    expect(card.height).toBeGreaterThan(90);
    expect(card.y + card.height).toBeLessThanOrEqual(pager.y + 1);
    expect(pager.y + pager.height).toBeLessThanOrEqual(nav.y + 1);
    await expectFixedViewport(page);
    await searchNotes(page, '多彩');
    await page.getByRole('button', { name: '阅读：多彩', exact: true }).tap();
    const reader = page.getByRole('dialog', { name: '笔记阅读' });
    const box = (await reader.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(width);
    expect(box.height).toBe(height);
    await page.getByRole('button', { name: '切换阅读字号' }).tap();
    await page.getByRole('button', { name: '关闭阅读' }).tap();
    await page.getByRole('button', { name: '阅读：多彩', exact: true }).tap();
    await expect(page.getByRole('button', { name: '切换阅读字号' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
}

test('safe-area controls stay in bounds on the shelf and reader', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.addStyleTag({ content: ':root { --safe-top:59px; --safe-bottom:34px; }' });
  await searchNotes(page, '多彩');
  await expectFixedViewport(page);
  const nav = (await page.getByRole('button', { name: '书库', exact: true }).boundingBox())!;
  expect(nav.y + nav.height).toBeLessThanOrEqual(852 - 34);
  await page.getByRole('button', { name: '阅读：多彩', exact: true }).tap();
  expect(
    (await page.getByRole('button', { name: '关闭阅读' }).boundingBox())!.y,
  ).toBeGreaterThanOrEqual(59);
  const next = (await page.getByRole('button', { name: '下一篇' }).boundingBox())!;
  expect(next.y + next.height).toBeLessThanOrEqual(852 - 34);
});

test('swipe turns continue across shelf pages and browser back returns to the current card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const prefix = `めくり${Date.now()}`;
  expect(
    (
      await page.request.post('/api/notes/import', {
        data: {
          notes: Array.from({ length: 6 }, (_, i) => ({
            type: 'word',
            term: `${prefix}-${i + 1}`,
            reading: 'めくり',
            accent: 0,
            partOfSpeech: '名·形动',
            meaning: `第 ${i + 1} 页`,
          })),
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/');
  await searchNotes(page, prefix);
  await page.getByLabel('排序方式').selectOption('term');
  const first = page.getByRole('button', { name: `阅读：${prefix}-1`, exact: true });
  await expect(first).toBeVisible();
  expect(await page.locator('.note-card').count()).toBe(1);
  await swipe(page, page.locator('.shelf-viewport'), 'next');
  await expect(page.getByRole('button', { name: `阅读：${prefix}-2`, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: `阅读：${prefix}-2`, exact: true }).tap();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await swipe(page, reader.locator('.reader-stage'), 'next');
  await expect(reader.locator('.reader-position > span')).toHaveText('3 / 6');
  await expect(reader.locator('.reader-page .note-term')).toHaveText(`${prefix}-3`);
  await swipe(page, reader.locator('.reader-stage'), 'previous');
  await expect(reader.locator('.reader-position > span')).toHaveText('2 / 6');
  await page.goBack();
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole('button', { name: `阅读：${prefix}-2`, exact: true })).toBeVisible();
});

test('only a long entry scrolls vertically; turning resets its scroll position', async ({
  page,
}) => {
  const prefix = `ながい${Date.now()}`;
  expect(
    (
      await page.request.post('/api/notes/import', {
        data: {
          notes: [
            {
              type: 'grammar',
              term: `${prefix}-1`,
              meaning: '长例句测试',
              example: 'これは読みやすさを確認するための長い例文です。'.repeat(60),
            },
            {
              type: 'grammar',
              term: `${prefix}-2`,
              meaning: '下一条',
              example: '次のページです。',
            },
          ],
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/');
  await searchNotes(page, prefix);
  await page.getByLabel('排序方式').selectOption('term');
  await page.getByRole('button', { name: `阅读：${prefix}-1`, exact: true }).tap();
  const article = page.locator('.reader-page');
  const footer = (await page.locator('.reader-footer').boundingBox())!;
  expect(await article.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await article.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await article.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.reader-footer').boundingBox())!.y).toBe(footer.y);
  await swipe(page, page.locator('.reader-stage'), 'next');
  await expect(page.locator('.reader-position > span')).toHaveText('2 / 2');
  expect(await article.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.getByRole('button', { name: '下一篇' })).toBeDisabled();
  await expectFixedViewport(page);
});

test('home-screen metadata, icons and fixed-screen import remain functional', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '切换浅色模式' }).tap();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const [path, size] of [
    ['/apple-touch-icon.png', 180],
    ['/icons/icon-512.png', 512],
    ['/icons/favicon-32.png', 32],
  ] as const) {
    const png = await (await request.get(path)).body();
    expect(png.readUInt32BE(16)).toBe(size);
  }
  await page.getByRole('button', { name: '导入笔记', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: '批量导入笔记' });
  expect((await dialog.boundingBox())!.width).toBe(page.viewportSize()!.width);
  expect(
    await dialog.locator('textarea').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await dialog.getByRole('button', { name: '填入示例' }).tap();
  await expect(dialog.getByText('3 条笔记通过检查')).toBeVisible();
  await dialog.getByRole('button', { name: '预览笔记' }).tap();
  expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  await dialog.getByRole('button', { name: '上传笔记' }).tap();
  await expect(dialog.getByText('导入完成，新增 0 条，跳过 3 条重复笔记。')).toBeVisible();
});
