### DOT-43 — The Mac denies the owner's claude.ai connectors in Claude Code

**Decision.** `nix-darwin/flake.nix` writes `/Library/Application Support/ClaudeCode/managed-settings.json` on every `darwin-rebuild switch`. Claude Code reads that file before the user's and the project's settings, and neither of those can undo an entry in it. The file denies four claude.ai connectors: Gmail, Google Drive, Google Calendar and Cloudflare Developer Platform. Each one is denied by server name and by URL in `deniedMcpServers`, and by tool-name prefix in `permissions.deny`. The Progress and Claude Docs connectors stay, and `permissions.deny` holds the Docs delete tool on its own. The owner made this choice on 2026-11-09 (INFRA-345, option B).

**What prompted it.** A Claude Code session that logs in with the owner's claude.ai account gets every connector on that account as tools, on every machine. The fleet's VMs got a managed-settings file with this deny list in INFRA-320e, from the private infrastructure repo. The entries here are the same, so one list covers the Mac and the VMs.

**Why three entries per connector.** claude.ai can rename a connector, and the tool prefix follows the name. The URL is the entry that survives a rename. Each URL ends in `*`, so a changed path on the same host still matches. The names and hosts are from `claude mcp list` on the Mac on 2026-11-09.

**Why Progress and Docs stay.** Mac sessions use Progress for actions and comments, and write docs through the Docs connector. Its delete tool is denied, as in the fleet policy: a doc that should go, the owner deletes.

**How the file is written.** The flake builds the JSON with `pkgs.formats.json` from two lists, `claudeDeniedConnectors` and `claudeExtraDeny`, so the names, URLs and prefixes are written once. Activation runs `install -m 644 -o root -g wheel` from the nix store on every switch. A session that runs as the login user reads the file, and only root writes it. A hand edit lasts until the next rebuild.

**How the list is held.** `tests/invariants/claude-managed-settings.test.js` fails CI if a connector leaves the list or changes its URL or prefix, if a URL loses its `*`, if the extra deny list changes, if the JSON stops being built from the lists, or if the install line is commented out, not root-owned, not mode 644, at another path, or without the house `|| echo "postActivation: …" >&2` fallback. `tests/invariants/canary.test.js` feeds each of those shapes to the same predicate.

**Check after the switch.** In a new Claude Code session on the Mac, `claude mcp list` shows Progress and Claude Docs connected. Gmail, Google Drive, Google Calendar and Cloudflare Developer Platform are absent, or listed as denied. A request to send a mail from that session reports that the tool is denied.

**Limits.**
- A session that logs in with a `claude setup-token` token or an API key gets no claude.ai connectors in the first place, so the file changes nothing for it.
- The user-level `cloudflare` MCP server in `~/.claude.json` is not a claude.ai connector, and the file does not touch it.
- The deny list names connectors by the names and hosts seen on 2026-11-09. After a connector change on the account, run `claude mcp list` in a new session and compare it with the list here.
