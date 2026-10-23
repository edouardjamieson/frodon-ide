/**
 * Worktrees: one repository, checked out in more than one place at once.
 *
 * A linked worktree is not a copy. `git worktree add` writes a directory whose
 * `.git` is a *file* pointing back at `<repo>/.git/worktrees/<name>`, so the
 * object store, the refs and the reflog are shared — creating one is a
 * checkout rather than a clone, and a commit made in it is in the original
 * repository's database the instant it lands. Copying the folder instead
 * would give two repositories that know nothing about each other, which is a
 * different feature and not a useful one.
 *
 * Two properties fall out of that and are the reason this feature works at
 * all, both of them git's rather than ours:
 *
 *   - **A branch can only be checked out in one worktree.** Git refuses the
 *     second, *including* the branch the main window is on. The promise that
 *     opening a worktree never moves the checkout you were working in is
 *     enforced a layer below anything this app could get wrong.
 *   - **`git worktree list` is the registry.** Every worktree's path and
 *     branch is derivable from the repository itself, so Frodon stores no
 *     mapping of its own and has nothing that can go stale.
 */

/** One checkout of a repository, as `git worktree list --porcelain` reports it. */
export interface Worktree {
  /** Absolute path of the working tree. */
  path: string;
  /** Short branch name, or `''` when the worktree is detached. */
  branch: string;
  detached: boolean;
  /** The commit it is on. */
  head: string;
  /**
   * The repository's own working tree — the one with the real `.git`
   * directory in it.
   *
   * Always the first block git prints, never removable, and the only one that
   * is not under `~/frodon/worktrees`. It is in the list because it is one of
   * the checkouts, and leaving it out would make the panel claim the project
   * you are looking at is not a worktree of itself.
   */
  main: boolean;
  /**
   * Git can no longer find the directory — someone deleted it outside Frodon.
   *
   * The entry still exists in `.git/worktrees` and still holds the branch,
   * which is why this is worth showing rather than hiding: a prunable
   * worktree is what stands between you and checking that branch out again.
   */
  prunable: boolean;
  /** Held against removal by `git worktree lock`. */
  locked: boolean;
}

export interface WorktreeCreateRequest {
  /**
   * The branch the worktree is on.
   *
   * Existing or new — main decides which by looking it up, rather than taking
   * a flag from the renderer that could disagree with the repository.
   */
  branch: string;
  /**
   * Where a *new* branch starts. Ignored when the branch already exists.
   *
   * Absent means `HEAD`, which is what `git worktree add -b` does on its own.
   */
  startPoint?: string;
}

export interface WorktreeResult {
  ok: boolean;
  /** The new worktree's path, on success. What the new window opens on. */
  path?: string;
  /**
   * Why not.
   *
   * Usually git's own sentence rather than one of ours — `'feature/x' is
   * already used by worktree at …` says more, and more accurately, than any
   * rewording of it would.
   */
  error?: string;
}

/**
 * A branch name as a single safe directory name.
 *
 * `feat/thing` is a perfectly good branch and a path with a directory
 * separator in it, so the slug flattens it. The result is *not* authoritative
 * and nothing ever maps back from it: `git worktree list` reports which branch
 * is at which path, so the directory name only has to be unique, stable and
 * readable by a person looking at `~/frodon/worktrees`.
 *
 * Shared rather than main-only because the create dialog shows the path it is
 * about to make, and a preview that disagreed with the directory would be
 * worse than no preview.
 */
export function worktreeSlug(branch: string): string {
  return (
    branch
      .trim()
      // Anything that is not plainly safe in a path, including the separator
      // itself. Collapsed rather than dropped so `feat/a--b` and `feat-a-b`
      // stay visibly different.
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      // A leading dot would hide the directory; a leading dash would make
      // every `cp` and `rm` that touches it read it as a flag.
      .replace(/^[.-]+/, '')
      .replace(/[.-]+$/, '') || 'worktree'
  );
}
