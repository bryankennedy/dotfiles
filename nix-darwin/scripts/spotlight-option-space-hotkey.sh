#!/usr/bin/env bash
# Move macOS Spotlight from Cmd+Space to Option+Space via com.apple.symbolichotkeys.
# Scans AppleSymbolicHotKeys for Space + Command (key 49, modifier 1048576) and rewrites
# to Option+Space; also forces id 64 (common Spotlight slot on many macOS versions).
#
# Intended for darwin-rebuild postActivation (often as root); writes run as the target user.
set -euo pipefail

TARGET_USER="${SPOTLIGHT_HOTKEY_USER:-bk}"
USER_HOME="$(dscl . -read "/Users/${TARGET_USER}" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
[[ -z "${USER_HOME}" ]] && USER_HOME="/Users/${TARGET_USER}"

runuser() {
  if [[ "$(id -un)" == "${TARGET_USER}" ]]; then
    env "$@"
  else
    /usr/bin/sudo -u "${TARGET_USER}" env "$@"
  fi
}

runuser USER_HOME="${USER_HOME}" /usr/bin/python3 <<'PY'
import os
import plistlib
import subprocess
import sys

CMD = 1048576
OPT = 524288
SPACE_KEY = 49

home = os.environ["USER_HOME"]
path = os.path.join(home, "Library/Preferences/com.apple.symbolichotkeys.plist")

data = {}
if os.path.isfile(path):
    with open(path, "rb") as f:
        data = plistlib.load(f)

ash = data.setdefault("AppleSymbolicHotKeys", {})
changed = []

def is_cmd_space(params):
    if not isinstance(params, (list, tuple)) or len(params) != 3:
        return False
    a, key, mods = params
    try:
        key = int(key)
        mods = int(mods)
    except (TypeError, ValueError):
        return False
    return key == SPACE_KEY and mods == CMD and int(a) in (32, 65535)

for kid, entry in list(ash.items()):
    if not isinstance(entry, dict):
        continue
    val = entry.get("value")
    if not isinstance(val, dict):
        continue
    params = val.get("parameters")
    if not is_cmd_space(params):
        continue
    first = int(params[0])
    if first not in (32, 65535):
        first = 65535
    val["parameters"] = [first, SPACE_KEY, OPT]
    val["type"] = val.get("type") or "standard"
    entry["enabled"] = True
    changed.append(str(kid))

ash["64"] = {
    "enabled": True,
    "value": {
        "parameters": [65535, SPACE_KEY, OPT],
        "type": "standard",
    },
}
if "64" not in changed:
    changed.append("64")

if changed:
    print(
        "spotlight-option-space-hotkey: moved Cmd+Space → Option+Space for symbolic hotkey id(s): "
        + ", ".join(sorted(set(changed), key=lambda x: int(x) if x.isdigit() else 0)),
        file=sys.stderr,
    )

with open(path, "wb") as f:
    plistlib.dump(data, f)

try:
    subprocess.run(
        ["/usr/bin/plutil", "-convert", "binary", path],
        check=False,
        capture_output=True,
    )
except OSError:
    pass
PY

runuser /usr/bin/killall cfprefsd 2>/dev/null || true
runuser /System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
