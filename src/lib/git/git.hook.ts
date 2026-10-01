import { useEffect, useRef } from 'react';
import { useProjectStore } from '../project';
import Logger from '../logger/logger.service';
import { useGitStore } from './git.store';
import { useDialog } from '~/components/ui/dialog';
import type { GitOpResult } from './git.def';

export const useGit = () => {
  // Actions only, read through `getState` rather than subscribed to. They
  // never change identity, and `useGit` is called by the 3-second poller that
  // `App` mounts -- a whole-store subscription there re-rendered the entire
  // tree on every tick. Components that *display* git state subscribe to the
  // slice they draw instead.
  const store = useGitStore.getState();
  const { openDialog } = useDialog();

  const run = async (args: string[]) => {
    // Read `path` lazily so callers (e.g. polling) never close over a stale
    // value from before the project finished loading.
    const cwd = useProjectStore.getState().path;
    const proc = Bun.spawn(['git', ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    return { exitCode, stdout, stderr };
  };

  const refresh = async () => {
    if (useProjectStore.getState().path.length === 0) return;

    try {
      const repo = await run(['rev-parse', '--is-inside-work-tree']);
      const inRepo = repo.exitCode === 0 && repo.stdout.trim() === 'true';
      if (!inRepo) {
        store.reset();
        return;
      }
      store.setRepoStatus(true);

      const [branch, status, aheadBehind] = await Promise.all([
        run(['branch', '--show-current']),
        // `--untracked-files=all` lists every file in untracked directories;
        // the default collapses them to a single dir entry (e.g. `?? src/`).
        run(['status', '--porcelain', '--untracked-files=all']),
        // Unpushed / unpulled commits as `behind<TAB>ahead`. Non-zero exit
        // means no upstream is configured, so we report 0/0 instead of erroring.
        run(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']),
      ]);

      if (branch.exitCode === 0) store.setBranch(branch.stdout.trim());

      if (aheadBehind.exitCode === 0) {
        const [behind, ahead] = aheadBehind.stdout.trim().split(/\s+/).map(Number);
        store.setAheadBehind(ahead || 0, behind || 0);
      } else {
        store.setAheadBehind(0, 0);
      }

      if (status.exitCode === 0) {
        const staged: string[] = [];
        const unstaged: string[] = [];
        const untracked: string[] = [];
        // Porcelain v1: `XY path`, X = index (staged), Y = work tree.
        // `??` marks an untracked file.
        for (const line of status.stdout.split('\n')) {
          if (line.length === 0) continue;
          const file = line.slice(3);
          if (line.startsWith('??')) {
            untracked.push(file);
            continue;
          }
          const index = line[0];
          const worktree = line[1];
          if (index !== ' ') staged.push(file);
          if (worktree !== ' ') unstaged.push(file);
        }
        store.setStatus(staged, unstaged, untracked);
      }
    } catch (error) {
      Logger.log(`git: failed to refresh: ${error}`);
    }
  };

  const init = async () => {
    if (useProjectStore.getState().path.length === 0) return;
    if (useGitStore.getState().inRepo) return;

    try {
      const { exitCode, stderr } = await run(['init']);
      if (exitCode !== 0) {
        Logger.log(`git: init failed (${exitCode}): ${stderr.trim()}`);
        return;
      }

      await refresh();
    } catch (error) {
      Logger.log(`git: failed to run init: ${error}`);
    }
  };

  /**
   * Runs a git operation that mutates the repo (pull/push/checkout/…). Guards
   * against overlapping runs via the `operating` flag, refreshes state on
   * success, and surfaces failures through the shared error dialog so every
   * feature reports errors the same way.
   */
  const runOp = async (
    args: string[],
    { errorTitle }: { errorTitle: string }
  ): Promise<GitOpResult> => {
    if (useProjectStore.getState().path.length === 0) {
      return { ok: false, error: 'No project is open.' };
    }
    if (useGitStore.getState().operating) {
      return { ok: false, error: 'Another git operation is already running.' };
    }

    store.setOperating(true);
    try {
      const { exitCode, stdout, stderr } = await run(args);
      if (exitCode !== 0) {
        const message =
          stderr.trim() || stdout.trim() || `git exited with code ${exitCode}`;
        Logger.log(`git: ${args.join(' ')} failed: ${message}`);
        openDialog({
          title: errorTitle,
          description: message,
          disableCancel: true,
          submitText: 'Close',
        });
        return { ok: false, error: message };
      }
      return { ok: true };
    } catch (error) {
      const message = `${error}`;
      Logger.log(`git: ${args.join(' ')} threw: ${message}`);
      openDialog({
        title: errorTitle,
        description: message,
        disableCancel: true,
        submitText: 'Close',
      });
      return { ok: false, error: message };
    } finally {
      store.setOperating(false);
      await refresh();
    }
  };

  const pull = () => runOp(['pull'], { errorTitle: 'Failed to pull' });

  const push = () => runOp(['push'], { errorTitle: 'Failed to push' });

  const checkout = (branch: string) =>
    runOp(['checkout', branch], { errorTitle: 'Failed to switch branch' });

  const createBranch = (branch: string) =>
    runOp(['checkout', '-b', branch], {
      errorTitle: 'Failed to create branch',
    });

  /** Lists local branch names, current branch first. */
  const fetchBranches = async (): Promise<string[]> => {
    if (useProjectStore.getState().path.length === 0) return [];

    try {
      const { exitCode, stdout } = await run([
        'branch',
        '--format=%(refname:short)',
      ]);
      if (exitCode !== 0) return [];

      const branches = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const current = useGitStore.getState().branch;
      branches.sort((a, b) => {
        if (a === current) return -1;
        if (b === current) return 1;
        return a.localeCompare(b);
      });

      store.setBranches(branches);
      return branches;
    } catch (error) {
      Logger.log(`git: failed to list branches: ${error}`);
      return [];
    }
  };

  return { init, refresh, pull, push, checkout, createBranch, fetchBranches };
};

/**
 * Polls git state on an interval so the TUI reflects changes made outside it
 * (e.g. switching branches in a terminal). Mount this ONCE near the app root —
 * mounting it per-component would spawn one interval and one set of `git`
 * subprocesses per consumer.
 */
export const useGitSync = (intervalMs = 3000) => {
  const { refresh } = useGit();
  const running = useRef(false);

  useEffect(() => {
    const tick = async () => {
      // Skip if the previous tick is still in flight so slow refreshes don't
      // stack up overlapping `git` processes.
      if (running.current) return;
      running.current = true;
      try {
        await refresh();
      } finally {
        running.current = false;
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
    // `refresh` only touches stable store setters + lazily-read state, so it's
    // safe to pin the effect to the interval and avoid tearing it down each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
};
