#!/usr/bin/env bash
# Regenerate datasets from known assets in assets/.
#
# Usage: ./scripts/generate_all_datasets.sh [--only assets/<file>.jwpub ...]
#   Without --only, every known asset present is regenerated and
#   frontend/public/generated/datasets.json is rebuilt from scratch.
#   With --only, just the given assets are regenerated; datasets.json keeps
#   the entries of the other datasets (the extractor upserts its own entry).
#   Afterwards the cross-edition diffs in frontend/public/generated/compare/ are rebuilt for
#   every pair in COMPARE_PAIRS whose datasets both exist.
#
# Environment:
#   BIBLIAMAP_ASSETS_DIR  directory holding the .jwpub files (default: assets). Asset names
#                         passed to --only keep the assets/<file>.jwpub form.
#   BIBLIAMAP_REFETCH_TEXT=1  fetch all verse text from jw.org again. By default the verse text
#                         already in frontend/public/generated/<dataset>/verse-text is reused for
#                         every chapter whose verse ids and labels still match, and only the other
#                         chapters are fetched.
#   BIBLIAMAP_NO_FETCH=1  never contact jw.org (chapters without stored text stay without text).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

declare -A DATASET_IDS=(
   ["assets/Rbi8_E.jwpub"]="rbi8"
   ["assets/nwt_E.jwpub"]="nwt"
   ["assets/nwtsty_E.jwpub"]="nwtsty"
   ["assets/nwtsty_I.jwpub"]="nwtsty-i"
)

selected=()
while [[ $# -gt 0 ]]; do
   case "$1" in
      --only)
         shift
         [[ $# -gt 0 ]] || {
            echo "--only requires an asset path" >&2
            exit 2
         }
         if [[ -z "${DATASET_IDS[$1]+x}" ]]; then
            echo "unknown asset: $1 (known: ${!DATASET_IDS[*]})" >&2
            exit 2
         fi
         selected+=("$1")
         ;;
      *)
         echo "unknown argument: $1" >&2
         exit 2
         ;;
   esac
   shift
done

if [[ ${#selected[@]} -eq 0 ]]; then
   selected=("${!DATASET_IDS[@]}")
   rm -f frontend/public/generated/datasets.json
fi

assets_dir="${BIBLIAMAP_ASSETS_DIR:-assets}"

for asset in "${selected[@]}"; do
   asset_file="$assets_dir/$(basename "$asset")"
   if [[ ! -f "$asset_file" ]]; then
      continue
   fi

   dataset_id="${DATASET_IDS[$asset]}"
   args=(
      cargo run -p bibliamap-extractor --
      --input "$asset_file"
      --dataset "$dataset_id"
      --output "frontend/public/generated/$dataset_id"
      --compact
      --include-text
   )
   if [[ "${BIBLIAMAP_REFETCH_TEXT:-0}" != 1 && -d "frontend/public/generated/$dataset_id/verse-text" ]]; then
      args+=(--verse-text-from "frontend/public/generated/$dataset_id")
   fi
   if [[ "${BIBLIAMAP_NO_FETCH:-0}" == 1 ]]; then
      args+=(--verse-text-no-fetch)
   fi

   "${args[@]}"
done

COMPARE_PAIRS=("nwt:nwtsty" "nwt:rbi8" "nwtsty:rbi8" "nwtsty:nwtsty-i")
compare_args=()
for pair in "${COMPARE_PAIRS[@]}"; do
   a="${pair%%:*}"
   b="${pair##*:}"
   if [[ -f "frontend/public/generated/$a/edges/crossrefs.compact.json" &&
      -f "frontend/public/generated/$b/edges/crossrefs.compact.json" ]]; then
      compare_args+=(--pair "$pair")
   fi
done

if [[ ${#compare_args[@]} -gt 0 ]]; then
   cargo run -p bibliamap-extractor --bin bibliamap-compare -- \
      --generated frontend/public/generated \
      "${compare_args[@]}"
fi
