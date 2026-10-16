import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = path.resolve('output/playwright');
mkdirSync(out, { recursive: true });
const url = process.env.GAME_URL || pathToFileURL(path.resolve('Coastline-Kart.html')).href;
const qaUrl = url + (url.includes('?') ? '&qa' : '?qa');
const checks = [],
  errors = [],
  requests = [];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
});
function verify(label, value) {
  assert(value, label);
  checks.push(label);
}
async function ready(page) {
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => requests.push(request.url()));
  const response = await page.goto(qaUrl);
  if (response && /^https?:/.test(url)) assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
}
const state = (page) => page.evaluate(() => window.__COASTLINE.state);
const simulate = (page, seconds) => page.evaluate((s) => window.__COASTLINE.simulate(s), seconds);
async function touch(cdp, type, points = []) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}
async function center(page, selector, id) {
  const box = await page.locator(selector).boundingBox();
  assert(box, selector + ' is visible');
  return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await ready(page);
  await page.locator('#help').click();
  verify(
    'help dialog focuses an accessible native control',
    await page.locator('#help-dialog').evaluate((d) => d.contains(document.activeElement)),
  );
  await page.keyboard.press('Escape');
  verify('Escape closes help without starting race', (await state(page)).screen === 'menu');
  await page.locator('#settings').click();
  await page.locator('#sensitivity').selectOption('0.8');
  await page.locator('#auto-throttle').check();
  await page.locator('#camera-setting').selectOption('1');
  await page.locator('#settings-dialog .dialog-done').click();
  await page.reload();
  await page.waitForFunction(() => window.__COASTLINE);
  verify(
    'preferences persist across reload',
    (await state(page)).controls.sensitivity === 0.8 &&
      (await state(page)).controls.autoThrottle &&
      (await state(page)).controls.cameraMode === 1,
  );
  await page.locator('#start').focus();
  await page.keyboard.press('Enter');
  await simulate(page, 5.2);
  verify(
    'Enter starts once and automatic throttle accelerates',
    (await state(page)).race === 'racing' && (await state(page)).cars[0].speed > 10,
  );
  const moving = (await state(page)).cars[0].speed;
  await page.keyboard.down('ArrowDown');
  await simulate(page, 0.5);
  verify('brake overrides automatic throttle', (await state(page)).cars[0].speed < moving - 5);
  await page.keyboard.up('ArrowDown');
  await page.locator('#settings').click();
  const pausedTime = (await state(page)).elapsed;
  await simulate(page, 1);
  verify(
    'settings pauses simulation',
    (await state(page)).race === 'paused' && (await state(page)).elapsed === pausedTime,
  );
  await page.keyboard.press('Escape');
  verify('closing settings keeps intentional pause', (await state(page)).race === 'paused');
  await page.locator('#resume').click();
  await page.keyboard.down('ArrowLeft');
  await simulate(page, 0.5);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  verify(
    'lost focus pauses and clears steering',
    (await state(page)).race === 'paused' && (await state(page)).steering.command === 0,
  );
  await page.keyboard.up('ArrowLeft');
  await page.locator('#resume').click();
  await page.locator('#rescue').click();
  verify(
    'visible recovery button resets car and charges two seconds',
    (await state(page)).penalty === 2 && (await state(page)).cars[0].speed < 1,
  );
  verify(
    'race buttons return keyboard focus to driving',
    await page.locator('#game').evaluate((canvas) => document.activeElement === canvas),
  );
  await page.evaluate(() => {
    window.__COASTLINE.restart();
    window.__COASTLINE.autoDrive(true);
  });
  await simulate(page, 12);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, 'ux-desktop-race.png') });
  await simulate(page, 100);
  verify(
    'complete three-lap race and all six finish',
    (await state(page)).race === 'results' && (await state(page)).cars.every((c) => c.finished),
  );
  await page.screenshot({ path: path.join(out, 'ux-results.png') });
  await page.locator('#restart').click();
  verify(
    'results restart clears penalties and checkpoints',
    (await state(page)).race === 'countdown' &&
      (await state(page)).penalty === 0 &&
      (await state(page)).cars[0].gate === 1,
  );
  await page.close();

  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [844, 390],
  ]) {
    const mobile = await browser.newPage({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    await ready(mobile);
    const start = await mobile.locator('#start').boundingBox();
    verify(
      `${width}x${height} start remains on screen`,
      start && start.y >= 0 && start.y + start.height <= height,
    );
    await mobile.screenshot({ path: path.join(out, `ux-menu-${width}.png`) });
    await mobile.locator('#start').tap();
    await simulate(mobile, 5.2);
    const cdp = await mobile.context().newCDPSession(mobile);
    const left = await center(mobile, '[data-control="left"]', 1);
    const drift = await center(mobile, '[data-control="drift"]', 2);
    await touch(cdp, 'touchStart', [left, drift]);
    await simulate(mobile, 1.1);
    const during = await state(mobile);
    verify(
      `${width}x${height} simultaneous left and drift`,
      during.controls.touch.left &&
        during.controls.touch.drift &&
        during.cars[0].drifting &&
        during.steering.command > 0,
    );
    await touch(cdp, 'touchEnd');
    await simulate(mobile, 0.15);
    verify(
      `${width}x${height} release clears buttons and awards boost`,
      !(await state(mobile)).controls.touch.left &&
        !(await state(mobile)).controls.touch.drift &&
        (await state(mobile)).cars[0].boost > 0,
    );
    if (width === 390) {
      const secondLeft = { ...left, id: 6, x: left.x + 8 };
      await touch(cdp, 'touchStart', [left, secondLeft]);
      await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touch.left);
      await touch(cdp, 'touchEnd', [secondLeft]);
      await simulate(mobile, 0.1);
      verify(
        'releasing one of two fingers preserves the held control',
        (await state(mobile)).controls.touch.left,
      );
      await mobile.evaluate(() => window.dispatchEvent(new Event('blur')));
      verify(
        'interrupting held touch clears all pressed states',
        (await state(mobile)).race === 'paused' &&
          !(await state(mobile)).controls.touch.left &&
          (await mobile.locator('.touch-controls .pressed').count()) === 0,
      );
      await touch(cdp, 'touchEnd');
      await mobile.locator('#resume').tap();
    }
    await mobile.locator('#settings').tap();
    await mobile.locator('#touch-mode').selectOption('pad');
    await mobile.screenshot({ path: path.join(out, `ux-settings-${width}.png`) });
    await mobile.locator('#settings-dialog .dialog-done').tap();
    await mobile.locator('#resume').tap();
    const pad = await center(mobile, '#steering-pad', 3);
    await touch(cdp, 'touchStart', [pad]);
    await touch(cdp, 'touchMove', [{ ...pad, x: pad.x + 22 }]);
    await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touchAxis < -0.25);
    await simulate(mobile, 0.2);
    const gentle = Math.abs((await state(mobile)).steering.command);
    await touch(cdp, 'touchMove', [{ ...pad, x: pad.x + 64 }]);
    await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touchAxis < -0.95);
    await simulate(mobile, 0.3);
    const full = await state(mobile);
    verify(
      `${width}x${height} analog right scales with drag distance`,
      full.steering.command < 0 && Math.abs(full.steering.command) > gentle + 0.15,
    );
    await touch(cdp, 'touchMove', [{ ...pad, x: pad.x - 64 }]);
    await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touchAxis > 0.95);
    await simulate(mobile, 0.5);
    verify(
      `${width}x${height} analog left turns correctly`,
      (await state(mobile)).steering.command > 0.2,
    );
    await touch(cdp, 'touchCancel');
    await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touchAxis === 0);
    await simulate(mobile, 0.3);
    verify(
      `${width}x${height} touch cancellation recenters`,
      (await state(mobile)).controls.touchAxis === 0 &&
        Math.abs((await state(mobile)).steering.command) < 0.001,
    );
    await mobile.locator('#settings').tap();
    await mobile.locator('#auto-throttle').uncheck();
    await mobile.locator('#settings-dialog .dialog-done').tap();
    await mobile.locator('#resume').tap();
    await mobile.locator('#rescue').tap();
    const throttle = await center(mobile, '[data-control="throttle"]', 4);
    verify(
      `${width}x${height} manual throttle button is reachable`,
      throttle.x > 0 && throttle.x < width && throttle.y < height,
    );
    await touch(cdp, 'touchStart', [throttle]);
    await mobile.waitForFunction(() => window.__COASTLINE.state.controls.touch.throttle);
    await simulate(mobile, 0.6);
    verify(
      `${width}x${height} manual throttle accelerates`,
      (await state(mobile)).cars[0].speed > 4,
    );
    await touch(cdp, 'touchEnd');
    verify(
      `${width}x${height} no horizontal overflow`,
      await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    );
    const targets = await mobile.locator('.touch-controls button:visible').evaluateAll((buttons) =>
      buttons.map((b) => ({
        width: b.getBoundingClientRect().width,
        height: b.getBoundingClientRect().height,
      })),
    );
    verify(
      `${width}x${height} touch targets at least 44px`,
      targets.every((b) => b.width >= 44 && b.height >= 44),
    );
    await mobile.screenshot({ path: path.join(out, `ux-mobile-${width}.png`) });
    await mobile.close();
  }
  verify('no runtime errors', errors.length === 0);
  if (!/^https?:/.test(url))
    verify('standalone game uses no external requests', !requests.some((u) => /^https?:/.test(u)));
  const report = { pass: true, checkedAt: new Date().toISOString(), url, checks, errors };
  writeFileSync(path.join(out, 'ux-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
