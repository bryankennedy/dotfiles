# herdr fleet — one workspace per VM

Run the **local** herdr as the top-level multiplexer and attach every VM as its
own workspace, each pointed at that VM's **remote** herdr server. Switch VMs
with `prefix+w` (the workspace picker); drive whichever remote you're focused on
with its own prefix.

## How it feeds off itself

The ansible inventory is the single source of truth. Nothing about the VM list
lives in the dotfiles.

```
~/src/ansible/inventory/hosts.yml   (vms group: host, user, herdr_user)
        │  ansible-playbook playbooks/herdr-fleet.yml   (runs locally)
        ├─►  ~/.ssh/config.d/vms-herdr.conf   clean `<name>-herdr` SSH aliases
        └─►  ~/.config/herdr/fleet.json       work-list for the launcher
                    │  herdr-fleet (bun)  reads fleet.json
                    ▼
        local herdr: `herdr workspace create` + `herdr pane run`
                     → one workspace per VM running
                       `herdr --remote <name>-herdr --remote-keybindings server`
```

Add a VM to the inventory → `hf-sync` → `hf`. Done.

## Everyday use

```sh
hf-sync     # regenerate SSH aliases + fleet.json from the inventory
hf          # attach every reachable VM as a workspace (idempotent)
```

`herdr-fleet` flags:

| flag | effect |
|------|--------|
| *(none)* | attach every reachable VM; skip unreachable and already-open ones |
| `--force` | attach even VMs that fail the SSH health check |
| `--only a,b` | restrict to the named VMs |
| `--dry-run` | print what it would do, change nothing |

It is safe to re-run: existing workspaces are left as-is, so `hf` after a reboot
just reattaches whatever isn't already up. A VM that's asleep is skipped (with a
warning) instead of hanging the whole fleet on an SSH timeout.

## Prefix hygiene (herdr inside herdr)

The launcher starts each remote client with `--remote-keybindings server`, so
the inner (remote) herdr uses the **remote** box's configured prefix, while your
outer/local herdr keeps its own. The remotes must therefore use a *different*
prefix, or the outer herdr swallows every keypress and the remote panes can't be
driven. They're set via `herdr_prefix` in the ansible inventory
(`inventory/group_vars/vms.yml`), rendered into each VM's `~/.config/herdr/config.toml`
by the `herdr` role.

**So: `ctrl+a` drives local, `ctrl+b` drives whichever remote you're focused on.**

Local took over `ctrl+a` from tmux, which Ghostty no longer launches. Avoid
`ctrl+g` for either — it collides with a macOS-level hotkey.

## Opting a host out of auto-launch

Set `herdr_fleet: false` on a host in the inventory to keep its `-herdr` SSH
alias (for manual `herdr --remote foo-herdr`) but drop it from `hf`'s work-list.

## Per-host login user

The `-herdr` alias uses `herdr_user` if set, else `ansible_user`. Where a host's
login account differs from the Ansible user, set `herdr_user` on that host in the
inventory. The inventory stays the only place any account name is written down.
