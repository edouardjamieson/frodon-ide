import { create } from 'zustand';
import type { WorktreeStore } from './worktree.def';

export const useWorktreeStore = create<WorktreeStore>((set) => ({
  worktrees: [],
  listing: false,
  creating: null,

  setWorktrees: (worktrees) => set({ worktrees }),
  setListing: (listing) => set({ listing }),
  setCreating: (creating) => set({ creating }),
}));
