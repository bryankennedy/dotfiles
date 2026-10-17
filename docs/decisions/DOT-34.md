### DOT-34 — Zsh plugins come from nixpkgs, not antidote

**Decision.** zsh-syntax-highlighting, zsh-autosuggestions and zsh-completions are nixpkgs packages in the flake's `environment.systemPackages`, so `flake.lock` pins them along with everything else. `zsh/.zshrc` sources the two plugin scripts from `/run/current-system/sw/share`. Antidote, its Homebrew entry, `zsh/.zsh_plugins.txt` and the ignore entries for its generated bundle are gone.

**Why.** Antidote cloned each bundle at the default branch's current tip on a machine's first interactive shell, and nothing recorded which commit arrived. Every other network install in this repo is pinned. The other fix the nightly review offered, pinning each bundle to a commit in the plugins file, would still leave a second update path outside the lock file. With nixpkgs, `nix flake update` moves the plugins with everything else.

**How it is wired.**

- zsh-autosuggestions installs under `share/zsh`, which the system profile links already. zsh-syntax-highlighting installs to `share/zsh-syntax-highlighting`, which it does not, so the flake adds that path to `environment.pathsToLink`.
- zsh-completions needs no line in the zshrc. It installs to `share/zsh/site-functions`, and nix-darwin's `/etc/zshenv` already puts that directory on `fpath` before compinit runs.
- The zshrc checks that each script is readable before sourcing it. A shell started before the first switch then loads without plugins and prints no errors.
- The plugins load at the same point antidote loaded them, before compinit, so behavior is unchanged.

**Checked.** `nix build .#darwinConfigurations.simple.system` succeeds. Both scripts and zsh-completions' functions are present under the built profile's `sw/share`. An interactive zsh using the new block against that profile loads syntax-highlighting 0.8.0 and autosuggestions. `bun test tests/` passes.
