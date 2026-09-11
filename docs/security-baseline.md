# Security audit baseline

Companion to the `security-audit` skill (`_agent/skills/security-audit.md`). This file records findings that have been **reviewed and accepted**, so re-runs stay quiet and a genuinely new finding is visible against the noise.

Rules:

- An entry here is not re-reported. It is **re-verified** — if its rationale no longer holds, the audit must say so loudly rather than skip it.
- Every entry carries the date it was accepted and the reason. "Looked fine" is not a reason.
- Accepting a finding is a decision. Record *why the risk is tolerable*, not merely that you noticed it.
- Never baseline a live secret. Rotate it, then scrub it.

---

## Run log

A dated line per full audit, so a clean result is itself on the record — the point of the baseline is that silence is legible, and "we ran it and nothing new surfaced" is a claim worth being able to point to.

### 2026-07-10 — full run (`all`), no new findings
First fully clean pass. Every check either passed with evidence that it actually looked, or matched an accepted entry below that re-verified as still true; nothing new was found.

- **Exposure** — gitleaks scanned 193 commits and the worktree with no leaks; the topology deny-list (14 terms from 9 hosts) hit only the accepted anchor-slug true-negative and finding 4's history; 0 symlinks escape the repo. Finding 4's void condition was re-checked and holds — **no fleet hostname appears anywhere in this repo, worktree or history**. *(Superseded. That claim stopped being true when a service host name reached published history on 2026-08-25, and again when the forge's public name reached the tree on 2026-09-10. Finding 4's conditions were re-decided on 2026-09-11; see its entry and "Public DNS names and account handles are public identity" below.)*
- **Injection** — the gate is intact at both ends (this repo requires a PR with admin enforcement; the fleet pins a full commit sha, now `bc896bb`). The global `permissions.allow` list is empty (finding 6). Five Cloudflare plugin MCP servers remain the only injection surface, as baselined; no hooks.
- **Dependencies** — npm (141 packages) scans clean; the nix closure is byte-identical to finding 7's triage (same 19 runtime leads, same versions), so that vendor-severity triage still stands; pins are current; nix inputs are 2–28 days old; 0 declared Homebrew formulae are stale.
- **Stated unscanned, not clean** — Homebrew has no vulnerability feed; nix-closure vendor advisories were not re-fetched because the closure did not change; `defaultMode: auto` means agents auto-approve, which amplifies any injection vector and is why the gate and empty allow-list matter.

---

## Accepted — Pass 1, exposure

Entries are described, not quoted, wherever quoting would restate the private value. This file is public.

### The hosting provider's domain in `README.md` and `remote/README.md`
*Accepted 2026-07-09.* Both hits are the vendor's name inside markdown anchor slugs. Slugifying the domain strips its dot, which makes it collide with an unrelated login account name — the collision is what the grep catches, not a disclosure. Naming your hosting provider is not a topology leak.

### The `*-herdr` SSH aliases in `zsh/aliases-macos.zsh`
*Accepted 2026-07-09. **Widened 2026-09-11** (DOT-9) to cover the `progress*-space` aliases beside them and the `ssh` commands in `tmux/.tmux.conf`. Those name two hosted VMs by alias, and pass 1b reports them now that it searches for inventory host names.* These are SSH **alias** names. The hostnames and login accounts they resolve to live in `~/.ssh/config.d/`, generated from the private ansible inventory and never tracked here. An alias name alone reveals only that hosts by that nickname exist, which is not worth the cost of obfuscating.

### ~~Git identity in `git/.gitconfig`~~
*Accepted 2026-07-09. **Retired 2026-07-09**, second audit run.* It matched only because the inventory's `ansible_user` named a person rather than the login account. That field was wrong on every host — the fleet logs in as a service account — and correcting it removed the term from the deny-list, so this file no longer matches at all.

The identity itself was never the concern: it is the authorship on every public commit already, and no repo can hide what `git log` publishes. The entry is retired because the *match* was an artefact of a misdescribed inventory, which is worth knowing.

### ~~21 gitleaks hits across 15 files under the vendor-installed plugin skill dirs~~
*Accepted 2026-07-09. **Retired 2026-07-09**, second audit run. The rationale no longer applies; the entry is kept struck through so the change is visible rather than silent.*

It described `gitleaks dir` reaching Cloudflare plugin reference docs that Cursor and Gemini auto-installed into the stowed skill directories, judged safe because all 15 files were gitignored. The acceptance rested entirely on those ignore rules holding.

Those files no longer live in this repo at all. `--no-folding` stopped the agent config directories from being symlinks into the working tree, and `scripts/defold.mjs` evicted what had accumulated. The second run's worktree scan reports **no leaks found**, and bytes scanned fell from 6.20 MB to 848 KB — consistent with eviction rather than with a scanner that quietly stopped looking.

Do not re-add this entry if the hits reappear. Their reappearance would mean a fold has returned, and that is a finding, not a baseline.

### A fleet login account name remains in this repo's published history
*Accepted 2026-07-10, after the second audit run. **Conditions re-decided 2026-09-11** (DOT-9). This entry exists so the decision is not re-litigated; the commit coordinates are in the private findings file, deliberately not here.*

An account name was committed here and later removed from the worktree. Removal does not unpublish: this repo is public, so every commit that ever carried the string is still fetchable. Confirmed by reading the diffs, not by trusting the pickaxe — one of the matching commits is a false positive, a slugified vendor domain in a markdown anchor.

Accepted because the name is not a credential and, here, is not even knowledge:

- SSH to the fleet is key-only. There is no password prompt for a username to be typed into.
- ~~The corresponding **hostnames were never committed**. A reader of this repo learns a username with nowhere to use it.~~ No longer true since 2026-08-25, and it turned out not to be what the acceptance rested on; see the conditions below.
- The hosting edge maps *any* SSH username onto the same service account. An attacker who already had a hostname never needed the name.

And the alternatives cost more than they buy. A history rewrite plus force-push does not expunge objects from GitHub — old SHAs stay reachable through the API, forks, and cached clones until a garbage collection you cannot trigger — while breaking every clone, including nine fleet checkouts pinned to a sha. Rotating the account is real work that the third point above renders close to worthless.

**Re-verify, do not re-decide.** This acceptance rests on the conditions below, and it expires with any of them. Re-raise as a live finding, not a baseline entry, if:

- ~~a **hostname is ever committed to this repo** — the pair is meaningful even though neither half is;~~ *Re-decided 2026-09-11.* This trip-wire fired twice: a service host name reached history in 2026-08, and the forge's public name reached the tree in 2026-09. Neither made any host reachable, because a name paired with an account was never what kept a stranger out. No password path over SSH (the last condition here) and the reachability conditions in "Public DNS names and account handles are public identity" do that, and they replace this condition;
- the fleet moves to a provider whose edge does *not* collapse arbitrary usernames onto one account;
- SSH auth that asks for a secret, whether a password or a keyboard-interactive prompt, is ever enabled on any host. Check from a machine with the fleet's SSH config: `ssh -n -o PubkeyAuthentication=no -o ControlPath=none -o BatchMode=yes <host> true` must be refused: `Permission denied`, or Tailscale's `tailnet policy does not permit you to SSH`. The hosting provider's edge lists `keyboard-interactive` among its methods, but only uses it to print "SSH keys are required" and disconnect (checked 2026-09-11). That listing alone does not void this entry; `password` in the list, or any prompt for a secret, does.

The finding was never "a string is public." It was "nobody decided." That is now closed.

### Public DNS names and account handles are public identity
*Accepted 2026-09-11 (DOT-9). Rationale in `docs/decisions/DOT-9.md`. The rule this sets is Pass 1's definition in `_agent/skills/security-audit.md`.*

The forge's name, `git.bck.dev`, is in this repo's tree. It is also in the published message of every forge merge, next to the owner's forge handle, `bkennedy`, which is a login account on the host behind that name. The agent account's name and commit address are on the same merges. The fleet dashboard's name, `agents.bck.dev`, has been in history since 2026-08 and resolves the same way. The forge writes the trailers and authorship on every squash merge, and history already has the rest, so none of this can be removed.

Accepted because none of it gives an attacker something they lack or can use:

- **Both names are public by design.** Each has a public DNS record, so clients can resolve it without the lab's own DNS, and each serves a TLS certificate that is in certificate transparency logs. A copy in this repo adds nothing to what `dig` and a certificate search already return.
- **Both records point at a tailnet address,** which is unreachable from the internet. A name gives a stranger nothing to connect to.
- **No host takes a password.** The hosted VMs sit behind the provider's edge, which requires a registered key. The forge host uses Tailscale SSH, which authorizes by tailnet identity and policy. A login name has no password prompt to be typed into.
- **The handles are authorship.** They identify who wrote and merged a change; they grant nothing.

The same rule makes the hosted VMs' names public identity, because they resolve in public DNS too. They point at the hosting provider's public SSH edge rather than a tailnet address, so for those names the whole weight rests on the edge requiring a registered key. The login-account entry above re-verifies that.

**Not covered, and each still a finding:** a host name or address that does not resolve in public DNS (private topology, HIGH), the inventory's shape, credentials, and any description of an open weakness. The line is the public DNS answer: `dig +short <name> A @1.1.1.1`.

**Re-verify, do not re-decide.** This expires, and the names become findings again, if:

- `dig +short <name> A @1.1.1.1` for either name stops answering inside `100.64.0.0/10`, the record becomes proxied, or the service behind it becomes reachable from the internet some other way (a tunnel, a Tailscale Funnel, a port forward);
- password or keyboard-interactive SSH auth is enabled on any host (the check is in the login-account entry above);
- a handle or account name becomes part of a credential, or of an access rule that anyone off the tailnet can reach.

### An internal host name and its role remain in this repo's published history
*Accepted 2026-09-11 (DOT-9). Coordinates are in the private findings file.*

Two commits in 2026-08 described the fleet's shared database by the internal host it runs on: that host's inventory name, and what it runs. The same commits named the fleet dashboard, which is public identity under the entry above and is not what this entry accepts. A later commit removed the host name and role from the worktree, but history keeps both. That is private topology in published history, rated HIGH.

It is accepted, not rewritten, for the same reasons as the login account above. A force-push does not remove objects GitHub already serves, and it would break every sha-pinned fleet checkout. The name also reaches nothing: it is a bare name that resolves only on the lab's own networks, and the host behind it accepts SSH only through Tailscale SSH, which authorizes by tailnet identity and policy.

**Re-verify, do not re-decide.** This expires if that host becomes reachable from off the tailnet, or if any host accepts password or keyboard-interactive SSH auth. It does not cover a *new* internal name or role committed to the worktree. That is a new HIGH finding, and since DOT-13 pass 1b searches for inventory host names, so it will be caught.

### The exposure pass matches its own source
*Accepted 2026-07-09, first full audit.* `_agent/skills/security-audit.md` contains the grep patterns it runs, so passes 1b, 2c, and 2d each return hits on the skill file itself. Noise, not signal — but it does mean a real finding could hide next to a self-match. Read the file and line before dismissing.

### Tracked symlinks pointing outside their stow package
*Accepted 2026-07-09.* All 15 tracked symlinks resolve into `_agent/`, inside the repo. This is the intended single-source-of-truth layout for agent rules and skills. The check exists to catch a symlink escaping the repo entirely, which would publish private content on the next `stow`.

---

## Accepted — Pass 2, agent supply chain

### The Mac's user-level Claude Code permission mode is `auto`, set by activation
*Accepted 2026-09-07.*

`nix-darwin/flake.nix` merges `permissions.defaultMode = "auto"` into `~/.claude/settings.json` on every switch, so on the Mac an agent auto-approves tool calls in any project that does not set its own mode. This repo's tracked `.claude/settings.json` sets `default` for itself, which is the stricter mode for the public half of the instruction supply chain; the two files are different scopes, not a contradiction, and this entry exists so that a reader who sees one does not assume it describes the other. The fleet is not affected: `remote/install.sh` merges plugins and preferences into the same file but leaves the mode at Claude Code's own default.

Why it is tolerable: auto mode amplifies an injection, it does not create one, and the controls that bound injection are the ones that matter here — the PR gate on this repo, the empty global `permissions.allow` list (finding 6), and the pinned agent-instruction inputs (impeccable, the marketplace plugin). The 2026-07-10 run log already names this as the reason those controls matter. Reassess if the allow-list grows, if the gate is loosened, or if a new unpinned skill or plugin source is added to activation.

---

## Accepted — Pass 3, dependencies

### The Mac's herdr bootstrap pipes the vendor installer to a shell, once
*Accepted 2026-09-06.*

`nix-darwin/flake.nix` runs `curl https://herdr.dev/install.sh | sh` as the login user when `~/.local/bin/herdr` is absent — the same moving-ref `curl | sh` shape that finding 3 retired from the fleet. It is accepted here because the purpose is different. The Mac left Homebrew precisely so `herdr update` can follow the vendor's **preview** channel, and every update after the bootstrap is the binary fetching `herdr.dev/preview.json` and installing what it names. Pinning the first download the way the ansible role does (which now pins preview tags too, from GitHub's asset digest) would fix a binary that the very next `herdr update` replaces: one verified download, then nothing. The trust placed in herdr.dev is inherent to opting into vendor preview builds, not introduced by the bootstrap.

Bounds: runs as `bk`, never root; only when the binary is missing, so an installed herdr is never re-fetched or downgraded by activation; the installer checks the asset against the manifest's SHA-256 (internal consistency only, as finding 3 notes). Reassess if the bootstrap ever runs unconditionally or gains a root path. Retire this entry if the Mac returns to the stable channel — Homebrew is the better source again at that point, and the brew should come back with it.

---

## Open

The first full audit ran 2026-07-09. Its open findings are recorded in the **private** infrastructure repo (formerly the ansible repo) at `docs/security-findings.md`, not here. See `docs/decisions/DOT-1.md` for why: a ranked list of a system's weaknesses does not belong in a public repo, however discoverable each item is on its own.

---

## Resolved

Decisions, not findings. A resolved item is deleted from the private list and recorded here, described rather than quoted, so that the fix has a rationale attached to it and the private list stays short enough to read.

### The Mac's activation no longer installs moving refs into the agent's path
*Resolved 2026-09-07. Surfaced by a repo review, not a numbered audit finding; same shape as finding 3.*

`nix-darwin/flake.nix` ran four network installs on every `darwin-rebuild switch`, each at whatever version upstream served that minute and each wrapped in `|| true`: `bun install -g` for claude-code, wrangler and vite, and a wrapper that fetched the impeccable skill bundle from `impeccable.style/api/download/bundle/universal` with only a two-byte "is it a zip" check before unpacking it into `~/.claude/skills`. The last one is the serious case — the bundle *is* agent instructions, and the endpoint could have served anything. The fix follows finding 3's rule of pinning as far as each upstream allows: the three npm globals are pinned to exact versions (npm packages are immutable once published), and the impeccable bundle is fetched from an immutable GitHub release asset by tag, with its SHA-256 recorded in the script and verified before the CLI — itself now pinned — touches it. This is the tag-plus-digest shape the herdr Ansible role already uses, not the installer-script checksum finding 3 rejected: a release asset does not move, so the hash only breaks when the tag is bumped, which is when a person is already reading it.

`|| true` became `|| echo … >&2` on every activation step, including stow and the tpm clone, so a failed or offline install is visible in the switch log instead of silently leaving whatever was there before. `scripts/audit-pins.mjs` now reads the flake and the impeccable script alongside `remote/install.sh`, so the new pins are watched the same way (pass 3e). The cost is that these tools no longer update themselves on rebuild; the audit's `BEHIND` line is the prompt to read release notes and bump.

In the same change, `homebrew.onActivation.cleanup` went from `zap` to `uninstall`. Undeclared casks are still removed on every switch, so the declared list remains the whole surface (pass 3b); what changed is that their preferences and support files are no longer deleted with them, which mattered because `autoMigrate = true` means Homebrew can learn about casks this repo never declared.

### The deployment path from this repo to the fleet is now gated at both ends
*Resolved 2026-07-09. Was the audit's only BLOCKER. **Push side moved to the forge 2026-09-10**; the GitHub rule described below is retired.*

Content merged here becomes agent instructions and executed code on every machine in the lab, because `remote/install.sh` symlinks `_agent/` into the agent config directories and the fleet runs that script on each play. That is by design; what was missing was any gate between a merge and its execution.

Two changes, one per end. ~~**Push side:** this repo's default branch now requires a pull request and rejects direct pushes, enforced for admins — verified by attempting one and receiving `GH006`. Approvals are set to zero deliberately: a single maintainer cannot approve their own pull request, so requiring one would have locked the repo rather than protected it. The gate that matters is that the diff becomes visible before it becomes instructions.~~

**Push side, since 2026-09-10.** This repo's home is the Forgejo forge; GitHub is a push mirror of it and deliberately carries no branch rule, because a rule there rejects the mirror's pushes. The GitHub protection above was removed for that reason, so do not re-verify it — it is gone on purpose. The gate is the forge's rule on `main`, declared in the private repo's OpenTofu rather than set by hand: no account may push to `main`, and every change arrives by pull request. Pass 2b checks it with `tea api` and expects `protected: true` and `user_can_push: false`.

What the move changed is who can merge. On GitHub the only writer was the maintainer. On the forge, agents open pull requests as a separate write account so that the code-owner rule has someone to request review *from* — Forgejo never asks a PR's own author. Approvals stay at zero for the reason given above, so the review has to come from `.forgejo/CODEOWNERS`. It claims every path in this repo, because nearly every file here is loaded as instructions or executed as the login user somewhere, and the forge rule blocks the merge until the requested review lands. The property this entry has always rested on — the diff becomes visible before it becomes instructions — now means visible *to the maintainer*, not merely published on a pull request.

**Pull side:** the fleet pins an exact commit sha rather than tracking a branch, and the ansible role asserts that the pin is a 40-character sha, failing loudly on a branch name. Adopting new dotfiles is now a reviewed commit in the private repo, so the diff of what the fleet is about to run is the diff of that line.

### Agent config directories are no longer symlinked wholesale into this repo
*Resolved 2026-07-09. Was HIGH.*

GNU Stow "folds" a directory when the target does not exist yet — it links the whole directory into the package rather than creating a real directory and linking each file. Several directories under `$HOME`, including agent skill and command directories, were folds pointing here. Anything an application wrote to them landed in the working tree of this public repo, restrained only by a hand-written `.gitignore` rule per plugin.

Stow now runs with `--no-folding`, which creates real directories and links only leaf files, so an application writing a new file writes it to `$HOME`. `-R` accompanies it because `--no-folding` alone will not undo a fold that already exists. `scripts/defold.mjs` performed the one-time migration and remains as the check. The stow package list was also completed: three packages were being stowed by hand without being declared, which is how one of these folds went unmanaged for so long.

### Flake inputs are kept current, not left to drift
*Resolved 2026-07-10. Was MEDIUM (finding 5, staleness).*

Age is its own risk, distinct from any named CVE: a patched vulnerability does not reach a machine until the pin that references it moves. The four `nix-darwin/flake.lock` inputs had gone 53–61 days without an update, which is a standing decision to run old crypto and network code. They were refreshed (`nix flake update`), verified by building the full closure without switching, and the resulting `nix store diff-closures` showed the TLS/network stack advancing as intended — openssl, curl, git, krb5, nghttp2, ngtcp2, libxml2, libfido2, the CA bundle. This flake builds the Mac alone; the fleet is unaffected. The Homebrew half of the same finding had already resolved itself — `brew outdated` reports zero.

The decision this records is not the one update but the posture: a lock this old is a finding, and the audit's dependency pass should say so rather than treat a quiet lock as a current one.

### Three network installers are pinned as far as each upstream allows
*Resolved 2026-07-10. **Residual retired 2026-08-15**; the herdr half is now fully resolved. Was MEDIUM ×3 (finding 3).*

`remote/install.sh` and the herdr Ansible role each fetched an installer over HTTPS and piped it to a shell. All three run as the login user, never root, but each fetched a *moving* ref — the code executed could differ from one bootstrap to the next with no signature or checksum. Checksum-pinning the vendor *installer scripts* was rejected outright: those scripts change often, so a pinned hash breaks bootstrap on every upstream edit and trains whoever hits it to bump the hash unread, which is worse than no check.

What each upstream actually permits differs, and the fix follows that rather than pretending it is uniform:

- **bun** takes a release tag as its first argument, so it is pinned to an exact version — the payload the VM keeps is deterministic.
- **zoxide**'s installer has no version flag; it always fetches the latest release. So the pin is the *installer script's commit sha* instead of the `main` branch — it fixes the code piped into the shell, not the binary version, which is the part that could turn hostile between runs.
- **herdr** no longer pipes anything to a shell. ~~It could be pinned neither way, and binary checksumming was declined.~~ The role now reads herdr's release manifest itself and hands Ansible the two values the vendor installer was using anyway: an immutable `github.com/herdrdev/herdr/releases/download/v<version>/` asset URL, and that asset's SHA-256, verified before the file is placed. The residual was accepted on the premise that neither pinning nor verification was available; both are, so it is retired rather than re-accepted.

The trigger stands for the remaining two: reassess upward if either ever drops to plain HTTP or gains a root path.

The herdr change was not made for this finding — it was made because `creates:` meant the role could install herdr but never upgrade it, and the fleet silently fell a protocol version behind the Mac until every remote workspace broke at once. Worth recording: the availability of a checksum was discovered by reading the installer the role was piping to a shell. The earlier assessment took the vendor's constraints on faith instead.

### The nix closure's CVE leads are triaged, and the scary number was mostly NVD
*Resolved 2026-07-10 as a triage + accepted residual. Was "56 affected, 16 CVSS ≥9.0, untriaged."*

`vulnix --system` reports NVD's CVSS against every derivation in the system closure, and read raw it looked alarming. Triaged against the freshly-updated closure it collapses: 47 flagged → 28 dropped as build-time-only (not in the runtime closure) → 4 name collisions (a package matched against an unrelated product sharing its name) → 2 wrong-component → **~13 real leads**, and those are latest-nixpkgs core libraries trailing an upstream point release, **rated Low-to-Medium by their own vendors** even where NVD rated them 9.8. The worked example: vulnix scored `curl` a 9.8 critical; curl's own advisory rates the same CVEs mostly Low and its one "Severe" a *Low* requiring an invocation nobody uses.

The decision: accept these as the standing cost of a stable channel rather than chase them. There is nothing to upgrade *to* — the pinned nixpkgs already ships the newest build of each package; the fix lands when nixpkgs packages the upstream release. The control is the dependency-staleness watch (flake age plus `scripts/audit-pins.mjs`), re-running vulnix after each flake update and re-checking the network-reachable subset against **vendor** advisories, not NVD. The method is written into the audit skill (pass 3c) so the next run does not re-panic over the same raw count.

### Global agent permissions no longer carry a stray project's command grants
*Resolved 2026-07-10. Was LOW (finding 6).*

The global `~/.claude/settings.json` `permissions.allow` list held two entries — its entire contents — that hard-coded a specific command against a file path belonging to an unrelated project. Exact-match command grants, so not exploitable, but a project-scoped grant sitting in global scope is how an allow-list quietly stops meaning anything, and the pattern (a project session writing its grants to the global file) is the thing to catch. Removed; the allow list is now empty. The path was never in this public repo — the file is machine-local and untracked, confirmed — so nothing was disclosed. That the file drifts unversioned is inherent to it being machine-specific agent state, and is accepted rather than fixed.

### GH_HOST has a single managed source across the fleet
*Resolved 2026-07-10. Was LOW (finding 10).*

One host carried a second, hand-written copy of its `GH_HOST` export in `~/.bash_profile`, outside anything the ansible role managed. It existed for a real reason — `remote/bashrc` sourced the managed `~/.bashrc.local` *after* its non-interactive guard, so a non-interactive login shell (agent automation running `gh`) never reached the managed value, and the hand-written copy filled that gap. The cost was two sources of truth, one invisible to the role and free to drift when the inventory value changed.

Fixed at the root: `remote/bashrc` now sources `~/.bashrc.local` *before* the guard, so the managed per-host environment reaches non-interactive login shells on every host. Because that sourcing runs after `~/.bash_profile`, the managed value also overrides any stale hand-written copy — so it is authoritative, not merely one of two. The block is documented as environment-only, since it now runs even non-interactively; interactive setup stays after the guard, which a test confirms it still gates.

### The exposure pass's deny-list is now a checked contract, not a lucky accident
*Resolved 2026-07-10. Was MEDIUM (finding 9) — a defect in the audit, not the lab.*

Pass 1b derives the list of private strings to search for from the inventory. It used to assemble that list from whatever keys happened to be present, and the fleet's real login account survived into it only by accident — a redundant key on two hosts. Removing that redundancy as dead config, nearly done once, would have left the pass searching for nothing while printing exactly what a clean run prints. The inventory now declares the accounts explicitly as a contract, and `scripts/audit-topology.mjs` refuses to emit a deny-list when that contract is missing, empty, or names an account the derived terms do not contain — it exits non-zero and the pass stops. A contract nobody checks is just a comment; this one is checked on every run.

### The remote installer is idempotent, so `changed` means something again
*Resolved 2026-07-10. Was LOW (finding 11), but it is what let a BLOCKER hide.*

`remote/install.sh` rewrote `~/.gitconfig` and moved every symlink aside on **every** run, so a config-management play reported `changed` forever and real drift was invisible in the noise — which is how hosts sat frozen on old commits while every play reported success. The installer now rewrites only when content differs and skips a relink when the symlink already resolves to its target. Verified on the fleet: the per-host `~/.dotfiles-backup/` directory counts are frozen at their pre-fix totals across multiple subsequent plays — before the fix, each play on each host minted a new one — which confirms both the gitconfig and the symlinks have stopped churning. (The historical backup directories remain as harmless cruft, available to clear separately.)

### ~~The private repo has no enforced branch protection, and that is accepted~~
*Accepted 2026-07-10. Was LOW (finding 8). **Retired 2026-09-10.** The rationale no longer applies; the entry is kept struck through so the change is visible rather than silent.*

Two of the reassessment triggers below fired together. The private repo moved to the self-hosted forge, where branch protection is not a paid feature, and an agent account gained write access, so self-review no longer covers every change. Its `main` now carries the same forge rule as this repo, plus required CI and code-owner review, declared in its own OpenTofu. The entry is retired rather than re-accepted, because nothing is left to accept. Its original text follows.

The public repo's `main` requires a pull request and rejects direct pushes; the private companion repo — which holds the inventory and the deploy pin, and whose `main` is therefore the other half of the repo-to-fleet gate — cannot have the same, because GitHub reserves branch protection on private repositories for paid plans and this account is on the free tier. Making the repo public to unlock it is not an option: publishing the inventory is the exact exposure the whole audit exists to prevent.

Accepted rather than bought. The maintainer is sole, and every change to that repo has in practice gone through a pull request already — the residual is an *accidental* direct-to-`main` push, not an attacker, since access is the account itself rather than anyone who can open a PR. The enforcement would guard a mistake, not a threat, and the discipline that would prevent the mistake is already in place.

Reassess, and revisit the paid plan, if any of these change: a second contributor gains write access (self-review no longer covers it); the plan changes such that protection becomes available at no additional cost; or a direct-to-`main` push ever does land an unreviewed pin bump on the fleet.

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
