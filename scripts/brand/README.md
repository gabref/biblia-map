# Brand asset build

Renders the icon set and the brand sheet from the hand-authored SVGs. Design notes:
`docs/design/brand/README.md`.

```bash
# from the repo root
(cd frontend && npm ci)                    # fonts for the brand sheet
node scripts/brand/build.mjs               # icons + docs/design/brand/brand-sheet.png
node scripts/brand/build.mjs --icons       # icons only
node scripts/brand/build.mjs --sheet       # brand sheet only
python3 scripts/brand/wordmark.py          # optional: rebuild the outlined lockup SVGs
```

## What it reads and writes

| Source | Output |
| --- | --- |
| `frontend/public/bibliamap-icon.svg` | `bibliamap-icon-192.png`, `bibliamap-icon-512.png`, `bibliamap-icon-maskable-512.png`, `apple-touch-icon.png` (all in `frontend/public/`) |
| `frontend/public/favicon.svg` | `frontend/public/favicon.ico` (16, 32, 48; PNG-encoded entries) |
| the above + lockups + `og-image*.png` | `docs/design/brand/brand-sheet.png` |
| `bibliamap-icon.svg` + Literata from `frontend/node_modules` | `docs/design/brand/bibliamap-lockup-{dark,light}.svg` (`wordmark.py`) |

`bibliamap-icon.svg` must keep its `<g id="tile">` and `<g id="glyph">` groups: the maskable and
apple-touch icons are the glyph on a full-bleed square, and the lockups reuse both groups.

The brand sheet embeds the share cards, so run `scripts/og-image/run.sh` first if the mark changed,
then `build.mjs --sheet`.

## Requirements

- **Node 20+** and **Playwright with Chromium**. Playwright is deliberately not a dependency of the
  app. Either install it next to the scripts (ignored by git):

  ```bash
  npm install --prefix scripts --no-save playwright && npx --prefix scripts playwright install chromium
  ```

  or point `PLAYWRIGHT_FROM` at any directory where it is already installed:

  ```bash
  PLAYWRIGHT_FROM=~/tools/pw node scripts/brand/build.mjs
  ```

- **Fonts**: Literata, Instrument Sans and JetBrains Mono are read from
  `frontend/node_modules/@fontsource-variable/` — run `npm ci` in `frontend/` first.
- **`wordmark.py` only**: Python 3 with `fonttools` and `brotli` (`pip install fonttools brotli`).
  Only needed when the wordmark setting or the mark changes.
