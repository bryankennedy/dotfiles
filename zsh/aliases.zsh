# Alias loader — sources the split alias files
# Core aliases are shared with remote VMs; macOS aliases are local-only.

DOTFILES_ZSH_DIR="${DOTFILES_ZSH_DIR:-${${(%):-%N}:A:h}}"

[ -f "$DOTFILES_ZSH_DIR/aliases-core.zsh" ] && source "$DOTFILES_ZSH_DIR/aliases-core.zsh"
[ -f "$DOTFILES_ZSH_DIR/aliases-macos.zsh" ] && source "$DOTFILES_ZSH_DIR/aliases-macos.zsh"
