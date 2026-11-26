### INFRA-381 — The touch dialog for an ssh typed in a shell

**Decision.** `zsh/aliases-macos.zsh` defines an `ssh` function when `~/bin/fido-ssh` and the nix OpenSSH both exist. The function runs `fido-ssh` with `FIDO_SSH_MODE=shell`. In that mode, `fido-ssh` runs `ssh -G` with the same arguments and reads the result. When the checks below pass, it adds `-o BatchMode=yes`. It also sets `fido-touch-notify` as `SSH_ASKPASS`, with `SSH_ASKPASS_REQUIRE=force`, as `forge-ssh` does. When a check fails, it runs the nix OpenSSH with no change. The Ansible path of `fido-ssh` does not change.

**What prompted it.** A git push to the forge plays a sound and opens a dialog while the FIDO key waits for a touch (INFRA-320). An `ssh <host>` typed in a shell only prints ssh's own "Confirm user presence" line, and the owner can miss it.

**Why BatchMode.** When stderr is a terminal, ssh writes the touch notice to the terminal. It runs `SSH_ASKPASS` for the notice only when `BatchMode` is on (`notify_start()` in `readpass.c`, called from `sshconnect2.c`). The INFRA-320 record has the detail. So the dialog needs `BatchMode` here too.

**Why the checks.** `BatchMode` stops every password, passphrase and host key prompt. In a shell, those prompts are wanted. So shell mode adds `BatchMode` only when ssh needs none of them:
- Each `identityfile` line of `ssh -G` must have a `.pub` file next to it, and its key type must start with `sk-`. A host with no `IdentityFile` gets the default list, which holds `id_rsa` and other keys that are not FIDO keys. So that host falls back.
- Each key handle file must open with an empty passphrase (`ssh-keygen -y -P ''`). That command reads the file only, and needs no touch.
- `ssh-keygen -F` must find the host key in one of the known hosts files that `ssh -G` names. The lookup name is `HostKeyAlias` as it is, or else `HostName`. A `HostName` on a port other than 22 takes the form `[host]:port`. So a first login still asks about the new host key.
- A `ProxyJump` or `ProxyCommand` falls back, because the jump host can need its own prompt.
- A `batchmode` word in the arguments, or `BatchMode` from the config, falls back. So an `-o BatchMode=no` from the owner wins.
- A call with `-G`, `-V`, `-Q` or `-O` falls back, also inside a flag cluster such as `-vG`. Such a call shows or controls something, and `ssh -G` must show the config as it is. The match also catches an option value with one of these capitals, such as `-oGSSAPIAuthentication=no`. That login only loses the dialog.

**Why an env variable and not a terminal check.** The function sets `FIDO_SSH_MODE=shell`. Ansible does not, so Ansible keeps the INFRA-320b path. The mode does not check for a terminal. After the checks above, ssh needs no prompt, so `ssh <host> cmd 2>log` also shows the dialog. The wrapper unsets the variable first, so ssh and its children never get it.

**Why a function in `aliases-macos.zsh`.** That file loads only in an interactive zsh on macOS. Scripts, `scp`, `rsync` and git keep the plain ssh. Other zsh functions that call `ssh`, such as `progress-space-init`, go through the function too. `command ssh` skips it. The guard also checks for `/run/current-system/sw/bin/ssh`. Without that file, the function would leave the shell with no working `ssh`.

**Tested.** `tests/bin/forge-ssh.test.js` runs shell mode against a stub ssh and a stub `ssh-keygen`. The stub ssh prints a given `ssh -G` result. The tests check the added options and environment, and the `[host]:port` and `HostKeyAlias` lookups. They also check each case that falls back.

On the Mac on 2026-11-26, a dry run against the live `~/.ssh/config` gave these results:
- the dialog path for each host whose only key is a FIDO key and whose host key is known;
- the plain path for a host with no `IdentityFile`;
- the plain path for a host with an unknown host key, and for a FIDO host with `-J`, with a port that is not in known_hosts, and with `-o BatchMode=no`.

**Check after a pull.** `~/.zshrc` loads the file from the repo, so a `git pull` of dotfiles and a new shell are enough. Then:
- `type ssh` prints `ssh is a shell function`;
- `ssh <host>` to a FIDO-only host plays the sound and opens the dialog "ssh to <host> waits for a touch", and the dialog closes after the touch;
- `ssh <host>` to a host with no `IdentityFile` logs in as before, with no dialog.

**Limits.**
- The fall back depends on the identity file list only. When ssh-agent holds the same FIDO key, the key signs in the agent, and no dialog opens. `BatchMode` is still on.
- `BatchMode` stops keyboard-interactive login and the password fall back. A host that needs one of them after the FIDO key fails at once. Use `command ssh` for such a host.
- A second `ssh` to a host with an open `ControlMaster` connection needs no touch, so no dialog opens.
- A FIDO key with a PIN needs the PIN prompt, and the notifier refuses it. The owner's keys use touch only. Use `command ssh` for a PIN key.
- Each login runs `ssh -G` first, so a `Match exec` command in `~/.ssh/config` runs two times. The current config has none. `ssh -G` and `ssh-keygen` together add a few milliseconds.
