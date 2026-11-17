import { test, expect } from '@playwright/test';

test('production build renders and drives without development diagnostics', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeEnabled();
  expect(await page.evaluate(() => typeof window.__paperKart)).toBe('undefined');
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => Number(await page.getByTestId('speed').textContent())).toBeGreaterThan(20);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('KeyR');
  await expect(page.getByTestId('speed')).toHaveText('0');
  await page.screenshot({ path: info.outputPath('production-driving.png') });
  expect(errors).toEqual([]);
});
