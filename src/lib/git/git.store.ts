import { create } from 'zustand';
import type { GitFileStatus, GitStore } from './git.def';

/**
 * Whether two lists hold the same strings in the same order.
 *
 * Every setter below compares before it writes, because `git` is polled on an
 * interval: `refresh` re-splits `git status` output into brand-new arrays
 * every few seconds whether or not the repo moved. Zustand's `set` always
 * produces a new state object, so writing an identical value still notifies
 * every subscriber -- and a subscriber without a selector (the root component
 * is one) re-renders the whole tree. Bailing here is what keeps an idle repo
 * from costing a full reconcile on every tick.
 */
function sameList(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Path -> status lookup for the explorer. Staged is written last so a file
 * that is both staged and dirty reads as staged, matching the status bar.
 */
function buildStatusByPath(
  staged: string[],
  unstaged: string[],
  untracked: string[]
): Map<string, GitFileStatus> {
  const map = new Map<string, GitFileStatus>();
  for (const file of untracked) map.set(file, 'changed');
  for (const file of unstaged) map.set(file, 'changed');
  for (const file of staged) map.set(file, 'staged');
  return map;
}

export const useGitStore = create<GitStore>((set, get) => ({
  inRepo: false,
  branch: '',
  ahead: 0,
  behind: 0,
  stagedFiles: [],
  unstagedFiles: [],
  untrackedFiles: [],
  statusByPath: new Map(),
  branches: [],
  operating: false,
  expanded: true,

  setBranch(branch) {
    if (get().branch === branch) return;
    set({ branch });
  },
  setAheadBehind(ahead, behind) {
    const state = get();
    if (state.ahead === ahead && state.behind === behind) return;
    set({ ahead, behind });
  },
  // The three lists land together because they're parsed from one `git status`
  // run: setting them separately meant three notifications per poll where the
  // repo had only one state.
  setStatus(staged, unstaged, untracked) {
    const state = get();
    if (
      sameList(state.stagedFiles, staged) &&
      sameList(state.unstagedFiles, unstaged) &&
      sameList(state.untrackedFiles, untracked)
    ) {
      return;
    }
    set({
      stagedFiles: staged,
      unstagedFiles: unstaged,
      untrackedFiles: untracked,
      statusByPath: buildStatusByPath(staged, unstaged, untracked),
    });
  },
  setBranches(branches) {
    if (sameList(get().branches, branches)) return;
    set({ branches });
  },
  setOperating(operating) {
    if (get().operating === operating) return;
    set({ operating });
  },
  setRepoStatus(inRepo) {
    if (get().inRepo === inRepo) return;
    set({ inRepo });
  },
  setExpanded(expanded) {
    if (get().expanded === expanded) return;
    set({ expanded });
  },
  reset() {
    const state = get();
    // Polling a directory that isn't a repo calls this on every tick, so an
    // already-reset store must not notify.
    if (
      !state.inRepo &&
      state.branch === '' &&
      state.ahead === 0 &&
      state.behind === 0 &&
      state.stagedFiles.length === 0 &&
      state.unstagedFiles.length === 0 &&
      state.untrackedFiles.length === 0 &&
      state.statusByPath.size === 0 &&
      state.branches.length === 0 &&
      !state.operating
    ) {
      return;
    }
    set({
      inRepo: false,
      branch: '',
      ahead: 0,
      behind: 0,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
      statusByPath: new Map(),
      branches: [],
      operating: false,
      // We don't include "expanded" in the reset because it's part of the UI,
      // not the state of the git repository.
    });
  },
}));
