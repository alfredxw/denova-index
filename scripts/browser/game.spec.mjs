import { test, expect } from '@playwright/test';
import { createFixture } from './fixture.mjs';

let host;
test.beforeEach(async () => { host = await createFixture(); });
test.afterEach(async () => { await host.close(); });
test('chat, public posts, AI comments and likes persist through reload', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(host.url); const game = page.frameLocator('iframe');
  await expect(game.locator('#status')).toHaveText('进度已保存');
  await game.locator('#message').fill('展览叫街角如何？');
  await game.getByRole('button', { name: '发送', exact: true }).click();
  await expect(game.locator('.message.assistant').last()).toContainText('你更喜欢哪一张');
  await expect(game.locator('#status')).toHaveText('进度已保存');
  await game.getByRole('button', { name: '朋友圈', exact: true }).click();
  const poster = game.locator('[data-post-id="poster"]');
  await poster.getByRole('button', { name: '点赞', exact: true }).click();
  await expect(poster.getByRole('button', { name: '已赞', exact: true })).toBeEnabled();
  await poster.getByRole('button', { name: '评论', exact: true }).click();
  await game.locator('#comment-text').fill('我可以帮忙印海报。');
  await game.getByRole('button', { name: '发送并邀请回复', exact: true }).click();
  await expect(poster.locator('.comments')).toContainText('你更喜欢哪一张');
  await game.locator('#post-text').fill('周六一起布展！<script>throw 1</script>');
  await game.getByRole('button', { name: '发表', exact: true }).click();
  await expect(game.locator('.post-text').first()).toHaveText('周六一起布展！<script>throw 1</script>');
  await page.reload(); await expect(game.locator('#status')).toHaveText('进度已保存');
  await game.getByRole('button', { name: '朋友圈', exact: true }).click();
  await expect(poster.locator('.comments')).toContainText('我可以帮忙印海报');
  await expect(poster.getByRole('button', { name: '已赞', exact: true })).toBeVisible();
  expect(host.state.calls).toBe(2); expect(errors).toEqual([]);
});
test('refresh during streaming recovers the original run and permits cancellation', async ({ page }) => {
  host.state.delay = 250;
  await page.goto(host.url); const game = page.frameLocator('iframe');
  await expect(game.locator('#send')).toBeEnabled();
  await game.locator('#message').fill('你好'); await game.locator('#send').click();
  await expect(game.locator('#stop')).toBeVisible();
  await page.reload(); await expect(game.locator('#stop')).toBeVisible();
  expect(host.state.calls).toBe(1);
  await game.locator('#stop').click();
  await expect(game.locator('#send')).toBeEnabled();
  expect(host.state.save.pending).toBeNull();
});
test('contact search and per-contact drafts do not mix recipients', async ({ page }) => {
  await page.goto(host.url); const game = page.frameLocator('iframe');
  await expect(game.locator('#send')).toBeEnabled();
  await game.locator('#message').fill('给林蔓的草稿');
  await game.getByRole('button', { name: '许宁 · 街角咖啡店主', exact: true }).click();
  await expect(game.locator('#message')).toHaveValue('');
  await game.locator('#message').fill('给许宁的草稿');
  await game.getByRole('button', { name: '林蔓 · 楼上的设计师', exact: true }).click();
  await expect(game.locator('#message')).toHaveValue('给林蔓的草稿');
  await game.locator('#search').fill('不存在');
  await expect(game.locator('#contacts')).toHaveText('没有找到联系人');
});
for (const [locale, theme, width] of [['zh-CN','light',1440],['zh-CN','dark',390],['en-US','light',390],['en-US','dark',1440]]) {
  test('layout and appearance ' + [locale,theme,width].join('-'), async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(host.url + '?locale=' + locale + '&theme=' + theme);
    const game = page.frameLocator('iframe');
    await expect(game.locator('#send')).toBeEnabled();
    if (width < 600) await game.locator('.contact').first().click();
    await expect(game.locator('#message')).toBeVisible();
    expect(await game.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('chat.png') });
    await game.locator('#tab-moments').click();
    await expect(game.locator('.post')).toHaveCount(3);
    expect(await game.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('moments.png') });
    await page.evaluate(() => window.appearance('en-US','dark'));
    await expect(game.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(game.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(game.locator('#moments-view h2')).toHaveText('Moments');
  });
}
