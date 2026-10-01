/** Result of a git operation (pull/push/checkout/…). */
export interface GitOpResult {
  ok: boolean;
  /** Combined stderr/stdout to surface in the error dialog when `ok` is false. */
  error?: string;
}

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
