import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = path.resolve('output/playwright');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  timeout: 25000,
});
const checks = [],
  errors = [];
const url = pathToFileURL(path.resolve('Coastline-Kart.html')).href + '?qa';
// Driver's right is forward cross world-up. Check actual heading change in that
// basis, independently of steering signs or world X/Z orientation.
function check(label, before, after, direction) {
  const rightX = -Math.cos(before.yaw),
    rightZ = Math.sin(before.yaw);
  const signedHeading = Math.sin(after.yaw) * rightX + Math.cos(after.yaw) * rightZ;
  const pass = direction === 'right' ? signedHeading > 0.01 : signedHeading < -0.01;
  checks.push({ label, direction, signedHeading, pass });
  if (!pass) throw new Error('Reversed steering: ' + JSON.stringify(checks.at(-1)));
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
  for (const view of ['standard', 'high']) {
    if (view === 'high') await page.keyboard.press('KeyC');
    for (const [key, direction] of [
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
      ['KeyA', 'left'],
      ['KeyD', 'right'],
    ]) {
      await page.evaluate(() => {
        window.__COASTLINE.restart();
        window.__COASTLINE.simulate(3.7);
      });
      await page.keyboard.down('ArrowUp');
      await page.evaluate(() => window.__COASTLINE.simulate(1.5));
      const before = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
      await page.keyboard.down(key);
      await page.evaluate(() => window.__COASTLINE.simulate(0.35));
      const after = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
      check(view + ' ' + key, before, after, direction);
      await page.keyboard.up(key);
      await page.keyboard.up('ArrowUp');
    }
  }
  for (const [key, direction] of [
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
  ]) {
    await page.evaluate(() => {
      window.__COASTLINE.restart();
      window.__COASTLINE.simulate(3.7);
    });
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.__COASTLINE.simulate(1.5));
    const before = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
    await page.keyboard.down(key);
    await page.keyboard.down('Space');
    await page.evaluate(() => window.__COASTLINE.simulate(1));
    const after = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
    check('drift ' + key, before, after, direction);
    await page.keyboard.up('Space');
    await page.keyboard.up(key);
    await page.evaluate(() => window.__COASTLINE.simulate(0.02));
    const released = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
    if (released.boost <= 0) throw new Error('Drift boost did not release');
    checks.push({ label: 'drift boost ' + direction, pass: true, boost: released.boost });
    await page.keyboard.up('ArrowUp');
  }
  await page.screenshot({ path: path.join(out, 'steering-fixed-desktop.png') });
  await page.close();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on('pageerror', (e) => errors.push(String(e)));
  await mobile.goto(url);
  await mobile.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
  const cdp = await mobile.context().newCDPSession(mobile);
  for (const direction of ['left', 'right']) {
    await mobile.evaluate(() => {
      window.__COASTLINE.restart();
      window.__COASTLINE.simulate(5.2);
    });
    const before = await mobile.evaluate(() => window.__COASTLINE.state.cars[0]),
      box = await mobile.locator(`[data-control="${direction}"]`).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await mobile.evaluate(() => window.__COASTLINE.simulate(0.35));
    const after = await mobile.evaluate(() => window.__COASTLINE.state.cars[0]);
    check('touch ' + direction, before, after, direction);
    await mobile.screenshot({
      path: path.join(out, 'steering-fixed-mobile-' + direction + '.png'),
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { pass: true, checks, errors };
  writeFileSync(path.join(out, 'steering-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
