import { expect, type Locator, type Page } from '@playwright/test';

export async function searchNotes(page: Page, query: string) {
  await expect(page.locator('.app-shell')).toBeVisible();
  const searchButton = page.getByRole('button', { name: '搜索', exact: true });
  if (await searchButton.isVisible()) await searchButton.click();
  const input = page.getByRole('searchbox', { name: '搜索笔记' });
  const pending = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/notes' && url.searchParams.get('q') === query && response.ok();
  });
  await input.fill(query);
  await pending;
  await expect(page.locator('.shelf-loading')).toHaveCount(0);
}
export async function returnHome(page: Page) {
  const button = page.getByRole('button', { name: '返回书库首页' });
  if (await button.isVisible()) await button.click();
  else await page.locator('.brand').click();
}
export async function swipe(page: Page, area: Locator, direction: 'next' | 'previous') {
  const bounds = (await area.boundingBox())!;
  const start = direction === 'next' ? 0.8 : 0.2;
  const end = direction === 'next' ? 0.2 : 0.8;
  const y = bounds.y + Math.min(bounds.height * 0.35, 170);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.mouse.move(bounds.x + bounds.width * start, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * end, y, { steps: 14 });
  await page.mouse.up();
}
export async function expectFixedViewport(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.height);
  await page.evaluate(() => window.scrollTo(0, 700));
  expect(await page.evaluate(() => scrollY)).toBe(0);
}
