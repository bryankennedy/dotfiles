#!/usr/bin/env zsh
# Set the Hex dictation hotkey to F17 through Hex's own CLI.
# Run it after a Hex install or a settings reset.
#
# F17 pairs with the three Karabiner rules in
# karabiner/.config/karabiner/karabiner.json: the middle mouse button, the fn
# key, and the Varmilo Pause key (and F15) each send F17. macOS binds F15 to
# brightness up and consumes it before Hex sees it, so F15 itself cannot be
# the trigger (docs/decisions/DOT-39.md).
#
# Hex 3 (cask anomalyco/tap/hex) ships the CLI inside the app bundle. With Hex
# running, `settings set` changes the setting in the app. With Hex stopped,
# `settings apply` writes settings.json directly.

set -e

HEX=/Applications/Hex.app/Contents/MacOS/hex
KEY=f17

if [[ ! -x "$HEX" ]]; then
  echo "Error: Hex CLI not found at $HEX" >&2
  echo "Install Hex first: brew install --cask anomalyco/tap/hex" >&2
  exit 1
fi

if "$HEX" status >/dev/null 2>&1; then
  "$HEX" settings set dictation_hotkey "$KEY"
  echo "Hex dictation hotkey: $("$HEX" settings get dictation_hotkey)"
else
  printf '{"dictation_hotkey":"%s"}\n' "$KEY" | "$HEX" settings apply -
  echo "Hex is not running. It reads the hotkey ($KEY) at the next launch."
fi
