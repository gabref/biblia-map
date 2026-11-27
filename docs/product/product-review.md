# BibliaMap — Product & UX Review (Sprint 1)

_Date: 2026-11-27 · Author: Product (PM + UX research) · Build reviewed: `main` @ 3793ab1 (local dev, port 5174) and live <https://bibliamap.gabudev.cloud>_

Method: three personas walked through every page on desktop (1440×900) and mobile (iPhone 13, 390×844), driven by Playwright scripts with timing and network capture, plus a read of the source (`frontend/src`) and generated data (`frontend/public/generated/*`). Screenshots are in [`screenshots/`](./screenshots).

---

## 1. Executive summary

BibliaMap has a strong data foundation: four editions (nwt 2013, nwtsty EN 2026, nwtsty IT 2024, Rbi8 1984), about 63k–125k references per edition, verse text for every edition, per-book adjacency files, and precomputed stats. The visual design is polished. **As a study tool it is not usable yet.** The core loop a Bible student needs is *find a verse → read its connections → follow one → come back → save what I found*, and today every step of that loop is weak or missing:

1. **Finding a verse** takes three `<select>` dropdowns (66 books, then chapter, then verse). There is no search box, no "John 3:16" or "Gv 3:16" parsing, and no deep link. The URL is always `/verse`, so a verse cannot be bookmarked, shared or restored after a reload. A reload resets to Romans 1:12.
2. **Reading connections** only works through a force graph. There is **no list view**, so you cannot read 72 connected verses as text. You have to click small circles one by one. Labels render at 11.5px in the SVG, which is unreadable on a phone ([13](./screenshots/13-mobile-verse-graph.png)).
3. **Following a connection** is not possible: clicking a node shows its text but cannot make that node the new center. Students cannot "chain" references (the most natural study behaviour) and there is no back trail.
4. **Saving work**: no bookmarks, notes, history or export.
5. **Depth 2/3 is broken in practice.** John 3:16 at 2 layers loads **91 files / 17 MB decoded** and draws **801 nodes / 1,405 links**, an unreadable hairball ([07](./screenshots/07-desktop-verse-2-layers-hairball.png)). "3 layers" returns exactly the same result because of the 140-node frontier cap, so the option is a no-op.
6. **The Overview's "View all" modal never finishes loading.** This is a confirmed bug: an effect-dependency loop cancels its own request ([02](./screenshots/02-desktop-overview-viewall-stuck.png)). Esc does not close it.
7. The analytics (Overview, Chord, Blocks) are **pretty but dead ends**. No row, chord or block links to a verse or to the explorer. Blocks reports that "88% of verses are in one block", which is a fact about the graph, not an insight for a student.
8. Copy is written for developers ("load only the adjacency files needed", "reads only 66 by 66 precomputed matrices"). The About page says verse text is *not* published, but it is.

**Recommendation for Sprint 2:** make the **Verse Study loop** excellent before adding more analytics. Ship (a) global search with EN/IT book-name parsing plus deep links, (b) a Verse Study page that shows a readable, grouped **list** of connections with verse text next to the graph, with click-to-recenter and a study trail, (c) local-first bookmarks, notes and history with Markdown/JSON export, (d) a mobile-first layout, and (e) fixes for the P0 bugs. After that, rework the analytics into **Insights** that open verses: hub verses, OT→NT quotation flows, per-book profiles, chapter heatmaps. Everything here works as a static site with today's data. A few items get much better with small extractor additions (§7).

The backlog in §6 is split into **7 epics with disjoint file ownership**, so 5–7 engineers can work in parallel once the day-1 contracts in §6.1 are merged.

---

## 2. Personas & journeys

### Persona A — "Marta", personal Bible student preparing a talk on God's love (desktop, 45 min)

| Step | What she does | What happens | Pain |
|---|---|---|---|
| 1 | Opens site | Lands on Overview: four big numbers and book rankings ([01](./screenshots/01-desktop-overview.png)) | No obvious "start here". The numbers don't help her task. |
| 2 | Wants John 3:16 | Clicks Verse Explorer, which shows Romans 1:12 by default ([05](./screenshots/05-desktop-verse-default.png)) | Has to scroll a 66-item Book dropdown, then Chapter, then Verse. No typing. ~3 interactions, ~10 s. |
| 3 | Sees graph | "88 links across 72 verses", radial graph ([06](./screenshots/06-desktop-verse-john316.png)) | Cannot read the 72 verses as a list. Colors (gold/blue/teal) are only half explained: teal = "both directions" is not in the legend. |
| 4 | Clicks "1 John 4:9" | Side panel shows the text and the metadata "Direction: incoming, Study note: Includes…" ([08](./screenshots/08-desktop-verse-node-detail.png)) | Good text, but she cannot jump to 1 John 4:9 to see *its* connections. Double-click does nothing. |
| 5 | Tries "2 layers" | ~2.4 s, 801 nodes, hairball ([07](./screenshots/07-desktop-verse-2-layers-hairball.png)) | Unusable. Switches back. |
| 6 | Wants to note 5 verses for the talk | Nothing to save, copy or export | Copies references by hand into another app. |
| 7 | Reloads the next day | Romans 1:12 again | Has to redo everything. |

**Verdict:** the tool shows *that* connections exist but does not support *studying* them.

### Persona B — "Luca", curious newcomer (desktop then phone, 5 min)

- Lands on "NWTSTY DATASET · Bible reference overview". "nwtsty", "Rbi8 1984" and "Combined references" mean nothing to him. The dataset switcher labels are publication symbols ("nwtsty 2026", "Rbi8 1984").
- Clicks "Psalms 5,673", which opens a modal that stays on "Loading complete list." for more than 60 s ([02](./screenshots/02-desktop-overview-viewall-stuck.png)). Esc does not close it.
- Visits Book Graph: the chord diagram is attractive, but the diagram starts below the fold, the labels are tiny, there are two "Reset" buttons, and clicking Isaiah isolates it but offers nothing further ([03](./screenshots/03-desktop-chord.png), [04](./screenshots/04-desktop-chord-isaiah.png)).
- Visits Blocks: "Block 2: 10 verses, 0%…" ([10](./screenshots/10-desktop-blocks.png)). He doesn't understand why this matters.
- Leaves after about 3 minutes. He never reached a verse.

**Verdict:** no onboarding, jargon, and analytics with no path to content.

### Persona C — "Sara", mobile user on a phone at a meeting (iPhone, 2 min)

- The header plus a 5-tab nav takes **~240 of 844 px** and stays sticky. The page title and dev copy push the controls down ([12](./screenshots/12-mobile-verse-first-screen.png)).
- The Verse Explorer form is about 2 screens tall (Book, Chapter, Verse, Direction, Type, Layers stacked) before any graph appears.
- In the graph, nodes are ~20px circles with ~6px effective labels at phone scale ([13](./screenshots/13-mobile-verse-graph.png)). Tapping the right node is hard. The detail panel sits below the graph, so she must scroll down after each tap and back up again.
- The Chord diagram renders at about half the screen width with unreadable labels, followed by a 66-row book list ([14](./screenshots/14-mobile-chord-full.png)).
- No pinch-zoom on the graph (`touch-action: none` with custom pan only, plus zoom buttons).

**Verdict:** technically responsive (no horizontal overflow at 390px) but not usable for real lookup on a phone.

---

## 3. UX issues list

Severity: **P0** = broken or blocks the core task · **P1** = major friction · **P2** = polish.

| # | Sev | Page | Issue | Evidence | Fix |
|---|---|---|---|---|---|
| U1 | P0 | Overview | "View all" modal stuck on "Loading complete list." forever. `useEffect` depends on `detailsLoading`; setting it to `true` re-runs the effect, whose cleanup sets `cancelled = true`, so the result is discarded and the new run returns early. | [02](./screenshots/02-desktop-overview-viewall-stuck.png); 60 s timeout on local and live | Remove `detailsLoading` from deps (or use `useAsyncData` keyed on `activeDetail`). Book lists should read `stats.books.json` (20 KB), not `edges/combined.compact.json` (6 MB). |
| U2 | P0 | Verse | No URL state: verse, dataset and filters are lost on reload, back/forward and sharing. Dataset lives only in localStorage. | reload → Romans 1:12 | Routes `/verse/:book/:chapter/:verse?ds=&kind=&dir=&depth=` (see §6.1). |
| U3 | P0 | Verse | No text search for a verse; lookup needs 3 dropdowns (66 books). | [05](./screenshots/05-desktop-verse-default.png) | Global search with reference parser (F1). |
| U4 | P0 | Verse | Cannot recenter on a connected verse; no trail or back. | node click → detail only | "Study this verse" action, plus double-click/tap-and-hold on a node; breadcrumb trail (F4). |
| U5 | P0 | Verse | Depth 2/3 explodes (801 nodes, 17 MB, 91 requests) and depth 3 equals depth 2, because the `maxNodes=140` check only limits the frontier while `upsertNode` keeps adding. | [07](./screenshots/07-desktop-verse-2-layers-hairball.png) | Rank 2nd-hop nodes (shared-neighbour count, type), cap visible nodes at ~40, add "show more"; remove or relabel depth 3 (F5). |
| U6 | P1 | Verse | No list view of connections; reading 50+ verses through hover/click is impractical and inaccessible. | [06](./screenshots/06-desktop-verse-john316.png) | Grouped list (Outgoing / Incoming, by book, by type) with verse text and an inline "expand" (F3). |
| U7 | P1 | Verse | Reference ranges are collapsed: ~17% of edges (13,983 / 81,711 in nwtsty) have `targetEnd ≠ targetStart`, but the UI shows only the first verse (e.g. "John 1:1" instead of "John 1:1-3"). | data inspection | Render the range label and the full range text in the list. |
| U8 | P1 | Verse | Choosing "Study notes" on datasets without notes (nwt, rbi8) silently shows "0 links across 0 verses", with the center node floating at the bottom of an empty canvas. | [09](./screenshots/09-desktop-nwt-studynotes-empty.png) | Disable the option using `stats.summary.totalStudyNoteReferences === 0`, with a tooltip. Add a real empty state ("This verse has no references of this type in nwt 2013. Try Combined or nwtsty."). |
| U9 | P1 | All | Developer-facing copy ("load only the adjacency files", "66 by 66 precomputed matrices", "Local graph"); About says verse text is not published, but it is. | [05](./screenshots/05-desktop-verse-default.png), [11](./screenshots/11-desktop-about.png) | Rewrite copy for students; move build details to a collapsed "Technical" section on About. |
| U10 | P1 | Mobile | Sticky header and nav use ~28% of the viewport; the controls stack takes ~2 screens before the graph; the detail panel sits below the graph. | [12](./screenshots/12-mobile-verse-first-screen.png), [13](./screenshots/13-mobile-verse-graph.png) | Bottom tab bar (icons + short labels), collapsible filter sheet, connection detail as a bottom sheet, list view first on mobile. |
| U11 | P1 | Overview / Chord / Blocks | Analytics are dead ends: rows, chords and blocks never open a verse, chapter or book profile. | [01](./screenshots/01-desktop-overview.png), [04](./screenshots/04-desktop-chord-isaiah.png) | Every verse label links to `/verse/...`; chords link to a book-pair drill-down (§5). |
| U12 | P1 | Onboarding | Home is a stats dashboard; there is no "what is this / how do I start"; dataset names are symbols. | [01](./screenshots/01-desktop-overview.png) | New Home with search, 3–4 example studies and plain dataset names ("Study Bible (English, 2026)") (F19). |
| U13 | P1 | Overview | Modal has no Esc close and no focus trap. | script: dialog still present after Esc | Use `<dialog>` or a focus trap, and close on Esc and backdrop click. |
| U14 | P2 | Routing | Unknown routes silently render Overview (no 404). | `/does-not-exist` → Overview | Not-found state with search. |
| U15 | P2 | Chord | Diagram is below the fold at 1440×900; there are two Reset buttons (header and toolbar); labels are ~8px; the "Minimum weight 25" slider is unexplained. | [03](./screenshots/03-desktop-chord.png) | Compact filter row, one reset, larger labels on hover/focus, plain-language slider ("Hide links weaker than 25 references"). |
| U16 | P2 | Verse | The legend omits teal ("both directions"); the "Outgoing/Incoming" vocabulary is abstract. | [06](./screenshots/06-desktop-verse-john316.png) | Legend: "This verse points to" / "Points to this verse" / "Both". |
| U17 | P2 | Perf | The Verse page loads `verse-index.json` (4.1 MB, 530 KB gz) and `chapters.json` (2.9 MB, 390 KB gz) up front; `Cache-Control: max-age=3600` only; first verse view takes 2.5–4.4 s on live. | flow logs | Smaller search index plus lazy per-book chapters (§7); long cache plus hashed data dir. |
| U18 | P2 | Blocks | Recomputes connected components in the browser over 81k edges (6 MB) to tell users "88% are in one block". | [10](./screenshots/10-desktop-blocks.png) | Demote; replace with "Isolated verses" and "Small clusters" insights in Insights (§5). |
| U19 | P2 | Global | UI is English-only even for the Italian dataset (book names Italian, chrome English). | [15](./screenshots/15-desktop-verse-italian.png) | i18n EN/IT (F12). |
| U20 | P2 | Global | Dark-only theme; the cream panels against dark backgrounds are high-contrast but tiring for long reading. | all | Light/dark/system toggle (F17). |
| U21 | P2 | Footer | Credit text renders as "GitHub GitHub.com/gabref/biblia-map" (duplicated word). | sidebar | Fix the label. |

---

## 4. What works (keep)

- Fast, static, cache-friendly architecture; per-book adjacency splits are a good basis for lazy loading.
- Verse text is shown next to the selected verse, with good typography in the detail panel.
- The cross-ref vs study-note split is valuable and unique to the nwtsty data. Keep it prominent.
- The chord diagram is a good "wow" visual for the landing page and social sharing.
- Loading shimmer avoids layout jumps; there is no horizontal overflow at 390px.

---

## 5. Analytics critique and redesign proposals

| Current | Useful to a student? | Why | Redesign |
|---|---|---|---|
| 4 KPI cards (81,711 combined…) | Low | Big numbers with no action | Keep one compact strip on About/Insights; remove from Home. |
| Most outgoing / referenced books | Medium | Interesting, but book-level is too coarse; rows do nothing | **Book profile page** `/book/:slug`: top referenced verses *in* the book, the books it quotes and is quoted by, chapter heatmap, OT↔NT share. |
| Strongest book links | Medium | "Psalms to Psalms" self-links dominate | Exclude self-links by default; each row opens the **book-pair drill-down** (list of verse pairs Isaiah → Matthew with text). |
| Testament flow (4 numbers) | Low–Medium | OT→NT 4,313 vs NT→OT 7,537 is interesting but not explorable | **Quotation flows**: a Sankey or ranked list of OT book → NT book, filterable by study notes, each pair opening verse pairs. This is the classic "how the Greek Scriptures use the Hebrew Scriptures" question students ask. |
| Top source / referenced verses (6 rows) | **High potential** | These are the "hub verses" (Deut 32:4, Ps 110:1, Gen 15:18), but they aren't clickable | **Hub verses** list: top 100 by in-degree / out-degree / betweenness-lite, filter by book and type, each opens Verse Study. |
| Dense chapters | High potential | Same: not clickable | **Chapter heatmap**: a 66-row × N-chapter grid colored by density, so "where is Scripture most interconnected?" Click → Read mode. |
| Chord diagram | Medium (orientation) | Beautiful, hard to read; no drill-down | Keep as the Insights hero. Click a chord → book-pair drill-down. Hover highlights. A "Top 10 pairs" sidebar replaces the 66-book list on mobile. |
| Reference blocks | Low | Graph-theory artifact; 88% in one block | Replace with **"Verses with no references"** (3,438 isolated verses, a real study curiosity) and **"Small clusters"** (self-contained themes such as Matt 9:16-17 / Luke 5). |
| — (missing) | High | | **Edition comparison**: for a verse or book, references in nwt 2013 vs nwtsty vs Rbi8 1984 (Rbi8 has ~2× the cross refs: 125k vs 66k), showing added and removed references. Great for researchers. |
| — (missing) | High | | **Study-note references view**: what the nwtsty study notes on a NT verse cite (16,045 references), which are distinct from marginal refs. |

All of the above can be computed client-side from existing files (`stats.*`, `matrices/*`, `adjacency/*`, `edges/*.compact.json`). Hub/degree lists for *all* verses and per-chapter matrices are cheaper if the extractor precomputes them (§7).

Proposed IA after Sprint 2:

```
Home (search + start examples + recent + saved)
Study   /verse/:book/:ch/:v      ← the core: verse text, connection list + graph, trail
Read    /read/:book/:ch          ← chapter text with per-verse reference heatmap
Insights /insights               ← hubs, quotation flows, chord, heatmap, book profiles, editions
My study /study                  ← bookmarks, collections, notes, history, export
About
```

---

## 6. Prioritized feature backlog (Sprint 2-ready)

### Scoring

RICE: **Reach** (1–10, share of sessions affected) × **Impact** (0.25 / 0.5 / 1 / 2 / 3) × **Confidence** (0–1) ÷ **Effort** (person-weeks). Effort tier: S ≤ 0.5 w, M ≈ 1 w, L ≥ 1.5 w.

| ID | Feature | R | I | C | E (w) | RICE | Size | Epic |
|---|---|---|---|---|---|---|---|---|
| B1 | P0 bug fixes (U1, U5 cap, U8, U13, U14, U21) | 10 | 2 | 1.0 | 0.5 | **40** | S | E-D / E-B |
| F2 | Deep links + URL state + back/forward | 10 | 2 | 1.0 | 0.5 | **40** | S | E-A |
| F4 | Recenter on node + study trail (breadcrumbs) | 9 | 2 | 0.9 | 0.5 | **32** | S | E-B |
| F19 | New Home: search-first onboarding + examples | 10 | 2 | 0.8 | 0.5 | **32** | S | E-A |
| F1 | Global verse search w/ autocomplete (EN+IT names & abbreviations) | 10 | 3 | 0.9 | 1 | **27** | M | E-A |
| F8 | Study history (recent verses) | 7 | 1 | 0.9 | 0.25 | **25** | S | E-C |
| F3 | Connection list view (grouped, ranges, text) | 9 | 3 | 0.9 | 1 | **24** | M | E-B |
| F11 | Mobile-first shell & Study layout (bottom nav, sheets) | 6 | 2 | 0.9 | 1 | **11** | M | E-F |
| F16 | Keyboard shortcuts (`/` search, `[`/`]` prev/next verse, `b` bookmark, `Esc`) | 3 | 1 | 0.9 | 0.25 | **11** | S | E-A |
| F10 | Study sheet: print / export Markdown | 5 | 2 | 0.8 | 0.75 | **11** | M | E-C |
| F9 | Read mode: chapter text + reference heatmap + "connections of this chapter" | 7 | 3 | 0.7 | 1.5 | **9.8** | L | E-E |
| F6 | Bookmarks & collections (localStorage) | 6 | 2 | 0.8 | 1 | **9.6** | M | E-C |
| F5 | Usable depth-2 ego graph (ranked, capped, "show more") | 6 | 2 | 0.7 | 1 | **8.4** | M | E-B |
| F7 | Personal notes per verse + JSON import/export | 5 | 2 | 0.8 | 1 | **8** | M | E-C |
| F12 | UI i18n EN/IT (auto from dataset/browser) | 4 | 2 | 0.9 | 1 | **7.2** | M | E-F |
| F17 | Light/dark/system theme | 4 | 1 | 0.9 | 0.5 | **7.2** | S | E-F |
| F21 | Hub verses + clickable rankings | 5 | 2 | 0.8 | 0.75 | **10.7** | M | E-D |
| F15 | Quotation flows OT→NT + book-pair drill-down | 5 | 2 | 0.7 | 1.5 | **4.7** | L | E-D |
| F22 | Book profile page | 4 | 2 | 0.7 | 1 | **5.6** | M | E-D |
| F13 | Edition comparison for a verse (nwt / nwtsty / rbi8) | 4 | 2 | 0.7 | 1.5 | **3.7** | L | E-B (v2) |
| F18 | Side-by-side compare (pin 2–4 verses) | 4 | 1 | 0.8 | 0.75 | **4.3** | M | E-B (v2) |
| F14 | Path between two verses (BFS, ≤4 hops) | 3 | 2 | 0.6 | 1.5 | **2.4** | L | backlog |

**Sprint 2 scope (recommended):** B1, F2, F19, F1, F4, F3, F8, F6, F7, F10, F11, F5, F21, F9, F12. Defer F15, F22, F13, F18, F14 to Sprint 3 unless capacity allows.

### 6.1 Day-1 shared contracts (merge first, ~0.5 day, owner: E-A)

These small files let the other epics proceed in parallel without touching each other's files:

1. **`frontend/src/routing/routes.ts`** exports:
   - `type AppRoute = { name: 'home' } | { name: 'verse'; book: number; chapter: number; verse: number } | { name: 'read'; book: number; chapter: number } | { name: 'insights'; tab?: string } | { name: 'book'; book: number } | { name: 'study' } | { name: 'about' } | { name: 'notFound' }`
   - `parseLocation(url: URL): { route: AppRoute; params: { ds?: string; kind?: EdgeKindFilter; dir?: DirectionMode; depth?: number } }`
   - `verseHref(ref: {bookNumber, chapterNumber, verseNumber}, params?)`, `chapterHref(...)`, `bookHref(...)`
   - `navigate(href: string, opts?: { replace?: boolean })` (pushState + event)
   - `useRoute()` hook
   - URL scheme: `/verse/<book-slug>/<chapter>/<verse>?ds=nwtsty&kind=combined&dir=all&depth=1`, using the canonical **English slug** from `books.json` (`slug`) for every dataset, so links are language-agnostic.
2. **`frontend/src/components/VerseLink.tsx`**: `<VerseLink verseId|ref label?>`, an anchor that uses `verseHref` + `navigate`. **All epics must use this for any verse label.**
3. **`frontend/src/study/store.ts`** (owner E-C, stub on day 1): `useBookmarks()`, `useHistory()`, `recordVisit(verseId)`, `toggleBookmark(verseId, collectionId?)`, `getNote(verseId)` / `setNote(...)`. On day 1 these are no-op stubs with the final signatures, so E-B can wire the buttons.
4. **`frontend/src/i18n/index.ts`** (owner E-F, stub on day 1): `t(key, vars?)` returning English. Epics write new strings as `t('verse.connections.title')` with English defaults in `i18n/en.ts` under their own **namespace prefix** (`home.*`, `verse.*`, `study.*`, `insights.*`, `read.*`, `shell.*`). E-F only adds `it.ts`.

### 6.2 Epics, file ownership and stories

> Ownership rule: an epic **owns** the files listed and is the only one editing them in Sprint 2. Touch points outside owned files are listed explicitly and limited to one-line imports/mounts, coordinated through the contracts above.

---

#### Epic E-A — Find & Navigate (search, routing, home, shortcuts)

**Owns:** `frontend/src/App.tsx`, `frontend/src/routing/*` (new), `frontend/src/search/*` (new), `frontend/src/components/VerseSearch.tsx` (new), `frontend/src/components/VerseLink.tsx` (new), `frontend/src/pages/HomePage.tsx` (new), `frontend/src/hooks/useKeyboardShortcuts.ts` (new), `frontend/src/data/bookAliases.ts` (new).
**Touch points:** mounts other epics' pages in `App.tsx`; Overview moves from `/` to `/insights` (E-D owns its content).

- **A1 — Deep links & URL state** (F2, U2, U14)
  _As a student, I want the URL to reflect the verse and filters, so I can bookmark, share and reload without losing my place._
  AC:
  - Visiting `/verse/john/3/16?ds=nwtsty&kind=study-notes` opens John 3:16 with study-note filter on nwtsty.
  - Changing book/chapter/verse/filters updates the URL (`pushState` for verse changes, `replaceState` for filter changes); browser back returns to the previous verse.
  - Dataset from `?ds=` overrides localStorage; invalid values fall back to the default with no crash.
  - Unknown paths render a NotFound state with the search box. Legacy `/verse` without params opens the last visited verse (from history) or John 3:16.
  - Unit tests for `parseLocation` / `verseHref` round-trip on all 66 slugs.
- **A2 — Global verse search with autocomplete** (F1, U3)
  _As a student, I want to type "Gv 3:16", "jn 3 16", "Giovanni 3:16" or "1 Cor 13" and jump straight there._
  AC:
  - Search box in the shell header, visible on every page; `/` focuses it.
  - Parser accepts English and Italian full names and common abbreviations (Gen/Ge, Ex/Eso, Ps/Sal, Mt/Matt, Gv/Jn/Joh, 1Co/1 Cor/1Cor, Ri/Rev/Ap…), optional spaces, and `:`, `.` or `,` as separators. A chapter-only query goes to Read mode (`/read/...`).
  - Autocomplete shows up to 8 suggestions with the book name in the dataset's language plus verse preview text (when the verse is resolved).
  - Fully keyboard operable (↑/↓/Enter/Esc), ARIA combobox pattern.
  - Alias table lives in `bookAliases.ts` (EN + IT) and is unit-tested with ≥ 60 cases, including ambiguous ones ("Gi" → Giovanni/Giona/Giosuè: list all).
  - Does **not** need `verse-index.json` for parsing (books + chapter counts from `books.json`, verse counts from the per-book data loaded lazily).
- **A3 — Search-first Home & onboarding** (F19, U12)
  _As a newcomer, I want to understand what BibliaMap does in 10 seconds and start from an example._
  AC:
  - `/` shows: one-sentence value prop, a large search box, 4 example cards (e.g. "John 3:16 — 88 connections", "Psalm 110:1 — most-quoted psalm in the Greek Scriptures", "Genesis 3:15", "Isaiah 53") linking to Study, "Continue where you left off" (from history), and a link to Insights.
  - Dataset picker uses plain labels: "Study Bible — English (2026)", "Study Bible — Italiano (2024)", "NWT (2013)", "Reference Bible (1984)", with a one-line explanation of each.
  - First visit shows a dismissible 3-step hint (search → read connections → save).
- **A4 — Keyboard shortcuts** (F16)
  AC: `/` search, `Esc` close overlays, `[` / `]` previous/next verse, `b` bookmark (calls the E-C store), `?` shortcut help dialog; shortcuts are disabled while typing in inputs.

---

#### Epic E-B — Verse Study workspace (the core)

**Owns:** `frontend/src/pages/VersePage.tsx`, which is **split into** `frontend/src/pages/verse/` (new: `VerseStudyPage.tsx`, `ConnectionList.tsx`, `VerseGraph.tsx`, `ConnectionDetail.tsx`, `StudyTrail.tsx`, `useNeighborhood.ts`), `frontend/src/graph/neighborhood.ts` (new, extracted from VersePage), `frontend/src/pages/VersePage.test.ts`.
**Touch points:** uses `VerseLink`, `routes.ts`, `study/store.ts` hooks, `t()`.

- **B1 — Connection list view** (F3, U6, U7, U16)
  _As a student, I want to read every connected verse as text, grouped, so I can scan them quickly._
  AC:
  - Tabs/segments: **List** (default on mobile) | **Graph** (default on desktop ≥ 1120px, side by side with the list).
  - Groups: "This verse points to" / "Points to this verse", each subgrouped by **book in canonical order**, with group counts. Optional sort: canonical, by testament, by type.
  - Each row: reference label with **range support** ("John 1:1-3"), type badge (Cross ref / Study note), full verse text (range text concatenated), actions: Study (recenter), Bookmark, Copy.
  - Filter chips: type (cross ref / study note), testament (OT / NT), text filter within the list.
  - Empty state per filter, with a suggestion (switch type/dataset). The "Study notes" filter is disabled with a tooltip when the dataset has 0 study-note refs (U8).
  - Legend for the graph covers all three colors with plain wording.
- **B2 — Recenter & study trail** (F4, U4)
  _As a student, I want to follow a reference and come back, building a chain._
  AC:
  - "Study this verse" in the detail panel and list rows, plus a double-click on a graph node, navigates to that verse (URL changes via A1).
  - A trail bar shows the last ≤ 8 verses of this session (e.g. John 3:16 → 1 John 4:9 → Romans 5:8), each clickable; the trail is kept in `sessionStorage`.
  - The graph animates the new center and the previous center stays highlighted for 2 s.
  - Each visit calls `recordVisit()` (E-C store).
- **B3 — Usable depth-2 ego graph** (F5, U5)
  AC:
  - "Layers" becomes "Depth: Direct (1) / Extended (2)"; depth 3 is removed.
  - Depth 2 ranks second-hop verses by number of shared links to first-hop verses and shows at most 40 (configurable), with "Show 40 more".
  - Loads ≤ 25 adjacency files at depth 2; if more books are needed, it loads progressively and shows a "loading more…" indicator, not a blank shimmer.
  - Measured: John 3:16 depth 2 renders a first meaningful graph in < 1.5 s on live (desktop, warm cache).
  - Fix the cap bug: node count respects the limit.
- **B4 — Verse context** (readability)
  AC: the selected verse shows ±2 surrounding verses (muted), "Read chapter" (→ `/read/...`) and previous/next verse buttons; text size controls (A− / A+) persisted.
- **B5 (stretch, Sprint 3) — Edition comparison & pinned compare** (F13, F18)
  AC: an "Editions" tab shows this verse's references in each dataset with set diffs (only in Rbi8 / only in nwtsty / both). Pin up to 4 verses to a compare tray showing their texts side by side.

---

#### Epic E-C — My Study (bookmarks, collections, notes, history, export)

**Owns:** `frontend/src/study/*` (new: `store.ts`, `schema.ts`, `export.ts`, `import.ts`, `useStudy.ts`, tests), `frontend/src/pages/StudyPage.tsx` (new), `frontend/src/components/SaveVerseButton.tsx` (new), `frontend/src/components/NoteEditor.tsx` (new).
**Touch points:** E-B renders `<SaveVerseButton verseId>` and `<NoteEditor verseId>`; E-A shortcut `b` calls `toggleBookmark`.

- **C1 — Study history** (F8)
  AC: the last 100 visited verses (deduped, timestamped, per dataset) are stored in localStorage under a versioned key `bibliamap.study.v1`; shown on Home ("Continue") and on `/study`; "Clear history" button.
- **C2 — Bookmarks & collections** (F6)
  _As a student preparing a talk, I want to save verses into a named collection ("Talk: God's love")._
  AC:
  - Save from the list row, the detail panel or `b`; choose an existing collection or create one inline; a default "Saved" collection.
  - `/study` lists collections; reorder by drag or up/down buttons; remove; rename.
  - Collections store `canonicalVerseId` (stable across datasets) plus an optional range end, so they survive dataset switches.
- **C3 — Personal notes** (F7)
  AC: a Markdown-lite textarea per verse (and per collection), autosaved (debounced 500 ms), with a character count, shown in the Study panel and on `/study`. Notes never leave the device; this is stated in the UI.
- **C4 — Export / import** (F7, F10)
  AC:
  - Export all study data as **JSON** (versioned schema) and import with merge (not overwrite) after a confirm dialog with a summary of what will be added.
  - Export a collection as a **Markdown study sheet**: title, notes, each verse with reference and text in the chosen dataset, and optional connected verses (top N); download or copy to clipboard.
  - **Print view** (`/study/:collection/print` or `@media print` CSS): clean serif layout, no nav.
  - Data-loss guard: if localStorage is unavailable, show a warning banner.

---

#### Epic E-D — Insights (analytics redesign + Overview bug fixes)

**Owns:** `frontend/src/pages/OverviewPage.tsx` → `frontend/src/pages/insights/*` (new: `InsightsPage.tsx`, `HubVerses.tsx`, `QuotationFlows.tsx`, `ChapterHeatmap.tsx`, `BookProfilePage.tsx`, `IsolatedVerses.tsx`), `frontend/src/pages/ChordPage.tsx`, `frontend/src/pages/RelationshipBlocksPage.tsx`, `frontend/src/graph/relationshipComponents.ts`, `frontend/src/graph/matrix.ts`, `frontend/src/graph/chordGeometry.ts`, `frontend/src/pages/OverviewPage.test.ts`.

- **D1 — P0 fixes** (U1, U13, U15, U21 credit text is in App.tsx, so E-A fixes U21)
  AC: "View all" lists load in < 1 s using `stats.books.json` / `stats.chapters.json` where possible; the modal closes on Esc and backdrop click and traps focus; Chord has a single reset and its diagram is above the fold at 1440×900.
- **D2 — Everything clickable**
  AC: every verse label in Insights is a `VerseLink`; every chapter opens `/read/...`; every book opens `/book/:slug`.
- **D3 — Hub verses** (F21)
  AC: tabs "Most referenced" / "Refer to the most" / "Most study-note citations", top 100, filter by book and testament, each row with a text preview. Data comes from `stats.verses.json` today; full lists use the extractor's `stats.verse-degree` (§7) when available, else client-side counting from `edges/*.compact.json` with a loading state.
- **D4 — Chapter heatmap**
  AC: a 66-row grid (one cell per chapter) colored by incoming+outgoing density from `stats.chapters.json` (100 KB); hovering shows the count; clicking opens Read mode; a color-scale legend; works on mobile (horizontal scroll inside the card only).
- **D5 — Quotation flows & book-pair drill-down** (F15, Sprint 3 if needed)
  AC: OT→NT and NT→OT ranked pairs from `matrices/book.*.json`; clicking a pair (or a chord) lists the verse pairs with text (from per-book adjacency); filter by type.
- **D6 — Book profile** (F22)
  AC: `/book/:slug` shows the top referenced verses in the book, the books it references and is referenced by (bars), a chapter density strip, and a testament split.
- **D7 — Replace Blocks** (U18)
  AC: the Blocks page is retired from the nav; "Verses with no references" (isolated verses, browsable by book) and "Small clusters" (size 3–10, with verse texts) become Insights tabs; the route `/blocks` redirects to `/insights?tab=clusters`.

---

#### Epic E-E — Read mode (chapter view with reference heatmap)

**Owns:** `frontend/src/pages/read/*` (new: `ReadPage.tsx`, `ChapterText.tsx`, `ChapterConnections.tsx`), `frontend/src/data/chapterData.ts` (new helpers; must not edit `generated.ts`; it only imports from it).

- **E1 — Chapter reading view** (F9)
  _As a student, I want to read a whole chapter and see which verses are most connected._
  AC:
  - `/read/:book/:chapter` renders the chapter's verse text (from `verse-text/<book>.json`) in a readable serif column (max ~70ch), with prev/next chapter and a chapter picker.
  - Each verse shows a small reference-count badge; the background intensity is proportional to its connection count (heatmap); a toggle hides it.
  - Clicking a verse opens a side panel (bottom sheet on mobile) with its connections (reusing E-B's `ConnectionList` component in read-only form, imported, not edited) and "Study this verse".
- **E2 — Connections of this chapter**
  AC: the panel tab "This chapter connects to" ranks target books and chapters for the whole chapter (aggregated from source+target adjacency), each clickable; it includes both directions and type filters.

---

#### Epic E-F — Shell, mobile, i18n, theme, accessibility

**Owns:** `frontend/src/styles/index.css` (only global and shell tokens; page-specific CSS goes in new per-page CSS files owned by each epic, e.g. `pages/verse/verse.css`), `frontend/src/i18n/*` (new), `frontend/src/components/{PageHeader,FilterPanel,SegmentedControl,StatCard,LoadingShimmer,ErrorState,DatasetBadge}.tsx`, `frontend/src/components/BottomSheet.tsx` (new), `frontend/src/components/ThemeToggle.tsx` (new), `frontend/index.html`.

- **F-1 — Mobile shell** (F11, U10)
  AC: below 760px, a compact header (logo + search icon, 56px) and a **bottom tab bar** (Home, Study, Read, Insights, My study); the content starts within the first 120px; a reusable `BottomSheet` component; filter panels collapse into a "Filters (2)" button that opens a sheet. Verified at 360×640 and 390×844 with no horizontal scroll and tap targets ≥ 44px.
- **F-2 — i18n EN/IT** (F12, U19)
  AC: `t()` with `en.ts` / `it.ts`; language follows the URL `?lang=` > localStorage > dataset language > `navigator.language`; a language switcher sits in the shell; all shell and component strings are translated; epics' namespaces are translated by end of sprint (E-F owns `it.ts`); numbers are formatted with the locale.
- **F-3 — Theme** (F17, U20)
  AC: light, dark and system themes via CSS custom properties on `:root[data-theme]`; persisted; WCAG AA contrast for text in both themes; the SVG graph colors come from tokens.
- **F-4 — Accessibility baseline**
  AC: visible focus rings; skip-to-content link; landmarks; `prefers-reduced-motion` disables force-sim animation and count-up; the graph has an accessible alternative (the B1 list). axe has no serious violations on Home, Study and Read.
- **F-5 — Plain-language copy & About rewrite** (U9)
  AC: page descriptions are rewritten for students; About explains the editions, what a cross reference vs a study-note reference is, a data-source note, and the corrected content policy; technical build info moves into a collapsible section.

---

#### Epic E-G — Data & extractor support (Rust; optional but multiplies the others)

**Owns:** `crates/bibliamap-extractor/*`, `crates/bibliamap-core/*`, `scripts/*`, `frontend/public/generated/**`, `frontend/src/types/generated.ts` (additive types only), `frontend/src/data/generated.ts` (additive loaders only).
**Rule:** additive-only file formats; the frontend must keep working if new files are absent (feature-detect via `manifest.json`, e.g. a new `features: string[]` field).

- **G1 — `search-index.json`** (~150–250 KB): `[bookNumber, chapter, verseCount][]` plus localized book names and aliases, so search and A1 need no 4 MB `verse-index.json` / 2.9 MB `chapters.json`.
- **G2 — `stats.verse-degree.json`**: compact arrays `in[]`, `out[]`, `inStudy[]` indexed by jwpubVerseId (≈31k × 3 small ints, ~150 KB gz), to power hubs, heatmap badges and node sizing.
- **G3 — `matrices/chapter/<book>.json`**: chapter→book aggregates for "connections of this chapter" without loading the full adjacency.
- **G4 — `compare/<dsA>__<dsB>/<book>.json`**: per-verse reference set diffs between editions (keyed by `canonicalVerseId`) for B5.
- **G5 — Cache headers**: the `nginx.conf` change for long `Cache-Control` on `/generated/*`, with a content hash or `generatedAt` query param from `manifest.json`.
- _Not feasible without rights review:_ study-note **text** (the extractor already reads `VerseCommentary` but exports only IDs), footnotes and section headings. Flag this for the owner's decision; do not build it in Sprint 2.

### 6.3 Parallelization map

| Epic | Can start | Depends on | Conflicts to watch |
|---|---|---|---|
| E-A | Day 1 (publishes contracts) | — | Owns `App.tsx`; others request mounts by PR comment |
| E-B | Day 1 (after contracts) | `routes.ts`, `VerseLink`, `study/store` stubs | `VersePage.tsx` is replaced by `pages/verse/*`; `App.tsx` import switched by E-A |
| E-C | Day 1 | — | Only new files |
| E-D | Day 1 | `VerseLink` | Owns Overview/Chord/Blocks; E-A changes routes `/` → `/insights` |
| E-E | Day 2 | `routes.ts`; imports E-B `ConnectionList` (read-only) once B1 merges; uses a simple local list until then | New files only |
| E-F | Day 1 | — | `index.css`: only E-F edits it; others add per-page CSS files |
| E-G | Day 1 | — | Frontend type/loader files are additive only |

Suggested staffing for 5 engineers: (1) E-A, (2) E-B, (3) E-C + E-E, (4) E-D, (5) E-F (+ E-G if a Rust engineer is available).

### 6.4 Definition of done (all epics)

- Unit tests for parsers, stores and graph logic (`vitest`); `npm test` and `npm run build` pass.
- A Playwright smoke test for the epic's main flow at desktop and mobile sizes (scripts kept outside the bundle).
- No new P0/P1 axe violations; works at 390×844.
- New strings go through `t()`; verse labels go through `VerseLink`.
- No regression to the static-hosting model (no server calls except `/generated/*` and Umami).

---

## 7. Data inventory (what exists today and what it can power)

| File (per dataset) | Size raw / gz | Contents | Powers |
|---|---|---|---|
| `manifest.json`, `books.json` | < 10 KB | metadata; 66 books with localized `name`, English `slug` | routing, search, dataset labels |
| `chapters.json` | 2.9 MB / ~390 KB | every chapter's verse list | verse pickers (replace with G1) |
| `verse-index.json` | 4.1 MB / ~530 KB | jwpubVerseId → ref + label | label lookup (could be computed from G1) |
| `verse-text/<book>.json` | 5.6 MB total | verse text by id | list view, Read mode, study sheets |
| `adjacency/{source,target}/<book>.json` | ~12 MB each total | outgoing/incoming edges incl. `targetEnd` ranges, `kind`, `commentaryId` | Study page, Read mode, drill-downs |
| `edges/{combined,crossrefs,study-notes}.compact.json` | 6.25 MB total (combined ~770 KB gz) | all edges, columnar | global analytics, hubs, comparisons |
| `matrices/book.*.json` | 30 KB | 66×66 weights | chord, quotation flows, book profiles |
| `stats.summary/books/chapters/verses/testaments.json` | < 150 KB | precomputed aggregates | Insights, heatmap, hubs (top N only) |

Edition facts useful for product messaging: nwtsty EN has 65,666 cross refs + 16,045 study-note refs; nwtsty IT has 65,541 + 13,494; nwt 2013 has 63,390 cross refs and no study notes; Rbi8 1984 has **125,003** cross refs (nearly twice as many), so edition comparison is a real research feature.

---

## 8. Measurements captured (for regression tracking)

| Metric | Local dev | Live |
|---|---|---|
| Verse page first view (Romans 1:12, networkidle) | 2.6 s desktop / 3.0 s mobile | 3.4 s desktop / 4.4 s mobile |
| Generated data decoded on first Verse view | 15 MB (StrictMode double fetch) | 8.05 MB (gzip on wire ≈ 1.1 MB) |
| John 3:16 selection → graph | 2.1 s | 1.7 s |
| John 3:16 depth 2 | — | 2.35 s, 91 files, 17 MB decoded, 801 nodes |
| Blocks page ready | 2.9 s | 4.0 s desktop |
| Overview "View all" | never (bug U1) | never (bug U1) |
| Horizontal overflow at 390px | none | none |

## Appendix — Screenshot index

| # | File | Shows |
|---|---|---|
| 01 | `01-desktop-overview.png` | Home = stats dashboard |
| 02 | `02-desktop-overview-viewall-stuck.png` | U1 modal stuck loading |
| 03 | `03-desktop-chord.png` | Chord below fold, tiny labels, double reset |
| 04 | `04-desktop-chord-isaiah.png` | Isolating a book: no drill-down |
| 05 | `05-desktop-verse-default.png` | Verse Explorer default, 3-dropdown lookup, dev copy |
| 06 | `06-desktop-verse-john316.png` | 1-layer graph, 72 nodes, no list |
| 07 | `07-desktop-verse-2-layers-hairball.png` | Depth 2 = 801 nodes |
| 08 | `08-desktop-verse-node-detail.png` | Node detail without "study this verse" |
| 09 | `09-desktop-nwt-studynotes-empty.png` | Silent empty state (nwt has no study notes) |
| 10 | `10-desktop-blocks.png` | Blocks: low student value |
| 11 | `11-desktop-about.png` | About copy and outdated content policy |
| 12 | `12-mobile-verse-first-screen.png` | Mobile: header/nav eat the first screen |
| 13 | `13-mobile-verse-graph.png` | Mobile graph: unreadable labels |
| 14 | `14-mobile-chord-full.png` | Mobile chord + 66-row list |
| 15 | `15-desktop-verse-italian.png` | Italian dataset with English UI |
