### DOT-33 — The review job restores nothing from the runner cache

**Decision.** `claude-review.yml` no longer restores or saves runner cache entries. `install-tools.sh review` downloads bun and Claude Code on every run and checks each against its literal digest. A new invariant, `restores nothing from the runner cache if it holds a credential`, fails any workflow that references a secret or the job token, or triggers on `pull_request_target`, and also uses `actions/cache` or the cache API. `test.yml` keeps its bun cache, because it holds no credential.

**What prompted it.** The nightly review of 2026-10-02 rated the cache steps added by #81 and #82 HIGH. The review job holds `CLAUDE_CODE_OAUTH_TOKEN` and `CLAUDE_REVIEW_TOKEN`, and it restored two entries before anything else ran. That cache is shared with `test.yml`'s `pull_request` jobs, which run a PR's own copy of the workflow (DOT-21), so the `event_name` gate on `test.yml`'s save step binds only honest PRs. The keys derive from a public script, so they can be predicted.

**Why the digest check was not enough.** The removed comment argued that a poisoned entry had nowhere to put anything, because `install-tools.sh` verifies the one file it reads and nothing runs from the cache directory. That covers the file the script reads, not the restore. `actions/cache/restore` extracts a tar archive, and an archive can name members outside the cached path. A crafted entry could overwrite `scripts/forgejo-review.mjs` or `sha256sum` before any check ran. The comment was also missing a line, so it read as if the risk had been weighed and dismissed.

**DOT-21's conditions.** DOT-21 accepts that `test.yml` runs PR code on condition that, among other things, jobs share no state. A cache that PR jobs write and the review job reads is shared state. With these steps gone, no credentialed job in this repo reads anything a PR job can write through the cache. Whether the runner keeps PR cache writes apart from base-branch reads is a runner property, assessed in the private repo with DOT-21's other conditions.

**Cost.** Every review downloads the ~220 MB Claude Code package and bun again, so INFRA-185's one-minute install floor returns. If that matters, the fix is a separate secret-less job that downloads the binary and passes it on as an artifact that the review job digest-checks before use. That stays an option and is not built here.

**Left in place.** `fetch()` and `install_claude()` keep their cache-aware branches. With nothing restored they take the download path, and `install-tools.sh` stays byte-identical to the synced kit.

**Kit drift.** `claude-review.yml` is rendered from the review kit in the infrastructure repo (INFRA-95), and the nightly drift check flags local edits. Until the kit drops these steps too, that check will report this file, and the next sync would put the steps back. The invariant above fails that sync's PR.
