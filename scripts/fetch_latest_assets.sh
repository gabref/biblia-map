#!/usr/bin/env bash
# Fetch the latest .jwpub assets from the jw.org CDN into assets/.
#
# For each known publication, query the pub-media API, compare the published
# MD5 checksum with the local file and download only when it differs. Downloads
# go to a temporary file in assets/, are verified against the checksum and then
# atomically moved into place.
#
# Usage: ./scripts/fetch_latest_assets.sh [--regenerate] [--dry-run]
#   --regenerate  regenerate generated datasets for assets that changed
#   --dry-run     only report which assets are out of date
set -euo pipefail

API_URL="https://b.jw-cdn.org/apis/pub-media/GETPUBMEDIALINKS"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/assets"

# pub symbol | language | local file | dataset id
ASSETS=(
   "nwtsty|E|nwtsty_E.jwpub|nwtsty"
   "nwtsty|I|nwtsty_I.jwpub|nwtsty-i"
   "nwt|E|nwt_E.jwpub|nwt"
   "Rbi8|E|Rbi8_E.jwpub|rbi8"
)

regenerate=false
dry_run=false
for arg in "$@"; do
   case "$arg" in
      --regenerate) regenerate=true ;;
      --dry-run) dry_run=true ;;
      -h | --help)
         sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
         exit 0
         ;;
      *)
         echo "unknown argument: $arg" >&2
         exit 2
         ;;
   esac
done

for tool in curl python3 md5sum; do
   command -v "$tool" >/dev/null || {
      echo "missing required tool: $tool" >&2
      exit 1
   }
done

mkdir -p "$ASSETS_DIR"

tmp_file=""
cleanup() {
   if [[ -n "$tmp_file" && -f "$tmp_file" ]]; then
      rm -f "$tmp_file"
   fi
}
trap cleanup EXIT

changed_datasets=()
failures=0

for entry in "${ASSETS[@]}"; do
   IFS='|' read -r pub lang file_name dataset_id <<<"$entry"
   local_path="$ASSETS_DIR/$file_name"

   if ! metadata_json="$(curl -fsSL --retry 3 \
      "$API_URL?pub=$pub&langwritten=$lang&fileformat=JWPUB&output=json")"; then
      echo "[$file_name] failed to query CDN metadata" >&2
      failures=$((failures + 1))
      continue
   fi

   # Prints: url<TAB>checksum<TAB>modifiedDatetime
   if ! metadata="$(
      python3 -I -c '
import json, sys
lang = sys.argv[1]
data = json.loads(sys.stdin.read())
file = data["files"][lang]["JWPUB"][0]["file"]
print(file["url"], file["checksum"], file.get("modifiedDatetime", ""), sep="\t")
' "$lang" <<<"$metadata_json"
   )"; then
      echo "[$file_name] unexpected CDN metadata format" >&2
      failures=$((failures + 1))
      continue
   fi
   IFS=$'\t' read -r url remote_md5 modified <<<"$metadata"

   local_md5=""
   if [[ -f "$local_path" ]]; then
      local_md5="$(md5sum "$local_path" | cut -d' ' -f1)"
   fi

   if [[ "$local_md5" == "$remote_md5" ]]; then
      echo "[$file_name] up to date (md5 $remote_md5, CDN modified $modified)"
      continue
   fi

   echo "[$file_name] update available: local ${local_md5:-<missing>} -> CDN $remote_md5 (modified $modified)"
   if [[ "$dry_run" == true ]]; then
      continue
   fi

   tmp_file="$(mktemp "$ASSETS_DIR/.${file_name}.XXXXXX")"
   if ! curl -fSL --progress-bar --retry 3 -o "$tmp_file" "$url"; then
      echo "[$file_name] download failed" >&2
      rm -f "$tmp_file"
      tmp_file=""
      failures=$((failures + 1))
      continue
   fi

   downloaded_md5="$(md5sum "$tmp_file" | cut -d' ' -f1)"
   if [[ "$downloaded_md5" != "$remote_md5" ]]; then
      echo "[$file_name] checksum mismatch: expected $remote_md5, got $downloaded_md5" >&2
      rm -f "$tmp_file"
      tmp_file=""
      failures=$((failures + 1))
      continue
   fi

   chmod 644 "$tmp_file"
   mv -f "$tmp_file" "$local_path"
   tmp_file=""
   echo "[$file_name] updated"
   changed_datasets+=("$file_name|$dataset_id")
done

if [[ "$regenerate" == true && ${#changed_datasets[@]} -gt 0 ]]; then
   cd "$REPO_ROOT"
   for changed in "${changed_datasets[@]}"; do
      IFS='|' read -r file_name dataset_id <<<"$changed"
      echo "Regenerating dataset $dataset_id from assets/$file_name"
      ./scripts/generate_all_datasets.sh --only "assets/$file_name"
   done
fi

if [[ $failures -gt 0 ]]; then
   echo "$failures asset(s) failed" >&2
   exit 1
fi
