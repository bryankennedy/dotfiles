# First-time setup (new machine) — Local (macOS)

These steps bootstrap the dotfiles on a fresh macOS machine. Once they're done, day-to-day changes are just edit + `compy` (see [Everyday usage](../README.md#everyday-usage-already-installed)).

## 1) Clone the repository

```sh
git clone https://github.com/bryankennedy/dotfiles.git ~/src/dotfiles
```

## 2) Apply nix-darwin system config

```sh
cd ~/src/dotfiles
git add nix-darwin/flake.nix nix-darwin/flake.lock
cd nix-darwin
sudo darwin-rebuild switch --flake .#simple
```

Notes:
- `darwin-rebuild switch` must be run as root on recent nix-darwin versions.
- Flakes only see Git-tracked files; stage `flake.nix`/`flake.lock` before rebuilding.
- The activation script stows all dotfile packages into `$HOME` for you — no separate Stow step is needed. To relink by hand, see [STRUCTURE.md](STRUCTURE.md#manual-stow-optional).

## 3) Regenerate Antidote plugin bundle (required on a new machine)

The checked-in `~/.zsh_plugins.zsh` can reference stale cache paths from another machine. Rebuild it locally:

```sh
rm -f ~/.zsh_plugins.zsh
antidote bundle < ~/.zsh_plugins.txt > ~/.zsh_plugins.zsh
exec zsh
```

If plugin download paths are still missing:

```sh
antidote update
antidote bundle < ~/.zsh_plugins.txt > ~/.zsh_plugins.zsh
exec zsh
```

## 4) Optional verification

```sh
ls -l ~/.zshrc ~/.gitconfig ~/.vimrc ~/.config/ghostty ~/.config/wezterm ~/.config/karabiner ~/.config/starship.toml
command -v starship antidote stow rg
source ~/.zshrc
alias l c
```

Notes:
- `zsh/.zshrc` loads `profile.zsh` and `aliases.zsh` relative to the location of `~/.zshrc`, so this repo can live at `~/src/dotfiles` (or any other path) without editing hardcoded paths.
