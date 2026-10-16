import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const out = 'output/playwright';
mkdirSync(out, { recursive: true });
const url = process.env.GAME_URL || pathToFileURL(path.resolve('Coastline-Kart.html')).href;
const qaUrl = url + (url.includes('?') ? '&qa' : '?qa');
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errors = [],
  checks = [],
  measurements = [];
const state = (page) => page.evaluate(() => window.__COASTLINE.state);
const simulate = (page, seconds) => page.evaluate((s) => window.__COASTLINE.simulate(s), seconds);
function verify(label, condition) {
  assert(condition, label);
  checks.push(label);
}
async function ready(page, target = qaUrl) {
  page.on('pageerror', (error) => errors.push(String(error)));
  const response = await page.goto(target);
  if (/^https?:/.test(target)) assert.equal(response.status(), 200);
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
}
async function place(page, side, degrees = 90, speed = 0) {
  await page.evaluate(
    ({ side, degrees, speed }) => {
      window.__COASTLINE.restart();
      window.__COASTLINE.simulate(3.7);
      window.__COASTLINE.teleport(
        window.__COASTLINE.state.length * 0.31,
        side * 8,
        (-side * degrees * Math.PI) / 180,
        speed,
      );
    },
    { side, degrees, speed },
  );
}
try {
  if (!process.env.GAME_URL && existsSync('output/before-wall-fix.html')) {
    const old = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await ready(old, pathToFileURL(path.resolve('output/before-wall-fix.html')).href + '?qa');
    await place(old, 1);
    await simulate(old, 5);
    const pinned = await state(old);
    verify('old mobile build reproduces pinned wall', pinned.cars[0].speed < 2);
    measurements.push({
      mode: 'old mobile automatic throttle',
      speed: pinned.cars[0].speed,
      offset: pinned.cars[0].offset,
    });
    await old.screenshot({ path: path.join(out, 'wall-before-mobile.png') });
    await old.close();
  }
  for (const mobile of [false, true]) {
    const mode = mobile ? 'mobile' : 'desktop';
    const page = await browser.newPage({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await ready(page);
    const cdp = mobile ? await page.context().newCDPSession(page) : null;
    for (const side of [-1, 1]) {
      await place(page, side, 90, 12);
      if (!mobile) await page.keyboard.down('ArrowUp');
      await simulate(page, 0.25);
      const before = await state(page);
      const direction = side > 0 ? 'left' : 'right';
      if (mobile) {
        const box = await page.locator(`[data-control="${direction}"]`).boundingBox();
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
        });
        await page.waitForFunction(
          (key) => window.__COASTLINE.state.controls.touch[key],
          direction,
        );
      } else await page.keyboard.down(side > 0 ? 'ArrowLeft' : 'ArrowRight');
      let recovered;
      for (let i = 0; i < 35; i++) {
        await simulate(page, 0.1);
        recovered = await state(page);
        if (side * recovered.cars[0].offset < 7 && recovered.cars[0].speed > 5) break;
      }
      if (mobile) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(
          () =>
            !window.__COASTLINE.state.controls.touch.left &&
            !window.__COASTLINE.state.controls.touch.right,
        );
      } else {
        await page.keyboard.up('ArrowLeft');
        await page.keyboard.up('ArrowRight');
        await page.keyboard.up('ArrowUp');
      }
      verify(
        `${mode} countersteers free of ${side > 0 ? 'right' : 'left'} wall`,
        side * recovered.cars[0].offset < 7 && recovered.cars[0].speed > 5,
      );
      verify(
        `${mode} contact preserves race and penalty`,
        recovered.race === 'racing' &&
          recovered.penalty === 0 &&
          recovered.elapsed > before.elapsed,
      );
      measurements.push({
        mode,
        side,
        speed: recovered.cars[0].speed,
        offset: recovered.cars[0].offset,
        progress: recovered.cars[0].progress - before.cars[0].progress,
      });
    }
    await place(page, 1);
    if (!mobile) await page.keyboard.down('ArrowUp');
    const before = await state(page);
    verify(
      `${mode} passive recovery has no steering input`,
      !before.controls.touch.left && !before.controls.touch.right && before.steering.command === 0,
    );
    await simulate(page, 5);
    const released = await state(page);
    if (mobile)
      verify(
        'touch feedback clears after release',
        await page.evaluate(
          () =>
            getComputedStyle(document.querySelector('[data-control="left"]')).backgroundColor ===
            getComputedStyle(document.querySelector('[data-control="right"]')).backgroundColor,
        ),
      );
    measurements.push({
      mode: mode + ' passive',
      speed: released.cars[0].speed,
      offset: released.cars[0].offset,
      progress: released.cars[0].progress - before.cars[0].progress,
      touch: released.controls.touch,
    });
    verify(
      `${mode} throttle alone unpins square impact`,
      released.cars[0].speed > 4 &&
        released.cars[0].progress > before.cars[0].progress + 6 &&
        released.penalty === 0,
    );
    await page.screenshot({ path: path.join(out, `wall-after-${mode}.png`) });
    if (!mobile) await page.keyboard.up('ArrowUp');
    await page.evaluate(() => {
      window.__COASTLINE.restart();
      window.__COASTLINE.autoDrive(true);
      window.__COASTLINE.simulate(100);
    });
    const full = await state(page);
    verify(
      `${mode} full three-lap race still finishes`,
      full.race === 'results' && full.cars.every((car) => car.finished) && full.cars[0].gate === 37,
    );
    await page.locator('#restart').click();
    verify(
      `${mode} results restart still clears state`,
      (await state(page)).race === 'countdown' && (await state(page)).penalty === 0,
    );
    await page.close();
  }
  verify('no browser errors', errors.length === 0);
  const report = {
    pass: true,
    checkedAt: new Date().toISOString(),
    url,
    checks,
    measurements,
    errors,
  };
  writeFileSync(path.join(out, 'wall-browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
