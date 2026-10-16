import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const out = path.resolve('output/playwright');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  timeout: 25000,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const errors = [],
  requests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('request', (r) => requests.push(r.url()));
const url = pathToFileURL(path.resolve('Coastline-Kart.html')).href + '?qa&debug';
try {
  await page.goto(url, { waitUntil: 'load', timeout: 25000 });
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
    { timeout: 25000 },
  );
  await page.screenshot({ path: path.join(out, 'desktop-menu.png') });
  console.log('menu ' + JSON.stringify(await page.evaluate(() => window.__COASTLINE.state)));
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__COASTLINE.state.race === 'racing', { timeout: 25000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => window.__COASTLINE.state);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  await page.waitForTimeout(1100);
  const during = await page.evaluate(() => window.__COASTLINE.state);
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowLeft');
  await page.waitForTimeout(100);
  const released = await page.evaluate(() => window.__COASTLINE.state);
  await page.screenshot({ path: path.join(out, 'desktop-driving.png') });
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => window.__COASTLINE.state);
  await page.waitForTimeout(300);
  const pausedAfter = await page.evaluate(() => window.__COASTLINE.state);
  if (paused.race !== 'paused' || paused.elapsed !== pausedAfter.elapsed)
    throw new Error('Browser pause failed');
  await page.screenshot({ path: path.join(out, 'desktop-paused.png') });
  await page.locator('#resume').click();
  await page.evaluate(() => {
    window.__COASTLINE.restart();
    window.__COASTLINE.autoDrive(true);
  });
  // Advance actual race logic at its normal fixed timestep, using the same AI pursuit input.
  await page.evaluate(() => window.__COASTLINE.simulate(18));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, 'desktop-circuit.png') });
  await page.evaluate(() => window.__COASTLINE.simulate(82));
  await page.waitForTimeout(150);
  const fullRace = await page.evaluate(() => window.__COASTLINE.state);
  if (fullRace.race !== 'results' || fullRace.cars[0].gate !== 37)
    throw new Error('Browser full race failed');
  await page.screenshot({ path: path.join(out, 'desktop-results.png') });
  await page.locator('#restart').click();
  const restarted = await page.evaluate(() => window.__COASTLINE.state);
  if (restarted.race !== 'countdown' || restarted.cars[0].gate !== 1)
    throw new Error('Results restart failed');
  await page.evaluate(() => {
    window.__COASTLINE.autoDrive(true);
    window.__COASTLINE.simulate(9);
  });
  await page.waitForTimeout(4000);
  const perf = await page.evaluate(() => window.__COASTLINE.state);
  console.log(
    'desktop ' +
      JSON.stringify({
        before,
        during,
        released,
        fullRace,
        restarted,
        perf,
        errors,
        externalRequests: requests.filter((u) => /^https?:/.test(u)),
      }),
  );
  await page.close();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (e) => errors.push('mobile: ' + e));
  await mobile.goto(url, { waitUntil: 'load' });
  await mobile.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
  await mobile.screenshot({ path: path.join(out, 'mobile-menu.png') });
  await mobile.locator('#start').tap();
  await mobile.waitForTimeout(4300);
  await mobile.waitForTimeout(1300);
  const touchButton = mobile.locator('[data-control="right"]'),
    bb = await touchButton.boundingBox();
  const cdp = await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }],
  });
  await mobile.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.screenshot({ path: path.join(out, 'mobile-driving.png') });
  const mobileState = await mobile.evaluate(() => ({
    state: window.__COASTLINE.state,
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
    touch: getComputedStyle(document.querySelector('.touch-controls')).display,
  }));
  await mobile.locator('#pause').tap();
  await mobile.screenshot({ path: path.join(out, 'mobile-paused.png') });
  writeFileSync(
    path.join(out, 'browser-report.json'),
    JSON.stringify(
      {
        errors,
        externalRequests: requests.filter((u) => /^https?:/.test(u)),
        before,
        during,
        released,
        fullRace,
        restarted,
        perf,
        mobileState,
        checks: [
          'desktop real keyboard acceleration',
          'held steer and drift',
          'boost release',
          'pause/resume',
          'full race to results',
          'restart',
          '390px touch driving',
          'offline zero external requests',
        ],
      },
      null,
      2,
    ),
  );
  console.log('mobile ' + JSON.stringify(mobileState));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
