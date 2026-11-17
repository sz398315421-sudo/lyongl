import { test, expect, type Page } from '@playwright/test';
import { sampleTrack, findNearestTrackAngle } from '../../game-core/track';
import { angleDifference } from '../../game-core/math';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(request.url() + ': ' + request.failure()?.errorText);
  });
  return errors;
}

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeEnabled();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await expect(page.getByTestId('speed')).toHaveText('0');
}

test('3D startup, keys, drift, braking, reset, focus and repeated start', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeEnabled();
  expect(await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    return canvas.width >= innerWidth && canvas.height >= innerHeight && Math.abs(canvas.getBoundingClientRect().height - innerHeight) < 2;
  })).toBe(true);
  await page.screenshot({ path: info.outputPath('home.png') });
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(850);
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.speed)).toBeGreaterThan(8);
  // Initiate a left drift, then countersteer while Space remains held so the
  // narrower racing line is kept until the boost is charged.
  await page.keyboard.down('KeyA');
  await page.keyboard.down('Space');
  await page.waitForTimeout(45);
  const driftStarted = await page.evaluate(() => window.__paperKart!.inspect().kart);
  expect(driftStarted.driftHeld, JSON.stringify(driftStarted)).toBe(true);
  expect(driftStarted.drifting, JSON.stringify(driftStarted)).toBe(true);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.driftCharge)).toBeGreaterThan(0.75);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.boostRemaining)).toBeGreaterThan(0);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: info.outputPath('driving.png') });
  await page.keyboard.down('KeyS');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.speed)).toBeLessThanOrEqual(0);
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.speed)).toBeLessThan(-1);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.resetCount)).toBe(1);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const paused = await page.evaluate(() => window.__paperKart!.inspect().race.elapsed);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__paperKart!.inspect().race.elapsed)).toBe(paused);
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.speed)).toBe(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(1);
  await expect(page.getByTestId('lap')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('steering keys map to the player-relative camera sides', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  const moveAndMeasure = async (key: 'KeyA' | 'KeyD') => {
    await page.keyboard.down('KeyW');
    await page.keyboard.down(key);
    await page.waitForTimeout(320);
    await page.keyboard.up(key);
    await page.keyboard.up('KeyW');
    return page.evaluate(() => {
      const state = window.__paperKart!.inspect();
      return { x: state.kart.x, z: state.kart.z };
    });
  };
  const origin = await page.evaluate(() => {
    const state = window.__paperKart!.inspect();
    return { x: state.kart.x, z: state.kart.z, cameraRight: window.__paperKart!.inspectView().cameraRight };
  });
  const left = await moveAndMeasure('KeyA');
  const leftDot = (left.x - origin.x) * origin.cameraRight.x + (left.z - origin.z) * origin.cameraRight.z;
  expect(leftDot).toBeLessThan(0);
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.resetCount)).toBe(1);
  const reset = await page.evaluate(() => {
    const state = window.__paperKart!.inspect();
    return { x: state.kart.x, z: state.kart.z, cameraRight: window.__paperKart!.inspectView().cameraRight };
  });
  const right = await moveAndMeasure('KeyD');
  const rightDot = (right.x - reset.x) * reset.cameraRight.x + (right.z - reset.z) * reset.cameraRight.z;
  expect(rightDot).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('real keyboard input completes three laps and supports restart', async ({ page }, info) => {
  const errors = watchErrors(page);
  await start(page);
  const track = await page.evaluate(() => window.__paperKart!.track());
  const held = new Set<string>();
  const setKey = async (key: string, down: boolean) => {
    if (down && !held.has(key)) { await page.keyboard.down(key); held.add(key); }
    if (!down && held.has(key)) { await page.keyboard.up(key); held.delete(key); }
  };
  const deadline = Date.now() + 105_000;
  while (Date.now() < deadline) {
    const { kart, race } = await page.evaluate(() => window.__paperKart!.inspect());
    if (race.phase === 'finished') break;
    const angle = findNearestTrackAngle(track, kart);
    const target = sampleTrack(track, angle + 0.23);
    const error = angleDifference(Math.atan2(target.x - kart.x, target.z - kart.z), kart.heading);
    await setKey('KeyW', kart.speed < 17);
    await setKey('KeyA', error > 0.025);
    await setKey('KeyD', error < -0.025);
    await page.waitForTimeout(80);
  }
  for (const key of held) await page.keyboard.up(key);
  // The player can finish before the slowest AI; settlement waits for all six
  // racers so the result list and finish times are complete.
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspectMatch().phase), { timeout: 60_000 }).toBe('finished');
  await expect(page.getByRole('heading', { name: '兜风成功！' })).toBeVisible();
  const final = await page.evaluate(() => window.__paperKart!.inspect());
  expect(final.race.completedLaps).toBe(3);
  expect(final.kart.resetCount).toBe(0);
  const results = await page.evaluate(() => window.__paperKart!.inspectMatch().results);
  expect(results).toHaveLength(6);
  expect(results.map(result => result.position)).toEqual([1, 2, 3, 4, 5, 6]);
  await page.screenshot({ path: info.outputPath('finished.png') });
  await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect(page.getByTestId('lap')).toHaveText('1');
  await expect(page.getByTestId('speed')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('guardrail collision and automatic runoff recovery work through keyboard input', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.collisionCount)).toBeGreaterThan(0);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyR');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.resetCount)).toBe(1);
  const progress = await page.evaluate(() => window.__paperKart!.inspect().race.completedLaps);
  await page.keyboard.down('KeyW');
  // A deliberately turns away from the first bend so the runoff recovery path is exercised.
  await page.keyboard.down('KeyA');
  await expect.poll(() => page.evaluate(() => window.__paperKart!.inspect().kart.resetCount)).toBeGreaterThan(1);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  const final = await page.evaluate(() => window.__paperKart!.inspect());
  expect(final.race.completedLaps).toBe(progress);
  expect(Number.isFinite(final.kart.x) && Number.isFinite(final.kart.z)).toBe(true);
  expect(errors).toEqual([]);
});

test('mobile multi-touch, pointer cancellation and portrait/landscape', async ({ browser }, info) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto('http://127.0.0.1:5173');
  await expect(page.getByRole('button', { name: '开始游戏' })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('mobile-home.png') });
  await page.getByRole('button', { name: '开始游戏' }).tap();
  const dial = await page.locator('.speed-dial').boundingBox();
  for (const button of await page.locator('.touch-button').all()) {
    const rect = await button.boundingBox();
    expect(rect).not.toBeNull();
    const overlaps = rect!.x < dial!.x + dial!.width && rect!.x + rect!.width > dial!.x
      && rect!.y < dial!.y + dial!.height && rect!.y + rect!.height > dial!.y;
    expect(overlaps).toBe(false);
  }
  const accelerator = await page.getByRole('button', { name: '加速', exact: true }).boundingBox();
  const right = await page.getByRole('button', { name: '向右转向' }).boundingBox();
  const session = await context.newCDPSession(page);
  const touch = (id: number, box: NonNullable<typeof right>) => ({ id, x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, accelerator!)] });
  await page.waitForTimeout(850);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, accelerator!), touch(2, right!)] });
  await page.waitForTimeout(550);
  const driving = await page.evaluate(() => window.__paperKart!.inspect().kart);
  expect(driving.speed).toBeGreaterThan(8);
  expect(driving.heading).toBeLessThan(-0.2);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.getByRole('button', { name: '重置赛车' }).tap();
  await expect(page.getByTestId('speed')).toHaveText('0');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__paperKart!.inspect().kart.speed)).toBe(0);
  await page.screenshot({ path: info.outputPath('mobile-driving.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('button', { name: '加速', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('canvas')!.clientHeight)).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.screenshot({ path: info.outputPath('mobile-landscape.png') });
  expect(errors).toEqual([]);
  await context.close();
});
