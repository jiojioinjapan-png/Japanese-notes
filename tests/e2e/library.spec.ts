import { expect, test } from './fixtures';
import { expectFixedViewport, returnHome, searchNotes } from './helpers';

test('word card follows the reference hierarchy and opens a complete reading page', async ({
  page,
}) => {
  await page.goto('/');
  await searchNotes(page, '多彩');
  const card = page.getByRole('button', { name: '阅读：多彩', exact: true });
  await expect(card).toBeVisible();
  const kanji = (await card.locator('.word-term').boundingBox())!;
  const accent = (await card.locator('.accent').boundingBox())!;
  const reading = (await card.locator('.pronunciation').boundingBox())!;
  const part = (await card.locator('.part-of-speech').boundingBox())!;
  expect(accent.x).toBeGreaterThan(kanji.x);
  expect(reading.y).toBeGreaterThan(kanji.y);
  expect(part.y).toBeGreaterThan(reading.y);
  expect(
    await card.locator('.accent').evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe('50%');
  expect(
    await card
      .locator('.part-of-speech > span')
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain('110, 222, 238');
  await card.click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await expect(reader.locator('.reader-page').getByText('たさい', { exact: true })).toBeVisible();
  await expect(reader.locator('.reader-page').getByText('0', { exact: true })).toBeVisible();
  await expect(reader.locator('.reader-page').getByText('形动', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭阅读' }).click();
  await returnHome(page);
  await page.getByRole('button', { name: '查看拟声拟态词', exact: false }).click();
  await expect(page.locator('.note-card').first()).toHaveClass(/onomatopoeia/);
  await expectFixedViewport(page);
});

test('JSON import uses fixed-screen editor and per-note preview before upload', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '导入笔记', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '批量导入笔记' });
  const input = dialog.getByRole('textbox', { name: '笔记内容 JSON' });
  await input.fill('{ broken }');
  await expect(dialog.getByText('JSON 无法解析，请检查双引号、逗号和括号。')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '预览笔记' })).toBeDisabled();
  const term = `テスト語-${Date.now()}`;
  const body = JSON.stringify({
    notes: [
      {
        type: 'word',
        term,
        reading: 'てすとご',
        accent: 0,
        partOfSpeech: '名·形动',
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
  await dialog.getByRole('button', { name: '预览笔记' }).click();
  await expect(dialog.locator('.preview-note .part-of-speech')).toHaveText('名·形动');
  await dialog.getByRole('button', { name: '预览下一条' }).click();
  await expect(dialog.locator('.preview-note .note-term')).toHaveText(term + '-文法');
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
    true,
  );
  await dialog.getByRole('button', { name: '上传笔记' }).click();
  await expect(dialog.getByText('导入完成，新增 2 条，跳过 0 条重复笔记。')).toBeVisible();
  await dialog.getByRole('button', { name: '关闭导入' }).click();
  await page.reload();
  await searchNotes(page, term);
  await expect(page.getByRole('button', { name: `阅读：${term}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入笔记', exact: true }).click();
  await page.getByRole('textbox', { name: '笔记内容 JSON' }).fill(body);
  await page.getByRole('button', { name: '预览笔记' }).click();
  await page.getByRole('button', { name: '上传笔记' }).click();
  await expect(page.getByText('导入完成，新增 0 条，跳过 2 条重复笔记。')).toBeVisible();
});

test('mobile fixed layout, browser back, and saved theme', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await searchNotes(page, '多彩');
  await expectFixedViewport(page);
  await page.getByRole('button', { name: '阅读：多彩', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '笔记阅读' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '切换深色模式' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await searchNotes(page, '多彩');
  await expect(page.getByRole('button', { name: '阅读：多彩', exact: true })).toBeVisible();
  await expectFixedViewport(page);
});
