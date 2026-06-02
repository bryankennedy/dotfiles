---
name: cleanup-worktree
description: Safely tear down a git worktree after its PR has been merged — deletes the remote branch, removes the worktree directory, drops the local branch ref, and syncs local main with remote.
---

## ⚠️ Before you begin — two hard stops

**Do not proceed if either condition is true:**

1. **Uncommitted changes exist in the worktree.**
   Run `git status` first. If there are modified or untracked files that aren't captured in a commit, stop and ask the user what to do with them. Blowing away a worktree is irreversible.

2. **The PR has not been merged (or doesn't exist).**
   Run `gh pr list --head <branch> --state merged` to confirm. If the branch has an open PR, or no PR at all, stop and warn the user — they may be cleaning up the wrong worktree or cleaning up too early.

---

## Steps

1. **Identify the worktree**
   - Determine the worktree branch name and its path on disk.
   - Run `git worktree list` from the repo root to get both values.
   - If invoked from inside the worktree, the current branch is the target. If invoked from the main repo, ask the user which worktree to remove if there is more than one.

2. **Safety checks**
   - Run `git -C <worktree-path> status --porcelain`. If output is non-empty, **stop** — uncommitted changes present.
   - Run `gh pr list --head <branch> --state merged`. If the result is empty, **stop** — no merged PR found. Warn the user and ask them to confirm they want to proceed anyway (e.g. if the branch was merged without a PR, or via a direct push).

3. **Delete the remote branch**
   ```bash
   git -C <repo-root> push origin --delete <branch>
   ```
   If the remote branch is already gone (already deleted from GitHub after merge), this will fail harmlessly — note it and continue.

4. **Remove the worktree**
   ```bash
   git -C <repo-root> worktree remove <worktree-path>
   ```
   If this fails with "contains modified or untracked files", use `--force` **only after confirming with the user** that the files are disposable (e.g. session artifacts like `settings.local.json` that were re-dirtied after the last commit).

5. **Delete the local branch ref**
   ```bash
   git -C <repo-root> branch -D <branch>
   ```
   Use `-D` (force), not `-d` — squash merges don't leave a merged ancestry chain, so `-d` will refuse even for cleanly merged branches.

6. **Sync local main with remote**
   ```bash
   git -C <repo-root> fetch origin
   git -C <repo-root> reset --hard origin/main
   ```
   A plain `git pull` will fail after a squash merge because the squash commit is a new SHA not present in local history, causing git to see divergent branches. `reset --hard` is the correct sync strategy here.

7. **Confirm**
   - Run `git -C <repo-root> worktree list` — should show only the main worktree.
   - Run `git -C <repo-root> log --oneline -3` — confirm the squash merge commit is the HEAD of main.
   - Report the final state to the user.
