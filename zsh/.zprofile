# Login shells: environment only (PATH, exports). Interactive setup — keymaps,
# plugins, completion, prompt, aliases — lives in .zshrc, which zsh reads after
# this for interactive logins. Splitting the two is what keeps `zsh -c`, cron,
# and every nested interactive shell from rebuilding PATH.
#
# Resolved the same way as .zshrc so this repo can live anywhere: ~/.zprofile
# is a stow symlink into it, and %N:A follows the link to the real directory.
typeset -g DOTFILES_ZSH_DIR="${${(%):-%N}:A:h}"
[ -f "$DOTFILES_ZSH_DIR/profile.zsh" ] && source "$DOTFILES_ZSH_DIR/profile.zsh"
