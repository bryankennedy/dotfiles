## Table of Contents

- [Dotfiles](#dotfiles)
  - [Setup and usage - Local (macOS)](#setup-and-usage---local-macos)
  - [Remote VM Setup (exe.dev, cloud VMs, etc.)](#remote-vm-setup-exedev-cloud-vms-etc)
  - [App Setup Scripts](#app-setup-scripts)
  - [Structure](#structure)
- [Considered and rejected tools](#considered-and-rejected-tools)

# Dotfiles

Personal system config files for my local (macOS) development environment and remote virtual machines.

* This repo uses nix-darwin (`nix-darwin/flake.nix`) to manage [Homebrew](https://brew.sh/) and other OS-level system config.
* The nix config links config from this repo into `$HOME` using [GNU Stow](https://www.gnu.org/software/stow/).

## Setup and usage - Local (macOS)

### Everyday usage (already installed)

Once the dotfiles are installed on this machine, the day-to-day loop is just two steps:

1. **Edit the config.** Make your changes — most often in `nix-darwin/flake.nix` (add a Homebrew package, tweak a macOS default, etc.), or in any of the stowed dotfile packages.
2. **Apply it.** Run `compy` from anywhere:

   ```sh
   compy
   ```

   `compy` is an alias (defined in `zsh/aliases-macos.zsh`) for:

   ```sh
   cd ~/src/dotfiles/nix-darwin && sudo env PATH="$PATH" darwin-rebuild switch --flake .#simple
   ```

   This rebuilds the system, applies Homebrew/macOS changes, and re-stows your dotfiles into `$HOME`.

> **Note:** Flakes only see Git-tracked files, so `git add` any new or changed `flake.nix`/`flake.lock` before running `compy`, or the rebuild won't see your edits.

### First-time setup (new machine)

Bootstrapping a fresh macOS machine (clone, nix-darwin rebuild, Antidote bundle, verification) lives in **[docs/FIRST_TIME_SETUP.md](docs/FIRST_TIME_SETUP.md)**.

## Remote VM Setup (exe.dev, cloud VMs, etc.)

I use a curated selection of these configs on my remote headless Linux VMs. It bundles vim, tmux, git, and core aliases — no macOS dependencies. See **[docs/REMOTE.md](docs/REMOTE.md)** for the one-line install plus what gets installed, updating, per-VM customization, and alias architecture.

## App Setup Scripts

Some macOS applications store their configuration in `~/Library/Preferences` (via the `defaults` system) rather than dotfiles, so they can't be managed with Stow. The `scripts/` directory contains idempotent setup scripts for these apps.

| Script | App | What it configures |
|--------|-----|--------------------|
| `scripts/hex.sh` | [Hex](https://github.com/kitlangton/Hex) | Sets global hotkey to F15 (pairs with the Karabiner middle-mouse → F15 rule) |

Run a script after installing the corresponding app:

```sh
./scripts/hex.sh
```

## Structure

Repository layout — the full list of stow packages and what each one configures, shared sources, and manual-stow instructions — lives in **[docs/STRUCTURE.md](docs/STRUCTURE.md)**. Note that this repo is a first pass, not a complete mirror of `$HOME`: some manually-installed apps keep their own configs that aren't tracked here.

---

# Considered and rejected tools
* Zellij - Too heavy for my simple tmux usage. Don't need floating panes.
* Oh my zsh - Too heavy. Used to use, but the terminal started slowing down after a few years.
