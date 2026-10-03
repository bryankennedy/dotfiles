### DOT-24 — The official plugin marketplace stays unpinned, and the baseline says so

**Decision.** The `claude-plugins-official` marketplace that `nix-darwin/flake.nix` and `remote/install.sh` register stays on its default branch. The auto-mode entry in `docs/security-baseline.md` no longer counts the marketplace plugin among the pinned agent-instruction inputs. A new entry in the same file accepts the unpinned marketplace, with the reason and the conditions it rests on. `tests/invariants/plugin-sources.test.js` holds both scripts to exactly the marketplace source and plugin list that entry accepts.

**What prompted it.** The nightly review found the source carried no ref, which `CLAUDE.md` asks a review to flag hard. It also found that the auto-mode acceptance rested partly on the plugin being pinned. Both were true. The review suggested pinning with `ref: '<commit>'` if the settings schema allowed it.

**Why a pin was not possible.** Checked against Claude Code 2.1.288 on 2026-10-03:

- A marketplace source's `ref` goes to `git clone --depth 1 --branch <ref>`, with no fallback. Git rejects a commit there (`Remote branch <sha> not found in upstream origin`, reproduced against the upstream head). A SHA in `ref` would break the clone on every machine and pin nothing.
- The marketplace source schema has `ref`, `path` and `sparsePath`, but no `sha`. Only plugin entries inside a marketplace accept `sha`.
- `anthropics/claude-plugins-official` publishes no tags, so a tag is not available as a stand-in either.

**The alternative not taken.** A real pin is possible: a marketplace of our own in this repo, with one entry `{ source: 'git-subdir', url: …/claude-plugins-official.git, path: 'plugins/frontend-design', sha: <commit> }`, watched by `scripts/audit-pins.mjs`. The owner chose not to take it now. It would change activation on every machine, rename the plugin's id, and need the repo's path on each VM, all to pin one skill from the agent's own vendor. It remains the route if the plugin ever gains hooks or MCP servers, or another plugin from this marketplace is enabled.

**Why a test rather than an audit-pins check.** There is no pin for `scripts/audit-pins.mjs` to compare against upstream. What can drift is the acceptance itself: a second marketplace, a changed source, or another plugin added beside this one. The invariant fails CI on any of those, and on an accepted entry disappearing, so the baseline is retired with it rather than left describing nothing. Its canary proves each case still fails.

**Supersedes.** The DOT-18 rationale (`docs/decisions/DOT-18.md`) and the auto-mode entry as restated there both name the marketplace plugin as a pinned input. That part no longer holds. The acceptance now rests on the PR gate and the impeccable bundle, which is pinned by tag and a literal SHA-256. DOT-18's file is left as written, and this entry corrects it.
