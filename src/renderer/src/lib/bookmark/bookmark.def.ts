/**
 * The renderer's view of bookmarks.
 *
 * A flat list, kept exactly as main handed it over, plus the pure functions
 * that turn it into the two shapes the UI draws — a menu of groups and a grid
 * of groups. The grouping is derived on every read rather than stored,
 * because a group is a string on a bookmark and nothing else; see
 * `Bookmark.group` in `shared/bookmark.def.ts` for why there is no table of
 * groups to keep in step.
 *
 * Main is the authority. Every mutation writes a scope's whole list and then
 * re-reads both — the list is a handful of urls, and a locally-patched copy
 * is one more thing that can disagree with the disk.
 */
import type {
  Bookmark,
  BookmarkEntry,
  BookmarkScope,
} from '@shared/bookmark.def';

/**
 * A group as a surface draws it: a heading and the bookmarks under it.
 *
 * `name` is null for the loose ones, which are drawn with no heading at all
 * rather than under an invented "Other". A heading that the person did not
 * write is a heading they will try to rename.
 */
export interface BookmarkGroupView {
  name: string | null;
  bookmarks: BookmarkEntry[];
}

/**
 * What the editor hands back when a bookmark is saved.
 *
 * Not a `Bookmark`: the id is the store's business — kept on an edit, minted
 * on an add — and the scope is a field on the form but not on the file. See
 * `BookmarkEntry`.
 */
export interface BookmarkDraft {
  url: string;
  title: string;
  /** Empty means ungrouped, which is stored as an absent `group`. */
  group: string;
  scope: BookmarkScope;
}

export interface BookmarkStore {
  /** Both scopes, in the order their files list them. */
  bookmarks: BookmarkEntry[];
  /** True while a list is in flight. Only the first one is worth showing. */
  loading: boolean;
  /** Set when a save failed, so the editor can say so instead of closing. */
  error: string | null;

  setBookmarks: (bookmarks: BookmarkEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/** What a scope's file needs: the entries, with the scope tag taken back off. */
export type BookmarkPayload = Record<BookmarkScope, Bookmark[]>;
