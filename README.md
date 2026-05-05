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
  --compact
```

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
