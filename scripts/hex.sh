#!/usr/bin/env zsh
# Configure Hex hotkey via macOS defaults system.
# Run this after installing Hex. Hex must be restarted for changes to take effect.
#
# Trigger key: F19 (keyCode 80, no modifiers)
# Paired with karabiner rule: Middle mouse button (button3) -> F19

set -e

echo "Configuring Hex..."

defaults write com.kitlangton.Hex globalHotkey -dict keyCode 80 modifierFlags 0

if pgrep -x Hex &>/dev/null; then
  echo "Restarting Hex..."
  killall Hex
  sleep 0.5
  open -a Hex
  echo "Hex restarted."
else
  echo "Hex is not running. Launch it to apply the configuration."
fi

echo "Done."
