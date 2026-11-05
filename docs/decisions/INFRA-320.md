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
