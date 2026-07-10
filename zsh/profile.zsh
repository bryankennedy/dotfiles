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

# Nix-darwin system packages (guards against stale tmux sessions that predate nix setup)
[[ -d /run/current-system/sw/bin ]] && export PATH="/run/current-system/sw/bin:$PATH"
[[ -d "$HOME/.nix-profile/bin" ]] && export PATH="$HOME/.nix-profile/bin:$PATH"

# Default editor (used by git, crontab, etc.)
export EDITOR="vim"
export VISUAL="vim"
export GIT_EDITOR="vim"

# FNM (Fast Node Manager)
# Basic environment setup for tools (no interactive hooks)
if command -v fnm > /dev/null; then
  eval "$(fnm env)"
fi
