# Repository structure

The repository is structured so that running `stow <package>` from the root symlinks the contents of that package into your home directory (`~`), preserving the directory structure. On macOS the nix-darwin activation script stows these packages for you — the **canonical list of stowed packages, and the rationale for the command shape, lives in a comment next to the `stow` call in [`nix-darwin/flake.nix`](../nix-darwin/flake.nix)**. This doc describes what each package is for; it does not re-list the package tokens, to avoid drift.

> **This repo is a first pass, not a full mirror of `$HOME`.** Apps installed manually often keep their own configs in `$HOME` that aren't stowed or tracked here, so expect a given machine to have extra config that this repo doesn't know about — treat the repo as the tracked core, not the complete picture.
>
> `bin/`, `claude/` and `nvim/` were once described here as "intentionally not auto-stowed." They were stowed anyway, by hand, and that undeclared link is how `~/.claude/commands` became an unmanaged symlink into this repo. All three are now declared in `flake.nix` like every other package. A package that is stowed but undeclared is invisible to every tool that reads the list — if a package genuinely should not be stowed, it must not be stowed at all.

## Stow packages

- **ghostty/**: Ghostty terminal configuration and themes.
- **zsh/**: Zsh shell configuration.
- **vim/**: Vim configuration.
- **nvim/**: Neovim configuration (`~/.config/nvim/init.lua`) — Neovide GUI settings, and the
  OSC 52 yank that carries a clipboard copy out of an SSH session. `remote/install.sh` links the
  same file on the VMs, where `vi` and `vim` are both Neovim.
- **git/**: Git global configuration.
- **bin/**: Scripts linked into `~/bin`. Among them, `forge-ssh` is git's ssh for forge repos on the Mac, `fido-ssh` is the same ssh with a dialog for any host, which Ansible uses on the Mac, and `fido-touch-notify` shows that dialog while the FIDO key waits for a touch (`docs/decisions/INFRA-320.md`).
- **starship/**: Starship prompt configuration.
- **karabiner/**: Karabiner-Elements configuration. Includes complex modifications that map the middle mouse button (button3), the fn key, and the Varmilo Pause key (and F15) to F17, the [Hex](https://github.com/anomalyco/hex) dictation trigger (`docs/decisions/DOT-39.md`).

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

## Claude Code plugin marketplace (not a stow package)

- **`_agent/marketplace/`**: A plugin marketplace that `nix-darwin/flake.nix` and `remote/install.sh` register as a local `directory` source. Each entry in `.claude-plugin/marketplace.json` points at a third-party plugin by `git-subdir` and pins it to a commit `sha`. `scripts/audit-pins.mjs` reports when upstream moves past a pin, and `tests/invariants/plugin-sources.test.js` fails if an entry loses its pin. See `docs/decisions/DOT-36.md`.

## Remote VM config (not a stow package)

- **`remote/`**: Lightweight bash-based dotfiles for headless Linux VMs. Has its own installer (`install.sh`) that symlinks shared configs (vim, tmux) and generates a safe gitconfig. See [Remote VM Setup](REMOTE.md).

## Forge CI and PR review (not a stow package)

- **`.forgejo/`**: The forge's view of this repo. `CODEOWNERS` puts every path behind the owner's approval. `workflows/claude-review.yml` has Claude review each PR as the `argus` account, and `workflows/test.yml` runs `bun test tests/`. See [Claude PR review](claude-review.md).
- **`AGENTS.md`**: The criteria that review applies, and the repo's agent instructions. `CLAUDE.md` is a one-line `@AGENTS.md` import, so Claude Code loads the same text into any session opened in this repo.
- **`scripts/argus-review.mjs`**: The read-only reader an agent uses to fetch the `argus` review of its own PR (the `argus-review` skill). See [Claude PR review](claude-review.md).
- **`scripts/forgejo-review.mjs`** and **`tests/`**: The review's posting logic, and the tests that hold its security properties in place. `tests/remote/` runs `remote/install.sh` against a throwaway home.

## Git hooks (not a stow package)

- **`.githooks/`**: Hooks for this repo itself, not for `$HOME`. `pre-commit` runs gitleaks over staged changes and refuses the commit on a finding, or when gitleaks is missing. Git only runs them where `core.hooksPath` points here. The nix-darwin activation sets that for `~/src/dotfiles`. Fleet clones don't set it, so the hook doesn't run there.

## App setup scripts (not a stow package)

Some macOS applications store their configuration in `~/Library/Preferences` (via the `defaults` system) rather than dotfiles, so they can't be managed with Stow. The `scripts/` directory contains idempotent setup scripts for these apps.

| Script | App | What it configures |
|--------|-----|--------------------|
| `scripts/hex.sh` | [Hex](https://github.com/anomalyco/hex) | Sets the dictation hotkey to F17 through Hex's CLI (pairs with the Karabiner rules that send F17) |

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

- **`claude/.claude/statusline.mjs`**: The Claude Code status line. It shows the model on the left behind an icon for its name with a face for the effort level after it, the directory and a bar for the context window behind a 🧠 mark in the centre, and a bar for each rate limit on the right: ⏳ for the 5-hour window and 📅 for the 7-day window. After each icon is the time left before that window resets, such as `2h` or `1d`. The right part is an OSC 8 link to the usage page on claude.ai. Each bar takes its colour from its own percent: green below 70, yellow from 70, red from 90. Claude Code sets `COLUMNS` to the terminal width, and the script pads the gaps to place the parts. This file is the one copy: stow links it into `~/.claude/` on the Mac, and `remote/install.sh` links it on the VMs. The settings merge in `nix-darwin/flake.nix` and the one in `remote/install.sh` each set `statusLine` to `bun ~/.claude/statusline.mjs`. `tests/claude/statusline.test.js` fails when the two values differ.
