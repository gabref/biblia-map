// Render the BibliaMap icon set and the brand sheet from the hand-authored SVGs.
//
//   node scripts/brand/build.mjs            icons + brand sheet
//   node scripts/brand/build.mjs --icons    icons only
//   node scripts/brand/build.mjs --sheet    brand sheet only
//
// Sources (edit these, then re-run):
//   frontend/public/bibliamap-icon.svg     full mark  -> 192/512 PNG, maskable 512, apple-touch 180
//   frontend/public/favicon.svg            small mark -> favicon.ico (16/32/48)
// See README.md for requirements (Node + Playwright's Chromium, fonts from frontend/node_modules).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pub = path.join(root, 'frontend/public');
const brandDocs = path.join(root, 'docs/design/brand');
const fontsDir = path.join(root, 'frontend/node_modules/@fontsource-variable');

// Playwright is not a dependency of the app. Resolve it from scripts/node_modules, or from the
// directory given in PLAYWRIGHT_FROM (any folder where `npm i playwright` was run).
const require = createRequire(process.env.PLAYWRIGHT_FROM ? path.resolve(process.env.PLAYWRIGHT_FROM, 'noop.js') : import.meta.url);
const { chromium } = require('playwright');

const BG = '#0d1015'; // --bg, dark theme
const MASKABLE_SCALE = 0.88; // keeps the glyph inside the 80% maskable safe circle

const only = process.argv[2];
const icon = await readFile(path.join(pub, 'bibliamap-icon.svg'), 'utf8');
const favicon = await readFile(path.join(pub, 'favicon.svg'), 'utf8');
const glyph = icon.match(/<g id="glyph">([\s\S]*?)<\/g>/)[1];

/** Full-bleed square (the platform applies its own mask), glyph optionally shrunk into the safe zone. */
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
<rect width="512" height="512" fill="${BG}"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph}</g></svg>`;

const browser = await chromium.launch();

async function png(svg, size) {
   const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
   const sized = svg.replace(/<svg([^>]*?)(?:\swidth="[^"]*")?(?:\sheight="[^"]*")?/, `<svg$1 width="${size}" height="${size}"`);
   await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`);
   const buffer = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
   await page.close();
   return buffer;
}

/** ICO container with PNG-encoded entries (supported everywhere since Vista / all current browsers). */
function ico(entries) {
   const header = Buffer.alloc(6 + 16 * entries.length);
   header.writeUInt16LE(1, 2);
   header.writeUInt16LE(entries.length, 4);
   let offset = header.length;
   entries.forEach(({ size, data }, index) => {
      const at = 6 + 16 * index;
      header.writeUInt8(size, at);
      header.writeUInt8(size, at + 1);
      header.writeUInt16LE(1, at + 4);
      header.writeUInt16LE(32, at + 6);
      header.writeUInt32LE(data.length, at + 8);
      header.writeUInt32LE(offset, at + 12);
      offset += data.length;
   });
   return Buffer.concat([ header, ...entries.map((entry) => entry.data) ]);
}

async function emit(file, buffer) {
   await writeFile(path.join(pub, file), buffer);
   console.log(`${file.padEnd(34)} ${(buffer.length / 1024).toFixed(1)} kB`);
}

if (only !== '--sheet') {
   await emit('bibliamap-icon-192.png', await png(icon, 192));
   await emit('bibliamap-icon-512.png', await png(icon, 512));
   await emit('bibliamap-icon-maskable-512.png', await png(fullBleed(MASKABLE_SCALE), 512));
   await emit('apple-touch-icon.png', await png(fullBleed(1), 180));
   const faviconLight = favicon.replace(/<style>[\s\S]*?<\/style>/, `<style>.t{fill:${BG}}</style>`);
   const entries = [];
   for (const size of [ 16, 32, 48 ]) {
      entries.push({ size, data: await png(faviconLight, size) });
   }
   await emit('favicon.ico', ico(entries));
}

if (only !== '--icons') {
   const uri = async (file, type = 'image/svg+xml') => `data:${type};base64,${(await readFile(file)).toString('base64')}`;
   const font = (name) => uri(path.join(fontsDir, name, 'files', `${name}-latin-wght-normal.woff2`), 'font/woff2');
   const img = {
      icon: await uri(path.join(pub, 'bibliamap-icon.svg')),
      favicon: await uri(path.join(pub, 'favicon.svg')),
      mono: await uri(path.join(pub, 'safari-pinned-tab.svg')),
      maskable: await uri(path.join(pub, 'bibliamap-icon-maskable-512.png'), 'image/png'),
      apple: await uri(path.join(pub, 'apple-touch-icon.png'), 'image/png'),
      lockupDark: await uri(path.join(brandDocs, 'bibliamap-lockup-dark.svg')),
      lockupLight: await uri(path.join(brandDocs, 'bibliamap-lockup-light.svg')),
      og: await uri(path.join(pub, 'og-image.png'), 'image/png'),
      ogSquare: await uri(path.join(pub, 'og-image-square.png'), 'image/png'),
   };
   const sizes = [ 64, 48, 32, 24, 16 ];
   const faviconRow = sizes.map((s) => `<figure><img src="${img.favicon}" width="${s}" height="${s}"><figcaption>${s}</figcaption></figure>`).join('');
   const swatches = [
      [ 'Ink-slate', '#0d1015', '--bg · tile' ], [ 'Ink', '#e9ebef', 'the margin rule' ], [ 'Lapis', '#8faef5', 'reference arcs' ],
      [ 'Rubric', '#f0705a', 'you are here' ], [ 'Gilt', '#e2b44c', 'outgoing reference' ],
   ].map(([ name, hex, use ]) => `<div class="sw"><i style="background:${hex}"></i><b>${name}</b><code>${hex}</code><span>${use}</span></div>`).join('');
   const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Literata;font-weight:200 900;src:url('${await font('literata')}') format('woff2')}
@font-face{font-family:Instrument;font-weight:400 700;src:url('${await font('instrument-sans')}') format('woff2')}
@font-face{font-family:Mono;font-weight:100 800;src:url('${await font('jetbrains-mono')}') format('woff2')}
*{box-sizing:border-box;margin:0}
body{width:1600px;background:#080a0e;color:#e9ebef;font:500 15px Instrument,sans-serif;padding:48px;-webkit-font-smoothing:antialiased}
h1{font:600 34px Literata,serif;letter-spacing:-.015em}
header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:28px}
header p{color:#8a92a1;max-width:820px;text-align:right;line-height:1.45}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:20px}
section{border-radius:14px;padding:24px;position:relative;border:1px solid rgba(233,235,239,.1);background:#0d1015;min-height:120px}
section.light{background:#f3f4f1;color:#151922;border-color:transparent}
section.surface{background:#151920}
h2{font:600 11px Instrument,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#8a92a1;margin-bottom:20px}
.light h2{color:#626978}
.center{display:flex;align-items:center;justify-content:center;gap:40px;height:calc(100% - 34px)}
figure{display:flex;flex-direction:column;align-items:center;gap:10px}
figcaption{font:500 11px Mono,monospace;color:#8a92a1}
.light figcaption{color:#626978}
.row{display:flex;align-items:flex-end;gap:28px}
.tab{display:flex;align-items:center;gap:8px;height:34px;padding:0 12px;border-radius:8px 8px 0 0;font:500 12px Instrument,sans-serif;width:210px}
.tabs{display:flex;flex-direction:column;gap:14px}
.strip{padding:8px 8px 0;border-radius:8px}
.sw{display:grid;grid-template-columns:28px 90px 80px 1fr;align-items:center;gap:12px;padding:7px 0;font-size:14px}
.sw i{width:28px;height:28px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(233,235,239,.14)}
.sw code{font:500 12px Mono,monospace;color:#b4bac6}.sw span{color:#8a92a1}
.og{display:flex;gap:20px;align-items:flex-start}.og img{border-radius:10px;display:block;box-shadow:0 0 0 1px rgba(233,235,239,.1)}
.round{border-radius:50%}.squircle{border-radius:22.5%}
</style>
<header><h1>BibliaMap — brand sheet</h1><p>The margin rule, two reference arcs leaving it, and a rubric thumb-index notch marking where you are. Together they draw a B.</p></header>
<div class="grid">
 <section style="grid-column:span 4;grid-row:span 2"><h2>Mark · 512</h2><div class="center"><img src="${img.icon}" width="360" height="360"></div></section>
 <section style="grid-column:span 8"><h2>Lockup on dark</h2><div class="center" style="padding:28px 0"><img src="${img.lockupDark}" height="112"></div></section>
 <section class="light" style="grid-column:span 8"><h2>Lockup on paper</h2><div class="center" style="padding:28px 0"><img src="${img.lockupLight}" height="112"></div></section>
 <section class="surface" style="grid-column:span 4"><h2>Favicon · simplified mark</h2><div class="row">${faviconRow}</div></section>
 <section class="light" style="grid-column:span 4"><h2>Favicon on paper</h2><div class="row">${faviconRow}</div></section>
 <section style="grid-column:span 4"><h2>In a browser tab</h2><div class="tabs">
   <div class="strip" style="background:#dee1e6"><div class="tab" style="background:#fff;color:#202124"><img src="${img.favicon}" width="16" height="16">BibliaMap</div></div>
   <div class="strip" style="background:#202124"><div class="tab" style="background:#35363a;color:#e8eaed"><img src="${img.favicon}" width="16" height="16">BibliaMap</div></div>
 </div></section>
 <section class="surface" style="grid-column:span 5"><h2>App icon · maskable 512 · apple-touch 180</h2><div class="row">
   <figure><img class="squircle" src="${img.maskable}" width="120" height="120"><figcaption>squircle</figcaption></figure>
   <figure><img class="round" src="${img.maskable}" width="120" height="120"><figcaption>circle</figcaption></figure>
   <figure><img class="squircle" src="${img.apple}" width="90" height="90"><figcaption>iOS 180</figcaption></figure>
   <figure><img class="squircle" src="${img.apple}" width="60" height="60"><figcaption>60</figcaption></figure>
 </div></section>
 <section class="light" style="grid-column:span 3"><h2>Monochrome · pinned tab</h2><div class="row">
   <figure><img src="${img.mono}" width="96" height="96"><figcaption>96</figcaption></figure>
   <figure><img src="${img.mono}" width="32" height="32"><figcaption>32</figcaption></figure>
   <figure><img src="${img.mono}" width="16" height="16"><figcaption>16</figcaption></figure>
 </div></section>
 <section style="grid-column:span 4"><h2>Pigments</h2>${swatches}</section>
 <section class="surface" style="grid-column:span 12"><h2>Share cards · og-image 1200×630 · og-image-square 600×600</h2><div class="og">
   <img src="${img.og}" width="920" height="483"><img src="${img.ogSquare}" width="483" height="483">
 </div></section>
</div>`;
   const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
   await page.setContent(html, { waitUntil: 'load' });
   await page.evaluate(() => document.fonts.ready);
   await mkdir(brandDocs, { recursive: true });
   const sheet = path.join(brandDocs, 'brand-sheet.png');
   await page.screenshot({ path: sheet, fullPage: true });
   console.log(`docs/design/brand/brand-sheet.png  ${((await readFile(sheet)).length / 1024).toFixed(1)} kB`);
}

await browser.close();
