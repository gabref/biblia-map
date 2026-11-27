# BibliaMap design spec

Sprint 1 · 2026-11-27 · owner: design lead

This document is the source of truth for how BibliaMap looks, moves and behaves. Sprint 1 shipped
the foundation (tokens, type, primitives, shell). Sprint 2 redesigns each page on top of it; the
per-page notes in section 8 are the brief for that work.

Living reference: run the app and open **`/styleguide`** (not linked from the nav). Every token
and primitive is rendered there in both themes.

Contents: 1 Audit · 2 Direction · 3 Tokens · 4 Typography · 5 Components · 6 Motion ·
7 Interaction patterns · 8 Per-page redesign notes · 9 Accessibility · 10 Rules for Sprint 2

---

## 1. Audit of the pre-Sprint-1 UI

Screenshots: `docs/design/screenshots/before-*.png` (after: `after-*.png`).

**What the product is today.** A competent analytics dashboard *about* a Bible. Every page leads
with counts and infrastructure ("precomputed matrices", "adjacency files", "static graph build").
Someone who opens it to study a verse is shown how the data was built before they are shown a
verse. The redesign's job is to turn the emphasis around: scripture first, graph second, plumbing
last.

| Area | Finding | Severity |
| --- | --- | --- |
| Hierarchy | Page `h1` was 3.6rem sans at 0.95 line-height — the loudest thing on every page was the page's own name. Stat tiles, charts and the verse itself all competed below it at similar weight. | High |
| Hierarchy | Verse Explorer: the verse text (the thing being studied) was a 16px pink-on-brown box wedged between a toolbar and a legend; the filter panel above it was larger and brighter. | High |
| Typography | One family (system Inter fallback — the font was never actually loaded), no reading face. Scripture rendered in the same UI sans as button labels. Sizes were ad hoc: well over a dozen distinct `font-size` values, none tokenised. | High |
| Colour | Two unrelated worlds on one screen: near-black green shell and cream "paper" panels. The eye bounced between them; neither a light nor a dark theme. No theme switch, `color-scheme: dark` hard-coded. | High |
| Colour | Brass did five jobs: brand, eyebrow, active segmented button, stat icon tiles, *and* the "outgoing" data colour. Clay was both "selected verse" and decoration. Colour carried no reliable meaning. | High |
| Colour | Bars were a teal→brass gradient: decorative, implies a second variable that does not exist. | Medium |
| Spacing | Gaps of 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 24, 34px. No rhythm; panels 18px, main 34px, stat cards 132px min-height with dead space. | Medium |
| Consistency | Four button styles (`icon-button`, `text-button`, `filter-action`, segmented) with different heights, radii and hover logic. Everything 8px radius regardless of size. | Medium |
| Affordance | Rank-list rows are buttons but looked like static text (no hover, no cursor change beyond text colour). "View all" opened a modal with the same list, longer — a dead end, not a path into the data. | High |
| Affordance | Chord: clicking an arc isolates a book, but nothing says so on the diagram; the only hint is in the side panel. No selected state on the arc itself. Reset appears twice. | Medium |
| Affordance | Verse graph: nodes are clickable *and* draggable with no visible difference; the connection detail is in a separate panel far from the node. No way to make a neighbour the new centre in one click. | High |
| Motion | Only a stat-card fade and a shimmer. Verse changes, filter changes and route changes all hard-cut. Force layout re-settles from scratch on every change (jarring, not animated *between* states). | Medium |
| Motion | `prefers-reduced-motion` was not honoured anywhere; route change used forced smooth scrolling. | High (a11y) |
| Data viz | Chord labels 10px in a 1080-wide viewBox scaled down — well under 10px on a laptop, illegible on a phone. 66 arcs in two near-identical hue pairs, so adjacent books are indistinguishable. Ribbons at 0.28 opacity form an undifferentiated hairball with no focus+context. | High |
| Data viz | Verse graph labels overlap edges with no halo; edge colour alone encodes direction (fails for colour-blind readers); arrowheads were hard-coded hex. | Medium |
| Data viz | Blocks page: "Block 1 = 88%, Blocks 2–14 = 0%" bar chart — thirteen identical slivers. The form does not fit the data (one giant component + a long tail). | Medium |
| Mobile | Sidebar became a sticky stack ~190px tall (brand + nav + dataset) — a quarter of the screen. The floating pill nav sat inside a `backdrop-filter` ancestor, so `position: fixed` resolved against the sidebar, not the viewport. | High |
| Mobile | Verse Explorer filter panel is six full-width controls: the graph starts on the second screen. Chord diagram at 390px is unreadable. | High |
| Accessibility | No visible focus style defined (browser default on dark, invisible on brass). No skip link, no `aria-current`, no document titles per route. Segmented buttons had no pressed state for AT. `meter` bars unlabeled. Loading had no `role="status"`. | High |
| Accessibility | Contrast mostly passed (muted on paper 4.7:1) but 10–11px labels at that ratio are still too small. | Medium |
| Copy | Labels describe the implementation ("Local graph", "Static graph build", "NT->OT", "Chord filters"); the sidebar credit read "GitHub GitHub.com/…". | Medium |

**What was already good and is kept:** the outgoing = warm / incoming = blue convention; the
information itself; pan/zoom on the verse graph; the collapsible book list; fast static data.

---

## 2. Design direction — "The Reference Column"

A study Bible has a narrow column of tiny citations running beside the text. It is the original
hyperlink: a superscript letter in the verse, a matching entry in the margin, and a reader who
keeps one finger in the page while they follow it. BibliaMap *is* that column, made navigable.
The design takes its vocabulary from the printed apparatus, not from "ancient manuscript" mood
boards:

- **India paper and ink, not parchment.** Bible paper is thin, cool and nearly white; the ink is
  blue-black. Light theme is a cool paper (`#f3f4f1`) with blue-black ink. Dark theme is the same
  desk at night — deep ink-slate, not brown, not green. No cream, no texture, no terracotta.
- **Three pigments, each with one job.** Scribes had lapis, gold leaf and vermilion.
  **Lapis** = anything you can act on. **Gilt** = highlight, "this is marked". **Rubric**
  (vermilion) = *you are here*: the selected verse, the active page, verse numerals. Rubric is
  used sparingly enough that it always means location.
- **Scripture is set as scripture.** Verse text is always the serif (Literata), at reading size,
  on a bounded measure, hung from a thin vertical rule — the "margin rule" — that carries the
  verse's state colour. Everything else is quiet sans.
- **The thumb index.** Printed Bibles have notches cut into the fore-edge to find a book. The
  active nav item gets a small rubric notch at the edge of the sidebar (top edge of the tab bar on
  phones). It is the one signature flourish; nothing else decorates.
- **Dense where it's data, generous where it's reading.** Lists, legends and filters are compact
  (14px, 4px grid). Anywhere a verse is read gets air.

Tone of voice: plain, specific, sentence case. Name things by what the student does with them
("Verses that cite this one"), never by how they are stored.

---

## 3. Tokens

All tokens are CSS custom properties in `frontend/src/styles/tokens.css`. Colours are declared
once with `light-dark()`; `color-scheme` on `:root` picks the side. No `data-theme` attribute =
follow the OS; `data-theme="light|dark"` forces one.

**Dark is the default** (owner decision, Sprint 2): `index.html` ships `<html data-theme="dark">`,
so a first visit is dark whatever the OS says. The ThemeToggle steps dark → light → system; the
choice is stored under `bibliamap-theme` (`dark` / `light` / `system`), applied by `useTheme` and
restored before first paint by the inline script in `index.html`. Only `system` removes the
attribute and follows the OS. A subtree can be locally inverted with `style="color-scheme: dark"`.

Brand mark, icon set and share cards: see `docs/design/brand/README.md`.

### 3.1 Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f3f4f1` | `#0d1015` | Page |
| `--bg-sunken` | `#e9ebe7` | `#080a0e` | Wells: graph canvas, inset lists |
| `--surface` | `#fcfcfb` | `#151920` | Panels, sidebar |
| `--surface-raised` | `#ffffff` | `#1c212a` | Controls, popovers, sheets |
| `--surface-hover` / `--surface-active` | ink 5% / 9% | ink 6% / 10% | Row hover / pressed, selected row |
| `--scrim` | ink 36% | black 66% | Behind sheets and dialogs |
| `--ink` | `#151922` | `#e9ebef` | Primary text (15.9:1) |
| `--ink-2` | `#454c59` | `#b4bac6` | Secondary text (7.8:1 / 9.0:1) |
| `--ink-3` | `#626978` | `#8a92a1` | Tertiary text, icons (5.0:1 / 5.6:1) |
| `--ink-disabled` | `#9aa0ab` | `#5b6270` | Disabled only |
| `--line` / `--line-strong` | ink 12% / 24% | ink 10% / 22% | Hairlines / control borders |
| `--accent` (lapis) | `#2b4c9b` | `#8faef5` | Links, primary buttons, focus, bars |
| `--accent-hover`, `--accent-soft`, `--on-accent` | | | Hover, tinted fills, text on accent |
| `--gilt` | `#a06e0a` | `#e2b44c` | Highlight marks, fills |
| `--gilt-ink`, `--gilt-soft` | `#7a5608`, `#f6ecce` | `#ebc56d`, gilt 16% | Text on gilt wash; the highlighter wash |
| `--rubric` | `#c2321f` | `#f0705a` | Selected verse, active location |
| `--rubric-soft`, `--on-rubric` | | | Tinted fill; text on rubric |
| `--success`, `--danger` (+ `-soft`) | | | Status only |

Contrast was computed for every text pair; all body pairs are ≥ 4.5:1 and all viz marks ≥ 3:1
against the canvas in both themes.

**Data-viz colours**

| Token | Meaning |
| --- | --- |
| `--outgoing` (= gilt) | Reference *from* the studied verse to another |
| `--incoming` (blue) | Reference *to* the studied verse |
| `--both` (verdigris) | Linked both ways |
| `--selected` (= rubric) | The studied verse / the selected mark |
| `--viz-bar`, `--viz-bar-track` | Single-series magnitude bars (always one hue, never a gradient) |
| `--viz-canvas`, `--viz-grid`, `--viz-label`, `--viz-node-ring` | Graph surface, dot grid, labels, node outline |
| `--canon-law`, `-history`, `-poetry`, `-prophets` | Hebrew-Aramaic Scriptures — warm family |
| `--canon-gospels`, `-letters`, `-revelation` | Christian Greek Scriptures — cool family |

Rules: direction is never encoded by colour alone (pair with an arrow, a label or position).
Canon colours are categorical and only for *book identity*; do not reuse them for direction.
Sequential needs (heat, density) use `color-mix(in oklch, var(--accent) N%, var(--viz-canvas))`.

### 3.2 Space, shape, elevation

- **Space** — 4px grid: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 ·
  `-10` 40 · `-12` 48 · `-16` 64 · `-20` 80. Inside a component use 1–4; between components 4–6;
  between page sections 6–10.
- **Radii** — `--radius-xs` 4 (kbd, focus) · `-sm` 6 (controls) · `-md` 10 (inset blocks,
  tooltips) · `-lg` 14 (panels) · `-xl` 20 (bottom sheets) · `-full` (chips). Radius scales with
  the size of the thing; nested radii step down one level.
- **Elevation** — flat by default: a panel is `--surface` + a `--line` border, no shadow.
  `--shadow-1` controls and floating toolbars · `--shadow-2` tooltips, hovered cards ·
  `--shadow-3` sheets, dialogs, toasts. Dark theme relies on the lighter surface step more than on
  shadow.
- **Layout** — `--sidebar-width` 248 · `--content-max` 1320 · `--control-h` 36 ·
  `--control-h-sm` 30 · `--tap-min` 44 (minimum touch target under 760px) · `--measure` 64ch.
- **Layers** — `--z-sticky` 20 · `--z-nav` 40 · `--z-overlay` 60 · `--z-tooltip` 80 · `--z-toast` 90.
- **Breakpoints** — 1100px: sidebar becomes top bar + bottom tab bar, two-column layouts stack.
  760px: phone density, 44px targets, sheets come from the bottom.

### 3.3 Tailwind

Tailwind 4 is loaded. Colour tokens are mapped in `styles/index.css` (`@theme inline`), so
`bg-surface text-ink-2 border-line text-rubric bg-gilt-soft` work and follow the theme.
`font-serif`, `rounded-lg`, `text-sm` etc. already resolve to our tokens (same variable names).
Component CSS lives in `@layer components`, so a utility on the same element wins.

---

## 4. Typography

Self-hosted variable fonts via fontsource (`styles/fonts.css`), subset by `unicode-range` so only
the scripts in use are fetched (Latin ≈ 52kB + 30kB).

| Role | Family | Why |
| --- | --- | --- |
| Scripture, page titles, large numerals | **Literata** (variable, roman + italic) | Designed for long-form screen reading; sturdy at 16–20px, real italics, old-style and lining figures. Bookish without being antique. |
| Interface | **Instrument Sans** (variable) | Compact, slightly condensed grotesque with clear numerals; stays quiet next to the serif. |
| Keys, ids, technical values | **JetBrains Mono** (variable) | Only for `<Kbd>`, dataset symbols, debug values. |

Scale (`--text-*`): 2xs 11 · xs 12 · sm 14 · md 16 · lg 18 · xl 22 · 2xl 28 · 3xl clamp(30→40) ·
4xl clamp(36→56).

| Class | Spec | Use |
| --- | --- | --- |
| `.t-display` | serif 4xl / 500 / 1.05 / −0.025em | One per product: landing hero only |
| `h1`, page title | serif 3xl / 500 / 1.15 / −0.018em | One per page |
| `.t-title` | serif xl / 550 | Sheet titles, the selected citation |
| `h2` / panel title | sans md–lg / 650 | Panel headings |
| `.t-eyebrow` | sans xs / 650 / caps +0.09em / ink-3 | Section labels, column headings |
| `.t-scripture` | serif lg / 1.72 / max 64ch / old-style figures | **All verse text** |
| `.t-ref` | sans / 600 / tabular lining / nowrap | Citations ("Romans 1:12") |
| `.t-numeral` | sans 2xl / 600 / tabular | Inline stats |
| `.t-label`, `.t-caption`, `.t-mono` | sm/550 · xs/ink-3 · mono | Controls, help text, technical |

Rules: numbers that are compared use `tabular-nums`. Never set scripture in the sans or below
16px. Never use the serif for controls. Sentence case everywhere except eyebrows.

---

## 5. Components

Primitives: `frontend/src/components/ui/` (import from `../components/ui`), styles in
`styles/ui.css`, all classes prefixed `ui-`. Hooks: `frontend/src/hooks/`. Motion helpers:
`frontend/src/lib/motion.ts`.

| Component | API | Notes |
| --- | --- | --- |
| **Button** | `variant: primary \| secondary \| ghost \| danger`, `size: sm \| md \| lg`, `leading`, `trailing`, `loading`, `block` + button attrs | One primary per view. Press scales to 0.97. |
| **IconButton** | `label` (required), `variant`, `size` | `label` becomes `aria-label` and the native title. Wrap in `Tooltip` for a styled hint. |
| **Chip** | `tone: neutral \| accent \| gilt \| rubric \| outgoing \| incoming \| both`, `size`, `selected`, `leading`, `count`, `onClick`, `onRemove` | Static `<span>` unless `onClick` (then a toggle button with `aria-pressed`). |
| **ReferenceChip** | `reference`, `direction?: outgoing \| incoming \| both`, + Chip props | The unit of navigation. Direction = colour + arrow + hidden text. |
| **Card / Panel** | `as`, `variant: surface \| raised \| sunken \| outline`, `padding: none \| sm \| md \| lg`, `interactive` | `sunken` is the chart well. |
| **CardHeader** | `title`, `description`, `icon`, `action`, `level` | Action slot holds one control group. |
| **Tabs** | `label`, `items[{value,label,icon,count,disabled}]`, `value`, `onChange`, `variant: underline \| pill`, `size`, `block`, `idBase` | Roving tabindex, arrows/Home/End, sliding indicator (rubric underline or raised pill). |
| **TabPanel** | `idBase`, `value`, `activeValue` | Fades in. |
| **SegmentedControl** (`components/`) | `label`, `options`, `value`, `onChange` | Existing API kept; now `aria-pressed` + sliding thumb. Use for filters; use `Tabs` for views. |
| **Tooltip** | `content`, `side`, `delay`, `variant: label \| card` | Hover (350ms) / keyboard focus (instant); Esc, scroll, press dismiss; auto-flip. `card` = hover preview. Never the only route to information (no touch). |
| **Sheet / Drawer** | `open`, `onClose`, `side: responsive \| right \| left \| bottom \| center`, `size`, `title`, `description`, `footer`, `hideTitle` | Native `<dialog>`: focus trap + restore, Esc, backdrop click. `responsive` = right drawer ≥ 760px, bottom sheet below. `center` = modal dialog. |
| **VerseCard** | `reference`, `text` (`undefined` loading / `null` unavailable), `tone: default \| selected \| outgoing \| incoming`, `density`, `meta`, `actions`, `onClick`, `transitionName` | The core object: citation + scripture + margin rule. |
| **Skeleton** | `variant: text \| block \| circle`, `width`, `height`, `lines` | Shape it like what is loading. |
| **EmptyState** | `icon`, `title`, `description`, `action`, `size: inline \| page` | Always say what to do next. |
| **Field / Select** | `Field: label, hint, children(id)` · `Select: value, options, onChange, size` | Native select kept on purpose (best picker on phones). |
| **Kbd** | children | Shortcut hints. |
| **ToastProvider / useToast** | `toast(string \| {title, description, tone, duration, action})`, `dismiss(id)` | Mounted in `main.tsx`. Max 3, 4s default, `role=status` (`alert` for danger). Toasts sit under open dialogs — don't fire one from inside a Sheet. |
| **ThemeToggle** | `theme` (from `useTheme()`), `showLabel` | In the shell. Steps dark (default) → light → system; icon shows the current choice, the accessible name says what the next press does. |

Shared components restyled in place (same props): `PageHeader`, `StatCard`, `FilterPanel`,
`DatasetBadge`, `LoadingShimmer` (now `role="status"`), `ErrorState` (new optional `onRetry`;
shows a reload button otherwise).

Hooks: `useTheme` · `useMediaQuery` · `usePrefersReducedMotion` · `useHotkey(key, fn, {mod})` ·
`useInView` · `useCountUp` (reduced-motion aware, tweens from the current value) ·
`useSlidingIndicator`.

### Still to build in Sprint 2 (specified here, not implemented)

- **Command palette / verse search** — opened by `⌘K` / `/` (`useHotkey`) and by a search field in
  the shell. A `Sheet side="center"` with an input and a results list. Parses citations as typed
  ("rom 1 12", "1 jn 4:8", "ps23") into book → chapter → verse with inline completion; lists
  recent verses when empty; arrow keys move, Enter opens in Verse Explorer. This replaces three
  dropdowns as the primary way to choose a verse.
- **Chart frame** — `Card variant="sunken"` + header (title, one-line takeaway, controls) + body
  + footer (legend, source note). Every chart gets a text takeaway and a "view as table" toggle.
- **Graph tooltip** — the legacy `.graph-tooltip` follows the cursor; replace with a tooltip
  anchored to the mark (node centre / arc midpoint) using the `ui-tooltip` styles.

---

## 6. Motion

Motion explains a change of state: where something came from, what is now selected, what the new
verse is related to. It is never decoration, and never delays input.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--dur-instant` | 90ms | Press feedback |
| `--dur-fast` | 140ms | Hover, colour, tooltip |
| `--dur-base` | 220ms | Indicators, fades, small moves |
| `--dur-slow` | 360ms | Entrances, drawers, route change |
| `--dur-slower` | 560ms | Bars growing, paths drawing, graph re-layout |
| `--ease-standard` | `cubic-bezier(.2,0,0,1)` | Anything already on screen that moves |
| `--ease-enter` | `cubic-bezier(.05,.7,.1,1)` | Things arriving |
| `--ease-exit` | `cubic-bezier(.3,0,.8,.15)` | Things leaving (exits run at ~70% of the enter duration) |
| `--ease-spring` | `cubic-bezier(.34,1.36,.64,1)` | Small confirmations only (toast, toggle icon) |
| `--stagger` | 40ms | Per-item delay; cap a sequence at 12 items / ~450ms |

JS mirrors: `DURATION`, `EASING`, `motionDuration(ms)`, `easeOutCubic`, `withViewTransition(fn)`
in `lib/motion.ts`.

### Utilities (`styles/motion.css`)

`.anim-fade-in` · `.anim-rise-in` · `.anim-sink-in` · `.anim-scale-in` · `.anim-grow-x` (bars) ·
`.anim-draw` (SVG paths with `pathLength="1"`) · `.stagger` (children rise in sequence; set `--i`
or rely on nth-child) · `.transition-ui` · `.viz-mark` + `.is-dimmed` / `.is-focused` (focus +
context) · `.route-view` (page entrance). All entrances use `animation-fill-mode: backwards` so no
transform lingers (a lingering transform would break `position: fixed` descendants).

### Reduced motion

`prefers-reduced-motion: reduce` is honoured at three levels, all already wired:

1. **Tokens** — durations collapse (movement 1ms, fades 100ms), stagger 0, spring → standard.
2. **Keyframes** — every keyframe is redefined to opacity-only: nothing travels, scales or draws.
   Skeleton shimmer becomes a slow opacity pulse.
3. **JS** — `prefersReducedMotion()` / `usePrefersReducedMotion()` gate count-ups, force-layout
   animation, pan/zoom tweens and View Transitions. Under reduced motion: numbers appear at their
   final value, the graph renders settled (run the simulation to completion off-screen, then
   paint), zoom jumps.

Sprint 2 rule: any new JS-driven animation must take its duration from `motionDuration()`.

### Choreography

- **Route change** — outgoing page is removed; incoming `.route-view` fades up 8px over 360ms.
  Scroll resets instantly. The nav highlight slides to the new item (220ms) and the rubric notch
  slides in.
- **Page load** — skeleton shaped like the page → content fades in; stat tiles stagger 40ms; bars
  grow from zero (560ms) once in view (`useInView`).
- **Verse → verse** (the key moment) — see 7.2.
- **Overlays** — scrim fades 220ms; drawer slides from its edge 360ms `--ease-enter`; dialog
  scales from 0.96; bottom sheet rises. Exit is a fade.

---

## 7. Interaction patterns

### 7.1 Hover preview of a referenced verse

Anywhere a citation appears (`ReferenceChip`, list row, graph node, chord tooltip):

- Hover 350ms or keyboard focus → `Tooltip variant="card"` containing a compact `VerseCard`
  (citation + two clamped lines + direction/type meta). Text loads lazily; show the skeleton state
  (`text={undefined}`) meanwhile and cache per verse.
- Click / Enter → make that verse the studied verse (7.2).
- Touch has no hover: first tap selects and shows the same card in the detail panel / bottom
  sheet, with an explicit "Study this verse" button.
- Moving between adjacent chips within 300ms skips the delay (tooltip "warm" state) — implement
  with a shared timestamp in the page.

### 7.2 Moving between verses

The studied verse is one persistent object. When it changes:

1. The clicked neighbour's node/row is marked selected immediately (rubric ring, < 100ms).
2. `withViewTransition()` wraps the state update. Give the studied verse's `VerseCard`
   `transitionName="studied-verse"` and each neighbour `transitionName={`verse-${id}`}` so the
   clicked card morphs into the header position.
3. In the graph, nodes that persist keep their positions and glide to new targets (560ms,
   `--ease-standard`); the new centre moves to the middle; nodes that leave fade out, new ones
   fade in from the centre. Never restart the simulation from random positions — seed with the
   previous coordinates.
4. Push a history entry (`/verse/rom/1/12`) so Back returns to the previous verse, and keep a
   breadcrumb trail of the last ~8 verses above the graph ("Rom 1:12 → Heb 10:25 → …").

### 7.3 Focus + context in graphs

Hovering or focusing a mark puts `.is-focused` on it and its direct relations and `.is-dimmed`
(12% opacity) on everything else; labels of dimmed marks hide. Leaving restores after 120ms
(avoids flicker when crossing gaps). Selection is the same state, pinned. The legacy chord already
does a CSS-only version of this for ribbons; Sprint 2 extends it to arcs and to the verse graph.

### 7.4 Chord selection

Selecting a book (arc click, legend click, or keyboard):

- Its arc lifts outward 6px and gains a rubric outer stroke; its label goes ink + 600.
- Its ribbons rise to 0.9 opacity, re-coloured by direction (outgoing gilt / incoming blue);
  all other ribbons drop to 0.06. Partner arcs stay at full opacity, the rest dim to 0.3.
- Ribbons transition opacity over 220ms; when the matrix itself changes (filters), tween arc
  angles over 560ms instead of re-rendering.
- A summary panel replaces "All books": the book name, in/out totals, top 5 partner books as
  `ReferenceChip`-style rows — each opens the Verse Explorer filtered to that book pair.
- Click the centre or press Esc to clear. State lives in the URL (`/chord/psalms`).

### 7.5 Controls

- Filters apply immediately (no Apply button); the affected view cross-fades, counts tween.
- Every filter state is in the URL so a view can be shared.
- A filter that produces nothing shows an `EmptyState` with a one-click fix ("Lower minimum weight
  to 10"), never a blank chart.
- One reset control per view, shown only when something is filtered.

### 7.6 Keyboard

`⌘K` or `/` search · `g o / g b / g v / g k` go to Overview / Book graph / Verse / Blocks ·
`[` `]` previous / next verse · `←→↑↓` move between graph neighbours · `Enter` study focused verse ·
`Esc` clear selection, close overlay · `+ − 0` zoom. Show them in a `?` sheet using `<Kbd>`.

---

## 8. Per-page redesign notes (Sprint 2 briefs)

General: rename nav items to what a student does — **Overview → Explore**, **Book Graph → Books**,
**Verse Explorer → Verses**, **Blocks → Clusters**, **About**. Put the verse search in the shell so
it is one keystroke away on every page. Page files may be rewritten freely; delete legacy rules
from `styles/pages.css` as you stop using them.

### 8.1 Overview (`pages/OverviewPage.tsx`)

Goal: a front door that gets someone into a verse within one click, not a wall of ten bar lists.

- **Hero**: `t-display` title ("Follow the references"), one-sentence description, and the verse
  search field as the primary action. Below it, three or four "start here" `VerseCard`s — the most
  cross-referenced verses — each opening the Verse Explorer.
- **Stats**: keep the four `StatCard`s but as a single quiet row; add the takeaway as the detail
  line ("81% are marginal cross references").
- **Rankings**: collapse the two book rankings into one panel with a pill `Tabs` (Citing / Cited).
  Rows become real navigation: click a book → Books page with it selected. Bars use `--viz-bar`;
  show the value label at the bar end; keep 8–10 rows with "Show all 66" expanding in place
  (no modal).
- **Testament flow**: replace four bars labelled `NT->OT` with a 2×2 matrix or a small two-column
  flow (Sankey-style) labelled "Hebrew-Aramaic Scriptures" / "Christian Greek Scriptures", with
  one sentence stating the finding.
- **High-density verses**: render as `ReferenceChip`s / compact `VerseCard`s with hover preview;
  click opens the verse.
- Replace `DetailModal` with `Sheet` (it currently has no focus trap or Esc handling).
- Motion: tiles stagger; bars `.anim-grow-x` when in view.
- Mobile: single column, hero search first, rankings as tabs.

### 8.2 Book Graph (`pages/ChordPage.tsx`)

Goal: make the chord diagram legible and explorable; it is the signature image of the product.

- Colour arcs by **canon section** (`--canon-*`, seven groups) with thin gaps between sections and
  section names on an outer ring. Replace `bookColor()`'s parity logic with a section lookup.
- Labels: abbreviations (Ge, Ex, … Re) on the arc at ≥ 11px rendered size; full name in the
  tooltip and the selection panel. Drop leader lines.
- Implement 7.3 and 7.4 (focus + context, animated selection, URL state). Arcs get
  `tabIndex`/`role="button"`/`aria-label` and respond to Enter.
- Filters: move into the chart frame header as compact controls; "Minimum weight" becomes a
  labelled slider with the count of visible links updating live; remove the duplicate reset.
- Book list: group by section with sticky headings, add a filter-as-you-type field, show a mini
  bar behind each count. On phones it becomes a `Sheet side="bottom"` opened from a "Books" button.
- Provide a **matrix (heatmap) alternative** behind a `Tabs` switch (Chord / Matrix): 66×66 grid,
  `--accent` sequential ramp, section dividers. It is the accessible, phone-friendly form of the
  same data and the fallback under 600px width.
- Motion: on load, arcs fade in then ribbons `.anim-draw` by section (stagger 40ms, total ≤ 600ms).

### 8.3 Verse Explorer (`pages/VersePage.tsx`)

Goal: the study desk. Verse on top, references around it, everything one click from the next verse.

- **Layout** (desktop): left — the studied verse as a large `VerseCard tone="selected"`
  (`transitionName="studied-verse"`) with prev/next verse buttons and the breadcrumb trail;
  centre — the graph in a chart frame; right — a reference column: `Tabs` (All / Cited by this
  verse / Citing this verse) over a scrollable list of `VerseCard density="compact"` with full
  text, grouped by book. List and graph are two views of the same selection: hovering either
  highlights the other (7.3).
- **Choosing a verse**: the command palette is primary. Keep Book / Chapter / Verse as a compact
  breadcrumb-style picker ("Romans › 1 › 12", each segment a popover grid of numbers — far faster
  than three long selects).
- **Filters**: direction and reference type become pill `Tabs` in the frame header; "Layers"
  becomes a "Depth" stepper (1–3) with a hint about what it means.
- **Graph**: radial layout — outgoing on the right, incoming on the left — so position encodes
  direction as well as colour; arrowheads kept. Label halo (already in CSS), collision-avoided
  labels, node size by degree. Second-layer nodes are smaller and `--ink-3` until hovered.
  Click = select + preview; double-click or Enter = study that verse (7.2). Nodes keyboard
  reachable.
- **Detail**: the current "Connection detail" panel merges into the reference column; on phones it
  is a `Sheet side="bottom"` that opens on node tap with "Study this verse".
- **Mobile**: verse card, then the reference *list* first (it is the more usable form at 390px),
  with the graph behind a "Graph" tab. Filters in a sheet behind one "Filters" button showing the
  active count.
- **States**: loading neighbourhood → skeleton rows + faded previous graph (do not blank it); a
  verse with no references → `EmptyState` suggesting adjacent verses; dataset without text →
  `VerseCard text={null}`.
- Deep links: `/verse/:book/:chapter/:verse?dir=&kind=&depth=`.

### 8.4 Relationship Blocks (`pages/RelationshipBlocksPage.tsx`)

Goal: explain a subtle idea (connected components) with one picture and plain words.

- Rename to **Clusters**; lead with the finding as a sentence: "88% of mapped verses belong to one
  connected web. The rest form 3,595 small islands."
- Replace the 14-bar chart with a **proportional strip** (one bar = all verses: the giant
  component, small clusters, isolated verses) plus a histogram of cluster sizes on a log axis.
- "Largest blocks" becomes a list of cards for the *interesting* clusters (skip #1): member verses
  as `ReferenceChip`s with hover preview, a tiny node-link thumbnail, and "Open in Verses".
- The big component gets its own summary (top books as chips) rather than being row 1 of a table.

### 8.5 About (`pages/AboutPage.tsx`)

Goal: trust and orientation. Readable prose, not three metadata cards.

- A short reading-width article (`--measure`): what BibliaMap is, where the data comes from, what
  "cross reference" vs "study note reference" means, what is and is not included, how direction is
  defined. Serif lead paragraph, sans body.
- Dataset facts as a compact definition list beside it; a colour/legend key that documents the
  viz conventions; the keyboard shortcut table; links to source and licence notes.
- Move build/implementation detail ("split JSON", "precomputed matrices") to a collapsed
  "How it's built" section.

### 8.6 Shell (done in Sprint 1; remaining work)

Done: sidebar with sliding highlight and rubric notch, top bar + bottom tab bar under 1100px,
theme toggle, skip link, `aria-current`, per-route titles, route entrance animation.
Remaining: verse search in the shell, friendlier dataset names in the switcher (it shows the
publication symbol today), nav relabelling, `?` shortcuts sheet.

---

## 9. Accessibility

- **Contrast** — text ≥ 4.5:1, large text and meaningful marks ≥ 3:1, in both themes (verified
  numerically for the token pairs).
- **Focus** — one treatment everywhere: 2px `--accent` outline, 2px offset, on `:focus-visible`
  only. Never remove it; if a component clips it, give the component padding.
- **Keyboard** — everything reachable and operable; overlays trap and restore focus (native
  dialog); Esc closes the top-most thing; skip link to main content.
- **Semantics** — one `h1` per page; nav has `aria-current="page"`; toggles use `aria-pressed`;
  tabs use the tabs pattern; loading regions use `role="status"`; errors use `role="alert"`.
- **Colour independence** — direction always has an arrow/label; selection always has a ring or
  rule; chart series have direct labels or a legend with shapes.
- **Charts** — each SVG has a text alternative stating the takeaway and an equivalent table/list
  view; interactive marks are focusable with descriptive labels.
- **Targets** — 44×44px minimum under 760px; 30px minimum for dense desktop controls.
- **Motion** — section 6. **Zoom** — layouts hold at 200% and at 320px width.
- **Language** — dataset content may be non-English: set `lang` on scripture containers from the
  dataset's language so hyphenation and screen-reader voice are right.

---

## 10. Rules for Sprint 2

1. Colours, sizes, radii, shadows and durations come from tokens. No hex values, no raw
   `px` font sizes, no new shadows in page code.
2. Reach for a primitive before writing CSS. If a primitive is missing a variant, add the variant
   to the primitive (and to `/styleguide`), not a one-off.
3. Verse text is always a `VerseCard` or `.t-scripture`.
4. Rubric means *location/selection* only. Gilt means *highlight/outgoing* only. Lapis means
   *interactive* only.
5. Every async view has four designed states: loading (skeleton), empty, error (with retry),
   ready.
6. Every new animation uses the motion tokens and has a reduced-motion behaviour.
7. Check both themes and 390px before calling a page done.
8. Remove what you replace: delete unused legacy classes from `styles/pages.css`.
