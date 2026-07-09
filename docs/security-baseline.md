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

### Git identity in `git/.gitconfig`
*Accepted 2026-07-09.* Real name and email, matched because the inventory's `ansible_user` is derived from the same first name. This is the authorship identity on every public commit already; the repo cannot hide what `git log` publishes.

### 21 gitleaks hits across 15 files under the vendor-installed plugin skill dirs
*Accepted 2026-07-09, first full audit.* `gitleaks dir` walks the filesystem, not the index, so it reaches the Cloudflare plugin's reference docs that Cursor and Gemini auto-install into the stowed `cursor/.cursor/skills/` and `gemini/.gemini/antigravity/skills/` directories. All 15 files are gitignored — verified with `git check-ignore`, 15 of 15 — so `git add -A` cannot sweep them in. Reading the hits confirms they are documentation placeholders (`YOUR_API_TOKEN`) and one deliberate anti-pattern example labelled "❌ NEVER". No credential. Re-verify the ignore rules, not the file contents: the rules are what makes this safe.

### The exposure pass matches its own source
*Accepted 2026-07-09, first full audit.* `_agent/skills/security-audit.md` contains the grep patterns it runs, so passes 1b, 2c, and 2d each return hits on the skill file itself. Noise, not signal — but it does mean a real finding could hide next to a self-match. Read the file and line before dismissing.

### Tracked symlinks pointing outside their stow package
*Accepted 2026-07-09.* All 15 tracked symlinks resolve into `_agent/`, inside the repo. This is the intended single-source-of-truth layout for agent rules and skills. The check exists to catch a symlink escaping the repo entirely, which would publish private content on the next `stow`.

---

## Open

The first full audit ran 2026-07-09. Its open findings are recorded in the **private** ansible repo at `docs/security-findings.md`, not here. See `docs/decisions/DOT-1.md` for why: a ranked list of a system's weaknesses does not belong in a public repo, however discoverable each item is on its own.

## Known gaps in the audit itself

Recorded so an unrun check never reads as a pass.

- **Pass 3c checks nothing.** `osv-scanner scan source` reports "No package sources found" against this repo: it understands lockfiles, and the pins here live in `flake.lock` and Homebrew, neither of which it parses. A clean result from that command means the scanner found nothing to scan, not that nothing is vulnerable. Vulnerability data for the Nix and Homebrew surfaces has to come from elsewhere.
- **Pass 2d's stated baseline is wrong about MCP.** The skill says "no MCP servers." No server is declared in any settings file, but enabled plugins supply them — `cloudflare@cloudflare` contributes MCP tools whose descriptions enter the model's context. Check `enabledPlugins`, not just `mcpServers`.
