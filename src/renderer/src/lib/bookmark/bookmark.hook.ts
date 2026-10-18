/**
 * The renderer's side of bookmarks: listing them once, and the four
 * operations that change the set.
 *
 * The one arrangement worth reading before changing anything: **the listing
 * is not mounted per browser tile.** A workbench can hold several browser
 * windows, each with a toolbar that wants the menu, and an effect in the
 * toolbar would list the files once per tile on every project change.
 * `useBookmarkSyncEffect` is mounted once, at the app shell — the same shape
 * `useBoardAutosaveEffect` has, for the same reason.
 *
 * Mutations write a scope's whole list and then re-read both. Main is the
 * authority on what is on disk, and a locally-patched list is one more thing
 * that can disagree with it. The cost is two round trips per star click,
 * which is two file operations on a file of a few hundred bytes.
 */
import { useCallback, useEffect, useMemo } from 'react';
import {
  sameBookmarkUrl,
  type BookmarkEntry,
  type BookmarkScope,
} from '@shared/bookmark.def';
import { useProjectStore } from '~/lib/project';
import { useBookmarkStore } from './bookmark.store';
import { groupBookmarks, groupNames, toPayload } from './bookmark.service';
import type { BookmarkDraft, BookmarkGroupView } from './bookmark.def';

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

/** The flat list, both scopes, in file order. */
export const useBookmarks = (): BookmarkEntry[] =>
  useBookmarkStore((state) => state.bookmarks);

/** The list as the menu and the start page draw it. */
export const useBookmarkGroups = (): BookmarkGroupView[] => {
  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  return useMemo(() => groupBookmarks(bookmarks), [bookmarks]);
};

/** Every group name in use, for the editor to offer as a chip. */
export const useBookmarkGroupNames = (): string[] => {
  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  return useMemo(() => groupNames(bookmarks), [bookmarks]);
};

/**
 * The bookmark saved for a page, or null.
 *
 * What lights the star. Matched with `sameBookmarkUrl` rather than `===`,
 * because a guest reports `https://example.com/` for a bookmark saved as
 * `https://example.com` and the star would otherwise go out the moment you
 * saved it.
 */
export const useBookmarkFor = (url: string): BookmarkEntry | null => {
  const bookmarks = useBookmarkStore((state) => state.bookmarks);

  return useMemo(
    () => bookmarks.find((entry) => sameBookmarkUrl(entry.url, url)) ?? null,
    [bookmarks, url]
  );
};

/** Whatever the last save had to say. Shown in the editor, not in a toast. */
export const useBookmarkError = (): string | null =>
  useBookmarkStore((state) => state.error);

/* -------------------------------------------------------------------------
 * Writing
 * ---------------------------------------------------------------------- */

/** Re-reads both files. The only thing that ever fills the store. */
async function refresh(): Promise<void> {
  const store = useBookmarkStore.getState();
  store.setLoading(true);
  try {
    store.setBookmarks(await window.frodon.bookmark.list());
  } catch (cause) {
    console.error('bookmark: listing failed', cause);
  } finally {
    useBookmarkStore.getState().setLoading(false);
  }
}

/**
 * Writes the scopes a change touched, then re-reads.
 *
 * Takes the whole *next* list and works out which files it has to write, so
 * a caller never has to think about it. Almost always one scope; two only
 * when a bookmark was moved between them, which is the case this exists to
 * get right — a move that wrote only the destination would leave the
 * bookmark in both files, and a list is merged from both.
 */
async function commit(
  next: BookmarkEntry[],
  scopes: BookmarkScope[]
): Promise<boolean> {
  const store = useBookmarkStore.getState();

  for (const scope of scopes) {
    const result = await window.frodon.bookmark.save(
      scope,
      toPayload(next, scope)
    );

    if (!result.ok) {
      store.setError(result.error ?? 'The bookmark could not be saved.');
      // Re-read anyway. A write that failed halfway through a two-scope move
      // leaves the disk in a state the store has no way to guess at, and the
      // list is cheap enough that asking is better than assuming.
      await refresh();
      return false;
    }
  }

  store.setError(null);
  await refresh();
  return true;
}

/**
 * The operations that change the set.
 *
 * Every one of them is stable across renders: they read the current list out
 * of the store rather than closing over it, so the toolbar's star does not
 * get a new `onSave` every time a page in another tile finishes loading.
 */
export const useBookmarkActions = () => {
  const add = useCallback(async (draft: BookmarkDraft): Promise<boolean> => {
    const entry: BookmarkEntry = {
      // Unique within this machine's files, which is all an id has to be —
      // the same argument `window.service.ts` makes for window ids.
      id: crypto.randomUUID(),
      url: draft.url.trim(),
      title: draft.title.trim(),
      scope: draft.scope,
    };
    if (draft.group.trim()) entry.group = draft.group.trim();

    const next = [...useBookmarkStore.getState().bookmarks, entry];
    return commit(next, [draft.scope]);
  }, []);

  const update = useCallback(
    async (id: string, draft: BookmarkDraft): Promise<boolean> => {
      const current = useBookmarkStore.getState().bookmarks;
      const existing = current.find((entry) => entry.id === id);
      if (!existing) return false;

      const next = current.map((entry) => {
        if (entry.id !== id) return entry;

        const changed: BookmarkEntry = {
          id,
          url: draft.url.trim(),
          title: draft.title.trim(),
          scope: draft.scope,
        };
        if (draft.group.trim()) changed.group = draft.group.trim();
        return changed;
      });

      // A scope change rewrites both files: the entry has to leave one as it
      // arrives in the other, and `toPayload` filters by scope, so writing
      // only the destination would leave a copy behind in the source.
      const scopes =
        existing.scope === draft.scope
          ? [draft.scope]
          : [existing.scope, draft.scope];

      return commit(next, scopes);
    },
    []
  );

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const current = useBookmarkStore.getState().bookmarks;
    const existing = current.find((entry) => entry.id === id);
    if (!existing) return false;

    return commit(
      current.filter((entry) => entry.id !== id),
      [existing.scope]
    );
  }, []);

  /**
   * Renames a group everywhere it appears.
   *
   * A group is a string on a bookmark, so renaming one is rewriting that
   * string — and since both scopes merge into one heading, both files may
   * have to be written. That is the price of having no table of groups, and
   * it is paid here, once.
   */
  const renameGroup = useCallback(
    async (from: string, to: string): Promise<boolean> => {
      const current = useBookmarkStore.getState().bookmarks;
      const name = to.trim();

      const touched = new Set<BookmarkScope>();
      const next = current.map((entry) => {
        if (entry.group !== from) return entry;
        touched.add(entry.scope);

        if (!name) {
          const { group: _dropped, ...loose } = entry;
          return loose;
        }
        return { ...entry, group: name };
      });

      if (touched.size === 0) return true;
      return commit(next, [...touched]);
    },
    []
  );

  return { add, update, remove, renameGroup };
};

/* -------------------------------------------------------------------------
 * The sync
 * ---------------------------------------------------------------------- */

/**
 * Reads both files on mount, and the project one again whenever the tree
 * moves. Mounted once, at the app shell.
 *
 * The tree is the signal for the same reason it is for boards: a
 * `.frodon/bookmarks.json` that arrived over a `git pull` or was edited by
 * hand is a change to the project tree, and main is already broadcasting
 * those. The local file is outside the project and so is only re-read on a
 * mutation or a reload, which is the right trade for not watching a home
 * directory.
 */
export const useBookmarkSyncEffect = (): void => {
  const files = useProjectStore((state) => state.files);

  useEffect(() => {
    void refresh();
  }, [files]);
};
