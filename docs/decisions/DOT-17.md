### DOT-17 — The Mac's name is not declared in the public flake

**Decision.** `nix-darwin/flake.nix` no longer sets `networking.computerName`, `networking.hostName` or `networking.localHostName`. The Mac keeps the name macOS already has. A new machine gets its name set once by hand with `scutil --set`, as the comment in the flake says. The name stays in published history, and that residual is accepted in `docs/security-baseline.md` under "The Mac's host name remains in this repo's published history."

**Why.** The name is bare, so it resolves nowhere public, and under DOT-9 that makes it private topology. The same file says what the Mac runs: the AgentsView dashboard on its tailnet address, and a push into the fleet's shared database. A name plus one host's role is the pairing the baseline rates HIGH. Without the name, that description is about "the Mac," which tells a reader nothing they could not guess.

**Checked before the change.**

- All three names macOS reports (`scutil --get`) already equal the values the flake declared, so a switch without the lines changes nothing on this machine. With the options unset, nix-darwin's activation no longer runs `scutil --set` at all, so it leaves the current name alone rather than clearing it.
- Nothing in the flake reads the name. The configuration is `.#simple`, and the value shared across the file is `homeDir`.
- The system still evaluates and builds (`nix build .#darwinConfigurations.simple.system`), and each of the three options now evaluates to `null`.
- The Mac takes no SSH: Remote Login is off and Tailscale SSH is not enabled. The dashboard listens only on a tailnet address. The baseline entry re-verifies these conditions.

**Why not a gitignored `machine.nix`.** The nightly review offered a fallback: move the three lines into a gitignored `nix-darwin/machine.nix` and import it behind `builtins.pathExists`. That cannot work here. The flake is evaluated from a git checkout, and Nix copies only tracked files into the store before evaluating, so from the flake's point of view an ignored file does not exist. A throwaway flake with exactly that guard evaluated `pathExists` to `false` with the file on disk. The guard would also hide the failure: every rebuild would succeed and quietly declare no name. For a name that never changes, declaring it is not worth that.

**Not done here.**

- No history rewrite, for the reasons the baseline entry gives.
- Pass 1b's deny-list comes from the private inventory, and the Mac's name is not in it, so the audit will not notice if the name returns to the tree. The baseline entry gives a manual check in the meantime. Adding the Mac to what pass 1b searches belongs to the private repo.
