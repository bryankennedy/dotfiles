#!/usr/bin/env bash
# Launched by launchd.user.agents.agentsview-serve (nix-darwin/flake.nix).
#
# Binds 0.0.0.0 so the UI is reachable over Tailscale (as well as
# 127.0.0.1), on a high, uncommon port to avoid colliding with typical dev
# servers clustered in the 3000-9000 range. Non-loopback binds need
# --require-auth (agentsview refuses otherwise); the bearer token it
# generates lives in ~/.agentsview/config.toml (auth_token), never in this
# repo.
#
# --public-url/--public-origin must be the exact origin the browser uses, so
# this resolves the current Tailscale IPv4 at launch time rather than
# hardcoding it here — this file is committed to a public repo, and the
# Tailscale IP is stable per-device but machine-specific.
set -euo pipefail

PORT=58080
BIN="/Applications/AgentsView.app/Contents/MacOS/agentsview"
TS_IP="$(/usr/local/bin/tailscale ip -4 2>/dev/null | head -1 || true)"

args=(serve --host 0.0.0.0 --port "$PORT" --require-auth --no-update-check)
if [[ -n "$TS_IP" ]]; then
  args+=(--public-url "http://${TS_IP}:${PORT}" --public-origin "http://${TS_IP}:${PORT}")
fi

exec "$BIN" "${args[@]}"
