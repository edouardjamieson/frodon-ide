import { create } from 'zustand';
import {
  emptyGitStatus,
  type GitFileStatus,
  type GitStatus,
} from '@shared/git.def';
import type { GitStore } from './git.def';

/**
 * The snapshot's four lists, flattened into one lookup keyed by absolute path.
 *
 * Absolute, because that is what the explorer holds: git reports paths
 * relative to the *repository*, which is not necessarily the project root.
 * Joining here means a row looks itself up with the path it already has.
 *
 * Precedence is the write order. A file can appear in two lists at once — a
 * staged change with further edits on top — and the later write wins, so the
 * row is colored by the state that needs attention most.
 */
function buildStatusByPath(status: GitStatus): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  if (!status.inRepo || !status.repoRoot) return map;

  const absolute = (path: string) => `${status.repoRoot}/${path}`;

  for (const path of status.untracked) map.set(absolute(path), 'untracked');
  for (const path of status.unstaged) map.set(absolute(path), 'changed');
  for (const path of status.staged) map.set(absolute(path), 'staged');
  for (const path of status.conflicted) map.set(absolute(path), 'conflicted');

  return map;
}

export const useGitStore = create<GitStore>((set) => ({
  status: emptyGitStatus(),
  statusByPath: new Map(),
  branches: [],
  operation: null,
  error: null,

  // Main compares before it pushes, so anything arriving here is a real
  // change and is stored without comparison — the same arrangement the
  // project tree has.
  setStatus: (status) =>
    set({ status, statusByPath: buildStatusByPath(status) }),

  setBranches: (branches) => set({ branches }),
  setOperation: (operation) => set({ operation }),
  setError: (error) => set({ error }),
}));
