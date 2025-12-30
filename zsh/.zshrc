# Clean Profile (PATH, Environment)
[ -f "$HOME/dotfiles/zsh/profile.zsh" ] && source "$HOME/dotfiles/zsh/profile.zsh"

# Antigravity Terminal Fix
# Prevents VS Code Shell Integration codes and interactive noise from breaking the agent.
if [[ -n "$ANTIGRAVITY_AGENT" ]]; then
    export PS1='$ '
    unset PROMPT_COMMAND
    return
fi

# Interactive Shell Configuration

# Antidote
source /opt/homebrew/opt/antidote/share/antidote/antidote.zsh

# Initialize Antidote
# Initialize Antidote
# Ensure zsh-completions is loaded early
fpath=(${ZDOTDIR:-$HOME}/.antidote/plugins/zsh-users/zsh-completions/src $fpath)

if [[ ! -f ${ZDOTDIR:-$HOME}/.zsh_plugins.zsh ]]; then
  antidote bundle < ${ZDOTDIR:-$HOME}/.zsh_plugins.txt > ${ZDOTDIR:-$HOME}/.zsh_plugins.zsh
fi
source ${ZDOTDIR:-$HOME}/.zsh_plugins.zsh
autoload -Uz compinit && compinit

# Case-insensitive completion (cd r -> Resources)
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'

# Starship
eval "$(starship init zsh)"

# Modern Tools
if command -v zoxide > /dev/null; then
  eval "$(zoxide init zsh --cmd j)"
fi

if command -v fnm > /dev/null; then
  eval "$(fnm env --use-on-cd)"
fi

# Eza Colors (Crispy Theme)
# da=dark_gray(timestamp), ur=green(user_read), uw=red(user_write), ux=blue(user_exec)
# gr=green(group_read), gw=red(group_write), gx=blue(group_exec)
# tr=green(other_read), tw=red(other_write), tx=blue(other_exec)
# sn=orange(size), sb=orange(size_unit), uu=light_gray(user), gu=light_gray(group)
export EZA_COLORS="da=37:ur=32:uw=31:ux=34:gr=32:gw=31:gx=34:tr=32:tw=31:tx=34:sn=33:sb=33:uu=37:gu=37"

# Aliases
[ -f "$HOME/dotfiles/zsh/aliases.zsh" ] && source "$HOME/dotfiles/zsh/aliases.zsh"

# User configuration

