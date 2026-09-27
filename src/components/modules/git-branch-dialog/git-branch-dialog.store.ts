import { create } from 'zustand';
import type { GitBranchDialogStore } from './git-branch-dialog.def';

export const useGitBranchDialogStore = create<GitBranchDialogStore>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  },
}));
