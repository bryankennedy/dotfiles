### DOT-22 — The commit-time gitleaks gate lands, so the review criterion that assumes it is true

**Decision.** The gate from PR #48 is re-landed on current `main`, and an invariant now holds it in place. `CLAUDE.md`'s "Flag hard" bullet about `.githooks/pre-commit` and `core.hooksPath` now describes a control that exists. The criterion itself is unchanged.

- `nix-darwin/flake.nix` installs `pkgs.gitleaks` from the locked nixpkgs. Its `postActivation` sets `core.hooksPath` to `.githooks` for `~/src/dotfiles`, with the house `|| echo "postActivation: …" >&2` fallback.
- `.githooks/pre-commit` runs `gitleaks git --pre-commit --staged` and refuses the commit on a finding. It also refuses when gitleaks is missing, rather than skipping.
- `_agent/skills/smart_commit.md` scans each staged chunk with gitleaks and forbids `--no-verify`.
- `tests/invariants/githooks.test.js` asserts four things: the hook exists, it is tracked as `100755`, it fails closed, and activation still installs gitleaks and sets the hooks path inside `postActivation`. `tests/invariants/canary.test.js` feeds those predicates the shapes they exist to reject.

**What prompted it.** The nightly review of 2026-09-15 found that the criterion describes a hook that does not exist. That is worse than a missing control, because a later audit reading `CLAUDE.md` would conclude commits are scanned. The criterion was written in #49 while #48 was open, and #49's review rehearsal used #48's diff. #48 was approved and then closed without merging, so the criterion outlived the change it described.

**Why the gate, not deleting the bullet.** The owner chose it on 2026-09-29. This repo is public, and a secret deleted after a push stays published, so the check has to run before the commit exists. The review's other option, deleting the bullet, would have made the text true by admitting the gap.

**What it does not cover.** The hook runs only where `core.hooksPath` points at it, which activation arranges for the Mac's checkout alone. Fleet clones and CI do not run it. `git commit --no-verify` skips it, which is why the agent skill forbids that flag. It does not replace reading the diff: gitleaks knows credential formats, not PII.

**Verified 2026-09-29, in a scratch clone with the hook enabled.** Without gitleaks on `PATH`, the commit was refused (exit 1). With gitleaks 8.30.1 (the locked nixpkgs version), a clean commit passed and a staged fake GitHub token was refused with `RuleID: github-pat`.

**After merge.** Nothing changes on the Mac until `darwin-rebuild switch`. Afterwards, `git -C ~/src/dotfiles config core.hooksPath` prints `.githooks` and `command -v gitleaks` resolves under `/run/current-system/sw/bin`.
