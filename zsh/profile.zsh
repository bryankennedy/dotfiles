# Homebrew Setup
if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
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
