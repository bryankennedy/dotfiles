### DOT-36 — frontend-design is pinned through this repo's own marketplace

**Decision.** `nix-darwin/flake.nix` and `remote/install.sh` stop registering `anthropics/claude-plugins-official` and enabling `frontend-design@claude-plugins-official`. Both now register a marketplace that lives in this repo, `_agent/marketplace`, as a `directory` source, and enable `frontend-design@dotfiles`. That marketplace has one entry, a `git-subdir` source for `plugins/frontend-design` in the upstream repository, fixed by `sha` to the last commit that touched that directory. Each script also removes the `frontend-design@claude-plugins-official` key it wrote before, so only the pinned copy is enabled. The baseline entry that accepted the unpinned marketplace is retired.

**What prompted it.** The nightly review of DOT-24's fix found that the acceptance said no pin was available, while DOT-24's own decision described a working pin that was declined on cost. It asked for the pin, or for the entry to say what was actually decided.

**Why the pin, now.** DOT-24 named three costs. Each turned out smaller than expected:

- *Activation changes on every machine.* It is two lines in each script, and the settings merge is idempotent as before.
- *The plugin id changes.* The old key is deleted on the next switch or install, and the new one is enabled in the same write.
- *The repo's path is needed on each VM.* `remote/install.sh` already knows it as `DOTFILES_DIR` and passes it to the merge. A `directory` source is read in place, so no second clone is made, and Claude Code writes nothing into the repo's directory.

Checked on 2026-10-16 with Claude Code 2.1.267 (the version the flake pins) and 2.1.301, each against an empty config directory: the marketplace adds, and the plugin installs with `gitCommitSha` equal to the pin. At the pinned commit the plugin directory holds `.claude-plugin/plugin.json`, `README.md`, `LICENSE`, and `skills/frontend-design/` (`SKILL.md` and `LICENSE.txt`). It has no hooks, no `.mcp.json` and no commands. Its content is identical to upstream HEAD on that date.

**How the pin is held.** `tests/invariants/plugin-sources.test.js` fails CI if either script registers any other marketplace or source, enables any other plugin, or removes any key other than the retired one. It also fails if an entry in `marketplace.json` is not `git-subdir` with a full 40-hex `sha`, or sets a `ref` beside it. `scripts/audit-pins.mjs` reads the pin from `marketplace.json` and reports BEHIND when a newer upstream commit touches `plugins/frontend-design`. A bump is a one-line edit to `sha`, made after reading the upstream diff, and it goes through review like any other pin.

**What is left as it was.** The official marketplace's registration is not removed from an existing `~/.claude/settings.json`. Activation only stops adding it, so a plugin installed from it by hand keeps working. Such a plugin is outside what activation manages.

**Supersedes.** `docs/decisions/DOT-24.md`, whose decision to leave the marketplace unpinned no longer holds. Its account of why a marketplace source cannot carry a commit is still correct. That is the reason the pin sits on the plugin entry instead.
