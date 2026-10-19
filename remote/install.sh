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
#   2. Symlinks vim, neovim, tmux, and bash configs into ~
#   3. Ensures the tmux-256color terminfo entry exists (ncurses-term)
#   4. Installs a lightweight .bashrc that sources core aliases
#   5. Generates ~/.gitconfig.dotfiles from the shared git/.gitconfig, stripping
#      personal identity and adding [include] for local overrides, and makes
#      ~/.gitconfig include it. Everything else in ~/.gitconfig is left alone
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

# --- Neovim ---------------------------------------------------------------
# `vi` and `vim` on these VMs are both Neovim (Ubuntu's alternatives point
# there), and Neovim never reads ~/.vimrc — so without this the editor that
# actually opens runs with no config at all. Shares nvim/.config/nvim/init.lua
# with the Mac, which stow links to the same path.
green "\nNeovim"
mkdir -p "$HOME/.config/nvim"
backup_and_link "$DOTFILES_DIR/nvim/.config/nvim/init.lua" "$HOME/.config/nvim/init.lua"

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
# Generate ~/.gitconfig.dotfiles from the shared git/.gitconfig, stripping the
# [user] block (contains personal identity) and appending [include] for local
# overrides. ~/.gitconfig itself only has to [include] that file.
#
# The script used to own ~/.gitconfig outright and compare it, [user] stripped,
# against the managed text. Everything else that writes there goes through
# `git config --global` (configuration management sets the identity and a
# credential helper that way), so the file grew sections the comparison did not
# know about, it never matched again, and every run regenerated the file without
# them (docs/decisions/DOT-28.md). Two files, one owner each: this script
# overwrites ~/.gitconfig.dotfiles freely and never rewrites a ~/.gitconfig that
# already includes it, whatever else that file holds.
green "\nGit"
STRIP_USER='/^\[user\]/,/^\[/{ /^\[user\]/d; /^\[/!d; }'
GITCONFIG_MANAGED="$HOME/.gitconfig.dotfiles"
# Literal on purpose: git expands the leading ~/ itself when it reads the path.
# shellcheck disable=SC2088
GITCONFIG_INCLUDE='~/.gitconfig.dotfiles'
gitconfig_managed=$(
  sed "$STRIP_USER" "$DOTFILES_DIR/git/.gitconfig"
  printf '\n[include]\n\tpath = ~/.gitconfig.local\n'
)
if [ -f "$GITCONFIG_MANAGED" ] && [ "$(cat "$GITCONFIG_MANAGED")" = "$gitconfig_managed" ]; then
  dim "  .gitconfig.dotfiles already current"
else
  # No backup: nothing but this script writes here, and the source is in the repo.
  printf '%s\n' "$gitconfig_managed" > "$GITCONFIG_MANAGED.tmp"
  mv -f "$GITCONFIG_MANAGED.tmp" "$GITCONFIG_MANAGED"
  green "  generated .gitconfig.dotfiles"
fi

if [ -f "$HOME/.gitconfig" ] &&
   git config --file "$HOME/.gitconfig" --get-all include.path 2>/dev/null | grep -Fxq "$GITCONFIG_INCLUDE"; then
  dim "  .gitconfig already includes .gitconfig.dotfiles"
else
  # First run, or a ~/.gitconfig from when this script generated the whole file.
  # Put the include first, so everything already in the file still overrides
  # the managed defaults, and carry the rest across minus the lines the managed
  # file now supplies. Line by line rather than section by section: a key
  # somebody added to [core] by hand is theirs, and survives. Built before
  # backup_and_write runs, because that moves the file this reads.
  gitconfig_kept=""
  if [ -f "$HOME/.gitconfig" ]; then
    gitconfig_kept=$(awk '
      function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
      function flush(   i) {
        if (header == "") return
        if (!dropped) { printf "%s", raw; return }
        if (nkept == 0) return
        print header
        for (i = 1; i <= nkept; i++) print kept[i]
      }
      NR == FNR {
        if ($0 ~ /^[ \t]*\[/) section = trim($0)
        else if (trim($0) != "") managed[section SUBSEP trim($0)] = 1
        next
      }
      /^[ \t]*\[/ {
        flush()
        header = $0; section = trim($0); raw = $0 "\n"; nkept = 0; dropped = 0
        next
      }
      header == "" { if (trim($0) != "") print; next }
      {
        raw = raw $0 "\n"
        if ((section SUBSEP trim($0)) in managed) dropped = 1
        else if (trim($0) != "") kept[++nkept] = $0
      }
      END { flush() }
    ' "$GITCONFIG_MANAGED" "$HOME/.gitconfig")
  fi
  {
    printf '[include]\n\tpath = %s\n' "$GITCONFIG_INCLUDE"
    if [ -n "$gitconfig_kept" ]; then printf '%s\n' "$gitconfig_kept"; fi
  } | backup_and_write "$HOME/.gitconfig"
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
  # The bun CI installs (INFRA-154): the same release zip, checked against a
  # literal digest the way .forgejo/ci/install-tools.sh checks it, rather than
  # the bun.sh installer, which checks nothing. BUN_VERSION and the x64 digest
  # must equal BUN_VERSION and BUN_SHA256 in install-tools.sh; infrastructure's
  # runtime-pins check compares them. `herdr --remote` does not gate bun, so
  # unlike herdr this version is the one the VM keeps. To bump: change all four
  # lines, after hashing each zip yourself and comparing with the release's
  # SHASUMS256.txt.
  BUN_VERSION=1.3.13
  BUN_SHA256_X64=79c0771fa8b92c33aae41e15a0e0d307ea99d0e2f00317c71c6c53237a78e25a
  BUN_SHA256_X64_BASELINE=9d8a24292a7068090205daac0a5a223f5f69736f5287e37bf88d3b4031edc750
  BUN_SHA256_AARCH64=70bae41b3908b0a120e1e58c5c8af30e74afae3b8d11b0d3fdd8e787ddfb4b22
  # The build the bun.sh installer would pick: baseline x64 on a CPU without
  # AVX2. Nothing on musl (Alpine): this pins no musl build, so it says so.
  bun_build=""
  bun_sha256=""
  if [ -f /etc/alpine-release ]; then
    :
  elif [ "$(uname -m)" = x86_64 ]; then
    if grep -qw avx2 /proc/cpuinfo 2>/dev/null; then
      bun_build=x64
      bun_sha256=$BUN_SHA256_X64
    else
      bun_build=x64-baseline
      bun_sha256=$BUN_SHA256_X64_BASELINE
    fi
  elif [ "$(uname -m)" = aarch64 ] || [ "$(uname -m)" = arm64 ]; then
    bun_build=aarch64
    bun_sha256=$BUN_SHA256_AARCH64
  fi
  if [ -z "$bun_build" ]; then
    red "  skipped bun: no pinned build for $(uname -m) on this libc"
  else
    # Under ~/.bun, not /tmp: --version runs the binary before it is
    # installed, and a noexec /tmp would fail that check on a good binary.
    mkdir -p "$HOME/.bun"
    bun_tmp="$(mktemp -d "$HOME/.bun/.install.XXXXXX")"
    # --version before install: a binary this CPU cannot run never lands where
    # the "already installed" check above would keep it.
    if curl -fsSL --retry 3 -o "$bun_tmp/bun.zip" \
         "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${bun_build}.zip" \
       && echo "${bun_sha256}  $bun_tmp/bun.zip" | sha256sum -c --quiet - \
       && unzip -q -o "$bun_tmp/bun.zip" -d "$bun_tmp" \
       && "$bun_tmp/bun-linux-${bun_build}/bun" --version >/dev/null \
       && mkdir -p "$HOME/.bun/bin" \
       && install -m 0755 "$bun_tmp/bun-linux-${bun_build}/bun" "$HOME/.bun/bin/bun" \
       && ln -sf bun "$HOME/.bun/bin/bunx"; then
      # On PATH for the steps below; remote/bashrc puts it there for later shells.
      export PATH="$HOME/.bun/bin:$PATH"
      green "  installed bun $BUN_VERSION ($bun_build)"
      rm -rf "$bun_tmp"
    else
      # Fatal, as the old installer pipe was under pipefail: a VM left
      # without bun fails later steps in ways that are harder to read.
      rm -rf "$bun_tmp"
      red "  bun install failed: download, digest or run check (bun-v$BUN_VERSION, $bun_build)"
      exit 1
    fi
  fi
fi

# --- Claude Code settings --------------------------------------------------
# Enable standard plugins and set fleet-wide preferences by merging into
# ~/.claude/settings.json. Runs after Bun so a JS runtime is available
# (prefers an existing node, falls back to the bun installed above).
# Idempotent — only sets the keys it manages.
green "\nClaude Code settings"
CLAUDE_JS_RUNTIME=""
if   command -v node &>/dev/null;        then CLAUDE_JS_RUNTIME="node"
elif command -v bun  &>/dev/null;        then CLAUDE_JS_RUNTIME="bun"
elif [ -x "$HOME/.bun/bin/bun" ];        then CLAUDE_JS_RUNTIME="$HOME/.bun/bin/bun"
fi
if [ -n "$CLAUDE_JS_RUNTIME" ]; then
  DOTFILES_DIR="$DOTFILES_DIR" "$CLAUDE_JS_RUNTIME" -e "
    const { readFileSync, writeFileSync, mkdirSync } = require('fs');
    const dir = process.env.HOME + '/.claude';
    const file = dir + '/settings.json';
    let cfg = {};
    try { cfg = JSON.parse(readFileSync(file, 'utf8')); } catch (_) {}
    // Plugins come from this repo's own marketplace (_agent/marketplace),
    // which pins each one to an upstream commit; scripts/audit-pins.mjs
    // watches the pin (DOT-36). The unpinned copy earlier runs enabled is
    // removed. A change here fails tests/invariants/plugin-sources.test.js.
    cfg.extraKnownMarketplaces = cfg.extraKnownMarketplaces || {};
    cfg.extraKnownMarketplaces['dotfiles'] = { source: { source: 'directory', path: process.env.DOTFILES_DIR + '/_agent/marketplace' } };
    cfg.enabledPlugins = cfg.enabledPlugins || {};
    delete cfg.enabledPlugins['frontend-design@claude-plugins-official'];
    cfg.enabledPlugins['frontend-design@dotfiles'] = true;
    // Concise output style fleet-wide, so remote agents match the local default.
    cfg.outputStyle = 'Concise';
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  "
  green "  enabled frontend-design@dotfiles (pinned)"
  green "  set outputStyle=Concise"
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
