/**
 * The renderer's side of worktrees.
 *
 * Thin by design: main owns `git worktree` and the repository owns the list,
 * so there is no local model here to keep in step with anything — the hook
 * asks, stores the answer, and asks again after it changes something. The
 * list is re-read rather than patched for the reason `useBoards` re-reads
 * its own: git is the authority on which branch is checked out where, and a
 * locally-patched copy is one more thing that can disagree with it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorktreeCreateRequest } from '@shared/worktree.def';
import { useProjectStore } from '~/lib/project';
import { useGitStore } from '~/lib/git';
import { useWorktreeStore } from './worktree.store';

/**
 * Every checkout of this repository, and the operations that change the set.
 *
 * **Fetched on mount and after each mutation, never polled.** A worktree made
 * in a terminal shows up the next time the panel is opened. That is the same
 * bargain `useRecentProjects` makes, and the argument is stronger here: the
 * git poller already runs a subprocess every three seconds in every window,
 * and `git worktree list` for a list that changes twice a week is not worth
 * adding to it.
 */
export const useWorktrees = () => {
  const worktrees = useWorktreeStore((state) => state.worktrees);
  const listing = useWorktreeStore((state) => state.listing);
  const creating = useWorktreeStore((state) => state.creating);
  const setWorktrees = useWorktreeStore((state) => state.setWorktrees);
  const setListing = useWorktreeStore((state) => state.setListing);
  const setCreating = useWorktreeStore((state) => state.setCreating);

  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setListing(true);
    try {
      setWorktrees(await window.frodon.worktree.list());
    } catch (cause) {
      console.error('worktree: listing failed', cause);
    } finally {
      setListing(false);
    }
  }, [setWorktrees, setListing]);

  const create = useCallback(
    async (request: WorktreeCreateRequest): Promise<boolean> => {
      setCreating(request.branch);
      setError(null);
      try {
        const result = await window.frodon.worktree.create(request);
        if (!result.ok) {
          // Git's own sentence where there is one. `'x' is already used by
          // worktree at …` names the branch *and* where it is, which is more
          // than any rewording would say.
          setError(result.error ?? 'The worktree could not be created.');
          return false;
        }
        await refresh();
        return true;
      } finally {
        setCreating(null);
      }
    },
    [refresh, setCreating]
  );

  const remove = useCallback(
    async (path: string): Promise<boolean> => {
      const result = await window.frodon.worktree.remove(path);
      if (!result.ok) {
        setError(result.error ?? 'The worktree could not be removed.');
        return false;
      }
      setError(null);
      await refresh();
      return true;
    },
    [refresh]
  );

  return {
    worktrees,
    listing,
    creating,
    error,
    clearError: () => setError(null),
    refresh,
    create,
    remove,
  };
};

/**
 * The worktree the window is currently in, if it is in one.
 *
 * Matched on the project root rather than carried as a flag, because that is
 * the fact: a worktree window is a window whose project happens to be one of
 * the repository's checkouts. Used to mark the row you are looking at, the
 * way the explorer marks the open file.
 */
export const useCurrentWorktree = () => {
  const root = useProjectStore((state) => state.root);
  const worktrees = useWorktreeStore((state) => state.worktrees);

  return useMemo(
    () => worktrees.find((worktree) => worktree.path === root) ?? null,
    [worktrees, root]
  );
};

/**
 * Keeps the list current while the panel is open. Mount it in the panel.
 *
 * The dependency is the repository root rather than the whole snapshot: the
 * list is about which checkouts exist, which does not change when a file is
 * edited, and re-reading it on every poll would undo the whole reason this is
 * not polled. A commit or a checkout in another window does not move it
 * either — the set of worktrees is the same set.
 */
export const useWorktreeSync = (): void => {
  const repoRoot = useGitStore((state) => state.status.repoRoot);
  const setWorktrees = useWorktreeStore((state) => state.setWorktrees);
  const setListing = useWorktreeStore((state) => state.setListing);

  // Written against the setters rather than reusing `useWorktrees`, which
  // would subscribe this hook to the list it is only ever writing — and
  // re-render the panel once more for every answer it stores.
  useEffect(() => {
    let cancelled = false;
    setListing(true);

    void window.frodon.worktree
      .list()
      .then((list) => {
        if (!cancelled) setWorktrees(list);
      })
      .catch((error: unknown) =>
        console.error('worktree: listing failed', error)
      )
      .finally(() => {
        if (!cancelled) setListing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repoRoot, setWorktrees, setListing]);
};
