# BibliaMap performance report: Sprint 1

Date: 2026-11-27. Branch `sprint1/performance`.

## How it was measured

- **Server:** the production Docker image (nginx), run locally. `vite preview` does not compress, so
  its transfer sizes are not realistic. "Baseline" is the pre-sprint `main` image (`3793ab1`).
  "After" is this branch rebased on `main`. That `main` already includes the deps upgrade, the
  code-review fixes and the design-system restyle, so the "after" numbers include their effects
  too (for example the new self-hosted fonts, which add about 100 KB).
- **Browser:** Playwright with headless Chromium 1200. The script is a scratch file and is not
  committed; it is described here so the run can be repeated.
  - **Desktop:** 1350×940, no throttling.
  - **Mobile:** 412×823, CPU slowed 4×, 150 ms RTT, 1.6 Mbit/s down (similar to Lighthouse "slow 4G").
  - The Umami analytics script is blocked.
- **Metrics:**
  - LCP, CLS and long tasks come from `PerformanceObserver`. TBT is the sum of (long task − 50 ms).
  - Transfer bytes are CDP `encodedDataLength`, so they are the bytes actually sent over the wire.
  - "ready" means the route's main content is rendered and no loading shimmer is left.
- **Flows:** these are SPA navigations inside one tab, with a warm HTTP cache for what was already
  loaded. Flow CLS is cumulative since the page loaded.
- Desktop timings on localhost are close to noise. The mobile rows are the ones that matter.

## Live site (bibliamap.gabudev.cloud, before this sprint)

| Check | Result |
| --- | --- |
| Protocol | HTTP/2 (Traefik → nginx 1.27.5) |
| TTFB `/` | 200–330 ms (TLS ≈ 155–195 ms of that) |
| Compression | gzip at nginx's default level 1, no brotli. `verse-index.json` was 530 KB on the wire (brotli 11: 177 KB) |
| `index.html` caching | No `Cache-Control`, so browsers cached it heuristically (stale-shell risk). Fixed by the code-review stream |
| `/assets/*` caching | `max-age=31536000` sent twice (`expires` + `add_header`). Fixed by the code-review stream |
| `/generated/*` caching | `max-age=3600` sent twice |
| `datasets.json` | Not compressed (784 B, below `gzip_min_length`) |

## Baseline vs after

### Bundle (production build)

| | Baseline | After |
| --- | --- | --- |
| JS chunks | 1 (`index.js` 267.7 KB / **84.2 KB gz**) | entry 6.4 KB gz + `react-vendor` 68.1 KB gz = **74.4 KB gz initial**, plus one lazy chunk per page (1.3–6 KB gz each) and `d3-vendor` 10.3 KB gz (Chord and Verse only) |
| Total JS | 84.2 KB gz | 107.9 KB gz (the design system added code too) |
| CSS | 6.5 KB gz | 16.8 KB gz (design-system restyle, not this stream) |
| Wire encoding | gzip level 1 | brotli 11, precompressed (gzip 9 as fallback) |

### Route loads (cold cache)

Each cell is ready ms / LCP ms / TBT ms / CLS / total KB / JSON KB.

| Route | Baseline, mobile | After, mobile | Baseline, desktop | After, desktop |
| --- | --- | --- | --- | --- |
| `/` Overview | 3261 / 2744 / 669 / 0.11 / 112 / 4 | **2389 / 1912 / 313 / 0.05** / 205 / 4 | 790 / 576 / 113 | 587 / 568 / 6 |
| `/chord` | 3829 / 3600 / 1524 / 0 / 115 / 7 | **2695 / 2480 / 801 / 0.05** / 207 / 6 | 708 / 444 / 90 | 512 / 496 / 5 |
| `/verse` | 9565 / 7740 / 1310 / 0 / 1222 / **1114** | **3910 / 2732 / 503 / 0.05** / 457 / **255** | 900 / 984 / 68 | 633 / 664 / 0 |
| `/blocks` | 11388 / 10480 / 2043 / 0 / 1384 / **1276** | **4913 / 4280 / 289 / 0.05** / 645 / **444** | 791 / 776 / 97 | 820 / 752 / 68 |
| `/about` | 4639 / 4120 / 1132 / 0.14 / 112 / 4 | **2117 / 1692 / 181 / 0.03** / 205 / 4 | 489 / 372 / 0 | 618 / 588 / 14 |

The "after" total KB includes about 100 KB of web fonts that the design restyle added (Literata
normal and italic, Instrument Sans, JetBrains Mono). Without them, the total would be lower than the
baseline on every route.

### User flows (mobile profile; JSON KB is wire bytes)

| Flow | Baseline | After |
| --- | --- | --- |
| Overview → "View all" | **never finishes** (effect cancelled its own request), 1278 KB JSON | 3.2 s, **445 KB** JSON, TBT 563 ms |
| Overview → Verse (nav) | 6.0 s, 900 KB JSON | **1.1 s, 123 KB** JSON (chunk and data prefetched) |
| Change verse (same book) | 0.5 s, 73 KB | 1.6 s, 231 KB (see note) |
| Switch dataset on Verse | 7.7 s, **1424 KB** | **1.1 s, 124 KB** |
| Verse → Chord | 2.1 s, 66 KB, TBT 1129 ms | **0.6 s**, 21 KB, TBT 76 ms |
| Chord → Blocks | 7.6 s, **1100 KB** | **2.0 s, 275 KB** |

Note on "change verse": the number swings with which adjacency and verse-text books the new
verse's neighbours live in, and with requests still in flight from earlier steps. On desktop it went
from 324 KB to 101 KB.

## What changed

1. **Precompressed brotli and gzip with `brotli_static` / `gzip_static`.** This is the biggest win.
   - `scripts/precompress.mjs` runs during the Docker build. It writes `.br` (q11) and `.gz` (level 9)
     next to every text asset of 1 KB or more.
   - The Dockerfile builds only the ngx_brotli **static** module, pinned to a fixed commit, against
     the runtime nginx version with `--with-compat`. Precompressed files need no brotli library at
     runtime.
   - JSON now goes over the wire 2.5–4× smaller than with the old gzip level 1. For example
     `chapters.json` drops from 390 KB to 124 KB.
2. **`verse-index.json` is no longer downloaded.**
   - It is 4.1 MB raw / 177 KB br.
   - Every `VerseRef` can be derived from `chapters.json`. I checked all four datasets: they match
     with 0 differences.
   - `loadVerseIndex()` now builds the index from the cached chapters, memoised per array. Verse,
     Overview details and Blocks already load chapters, so each saves one large request and its
     JSON parse.
3. **Fetch cache.** The code-review stream added an in-memory LRU with in-flight dedup in
   `src/data/generated.ts`. Revisiting a page, verse or dataset now skips the network and
   `JSON.parse`.
4. **Route-level code splitting.**
   - `src/pages/lazyPages.ts` wraps every page in `React.lazy`. `App.tsx` changed in only three
     places: the import, `<Suspense>` and nav `onPointerEnter`/`onFocus`.
   - React and d3 are split into long-lived vendor chunks (`vite.config.ts` → rolldown
     `codeSplitting.groups`), so an app deploy does not invalidate them.
5. **Prefetching.**
   - `main.tsx` starts the current route's chunk **and its JSON** in parallel with `datasets.json`.
     Before, the order was html → js → registry → page data.
   - Hovering or focusing a nav link prefetches that route's chunk and data.
   - Once the page is idle, the remaining route chunks are fetched (JS only).
   - Data prefetch is skipped when `Save-Data` is on.
6. **Overview "View all" fixed and incremental.**
   - The effect depended on `detailsLoading`, so setting that flag cancelled the request.
   - The modal now mounts 200 rows and adds more as you scroll (IntersectionObserver sentinel),
     instead of about 30k `<li>` + `<meter>` at once.
   - `Math.max(...rows)` (risk of stack overflow on large lists) is now a reduce.
7. **nginx.** These build on the code-review stream's config.
   - `/generated/` sends `Cache-Control: public, max-age=3600, stale-while-revalidate=604800`, so
     repeat visits render from cache and revalidate in the background.
   - `X-Robots-Tag: noindex, nofollow` on every location (robots.txt comes from the og-preview
     stream).
   - PNGs and other binaries are served raw with the correct `Content-Type`.
8. **Performance budget check:** `npm run size` (see below).

## Docker image

The PM measured the local `bibliamap-frontend:local` image at 283 MB (45 MB compressed). Of that,
185 MB is the `COPY dist` layer, and the generated JSON in it is about 176 MB.

| Step | Uncompressed (`docker images`) | Compressed (`docker save \| gzip -1`) |
| --- | --- | --- |
| Baseline (`nginx:1.27-alpine` + raw dist) | **284 MB** | 44.3 MB |
| After: `nginx:1.30-alpine-slim`, generated JSON as `.br` + `.gz` only (no raw copy) | **113 MB** | 47.4 MB |

Layer breakdown (`docker history`) after the change:

| Layer | Size |
| --- | --- |
| alpine-slim base (rootfs 9.1 MB + nginx 11.7 MB) | ≈ 21 MB |
| `COPY dist` (generated JSON 40.7 MB in `.br` + `.gz`, plus assets, fonts and icons) | 43.5 MB |
| brotli module + nginx config | ~0.1 MB |

- **Base image:** `nginx:1.30-alpine-slim` is 29.6 MB, against 102 MB for `nginx:1.30-alpine`. It
  includes gzip_static, gunzip, `--with-compat` and busybox `wget`, so the healthcheck still works.
  - I did not switch to `nginx-unprivileged`, because it listens on 8080. Switching would need
    `deploy/docker-compose.yml` (Traefik `loadbalancer.server.port=80`) and the VPS to change in the
    same deploy. That is left as a recommendation.
- **Data:** generated JSON is stored only precompressed.
  - nginx `/generated/` uses `gzip_static always` with `gunzip on`. Brotli clients get `.br`, gzip
    clients get `.gz`, and identity clients get the original bytes, inflated on the fly.
  - I checked with curl: br, gzip and identity all return 200 with `Content-Type: application/json`,
    and the identity body is byte-identical to the source. Missing files still return 404.
  - Files under 1 KB (manifest, `datasets.json`) stay raw.
  - Nothing under `generated/` was removed. `verse-index.json` is still shipped, because the
    extractor and other streams may use it.
- **Trade-off:** disk use falls by 60%, but the registry pull grows by about 3 MB. Raw JSON
  compresses very well in a gzip layer, while `.br` + `.gz` are already incompressible. Shipping
  `.gz` only, without `.br`, would make the pull about 31 MB. But every browser would then get
  gzip 9 instead of brotli, which is 1.3–2.3× more bytes per flow. For a site that runs entirely in
  the browser, I kept brotli.
- **Build stage:** `npm ci --no-audit --no-fund`, with `package*.json` copied first so the install
  layer is cached.
  - A BuildKit `--mount=type=cache` was tried and dropped. The legacy builder (Docker without buildx,
    as on the owner's machine) rejects it. CI's `docker build ./frontend` works either way.
  - `.dockerignore` now also excludes tests, `*.md`, `.vite`, logs, `.env*`, `.git` and the
    Dockerfile.
- **Build time:** precompressing about 176 MB takes about 65 s on 17 cores. Expect about 4–5 min on
  a 4-core GitHub runner.

## Performance budget

Future work must stay within these. `npm run size` checks the JS and CSS rows after `npm run build`
and fails the build when one is over budget.

| Budget | Limit | Current |
| --- | --- | --- |
| Initial JS (entry + React vendor), gz | **≤ 90 KB** | 74.4 KB |
| Any single lazy chunk, gz | **≤ 25 KB** | 10.3 KB (d3-vendor) |
| Total JS, gz | **≤ 160 KB** | 107.9 KB |
| Initial CSS, gz | **≤ 20 KB** | 16.8 KB |
| Web fonts on first view (latin subsets) | **≤ 120 KB** | about 100 KB |
| Mobile LCP (slow 4G, 4× CPU), Overview / About | **≤ 2.5 s** | 1.7–1.9 s |
| Mobile LCP, Verse | **≤ 3.0 s** | 2.7 s |
| Mobile TBT, any route | **≤ 600 ms** | 180–800 ms (Chord is over: see below) |
| CLS per route | **≤ 0.1** | 0.03–0.05 |
| JSON per flow (wire): first Overview | **≤ 20 KB** | 4 KB |
| JSON per flow: open Verse (depth 1) | **≤ 300 KB** | 255 KB cold / 123 KB after nav prefetch |
| JSON per flow: change verse in same book | **≤ 150 KB** | 100–230 KB |
| JSON per flow: open Chord | **≤ 30 KB** | 6–21 KB |
| JSON per flow: Blocks / Overview "View all" | **≤ 450 KB** | 444 KB (at the limit; see below) |

Rules for page streams:

- New data files must be fetched through `src/data/generated.ts`, so they get the cache.
- Never fetch `edges/*.compact.json` (about 325 KB br, about 3 MB parsed) for a view that needs one
  book or one verse.
- New routes go through `lazyPages.ts`.

## Recommendations for Sprint 2 page streams

These are deliberately not done here, because the pages are being redesigned.

### Overview

- "View all" for book lists should read `stats.books.json` / `stats.chapters.json` (about 20 KB and
  100 KB raw). It should not download all edges plus chapters (445 KB br, then about 290 ms of
  long tasks on mobile).
  - Verse lists need a per-verse degree file from the extractor (`stats.verse-degree.json`, planned
    by E-G). With that file, the modal drops from 445 KB to about 60 KB and from 3.2 s to under 1 s.
- If client-side counting stays, move `buildOverviewDetails` and its JSON parse into a Web Worker.
- The modal should close on Esc and trap focus (UX item U1 in the product review).

### Verse

- Depth 2 and 3 load dozens of adjacency books (product review: 91 files / 17 MB decoded for John
  3:16 at depth 2). Two options:
  - Cap the number of books per expansion and load more progressively.
  - Or have the extractor emit per-chapter adjacency (`adjacency/<dir>/<book>/<chapter>.json`), so
    depth 1 costs about 5–20 KB instead of a whole book (Romans target adjacency is about 90 KB br).
- `chapters.json` (124 KB br) is still needed just to fill the selects.
  - Better: a small `books.json` with verse counts per chapter for the selects, plus lazy per-book
    chapter files.
  - Verse labels can be derived from the book name, which cuts the file by about 40%.
- `VerseGraph` re-renders the whole SVG on every d3-force tick (code-review item).
  - Run the simulation to a fixed number of ticks off-screen (`simulation.tick(n)`), or update node
    positions through refs or `requestAnimationFrame`, not React state on every tick.
  - Memoise the link and node elements.
- Verse text is loaded per book (Psalms is 326 KB raw). Per-chapter text files would cut
  "change verse" to a few KB.

### Chord

- Mobile TBT is about 800 ms, with one long task of about 340 ms, from the d3 chord layout plus SVG
  label layout on first render.
  - Memoise the layout per (matrix, filter) and skip label collision work while the panel is
    collapsed.
  - Consider rendering the ribbons to `<canvas>` on mobile.

### Blocks

- Blocks downloads all edges (238 KB br) and runs union-find on every visit.
  - This is a static result per dataset: emit `stats.components.json` from the extractor (a few KB).
  - Or at least memoise per dataset and run it in a Web Worker.

### Shell / design

- Fonts are the largest new cost: about 100 KB on first view, 4 families including Literata
  italic.
  - Preload the two latin woff2 files used above the fold. This needs a small Vite plugin or a
    `?url` import, because the filenames are hashed.
  - Consider dropping JetBrains Mono, or loading italic only on pages that use it.
- The mobile footer (`.mobile-credit`) still shifts slightly (CLS about 0.02) while pages load.
  Reserve `min-height: 100svh` on `.main-surface` at mobile widths.

### Data / deploy

- Version the data directory, for example `/generated/<generatedAt-hash>/` referenced from
  `datasets.json`. Then JSON can be `immutable` for a year, and only `datasets.json` needs
  revalidation.
- Consider `nginx-unprivileged:alpine-slim`, which runs as non-root on port 8080, together with a
  compose and Traefik port change.
- Traefik passes the upstream `Content-Encoding` through unchanged. Do not enable its `compress`
  middleware, which would recompress at a worse level.
