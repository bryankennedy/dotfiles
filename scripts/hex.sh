#!/usr/bin/env zsh
# Configure Hex hotkey via macOS defaults system.
# Run this after installing Hex. Hex must be restarted for changes to take effect.
#
# Trigger key: F15 (keyCode 113, no modifiers)
# Paired with karabiner rule: Middle mouse button (button3) -> F15

set -e

PLIST=~/Library/Containers/com.kitlangton.Hex/Data/Library/Preferences/com.kitlangton.Hex.plist

if [[ ! -f "$PLIST" ]]; then
  echo "Error: Hex plist not found at $PLIST"
  echo "Make sure Hex has been launched at least once before running this script."
  exit 1
fi

echo "Configuring Hex..."

# defaults write stores values as strings; Hex requires integers.
# Use PlistBuddy to write properly typed integer values.
/usr/libexec/PlistBuddy -c "Delete :globalHotkey" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :globalHotkey dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :globalHotkey:keyCode integer 113" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :globalHotkey:modifierFlags integer 0" "$PLIST"

# Flush the preferences cache
killall cfprefsd 2>/dev/null || true

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
