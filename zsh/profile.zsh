# Homebrew Setup
if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Path Configuration
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"

# Default editor (used by git, crontab, etc.)
export EDITOR="vim"
export VISUAL="vim"
export GIT_EDITOR="vim"

# FNM (Fast Node Manager)
# Basic environment setup for tools (no interactive hooks)
if command -v fnm > /dev/null; then
  eval "$(fnm env)"
fi
