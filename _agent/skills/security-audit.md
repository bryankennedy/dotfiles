---
name: security-audit
description: Audit the local lab (this public dotfiles repo plus the private ansible repo) for leaked secrets and private architecture, prompt-injection vectors into the agent instruction supply chain, and vulnerable or out-of-date dependencies. Run a single pass or all three.
---

You are auditing a two-repo personal lab. Work a pass at a time, verify every finding before reporting it, and write the report at the end.

**Usage.** `$ARGUMENTS` selects the scope: `exposure`, `injection`, `deps`, or empty/`all` for every pass. Run one pass at a time when iterating; run `all` before a push that touches the public repo.

## The system under audit

| Repo | Path | Visibility | Role |
|---|---|---|---|
| dotfiles | `~/src/dotfiles` | **public** | stow packages, agent rules and skills, `remote/install.sh` |
| ansible | `~/src/ansible` | **private** | inventory (real hostnames, accounts), roles, playbooks |

Confirm visibility rather than assuming it — the whole audit hinges on which repo is which:

```sh
for r in dotfiles ansible; do
  printf '%-10s private=%s\n' "$r" "$(cd ~/src/$r && gh repo view --json isPrivate -q .isPrivate)"
done
```

Expect `dotfiles private=false`, `ansible private=true`. If either has flipped, stop and report it as a BLOCKER before running anything else.

Let `gh` infer the repo from the working directory. Parsing the remote URL with `sed -E` and a lazy `+?` quantifier fails on BSD sed, and the failure mode is a *false negative*: the command substitution yields an empty repo name, `gh` falls back to some other repo, and the private repo is reported `private=false`. A check that breaks toward "safe" is worse than no check.

**The load-bearing question.** `remote/install.sh` symlinks `_agent/rules/global.md` to `~/.claude/CLAUDE.md` and `_agent/skills/*.md` into `~/.claude/commands/`. That much is visible here. What turns it into a supply chain is how the fleet *acquires* this repo — which ref it tracks, whether it re-runs the installer, and what gates a merge. Establish those from the private repo during Pass 2 rather than assuming them; most of the injection pass follows from the answer.

Findings about that chain are **private**. Record them in `~/src/ansible/docs/security-findings.md`, never here. Individually such findings are often discoverable; collected into one ranked list they are a plan of attack, and a public repo is the wrong place for one. This constraint binds the report, the baseline, commit messages, and PR bodies alike.

## Severity

- **BLOCKER** — a live secret, or private topology, in the public repo (worktree *or* history); or a path by which unreviewed content becomes agent instructions or executed code.
- **HIGH** — a credible path to one of the above that requires another condition to fire.
- **MEDIUM** — weakens a boundary without breaching it; unpinned supply chain; a known-vulnerable dependency not on an exploitable path.
- **LOW** — hygiene, stale docs, defence in depth.

Do not report a finding you have not confirmed by reading the file. A grep hit is a lead, not a finding. State the file and line.

---

## Pass 1 — Exposure (public ↔ private boundary)

The public repo must contain no credential and no fact about the private infrastructure: no real hostname, no login account, no inventory shape.

**1a. Secrets, worktree and history.** No scanner is installed, but `nix` is, so fetch one on demand rather than hand-rolling entropy checks:

```sh
cd ~/src/dotfiles
nix run nixpkgs#gitleaks -- git . --redact   # commit history
nix run nixpkgs#gitleaks -- dir . --redact   # worktree as it stands
```

Subcommands are `git` and `dir` as of gitleaks 8.30. The older `detect` / `protect` verbs were removed — if you see them in a snippet, it predates the rename and will exit non-zero.

**1b. Private topology in the public repo.** The terms to search for *are themselves the private data*, so this skill must not contain them — writing a deny-list of real hostnames into a public file publishes the very thing it defends. Derive the list at run time from the private inventory, which is already the source of truth for the fleet:

```sh
cd ~/src/dotfiles
node -e '
const fs=require("fs"), os=require("os");
const y=fs.readFileSync(os.homedir()+"/src/ansible/inventory/hosts.yml","utf8");
const t=new Set();
for(const m of y.matchAll(/^\s*(?:ansible_host|ansible_user|herdr_user|gh_host):\s*(\S+)/gm)) t.add(m[1]);
for(const v of [...t]) { const p=v.split("."); if(p.length>2) t.add(p.slice(-2).join(".")); }
[...t].filter(Boolean).forEach(x=>console.log(x));
' > /tmp/topology-terms

while read -r term; do
  [ -z "$term" ] && continue
  git grep -nIFw "$term" -- .                              # tree: exact, word-bounded
  git log --all --oneline -S"$term" | head -3              # history: substring, deliberately broad
done < /tmp/topology-terms
rm -f /tmp/topology-terms
```

The two searches use different strictness on purpose. `git grep -Fw` is word-bounded because a short account name is frequently a substring of some longer, innocuous identifier — a GitHub org, a package name — and unbounded matching floods the report with noise that trains you to skim. The history search stays a plain substring `-S`, accepting that noise, because a missed hit there is a *published* secret you will never think to look for again. Do not "fix" it by adding `\b`: git's pickaxe uses POSIX ERE, where `\b` is not a word boundary, so the search silently returns nothing and the pass reads as clean.

Then check for the *shape* of the private data, independent of its values. These key names are Ansible's own vocabulary and carry no secret:

```sh
git grep -nEI 'ansible_host|ansible_user|inventory_hostname|gh_host' -- .
```

**Known true negatives**, so you do not chase them. The hosting provider's domain appears in `README.md` and `remote/README.md` as a vendor name inside markdown anchor slugs; a slugified domain that happens to collide with an account name is not a disclosure of that account. And the `*-herdr` strings in `zsh/aliases-macos.zsh` are SSH *alias* names — the hostnames and accounts they resolve to live in `~/.ssh/config.d/`, generated from the private inventory and never tracked. Anything else is a finding.

Note the asymmetry the history search exposes: `git grep` clears the worktree, `git log -S` clears the *published record*. A term can be absent from one and present in the other, and only the second matters once a commit is pushed.

**1c. Things that must never be tracked.** `~/.ssh/config` is deliberately untracked and its `Host *-herdr` blocks are generated into `~/.ssh/config.d/` from the private inventory. Confirm nothing has pulled them in:

```sh
git ls-files | grep -iE '(^|/)(\.ssh|id_(rsa|ed25519|ecdsa)|.*\.pem|.*\.key|\.env)' || echo "clean"
```

**1d. Symlinks that escape the repo.** A stow package symlinking to a private path would publish its contents on the next `stow`:

```sh
node -e '
const {execSync}=require("child_process"), p=require("path"), fs=require("fs");
const root=process.cwd(); let bad=0;
execSync("git ls-files -s",{encoding:"utf8"}).split("\n").filter(l=>l.startsWith("120000")).forEach(line=>{
  const f=line.split("\t")[1]; if(!f) return;
  const abs=p.resolve(p.dirname(f), fs.readlinkSync(f));
  if(!abs.startsWith(root+p.sep)){ bad++; console.log("ESCAPES:", f, "->", abs); }
});
console.log(`checked symlinks, ${bad} escaping`);'
```

Every tracked symlink here points into `_agent/`, so the expected result is `0 escaping`. Resolve the path in Node rather than with `realpath -m` — macOS ships BSD `realpath`, which has no `-m`, and the shell version of this check reports *every* symlink as escaping. It prints a count so a clean run is distinguishable from a run that silently matched nothing.

**1e. Gitignore coverage.** Runtime state written into stowed directories must stay out. Confirm the negation patterns still hold (`herdr/.config/herdr/*` with `!config.toml`; the `gemini`/`cursor` skill dirs). A newly stowed package that writes runtime state into its own directory is a new gap.

---

## Pass 2 — Prompt injection and the agent instruction supply chain

Treat every file that reaches an agent's context as executable. The threat is not only a hostile string in a README; it is that this repo *is* the instruction channel.

**2a. Enumerate the instruction surface.** What actually reaches an agent, on every machine:

- `_agent/rules/global.md` → `~/.claude/CLAUDE.md`, auto-loaded into every session
- `_agent/skills/*.md` → `~/.claude/commands/`, `~/.cursor/skills/*/SKILL.md`, `~/.gemini/antigravity/global_workflows/`
- `claude/.claude/CLAUDE.md`, and any `.claude/settings.json` hooks

Re-derive this list from `remote/install.sh` and the `stow` line in `nix-darwin/flake.nix` rather than trusting this one — a new stow package can widen it silently.

**2b. Is the channel gated?** Because merged content becomes instructions, the default branch needs a review gate. Check the push side and the pull side, and write what you find to the private findings file:

```sh
cd ~/src/dotfiles && gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/branches/main/protection" 2>&1 | head -3
grep -rn 'version:' ~/src/ansible/roles/dotfiles/tasks/main.yml   # pinned ref, or moving branch?
```

A 404 from the first means no protection rule. A moving ref in the second means the fleet adopts new commits without a deliberate bump. Either alone is a weakness; together they are a BLOCKER, because nothing stands between a merge and execution across the fleet.

**2c. Network-to-execute.** Every `curl | sh` is an unauthenticated third party writing code that later runs as you. Enumerate them in both repos rather than trusting a list that may have gone stale:

```sh
git -C ~/src/dotfiles grep -nE 'curl [^|]*\| *(ba)?sh' -- .
git -C ~/src/ansible  grep -nE 'curl [^|]*\| *(ba)?sh' -- .
```

Rate each MEDIUM, or HIGH if fetched over plain `http://`, from a repo you do not control, or without a checksum *and* on a path that runs as root.

**2d. Hooks, permissions, and MCP.** A hook is arbitrary command execution on a tool event. An MCP server's *tool descriptions* are injected into the model's context, so a hostile server is a direct injection vector — it does not need the model to call a tool, only to read one.

```sh
node scripts/audit-mcp.mjs                      # every MCP server that can reach an agent
git grep -lniE 'mcpServers|"hooks"' -- .        # anything tracked in the repo
node -e 'const c=require(require("os").homedir()+"/.claude/settings.json");
  console.log("defaultMode:", c.permissions?.defaultMode);
  console.log("allow entries:", c.permissions?.allow?.length ?? 0);
  console.log("hooks:", c.hooks ? JSON.stringify(c.hooks) : "none");'
```

**Do not grep `mcpServers` and conclude there are none.** Nothing is declared in any settings file on this machine, and this pass reported "no MCP servers" while five remote Cloudflare servers were live in every session. They arrive through `enabledPlugins`: a plugin ships its own `.mcp.json`, and enabling the plugin enables its servers. `scripts/audit-mcp.mjs` resolves both sources. A check that reads only the obvious location returns a confident, wrong answer.

Treat each remote server as a dependency, not as configuration: who controls the endpoint, and what would a malicious tool description make an agent do? Note `defaultMode` too — under `auto`, an injected instruction executes against an agent that is already auto-approving, which multiplies the severity of everything else in this pass.

Any growth in `permissions.allow`, any hook, or any added MCP server is a finding. Describe what it would let an attacker do, not merely that it exists.

**2e. Attacker-influenced content that agents read.** Rank by who can write it: git commit messages and PR bodies on a *public* repo (anyone), `~/.bashrc.local` (ansible-managed, so whoever controls the private repo), MOTD, and any file a skill `cat`s into context. A skill that reads a URL or an untrusted file and acts on the result is a BLOCKER — quote the line.

---

## Pass 3 — Dependencies and CVEs

Nothing here has a lockfile in the usual sense; the pins live in `flake.nix`, `flake.lock`, and Homebrew.

**3a. Nix inputs.** Staleness is the risk — `flake.lock` pins nixpkgs, so security updates do not arrive until you bump it:

```sh
cd ~/src/dotfiles/nix-darwin
nix flake metadata --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);for(const[k,v]of Object.entries(j.locks.nodes)){if(v.locked?.lastModified)console.log(k,new Date(v.locked.lastModified*1000).toISOString().slice(0,10))}})'
```

Flag any input older than ~60 days as MEDIUM. `nix flake update` bumps them; rebuild with `compy`.

**3b. Homebrew.** `nix-homebrew` runs with `onActivation.cleanup = "zap"`, so the declared list in `flake.nix` is the whole surface:

```sh
brew outdated --greedy
```

**3c. Known-vulnerable packages.** This pass used to run `osv-scanner scan source ~/src/dotfiles` and report a clean result. That command checked **nothing**: osv-scanner reads lockfiles, and this repo has none. It printed *"No package sources found"* and the audit read the silence as a pass. Never do that again — an unrun check is not a clean one.

There are three dependency surfaces here, and they need three different answers.

**npm, via the global bun install.** The largest surface, and the one nobody was scanning. `~/.bun/install/global/bun.lock` pins 141 packages (claude-code, wrangler, vite and their transitive deps), and osv-scanner reads it:

```sh
nix run nixpkgs#osv-scanner -- scan source ~/.bun/install/global
```

Verified: it resolves the lockfile and reports per-package findings against the OSV database. Point it at `~/.bun/install/global`, never at this repo.

**The nix closure.** `vulnix` matches the installed system closure against NVD:

```sh
nix run nixpkgs#vulnix -- --system --json > /tmp/vulnix.json   # exit 2 == vulns found
```

Two traps. The first run downloads the whole NVD feed (~322 MB) and takes several minutes; later runs are fast. And **vulnix exits 2 when it finds vulnerabilities** — that is a result, not a failure. A `set -e` script or a naive exit-code check treats a successful scan as a crash and, worse, treats a *clean* scan (exit 0) as identical to a scan that never ran.

Read its output as **leads, not findings**. vulnix matches derivation name and version against NVD CPEs. It cannot see the patches nixpkgs backports, and it cannot distinguish packages that merely share a name: a run here flagged `curl-0.4.49` — the Rust *crate* — against CVEs for the C library `curl`, and rated ShellCheck 9.8. Confirm every hit against the real package before it goes in the report.

**Homebrew — no vulnerability feed exists.** OSV has no Homebrew ecosystem, and `brew` ships no CVE command. Nothing here can tell you whether an installed formula is vulnerable. Staleness (3b) is the only available signal and upgrade cadence is the only control. Say this out loud in the report: Homebrew is *unscanned*, not *clean*. Given `onActivation.cleanup = "zap"`, the declared list in `flake.nix` is the whole surface, which at least bounds it.

**One-off package queries.** When you need to check a specific package and version — something installed outside a lockfile — query OSV directly rather than guessing:

```sh
curl -sS -X POST -d '{"package":{"name":"lodash","ecosystem":"npm"},"version":"4.17.15"}' \
  https://api.osv.dev/v1/query | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const v=JSON.parse(s).vulns||[]; console.log(v.length?v.map(x=>x.id).join("\n"):"no known vulnerabilities")})'
```

That example is a positive control: it must return several GHSA ids. If it returns nothing, your query is malformed, not the package clean — verify the control before trusting a negative.

Cross-check anything reported against whether the package is actually reachable in this setup before rating it above MEDIUM.

**3d. Pinned-by-hand tools.** `herdr` is tracked deliberately (an earlier `herdr-mx` trial was reverted for a cursor-flicker regression). Compare the installed version against upstream, and read the release notes for security content, not just features:

```sh
herdr --version
gh api repos/ogulcancelik/herdr/releases/latest -q .tag_name
```

Note the asymmetry: the Mac gets herdr from Homebrew, the VMs from `curl https://herdr.dev/install.sh | sh` in the ansible role. They drift independently, and the VM path has no checksum.

**3e. JS.** `bin/bin/herdr-fleet` runs under bun with no `package.json` and no dependencies. If one appears, `bun audit` becomes part of this pass.

---

## Reporting

Write findings newest-audit-first into `docs/security-baseline.md`, which is the record of what has been *accepted* and why. Its purpose is to make re-runs quiet: a finding already present there with a rationale and a date is not re-reported, it is re-verified. If a baselined item's rationale no longer holds, say so loudly.

Then summarize to the user:

1. A table — severity, pass, file:line, one-sentence finding.
2. **Blockers first**, each with the concrete failure: who does what, and what they get.
3. What you checked and found clean, so the silence is legible.
4. What you could not check, and why. Never let an unrun check read as a pass.

**Clean and unscanned are different words.** Every check here can produce a silence that means "I found nothing to look at" rather than "I looked and found nothing" — and the two are indistinguishable in the output. Pass 3c reported a clean dependency scan because osv-scanner was pointed at a directory with no lockfile. Pass 2d reported no MCP servers while five were live, because it read the one file that happened not to declare them. Both printed exactly what a genuinely clean result prints.

So before writing a check into the report as passing, ask what it would have printed had it never run — and if the answer is "the same thing," make it prove it looked: a count of packages scanned, a positive control that must fail, a sample of what it saw. A count of zero and a scan of zero things are not the same claim.

Do not fix anything during the audit. Report, then ask. Fixes and audits do not belong in the same commit.
