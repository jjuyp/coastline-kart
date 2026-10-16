import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { ProgressiveSteering } from '../src/steering.js';

const out = path.resolve('output/playwright');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  timeout: 25000,
});
const errors = [];
const measurements = [];
const checks = [];
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) * (180 / Math.PI);
const url = (file) => pathToFileURL(path.resolve(file)).href + '?qa';
function verify(label, condition) {
  checks.push({ label, pass: !!condition });
  if (!condition) throw new Error(label);
}
async function ready(page, file) {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url(file));
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
}
async function prepare(page, mobile = false) {
  await page.evaluate(() => {
    window.__COASTLINE.restart();
    window.__COASTLINE.simulate(3.7);
  });
  if (!mobile) await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.__COASTLINE.simulate(1.5));
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [version, file] of [
    ['before', 'output/steering-before.html'],
    ['after', 'Coastline-Kart.html'],
  ]) {
    await ready(page, file);
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      for (const seconds of [0.1, 0.3, 0.6, 1]) {
        await prepare(page);
        const before = await page.evaluate(() => window.__COASTLINE.state.cars[0]);
        await page.keyboard.down(key);
        await page.evaluate((t) => window.__COASTLINE.simulate(t), seconds);
        const state = await page.evaluate(() => window.__COASTLINE.state);
        const car = state.cars[0];
        measurements.push({
          version,
          control: key,
          seconds,
          degrees: angle(before.yaw, car.yaw),
          steer: car.steer,
          command: state.steering?.command,
        });
        await page.keyboard.up(key);
        await page.keyboard.up('ArrowUp');
      }
    }
  }
  for (const control of ['ArrowLeft', 'ArrowRight']) {
    const before = measurements.filter((m) => m.version === 'before' && m.control === control);
    const after = measurements.filter((m) => m.version === 'after' && m.control === control);
    verify(
      control + ' short tap reduced by at least 40%',
      after[0].degrees < before[0].degrees * 0.6,
    );
    verify(control + ' long hold remains gentler', after[3].degrees < before[3].degrees * 0.8);
    verify(
      control + ' angle increases with hold duration',
      after.every((m, i) => i === 0 || m.degrees > after[i - 1].degrees),
    );
    verify(
      control + ' steering strength increases with hold duration',
      after.every((m, i) => i === 0 || Math.abs(m.steer) > Math.abs(after[i - 1].steer)),
    );
  }

  await prepare(page);
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.__COASTLINE.simulate(1));
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => window.__COASTLINE.simulate(0.65));
  let state = await page.evaluate(() => window.__COASTLINE.state);
  verify('release centers steering', Math.abs(state.cars[0].steer) < 0.02);
  verify('release clears hold duration', state.steering.heldSeconds === 0);

  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.__COASTLINE.simulate(1));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__COASTLINE.simulate(0.08));
  state = await page.evaluate(() => window.__COASTLINE.state);
  verify('opposite turn starts gently', state.steering.command > 0 && state.steering.command < 0.2);
  await page.keyboard.press('Escape');
  state = await page.evaluate(() => window.__COASTLINE.state);
  verify(
    'pause clears held steering',
    state.steering.heldSeconds === 0 && state.steering.command === 0,
  );
  await page.locator('#resume').click();
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  await page.evaluate(() => window.__COASTLINE.restart());
  state = await page.evaluate(() => window.__COASTLINE.state);
  verify(
    'restart clears held steering',
    state.steering.heldSeconds === 0 && state.cars[0].steer === 0,
  );
  await page.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await ready(mobile, 'Coastline-Kart.html');
  const cdp = await mobile.context().newCDPSession(mobile);
  for (const direction of ['left', 'right']) {
    const touch = [];
    for (const seconds of [0.1, 0.7]) {
      await prepare(mobile, true);
      const before = await mobile.evaluate(() => window.__COASTLINE.state.cars[0]);
      const box = await mobile.locator(`[data-control="${direction}"]`).boundingBox();
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      });
      await mobile.evaluate((t) => window.__COASTLINE.simulate(t), seconds);
      const after = await mobile.evaluate(() => window.__COASTLINE.state.cars[0]);
      touch.push({ seconds, degrees: angle(before.yaw, after.yaw), steer: after.steer });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    verify(
      'touch ' + direction + ' long hold turns more than tap',
      touch[1].degrees > touch[0].degrees * 3,
    );
    measurements.push({ version: 'after', control: 'touch ' + direction, samples: touch });
  }
  await mobile.screenshot({ path: path.join(out, 'progressive-steering-mobile.png') });

  function commandAt(rate, speed) {
    const control = new ProgressiveSteering();
    for (let i = 0; i < rate; i++) control.update(1 / rate, 1, speed);
    return control.value;
  }
  verify('high speed reduces maximum angle', commandAt(120, 37) < commandAt(120, 8));
  verify(
    '30/60/120 Hz produce matching steering',
    Math.abs(commandAt(30, 25) - commandAt(120, 25)) < 0.002 &&
      Math.abs(commandAt(60, 25) - commandAt(120, 25)) < 0.002,
  );
  verify('no browser errors', errors.length === 0);
  const report = { pass: true, measurements, checks, errors };
  writeFileSync(
    path.join(out, 'progressive-steering-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
