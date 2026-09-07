# herdr fleet — every VM in one sidebar

Run the **local** herdr and let it hold every VM as a **saved SSH machine**. The
client connects to each VM's remote herdr server in the background, and their
workspaces, agents and notifications show up in the local sidebar under Local.
Select a machine (or one of its workspaces) to switch to it; you drive it with
your **local** keybindings.

This needs herdr's **preview channel** — saved machines landed in the
2026-09-06 preview build (`herdr machine …`). Before that, the fleet was one local
workspace per VM with a nested `herdr --remote` client inside it, which streamed
a remote UI into a pane but never let the local server see the remote's agents.
That mode is gone from the launcher; the history is in git.

## How it feeds off itself

The ansible inventory is the single source of truth. Nothing about the VM list
lives in the dotfiles, and nothing about it lives in herdr's own catalog except
what `hf` put there.

```
~/src/infrastructure/ansible/inventory/hosts.yml   (vms group: host, user, herdr_user)
        │  make fleet   (== ansible-playbook playbooks/herdr-fleet.yml, runs locally)
        ├─►  ~/.ssh/config.d/vms-herdr.conf   clean `<name>-herdr` SSH aliases
        └─►  ~/.config/herdr/fleet.json       the fleet, machine-readable
                    │  herdr-fleet (bun)  reads fleet.json, diffs it against
                    ▼                     `herdr machine list --json`
        `herdr machine add <name>-herdr --label <name>`   for each VM not yet saved
                    ▼
        ~/.local/state/herdr/client/endpoints.json   herdr's catalog (labels,
                                                     targets, session names; no
                                                     keys, not stowed from here)
```

Add a VM to the inventory → `hf-sync` → `hf`. Remove one → `hf-sync` →
`hf --prune`. Done.

## Everyday use

```sh
herdr       # that's it: Local opens, saved machines connect in the background
hf-sync     # after editing the inventory: regenerate SSH aliases + fleet.json
hf          # then: save any VM that is not yet a machine
```

Nothing is re-run after a reboot. The catalog persists, the client reconnects,
and a VM that is asleep shows Reconnecting (or Attention) and retries with
backoff without blocking the others. The remote servers keep running through all
of it; disconnecting a machine, or removing it, never stops what runs on the VM.

`herdr-fleet` flags:

| flag | effect |
|------|--------|
| *(none)* | save every reachable VM missing from the catalog; skip asleep and already-saved ones |
| `--prune` | also remove saved fleet machines whose VM left the inventory |
| `--force` | try to save VMs that fail the SSH health check |
| `--only a,b` | restrict to the named VMs (pruning is not evaluated with a partial view) |
| `--dry-run` | print what it would do, change nothing |
| `--no-inventory-check` | trust `fleet.json` without consulting the inventory |
| `--help`, `-h` | usage summary |

Run `hf` from a terminal. `herdr machine add` prepares the remote server and may
need an interactive approval the first time (host key, a herdr install on a fresh
VM); `hf` hands it the terminal for that reason. Machines are matched by SSH
target, so a label edited by hand is put back to the VM name, and only targets
ending in `-herdr` count as fleet machines — a machine you saved by hand for some
other box is never reported or removed.

### Why `hf` checks the inventory before it runs

`fleet.json` is a build artifact. Read on its own it looks identical whether it
was generated a minute ago or a month ago, and that gap is not hypothetical: when
the ansible repo moved from `~/src/ansible` into the infrastructure monorepo,
`hf-sync`'s `cd` failed, the playbook stopped running, and `hf` went on attaching
a VM that had been removed from the inventory and decommissioned.

So `hf` treats the inventory as the authority it claims to be:

- **Inventory missing** → hard failure with the path it looked for. A fleet list
  that can't be checked against its source doesn't get used by default.
- **Inventory present but `fleet.json` disagrees** → the differences are printed
  both up front and under the summary, hosts that are gone from the inventory are
  skipped rather than saved, and hosts newly added to it are named so you know
  what a `hf-sync` would pick up.

If the repo moves again, `export HERDR_FLEET_ANSIBLE_DIR=/path/to/ansible` fixes
both `hf` and `hf-sync` (and `scripts/audit-topology.mjs`) without an edit.
`--no-inventory-check` bypasses all of it for the offline case.

## Keeping local and remote herdr in step

A herdr client refuses to attach to a server whose protocol it does not speak —
0.7.3 spoke protocol 16, 0.8.0 spoke 19, 0.8.2 speaks 20, the 2026-09-06 preview
speaks 22 — and it errors out rather than negotiating down. The Mac upgrades on
its own schedule through `herdr update` (a direct `~/.local/bin` install, not
Homebrew — see `nix-darwin/flake.nix`), so **the fleet has to follow it or every
saved machine goes to Attention at once.** This is not theoretical: the role's
install task was once guarded with `creates:`, which meant it could install herdr
but never upgrade it, and the VMs sat on 0.7.3 for as long as that guard existed.

```sh
herdr update --handoff                # the Mac; `herdr status` then names the build
make herdr-pin TAG=preview-<date>-<sha>   # (in ~/src/infrastructure) prints the two pin lines
#   paste them into inventory/group_vars/vms/vars.yml, commit
make herdr                            # every VM
```

`make herdr` runs the `herdr`-tagged role against the `vms` group. It installs
exactly the `herdr_version` + `herdr_sha256` pinned in `inventory/group_vars/vms/`
from the immutable GitHub release asset and verifies the digest before the file
lands — no `curl | sh`, and deliberately no "latest" (the role refuses an unpinned
host). Bump the pin to move the fleet; `LIMIT=<host>` scopes the run.

**Both the Mac and the fleet run the preview channel** (`[update]` in
`herdr/.config/herdr/config.toml` here; `herdr_channel: preview` in the inventory,
rendered into each VM's managed config so `herdr status` there tells the truth).
Preview builds are cut ahead of stable and bump the protocol first, and preview
cuts land roughly weekly, so the pin bump is a weekly chore — which is what
`make herdr-pin` is for:

- `herdr_version` in the inventory is the exact string `herdr --version` prints
  (`0.8.2-preview.2026-09-06-9e9bc8a14466`); the role derives the GitHub tag
  (`preview-2026-09-06-9e9bc8a14466`, or `v0.8.2` for a stable pin) from it and
  refuses any other shape.
- `make herdr-pin TAG=<tag>` fetches the `herdr-linux-x86_64` digest for that tag
  from GitHub's release API and prints the two lines to paste. It refuses a tag
  with no such asset, and it never edits the inventory — the commit is the review.
  The digest must not come from `herdr.dev/preview.json`: that is the same origin
  as the binary, which is the whole point of the pin. Using preview.json by hand
  to *find* the newest tag is fine.
- The 2026-09-06 preview also added a "stable client endpoint", under which local
  and remote versions no longer have to match exactly. Treat that as slack, not a
  reason to stop pinning: the fleet still has to be on a build that has it, and
  a preview cut can always move what "compatible" means.
- The escape hatch is still `herdr channel set stable` then `herdr update` on the
  Mac, with the fleet pinned back to a `v<version>` tag and `herdr_channel: stable`
  (the role fails if the channel and the pin's shape disagree). Revert the
  config.toml edit that `channel set` makes if you don't want it committed.

**Upgrading the binary does not upgrade a running server.** The replacement is a
rename, so a `herdr server` already running keeps the old inode and keeps speaking
the old protocol. The role detects this and prints the affected PIDs, but stops
there, because stopping that server exits every pane process on the VM. Restart
each host when it's idle:

```sh
ssh <name>-herdr ~/.local/bin/herdr server stop
make herdr LIMIT=<name> UPGRADE_SERVERS=true   # or let the role do it, per host
make herdr UPGRADE_SERVERS=true                # every host at once, when all are idle
```

The same applies locally, where `herdr update --handoff` may avoid the teardown.
A machine that needs a compatible server shows Attention in the sidebar; after
fixing it, `herdr --remote <name>-herdr --handoff` once from a terminal and then
restart the local client, per herdr's docs.

## Keybindings and the remote prefix

With saved machines the client uses your **local** keybindings for every
machine, so `ctrl+a` drives whichever machine is selected. The remote prefix
(`herdr_prefix: ctrl+b` in the ansible inventory, rendered into each VM's
`~/.config/herdr/config.toml` by the `herdr` role) only matters when you bypass
the catalog: `herdr --remote <name>-herdr --remote-keybindings server`, or running
`herdr` after SSHing in. It stays `ctrl+b` so that path keeps working and so the
two never collide if a remote client is ever nested in a local pane again.

Local took over `ctrl+a` from tmux, which Ghostty no longer launches. Avoid
`ctrl+g` for either — it collides with a macOS-level hotkey.

## Worktrees — two agents in one repo

Separate from the fleet: herdr also manages **git worktrees** natively, which is
how you run a second agent in the *same* repo without file collisions. From a git
workspace, the sidebar's **New worktree** action creates a checkout (or checks out
an existing branch), opens it as a workspace, and groups it under the source — run
your second agent there and it operates in an isolated working directory.

Checkouts land at `~/.herdr/worktrees/<repo>/<branch-slug>`, set via the
`[worktrees]` block in `herdr/.config/herdr/config.toml`. They're ephemeral and
untracked, so they live under a dotpath alongside herdr's runtime data rather than
in `~/src`.

herdr's own **Delete worktree checkout…** action runs `git worktree remove` but
leaves the branch behind and does no PR-merge check. For anything that became a PR,
use the `cleanup-worktree` command instead — it verifies the PR merged, deletes the
remote branch, and resets local main. Rough division of labor: **herdr creates and
runs; `cleanup-worktree` does the post-merge teardown.**

## Opting a host out of the sidebar

Set `herdr_fleet: false` on a host in the inventory to keep its `-herdr` SSH
alias (for manual `herdr --remote foo-herdr`) but leave it out of `fleet.json`, so
`hf` never saves it as a machine and `hf --prune` removes it if it was one. To
keep a machine saved but quiet for a while, `herdr machine disable <id>` is the
lighter tool; `hf` leaves disabled machines alone.

## Per-host login user

The `-herdr` alias uses `herdr_user` if set, else `ansible_user`. Where a host's
login account differs from the Ansible user, set `herdr_user` on that host in the
inventory. The inventory stays the only place any account name is written down.
