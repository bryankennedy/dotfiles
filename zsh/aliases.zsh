# Aliases and Functions

# Shorthand
alias a='antigravity'
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
# Listing
# -------------------------------------------------------------------

# List normal files
alias l='eza -lh --icons=auto --group-directories-first --time-style=long-iso'
# List everything, including hidden files
alias ll='eza -lAh --icons=auto --group-directories-first --time-style=long-iso'
# List for wildcard searches without all those subdir files
alias lw='eza -lAhd --icons=auto --group-directories-first --time-style=long-iso'
# List everything, by reverse date
alias lld='eza -lAh --icons=auto --group-directories-first --time-style=long-iso --sort=modified'

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
# Alias for common miss-type
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
# macOS Specific Tools
# -------------------------------------------------------------------

if [[ $(uname) == "Darwin" ]]; then
  # Replicate the tree function on macOS if not installed
  if ! command -v tree &> /dev/null; then
    alias tree="find . -print | sed -e 's;[^/]*/;|____;g;s;____|; |;g'"
  fi

  # Quicker smaller top
  alias topp='top -ocpu -R -F -s 2 -n30'

  # Copy current directory to clipboard
  alias cpwd='pwd|xargs echo -n|pbcopy'

  # Dump man pages to Preview
  pman() {
    man -t "${1}" | open -f -a /Applications/Preview.app/
  }

  # Vim - prefer standard vim or mvim if available
  if command -v mvim &> /dev/null; then
    alias vi='mvim'
  else
    alias vi='vim'
  fi
else
  # Linux / VSCode / Etc
  alias vi='vim'
fi

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
alias gpsm='git push origin master'
alias gpsd='git push origin develop'
alias gpl='git pull'
alias gplm='git pull origin master'
alias gpld='git pull origin develop'

gh() {
  local git_url=$(git remote get-url origin 2>/dev/null)
  if [ -z "$git_url" ]; then
    echo "Not a git repository or no 'origin' remote found."
    return 1
  fi

  # Convert SSH URL to HTTPS
  local url=${git_url/git@github.com:/https:\/\/github.com\/}
  url=${url%.git}

  echo "Opening $url..."
  open "$url"
}

# -------------------------------------------------------------------
# Reload Zsh
# -------------------------------------------------------------------
alias reload='source ${ZDOTDIR:-$HOME}/.zshrc'
