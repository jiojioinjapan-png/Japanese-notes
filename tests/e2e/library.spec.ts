import { expect, test } from '@playwright/test';

test('browse the three collections, read a word, and search by reading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书库。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '阅读：多彩', exact: true }).click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await expect(reader.getByText('たさい', { exact: true })).toBeVisible();
  await expect(reader.getByText('0', { exact: true })).toBeVisible();
  await expect(reader.getByText('形动', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭阅读' }).click();
  await page.getByRole('button', { name: '查看拟声拟态词', exact: false }).click();
  await expect(page.getByRole('button', { name: '阅读：あたふた', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看单词', exact: false }).click();
  await page.getByRole('searchbox', { name: '搜索笔记' }).fill('たさい');
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索笔记' }).fill('没有这个词条');
  await expect(page.getByText('还没有遇见这个表达')).toBeVisible();
});

test('validate, upload, deduplicate, and persist a JSON import', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入笔记', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '批量导入笔记' });
  const input = dialog.getByRole('textbox', { name: '笔记内容 JSON' });
  await input.fill('{ broken }');
  await expect(dialog.getByText('JSON 无法解析，请检查双引号、逗号和括号。')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '上传笔记' })).toBeDisabled();
  const term = `テスト語-${Date.now()}`;
  const body = JSON.stringify({
    notes: [
      {
        type: 'word',
        term,
        reading: 'てすとご',
        accent: 0,
        partOfSpeech: '名',
        meaning: '浏览器导入测试',
      },
      {
        type: 'grammar',
        term: term + '-文法',
        meaning: '语法导入测试',
        example: 'これはテストの例文です。',
      },
    ],
  });
  await input.fill(body);
  await expect(dialog.getByText('2 条笔记通过检查')).toBeVisible();
  await dialog.getByLabel('导入密钥', { exact: true }).fill('wrong-key');
  await dialog.getByRole('button', { name: '上传笔记' }).click();
  await expect(dialog.getByRole('alert')).toContainText('导入密钥不正确');
  await dialog.getByLabel('导入密钥', { exact: true }).fill('e2e-test-import-key');
  await dialog.getByRole('button', { name: '上传笔记' }).click();
  await expect(dialog.getByText('导入完成，新增 2 条，跳过 0 条重复笔记。')).toBeVisible();
  await dialog.getByRole('button', { name: '关闭导入' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: `阅读：${term}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入笔记', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记内容 JSON' }).fill(body);
  await page.getByLabel('导入密钥', { exact: true }).fill('e2e-test-import-key');
  await page.getByRole('button', { name: '上传笔记' }).click();
  await expect(page.getByText('导入完成，新增 0 条，跳过 2 条重复笔记。')).toBeVisible();
});

test('mobile layout, keyboard dialog dismissal, and theme preference', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const glyphHeights = await page.locator('.cover-letter').evaluateAll((elements) =>
    elements.flatMap((element) =>
      [...element.textContent!].map((_, index) => {
        const range = document.createRange();
        range.setStart(element.firstChild!, index);
        range.setEnd(element.firstChild!, index + 1);
        return range.getBoundingClientRect().height;
      }),
    ),
  );
  for (const height of glyphHeights) expect(height).toBeGreaterThan(15);
  await page.getByRole('button', { name: '阅读：多彩', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '切换深色模式' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: '搜索笔记' })).toBeFocused();
  await page.getByRole('searchbox', { name: '搜索笔记' }).fill('たさい');
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
