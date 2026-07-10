# Security audit baseline

Companion to the `security-audit` skill (`_agent/skills/security-audit.md`). This file records findings that have been **reviewed and accepted**, so re-runs stay quiet and a genuinely new finding is visible against the noise.

Rules:

- An entry here is not re-reported. It is **re-verified** — if its rationale no longer holds, the audit must say so loudly rather than skip it.
- Every entry carries the date it was accepted and the reason. "Looked fine" is not a reason.
- Accepting a finding is a decision. Record *why the risk is tolerable*, not merely that you noticed it.
- Never baseline a live secret. Rotate it, then scrub it.

---

## Accepted — Pass 1, exposure

Entries are described, not quoted, wherever quoting would restate the private value. This file is public.

### The hosting provider's domain in `README.md` and `remote/README.md`
*Accepted 2026-07-09.* Both hits are the vendor's name inside markdown anchor slugs. Slugifying the domain strips its dot, which makes it collide with an unrelated login account name — the collision is what the grep catches, not a disclosure. Naming your hosting provider is not a topology leak.

### The `*-herdr` SSH aliases in `zsh/aliases-macos.zsh`
*Accepted 2026-07-09.* These are SSH **alias** names. The hostnames and login accounts they resolve to live in `~/.ssh/config.d/`, generated from the private ansible inventory and never tracked here. An alias name alone reveals only that hosts by that nickname exist, which is not worth the cost of obfuscating.

### ~~Git identity in `git/.gitconfig`~~
*Accepted 2026-07-09. **Retired 2026-07-09**, second audit run.* It matched only because the inventory's `ansible_user` named a person rather than the login account. That field was wrong on every host — the fleet logs in as a service account — and correcting it removed the term from the deny-list, so this file no longer matches at all.

The identity itself was never the concern: it is the authorship on every public commit already, and no repo can hide what `git log` publishes. The entry is retired because the *match* was an artefact of a misdescribed inventory, which is worth knowing.

### ~~21 gitleaks hits across 15 files under the vendor-installed plugin skill dirs~~
*Accepted 2026-07-09. **Retired 2026-07-09**, second audit run. The rationale no longer applies; the entry is kept struck through so the change is visible rather than silent.*

It described `gitleaks dir` reaching Cloudflare plugin reference docs that Cursor and Gemini auto-installed into the stowed skill directories, judged safe because all 15 files were gitignored. The acceptance rested entirely on those ignore rules holding.

Those files no longer live in this repo at all. `--no-folding` stopped the agent config directories from being symlinks into the working tree, and `scripts/defold.mjs` evicted what had accumulated. The second run's worktree scan reports **no leaks found**, and bytes scanned fell from 6.20 MB to 848 KB — consistent with eviction rather than with a scanner that quietly stopped looking.

Do not re-add this entry if the hits reappear. Their reappearance would mean a fold has returned, and that is a finding, not a baseline.

### A fleet login account name remains in this repo's published history
*Accepted 2026-07-10, after the second audit run. This entry exists so the decision is not re-litigated; the commit coordinates are in the private findings file, deliberately not here.*

An account name was committed here and later removed from the worktree. Removal does not unpublish: this repo is public, so every commit that ever carried the string is still fetchable. Confirmed by reading the diffs, not by trusting the pickaxe — one of the matching commits is a false positive, a slugified vendor domain in a markdown anchor.

Accepted because the name is not a credential and, here, is not even knowledge:

- SSH to the fleet is key-only. There is no password prompt for a username to be typed into.
- The corresponding **hostnames were never committed**. A reader of this repo learns a username with nowhere to use it.
- The hosting edge maps *any* SSH username onto the same service account. An attacker who already had a hostname never needed the name.

And the alternatives cost more than they buy. A history rewrite plus force-push does not expunge objects from GitHub — old SHAs stay reachable through the API, forks, and cached clones until a garbage collection you cannot trigger — while breaking every clone, including nine fleet checkouts pinned to a sha. Rotating the account is real work that the third point above renders close to worthless.

**Re-verify, do not re-decide.** This acceptance rests on three conditions, and it expires with any of them. Re-raise as a live finding, not a baseline entry, if:

- a **hostname is ever committed to this repo** — the pair is meaningful even though neither half is;
- the fleet moves to a provider whose edge does *not* collapse arbitrary usernames onto one account;
- password or keyboard-interactive SSH auth is ever enabled on any host.

The finding was never "a string is public." It was "nobody decided." That is now closed.

### The exposure pass matches its own source
*Accepted 2026-07-09, first full audit.* `_agent/skills/security-audit.md` contains the grep patterns it runs, so passes 1b, 2c, and 2d each return hits on the skill file itself. Noise, not signal — but it does mean a real finding could hide next to a self-match. Read the file and line before dismissing.

### Tracked symlinks pointing outside their stow package
*Accepted 2026-07-09.* All 15 tracked symlinks resolve into `_agent/`, inside the repo. This is the intended single-source-of-truth layout for agent rules and skills. The check exists to catch a symlink escaping the repo entirely, which would publish private content on the next `stow`.

---

## Open

The first full audit ran 2026-07-09. Its open findings are recorded in the **private** ansible repo at `docs/security-findings.md`, not here. See `docs/decisions/DOT-1.md` for why: a ranked list of a system's weaknesses does not belong in a public repo, however discoverable each item is on its own.

---

## Resolved

Decisions, not findings. A resolved item is deleted from the private list and recorded here, described rather than quoted, so that the fix has a rationale attached to it and the private list stays short enough to read.

### The deployment path from this repo to the fleet is now gated at both ends
*Resolved 2026-07-09. Was the audit's only BLOCKER.*

Content merged here becomes agent instructions and executed code on every machine in the lab, because `remote/install.sh` symlinks `_agent/` into the agent config directories and the fleet runs that script on each play. That is by design; what was missing was any gate between a merge and its execution.

Two changes, one per end. **Push side:** this repo's default branch now requires a pull request and rejects direct pushes, enforced for admins — verified by attempting one and receiving `GH006`. Approvals are set to zero deliberately: a single maintainer cannot approve their own pull request, so requiring one would have locked the repo rather than protected it. The gate that matters is that the diff becomes visible before it becomes instructions.

**Pull side:** the fleet pins an exact commit sha rather than tracking a branch, and the ansible role asserts that the pin is a 40-character sha, failing loudly on a branch name. Adopting new dotfiles is now a reviewed commit in the private repo, so the diff of what the fleet is about to run is the diff of that line.

### Agent config directories are no longer symlinked wholesale into this repo
*Resolved 2026-07-09. Was HIGH.*

GNU Stow "folds" a directory when the target does not exist yet — it links the whole directory into the package rather than creating a real directory and linking each file. Several directories under `$HOME`, including agent skill and command directories, were folds pointing here. Anything an application wrote to them landed in the working tree of this public repo, restrained only by a hand-written `.gitignore` rule per plugin.

Stow now runs with `--no-folding`, which creates real directories and links only leaf files, so an application writing a new file writes it to `$HOME`. `-R` accompanies it because `--no-folding` alone will not undo a fold that already exists. `scripts/defold.mjs` performed the one-time migration and remains as the check. The stow package list was also completed: three packages were being stowed by hand without being declared, which is how one of these folds went unmanaged for so long.

## Known gaps in the audit itself

Recorded so an unrun check never reads as a pass.

### Fixed 2026-07-09 — pass 3c scanned nothing

`osv-scanner scan source ~/src/dotfiles` reported "No package sources found" and the audit read that silence as a clean dependency scan. It reads lockfiles; this repo has none.

Now three surfaces, three answers. **npm** is scanned properly — `~/.bun/install/global/bun.lock` pins 141 packages and osv-scanner resolves it, printing the package count so a clean result cannot be confused with an empty one. The **nix closure** is scanned with `vulnix --system`, whose output is leads rather than findings: it matches names against NVD blind to nixpkgs' backported patches, and on its first run flagged the Rust crate `curl` against C-library CVEs. **Homebrew has no vulnerability feed at all** — no OSV ecosystem, no `brew` CVE command — so it is reported as *unscanned*, never as clean.

### Fixed 2026-07-09 — pass 2d reported no MCP servers while five were live

The check grepped `mcpServers` in the settings files, found none declared, and concluded there were none. Enabled plugins supply their own: `cloudflare@cloudflare` contributes five remote MCP servers whose tool descriptions enter the model's context on every session.

`scripts/audit-mcp.mjs` now resolves both sources — servers declared in settings, and servers reachable via `enabledPlugins` — and prints the transport and origin of each.

### The rule both failures share

Each check printed exactly what a genuinely clean result prints. Before recording a check as passing, ask what it would have printed had it never run; if the answer is "the same thing," make it prove it looked — a package count, a positive control that must fail, a sample of what it saw.
