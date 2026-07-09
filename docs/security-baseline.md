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

### Fixed 2026-07-09 — pass 3c scanned nothing

`osv-scanner scan source ~/src/dotfiles` reported "No package sources found" and the audit read that silence as a clean dependency scan. It reads lockfiles; this repo has none.

Now three surfaces, three answers. **npm** is scanned properly — `~/.bun/install/global/bun.lock` pins 141 packages and osv-scanner resolves it, printing the package count so a clean result cannot be confused with an empty one. The **nix closure** is scanned with `vulnix --system`, whose output is leads rather than findings: it matches names against NVD blind to nixpkgs' backported patches, and on its first run flagged the Rust crate `curl` against C-library CVEs. **Homebrew has no vulnerability feed at all** — no OSV ecosystem, no `brew` CVE command — so it is reported as *unscanned*, never as clean.

### Fixed 2026-07-09 — pass 2d reported no MCP servers while five were live

The check grepped `mcpServers` in the settings files, found none declared, and concluded there were none. Enabled plugins supply their own: `cloudflare@cloudflare` contributes five remote MCP servers whose tool descriptions enter the model's context on every session.

`scripts/audit-mcp.mjs` now resolves both sources — servers declared in settings, and servers reachable via `enabledPlugins` — and prints the transport and origin of each.

### The rule both failures share

Each check printed exactly what a genuinely clean result prints. Before recording a check as passing, ask what it would have printed had it never run; if the answer is "the same thing," make it prove it looked — a package count, a positive control that must fail, a sample of what it saw.
