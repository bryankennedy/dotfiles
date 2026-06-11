# macOS-only aliases — fat-client tools, GUI apps, platform-specific utils
# Only sourced on macOS (Darwin)

[[ $(uname) != "Darwin" ]] && return

# -------------------------------------------------------------------
# Antigravity
# -------------------------------------------------------------------
alias a='antigravity'

# -------------------------------------------------------------------
# Nix-Darwin
# -------------------------------------------------------------------

# Rebuild nix-darwin from this dotfiles repo.
alias compy='cd ~/src/dotfiles/nix-darwin && sudo env PATH="$PATH" darwin-rebuild switch --flake .#simple'

# -------------------------------------------------------------------
# macOS CLI tools
# -------------------------------------------------------------------

# Replicate the tree function on macOS if not installed
if ! command -v tree &> /dev/null; then
  alias tree="find . -print | sed -e 's;[^/]*/;|____;g;s;____|; |;g'"
fi

# Quicker smaller top
alias topp='top -ocpu -R -F -s 2 -n30'

# gdu is installed as gdu-go to avoid coreutils conflict
alias gdu='gdu-go'

# Display images in the terminal
alias imgcat='chafa'

# Copy current directory to clipboard
alias cpwd='pwd|xargs echo -n|pbcopy'

# Dump man pages to Preview
pman() {
  man -t "${1}" | open -f -a /Applications/Preview.app/
}

# Vim - prefer standard vim or mvim if available
if command -v mvim &> /dev/null; then
  alias vi='mvim'
fi

# -------------------------------------------------------------------
# Eza Colors (Crispy Theme)
# -------------------------------------------------------------------
export EZA_COLORS="da=37:ur=32:uw=31:ux=34:gr=32:gw=31:gx=34:tr=32:tw=31:tx=34:sn=33:sb=33:uu=37:gu=37"
