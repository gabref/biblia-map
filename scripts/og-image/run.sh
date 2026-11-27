#!/usr/bin/env bash
# Regenerate frontend/public/og-image.png (1200x630) and og-image-square.png (600x600).
# Requirements and options: see README.md in this directory.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
DATASET="${DATASET:-nwtsty}"
WORK="${WORK:-$(mktemp -d)}"
PUBLIC="$ROOT/frontend/public"

"$PYTHON" "$HERE/gen.py" \
   "$PUBLIC/generated/$DATASET/matrices/book.combined.json" \
   "$PUBLIC/bibliamap-icon.svg" \
   "$ROOT/frontend/node_modules" \
   "$WORK"
node "$HERE/shot.mjs" "$WORK"
"$PYTHON" "$HERE/quant.py" \
   "$WORK/wide.png" "$PUBLIC/og-image.png" \
   "$WORK/square.png" "$PUBLIC/og-image-square.png"
ls -l "$PUBLIC/og-image.png" "$PUBLIC/og-image-square.png"
echo "Intermediate HTML and full-colour PNGs: $WORK"
