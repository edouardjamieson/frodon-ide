/**
 * What the repository looks like from either side of the boundary.
 *
 * Ported from the TUI's `lib/git/git.def.ts`, with the split the rest of the
 * app follows applied to it: in the TUI a hook spawned `git` from the same
 * process it drew in, so there was no snapshot — the store *was* the state.
 * Here main runs the subprocesses and owns the facts, and this is the shape
 * that crosses: one plain object per observation, no methods, no `Map`.
 */

/** How a file differs from HEAD, as the explorer colors it. */
export type GitFileStatus = 'staged' | 'changed' | 'untracked' | 'conflicted';

/** The commit `HEAD` points at. Null on an unborn branch — a repo with no commits. */
export interface GitCommit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  /** Git's own relative date, e.g. `3 hours ago`. Formatted by `git log`. */
  date: string;
}

/**
 * Everything one `git status` run tells us, plus the HEAD commit.
 *
 * The three file lists hold **repository-relative** paths, because that is
 * what git reports and the repository is not necessarily the project root —
 * opening `~/dev/frodon/src` gives a tree rooted there and a repo rooted two
 * levels up. `repoRoot` is what lets the renderer turn one into the other, so
 * the explorer can look a row up by the absolute path it already holds.
 */
export interface GitStatus {
  inRepo: boolean;
  /** Absolute path of the repository's top level, or '' when not in a repo. */
  repoRoot: string;
  /** Current branch name, or '' when HEAD is detached or unborn. */
  branch: string;
  detached: boolean;
  /** Tracking branch, e.g. `origin/main`, or '' when none is configured. */
  upstream: string;
  /** Commits on HEAD the upstream doesn't have. 0 without an upstream. */
  ahead: number;
  /** Commits on the upstream HEAD doesn't have — as of the last `fetch`. */
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  /** Paths with an unresolved merge conflict. Both staged and dirty, really. */
  conflicted: string[];
  head: GitCommit | null;
}

/** Outcome of a git operation (pull/push/checkout/…). */
export interface GitResult {
  ok: boolean;
  /** git's own stderr, for the UI to show. Only set when `ok` is false. */
  error?: string;
}

/**
 * The "no repository" snapshot.
 *
 * A function rather than a shared constant: both processes keep one of these
 * in a variable they replace wholesale, and a single frozen instance would be
 * one aliasing bug away from the two of them disagreeing about an array.
 */
export function emptyGitStatus(): GitStatus {
  return {
    inRepo: false,
    repoRoot: '',
    branch: '',
    detached: false,
    upstream: '',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    head: null,
  };
}
