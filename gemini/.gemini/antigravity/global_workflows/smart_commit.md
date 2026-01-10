---
description: Review uncommitted changes, break them into logical chunks, and create meaningful commits explaining the "why".
---

1. **Analyze Changes**
   - Run `git status` to identify modified, new, or deleted files.
   - Run `git diff` (and `git diff --cached`) to examine the specific code changes.

2. **Security Check**
   - **CRITICAL**: Scan the `git diff` output for any potential secrets, API keys, passwords, tokens, or PII.
   - **IF A SECRET IS DETECTED**:
     - **STOP IMMEDIATELY**. Do not proceed to stage or commit.
     - **WARN THE USER**: Explicitly identify the suspected secret and file.
     - Ask the user for confirmation or to fix the file before proceeding.
   - Only proceed to the next step if you are confident there are no secrets.

3. **Plan Commits**
   - Identify distinct logical units of work in the changes (e.g., "refactoring", "bug fix", "new feature").
   - Group files that belong to the same logical change.
   - If a single file contains unrelated changes, note that partial staging may be required (though separate files are preferred for simplicity if possible).

4. **Execute Commits**
   - *Repeat this step for each logical chunk:*
     a. **Stage Files**: Run `git add <files>` for the current chunk.
     b. **Draft Message**: Create a commit message following the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.
        - **Format**: `type(scope): subject`
        - **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
        - **Subject**: Concise summary in imperative mood, no capitalization (unless proper noun), no period at end (e.g., "fix: resolve race condition in user loader").
        - **Body**: Explain the context (why was this change needed?), the solution (what did you do?), and any side effects.
     c. **Commit**: Run `git commit -m "Subject" -m "Body"`.

5. **Verify**
   - Run `git status` to ensure all intended changes are committed.
   - Run `git log -n 5` to identify the recent history and confirm the commits look correct.