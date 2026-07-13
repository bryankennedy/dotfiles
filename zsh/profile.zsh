# Homebrew Setup
# `brew` is a symlink into /nix/store (nix-homebrew), so it dangles until the
# encrypted /nix volume mounts — which happens seconds after login, sometimes
# after Ghostty/herdr have already spawned their shells. The bin dirs are real
# either way, so fall back to them rather than losing Homebrew from PATH.
if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -d /opt/homebrew/bin ]]; then
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
fi

# Path Configuration
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"

# Nix-darwin system packages. Like the Homebrew symlinks above, these dirs live
# under /nix and dangle until the encrypted /nix volume mounts a few seconds
# after login — often after Ghostty/herdr/tmux have already spawned their shells.
# Add them UNCONDITIONALLY (no `-d` guard): a missing dir in PATH is harmless and
# skipped at lookup, and keeping the entry means bun/node/etc. resolve the instant
# /nix mounts instead of staying broken until the shell is restarted. The old
# guard evaluated false during that boot race and silently dropped nix off PATH
# for the life of the shell. On a non-nix machine these are just dead entries.
export PATH="/run/current-system/sw/bin:$PATH"
export PATH="$HOME/.nix-profile/bin:$PATH"

# Default editor (used by git, crontab, etc.)
export EDITOR="vim"
export VISUAL="vim"
export GIT_EDITOR="vim"

# FNM (Fast Node Manager)
# Basic environment setup for tools (no interactive hooks)
if command -v fnm > /dev/null; then
  eval "$(fnm env)"
fi
