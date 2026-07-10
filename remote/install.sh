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
#   3. Ensures the tmux-256color terminfo entry exists (ncurses-term)
#   4. Installs a lightweight .bashrc that sources core aliases
#   5. Generates a .gitconfig from the shared git/.gitconfig, stripping
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
  # Already correct? Do nothing. Without this the installer moved every symlink
  # aside and recreated it on every run, minting a fresh ~/.dotfiles-backup/
  # directory each time — one host had eight of them, growing without bound — and
  # churning files that had not changed since the day they were linked.
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    dim "  $(basename "$dst") already linked"
    return
  fi
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

# --- Terminfo -------------------------------------------------------------
# tmux sets default-terminal to tmux-256color, which propagates as TERM into
# this VM over SSH. If the entry is missing, programs error with "unknown
# terminal". It ships in ncurses-term; install via whatever package manager
# is available (best-effort — non-fatal if we can't).
green "\nTerminfo"
if infocmp tmux-256color >/dev/null 2>&1; then
  dim "  tmux-256color already present"
else
  green "  installing tmux-256color (ncurses-term)..."
  if   command -v apt-get &>/dev/null; then sudo apt-get update -qq && sudo apt-get install -y ncurses-term
  elif command -v dnf     &>/dev/null; then sudo dnf install -y ncurses-term
  elif command -v yum     &>/dev/null; then sudo yum install -y ncurses-term
  elif command -v apk     &>/dev/null; then sudo apk add ncurses-terminfo
  elif command -v zypper  &>/dev/null; then sudo zypper install -y ncurses-term
  else red "  no known package manager found — install ncurses-term manually"; fi
  if infocmp tmux-256color >/dev/null 2>&1; then
    green "  tmux-256color installed"
  else
    red "  tmux-256color still missing — apps may report 'unknown terminal'"
  fi
fi

# --- Git ------------------------------------------------------------------
# Generate .gitconfig from the shared git/.gitconfig, stripping the [user]
# block (contains personal identity) and appending [include] for local overrides.
green "\nGit"
STRIP_USER='/^\[user\]/,/^\[/{ /^\[user\]/d; /^\[/!d; }'
gitconfig_managed=$(
  sed "$STRIP_USER" "$DOTFILES_DIR/git/.gitconfig"
  printf '\n[include]\n\tpath = ~/.gitconfig.local\n'
)
# Rewrite only when the managed part actually differs, and compare the EXISTING
# file with its [user] block stripped. Configuration management adds that block
# after this script runs (ansible's git_identity role does), so comparing the
# whole file always differs and we would clobber the identity on every play —
# which is what used to happen. git_identity then restored it and reported
# "changed" forever, so `changed` stopped meaning anything and real drift hid in
# the noise. Stripping [user] from both sides asks the only question that
# matters: is the part this script owns already correct?
if [ -f "$HOME/.gitconfig" ] && [ "$(sed "$STRIP_USER" "$HOME/.gitconfig")" = "$gitconfig_managed" ]; then
  dim "  .gitconfig already current (preserving [user])"
else
  printf '%s\n' "$gitconfig_managed" | backup_and_write "$HOME/.gitconfig"
fi
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
  # Pinned to a reviewed installer commit, not the moving `main` branch. zoxide's
  # installer has no version flag — it always fetches the latest release from the
  # GitHub API — so this cannot pin the binary version; what it pins is the *code
  # we pipe into a shell*, which is the part that could turn hostile between runs.
  # Bump the sha after reading the diff at github.com/ajeetdsouza/zoxide/commits/main/install.sh.
  curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/ce469159012efac2c4e005c6023e7f730ba65047/install.sh | sh 2>&1
  green "  installed zoxide"
fi

# --- Bun ------------------------------------------------------------------
green "\nBun"
if command -v bun &> /dev/null || [ -x "$HOME/.bun/bin/bun" ]; then
  dim "  bun already installed"
elif ! command -v unzip &> /dev/null; then
  # The bun installer needs unzip to unpack the binary
  red "  skipped bun: 'unzip' not found (install it, then re-run)"
else
  green "  installing bun..."
  # Pre-export so the installer sees its bin dir on PATH and skips
  # appending exports to ~/.bashrc (a symlink into this repo)
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # Pinned version: the installer's first positional arg is a specific release tag
  # (it downloads releases/download/<tag>/…), so the payload is deterministic
  # rather than latest-at-bootstrap. `herdr --remote` does not gate bun, so unlike
  # herdr this version is the one the VM actually keeps. Bump the tag deliberately.
  curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.14" 2>&1 | tail -n 3
  green "  installed bun"
fi

# --- Claude Code plugins --------------------------------------------------
# Enable standard plugins by merging into ~/.claude/settings.json. Runs after
# Bun so a JS runtime is available (prefers an existing node, falls back to the
# bun installed above). Idempotent — only sets the keys it manages.
green "\nClaude Code plugins"
CLAUDE_JS_RUNTIME=""
if   command -v node &>/dev/null;        then CLAUDE_JS_RUNTIME="node"
elif command -v bun  &>/dev/null;        then CLAUDE_JS_RUNTIME="bun"
elif [ -x "$HOME/.bun/bin/bun" ];        then CLAUDE_JS_RUNTIME="$HOME/.bun/bin/bun"
fi
if [ -n "$CLAUDE_JS_RUNTIME" ]; then
  "$CLAUDE_JS_RUNTIME" -e "
    const { readFileSync, writeFileSync, mkdirSync } = require('fs');
    const dir = process.env.HOME + '/.claude';
    const file = dir + '/settings.json';
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (_) {}
    cfg.extraKnownMarketplaces = cfg.extraKnownMarketplaces || {};
    cfg.extraKnownMarketplaces['claude-plugins-official'] = { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } };
    cfg.enabledPlugins = cfg.enabledPlugins || {};
    cfg.enabledPlugins['frontend-design@claude-plugins-official'] = true;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  "
  green "  enabled frontend-design@claude-plugins-official"
else
  red "  skipped: no node/bun runtime found to update settings.json"
fi

# --- Summary --------------------------------------------------------------
echo ""
green "Done! Restart your shell or run: source ~/.bashrc"
if [ -d "$BACKUP_DIR" ]; then
  dim "Backups saved to $BACKUP_DIR"
fi
echo ""
