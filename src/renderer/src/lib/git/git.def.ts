import type {
  GitBranches,
  GitDiff,
  GitFileStatus,
  GitLogCommit,
  GitLogRequest,
  GitStatus,
} from '@shared/git.def';

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
  /** The file the commit view has selected, repository-relative, or ''. */
  selected: string;
  /** Whether the selection means its staged side. */
  selectedStaged: boolean;
  /** The patch for that selection. Null until one has been read. */
  diff: GitDiff | null;
  diffLoading: boolean;
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
  select: (path: string, staged: boolean) => void;
  setDiff: (diff: GitDiff | null) => void;
  setDiffLoading: (loading: boolean) => void;
  setMessage: (message: string) => void;
  setBranches: (branches: string[]) => void;
  setOperation: (operation: GitOperation | null) => void;
  setError: (error: string | null) => void;
}
