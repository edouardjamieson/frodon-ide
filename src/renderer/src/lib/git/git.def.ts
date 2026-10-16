import type {
  GitBranches,
  GitCommitDetail,
  GitDiff,
  GitFileStatus,
  GitLogCommit,
  GitLogRequest,
  GitStatus,
} from '@shared/git.def';

/**
 * Where a patch comes from.
 *
 * The three readings of "this file's changes" the app can ask for, as a type
 * rather than a boolean, because a boolean only had room for two of them. The
 * first two move under the pane and are re-read when a snapshot lands. The
 * third cannot move at all, which is most of what makes it easy: a commit's
 * patch is read once and stays correct.
 */
export type DiffSource =
  { kind: 'worktree' } | { kind: 'index' } | { kind: 'commit'; sha: string };

/** A file, and which version of its changes to show. */
export interface DiffSelection {
  /** Repository-relative, the way git reports and accepts paths. */
  path: string;
  source: DiffSource;
  /**
   * Where a commit moved it from, when it did.
   *
   * Carried rather than looked up because it is needed on both sides: git
   * wants it to see the patch as a rename at all, and the pane says it above
   * the diff — which is what keeps "No changes in this file" from reading as
   * a bug on a file that was purely moved.
   */
  oldPath?: string;
}

/**
 * The operation in flight, if any.
 *
 * Named rather than a boolean so each button can show its own spinner: a
 * single `operating` flag puts one on all three.
 */
export type GitOperation =
  'fetch' | 'pull' | 'push' | 'checkout' | 'branch' | 'stage' | 'commit';

/**
 * One changed file, as the commit view lists it.
 *
 * Derived from the snapshot's four arrays rather than sent as its own payload
 * — the lists are already in the store and splitting a path is cheaper than a
 * second channel. `path` stays repository-relative because that is what every
 * git command takes back; `absolute` is what opening it in an editor needs.
 */
export interface GitChange {
  path: string;
  absolute: string;
  name: string;
  /** The directory part, shown dimmed after the name. '' at the repo root. */
  dir: string;
  status: GitFileStatus;
  /** Which side of the index this row is on. A file can appear on both. */
  staged: boolean;
}

/** A commit and where its dot and lines sit in the history graph. */
export interface GraphRow {
  commit: GitLogCommit;
  /** Column the dot sits in. 0 is leftmost, and is where HEAD's line runs. */
  lane: number;
  /** Lanes drawn straight through the row: branches this commit is not on. */
  through: number[];
  /** Lanes coming down from above and ending at this dot — children, merges. */
  incoming: number[];
  /** Lanes leaving the dot downwards, one per parent. */
  outgoing: number[];
}

export interface Graph {
  rows: GraphRow[];
  /** The widest the graph ever gets, so every row reserves the same gutter. */
  lanes: number;
}

export interface GitStore {
  /** The replica of main's snapshot. Never written from here except by a push. */
  status: GitStatus;
  /**
   * The snapshot's file lists as one absolute path -> status lookup.
   *
   * Derived on arrival rather than where it is read: the explorer asks per
   * row, and scanning four arrays for every file in the tree on every render
   * is the whole tree's worth of linear scans. Rebuilt only when a new
   * snapshot lands — which main only sends when something actually changed —
   * so a row's selector returns a stable `Map` across polls and re-renders
   * nothing.
   */
  statusByPath: Map<string, GitFileStatus>;
  /** Local branches, read when the branch menu opens rather than polled. */
  branches: string[];
  operation: GitOperation | null;
  /** The last failure, as git told it. Shown until dismissed or superseded. */
  error: string | null;

  /**
   * The history, as last read. Not polled: main pushes `git:changed` when the
   * repository moves and the view re-reads, so a history nobody has open
   * costs nothing at all.
   */
  log: GitLogCommit[];
  logLoading: boolean;
  /** Which commits the history is showing. Sticky across tabs and reloads. */
  logScope: GitLogRequest['scope'];
  /** The branch view's rows, and the branch they are all measured against. */
  branchDetails: GitBranches;
  branchesLoading: boolean;
  /**
   * The file whose patch is on screen, and which version of it — or null.
   *
   * One selection for the whole window rather than one per tab, because there
   * is one diff pane at a time: picking a file in the commit tab and then
   * opening a commit in the history replaces it, which is the same thing the
   * person just did on screen.
   */
  selection: DiffSelection | null;
  /** The patch for that selection. Null until one has been read. */
  diff: GitDiff | null;
  diffLoading: boolean;

  /**
   * The commit the history has open, or '' when the graph is alone.
   *
   * A sha and not the commit itself: the row that opened it already holds the
   * subject, the author and the date, and the panel looks the rest up in the
   * log it is drawn from. What it cannot look up is `detail`, which is a
   * subprocess away.
   */
  openCommit: string;
  commitDetail: GitCommitDetail | null;
  commitLoading: boolean;
  /**
   * The commit message being written.
   *
   * In the store rather than in the textarea's own state so that switching to
   * the history tab, or focusing another window, does not throw away a
   * half-written message.
   */
  message: string;

  setStatus: (status: GitStatus) => void;
  setLog: (log: GitLogCommit[]) => void;
  setLogLoading: (loading: boolean) => void;
  setLogScope: (scope: GitLogRequest['scope']) => void;
  setBranchDetails: (details: GitBranches) => void;
  setBranchesLoading: (loading: boolean) => void;
  select: (selection: DiffSelection | null) => void;
  setDiff: (diff: GitDiff | null) => void;
  setDiffLoading: (loading: boolean) => void;
  /** Opens a commit in the history, or closes the panel with ''. */
  openCommitDetail: (sha: string) => void;
  setCommitDetail: (detail: GitCommitDetail | null) => void;
  setCommitLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
  setBranches: (branches: string[]) => void;
  setOperation: (operation: GitOperation | null) => void;
  setError: (error: string | null) => void;
}
