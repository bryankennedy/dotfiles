# Copies the last command's output from the tmux scrollback to the macOS clipboard.
# Reads what was already displayed — does NOT re-run the command.
# Capped at 1000 lines to avoid loading the full scrollback for large outputs.
clip-last() {
  [[ -z "$TMUX" ]] && { echo "clip-last: requires a tmux session" >&2; return 1; }

  # Capture recent pane content — escape sequences stripped by default
  local content
  content=$(tmux capture-pane -p -S -1000)

  # Find line numbers of the last two prompt lines (❯ at line start, from Starship)
  local prev_prompt last_prompt
  read -r prev_prompt last_prompt <<< \
    "$(printf '%s\n' "$content" | awk '/^❯/{prev=last; last=NR} END{print prev+0, last+0}')"

  if (( prev_prompt == 0 )); then
    echo "clip-last: not enough prompt history visible in pane" >&2
    return 1
  fi

  # Extract lines between the two most recent prompts, strip tmux's trailing whitespace padding
  local output
  output=$(printf '%s\n' "$content" \
    | sed -n "$((prev_prompt + 1)),$((last_prompt - 1))p" \
    | sed 's/[[:space:]]*$//')

  if [[ -z "${output//[$'\n']/}" ]]; then
    echo "clip-last: last command produced no output" >&2
    return 1
  fi

  printf '%s' "$output" | pbcopy && echo "Copied to clipboard."
}

# Self-heal terminal modes at every prompt.
# A full-screen program (nvim's default mouse=nvi, remote TUIs) can exit without
# disabling mouse tracking (1000/1002/1003/1006) or color-scheme reporting (2031),
# leaving them on at the shell — trackpad taps then print as "0;58;7M" etc.
# Sending the "off" sequences each time control returns to the prompt resets that.
autoload -Uz add-zsh-hook
_reset_terminal_input_modes() {
  printf '\e[?1000l\e[?1002l\e[?1003l\e[?1006l\e[?2031l'
}
add-zsh-hook precmd _reset_terminal_input_modes
