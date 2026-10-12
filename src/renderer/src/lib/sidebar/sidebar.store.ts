import { create } from 'zustand';
import type { SidebarStore } from './sidebar.def';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from './sidebar.constant';

/**
 * Presentation state, so it stays in the renderer and never crosses the IPC
 * boundary. It does not survive a restart either — there is nowhere to put it
 * until the config layer lands (see `docs/migration.md`).
 */
export const useSidebarStore = create<SidebarStore>((set) => ({
  width: DEFAULT_SIDEBAR_WIDTH,
  collapsed: false,

  // Clamped here rather than at the drag, so every caller gets the bounds and
  // the drag handler stays a subtraction.
  setWidth: (width) =>
    set({
      width: Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width)),
    }),

  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
}));
