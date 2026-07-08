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
# Prepend the nix-darwin bin dir so the alias works from non-login shells too
# (login-only profile.zsh isn't guaranteed to have put it on PATH).
alias compy='cd ~/src/dotfiles/nix-darwin && sudo env PATH="/run/current-system/sw/bin:$PATH" darwin-rebuild switch --flake .#simple'

# -------------------------------------------------------------------
# herdr — agent multiplexer (trial). Persistent remote agent workspaces.
# -------------------------------------------------------------------

# Jump into the persistent herdr session on the exe.dev progress hosts. These
# use the clean `*-herdr` ssh aliases (no RemoteCommand) so herdr can run its
# own server on the remote. First run auto-installs herdr there; the workspace
# and any running agents persist across detaches/SSH drops, so reconnecting
# drops you back exactly where you left off. Replaces the tmux `prefix + P`
# progress panes.
alias progress-space='herdr --remote progress-herdr'
alias progress2-space='herdr --remote progress2-herdr'

# One-time setup for the progress host. herdr installs itself on the remote
# only when you first attach with `herdr --remote` (version-matched to the
# local client), and its CLI/integration commands need herdr on PATH + a
# running server — neither is true over a plain non-interactive ssh. So this
# helper checks whether herdr exists remotely and guides the correct order:
# attach first, then run the three one-time commands inside the session.
# Idempotent — safe to re-run.
progress-space-init() {
  local host="${1:-progress-herdr}"
  if ssh "$host" 'command -v herdr >/dev/null 2>&1 || [ -x "$HOME/.local/bin/herdr" ]'; then
    cat <<'EOF'
herdr is installed on the remote. Run `progress-space` to attach, then once
inside the session run these three commands one time to wire up the tracked
workspace (they need the running server, so run them INSIDE herdr):

  herdr integration install claude
  herdr workspace create --cwd ~/progress --label progress --focus
  herdr agent start claude --cwd ~/progress -- claude

The workspace + Claude then persist on the remote across detaches/SSH drops.
EOF
  else
    cat <<'EOF'
herdr isn't on the remote yet — attaching installs it (version-matched).
Run `progress-space` first; it will auto-install herdr and start its server.
Then run these three commands once, INSIDE the session:

  herdr integration install claude
  herdr workspace create --cwd ~/progress --label progress --focus
  herdr agent start claude --cwd ~/progress -- claude

(Re-running `progress-space-init` after attaching will confirm the install.)
EOF
  fi
}

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
