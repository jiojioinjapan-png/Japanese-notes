import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { searchNotes, swipe } from './helpers';

async function importNotes(page: import('@playwright/test').Page, notes: unknown[]) {
  expect((await page.request.post('/api/notes/import', { data: { notes } })).status()).toBe(201);
}

test('editing fields saves to D1, supports blank optional values, and keeps sorted reader navigation correct', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const prefix = `編集${Date.now()}`;
  await importNotes(
    page,
    ['a', 'b', 'c'].map((suffix) => ({
      type: 'word',
      term: `${prefix}-${suffix}`,
      reading: 'へんしゅう',
      accent: 0,
      partOfSpeech: '名',
      meaning: '原释义',
    })),
  );
  await page.goto('/');
  await searchNotes(page, prefix);
  await page.getByLabel('排序方式').selectOption('term');
  await page.getByRole('button', { name: `阅读：${prefix}-a`, exact: true }).click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await reader.getByRole('button', { name: '编辑词条', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑词条', exact: true });
  await editor.getByLabel('词条', { exact: true }).fill(prefix + '-z');
  await editor.getByLabel('平假名读音', { exact: true }).fill('');
  await editor.getByLabel('声调', { exact: true }).fill('');
  await editor.getByLabel('词性', { exact: true }).fill('');
  await editor.getByLabel('中文释义', { exact: true }).fill('保存后的释义');
  await editor.getByLabel('日语例句', { exact: true }).fill('これは編集後の例文です。');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(reader.locator('.reader-page .note-term')).toHaveText(prefix + '-z');
  await expect(reader.locator('.reader-page .note-meaning')).toHaveText('保存后的释义');
  await expect(
    reader.locator(
      '.reader-page .accent, .reader-page .pronunciation, .reader-page .part-of-speech',
    ),
  ).toHaveCount(0);
  await expect(reader.locator('.reader-position > span')).toHaveText('3 / 3');
  await swipe(page, reader.locator('.reader-stage'), 'previous');
  await expect(reader.locator('.reader-page .note-term')).toHaveText(prefix + '-c');
  await reader.getByRole('button', { name: '编辑词条', exact: true }).click();
  await expect(editor).toBeVisible();
  await page.goBack();
  await expect(editor).toHaveCount(0);
  await expect(reader).toBeVisible();
  await reader.getByRole('button', { name: '关闭阅读' }).click();
  const saved = await (
    await page.request.get('/api/notes?q=' + encodeURIComponent(prefix + '-z'))
  ).json();
  expect(saved.notes[0]).toMatchObject({
    term: prefix + '-z',
    meaning: '保存后的释义',
    revision: 1,
  });
  expect(saved.notes[0].accent).toBeUndefined();
});

test('editing from a book updates its preview row and safely handles an entry moving out of the category', async ({
  page,
}) => {
  const term = `一覧編集${Date.now()}`;
  await importNotes(page, [{ type: 'word', term, meaning: '修改前' }]);
  await page.goto('/');
  await page.getByRole('button', { name: '查看单词，', exact: false }).click();
  const list = page.getByRole('dialog', { name: '单词预览列表' });
  await list.getByRole('button', { name: '阅读：' + term, exact: true }).click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await reader.getByRole('button', { name: '编辑词条' }).click();
  const editor = page.getByRole('dialog', { name: '编辑词条', exact: true });
  await editor.getByLabel('中文释义', { exact: true }).fill('修改后的列表释义');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await reader.getByRole('button', { name: '返回预览列表' }).click();
  const row = list.getByRole('button', { name: '阅读：' + term, exact: true });
  await expect(row.locator('.collection-row-meaning')).toHaveText('修改后的列表释义');
  await row.click();
  await reader.getByRole('button', { name: '编辑词条' }).click();
  await editor.getByLabel('分类', { exact: true }).selectOption('grammar');
  await editor.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(reader.locator('.reader-position > span')).toHaveText('1 / 1');
  await expect(reader.getByRole('button', { name: '下一篇' })).toBeDisabled();
  await reader.getByRole('button', { name: '返回预览列表' }).click();
  await expect(row).toHaveCount(0);
});

test('list font controls change only preview typography, adapt row spacing, and persist across books and reloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.getByRole('button', { name: '查看单词，', exact: false }).click();
  const list = page.getByRole('dialog', { name: '单词预览列表' });
  const term = list.locator('.collection-row-term').first();
  await expect(term).toBeVisible();
  const initial = await term.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const height = (await list.locator('.collection-row').first().boundingBox())!.height;
  const heading = await list.locator('h1').evaluate((el) => getComputedStyle(el).fontSize);
  const readerPreference = await page.evaluate(() => localStorage.getItem('kotoba-reader-size'));
  await list.getByRole('button', { name: '调整列表字号' }).click();
  await list.getByRole('button', { name: '放大列表字号' }).click();
  await list.getByRole('button', { name: '放大列表字号' }).click();
  expect(await term.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(
    initial,
  );
  expect((await list.locator('.collection-row').first().boundingBox())!.height).toBeGreaterThan(
    height,
  );
  expect(await list.locator('h1').evaluate((el) => getComputedStyle(el).fontSize)).toBe(heading);
  expect(await page.evaluate(() => localStorage.getItem('kotoba-reader-size'))).toBe(
    readerPreference,
  );
  await list.getByRole('button', { name: '返回书库', exact: true }).click();
  await expect(list).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: '查看语法，', exact: false }).click();
  await expect(page.getByRole('dialog', { name: '语法预览列表' })).toHaveClass(/list-size-3/);
});

test('sentence speaker uses real decodable MP3, stops for editing, and reports playback failures', async ({
  page,
}) => {
  const prefix = `音声${Date.now()}`;
  await importNotes(page, [
    { type: 'grammar', term: prefix, example: '彼は留学経験があるだけあって、英語が上手だ。' },
  ]);
  const mp3 = await readFile('tests/fixtures/example.mp3');
  let fail = false;
  let requested = '';
  await page.route('**/api/notes/*/audio?**', async (route) => {
    requested = route.request().url();
    if (fail) return route.fulfill({ status: 502, json: { error: '发音测试失败' } });
    return route.fulfill({ contentType: 'audio/mpeg', body: mp3 });
  });
  await page.goto('/');
  await searchNotes(page, prefix);
  await page.getByRole('button', { name: '阅读：' + prefix, exact: true }).click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  const audio = await reader.locator('audio').elementHandle();
  await reader.getByRole('button', { name: '播放例句发音' }).click();
  await expect(reader.getByRole('button', { name: '停止播放例句' })).toBeVisible();
  expect(requested).toContain('revision=0');
  expect(await audio!.evaluate((el) => (el as HTMLAudioElement).duration)).toBeGreaterThan(0);
  await reader.getByRole('button', { name: '编辑词条' }).click();
  await expect(page.getByRole('dialog', { name: '编辑词条', exact: true })).toBeVisible();
  expect(await audio!.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(true);
  await page.getByRole('button', { name: '取消编辑' }).click();
  fail = true;
  await reader.getByRole('button', { name: '播放例句发音' }).click();
  await expect(reader.getByText('发音暂时不可用，点击重试。')).toBeVisible();
});
