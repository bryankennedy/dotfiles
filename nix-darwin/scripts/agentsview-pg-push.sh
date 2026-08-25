#!/usr/bin/env bash
# Launched by launchd.user.agents.agentsview-pg-push (nix-darwin/flake.nix).
#
# Pushes this Mac's local AgentsView session index into the fleet's shared
# Postgres on bet, continuously (`pg push --watch`) — a second, independent
# job alongside agentsview-serve, which only shows this machine's own
# sessions. This one contributes to the combined dashboard at
# https://agents.bck.dev.
#
# The connection string (machine name + password + bet's address) is NOT in
# this file, and never should be — this repo is public. It's rendered by
# the private infrastructure repo's `make mac-agentsview-push`
# (ansible/playbooks/mac-agentsview-push.yml) into
# ~/.config/agentsview/pg-push.env, which this script only knows how to
# source. No file there yet means this push has not been set up on this
# machine — exit quietly rather than fail loudly, so a fresh clone of this
# repo doesn't spam Console.app with a launchd job crash-looping on every
# machine that has never run the infra repo's playbook.
set -euo pipefail

ENV_FILE="$HOME/.config/agentsview/pg-push.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "agentsview-pg-push: $ENV_FILE not found — run \`make mac-agentsview-push\` in the infrastructure repo first. Exiting quietly."
  exit 0
fi

# shellcheck source=/dev/null
source "$ENV_FILE"

BIN="/Applications/AgentsView.app/Contents/MacOS/agentsview"
exec "$BIN" pg push --watch
