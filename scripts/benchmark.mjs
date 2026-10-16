import { chromium } from '../../tidepool-jelly/node_modules/playwright-core/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const mode = process.argv[2] || 'default';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    'C:/Users/shang/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args:
    mode === 'swift'
      ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
      : ['--enable-unsafe-swiftshader', '--no-sandbox'],
  timeout: 25000,
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => console.log('ERROR ' + e));
  await page.goto(pathToFileURL(path.resolve('Coastline-Kart.html')).href + '?qa&debug');
  await page.waitForFunction(() => window.__COASTLINE);
  await page.waitForTimeout(8000);
  console.log(mode + ' ' + JSON.stringify(await page.evaluate(() => window.__COASTLINE.state)));
  await page.screenshot({ path: path.resolve('output/playwright/benchmark-' + mode + '.png') });
} finally {
  await browser.close();
}
