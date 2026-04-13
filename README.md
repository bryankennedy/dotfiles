# Dotfiles

My personal configuration files managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

- **Git**
- **Homebrew** (for bootstrap tools)
- **GNU Stow** (installed either via nix-darwin Homebrew config below, or manually with `brew install stow`)

## Installation (fresh machine)

### 1) Clone the repository

```sh
git clone https://github.com/yourusername/dotfiles.git ~/src/dotfiles
cd ~/src/dotfiles
```

### 2) Apply nix-darwin system config (recommended)

This repo includes a `nix-darwin/flake.nix` that manages Homebrew formulas and casks.

```sh
cd ~/src/dotfiles
git add nix-darwin/flake.nix nix-darwin/flake.lock
cd nix-darwin
sudo darwin-rebuild switch --flake .#simple
```

Notes:
- `darwin-rebuild switch` must be run as root on recent nix-darwin versions.
- Flakes only see Git-tracked files; stage `flake.nix`/`flake.lock` before rebuilding.

### 3) Stow dotfiles into `$HOME`

Run stow from the repo root and pass explicit packages:

```sh
cd ~/src/dotfiles
stow -v -t "$HOME" ghostty wezterm karabiner zsh vim git starship aerospace gemini cursor tmux
```

Why this command shape matters:
- Several packages include `.config/*`.
- Stowing these packages together lets Stow link into existing `~/.config/<app>` paths instead of trying to replace all of `~/.config`.

### 4) Regenerate Antidote plugin bundle (required on a new machine)

The checked-in `~/.zsh_plugins.zsh` can reference stale cache paths from another machine. Rebuild it locally:

```sh
rm -f ~/.zsh_plugins.zsh
antidote bundle < ~/.zsh_plugins.txt > ~/.zsh_plugins.zsh
exec zsh
```

If plugin download paths are still missing:

```sh
antidote update
antidote bundle < ~/.zsh_plugins.txt > ~/.zsh_plugins.zsh
exec zsh
```

### 5) Optional verification

```sh
ls -l ~/.zshrc ~/.gitconfig ~/.vimrc ~/.config/ghostty ~/.config/wezterm ~/.config/karabiner ~/.config/starship.toml
command -v starship antidote stow rg
source ~/.zshrc
alias l c
```

Notes:
- `zsh/.zshrc` loads `profile.zsh` and `aliases.zsh` relative to the location of `~/.zshrc`, so this repo can live at `~/src/dotfiles` (or any other path) without editing hardcoded paths.

## App Setup Scripts

Some macOS applications store their configuration in `~/Library/Preferences` (via the `defaults` system) rather than dotfiles, so they can't be managed with Stow. The `scripts/` directory contains idempotent setup scripts for these apps.

| Script | App | What it configures |
|--------|-----|--------------------|
| `scripts/hex.sh` | [Hex](https://github.com/kitlangton/Hex) | Sets global hotkey to F15 (pairs with the Karabiner middle-mouse → F15 rule) |

Run a script after installing the corresponding app:

```sh
./scripts/hex.sh
```

## Structure

The repository is structured so that running `stow <package>` from the root will symlink the contents of that package to your home directory (`~`), preserving the directory structure.

### Stow packages

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

### Shared sources (not stow packages)

- **`_skills/`**: Single source of truth for all AI agent workflows/skills. Both the `gemini` and `cursor` packages symlink into here — edit a file once, it updates everywhere.

  To add a new skill:
  1. Create the workflow file in `_skills/` with `name:` and `description:` frontmatter.
  2. Symlink it into the Gemini package: `ln -s ../../../../_skills/<file>.md gemini/.gemini/antigravity/global_workflows/<file>.md`
  3. Create a Cursor skill dir and symlink: `mkdir cursor/.cursor/skills/<name> && ln -s ../../../../_skills/<file>.md cursor/.cursor/skills/<name>/SKILL.md`

# Considered and rejected tools
* Zellij - Too heavy for my simple tmux usage. Don't need floating panes.
* Oh my zsh - Too heavy. Used to use, but the terminal started slowing down after a few years.
