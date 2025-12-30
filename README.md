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
   ```

## Structure

The repository is structured so that running `stow <package>` from the root will symlink the contents of that package to your home directory (`~`), preserving the directory structure.

- **ghostty/**: Ghostty terminal configuration and themes.
- **zsh/**: Zsh shell configuration.
- **vim/**: Vim configuration.
- **git/**: Git global configuration.
- **starship/**: Starship prompt configuration.
- **karabiner/**: Karabiner-Elements configuration.
- **aerospace/**: Aerospace window manager configuration.
