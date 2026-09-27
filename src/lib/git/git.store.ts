import { create } from 'zustand';
import type { GitStore } from './git.def';

export const useGitStore = create<GitStore>((set, get) => ({
  inRepo: false,
  branch: '',
  ahead: 0,
  behind: 0,
  stagedFiles: [],
  unstagedFiles: [],
  untrackedFiles: [],
  expanded: true,

  setBranch(branch) {
    set({ branch });
  },
  setAheadBehind(ahead, behind) {
    set({ ahead, behind });
  },
  setStagedFiles(files) {
    set({ stagedFiles: files });
  },
  setUnstagedFiles(files) {
    set({ unstagedFiles: files });
  },
  setUntrackedFiles(files) {
    set({ untrackedFiles: files });
  },
  setRepoStatus(inRepo) {
    set({ inRepo });
  },
  setExpanded(expanded) {
    set({ expanded });
  },
  reset() {
    set({
      inRepo: false,
      branch: '',
      ahead: 0,
      behind: 0,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
      // We don't include "expanded" in the reset because it's part of the UI,
      // not the state of the git repository.
    });
  },
}));
