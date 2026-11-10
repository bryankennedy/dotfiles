### DOT-44 — This repo no longer pins Claude Code to `default` mode

**Decision.** The tracked `.claude/settings.json` is deleted. Its only content was `permissions.defaultMode: "default"`. With no project mode, a Claude Code session in this repo takes the user-level mode. On the Mac, activation sets that mode to `auto`, so a session here starts in `auto`. The owner made this choice on 2026-11-10.

**What prompted it.** The owner uses `auto` mode in more and more of the work, and trusts it more than before. In this repo the owner changed each session to `auto` by hand at the start. The pin thus set only the mode in which a session started. In a session that the owner changed, it added one step and changed nothing after that step. A session that nobody changed stayed in `default`, and this decision gives up that effect: such a session now starts in `auto` on the Mac.

**Why the file is deleted and not set to `auto`.** A tracked `"defaultMode": "auto"` applies on every machine that checks out the repo. The owner's choice is about the Mac. The VMs do not set a user-level mode, because `remote/install.sh` leaves it at Claude Code's own default. Without the file, the Mac gets `auto` and the VMs keep that default.

**What the baseline entry says now.** The accepted entry for the Mac's `auto` mode in `docs/security-baseline.md` described the pin as the stricter mode for this repo. The entry now says that the repo sets no mode, and it cites this record. The two controls that carry the entry are the same: the PR gate on the forge, and the pinned agent-instruction inputs. The gate is CODEOWNERS and branch protection on the forge, so the mode of a local session does not change what reaches `main`. The pin was described in the entry, but the entry did not count it as a control.

**Why this is the owner's call, and how it is put to them.** A baseline entry that is widened is a decision about risk. An agent wrote this change at the owner's request, and the forge's review asked for the owner's approval and for this record. The change ships as a pull request that CODEOWNERS routes to the owner. The alternative stays open to them: close the pull request, and the pin stays.

**Not done here.**
- No change to the activation code in `nix-darwin/flake.nix`. Only its comment changed.
- No change to the VMs.
- No assessment of the widened entry in this repo. DOT-1 keeps assessments in the private infrastructure repo, and the owner records this one there.

**To go back.** Restore `.claude/settings.json` with `permissions.defaultMode: "default"`, and restore the earlier wording of the baseline entry.
