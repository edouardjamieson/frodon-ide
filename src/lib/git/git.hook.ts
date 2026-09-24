import { useEffect, useRef } from 'react';
import { useProjectStore } from '../project';
import Logger from '../logger/logger.service';
import { useGitStore } from './git.store';

export const useGit = () => {
  const store = useGitStore();

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
        store.setStagedFiles(staged);
        store.setUnstagedFiles(unstaged);
        store.setUntrackedFiles(untracked);
      }
    } catch (error) {
      Logger.log(`git: failed to refresh: ${error}`);
    }
  };

  const init = async () => {
    if (useProjectStore.getState().path.length === 0) return;
    if (store.inRepo) return;

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

  return { init, refresh };
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
