# Keep a command line that holds a token out of the history file
# (docs/decisions/INFRA-320.md, INFRA-320f). .zshrc sources this file before
# anything that can return early, so every interactive shell loads it.
#
# zsh calls each function in zshaddhistory_functions before it saves a line.
# When one returns 1, zsh does not save the line. zsh keeps the line in the
# history list until the next command runs, so the up arrow can still recall
# it once.
#
# Each pattern is a POSIX extended regular expression for the shape that the
# issuer gives the token, or for a variable name that holds one. The hook
# matches a pattern only at the start of the line or after a character that
# is not a letter, a digit or `_`. Use only syntax that has the same meaning in
# JavaScript: tests/zsh/history-secrets.test.js checks the list in JavaScript
# in CI, and runs the hook in zsh where zsh is installed.
typeset -ga DOTFILES_HISTORY_SECRET_PATTERNS=(
  'tskey-[a-z]+-'                                   # Tailscale auth keys and API tokens
  'gh[pousr]_[A-Za-z0-9]{36}'                       # GitHub classic, OAuth, user, server and refresh tokens
  'github_pat_[A-Za-z0-9_]{22}'                     # GitHub fine-grained tokens
  'gl(pat|dt|rt|ptt|soat|cbt|imt|oas)-[A-Za-z0-9_-]{20}' # GitLab tokens
  'sk-ant-[a-z]+[0-9]*-'                            # Anthropic API keys and Claude OAuth tokens
  'sk-(proj|svcacct|admin)-'                        # OpenAI keys
  'xox[abeprs]-[0-9A-Za-z]'                         # Slack tokens
  'xapp-[0-9]+-'                                    # Slack app tokens
  '(AKIA|ASIA)[0-9A-Z]{16}([^0-9A-Za-z]|$)'         # AWS access key IDs
  'aws_secret_access_key'                           # the AWS secret key, by its name
  'ops_eyJ[A-Za-z0-9_-]{20}'                        # 1Password service account tokens
  'npm_[A-Za-z0-9]{36}'                             # npm tokens
  '(sk|rk)_live_[A-Za-z0-9]{20}'                    # Stripe live keys
  'AIza[0-9A-Za-z_-]{35}'                           # Google API keys
  '[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY)="?[A-Za-z0-9+/_.:@-]' # NAME=value, with a literal value
)

# Build the expression once, with the same options as the hook: KSH_ARRAYS
# would join only the first entry, and RE_MATCH_PCRE would compile with PCRE.
# Source this file again after a change to the list.
() {
  emulate -L zsh
  local MATCH MBEGIN MEND
  local -a match mbegin mend
  typeset -g _dotfiles_history_secret_re="(^|[^A-Za-z0-9_])(${(j:|:)DOTFILES_HISTORY_SECRET_PATTERNS})"
  typeset -g _dotfiles_history_secret_notice="zsh: this line is not in the history, because it holds a token"
  # A known token must match. When zsh cannot compile the expression, =~
  # returns 1, the same status as no match, and the hook would save every
  # line. So if the probe does not match, for that or any other reason, the
  # hook refuses every line, and each new shell says so.
  local probe="export VALUE=gh""p_${(l:36::x:)}"
  if ! { [[ $probe =~ $_dotfiles_history_secret_re ]] } 2>/dev/null; then
    print -u2 -r -- "history-secrets.zsh: the pattern list does not work, so zsh saves no history"
    _dotfiles_history_secret_re='^'
    _dotfiles_history_secret_notice="zsh: this line is not in the history, because history-secrets.zsh does not work"
  fi
}

_dotfiles_history_secret_guard() {
  emulate -L zsh
  # =~ sets these. Keep them local, so the hook does not change the user's
  # values or leave a matched token in them.
  local MATCH MBEGIN MEND
  local -a match mbegin mend
  [[ $1 =~ $_dotfiles_history_secret_re ]] || return 0
  print -u2 -r -- "$_dotfiles_history_secret_notice"
  return 1
}

autoload -Uz add-zsh-hook
add-zsh-hook zshaddhistory _dotfiles_history_secret_guard

# zsh does not save a line that starts with a space either. Use a space for a
# token that no pattern above matches.
setopt HIST_IGNORE_SPACE
