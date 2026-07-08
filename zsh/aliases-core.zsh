# Core Aliases — portable across macOS and Linux VMs
# Sourced by both zsh (local mac) and bash (remote VMs)

# -------------------------------------------------------------------
# Shorthand
# -------------------------------------------------------------------
alias c='clear'
alias g='grep'
alias xx='exit'

# Ask before doing anything dangerous
alias cp='cp -i'
alias mv='mv -i'
alias rm='rm -i'

# Readable path
alias path='echo -e ${PATH//:/\\n}'

# -------------------------------------------------------------------
# Listing (eza with fallback to ls)
# -------------------------------------------------------------------
if command -v eza &> /dev/null; then
  alias l='eza -lh --icons=auto --group-directories-first --time-style=long-iso'
  alias ll='eza -lAh --icons=auto --group-directories-first --time-style=long-iso'
  alias lw='eza -lAhd --icons=auto --group-directories-first --time-style=long-iso'
  alias lld='eza -lAh --icons=auto --group-directories-first --time-style=long-iso --sort=modified'
else
  alias l='ls -lh --color=auto'
  alias ll='ls -lAh --color=auto'
  alias lw='ls -lAhd --color=auto'
  alias lld='ls -lAht --color=auto'
fi

# -------------------------------------------------------------------
# Searching
# -------------------------------------------------------------------
findin() {
  find . -exec grep -q "$1" '{}' \; -print
}

# -------------------------------------------------------------------
# Navigation
# -------------------------------------------------------------------
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

# Compress the cd, ls -l series of commands.
cl() {
   if [ $# = 0 ]; then
      cd && l
   else
      cd "$*" && l
   fi
}
alias lc='cl'

# Compress the mkdir > cd into it series of commands
mc() {
  mkdir -p "$*" && cd "$*" && pwd
}

# -------------------------------------------------------------------
# Extracting
# -------------------------------------------------------------------
extract() {
    if [ -f $1 ] ; then
        case $1 in
            *.tar.bz2)   tar xvjf $1    ;;
            *.tar.gz)    tar xvzf $1    ;;
            *.tgz)       tar xvzf $1    ;;
            *.bz2)       bunzip2 $1     ;;
            *.rar)       unrar x $1     ;;
            *.gz)        gunzip $1      ;;
            *.tar)       tar xvf $1     ;;
            *.tbz2)      tar xvjf $1    ;;
            *.zip)       unzip $1       ;;
            *.Z)         uncompress $1  ;;
            *.7z)        7z x $1        ;;
            *)           echo "'$1' cannot be extracted via >extract<" ;;
        esac
    else
        echo "'$1' is not a valid file"
    fi
}

# -------------------------------------------------------------------
# Git
# -------------------------------------------------------------------
alias gs='git status -s -b'
alias gc='git commit -v'
alias ga='git add'
alias gaa='git add -A'
alias gap='git add -p'
alias gco='git checkout'
alias gl='git log --oneline --decorate --color=always | less -R'
alias gd='git diff'
alias gps='git push'
alias gpsm='git push origin main'
alias gpsd='git push origin develop'
alias gpl='git pull'
alias gplm='git pull origin main'
alias gpld='git pull origin develop'

# Open the current repo on GitHub (works on macOS and Linux)
github() {
  local git_url=$(git remote get-url origin 2>/dev/null)
  if [ -z "$git_url" ]; then
    echo "Not a git repository or no 'origin' remote found."
    return 1
  fi

  # Convert SSH URL to HTTPS
  local url=${git_url/git@github.com:/https:\/\/github.com\/}
  url=${url%.git}

  echo "Opening $url..."
  if command -v xdg-open &>/dev/null; then
    xdg-open "$url"
  elif command -v open &>/dev/null; then
    open "$url"
  else
    echo "$url"
  fi
}

# -------------------------------------------------------------------
# herdr (agent multiplexer)
# -------------------------------------------------------------------
# Fan the local herdr client out to every VM: one workspace per host, each
# attached to that host's remote herdr. Source of truth is the ansible
# inventory -> ~/.config/herdr/fleet.json (see docs/herdr-fleet.md).
alias hf='herdr-fleet'
# Regenerate the SSH aliases + fleet.json after editing the inventory.
alias hf-sync='(cd ~/src/ansible && ansible-playbook playbooks/herdr-fleet.yml)'

# -------------------------------------------------------------------
# Editor
# -------------------------------------------------------------------
alias vi='vim'

# -------------------------------------------------------------------
# Reload (shell-aware)
# -------------------------------------------------------------------
if [ -n "${ZSH_VERSION:-}" ]; then
  alias reload='source ${ZDOTDIR:-$HOME}/.zshrc'
elif [ -n "${BASH_VERSION:-}" ]; then
  alias reload='source ~/.bashrc'
fi
