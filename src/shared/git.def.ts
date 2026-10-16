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

/**
 * One commit as the history view reads it.
 *
 * A `GitCommit` plus the two things a graph needs and a single commit does
 * not: who its parents are, and which refs point at it. Both come free with
 * the `git log` that is already being run — `%P` and `%D` — so the graph
 * costs no extra process.
 */
export interface GitLogCommit extends GitCommit {
  /** Full shas, first parent first. Empty for a root commit. */
  parents: string[];
  /** `main`, `origin/main`, `HEAD`… as `%D` reports them, already split. */
  refs: string[];
}

/** Which commits the history view wants, and how far back. */
export interface GitLogRequest {
  /**
   * `branch` walks HEAD *and* the base branch, so the point where they fork
   * is on screen — which is the whole question the view exists to answer.
   * `all` walks every local branch.
   */
  scope: 'branch' | 'all';
  /**
   * How many commits to walk. The graph is drawn from exactly what arrives,
   * so this is also the view's depth: there is no "load more" that would have
   * to re-lane everything above it.
   */
  limit: number;
}

/** A local branch, with both comparisons the UI shows. */
export interface GitBranchInfo {
  name: string;
  current: boolean;
  /** Tracking branch, e.g. `origin/main`, or '' when none is configured. */
  upstream: string;
  /** Against `upstream`, as of the last fetch. Both 0 when there is none. */
  ahead: number;
  behind: number;
  /** Against the base branch. Both 0 when this *is* the base, or there is none. */
  aheadBase: number;
  behindBase: number;
  /** The branch tip, for the subject and the age shown on the row. */
  tip: GitCommit | null;
}

/**
 * Every local branch, and what they are all being compared against.
 *
 * `base` is resolved in main rather than guessed in the renderer: it comes
 * from `origin/HEAD` when the remote says so, and falls back to the first of
 * `main`/`master`/`develop`/`trunk` that exists.
 */
export interface GitBranches {
  /** The base branch's short name, or '' when the repo has none of them. */
  base: string;
  branches: GitBranchInfo[];
}

/**
 * What a commit did to one file.
 *
 * Git's own letters, spelled out — `A`, `M`, `D`, `R`, `C`, `T` — because the
 * letter is an implementation detail of `--name-status` and the renderer
 * should not be the place that remembers what `T` meant.
 */
export type GitFileChange =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type-changed';

export interface GitCommitFile {
  /** Repository-relative, and the path as it is *after* the commit. */
  path: string;
  change: GitFileChange;
  /** Where it came from, on a rename or a copy. Absent otherwise. */
  oldPath?: string;
}

/**
 * What one commit did, beyond what the history row already shows.
 *
 * Read when a commit is opened and never polled: a commit is immutable, so
 * unlike the working tree there is no staleness to chase and nothing to
 * refresh. The subject, author and date are not here because the row that
 * opened this already has them — this is only the part that costs a
 * subprocess.
 */
export interface GitCommitDetail {
  sha: string;
  /** The message below the subject, trimmed. Empty when there is none. */
  body: string;
  files: GitCommitFile[];
  /**
   * A merge, whose files are what it did to its **first parent**.
   *
   * Worth saying on screen rather than silently: `git show` on a merge
   * reports, by default, only the files that differ from *every* parent —
   * which for an ordinary merge is none at all. First-parent is the view that
   * answers "what did merging this bring in", and it is one reading of a
   * merge rather than the whole truth about one.
   */
  merge: boolean;
}

/** Which version of a file's changes to diff. */
export interface GitDiffRequest {
  /** Repository-relative, the way git reports and accepts paths. */
  path: string;
  /** The staged diff (`--cached`) rather than the working tree's. */
  staged: boolean;
  /**
   * Read the patch out of this commit instead of the working tree.
   *
   * Takes precedence over `staged`, which has nothing to say about a commit:
   * the index is where a change is on its way *to* a commit, and once it is
   * in one there is only the commit.
   */
  commit?: string;
  /**
   * Where the file came from, when the commit renamed or copied it.
   *
   * Not decoration — it changes the diff. Rename detection only pairs paths
   * that are both inside the pathspec, so asking for the new path alone makes
   * git report a move as a file written from nothing: every line added, and
   * the one line that actually changed buried in it. Naming both is what
   * turns that back into a rename.
   */
  oldPath?: string;
}

export type GitDiffLineKind = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

export interface GitDiffLine {
  kind: GitDiffLineKind;
  /** The line without its leading `+`/`-`/space — the marker is the `kind`. */
  text: string;
  /** 1-based line in the old file, null on an added line or a header. */
  oldLine: number | null;
  /** 1-based line in the new file, null on a removed line or a header. */
  newLine: number | null;
}

/**
 * A parsed patch for one file.
 *
 * Parsed in main, not in the renderer: the parse is a pure function of
 * git's own output and the renderer would otherwise re-run it on every
 * render of the pane. Only lines cross the boundary, already numbered.
 */
export interface GitDiff {
  path: string;
  staged: boolean;
  /** The commit this patch came out of, when it came out of one. */
  commit?: string;
  /** Git declined to diff it. `lines` is empty. */
  binary: boolean;
  lines: GitDiffLine[];
  added: number;
  removed: number;
}

/** What `git commit` is being asked to record. */
export interface GitCommitRequest {
  message: string;
  /** Rewrites the previous commit instead of adding one. */
  amend: boolean;
}
