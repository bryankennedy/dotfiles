#!/usr/bin/env bash
# Spotlight: Option+Space (symbolic hotkey id 64). Alfred: Cmd+Space.
# Intended to run during darwin-rebuild postActivation (often as root); writes use the target user.
set -euo pipefail

TARGET_USER="${ALFRED_SPOTLIGHT_USER:-bk}"
USER_HOME="$(dscl . -read "/Users/${TARGET_USER}" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[[ -z "${USER_HOME}" ]] && USER_HOME="/Users/${TARGET_USER}"

runuser() {
  if [[ "$(id -un)" == "${TARGET_USER}" ]]; then
    env "$@"
  else
    /usr/bin/sudo -u "${TARGET_USER}" env "$@"
  fi
}

# --- Spotlight: Option + Space (modifier 524288), key code 49 (space) ---
runuser USER_HOME="${USER_HOME}" /usr/bin/python3 <<'PY'
import os
import plistlib

home = os.environ["USER_HOME"]
path = os.path.join(home, "Library/Preferences/com.apple.symbolichotkeys.plist")

data = {}
if os.path.isfile(path):
    with open(path, "rb") as f:
        data = plistlib.load(f)

ash = data.setdefault("AppleSymbolicHotKeys", {})
ash["64"] = {
    "enabled": True,
    "value": {
        "parameters": [65535, 49, 524288],
        "type": "standard",
    },
}

with open(path, "wb") as f:
    plistlib.dump(data, f)
PY

# --- Alfred: Cmd + Space (modifier 1048576) ---
while IFS= read -r -d '' plist; do
  runuser ALFRED_PLIST="${plist}" /usr/bin/python3 <<'PY'
import os
import plistlib

path = os.environ["ALFRED_PLIST"]
with open(path, "rb") as f:
    data = plistlib.load(f)
d = data.setdefault("default", {})
d["key"] = 49
d["mod"] = 1048576
d["string"] = " "
with open(path, "wb") as f:
    plistlib.dump(data, f)
PY
done < <(find "${USER_HOME}/Library/Application Support/Alfred/Alfred.alfredpreferences/preferences/local" \
  -path '*/hotkey/prefs.plist' -print0 2>/dev/null || true)

# Reload keyboard shortcut prefs for Spotlight
runuser /System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u

# Alfred reads its plist at launch (only if the app is installed and was running)
if [[ -d /Applications/Alfred.app ]] && pgrep -x Alfred >/dev/null 2>&1; then
  runuser /usr/bin/killall Alfred 2>/dev/null || true
  sleep 0.3
  runuser /usr/bin/open -a Alfred || true
fi
