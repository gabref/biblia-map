# Open Graph image generator

Builds the share cards in the dark "Reference Column" design:

- `frontend/public/og-image.png` — 1200×630 (Open Graph / Twitter `summary_large_image`)
- `frontend/public/og-image-square.png` — 600×600 (WhatsApp and other square previews)

The chord diagram is drawn from the real book-to-book reference counts, arcs coloured by canon
section; the mark is `frontend/public/bibliamap-icon.svg`, inlined.

```bash
# from the repo root
(cd frontend && npm ci)        # fonts
scripts/og-image/run.sh
```

Then **bump `?v=`** on the `og:image` / `twitter:image` URLs in `frontend/index.html` — WhatsApp and
Facebook cache previews by URL.

## Pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `gen.py` | Reads the matrix and the icon, writes `wide.html` and `square.html` (self-contained, fonts by `file://` URL) into a work directory. Standard library only. |
| 2 | `shot.mjs` | Screenshots both pages with headless Chromium at 1× into `wide.png` / `square.png`. |
| 3 | `quant.py` | Quantises to a 256-colour palette (Floyd–Steinberg) and writes the optimised PNGs into `frontend/public/`. Cuts the files to roughly a quarter of the full-colour size. |

`run.sh` runs the three steps with repo-relative paths.

## Requirements

- **Python 3** with **Pillow** (`pip install Pillow`) — for `quant.py`. `gen.py` needs no packages.
- **Node 20+** and **Playwright with Chromium** — for `shot.mjs`. Playwright is not a dependency of
  the app; install it next to the scripts (ignored by git) or point `PLAYWRIGHT_FROM` at a
  directory that has it:

  ```bash
  npm install --prefix scripts --no-save playwright && npx --prefix scripts playwright install chromium
  # or
  PLAYWRIGHT_FROM=~/tools/pw scripts/og-image/run.sh
  ```

- **Fonts** from `frontend/node_modules/@fontsource-variable/{literata,instrument-sans,jetbrains-mono}`
  — run `npm ci` in `frontend/` first.
- **Data**: `frontend/public/generated/<dataset>/matrices/book.combined.json` (committed).

## Options (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PYTHON` | `python3` | Interpreter with Pillow, e.g. `PYTHON=.venv/bin/python` |
| `DATASET` | `nwtsty` | Which dataset's book matrix feeds the chord diagram |
| `WORK` | `mktemp -d` | Where the intermediate HTML and full-colour PNGs go |
| `PLAYWRIGHT_FROM` | — | Directory to resolve `playwright` from |

Colours in `gen.py` (`T` and `SECTIONS`) are the dark-theme values of
`frontend/src/styles/tokens.css`; update them together.
