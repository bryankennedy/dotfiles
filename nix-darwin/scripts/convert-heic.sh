#!/usr/bin/env bash
# convert-heic.sh
# Watches for .heic/.HEIC files in a folder (default: $HOME/Downloads) and
# converts each one to a .jpg using macOS's built-in `sips` tool. Originals
# are left in place unless DELETE_ORIGINAL=1 is set.
#
# Invoked by launchd (see launchd.user.agents.heic-watch in flake.nix) on
# every WatchPaths change to the target directory.
set -uo pipefail

WATCH_DIR="${1:-$HOME/Downloads}"
DELETE_ORIGINAL="${DELETE_ORIGINAL:-0}"
LOG_FILE="${LOG_FILE:-$HOME/Library/Logs/heic-watch.log}"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

shopt -s nullglob nocaseglob

for f in "$WATCH_DIR"/*.heic; do
  base="${f%.*}"
  jpg="${base}.jpg"

  if [ -f "$jpg" ]; then
    continue
  fi

  # Make sure the file isn't still mid-transfer (AirDrop writes incrementally).
  size1=$(stat -f%z "$f" 2>/dev/null)
  sleep 1
  size2=$(stat -f%z "$f" 2>/dev/null)
  if [ "$size1" != "$size2" ] || [ -z "$size1" ]; then
    log "Skipping $f (still being written)"
    continue
  fi

  if sips -s format jpeg "$f" --out "$jpg" >/dev/null 2>&1; then
    log "Converted $f -> $jpg"
    if [ "$DELETE_ORIGINAL" = "1" ]; then
      rm "$f"
      log "Deleted original $f"
    fi
  else
    log "FAILED to convert $f"
  fi
done
