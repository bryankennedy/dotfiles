# Dotfiles

My personal configuration files managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

- **Git**
- **GNU Stow**:
  ```sh
  brew install stow
  ```

## Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/dotfiles.git ~/dotfiles
   cd ~/dotfiles
   ```

2. **Apply configurations:**
   Use `stow` to symlink the configurations to your home directory.

   **Apply all configurations:**
   ```sh
   stow .
   ```

   **Apply individual configurations:**
   ```sh
   stow ghostty
   stow zsh
   stow vim
   stow git
   stow starship
   stow karabiner
   stow aerospace
   stow wezterm
   stow gemini
   stow cursor
   ```

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

### Shared sources (not stow packages)

- **`_skills/`**: Single source of truth for all AI agent workflows/skills. Both the `gemini` and `cursor` packages symlink into here — edit a file once, it updates everywhere.

  To add a new skill:
  1. Create the workflow file in `_skills/` with `name:` and `description:` frontmatter.
  2. Symlink it into the Gemini package: `ln -s ../../../../_skills/<file>.md gemini/.gemini/antigravity/global_workflows/<file>.md`
  3. Create a Cursor skill dir and symlink: `mkdir cursor/.cursor/skills/<name> && ln -s ../../../../_skills/<file>.md cursor/.cursor/skills/<name>/SKILL.md`
