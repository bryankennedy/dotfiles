### DOT-7 — Remove the tpm bootstrap instead of pinning it

**Decision.** nix-darwin activation no longer clones tpm, and `tmux/.tmux.conf` no longer declares tpm, tmux-resurrect or tmux-continuum. The PATH override that existed only so those plugins could shell out to `tmux` is gone too. tmux itself stays installed, and the rest of the config is unchanged: prefix, bindings, status bar and styles.

**What prompted it.** The nightly review found the activation step `git clone https://github.com/tmux-plugins/tpm` with no tag, commit or verification. It's the one network install the 2026-09-07 pinning pass skipped. The suggested fix was to pin the clone to a commit and watch it in `scripts/audit-pins.mjs`.

**Why removal, not a pin.**
- **Nothing runs this code.** Ghostty launches herdr, which replaced tmux as the multiplexer, and nothing on the Mac starts a tmux server. The plugins execute only inside a running tmux; tmux-continuum runs its save script on a status-bar timer. So the pin would guard code that doesn't run.
- **A pin on tpm wouldn't have pinned what matters.** tpm installs plugins by cloning their default branches when `prefix+I` is pressed. A tpm `@plugin` entry accepts a branch or tag, not a commit. So the plugins, including the one on a timer, would have stayed unpinned. Pinning all of it properly means three pins and three `audit-pins.mjs` checks, all for an unused tool.
- **Removal leaves no fetch at all,** and nothing to bump or watch.

**The fleet.** `remote/install.sh` symlinks this `.tmux.conf` onto every VM. Neither it nor the private repo ever installed tpm there, so the plugin lines did nothing on the VMs. The removed PATH override did apply there: it replaced the PATH for new panes with a macOS list that lacks the VMs' own bin directories. Removing it lets new panes on the VMs inherit the normal PATH again.

**Not done here.** The existing `~/.tmux/plugins` directory on the Mac is left alone, because activation never deletes user state. Removing it is an optional manual step. If tmux ever comes back into daily use, re-add the plugins with pins in the same change, not the bare clone.
