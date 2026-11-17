import { test, expect } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test('uploads a square paper avatar and starts a six-kart match', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.locator('[data-testid="avatar-input"]').setInputFiles({ name: 'pilot.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  await expect(page.locator('.avatar-preview img')).toBeVisible();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspectMatch().racers.length)).toBe(6);
  expect(await page.evaluate(() => window.__paperKart!.inspectMatch().racers[0].avatar.startsWith('data:image/png'))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspectView().avatarTextureSize?.width)).toBe(512);
  expect(await page.evaluate(() => window.__paperKart!.inspectView().avatarFaceCount)).toBe(2);
  await expect(page.getByText('/ 06')).toBeVisible();
  await page.keyboard.press('KeyE');
  expect(errors).toEqual([]);
});
