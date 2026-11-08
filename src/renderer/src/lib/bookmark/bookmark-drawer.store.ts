import { create } from 'zustand';
import type { BookmarkDrawerStore } from './bookmark.def';

/**
 * Which tab has the bookmarks drawer out, and which groups are folded.
 *
 * A store rather than component state because the button that opens the
 * drawer is in the toolbar and the drawer is in the stage under it — siblings
 * in the browser's tree, with the guest's frame between them. Not persisted:
 * folding a group is a glance-level decision, and one that came back after a
 * restart would be a group you forgot was there.
 */
export const useBookmarkDrawerStore = create<BookmarkDrawerStore>((set) => ({
  openTabId: null,
  collapsed: {},

  setOpenTabId: (openTabId) => set({ openTabId }),
  toggleGroup: (name) =>
    set((state) => {
      const collapsed = { ...state.collapsed };
      if (collapsed[name]) delete collapsed[name];
      else collapsed[name] = true;
      return { collapsed };
    }),
}));
