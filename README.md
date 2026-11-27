# BibliaMap

BibliaMap is a static Bible reference graph explorer. A Rust build-time extractor reads known `.jwpub` assets and writes compact JSON into `frontend/public/generated/<dataset>/`; the React frontend consumes those generated files without parsing `.jwpub` archives in the browser.

## Local Setup

Place the source asset at:

```bash
assets/nwtsty_E.jwpub
```

The repository keeps `.jwpub` files out of Git because they are large source assets and may require separate rights review.

Generate data:

```bash
cargo run -p bibliamap-extractor -- \
  --input assets/nwtsty_E.jwpub \
  --dataset nwtsty \
  --output frontend/public/generated/nwtsty \
  --compact \
  --include-text
```

Generate every known asset in `assets/`:

```bash
./scripts/generate_all_datasets.sh
```

Regenerate only specific assets (keeps the other entries in `datasets.json`):

```bash
./scripts/generate_all_datasets.sh --only assets/nwtsty_E.jwpub --only assets/nwtsty_I.jwpub
```

Generated datasets include verse text when the public chapter pages can be fetched for the publication. Fetching is slow and rate-limited by jw.org (2 concurrent requests, a polite delay, timeouts, retries with exponential backoff and jitter), so `--verse-text-from <dir>` reuses `<dir>/verse-text/*.json` for every chapter whose verse ids and labels still match and fetches only the rest; `--verse-text-no-fetch` never contacts jw.org. The script reuses each dataset's existing verse text by default; set `BIBLIAMAP_REFETCH_TEXT=1` to fetch everything again or `BIBLIAMAP_NO_FETCH=1` to stay offline.

Optional files are listed in each `manifest.json` under `features` (absent on older datasets): `search-index` (`search-index.json`), `verse-degree` (`stats.verse-degree.json`), `chapter-matrices` (`matrices/chapter/*`), `components` (`stats.components.json`), `study-note-text` (`study-notes/*`) and `footnote-text` (`footnotes/*`). Set `BIBLIAMAP_ASSETS_DIR` to read the `.jwpub` files from another directory. The script also rebuilds cross-edition reference diffs in `frontend/public/generated/compare/` with:

```bash
cargo run -p bibliamap-extractor --bin bibliamap-compare -- \
  --generated frontend/public/generated --pair nwt:rbi8
```

### Updating Source Assets

`scripts/fetch_latest_assets.sh` checks the jw.org pub-media API (`https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS`) for the known publications (`nwtsty` English and Italian, `nwt` English, `Rbi8` English) and compares the published MD5 checksum with the local `assets/*.jwpub`. Only changed files are downloaded: each goes to a temporary file in `assets/`, is verified against the CDN checksum and is then atomically moved into place.

```bash
./scripts/fetch_latest_assets.sh              # download changed assets
./scripts/fetch_latest_assets.sh --dry-run    # only report what is out of date
./scripts/fetch_latest_assets.sh --regenerate # download, then regenerate changed datasets
```

It requires `curl`, `python3` and `md5sum`. Commit the regenerated `frontend/public/generated/` output afterwards; the `.jwpub` files stay untracked.

Run checks:

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings

cd frontend
npm ci
npm test
npm run build
```

Run the frontend:

```bash
cd frontend
npm run dev
```

## Static Deployment

The production container is a static Nginx frontend. Local Docker verification:

```bash
docker compose up --build
```

Then open `http://localhost:8080`.

The deployed domain is `bibliamap.gabudev.cloud`.
