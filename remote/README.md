# Remote VM Dotfiles

Lightweight bash-based config for headless Linux VMs.

See the main [README](../README.md#remote-vm-setup-exedev-cloud-vms-etc) for full documentation.

## Quick reference

```sh
# Fresh VM install
git clone https://github.com/bryankennedy/dotfiles ~/.dotfiles && ~/.dotfiles/remote/install.sh

# Update after pulling changes
cd ~/.dotfiles && git pull        # symlinked files update automatically
~/.dotfiles/remote/install.sh     # re-run to regenerate .gitconfig

# Set git identity
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## Files

| File | Purpose |
|------|--------|
| `install.sh` | Installer — clones repo, symlinks configs, generates gitconfig, installs zoxide, wires up Claude Code commands. Safe to re-run. |
| `bashrc` | Bash config — PATH, prompt, history, zoxide (`j`), sources `zsh/aliases-core.zsh`. Symlinked to `~/.bashrc`. |

## What lives where

- **Shared with mac** (symlinked, not duplicated): `vim/.vimrc`, `tmux/.tmux.conf`, `git/.gitignore_global`, `zsh/aliases-core.zsh`, `_agent/rules/global.md`, `_agent/skills/*.md`
- **Generated at install** (to strip personal data): `~/.gitconfig`
- **Per-VM overrides** (not checked in): `~/.bashrc.local`, `~/.gitconfig.local`
