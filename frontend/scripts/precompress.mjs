// Writes .br (quality 11) and .gz (level 9) siblings for every compressible file in dist/
// so nginx can serve them with brotli_static / gzip_static instead of compressing on the fly
// (nginx's default on-the-fly gzip level 1 is ~2.5x larger than brotli 11 for our JSON).
// Usage: node scripts/precompress.mjs [distDir] [--drop-raw <subdir>]
//   --drop-raw generated  deletes the uncompressed original under dist/<subdir> once a .gz exists
//                         (Docker image only: nginx serves it via gzip_static always + gunzip).
import { availableParallelism } from 'node:os';

process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, availableParallelism()));

const { readdir, readFile, stat, unlink, writeFile } = await import('node:fs/promises');
const path = await import('node:path');
const { promisify } = await import('node:util');
const zlib = await import('node:zlib');

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

const args = process.argv.slice(2);
const dropRawIndex = args.indexOf('--drop-raw');
const dropRawSubdir = dropRawIndex >= 0 ? args.splice(dropRawIndex, 2)[1] : null;
const distDir = path.resolve(args[0] ?? 'dist');
const dropRawDir = dropRawSubdir ? path.join(distDir, dropRawSubdir) + path.sep : null;
const compressible = /\.(?:html|js|mjs|css|json|svg|webmanifest|txt|xml|map)$/i;
const minBytes = 1024;

async function* walk(directory) {
   for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
         yield* walk(fullPath);
      } else if (compressible.test(entry.name)) {
         yield fullPath;
      }
   }
}

async function compressFile(filePath) {
   const source = await readFile(filePath);

   if (source.length < minBytes) {
      return { raw: source.length, br: source.length, gz: source.length };
   }

   const [ br, gz ] = await Promise.all([
      brotli(source, {
         params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
         },
      }),
      gzip(source, { level: 9 }),
   ]);
   const writes = [];

   // Only keep variants that are actually smaller than the original.
   if (br.length < source.length) {
      writes.push(writeFile(`${filePath}.br`, br));
   }

   if (gz.length < source.length) {
      writes.push(writeFile(`${filePath}.gz`, gz));
   }

   await Promise.all(writes);

   if (dropRawDir && filePath.startsWith(dropRawDir) && gz.length < source.length) {
      await unlink(filePath);
   }

   return { raw: source.length, br: Math.min(br.length, source.length), gz: Math.min(gz.length, source.length) };
}

const started = Date.now();
const files = [];

for await (const filePath of walk(distDir)) {
   files.push(filePath);
}

// Largest first keeps the worker pool busy until the end.
const sizes = await Promise.all(files.map(async (filePath) => [ filePath, (await stat(filePath)).size ]));
sizes.sort((left, right) => right[1] - left[1]);

const concurrency = Math.max(2, availableParallelism());
const totals = { raw: 0, br: 0, gz: 0 };
let next = 0;

await Promise.all(
   Array.from({ length: concurrency }, async () => {
      while (next < sizes.length) {
         const [ filePath ] = sizes[next];
         next += 1;
         const result = await compressFile(filePath);
         totals.raw += result.raw;
         totals.br += result.br;
         totals.gz += result.gz;
      }
   }),
);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
console.log(
   `precompressed ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s: ` +
      `${mb(totals.raw)} raw -> ${mb(totals.br)} br / ${mb(totals.gz)} gz`,
);
