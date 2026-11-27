# BibliaMap code review (sprint 1)

Date: 2026-11-27. Branch: `sprint1/code-review`.

Scope: all of `frontend/src`, `frontend/nginx.conf`, `crates/*/src`. I also ran the app in Playwright (Chromium, desktop 1440x900 and mobile 390x844) against the local dev server (all four datasets: `nwt`, `nwtsty`, `nwtsty-i`, `rbi8`) and against the live site (https://bibliamap.gabudev.cloud, `nwtsty`). I visited every route, a `/verse?...` deep link and an unknown path, and ran interaction probes: the Overview "View all" modal, wheel zoom on the verse graph, 3-layer neighborhoods, 1 John, switching datasets on the verse page, back/forward, blocked `localStorage`, reloading the chord view, and response headers.

Plain route loads showed no console errors and no failed requests (apart from Vite dependency re-optimization on a cold dev start), and no page scrolled horizontally at either viewport. Every bug below was reproduced, unless it is marked as found by code reading.

Severity levels: **P1** means broken for users or data is wrong. **P2** means a visible defect or a large performance cost. **P3** is minor, a robustness gap or polish.

## Prioritized findings

| # | Sev | Location | Problem | Suggested fix | Status |
|---|-----|----------|---------|---------------|--------|
| 1 | P1 | `pages/OverviewPage.tsx:71-100` | Every "View all" modal spins forever (reproduced locally and live: shimmer still shown after 8 s, 0 rows). The effect lists `detailsLoading` as a dependency. `setDetailsLoading(true)` re-runs the effect, the cleanup sets `cancelled = true` on the in-flight request, and the re-run returns early because `detailsLoading` is now true. So `details` is never set and `detailsLoading` never clears. | Use `useAsyncData(() => activeDetail ? loadOverviewDetails(datasetId) : Promise.resolve(null), [datasetId, activeDetail !== null])`, or remove `detailsLoading`/`details` from the effect dependencies and keep the guard in a ref. | open (page) |
| 2 | P1 | `App.tsx:37-39, 63` | With `localStorage` blocked (Safari private mode, cookies blocked, sandboxed iframe), `window.localStorage.getItem` throws during the first render and the whole app is blank (reproduced: `#root` has 0 children, 2 uncaught `SecurityError`s). | Use the new `readStoredValue`/`writeStoredValue` from `src/utils/storage.ts` (with `datasetStorageKey`). | helper **fixed**, wiring open (App.tsx) |
| 3 | P1 | `crates/bibliamap-extractor/src/main.rs` `write_adjacency_files` | Target adjacency indexed an edge only under `target_start_verse_id`. A verse that is cited only inside a range (e.g. "Ps. 104:1-35") listed **zero** incoming references in the Verse Explorer. That is about 4,100 verses in nwtsty and about 3,500 in nwt (29k missing incoming entries in nwtsty). | New `build_adjacency` indexes every mapped verse in `start..=end` under that verse's own book (correct for ranges that cross books) and treats reversed ranges as a single verse. **The data must be regenerated** (`scripts/generate_all_datasets.sh`) before the fix shows on the site. Target adjacency grows by about 25% (nwtsty 12 MB to about 15 MB raw). | **fixed** (data not regenerated: no `.jwpub` assets in the worktree) |
| 4 | P1 | `pages/VersePage.tsx:742-759` | `onWheel` calls `preventDefault()`, but React registers wheel listeners as passive. Zooming the graph also scrolls the page (249 px per wheel step) and logs "Unable to preventDefault inside passive event listener" (reproduced locally and live). | Attach the listener natively with `svg.addEventListener('wheel', handler, { passive: false })` in a `useEffect` (with cleanup), and add `touch-action: none` on the SVG for pinch. | open (page) |
| 5 | P2 | `pages/VersePage.tsx:136-142`, `App.tsx:54-59` | Verse selection is not stored in the URL. `/verse?book=1&chapter=1&verse=1` is ignored, a refresh or back/forward resets to Romans 12:12 (reproduced: after Back the book is 45 again), and a view cannot be shared. | Keep `book`, `chapter`, `verse`, `dir`, `kind` and `layers` in `URLSearchParams` (`history.replaceState` on change; read them on mount and on `popstate`). App routing must keep `location.search` when it parses the path. | open (page/App) |
| 6 | P2 | `pages/VersePage.tsx:387-433` | `maxNodes = 140` only limits the frontier, but `upsertNode` keeps adding nodes. With 3 layers the toolbar says "1,596 links across 971 verses" while only 139 nodes and 280 links are drawn (`buildForceGraph` `slice(0,139)`/`slice(0,280)`). The counts and the side panel describe a graph the user cannot see, and the BFS fetches dozens of per-book adjacency and verse-text files (about 75 MB uncompressed in the dev probe). | Stop `collectLinks` once `nodes.size >= maxNodes` (still record links between nodes already kept). Show "showing N of M". Load verse text only for rendered nodes. | open (page) |
| 7 | P2 | `pages/ChordPage.tsx:49-56, 84` | Changing the reference type replaces the whole page, filter panel included, with a shimmer (reproduced) because `useAsyncData` reset `data` to `null`. | Pass `{ keepPreviousData: true }` (new hook option, now available) and dim the graph while `isStale`. Load `books` separately so it is not refetched. | hook **fixed**, adoption open (page) |
| 8 | P2 | `hooks/useAsyncData.ts` | The reset to `null` ran inside the effect, so consumers rendered once with the *previous* dependencies' data and the new dependencies together. On a dataset switch, VersePage's neighborhood effect started loading the new dataset's adjacency with the old dataset's verse index and books. A loader that threw synchronously escaped the error path. | The reset now happens during render (React's "adjust state on prop change" pattern), loaders go through `Promise.resolve().then(loader)`, and there are new `keepPreviousData`/`isStale`/`loadingDelayMs` options. Tests in `useAsyncData.test.ts`. | **fixed** |
| 9 | P2 | `data/generated.ts` | There was no client cache: every page mount re-downloaded and re-parsed `verse-index.json` (4 MB) and `chapters.json` (3 MB) and the compact edges (3 MB). Concurrent requests for the same file were not shared. Errors had no HTTP status, and a missing file behind an SPA fallback surfaced as "Unexpected token <". | Shared-promise LRU cache (64 files, failed loads are evicted), dataset-id validation, `HTTP <status>` in errors, and an explicit "not valid JSON (text/html)" error. Tests in `generated.test.ts`. **Callers must treat loaded objects as immutable** (all current callers do). | **fixed** |
| 10 | P2 | `frontend/nginx.conf` | Live: `index.html` was served with no `Cache-Control`, so browsers cached it heuristically from `Last-Modified` and could keep a shell whose hashed `/assets/*` 404 after a deploy. `/generated/` sent `Cache-Control: max-age=3600, public, max-age=3600` because `expires` and `add_header` both emit it. There was no `nosniff`. | `location = /index.html` with `no-cache`, one Cache-Control per location (not `always`, so 404s are not cached for a year), `nosniff` + `Referrer-Policy`, gzip for `text/javascript` and `application/manifest+json`. Checked with `nginx -t` and curl against `nginx:1.27-alpine` serving `dist/`. | **fixed** |
| 11 | P2 | `pages/OverviewPage.tsx:342-382` | Detail modal: Escape does not close it (reproduced), focus is not moved into it or trapped, focus is not restored on close, and the body still scrolls. "Source verses" renders about 25k `<li>` rows with a `<meter>` each. | Use `<dialog>` with `showModal()` (gives Escape and focus handling) or add handlers. Virtualize or paginate the rows (for example the first 200 plus "show more"). | open (page) |
| 12 | P2 | `pages/VersePage.tsx:842-845` | The center label uses `label.split(' ')[0]` as the book name. For 1 John, 2 Kings and so on it shows "1" above "John 1:1" (reproduced). | Use `books[bookNumber-1].name` as the line-1 text and `${chapter}:${verse}` as line 2. | open (page) |
| 13 | P2 | `pages/VersePage.tsx:416`, `buildRelatedNodes:1200` | Outgoing range edges link only to `targetStart`. Ranges are common (13.7k of 80k nwtsty edges), so "Gen 1:1 → Ps 104:1-35" shows as Ps 104:1 only, and the detail panel never shows the range. | Label outgoing nodes with the range (`label(start)–verse(end)`), or add the end verse to the tooltip and detail panel. | open (page) |
| 14 | P2 | `crates/bibliamap-extractor/src/main.rs` `update_dataset_registry` | An unparsable `datasets.json` was silently replaced by `unwrap_or_default()`, which dropped every other dataset from the registry. | New `read_dataset_registry` returns an error with context. Tests. | **fixed** |
| 15 | P2 | `App.tsx:54-59` | `navigate()` always calls `preventDefault`, so Ctrl/Cmd/Shift-click and middle-click on nav links cannot open a new tab. | Return early when `event.button !== 0 \|\| event.metaKey \|\| event.ctrlKey \|\| event.shiftKey \|\| event.altKey`. | open (App) |
| 16 | P3 | `crates/jwpub-reader/src/lib.rs` `open_jwpub` | `temp_dir.join(manifest.publication.file_name)` with an untrusted archive: an absolute path or `../` would write outside the temp directory. | `validate_database_name` accepts exactly one normal path component. Tests. | **fixed** |
| 17 | P3 | `crates/bibliamap-extractor/src/main.rs` `write_json` | `serde_json::to_writer(File)` without buffering (one syscall per token, slow for multi-MB files), and errors on drop were lost. | `BufWriter` plus an explicit `flush()` with context. Test. | **fixed** |
| 18 | P3 | `utils/format.ts` | `formatPercent` rounded 3/31,078 to "0%" and 31,070/31,078 to "100%". The Blocks page said "100% in largest block" next to "N separate blocks". `formatNumber` built a new `Intl.NumberFormat` on every call. | "<1%"/">99%" at the extremes, and one shared formatter. Tests. | **fixed** |
| 19 | P3 | `hooks/useCountUp.ts` | The stat count-up ignored `prefers-reduced-motion`. | Show the final value immediately when reduced motion is set. Tests. | **fixed** |
| 20 | P3 | extractor `build_summary`/`count_verse_and_chapter_stats` | `distinct_target_verses`, `topReferencedVerses` and chapter counts use only the range start, but the Overview "Referenced verses" modal (`countVerseConnections`) and the Blocks page expand ranges. So the same label shows different numbers on the same page. | Choose one meaning: preferably expand ranges in the extractor stats too, for consistency with fix #3. | open (extractor) |
| 21 | P3 | extractor `fetch_verse_text` | One transient HTTP failure among about 1,189 chapter fetches aborts the whole generation. There is no retry or backoff and no per-request timeout setting. | Retry 3 times with backoff, set `Client::builder().timeout(..)`, and log skipped chapters instead of failing. | open (extractor) |
| 22 | P3 | `pages/VersePage.tsx:458, 520, 1129`; `ChordPage.tsx:73, 89, 188` | `books[bookNumber - 1]` assumes `books.json` is complete and ordered. It is today (always 66 books), but this breaks silently for a partial dataset. `bookNumberForVerse` falls back to Genesis (`?? 1`) for unknown ids, which loads the wrong adjacency file. | Build a `Map<bookNumber, Book>` once. Return `null` for unknown verses and skip them. | open (page) |
| 23 | P3 | `pages/VersePage.tsx` base load | The verse page downloads `chapters.json` (2.9 MB) plus `verse-index.json` (4.1 MB) before it can render anything. `chapters.json` repeats every verse already in the verse index. | Extractor: emit a slim `chapters.json` (`[book, chapter, firstVerseId, verseCount]`) and derive verses from the index, or split the verse index per book. | open (extractor/page) |

## Open UI/page bugs for implementation streams

### App.tsx
- Use the safe storage helpers: `import { readStoredValue, writeStoredValue, datasetStorageKey } from './utils/storage'` (lines 37-39, 63). **P1, blank app.**
- `navigate` should let modifier and middle clicks through (line 54).
- `routeFromPath` uses `startsWith`, so `/chordxyz` renders Chord and an unknown path silently renders Overview. Match exact segments and render a small "not found" view. The SPA fallback returns 200 for every path.
- Keep `location.search` across navigation so `/verse?...` deep links work (needed for VersePage URL state). `navigate()` drops the query string today.
- Set `document.title` per route ("Verse Explorer · BibliaMap") and move focus to the page `<h1>` after client-side navigation (screen readers do not hear route changes).
- `window.scrollTo({ behavior: 'smooth' })` should respect `prefers-reduced-motion`.
- The dataset `<select>` has no visible label association beyond the wrapping `<label>` (fine), but the credit link text "GitHub GitHub.com/gabref/biblia-map" repeats itself.

### VersePage.tsx
- Fix the passive wheel listener (finding #4).
- Store the selection in the URL (finding #5).
- Respect the node cap and make the counts match what is drawn (finding #6).
- Fix the center label for numbered books (finding #12).
- Show range targets (finding #13).
- Replace `books[n-1]` and the `?? 1` fallbacks (finding #22).
- Nodes are not reachable by keyboard: `<g>`/`<circle>` have no `tabIndex`, `role="button"`, `aria-label` or key handler. Add those, or mirror the related verses in a focusable list in the side panel. The SVG has `role="img"`, which hides its interactive children from assistive tech.
- `ConnectionDetail` (around line 1084) describes a related node only by `edges[0]`. When a node has several edges or both directions, the header shows one arbitrary source→target. List all edges.
- `ConnectionDetail` uses `link.edge.commentaryId` as a truthy check (line 1117). Use `!= null` (ids can be 0; jwpub verse id 0 is Genesis 1:1, so the same pattern elsewhere would be a bug).
- The d3 simulation calls `setRenderNodes`/`setRenderLinks` with fresh arrays on every tick (about 300 React renders of up to 420 SVG elements per layout). Render through refs or `requestAnimationFrame`-throttled state, or render once the simulation settles.
- The simulation effect depends on `[graphData, layers]`, and `graphData` already changes with layers, so a layers change can build the simulation twice.
- `handlePointerMove` copies the stale `renderLinks` from the closure; use the simulation's links.

### OverviewPage.tsx
- The detail modal never loads (finding #1). **P1.**
- Modal accessibility and the 25k-row list (finding #11).
- Every `RankList` row is a button that opens the same modal regardless of which row was clicked. Either make rows navigate to that verse or book (for example `/verse?...`) or render them as plain list items. Today they are misleading affordances.
- `<meter>` elements have no accessible name. Add `aria-label` or `aria-hidden`, since the number is already shown.

### ChordPage.tsx
- Keep the filters mounted while reloading: `useAsyncData(..., [datasetId, edgeKind], { keepPreviousData: true })` (finding #7).
- The tooltip label `"${source} to ${target}: max(source.value, target.value)"` is wrong for a d3 chord: a chord merges i→j and j→i. Show both directions (`A→B: x · B→A: y`).
- The tooltip uses mouse events only (nothing on touch or keyboard). It has `position: fixed` with no clamping, so it overflows the right edge near the viewport border.
- Arcs are clickable `<path>`s with no keyboard access or label. The book list duplicates the arcs, so mark arcs `aria-hidden`, or give them `role="button"`, `tabIndex` and a label.
- There is no way to clear the selected book except "Reset filters", which also resets every other filter. Clicking the active book should toggle it off.
- `bookWeightTotals` counts self-links twice (outgoing plus incoming of the diagonal).
- The minimum-weight slider maximum of 250 is fixed. For `study-notes` most links are below 25, so the default hides nearly everything. Derive the default and maximum from the matrix.

### RelationshipBlocksPage.tsx
- `buildRelationshipComponents` runs over about 80-125k edges inside the loader on the main thread on every visit. The result is now cached at the file level, but the union-find still reruns each time. Memoize the summary per dataset (module-level `Map`) or move it to a worker.
- `formatPercent` now shows "<1%"/">99%" (fixed in utils), so check that labels such as ">99% in largest block" read well in the redesign.
- `<meter>` per block has no accessible name.

### components/
- `SegmentedControl.tsx`: active state is shown only by a CSS class. Add `aria-pressed={option.value === value}` and wrap in `role="group"` with `aria-label={label}`.
- `LoadingShimmer.tsx`: `aria-label` on a plain `div` is ignored. Use `role="status"` with visually hidden text "Loading…" (and `aria-busy` on the region).
- `DatasetBadge.tsx`: the option text has a trailing space when there is no year (`{year ?? ''}`), and both nwtsty datasets read "nwtsty 2025"/"nwtsty 2024 (Italian)". Consider showing the title.
- `ErrorState.tsx`: no retry action. With the new cache, a retry just calls the loader again, so a "Try again" button is cheap.
- `StatCard.tsx`: fine. The count-up now respects reduced motion.

## Fixed in this branch (non-UI)

| Area | Files | Tests |
|------|-------|-------|
| Safe localStorage helpers | `src/utils/storage.ts` | `storage.test.ts` |
| Generated-data cache, errors, dataset id validation | `src/data/generated.ts` | `generated.test.ts` |
| Async hook: no stale-dependency render, sync throws, keepPreviousData | `src/hooks/useAsyncData.ts` | `useAsyncData.test.ts` |
| Reduced-motion count-up | `src/hooks/useCountUp.ts` | `useCountUp.test.ts` |
| Percent extremes, shared number formatter | `src/utils/format.ts` | `format.test.ts` |
| nginx caching and security headers | `frontend/nginx.conf` | `nginx -t` and curl against `nginx:1.27-alpine` |
| Range-aware target adjacency | `crates/bibliamap-extractor/src/main.rs` | 3 new cargo tests |
| Registry corruption guard, buffered JSON writes | same | 3 new cargo tests |
| JWPub database-name path traversal | `crates/jwpub-reader/src/lib.rs` | 2 new cargo tests |

Follow-up needed: regenerate all four datasets so the range-aware target adjacency (#3) reaches the site.
