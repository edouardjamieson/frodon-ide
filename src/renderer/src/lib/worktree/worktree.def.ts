import type { Worktree } from '@shared/worktree.def';

export interface WorktreeStore {
  /** Every checkout of the open repository, the repository's own first. */
  worktrees: Worktree[];
  /**
   * A list request is in flight.
   *
   * Held so the panel's empty state does not flash between mounting and the
   * first answer — the same reason `BoardStore` carries one.
   */
  listing: boolean;
  /**
   * The branch a worktree is being created for, or null.
   *
   * A string rather than a boolean because the panel says which one it is
   * working on: creating a worktree can take a while — the second half is
   * copying a `node_modules` — and a spinner that does not name the branch is
   * a spinner you cannot tell apart from a hung app.
   */
  creating: string | null;

  setWorktrees: (worktrees: Worktree[]) => void;
  setListing: (listing: boolean) => void;
  setCreating: (branch: string | null) => void;
}
