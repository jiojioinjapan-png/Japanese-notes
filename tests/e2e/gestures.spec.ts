import { test, expect } from './fixtures';
import { searchNotes } from './helpers';

test.use({ isMobile: true, hasTouch: true, viewport: { width: 393, height: 852 } });
test('real touch gestures animate horizontal turns, keep vertical entry scrolling, and honor reduced motion', async ({
  page,
  context,
}) => {
  const prefix = `touch${Date.now()}`;
  expect(
    (
      await page.request.post('/api/notes/import', {
        data: {
          notes: [1, 2].map((i) => ({
            type: 'grammar',
            term: `${prefix}-${i}`,
            meaning: '触控翻页测试',
            example: 'これは縦スクロールを確認するための長い例文です。'.repeat(60),
          })),
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/');
  await searchNotes(page, prefix);
  await page.getByLabel('排序方式').selectOption('term');
  await page.getByRole('button', { name: `阅读：${prefix}-1`, exact: true }).tap();
  const stage = page.locator('.reader-stage');
  const box = (await stage.boundingBox())!;
  const session = await context.newCDPSession(page);
  const y = box.y + Math.min(170, box.height * 0.35);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 310, y }],
  });
  for (let x = 285; x >= 85; x -= 25)
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  await expect(stage).toHaveClass(/is-dragging/);
  expect(
    await page.locator('.reader-page').evaluate((element) => getComputedStyle(element).transform),
  ).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.reader-position > span')).toHaveText('2 / 2');
  const scrollY = box.y + box.height - 60;
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 180, y: scrollY }],
  });
  for (let delta = 20; delta <= 180; delta += 20)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 180, y: scrollY - delta }],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect
    .poll(() => page.locator('.reader-page').evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.locator('.reader-position > span')).toHaveText('2 / 2');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '上一篇' }).click();
  await expect(page.locator('.reader-position > span')).toHaveText('1 / 2');
  await expect(stage).not.toHaveClass(/is-turning/);
  expect(await page.locator('.reader-page').evaluate((element) => element.scrollTop)).toBe(0);
});
