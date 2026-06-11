#!/usr/bin/env bash
# remote/install.sh — Bootstrap dotfiles on a remote Linux VM
#
# Usage:
#   git clone https://github.com/bryankennedy/dotfiles ~/.dotfiles && ~/.dotfiles/remote/install.sh
#
# Or one-liner:
#   bash <(curl -sL https://raw.githubusercontent.com/bryankennedy/dotfiles/master/remote/install.sh)
#
# What it does:
#   1. Clones the repo (if not already present)
#   2. Symlinks vim, tmux, and bash configs into ~
#   3. Installs a lightweight .bashrc that sources core aliases
#   4. Installs a .gitconfig without personal identity (uses git defaults)
#
# Safe to re-run — backs up existing files before overwriting.

set -euo pipefail

DOTFILES_DIR="${DOTFILES_DIR:-$HOME/.dotfiles}"
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
REPO_URL="https://github.com/bryankennedy/dotfiles.git"

# --- Colors ---------------------------------------------------------------
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[0;37m%s\033[0m\n' "$*"; }

# --- Clone if needed ------------------------------------------------------
if [ ! -d "$DOTFILES_DIR" ]; then
  green "Cloning dotfiles into $DOTFILES_DIR..."
  git clone "$REPO_URL" "$DOTFILES_DIR"
else
  dim "Dotfiles already present at $DOTFILES_DIR"
fi

# --- Helpers --------------------------------------------------------------
backup_and_link() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mkdir -p "$BACKUP_DIR"
    mv "$dst" "$BACKUP_DIR/$(basename "$dst")"
    dim "  backed up $(basename "$dst") -> $BACKUP_DIR/"
  fi
  ln -sf "$src" "$dst"
  green "  linked $(basename "$dst")"
}

backup_and_copy() {
  local src="$1" dst="$2"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mkdir -p "$BACKUP_DIR"
    mv "$dst" "$BACKUP_DIR/$(basename "$dst")"
    dim "  backed up $(basename "$dst") -> $BACKUP_DIR/"
  fi
  cp "$src" "$dst"
  green "  copied $(basename "$dst")"
}

# --- Vim ------------------------------------------------------------------
green "\nVim"
backup_and_link "$DOTFILES_DIR/vim/.vimrc" "$HOME/.vimrc"
mkdir -p "$HOME/.vim/colors"
ln -sf "$DOTFILES_DIR/vim/.vim/colors/Tomorrow-Night.vim" "$HOME/.vim/colors/Tomorrow-Night.vim"
dim "  linked color scheme"

# --- Tmux -----------------------------------------------------------------
green "\nTmux"
backup_and_link "$DOTFILES_DIR/tmux/.tmux.conf" "$HOME/.tmux.conf"

# --- Git ------------------------------------------------------------------
green "\nGit"
backup_and_copy "$DOTFILES_DIR/remote/gitconfig" "$HOME/.gitconfig"
backup_and_link "$DOTFILES_DIR/git/.gitignore_global" "$HOME/.gitignore_global"

# --- Bash -----------------------------------------------------------------
green "\nBash"
backup_and_link "$DOTFILES_DIR/remote/bashrc" "$HOME/.bashrc"

# Source it in .bash_profile too (login shells)
if [ ! -f "$HOME/.bash_profile" ] || ! grep -q '.bashrc' "$HOME/.bash_profile" 2>/dev/null; then
  echo '[ -f ~/.bashrc ] && source ~/.bashrc' >> "$HOME/.bash_profile"
  dim "  added .bashrc source to .bash_profile"
fi

# --- Summary --------------------------------------------------------------
echo ""
green "Done! Restart your shell or run: source ~/.bashrc"
if [ -d "$BACKUP_DIR" ]; then
  dim "Backups saved to $BACKUP_DIR"
fi
echo ""
