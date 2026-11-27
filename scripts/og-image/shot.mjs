// Screenshot the two card pages written by gen.py. usage: node shot.mjs <work_dir>
import { createRequire } from 'node:module';
import path from 'node:path';

// Playwright is not a dependency of the app. Resolve it from scripts/node_modules, or from the
// directory given in PLAYWRIGHT_FROM (any folder where `npm i playwright` was run).
const require = createRequire(process.env.PLAYWRIGHT_FROM ? path.resolve(process.env.PLAYWRIGHT_FROM, 'noop.js') : import.meta.url);
const { chromium } = require('playwright');

const dir = path.resolve(process.argv[2]);
const browser = await chromium.launch();
for (const [name, w, h] of [['wide', 1200, 630], ['square', 600, 600]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`file://${dir}/${name}.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  console.log(name, await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).join(',')));
  await page.screenshot({ path: `${dir}/${name}.png`, clip: { x: 0, y: 0, width: w, height: h } });
}
await browser.close();
