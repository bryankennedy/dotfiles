### DOT-45 — Agent sessions work in a worktree, and the main checkout keeps a stricter mode

**Decision.** Agent sessions for this repo work in a sibling worktree, not in the main checkout. The main checkout keeps a stricter permission mode than `auto` for its own sessions, in its untracked local settings. Worktree sessions keep the Mac's `auto` mode (corrected in DOT-45b). The owner made this choice on 2026-11-16.

**What prompted it.** DOT-44 removed the tracked `default` pin, so a session here starts in `auto` on the Mac. Stow links the files of the main checkout into `$HOME` one by one. An edit in the main checkout is thus live before a pull request exists. The PR gate on the forge guards `main`, not that working tree. The pinned instruction inputs bound what reaches an agent, not what an agent writes. Neither control covered this path.

**Why a worktree.** Stow targets only the main checkout. An edit in a worktree reaches `$HOME` only after the PR merges and the owner pulls `main` into the main checkout. The PR gate thus covers the edit before it is live. `AGENTS.md` tells agents to work this way.

**Why the stricter mode is local and untracked.** A tracked mode applies to every checkout, the worktrees too, which is what DOT-44 removed. The local settings file belongs to one checkout, so only the live copy gets the stricter mode.

**Options not taken.**
- A permission rule for the stowed paths. Such a rule does not cover every way to write a file, so it is not a control (DOT-18).
- The tracked pin. It undoes DOT-44 for every checkout.
- No change. The gate then sees a live edit only after the fact.

**The assessment** is in the private infrastructure repo, as DOT-1 requires. It holds the check for the local mode and the conditions under which this acceptance expires.

**Limits.**
- Nothing writes the local mode. A new clone needs it again by hand.
- The owner can still change a main-checkout session to `auto` by hand.

**To go back.** Delete the worktree rule from `AGENTS.md` and the DOT-45 paragraph from the baseline entry, and remove the mode from the main checkout's local settings.

### DOT-45b — A worktree session starts in `auto` only with `cw`

**Correction.** DOT-45 said that a worktree session keeps the Mac's `auto` mode. That is wrong for a worktree that `claude -w` makes. On 2026-11-16 the owner started `claude -w` in the main checkout, and the session started in manual mode. Claude Code makes that worktree under `.claude/worktrees/` and reads the main checkout's local settings for it. Nobody has tested a session in a worktree made with `git worktree add`.

**Decision.** Start a worktree session with `cw <name>`, from `zsh/aliases-macos.zsh`. It runs `claude -w <name> --permission-mode auto`. The flag overrides the mode in the settings files, so the session starts in `auto` in any worktree. The function always pairs the flag with `-w`, so it cannot start the main checkout in `auto`. It is macOS only, because the VMs keep Claude Code's own default mode (DOT-44).

**What does not change.** A plain `claude` in the main checkout still starts in manual mode. A worktree under `.claude/worktrees/` is not stowed, so an edit there is not live.

**Limits.** `claude --permission-mode auto` typed in the main checkout also overrides its mode. `cw` makes the safe form the short one. It does not block the other.
