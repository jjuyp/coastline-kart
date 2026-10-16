import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  timeout: 25000,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve('Coastline-Kart.html')).href + '?qa');
  await page.waitForFunction(
    () => window.__COASTLINE && document.querySelector('#loading').classList.contains('hidden'),
  );
  await page.screenshot({ path: path.resolve('output/playwright/final-menu.png') });
  await page.locator('#start').click();
  await page.evaluate(() => window.__COASTLINE.autoDrive(true));
  const samples = [],
    begin = Date.now();
  let lastLap = 0,
    views = 0;
  while (Date.now() - begin < 145000) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.__COASTLINE.state);
    samples.push({
      wall: (Date.now() - begin) / 1000,
      elapsed: s.elapsed,
      fps: s.fps,
      frameMs: s.frameMs,
      calls: s.graphics.calls,
      triangles: s.graphics.triangles,
      lap: s.cars[0].lap,
      progress: s.cars[0].progress,
    });
    if (s.cars[0].lap !== lastLap) {
      lastLap = s.cars[0].lap;
      console.log(
        JSON.stringify({
          lap: lastLap,
          elapsed: s.elapsed,
          fps: s.fps,
          progress: s.cars[0].progress,
        }),
      );
    }
    if (views < 3 && s.cars[0].progress > [150, 360, 550][views]) {
      await page.screenshot({
        path: path.resolve('output/playwright/final-race-sector-' + ++views + '.png'),
      });
    }
    if (s.race === 'results') {
      await page.waitForFunction(() => window.__COASTLINE.state.cars.every((c) => c.finished), {
        timeout: 30000,
      });
      await page.screenshot({ path: path.resolve('output/playwright/final-results.png') });
      const end = await page.evaluate(() => window.__COASTLINE.state);
      const report = {
        pass: errors.length === 0,
        mode: 'real-time continuous browser race; AI provides player steering through same physics/input path',
        wallSeconds: (Date.now() - begin) / 1000,
        errors,
        samples,
        final: end,
      };
      writeFileSync('output/playwright/full-race-report.json', JSON.stringify(report, null, 2));
      console.log(
        JSON.stringify({
          pass: report.pass,
          wallSeconds: report.wallSeconds,
          raceTime: end.cars[0].finishTime,
          carsFinished: end.cars.filter((c) => c.finished).length,
          fpsMean:
            samples.slice(6).reduce((a, x) => a + x.fps, 0) / Math.max(1, samples.length - 6),
          minFPS: Math.min(...samples.slice(6).map((x) => x.fps)),
          maxFPS: Math.max(...samples.slice(6).map((x) => x.fps)),
          errors,
        }),
      );
      break;
    }
  }
  if (!page.isClosed() && (await page.evaluate(() => window.__COASTLINE.state.race)) !== 'results')
    throw new Error('Real-time race did not finish');
} finally {
  await browser.close();
}
