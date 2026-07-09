### DOT-1 — A security-audit skill scoped to the two-repo lab

**Decision.** Add `_agent/skills/security-audit.md` as a three-pass audit (exposure, injection, dependencies) over the public `dotfiles` repo and the private `ansible` repo, symlinked into the Claude, Cursor, and Gemini packages like every other skill. Accepted findings live in `docs/security-baseline.md`; the skill reports and does not fix.

**Why three passes, and why they are not independent.** The passes map to the three concerns in DOT-1, but they share one root: `_agent/` is not documentation, it is the instruction surface. `remote/install.sh` symlinks its rules and skills into the agent config directories, so whatever lands there is loaded into an agent's context on every machine. Exposure is about what leaks out of that channel; injection is about what flows in. Ordering them exposure → injection → deps means the auditor establishes that this repo is public before reasoning about who can write to it, and checks how the fleet acquires the repo before judging how much a merge is worth to an attacker.

**Why report-only.** Audits that fix produce diffs where the finding and the remedy are indistinguishable, and a reviewer cannot tell whether the fix was warranted. The skill ends at a severity-ranked report.

**Why a baseline file.** DOT-1 asks for something "progressively run." Without a record of accepted findings, the second run is as loud as the first and the signal is lost. The baseline stores *why a risk is tolerable*, and the skill re-verifies rather than skips those entries.

**Why the snippets are executable, not illustrative.** Every command in the skill was run against this repo before it was committed. Three were wrong:

- `sed -E 's#...([^/]+/[^/]+?)...#'` to parse the remote URL fails on BSD sed (lazy `+?`), and its failure mode is a **false negative** — the substitution yields an empty repo name, `gh` resolves something else, and the *private* ansible repo is reported `private=false`. Replaced by letting `gh` infer the repo from the working directory. A security check that breaks toward "safe" is worse than no check at all.
- `realpath -m` does not exist on macOS, so the shell symlink-escape check flagged all 15 tracked symlinks. Rewritten in Node, and it now prints a count so a clean run is distinguishable from one that matched nothing.
- `gitleaks detect` / `gitleaks protect` were removed upstream; 8.30 uses `git` and `dir`.

This is the argument for keeping the commands concrete rather than writing "scan for secrets": prose cannot be wrong in a way that a test catches.

**Where open findings live.** Validating the skill's commands surfaced several untriaged findings. They are recorded in the **private** ansible repo at `docs/security-findings.md`, not here and not in `security-baseline.md` (which is for *accepted* findings, described rather than quoted). Individually most such findings are discoverable by anyone; collected into one ranked list they are a plan of attack, and that aggregation is the harm. A public repo is the wrong home for one.

**Why this file names no hostnames, accounts, or open weaknesses.** Writing the deny-list into the skill would have published, in a public repo, exactly the strings the skill exists to keep out of it — and would have labelled a previously ambiguous string as the production login account, a larger disclosure than the string itself. The skill therefore derives its terms at run time from `~/src/ansible/inventory/hosts.yml`. The private inventory was already the source of truth for the fleet; making it the source of truth for the audit's deny-list keeps the public repo free of the values.

The same reasoning governs this document, the baseline, commit messages, and PR bodies on this repo. All four are public surfaces. An audit that documents its findings where the adversary reads them has moved the risk rather than reduced it.

**Not done here.** `nix-darwin/flake.nix` does not install a scanner; the skill fetches `gitleaks` and `osv-scanner` on demand with `nix run`. That trades a few seconds per run for not carrying two more tools in the declared brew/nix surface, which the dependency pass would then have to audit.
