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

  // Styling of the component
  expanded: boolean;

  setBranch: (branch: string) => void;
  setAheadBehind: (ahead: number, behind: number) => void;
  setStagedFiles: (files: string[]) => void;
  setUnstagedFiles: (files: string[]) => void;
  setUntrackedFiles: (files: string[]) => void;
  setRepoStatus: (inRepo: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  reset: () => void;
}
