import { test, expect, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('home item manual explains every power-up and both control modes', async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: /道具图鉴/ }).click();
  const guide = page.getByRole('dialog', { name: /四件小道具/ });
  await expect(guide).toBeVisible();
  for (const name of ['纸飞机', '胶水', '纸箱护盾', '火箭加速']) {
    await expect(guide.getByRole('heading', { name })).toBeVisible();
  }
  await expect(guide.getByText(/电脑按/)).toContainText('E');
  await expect(guide.getByText('手机点“道具”按钮')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('item-manual.png') });
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.getByTestId('speed')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('item manual fits a phone viewport and keeps all cards reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开道具图鉴' }).click();
  const guide = page.getByRole('dialog', { name: /四件小道具/ });
  await expect(guide).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const spring = guide.getByRole('heading', { name: '火箭加速' });
  await spring.scrollIntoViewIfNeeded();
  await expect(spring).toBeVisible();
  const bounds = await guide.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});
