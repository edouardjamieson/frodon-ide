import { useCallback, useEffect, useMemo } from 'react';
import { useProjectStore } from '~/lib/project';
import { useGitStore } from './git.store';
import {
  branchLabel,
  changesOf,
  diffRequestOf,
  sameSelection,
} from './git.service';
import { HISTORY_LIMIT } from './git.constant';
import type { GitFileStatus, GitResult, GitStatus } from '@shared/git.def';
import type { GitOperation } from './git.def';

/**
 * One git operation, with the busy flag and the error around it.
 *
 * At module scope rather than inside `useGit`, because two hooks need it and
 * a second copy would mean two independent "is something running" guards —
 * which is the one thing the guard exists to prevent. Setters are read
 * through `getState` rather than subscribed to: they never change identity,
 * and subscribing would re-render every consumer on every snapshot.
 *
 * Failures come back as a value, not an exception — a rejected push is
 * something to show the user, not something to crash a click handler.
 */
async function runOperation(
  kind: GitOperation,
  invoke: () => Promise<GitResult>
): Promise<GitResult> {
  const store = useGitStore.getState();
  if (store.operation) {
    return { ok: false, error: 'Another git operation is already running.' };
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
    // The channel itself failed, which means main threw before git ever ran.
    // Rare, and worth saying out loud rather than leaving a button spinning
    // forever.
    const message = cause instanceof Error ? cause.message : String(cause);
    store.setError(message);
    return { ok: false, error: message };
  } finally {
    useGitStore.getState().setOperation(null);
  }
}

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

  const fetch = useCallback(
    () => runOperation('fetch', () => window.frodon.git.fetch()),
    []
  );

  const pull = useCallback(
    () => runOperation('pull', () => window.frodon.git.pull()),
    []
  );

  const push = useCallback(
    () => runOperation('push', () => window.frodon.git.push()),
    []
  );

  const checkout = useCallback(
    (branch: string) =>
      runOperation('checkout', () => window.frodon.git.checkout(branch)),
    []
  );

  const createBranch = useCallback(
    (branch: string) =>
      runOperation('branch', () => window.frodon.git.createBranch(branch)),
    []
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

/**
 * The history, read when it can have changed and not otherwise.
 *
 * The dependency is HEAD's sha, not the snapshot: main publishes a new
 * snapshot whenever any file in the working tree changes, and re-walking two
 * hundred commits because someone saved a file would make typing cost a
 * subprocess. A commit, a checkout, a pull or a rebase all move HEAD, which
 * is exactly the set of things that change what this draws.
 *
 * `scope` is in the store rather than in the component so that switching tabs,
 * or closing and reopening the window, comes back to the same view.
 */
export const useGitLog = () => {
  const log = useGitStore((state) => state.log);
  const loading = useGitStore((state) => state.logLoading);
  const scope = useGitStore((state) => state.logScope);
  const setScope = useGitStore((state) => state.setLogScope);

  const inRepo = useGitStore((state) => state.status.inRepo);
  const sha = useGitStore((state) => state.status.head?.sha ?? '');
  const branch = useGitStore((state) => state.status.branch);

  const reload = useCallback(async (): Promise<void> => {
    const store = useGitStore.getState();
    if (!store.status.inRepo) {
      store.setLog([]);
      return;
    }

    store.setLogLoading(true);
    try {
      const commits = await window.frodon.git.log({
        scope: store.logScope,
        limit: HISTORY_LIMIT,
      });
      useGitStore.getState().setLog(commits);
    } catch (cause) {
      console.error('git: reading the log failed', cause);
    } finally {
      useGitStore.getState().setLogLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // `sha` and `branch` are not read in the effect — `reload` takes them from
    // the store — but they are what makes it run again, which is the point.
  }, [reload, scope, inRepo, sha, branch]);

  return { commits: log, loading, scope, setScope, reload };
};

/**
 * The branch view's rows.
 *
 * Re-read on the same signal as the log, plus the ahead/behind pair: a fetch
 * changes nothing about HEAD but is precisely when "3 behind" stopped being
 * true, and it is the one number in this view that comes from the network.
 */
export const useGitBranches = () => {
  const details = useGitStore((state) => state.branchDetails);
  const loading = useGitStore((state) => state.branchesLoading);

  const inRepo = useGitStore((state) => state.status.inRepo);
  const sha = useGitStore((state) => state.status.head?.sha ?? '');
  const branch = useGitStore((state) => state.status.branch);
  const ahead = useGitStore((state) => state.status.ahead);
  const behind = useGitStore((state) => state.status.behind);

  const reload = useCallback(async (): Promise<void> => {
    const store = useGitStore.getState();
    if (!store.status.inRepo) {
      store.setBranchDetails({ base: '', branches: [] });
      return;
    }

    store.setBranchesLoading(true);
    try {
      const next = await window.frodon.git.branchDetails();
      useGitStore.getState().setBranchDetails(next);
    } catch (cause) {
      console.error('git: reading branches failed', cause);
    } finally {
      useGitStore.getState().setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, inRepo, sha, branch, ahead, behind]);

  return { ...details, loading, reload };
};

/**
 * The changed files, as two lists.
 *
 * Memoised on the snapshot, which main only replaces when something actually
 * differs — so the arrays stay identical across polls and the rows below them
 * don't reconcile every three seconds.
 */
export const useGitChanges = () => {
  const status = useGitStore((state) => state.status);

  return useMemo(() => changesOf(status), [status]);
};

/**
 * The selected file's patch.
 *
 * Re-read when the selection changes and, for the working tree and the index,
 * when the snapshot does — staging a file moves its changes from one side of
 * the index to the other, so the patch under it is a different patch. An edit
 * to a file that was *already* modified changes no snapshot, so nothing here
 * notices it; that is what the refresh button on the pane is for.
 *
 * A commit's patch is exempt from all of that. It cannot change, so a poll
 * must not re-read it — which is why the snapshot only reaches the dependency
 * list when the selection is one that can go stale.
 */
export const useGitDiff = () => {
  const diff = useGitStore((state) => state.diff);
  const loading = useGitStore((state) => state.diffLoading);
  const selection = useGitStore((state) => state.selection);
  const status = useGitStore((state) => state.status);

  const reload = useCallback(async (): Promise<void> => {
    const store = useGitStore.getState();
    const target = store.selection;
    if (!target) {
      store.setDiff(null);
      return;
    }

    store.setDiffLoading(true);
    try {
      const next = await window.frodon.git.diff(diffRequestOf(target));
      const after = useGitStore.getState();
      // The selection moved while this was in flight. Storing it now would
      // put one file's patch under another file's name.
      if (!sameSelection(after.selection, target)) return;
      after.setDiff(next);
    } catch (cause) {
      console.error('git: reading the diff failed', cause);
    } finally {
      useGitStore.getState().setDiffLoading(false);
    }
  }, []);

  // Null for a commit, so a tick of the poller does not re-read a patch that
  // is incapable of having changed.
  const volatile = selection?.source.kind === 'commit' ? null : status;

  useEffect(() => {
    void reload();
  }, [reload, selection, volatile]);

  return { diff, loading, selection, reload };
};

/**
 * The commit the history has open: what it did, and the way in and out.
 *
 * The read happens here rather than in the row that was clicked, for the
 * reason every other read in this file is a hook: the panel has to survive
 * the row scrolling out of the graph, and a fetch owned by a component that
 * unmounts is a fetch that has to be redone.
 *
 * Nothing re-reads. The only signal that would justify one is HEAD moving,
 * and a commit whose patch changed under its own sha is not a thing git
 * allows — an amend or a rebase produces a *different* commit, whose sha the
 * history is already re-reading to find.
 */
export const useCommitDetail = () => {
  const sha = useGitStore((state) => state.openCommit);
  const detail = useGitStore((state) => state.commitDetail);
  const loading = useGitStore((state) => state.commitLoading);
  const open = useGitStore((state) => state.openCommitDetail);

  const close = useCallback(() => open(''), [open]);

  useEffect(() => {
    if (!sha) return;

    let cancelled = false;
    useGitStore.getState().setCommitLoading(true);

    void window.frodon.git
      .commitDetail(sha)
      .then((next) => {
        // Another commit was opened while this was in flight, or the panel
        // was closed. Either way this answer is about something nobody is
        // looking at any more.
        if (cancelled || useGitStore.getState().openCommit !== sha) return;
        useGitStore.getState().setCommitDetail(next);
      })
      .catch((cause: unknown) =>
        console.error('git: reading the commit failed', cause)
      )
      .finally(() => {
        if (!cancelled) useGitStore.getState().setCommitLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sha]);

  return { sha, detail, loading, open, close };
};

/**
 * Staging, unstaging and committing.
 *
 * Separate from `useGit` only in what it returns: the operations go through
 * the same `run`, so the one-at-a-time guard and the error line in the header
 * cover these too. A commit clears the message itself — leaving it in the box
 * after it has been recorded is how a message gets committed twice.
 */
export const useGitStaging = () => {
  const message = useGitStore((state) => state.message);
  const setMessage = useGitStore((state) => state.setMessage);
  const { operation } = useGit();

  const stage = useCallback(
    (paths: string[]) =>
      runOperation('stage', () => window.frodon.git.stage(paths)),
    []
  );

  const unstage = useCallback(
    (paths: string[]) =>
      runOperation('stage', () => window.frodon.git.unstage(paths)),
    []
  );

  const commit = useCallback(async (amend = false): Promise<GitResult> => {
    const text = useGitStore.getState().message;
    const result = await runOperation('commit', () =>
      window.frodon.git.commit({ message: text, amend })
    );
    if (result.ok) useGitStore.getState().setMessage('');
    return result;
  }, []);

  return { message, setMessage, stage, unstage, commit, operation };
};
