# Repository structure

The repository is structured so that running `stow <package>` from the root symlinks the contents of that package into your home directory (`~`), preserving the directory structure. On macOS the nix-darwin activation script stows these packages for you — the **canonical list of stowed packages, and the rationale for the command shape, lives in a comment next to the `stow` call in [`nix-darwin/flake.nix`](../nix-darwin/flake.nix)**. This doc describes what each package is for; it does not re-list the package tokens, to avoid drift.

> **This repo is a first pass, not a full mirror of `$HOME`.** Apps installed manually often keep their own configs in `$HOME` that aren't stowed or tracked here, so expect a given machine to have extra config that this repo doesn't know about. A few directories (e.g. `bin/`, `claude/`, `nvim/`) are checked in but intentionally *not* auto-stowed — treat the repo as the tracked core, not the complete picture.

## Stow packages

- **ghostty/**: Ghostty terminal configuration and themes.
- **zsh/**: Zsh shell configuration.
- **vim/**: Vim configuration.
- **git/**: Git global configuration.
- **starship/**: Starship prompt configuration.
- **karabiner/**: Karabiner-Elements configuration. Includes a complex modification that maps the middle mouse button (button3) to F15 for use as the [Hex](https://github.com/kitlangton/Hex) trigger.

  > **Important:** Complex modifications only apply to devices explicitly enabled in Karabiner. After stowing this config, open Karabiner-Elements → **Devices** tab and enable any non-keyboard devices (e.g. your mouse) that should be processed. Without this, complex modification rules will be silently ignored for that device.
- **aerospace/**: Aerospace window manager configuration.
- **wezterm/**: WezTerm terminal configuration.
- **gemini/**: Gemini AI agent global rules (`GEMINI.md`) and global workflows. The workflow files in `global_workflows/` are symlinks into `_skills/`.
- **cursor/**: Cursor AI agent skills. Each `SKILL.md` is a symlink into `_skills/`.
- **tmux/**: tmux configuration (`~/.tmux.conf`). Uses `Ctrl-a` as prefix, vim-style pane navigation, mouse support, and a minimalist status bar.
- **herdr/**: herdr agent-multiplexer config (`~/.config/herdr/config.toml`) — kanagawa theme, `Ctrl-b` prefix, macOS notifications. Only `config.toml` is stowed; herdr's runtime logs/sockets in the same dir are gitignored.

### Manual Stow (optional)

The macOS activation script stows everything for you, so you normally don't run Stow by hand. To (re)link packages manually — e.g. after adding a new package before the next rebuild — run from the repo root with the package list from `nix-darwin/flake.nix`:

```sh
cd ~/src/dotfiles
stow -v -t "$HOME" <packages…>
```

Stowing the packages together in one invocation lets Stow link into existing `~/.config/<app>` paths instead of trying to replace all of `~/.config`.

## Remote VM config (not a stow package)

- **`remote/`**: Lightweight bash-based dotfiles for headless Linux VMs. Has its own installer (`install.sh`) that symlinks shared configs (vim, tmux) and generates a safe gitconfig. See [Remote VM Setup](REMOTE.md).

## App setup scripts (not a stow package)

Some macOS applications store their configuration in `~/Library/Preferences` (via the `defaults` system) rather than dotfiles, so they can't be managed with Stow. The `scripts/` directory contains idempotent setup scripts for these apps.

| Script | App | What it configures |
|--------|-----|--------------------|
| `scripts/hex.sh` | [Hex](https://github.com/kitlangton/Hex) | Sets global hotkey to F15 (pairs with the Karabiner middle-mouse → F15 rule) |

Run a script after installing the corresponding app:

```sh
./scripts/hex.sh
```

## Shared sources (not stow packages)

- **`_skills/`**: Single source of truth for all AI agent workflows/skills. Both the `gemini` and `cursor` packages symlink into here — edit a file once, it updates everywhere.

  To add a new skill:
  1. Create the workflow file in `_skills/` with `name:` and `description:` frontmatter.
  2. Symlink it into the Gemini package: `ln -s ../../../../_skills/<file>.md gemini/.gemini/antigravity/global_workflows/<file>.md`
  3. Create a Cursor skill dir and symlink: `mkdir cursor/.cursor/skills/<name> && ln -s ../../../../_skills/<file>.md cursor/.cursor/skills/<name>/SKILL.md`
