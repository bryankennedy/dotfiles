### DOT-29 — `git/.gitignore_global` holds the exact line that Claude Code appends

**Decision.** `git/.gitignore_global` ignores `**/.claude/settings.local.json`. The line is written in the exact form that Claude Code writes.

**What prompted it.** On a VM, `~/.gitignore_global` is a symlink into the dotfiles checkout, and `core.excludesfile` names it. On 2026-09-15 a tool on one VM appended this line to the file. The append changed a tracked file in the deployment checkout. The dotfiles role then refused to update that checkout in check mode. On a real run the role discarded the edit, and the tool could add it again.

**How Claude Code decides.** The logic was read from the Claude Code 2.1.322 binary on 2026-11-10. Claude Code makes two checks before it writes.

1. It runs `git check-ignore -- .claude/settings.local.json` in the project. If git reports the path as ignored, Claude Code writes nothing.
2. It reads the file that the global `core.excludesfile` names. If the file contains the string `**/.claude/settings.local.json`, Claude Code logs a warning and writes nothing.

If both checks fail, Claude Code appends the line.

**Why the exact form.** A different pattern, such as `.claude/settings.local.json`, passes the first check in most repositories. It does not pass in a repository that tracks its `.claude/settings.local.json`, because `git check-ignore` reports a tracked file as not ignored. In that repository only the second check stops the append, and the second check is a search for the exact string. The exact form passes both checks.

**The test.** `tests/git/gitignore-global.test.js` runs the real file through `git check-ignore` and checks for the exact line.

**Limit.** The decision rests on the behaviour of one Claude Code version. If a later version appends a different line, the test does not catch it. The dotfiles role will then report local modifications again.

**To go back.** Remove the line and the test.
