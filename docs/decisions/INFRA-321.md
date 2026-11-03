### INFRA-321 — Forge repos on the Mac use the nix OpenSSH, so a FIDO SSH key works

**Decision.** `nix-darwin/flake.nix` installs `pkgs.openssh`. A new Mac-only file, `git/.gitconfig-darwin`, sets `core.sshCommand = /run/current-system/sw/bin/ssh`. The shared `git/.gitconfig` includes that file only for a repo with a forge remote, through `includeIf "hasconfig:remote.*.url:..."`. The three patterns match the URL forms that the repos use: `ssh://git@git.bck.dev:2222/**`, `ssh://git.bck.dev:2222/**` and `git@git.bck.dev:*/**`. In these globs, `**` spans `/` only next to a slash, so the short form needs `*/**`. `tests/git/gitconfig-forge.test.js` checks all three forms.

**What prompted it.** The forge SSH key is now an `ed25519-sk` FIDO key. Apple's `/usr/bin/ssh` and `/usr/bin/ssh-keygen` have no FIDO support, so they cannot use it. The owner made the key in a `nix shell nixpkgs#openssh`. Outside that shell, every forge operation failed. The private infrastructure repo tracks the work under INFRA-320 and INFRA-321.

**Why a full path in git config, not only PATH.** `zsh/profile.zsh` puts `/run/current-system/sw/bin` before `/usr/bin`, so a shell finds the nix `ssh` first. GUI apps and editors start from launchd, and their PATH puts `/usr/bin` first. Without `core.sshCommand`, a fetch from such an app would use Apple's `ssh` and fail.

**Why only forge repos.** Repos with no forge remote need no FIDO key, so git keeps Apple's `ssh` for them. A repo with both a forge remote and another remote uses the nix `ssh` for both. A fault in the nix `ssh` then breaks only repos with a forge remote. A test on 2026-11-03 showed that the condition also applies during `git clone` from the forge.

**Why a separate file.** `remote/install.sh` builds the VMs' `~/.gitconfig.dotfiles` from `git/.gitconfig`. The VMs have no `/run/current-system`, so the setting cannot go in the shared file. Stow links every file in the `git` package on the Mac, so `~/.gitconfig-darwin` exists there. `remote/install.sh` links only `.gitignore_global` from that package, and git skips an include whose file is missing. `tests/remote/install-gitconfig.test.js` checks that a VM repo with a forge remote resolves no `core.sshCommand`.

**Why the includes come first.** They sit at the top of `git/.gitconfig`, so a later `git config --global core.sshCommand ...` still wins.

**What stays out of this repo.** The Mac's `~/.ssh/config` stays a local file, because this repo is public (DOT-9, DOT-17).

**Check after `compy`.** In a new terminal that is not a nix shell:
- `which ssh` prints `/run/current-system/sw/bin/ssh`;
- in a forge repo, `git config --get core.sshCommand` prints the same path;
- in a GitHub repo, the same command prints nothing;
- `ssh -T -p 2222 git@git.bck.dev` asks for a touch, then greets the owner by the key name.

**Residual.**
- In a shell, `ssh`, `ssh-add` and `ssh-keygen` are now the nix builds for every host. They reject Apple-only options such as `UseKeychain` in `~/.ssh/config` or in a file under `~/.ssh/config.d/`, and Apple-only flags such as `ssh-add --apple-use-keychain`. None is in use today. If one is needed later, put `IgnoreUnknown UseKeychain` above it, or call `/usr/bin/ssh-add`.
- `core.sshCommand` names a path in the system profile. It is absent after a `darwin-rebuild --rollback` to a generation from before this change, and in the boot window before the encrypted `/nix` volume mounts (`zsh/profile.zsh`). In those cases repos with a forge remote fail with "cannot run". Repos with no forge remote are not affected.
- GUI tools that run `ssh` directly, not through git, still find Apple's `ssh` first. None of them needs the forge today. A launchd PATH change would cover them, and is not part of this change.
