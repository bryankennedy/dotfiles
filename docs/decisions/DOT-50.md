### DOT-50 — Claude Code updates itself on the Mac and the VMs

**Decision.** Claude Code on the Mac is the native install in `~/.local/bin`, and its own updater keeps it current. Activation no longer installs a pinned `@anthropic-ai/claude-code` with bun. The Mac and the VMs set `DISABLE_TELEMETRY` and `DISABLE_ERROR_REPORTING`, and neither sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. The owner made this choice on 2026-11-18.

**What prompted it.** PR #150 set all three variables on the Mac and the VMs. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` also sets `DISABLE_AUTOUPDATER`. INFRA-138 in the infrastructure repo records that the updater of each interactive session is what keeps Claude Code current on the VMs. With the variable set, the VMs would stay on one version. Claude Code ships several releases a day, and the owner wants each machine to get them.

**Why the Mac is not pinned.** The Mac pinned `claude-code@2.1.309`, and the VMs were already at 2.1.326. A pin moves only when a person bumps it, so the Mac fell behind the VMs. The owner wants the Mac and the VMs to behave the same way.

**What this changes in the pin posture.** Activation keeps its rule: it makes no network install that is not pinned. It now makes no install of Claude Code at all, so the rule does not apply to Claude Code. The owner runs `claude install` once by hand. After that, Claude Code changes its own binary from inside an interactive session, as on the VMs. `scripts/audit-pins.mjs` no longer watches a Claude Code pin, because there is none. wrangler, vite and the other pins do not change.

**What the owner does once on the Mac.** After the switch, run `claude install`, then `bun remove -g @anthropic-ai/claude-code`. Until the second command runs, `~/.bun/bin/claude` stays at 2.1.309, and `~/.bun/install/global/bun.lock` lists it. `~/.local/bin` is first on PATH, so the native `claude` wins once it exists.

**Not done here.**
- No change to `docs/security-baseline.md`. Its resolved entry "The Mac's activation no longer installs moving refs into the agent's path" names claude-code among the pinned activation installs. That entry still holds, because activation now installs no Claude Code. The self-updating native install is outside activation, so that entry does not cover it. No accepted entry names the Claude Code pin as a control.
- No assessment of the change. DOT-1 keeps assessments in the private infrastructure repo.

**To go back.** Restore the `bun install -g @anthropic-ai/claude-code@<version>` line in activation and the entry in `NPM_GLOBALS` in `scripts/audit-pins.mjs`. To stop the updates as well, set `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` again.
