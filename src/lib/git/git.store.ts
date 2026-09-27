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
  branches: [],
  operating: false,
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
  setBranches(branches) {
    set({ branches });
  },
  setOperating(operating) {
    set({ operating });
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
      branches: [],
      operating: false,
      // We don't include "expanded" in the reset because it's part of the UI,
      // not the state of the git repository.
    });
  },
}));
