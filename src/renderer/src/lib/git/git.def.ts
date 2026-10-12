import type { GitFileStatus, GitStatus } from '@shared/git.def';

/**
 * The operation in flight, if any.
 *
 * Named rather than a boolean so each button can show its own spinner: a
 * single `operating` flag puts one on all three.
 */
export type GitOperation = 'fetch' | 'pull' | 'push' | 'checkout' | 'branch';

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

  setStatus: (status: GitStatus) => void;
  setBranches: (branches: string[]) => void;
  setOperation: (operation: GitOperation | null) => void;
  setError: (error: string | null) => void;
}
