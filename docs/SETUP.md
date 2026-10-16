# First-time setup (new machine) — Local (macOS)

These steps bootstrap the dotfiles on a fresh macOS machine. Once they're done, day-to-day changes are just edit + `compy` (see [Everyday usage](../README.md#everyday-usage-already-installed)).

## 1) Clone the repository

```sh
git clone https://github.com/bryankennedy/dotfiles.git ~/src/dotfiles
```

## 2) Apply nix-darwin system config

Sign in to the App Store app first. The switch installs Xcode through `mas` (`homebrew.masApps`), and a failed Homebrew stage stops activation before it stows the dotfiles or sets `core.hooksPath`. `mas` can only install an app this Apple ID has "gotten" once, so on a new Apple ID, click Get on Xcode's App Store page before switching.

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
- It also sets `core.hooksPath` for this checkout, so `.githooks/pre-commit` scans staged changes with gitleaks before every commit. A commit with a finding is refused. If you've read the finding and it's a false positive, `git commit --no-verify` overrides it.

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

## 4) Xcode (one-time)

The switch in step 2 installs Xcode (after the App Store sign-in described there), but two pieces stay manual:

1. Point the developer tools at Xcode instead of the Command Line Tools, and accept the license:

   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   xcodebuild -runFirstLaunch
   ```

2. Open Xcode once to download any extra platforms (the macOS SDK ships with it; iOS simulators are optional) and add your Apple ID under Settings → Accounts for signing.

The Command Line Tools (`xcode-select --install`) can stay installed next to Xcode; `xcode-select -p` shows which one is active.

## 5) Optional verification

```sh
ls -l ~/.zshrc ~/.gitconfig ~/.vimrc ~/.config/ghostty ~/.config/wezterm ~/.config/karabiner ~/.config/starship.toml
command -v starship antidote stow rg
source ~/.zshrc
alias l c
```

Notes:
- `zsh/.zprofile` loads `profile.zsh` (PATH and exports) for login shells, and `zsh/.zshrc` loads `aliases.zsh` and the interactive setup. Both resolve the repo relative to the location of the symlink in `~`, so this repo can live at `~/src/dotfiles` (or any other path) without editing hardcoded paths. `.zshrc` falls back to loading `profile.zsh` itself only when no login shell has already done so.
