#!/usr/bin/env bash
# Launched by launchd.user.agents.agentsview-serve (nix-darwin/flake.nix).
#
# Binds the Mac's Tailscale IPv4 and nothing else, on a high, uncommon port to
# avoid colliding with typical dev servers clustered in the 3000-9000 range. It
# used to bind 0.0.0.0, which listened on every interface with the bearer token
# as the only control. Binding the tailnet address puts reachability in front of
# the token. Nothing on this Mac talks to the dashboard over loopback, so open it
# at the Tailscale URL here too.
#
# A non-loopback bind needs --require-auth (agentsview refuses otherwise); the
# bearer token it generates lives in ~/.agentsview/config.toml (auth_token),
# never in this repo.
#
# The address is resolved at launch rather than hardcoded, because this file is
# committed to a public repo and the Tailscale IP is stable per device but
# machine-specific. It is also the exact origin the browser uses, so it feeds
# --public-url/--public-origin.
#
# If Tailscale is not up yet (a login can race it), this waits briefly and then
# exits non-zero rather than binding loopback. launchd's KeepAlive restarts the
# script, so the dashboard binds the tailnet address as soon as there is one. A
# loopback fallback would keep running, reachable from nowhere it is used, until
# the next crash or login.
set -euo pipefail

PORT=58080
BIN="/Applications/AgentsView.app/Contents/MacOS/agentsview"
TAILSCALE="/usr/local/bin/tailscale"
WAIT_SECONDS=30

# Only a dotted IPv4 counts. Anything else the CLI prints (a "stopped" notice,
# an error) is treated as no address, so it can never become the bind host.
ts_ip() { "$TAILSCALE" ip -4 2>/dev/null | grep -E '^[0-9]+(\.[0-9]+){3}$' | head -1 || true; }

TS_IP="$(ts_ip)"
waited=0
while [[ -z "$TS_IP" && "$waited" -lt "$WAIT_SECONDS" ]]; do
  sleep 2
  waited=$((waited + 2))
  TS_IP="$(ts_ip)"
done

if [[ -z "$TS_IP" ]]; then
  echo "agentsview-serve: no Tailscale IPv4 after ${WAIT_SECONDS}s; exiting so launchd retries (not binding loopback or 0.0.0.0)" >&2
  exit 1
fi

exec "$BIN" serve --host "$TS_IP" --port "$PORT" --require-auth --no-update-check \
  --public-url "http://${TS_IP}:${PORT}" --public-origin "http://${TS_IP}:${PORT}"
