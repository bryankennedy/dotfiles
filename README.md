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

- **ghostty/**: Ghostty terminal configuration and themes.
- **zsh/**: Zsh shell configuration.
- **vim/**: Vim configuration.
- **git/**: Git global configuration.
- **starship/**: Starship prompt configuration.
- **karabiner/**: Karabiner-Elements configuration. Includes a complex modification that maps the middle mouse button (button3) to F15 for use as the [Hex](https://github.com/kitlangton/Hex) trigger.

  > **Important:** Complex modifications only apply to devices explicitly enabled in Karabiner. After stowing this config, open Karabiner-Elements → **Devices** tab and enable any non-keyboard devices (e.g. your mouse) that should be processed. Without this, complex modification rules will be silently ignored for that device.
- **aerospace/**: Aerospace window manager configuration.
- **wezterm/**: WezTerm terminal configuration.
- **gemini/**: Gemini AI agent global rules (`GEMINI.md`) and global workflows.
