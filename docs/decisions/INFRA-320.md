### INFRA-320 — A dialog while the FIDO key waits for a touch

**Decision.** `git/.gitconfig-darwin` sets `core.sshCommand = /Users/bk/bin/forge-ssh` and `ssh.variant = ssh`. `bin/bin/forge-ssh` runs the nix OpenSSH. For a connection to `git.bck.dev`, it adds `-o BatchMode=yes` and sets `SSH_ASKPASS` to `bin/bin/fido-touch-notify`, with `SSH_ASKPASS_REQUIRE=force`. Each time the forge key waits for a touch, the notifier writes one line to stderr, plays a sound and opens a dialog. The dialog closes after the touch. This supersedes the `core.sshCommand` line of `INFRA-321.md`. The rest of INFRA-321 stands: the wrapper runs the same nix OpenSSH, by its full path.

**What prompted it.** The forge key asks for a touch on each connection. ssh says so in one line on stderr. When git runs in the background, or its stderr goes to a pipe, nobody sees that line. The command then seems to hang until the key gives up.

**Why BatchMode.** In OpenSSH, `notify_start()` in `readpass.c` runs `SSH_ASKPASS` for a touch notice only when stderr is not a terminal, or when its caller forces it. `sshconnect2.c` forces it when `BatchMode` is on. With no display variable set, it also needs `SSH_ASKPASS_REQUIRE=force`. `BatchMode` also stops every other prompt, so a forge connection never waits on a question that nobody sees.

**Why only the forge.** git sends every remote of a forge repo through `core.sshCommand`, because the include matches the repo, not the remote. So the wrapper checks its arguments for `git.bck.dev` or `<user>@git.bck.dev`. Another remote, such as a GitHub mirror, runs the plain nix OpenSSH with its normal prompts.

**Why the dialog closes by itself.** ssh starts the notifier with `SSH_ASKPASS_PROMPT=none` and stops it with SIGTERM after the touch. The notifier ends with `exec osascript`, so the dialog runs in the process that ssh stops. It also closes after 120 seconds. A banner was tried first on 2026-11-05, and it closed before the owner reached the key.

**Why the notifier refuses other requests.** With `SSH_ASKPASS_REQUIRE=force`, ssh also sends a passphrase or PIN request to `SSH_ASKPASS`. ssh sets `SSH_ASKPASS_PROMPT=none` only for a touch notice, so the wrapper unsets any value it inherits. The notifier exits 1 for each request that is not a touch notice. A yes/no question then fails at once, where an empty answer would mean yes. A passphrase or PIN request gets an empty answer, and that try fails.

**Why `ssh.variant` and an absolute path.** git does not know the name `forge-ssh`, so it would run `forge-ssh -G` as a probe before each connection. If that probe fails, git refuses the port in an `ssh://host:2222/` URL. `ssh.variant = ssh` removes the probe. The absolute path lets a tool that runs `core.sshCommand` with no shell find the wrapper.

**Why `ps -ww`.** The message comes from the command line of the parent ssh. With no terminal attached, macOS `ps` cuts its output to 79 columns, and the git command falls off the end.

**Tested.** On the Mac on 2026-11-05, a fetch in a terminal and a fetch with stderr in a pipe each showed the dialog, and the dialog closed after the touch. `tests/bin/forge-ssh.test.js` runs a copy of the wrapper against a stub ssh, and checks the refusal and the message text.

**Check after `compy`.** `~/.gitconfig-darwin` links to the file in the repo, so a `git pull` of dotfiles changes `core.sshCommand` at once. `~/bin/forge-ssh` exists only after `compy` links the `bin` package. So run `compy` before the next forge command. Until then, forge commands fail with "cannot run". `compy` itself needs no forge access. Then:
- in a forge repo, `git config --get core.sshCommand` prints `/Users/bk/bin/forge-ssh`;
- `git fetch` in a forge repo opens the dialog, and the dialog names the repo;
- `git fetch 2>&1 | cat` does the same with no terminal.

**Limits.**
- Only git goes through the wrapper. A plain `ssh` in a shell shows ssh's own line on stderr and no dialog.
- A key that ssh-agent holds signs in the agent, so ssh opens no dialog.
- The forge check matches `git.bck.dev` in lower case, as the remotes write it. An upper-case host or an alias from `~/.ssh/config` runs the plain nix OpenSSH, with no dialog.
- `BatchMode` stops passphrase, PIN and host key prompts for the forge. A forge connection that needs one fails at once. To accept a new forge host key, run the plain nix OpenSSH once: `/run/current-system/sw/bin/ssh -T git@git.bck.dev`.

### INFRA-320b — The same dialog for Ansible, for any host

**Decision.** `bin/bin/fido-ssh` runs the nix OpenSSH with `fido-touch-notify` as `SSH_ASKPASS`, for any host. `zsh/profile.zsh` sets `ANSIBLE_SSH_EXECUTABLE` to `~/bin/fido-ssh` when that file exists, so an Ansible run from a Mac shell uses it. `forge-ssh` does not change, except that it also exports the host for the dialog text.

**What prompted it.** Ansible's ssh can now wait for a FIDO touch. Ansible hides ssh's own "Confirm user presence" line, so on 2026-11-05 a run looked hung until the owner saw the key blink.

**Why no BatchMode here.** With stderr not a terminal, ssh sends a touch notice to `SSH_ASKPASS` when `DISPLAY` or `WAYLAND_DISPLAY` is set (`notify_start()` in OpenSSH's `readpass.c`). Ansible gives ssh a pipe for stderr. So `fido-ssh` sets `WAYLAND_DISPLAY=fido-ssh` when no display variable is set, and adds neither `BatchMode` nor `SSH_ASKPASS_REQUIRE`. Without those two, `read_passphrase()` still uses the terminal when one is open. So a password with `-k`, a host key question and a passphrase typed at the terminal still work. Ansible sends `-o BatchMode=no` for a password login, and `BatchMode=yes` from the wrapper would come first and win. That is why the forge path keeps `BatchMode` and this path does not. When `SSH_ASKPASS` is already set, for example by Ansible's `ssh_askpass` password mechanism, `fido-ssh` runs plain ssh and changes nothing.

**The host in the dialog.** `fido-ssh` takes the first argument that is not an option or the value of one, with any `ssh://` prefix removed, and exports it as `FIDO_SSH_DEST`. `forge-ssh` exports the forge host. The notifier keeps only host-name characters and drops a `user@` part. A git connection to the forge still shows the command and the repo. Any other connection shows "ssh to <host>", or "An SSH login" when the wrapper found no host. A wrong parse changes only the dialog text, never the arguments that ssh gets.

**Limits.**
- Only Ansible and git use the wrappers. A plain `ssh` in a shell shows ssh's own line and no dialog.
- Ansible's file transfers run `sftp` or `scp` directly. They reuse the connection that `fido-ssh` opened while `ControlPersist` keeps it, and need no new touch. If that connection has closed, a transfer that waits for a touch shows no dialog.
- With no controlling terminal, ssh sends a passphrase or password request to the notifier, which refuses it. The same key also fails without the wrapper, because ssh then has no way to ask.
- A `ProxyJump` hop inherits the environment, so its dialog names the final host.
- A shell that started before `compy` linked `fido-ssh` keeps Ansible's default until it starts again.
