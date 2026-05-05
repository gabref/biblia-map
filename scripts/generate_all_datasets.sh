#!/usr/bin/env bash
set -euo pipefail

declare -A DATASET_IDS=(
   ["assets/Rbi8_E.jwpub"]="rbi8"
   ["assets/nwt_E.jwpub"]="nwt"
   ["assets/nwtsty_E.jwpub"]="nwtsty"
   ["assets/nwtsty_I.jwpub"]="nwtsty-i"
)

rm -f frontend/public/generated/datasets.json

for asset in "${!DATASET_IDS[@]}"; do
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
