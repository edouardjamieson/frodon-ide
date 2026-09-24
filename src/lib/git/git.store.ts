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
  reset() {
    set({
      inRepo: false,
      branch: '',
      ahead: 0,
      behind: 0,
      stagedFiles: [],
      unstagedFiles: [],
      untrackedFiles: [],
    });
  },
}));
