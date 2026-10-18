import { create } from 'zustand';
import type { BookmarkStore } from './bookmark.def';

/**
 * Every bookmark, both scopes, exactly as main handed them over.
 *
 * Deliberately the thinnest store in the app: a list, two flags, and three
 * setters. There is no `addBookmark` action here, and that is the design —
 * every mutation is a write to a file followed by a re-read, so an action
 * that changed this list without going through main would be a second
 * authority on what is on disk. The hooks are where that round trip lives.
 *
 * It is a store rather than component state because three surfaces read it —
 * the star in the toolbar, the menu beside it, and the start page under both
 * — and they are in different subtrees of different windows. The list is also
 * shared by every browser tile in the workbench, which is what keeps the
 * listing to one call instead of one per tile.
 */
export const useBookmarkStore = create<BookmarkStore>((set) => ({
  bookmarks: [],
  loading: false,
  error: null,

  setBookmarks: (bookmarks) => set({ bookmarks }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
