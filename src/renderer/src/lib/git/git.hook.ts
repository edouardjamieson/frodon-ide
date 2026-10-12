import { useCallback, useEffect } from 'react';
import { useProjectStore } from '~/lib/project';
import { useGitStore } from './git.store';
import { branchLabel } from './git.service';
import type { GitFileStatus, GitResult, GitStatus } from '@shared/git.def';
import type { GitOperation } from './git.def';

/**
 * The git operations, and whichever one is running.
 *
 * Every one of them is a message to main, which owns the repository and runs
 * the subprocess; nothing here knows what `git push` is. What this adds is
 * the part the UI needs and main cannot provide: which button to spin, and
 * what to say when the answer is no.
 *
 * Failures come back as a value, not an exception — a rejected push is
 * something to show the user, not something to crash a click handler — so a
 * caller that only wants the happy path can ignore the result entirely.
 */
export const useGit = () => {
  const operation = useGitStore((state) => state.operation);
  const error = useGitStore((state) => state.error);

  /**
   * One operation, with the busy flag and the error around it.
   *
   * Setters are read through `getState` rather than subscribed to: they never
   * change identity, and subscribing would re-render every consumer of this
   * hook on every snapshot that arrives.
   */
  const run = useCallback(
    async (
      kind: GitOperation,
      invoke: () => Promise<GitResult>
    ): Promise<GitResult> => {
      const store = useGitStore.getState();
      if (store.operation) {
        return {
          ok: false,
          error: 'Another git operation is already running.',
        };
      }

      store.setOperation(kind);
      store.setError(null);

      try {
        const result = await invoke();
        if (!result.ok) {
          store.setError(result.error ?? 'The git command failed.');
        }
        return result;
      } catch (cause) {
        // The channel itself failed, which means main threw before git ever
        // ran. Rare, and worth saying out loud rather than leaving a button
        // spinning forever.
        const message = cause instanceof Error ? cause.message : String(cause);
        store.setError(message);
        return { ok: false, error: message };
      } finally {
        useGitStore.getState().setOperation(null);
      }
    },
    []
  );

  const fetch = useCallback(
    () => run('fetch', () => window.frodon.git.fetch()),
    [run]
  );

  const pull = useCallback(
    () => run('pull', () => window.frodon.git.pull()),
    [run]
  );

  const push = useCallback(
    () => run('push', () => window.frodon.git.push()),
    [run]
  );

  const checkout = useCallback(
    (branch: string) =>
      run('checkout', () => window.frodon.git.checkout(branch)),
    [run]
  );

  const createBranch = useCallback(
    (branch: string) =>
      run('branch', () => window.frodon.git.createBranch(branch)),
    [run]
  );

  /** Reads the branch list. Called when the menu that shows it opens. */
  const refreshBranches = useCallback(async (): Promise<string[]> => {
    try {
      const branches = await window.frodon.git.branches();
      useGitStore.getState().setBranches(branches);
      return branches;
    } catch (cause) {
      console.error('git: listing branches failed', cause);
      return [];
    }
  }, []);

  const dismissError = useCallback(
    () => useGitStore.getState().setError(null),
    []
  );

  return {
    operation,
    error,
    fetch,
    pull,
    push,
    checkout,
    createBranch,
    refreshBranches,
    dismissError,
  };
};

/** The whole snapshot. Prefer one of the narrower hooks below where possible. */
export const useGitStatus = (): GitStatus =>
  useGitStore((state) => state.status);

/** Whether the open project is in a repository at all. Gates the whole UI. */
export const useIsRepo = (): boolean =>
  useGitStore((state) => state.status.inRepo);

/** What the branch button shows: a branch name, or a sha when detached. */
export const useBranchLabel = (): string =>
  useGitStore((state) => branchLabel(state.status));

/**
 * The path -> status lookup, for callers that color many rows.
 *
 * Returned whole rather than per path on purpose: a component drawing a tree
 * subscribes once and reads the `Map` as it renders, instead of mounting one
 * subscription per file.
 */
export const useGitFileStatus = (): Map<string, GitFileStatus> =>
  useGitStore((state) => state.statusByPath);

/** How many files differ from HEAD, counting a file that is in two lists once. */
export const useChangeCount = (): number =>
  useGitStore((state) => state.statusByPath.size);

/**
 * Keeps the replica current: seeds it from main, then listens.
 *
 * There is no interval here. Main polls — one poller for the app, armed when
 * the project opens — and pushes only when a tick found something different,
 * so the renderer's job is to receive. The fetch on `root` is for the other
 * direction: a window that opens, or reloads, mid-session needs the snapshot
 * main already holds rather than waiting out a tick for the next change.
 *
 * Mount this ONCE near the app root.
 */
export const useGitSync = (): void => {
  const setStatus = useGitStore((state) => state.setStatus);
  const root = useProjectStore((state) => state.root);

  useEffect(() => window.frodon.git.onChanged(setStatus), [setStatus]);

  useEffect(() => {
    let cancelled = false;

    void window.frodon.git
      .status()
      .then((status) => {
        if (!cancelled) setStatus(status);
      })
      .catch((error: unknown) => console.error('git: status failed', error));

    return () => {
      cancelled = true;
    };
  }, [root, setStatus]);
};
