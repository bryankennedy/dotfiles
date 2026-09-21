# Remote VM Setup (exe.dev, cloud VMs, etc.)

A lightweight bash-based config for headless Linux VMs. Includes vim, tmux, git, and your core aliases — no macOS dependencies, no personal identity leaked.

## Quick install

```sh
git clone https://github.com/bryankennedy/dotfiles ~/.dotfiles && ~/.dotfiles/remote/install.sh
```

## What gets installed

| File | Source | Method |
|------|--------|--------|
| `~/.bashrc` | `remote/bashrc` | Symlinked — lightweight bash config, git-aware prompt |
| `~/.vimrc` | `vim/.vimrc` | Symlinked (shared with mac) |
| `~/.vim/colors/` | `vim/.vim/colors/` | Symlinked (Tomorrow-Night color scheme) |
| `~/.tmux.conf` | `tmux/.tmux.conf` | Symlinked (shared with mac) |
| `~/.gitconfig.dotfiles` | `git/.gitconfig` | **Generated** — strips `[user]` block, adds `[include]` for local overrides |
| `~/.gitconfig` | — | Gets an `[include]` of `~/.gitconfig.dotfiles`, once. Everything else in it is yours |
| `~/.gitignore_global` | `git/.gitignore_global` | Symlinked (shared with mac) |
| `~/.claude/CLAUDE.md` | `_agent/rules/global.md` | Symlinked (shared with mac) |
| `~/.claude/commands/*.md` | `_agent/skills/*.md` | Symlinked (shared with mac) |

Core aliases from `zsh/aliases-core.zsh` are sourced by the bashrc.

The installer also:
- Installs [zoxide](https://github.com/ajeetdsouza/zoxide) for fast directory jumping (`j`, matching macOS)
- Symlinks Claude Code global rules (`~/.claude/CLAUDE.md`) and commands (`~/.claude/commands/`) from `_agent/` — the same source files used by the macOS stow setup

## Post-install: set your git identity

```sh
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

Or create `~/.gitconfig.local` (included automatically via `[include]`).

## Updating

Most configs are symlinked, so pulling new changes applies them immediately:

```sh
cd ~/.dotfiles && git pull
```

The one exception is `~/.gitconfig.dotfiles` — it’s generated (not symlinked) to avoid leaking your mac identity. Re-run the installer to regenerate it after changing `git/.gitconfig`:

```sh
~/.dotfiles/remote/install.sh
```

The installer is safe to re-run. It backs up any existing files to `~/.dotfiles-backup/<timestamp>/` before overwriting.

`~/.gitconfig` is not the installer's file. Your identity, credential helpers and anything else `git config --global` writes live there, after the `[include]`, so they override the shared defaults. The installer rewrites it only when the include is missing: on a first install, or once on a VM whose `~/.gitconfig` the old installer generated whole. That one rewrite keeps every line the shared config does not supply and backs up the original ([DOT-28](decisions/DOT-28.md)).

## Per-VM customization

These files are never checked in and are sourced automatically:

| File | Purpose |
|------|--------|
| `~/.bashrc.local` | Extra bash config, aliases, PATH additions |
| `~/.gitconfig.local` | Git identity, per-VM git settings |

## Alias architecture

Aliases are split into two files:

- **`zsh/aliases-core.zsh`** — Portable aliases (navigation, git, listing, extraction). Sourced by both the macOS zsh config and the remote bash config.
- **`zsh/aliases-macos.zsh`** — macOS-only aliases (Antigravity, pbcopy, mvim, nix-darwin, etc.). Only loaded on Darwin.

The existing `zsh/aliases.zsh` is now a thin loader that sources both files.

To add a new alias, put it in `aliases-core.zsh` if it’s portable, or `aliases-macos.zsh` if it needs macOS tools. Both mac and VM environments pick up core changes automatically.
