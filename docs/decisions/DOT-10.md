### DOT-10 — Code-owner review on the forge replaces GitHub's push rule

**Decision.** `.forgejo/CODEOWNERS` claims every path in this repo for the owner, with a single `^.*$` rule. `docs/security-baseline.md` now records that the push side of the repo-to-fleet gate is the forge's rule on `main`, not the retired GitHub protection, and retires the entry that accepted an unprotected private repo on GitHub's free tier.

**Why code owners, not approvals.** The forge rule requires zero approvals, like the GitHub rule before it, because a single maintainer cannot approve their own pull request. That was enough on GitHub, where the maintainer was the only writer. The forge added a write account for agents, so a zero-approval rule would let that account merge its own changes. Requiring one approval would fix that and lock the owner out of their own PRs. Code owners gives both: Forgejo requests the owner's review on an agent's PR, and never on a PR the owner opened.

**Why the whole repo, not a list of paths.** The first draft listed `_agent/`, `remote/install.sh`, `claude/`, `.claude/`, `nix-darwin/flake.nix` and `.forgejo/`. Reading the tracked files showed how incomplete that was: `cursor/` and `gemini/` link into `_agent/` too, `remote/bashrc` and `nix-darwin/scripts/` run on every machine, `bin/`, `zsh/` and `git/` run as the login user, and the security baseline tells the audit skill what not to re-open. In a dotfiles repo, almost every file is run or read as instructions. A list would have to be kept complete by hand, and one missed path would undo the gate. Claiming everything also means no PR can dodge the review request by touching only unowned files. The cost is that every agent PR here waits for the owner, which is how merges already worked on GitHub.

**Why `.forgejo/`.** GitHub mirrors this repo and reads CODEOWNERS from the root and `docs/`. There, the forge owner's handle is not the owner's GitHub account. Forgejo also reads `.forgejo/`, and GitHub doesn't.

**Why the audit checks the file.** A control nobody checks is just a comment. Pass 2b in `_agent/skills/security-audit.md` now reads `.forgejo/CODEOWNERS` from `origin/main` next to the branch rule. A missing or narrowed file counts as the gate being gone.

**Not done here.** Anything about the state of the gate before this change lives in the private repo's findings file, not in this document, the baseline, a commit message, or a PR body (`_agent/skills/security-audit.md`, "Findings about that chain are private").
