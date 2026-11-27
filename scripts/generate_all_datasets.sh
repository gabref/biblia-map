#!/usr/bin/env bash
# Regenerate datasets from known assets in assets/.
#
# Usage: ./scripts/generate_all_datasets.sh [--only assets/<file>.jwpub ...]
#   Without --only, every known asset present is regenerated and
#   frontend/public/generated/datasets.json is rebuilt from scratch.
#   With --only, just the given assets are regenerated; datasets.json keeps
#   the entries of the other datasets (the extractor upserts its own entry).
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

for asset in "${selected[@]}"; do
   if [[ ! -f "$asset" ]]; then
      continue
   fi

   dataset_id="${DATASET_IDS[$asset]}"
   args=(
      cargo run -p bibliamap-extractor --
      --input "$asset"
      --dataset "$dataset_id"
      --output "frontend/public/generated/$dataset_id"
      --compact
      --include-text
   )

   "${args[@]}"
done
