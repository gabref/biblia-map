// Performance budget check for the production build (run after `npm run build`).
// Budgets are documented in docs/performance/performance-report.md; keep both in sync.
// Usage: node scripts/check-size.mjs [distDir]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const budgetsKb = {
   initialJs: 90, // JS loaded by index.html before any route chunk (entry + react vendor)
   initialCss: 20, // design system (tokens, ui, shell, pages) as of Sprint 1
   routeChunk: 25, // any single lazily loaded chunk (page or vendor such as d3)
   totalJs: 240, // sum of every chunk; raised in Sprint 2 as Read, Study, search and Insights became reachable. Users only load what a route needs.
};

const distDir = path.resolve(process.argv[2] ?? 'dist');
const assetsDir = path.join(distDir, 'assets');
const gzKb = (buffer) => gzipSync(buffer, { level: 9 }).length / 1024;

const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
const initialFiles = new Set(
   [ ...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g) ].map((match) => match[1]),
);
const files = (await readdir(assetsDir)).filter((file) => /\.(?:js|css)$/.test(file));

let initialJs = 0;
let initialCss = 0;
let totalJs = 0;
const rows = [];
const failures = [];

for (const file of files) {
   const size = gzKb(await readFile(path.join(assetsDir, file)));
   const initial = initialFiles.has(file);
   rows.push({ file, gzKb: +size.toFixed(1), initial });

   if (file.endsWith('.js')) {
      totalJs += size;

      if (initial) {
         initialJs += size;
      } else if (size > budgetsKb.routeChunk) {
         failures.push(`${file}: ${size.toFixed(1)} KB gz > ${budgetsKb.routeChunk} KB route chunk budget`);
      }
   } else if (initial) {
      initialCss += size;
   }
}

rows.sort((left, right) => right.gzKb - left.gzKb);
console.table(rows);

for (const [ name, value ] of Object.entries({ initialJs, initialCss, totalJs })) {
   const status = value > budgetsKb[name] ? 'OVER' : 'ok';
   console.log(`${status.padEnd(4)} ${name}: ${value.toFixed(1)} KB gz (budget ${budgetsKb[name]} KB)`);

   if (status === 'OVER') {
      failures.push(`${name}: ${value.toFixed(1)} KB gz > ${budgetsKb[name]} KB`);
   }
}

if (failures.length > 0) {
   console.error(`\nPerformance budget exceeded:\n- ${failures.join('\n- ')}`);
   process.exit(1);
}
