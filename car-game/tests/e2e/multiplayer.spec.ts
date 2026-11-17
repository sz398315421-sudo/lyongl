import { expect, test, type Page } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test('two browsers join by room code, start six racers and share authoritative movement', async ({ browser, baseURL }, info) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const hostErrors = watchErrors(host);
  const guestErrors = watchErrors(guest);

  await Promise.all([host.goto(baseURL!), guest.goto(baseURL!)]);
  await Promise.all([
    expect(host.getByRole('button', { name: '开始游戏' })).toBeEnabled(),
    expect(guest.getByRole('button', { name: '开始游戏' })).toBeEnabled(),
  ]);
  await host.getByLabel('你的昵称').fill('红纸车手');
  await guest.getByLabel('你的昵称').fill('蓝纸车手');
  await host.locator('[data-testid="avatar-input"]').setInputFiles({ name: 'host.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });
  await expect(host.locator('.avatar-preview img')).toBeVisible();
  await host.getByRole('button', { name: '创建房间' }).click();
  const roomCode = (await host.getByTestId('room-code').textContent())!.trim();
  expect(roomCode).toMatch(/^[A-Z2-9]{4}$/);

  await guest.getByLabel('4 位房间码').fill(roomCode);
  await guest.getByRole('button', { name: '加入', exact: true }).click();
  await expect(host.getByText('2 / 6 位真人已入场')).toBeVisible();
  await expect(guest.getByText('红纸车手')).toBeVisible();
  await expect(host.getByText('蓝纸车手')).toBeVisible();
  await expect(guest.getByAltText('红纸车手的头像')).toBeVisible();
  await host.screenshot({ path: info.outputPath('paper-lobby.png') });

  await Promise.all([
    host.getByRole('button', { name: '我准备好了' }).click(),
    guest.getByRole('button', { name: '我准备好了' }).click(),
  ]);
  await expect(host.getByRole('button', { name: '开始比赛' })).toBeEnabled();
  await host.getByRole('button', { name: '开始比赛' }).click();

  await Promise.all([
    expect.poll(() => host.evaluate(() => window.__paperKart!.inspectMatch().racers.length)).toBe(6),
    expect.poll(() => guest.evaluate(() => window.__paperKart!.inspectMatch().racers.length)).toBe(6),
  ]);
  await expect.poll(() => host.evaluate(() => window.__paperKart!.inspectMatch().racers.filter(racer => racer.kind === 'player').length)).toBe(2);
  expect(await host.evaluate(() => window.__paperKart!.inspectMatch().racers.filter(racer => racer.kind === 'ai').length)).toBe(4);
  expect(await host.evaluate(() => window.__paperKart!.inspectMatch().racers.find(racer => racer.name === '红纸车手')!.avatar.startsWith('data:image/png'))).toBe(true);
  await host.screenshot({ path: info.outputPath('online-race.png') });

  const hostId = await host.evaluate(() => window.__paperKart!.inspectOnline()!.localSessionId);
  const initial = await guest.evaluate(id => {
    const kart = window.__paperKart!.inspectMatch().racers.find(racer => racer.id === id)!.kart;
    return { x: kart.x, z: kart.z };
  }, hostId);
  await host.keyboard.down('KeyW');
  await host.waitForTimeout(900);
  await host.keyboard.up('KeyW');
  await expect.poll(() => guest.evaluate(({ id, initialPosition }) => {
    const kart = window.__paperKart!.inspectMatch().racers.find(racer => racer.id === id)!.kart;
    return Math.hypot(kart.x - initialPosition.x, kart.z - initialPosition.z);
  }, { id: hostId, initialPosition: initial })).toBeGreaterThan(1);

  await guestContext.close();
  await expect.poll(() => host.evaluate(id => window.__paperKart!.inspectMatch().racers.find(racer => racer.id !== id && racer.name.startsWith('蓝纸车手'))?.kind, hostId)).toBe('ai');
  expect(hostErrors).toEqual([]);
  expect(guestErrors).toEqual([]);
  await hostContext.close();
});
