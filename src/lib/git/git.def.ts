/** Result of a git operation (pull/push/checkout/…). */
export interface GitOpResult {
  ok: boolean;
  /** Combined stderr/stdout to surface in the error dialog when `ok` is false. */
  error?: string;
}

/** How a file differs from HEAD, as the explorer and status bar color it. */
export type GitFileStatus = 'staged' | 'changed';

export interface GitStore {
  inRepo: boolean;
  branch: string;
  /** Commits on HEAD not yet pushed to its upstream (0 when no upstream). */
  ahead: number;
  /** Commits on the upstream not yet in HEAD (0 when no upstream). */
  behind: number;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  /**
   * The three lists above as one project-relative path -> status lookup.
   *
   * Derived rather than computed where it's read: the explorer asks per row,
   * and scanning three arrays for every file in the tree on every render is
   * the whole tree's worth of linear scans. Rebuilt only when `setStatus`
   * finds the lists actually changed, so a row's selector returns a stable
   * value across polls.
   */
  statusByPath: Map<string, GitFileStatus>;
  /** Local branch names, refreshed when the branch dialog opens. */
  branches: string[];
  /** True while a pull/push/checkout is in flight, to disable duplicate runs. */
  operating: boolean;

  // Styling of the component
  expanded: boolean;

  setBranch: (branch: string) => void;
  setAheadBehind: (ahead: number, behind: number) => void;
  /** The three lists from one `git status` run, set together. */
  setStatus: (
    staged: string[],
    unstaged: string[],
    untracked: string[]
  ) => void;
  setBranches: (branches: string[]) => void;
  setOperating: (operating: boolean) => void;
  setRepoStatus: (inRepo: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  reset: () => void;
}
