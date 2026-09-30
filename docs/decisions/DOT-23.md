### DOT-23 — The review strips AGENTS.md from the PR checkout alongside CLAUDE.md

**Decision.** The "Strip agent instructions from the PR checkout" step in `.forgejo/workflows/claude-review.yml` also removes `AGENTS.md` and `AGENTS.local.md` from `pr/`, in both its delete and its check. `tests/invariants/forgejo-ci.test.js` now requires all five names, so the wider list is held in place.

**What prompted it.** The nightly review of 2026-09-16 found the list narrower than the set of files agent harnesses read as instructions. Codex, Cursor and other harnesses read `AGENTS.md` that way. A PR could add `pr/AGENTS.md` saying its own change is pre-approved.

**Why not first confirm whether Claude Code loads it.** The strip step exists so that the review's input cannot steer the review. Whether the pinned Claude Code reads `AGENTS.md` can change with any version bump in `.forgejo/ci/install-tools.sh`, and nothing would notice. Nothing in the repo tracks an `AGENTS.md`, so removing it from the review checkout costs nothing. A PR that adds or edits one is still reviewed, as code, through `.review/pr.diff`.

**What it does not cover.** The list is still by name. A harness that reads some other file name would need its own entry here. CODEOWNERS approval remains the merge gate either way.
