import { expect, test } from './fixtures';
import { expectFixedViewport, swipe } from './helpers';

test('each home book opens a term-and-meaning preview instead of a full note card', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  for (const label of ['单词', '拟声拟态词', '语法']) {
    await page.getByRole('button', { name: `查看${label}，`, exact: false }).click();
    const list = page.getByRole('dialog', { name: `${label}预览列表` });
    await expect(list).toBeVisible();
    await expect(list.locator('.collection-row').first()).toBeVisible();
    await expect(
      list.locator('.note-card, .accent, .pronunciation, .part-of-speech, .note-example'),
    ).toHaveCount(0);
    expect(
      (await list.locator('.collection-row').first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await expectFixedViewport(page);
    await list.getByRole('button', { name: '返回书库', exact: true }).click();
    await expect(list).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => history.state?.kotobaCollection ?? null))
      .toBe(null);
  }
});

test('long book previews scroll, load later rows, swipe across batches, and retain the list position', async ({
  page,
}) => {
  const prefix = `一覧${Date.now()}`;
  expect(
    (
      await page.request.post('/api/notes/import', {
        data: {
          notes: Array.from({ length: 135 }, (_, index) => ({
            type: 'word',
            term: `${prefix}-${String(index).padStart(3, '0')}`,
            meaning: `预览释义 ${index}`,
          })),
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button', { name: '查看单词，', exact: false }).click();
  const list = page.getByRole('dialog', { name: '单词预览列表' });
  const rows = list.locator('.collection-row');
  await expect(rows).toHaveCount(100);
  const scrolling = list.locator('.collection-list-scroll');
  expect(await scrolling.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const nextBatch = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/notes' &&
      url.searchParams.get('category') === 'word' &&
      url.searchParams.get('page') === '2' &&
      url.searchParams.get('pageSize') === '100'
    );
  });
  await scrolling.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
  expect((await nextBatch).ok()).toBe(true);
  await expect.poll(() => rows.count()).toBeGreaterThan(100);
  const firstTerm = await rows.nth(99).locator('.collection-row-term').innerText();
  const nextTerm = await rows.nth(100).locator('.collection-row-term').innerText();
  await rows.nth(99).scrollIntoViewIfNeeded();
  const before = await scrolling.evaluate((el) => el.scrollTop);
  await rows.nth(99).click();
  const reader = page.getByRole('dialog', { name: '笔记阅读' });
  await expect(reader.locator('.reader-page .note-term')).toHaveText(firstTerm);
  await expect(reader.locator('.reader-position > span')).toHaveText(/^100 \/ /);
  await swipe(page, reader.locator('.reader-stage'), 'next');
  await expect(reader.locator('.reader-page .note-term')).toHaveText(nextTerm);
  await swipe(page, reader.locator('.reader-stage'), 'previous');
  await expect(reader.locator('.reader-page .note-term')).toHaveText(firstTerm);
  await reader.getByRole('button', { name: '返回预览列表', exact: true }).click();
  await expect(reader).toHaveCount(0);
  expect(Math.abs((await scrolling.evaluate((el) => el.scrollTop)) - before)).toBeLessThanOrEqual(
    1,
  );
  await expect.poll(() => page.evaluate(() => history.state?.kotobaReader ?? null)).toBe(null);
  await rows.nth(99).click();
  await expect(reader).toBeVisible();
  await page.goBack();
  await expect(reader).toHaveCount(0);
  await expect(list).toBeVisible();
  expect(Math.abs((await scrolling.evaluate((el) => el.scrollTop)) - before)).toBeLessThanOrEqual(
    1,
  );
  await page.goBack();
  await expect(list).toHaveCount(0);
  await expect(page.locator('.app-shell')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.position)).toBe('');
  await expectFixedViewport(page);
});

test('preview loading errors can be retried and an empty book can return home', async ({
  page,
}) => {
  let failed = false;
  let empty = false;
  await page.route('**/api/notes?**', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.searchParams.get('category') !== 'grammar' ||
      url.searchParams.get('pageSize') !== '100'
    )
      return route.continue();
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 500, json: { error: '测试读取失败' } });
    }
    if (empty)
      return route.fulfill({
        json: {
          notes: [],
          total: 0,
          page: 1,
          pageSize: 100,
          counts: { all: 0, word: 0, onomatopoeia: 0, grammar: 0 },
        },
      });
    return route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button', { name: '查看语法，', exact: false }).click();
  const list = page.getByRole('dialog', { name: '语法预览列表' });
  await expect(list.getByRole('alert')).toHaveText(/测试读取失败/);
  await list.getByRole('button', { name: '重新加载' }).click();
  await expect(list.locator('.collection-row').first()).toBeVisible();
  await list.getByRole('button', { name: '返回书库', exact: true }).click();
  await expect(list).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state?.kotobaCollection ?? null)).toBe(null);
  empty = true;
  await page.getByRole('button', { name: '查看语法，', exact: false }).click();
  await expect(list.getByText('这本笔记还没有内容')).toBeVisible();
  await list.getByRole('button', { name: '返回书库', exact: true }).click();
  await expect(list).toHaveCount(0);
});
