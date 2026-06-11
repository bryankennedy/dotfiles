#!/usr/bin/env bash
# remote/install.sh — Bootstrap dotfiles on a remote Linux VM
#
# Usage:
#   git clone https://github.com/bryankennedy/dotfiles ~/.dotfiles && ~/.dotfiles/remote/install.sh
#
# Or one-liner:
#   bash <(curl -sL https://raw.githubusercontent.com/bryankennedy/dotfiles/main/remote/install.sh)
#
# What it does:
#   1. Clones the repo (if not already present)
#   2. Symlinks vim, tmux, and bash configs into ~
#   3. Installs a lightweight .bashrc that sources core aliases
#   4. Generates a .gitconfig from the shared git/.gitconfig, stripping
#      personal identity and adding [include] for local overrides
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

backup_and_write() {
  local dst="$1"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    mkdir -p "$BACKUP_DIR"
    mv "$dst" "$BACKUP_DIR/$(basename "$dst")"
    dim "  backed up $(basename "$dst") -> $BACKUP_DIR/"
  fi
  # Content comes from stdin
  cat > "$dst"
  green "  generated $(basename "$dst")"
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
# Generate .gitconfig from the shared git/.gitconfig, stripping the [user]
# block (contains personal identity) and appending [include] for local overrides.
green "\nGit"
{
  sed '/^\[user\]/,/^\[/{ /^\[user\]/d; /^\[/!d; }' "$DOTFILES_DIR/git/.gitconfig"
  printf '\n[include]\n\tpath = ~/.gitconfig.local\n'
} | backup_and_write "$HOME/.gitconfig"
backup_and_link "$DOTFILES_DIR/git/.gitignore_global" "$HOME/.gitignore_global"

# --- Bash -----------------------------------------------------------------
green "\nBash"
backup_and_link "$DOTFILES_DIR/remote/bashrc" "$HOME/.bashrc"

# Source it in .bash_profile too (login shells)
if [ ! -f "$HOME/.bash_profile" ] || ! grep -q '.bashrc' "$HOME/.bash_profile" 2>/dev/null; then
  echo '[ -f ~/.bashrc ] && source ~/.bashrc' >> "$HOME/.bash_profile"
  dim "  added .bashrc source to .bash_profile"
fi

# --- Claude Code ----------------------------------------------------------
# Symlink global rules and commands into ~/.claude/ so Claude Code picks
# them up. Uses the same _agent/ source files as the macOS stow setup.
green "\nClaude Code"
mkdir -p "$HOME/.claude/commands"

# Global rules (CLAUDE.md)
# Only link if there isn't already a non-dotfiles CLAUDE.md (e.g. from Shelley)
if [ -L "$HOME/.claude/CLAUDE.md" ] || [ ! -e "$HOME/.claude/CLAUDE.md" ]; then
  ln -sf "$DOTFILES_DIR/_agent/rules/global.md" "$HOME/.claude/CLAUDE.md"
  green "  linked CLAUDE.md"
else
  dim "  skipped CLAUDE.md (existing non-symlink file)"
fi

# Commands (symlink each skill)
for skill in "$DOTFILES_DIR"/_agent/skills/*.md; do
  name=$(basename "$skill")
  ln -sf "$skill" "$HOME/.claude/commands/$name"
  green "  linked command: $name"
done

# --- Zoxide ---------------------------------------------------------------
green "\nZoxide"
if command -v zoxide &> /dev/null; then
  dim "  zoxide already installed"
else
  green "  installing zoxide..."
  curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | sh 2>&1
  green "  installed zoxide"
fi

# --- Summary --------------------------------------------------------------
echo ""
green "Done! Restart your shell or run: source ~/.bashrc"
if [ -d "$BACKUP_DIR" ]; then
  dim "Backups saved to $BACKUP_DIR"
fi
echo ""
