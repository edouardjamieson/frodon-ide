import { create } from 'zustand';
import type { SidebarStore } from './sidebar.def';

export const useSidebarStore = create<SidebarStore>((set, get) => ({
  expanded: true,
  setExpanded: (expanded) => set({ expanded }),

  showIcons: true,
  setShowIcons: (showIcons) => set({ showIcons }),

  showToolbar: true,
  setShowToolbar: (showToolbar) => set({ showToolbar }),
}));
