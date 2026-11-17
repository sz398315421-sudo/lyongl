import { test, expect, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('guest account fallback keeps Stage 01–03 gameplay available', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /游客 · 登录同步/ })).toBeVisible();
  await page.getByRole('button', { name: /游客 · 登录同步/ }).click();
  await expect(page.getByRole('dialog', { name: /把车手带到每一台设备/ })).toBeVisible();
  await expect(page.getByText('云存档尚未连接')).toBeVisible();
  await expect(page.getByText(/仍可正常进行单机和联机比赛/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('guest-passport.png') });
  await page.getByRole('button', { name: '关闭账号面板' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.getByTestId('speed')).toHaveText('0');
  expect(await page.evaluate(() => window.__paperKart!.inspectMatch().racers.length)).toBe(6);
  expect(errors).toEqual([]);
});
