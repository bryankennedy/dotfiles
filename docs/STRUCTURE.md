# Repository structure

The repository is structured so that running `stow <package>` from the root symlinks the contents of that package into your home directory (`~`), preserving the directory structure. On macOS the nix-darwin activation script stows these packages for you — the **canonical list of stowed packages, and the rationale for the command shape, lives in a comment next to the `stow` call in [`nix-darwin/flake.nix`](../nix-darwin/flake.nix)**. This doc describes what each package is for; it does not re-list the package tokens, to avoid drift.

> **This repo is a first pass, not a full mirror of `$HOME`.** Apps installed manually often keep their own configs in `$HOME` that aren't stowed or tracked here, so expect a given machine to have extra config that this repo doesn't know about. A few directories (e.g. `bin/`, `claude/`, `nvim/`) are checked in but intentionally *not* auto-stowed — treat the repo as the tracked core, not the complete picture.

## Stow packages

- **ghostty/**: Ghostty terminal configuration and themes.
- **zsh/**: Zsh shell configuration.
- **vim/**: Vim configuration.
- **git/**: Git global configuration.
- **starship/**: Starship prompt configuration.
- **karabiner/**: Karabiner-Elements configuration. Includes a complex modification that maps the middle mouse button (button3) to F15 for use as the [Hex](https://github.com/kitlangton/Hex) trigger.

  > **Important:** Complex modifications only apply to devices explicitly enabled in Karabiner. After stowing this config, open Karabiner-Elements → **Devices** tab and enable any non-keyboard devices (e.g. your mouse) that should be processed. Without this, complex modification rules will be silently ignored for that device.
- **aerospace/**: Aerospace window manager configuration.
- **wezterm/**: WezTerm terminal configuration.
- **gemini/**: Gemini AI agent global rules (`GEMINI.md`) and global workflows. The workflow files in `global_workflows/` are symlinks into `_skills/`.
- **cursor/**: Cursor AI agent skills. Each `SKILL.md` is a symlink into `_skills/`.
- **tmux/**: tmux configuration (`~/.tmux.conf`). Uses `Ctrl-a` as prefix, vim-style pane navigation, mouse support, and a minimalist status bar.
- **herdr/**: herdr agent-multiplexer config (`~/.config/herdr/config.toml`) — kanagawa theme, `Ctrl-b` prefix, macOS notifications. Only `config.toml` is stowed; herdr's runtime logs/sockets in the same dir are gitignored.

### Manual Stow (optional)

The macOS activation script stows everything for you, so you normally don't run Stow by hand. To (re)link packages manually — e.g. after adding a new package before the next rebuild — run from the repo root with the package list from `nix-darwin/flake.nix`:

```sh
cd ~/src/dotfiles
stow -R --no-folding -v -t "$HOME" <packages…>
```

**Always pass `--no-folding`.** Without it, Stow links a whole *directory* into `$HOME` when the target doesn't exist yet, rather than creating a real directory and symlinking each file. A folded `~/.cursor/skills` is one symlink pointing into this repo — so when Cursor auto-installs a plugin's skills, or an agent writes a command file, those files land in the working tree of a **public repo**. `.gitignore` is then the only thing standing between them and publication, and every new plugin needs a new rule.

`--no-folding` creates real directories and symlinks only leaf files, so an app writing a new file writes it to `$HOME`, where it belongs. `-R` (restow) is what *undoes* a fold that already exists; `--no-folding` alone leaves one in place.

If a fold ever reappears, or app-written files turn up inside a package directory:

```sh
node scripts/defold.mjs           # show the plan
node scripts/defold.mjs --apply   # unstow, evict app-written files to $HOME, restow unfolded
```

Adding a package? Put it in the `flake.nix` list. Three packages (`bin`, `nvim`, `claude`) were once stowed by hand and never declared there, which is how `~/.claude/commands` became an unmanaged symlink into the repo. The list is only a source of truth if it is complete.

Stowing the packages together in one invocation lets Stow link into existing `~/.config/<app>` paths instead of trying to replace all of `~/.config`.

## Remote VM config (not a stow package)

- **`remote/`**: Lightweight bash-based dotfiles for headless Linux VMs. Has its own installer (`install.sh`) that symlinks shared configs (vim, tmux) and generates a safe gitconfig. See [Remote VM Setup](REMOTE.md).

## App setup scripts (not a stow package)

Some macOS applications store their configuration in `~/Library/Preferences` (via the `defaults` system) rather than dotfiles, so they can't be managed with Stow. The `scripts/` directory contains idempotent setup scripts for these apps.

| Script | App | What it configures |
|--------|-----|--------------------|
| `scripts/hex.sh` | [Hex](https://github.com/kitlangton/Hex) | Sets global hotkey to F15 (pairs with the Karabiner middle-mouse → F15 rule) |

Run a script after installing the corresponding app:

```sh
./scripts/hex.sh
```

## Shared sources (not stow packages)

- **`_agent/`**: Single source of truth for all AI agent rules and skills. `_agent/rules/global.md` is the shared rules file and `_agent/skills/*.md` are the workflows. The `claude`, `gemini`, and `cursor` packages symlink into here — edit a file once, it updates everywhere.

  Because those symlinks land in `~/.claude/`, `~/.gemini/`, and `~/.cursor/` via stow (and, on the VMs, via `remote/install.sh`), everything under `_agent/` is loaded into an agent's context on every machine. Treat it as executable, and audit it with the `security-audit` skill.

  To add a new skill:
  1. Create the workflow file in `_agent/skills/` with `name:` and `description:` frontmatter.
  2. Symlink it into the Claude package: `ln -s ../../../_agent/skills/<file>.md claude/.claude/commands/<file>.md`
  3. Symlink it into the Gemini package: `ln -s ../../../../_agent/skills/<file>.md gemini/.gemini/antigravity/global_workflows/<file>.md`
  4. Create a Cursor skill dir and symlink: `mkdir cursor/.cursor/skills/<name> && ln -s ../../../../_agent/skills/<file>.md cursor/.cursor/skills/<name>/SKILL.md`
